import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Order } from './entities/order.entity';
import { CartController } from '../src/cart/cart.controller';
import { CartService } from '../src/cart/cart.service';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { ProductsClientService } from '../src/products-client/products-client.service';
import { PaymentQueueService } from '../src/events/payment-queue/payment-queue.service';
import { MetricsService } from '../src/metrics/metrics.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

const mockProduct = {
  id: PRODUCT_ID,
  name: 'Test Product',
  price: 99.99,
  isActive: true,
};

const mockProductsClient = {
  getProduct: jest.fn().mockResolvedValue(mockProduct),
};

const mockPaymentQueue = {
  publishPaymentOrder: jest.fn().mockResolvedValue(undefined),
};

const mockMetrics = {
  ordersCreatedTotal: { inc: jest.fn() },
  rabbitmqMessagesPublishedTotal: { inc: jest.fn() },
};

describe('Checkout Service (e2e)', () => {
  let app: INestApplication | undefined;
  let jwtService: JwtService;
  let authToken: string;
  const userId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET: 'test-secret',
              PRODUCTS_SERVICE_URL: 'http://localhost:3000',
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Cart, CartItem, Order],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Cart, CartItem, Order]),
        PassportModule,
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [CartController, OrdersController],
      providers: [
        CartService,
        OrdersService,
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: ProductsClientService, useValue: mockProductsClient },
        { provide: PaymentQueueService, useValue: mockPaymentQueue },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    authToken = jwtService.sign({
      sub: userId,
      email: 'test@test.com',
      role: 'buyer',
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /cart/items', () => {
    it('returns 401 without token', () => {
      return request(app!.getHttpServer())
        .post('/cart/items')
        .send({ productId: PRODUCT_ID, quantity: 1 })
        .expect(401);
    });

    it('adds item to cart and returns cart with items', () => {
      return request(app!.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: PRODUCT_ID, quantity: 1 })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('items');
          expect(Array.isArray(res.body.items)).toBe(true);
          expect(res.body.items.length).toBeGreaterThanOrEqual(1);
          expect(res.body).toHaveProperty('total');
        });
    });
  });

  describe('GET /cart', () => {
    it('returns empty cart initially', async () => {
      const token = jwtService.sign({
        sub: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        email: 'other@test.com',
        role: 'buyer',
      });
      const res = await request(app!.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(res.body).toEqual({ items: [], total: 0 });
    });

    it('returns cart after adding items', () => {
      return request(app!.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('items');
          expect(res.body.items.length).toBeGreaterThanOrEqual(1);
          expect(res.body).toHaveProperty('total');
          expect(res.body.total).toBeGreaterThan(0);
        });
    });
  });

  describe('DELETE /cart/items/:itemId', () => {
    it('removes item from cart', async () => {
      const cartRes = await request(app!.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const itemId = cartRes.body.items?.[0]?.id;
      if (!itemId) {
        throw new Error('No items in cart to remove');
      }

      await request(app!.getHttpServer())
        .delete(`/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const cartAfterRemoval = await request(app!.getHttpServer())
        .get('/cart')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(cartAfterRemoval.body.items.length).toBe(0);
      expect(cartAfterRemoval.body.total).toBe(0);
    });
  });

  describe('POST /cart/checkout', () => {
    it('returns 400 for empty cart', async () => {
      const token = jwtService.sign({
        sub: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        email: 'empty@test.com',
        role: 'buyer',
      });

      return request(app!.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${token}`)
        .send({ paymentMethod: 'credit_card' })
        .expect(400);
    });

    it('creates order and returns order object', async () => {
      await request(app!.getHttpServer())
        .post('/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: PRODUCT_ID, quantity: 1 })
        .expect(201);

      const res = await request(app!.getHttpServer())
        .post('/cart/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ paymentMethod: 'credit_card' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('userId', userId);
      expect(res.body).toHaveProperty('cartId');
      expect(res.body).toHaveProperty('amount');
      expect(res.body).toHaveProperty('status', 'pending');
      expect(res.body).toHaveProperty('paymentMethod', 'credit_card');
      expect(res.body).toHaveProperty('createdAt');
    });
  });

  describe('GET /orders', () => {
    it('returns orders after checkout', () => {
      return request(app!.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThanOrEqual(1);
          expect(res.body[0]).toHaveProperty('id');
          expect(res.body[0]).toHaveProperty('userId', userId);
          expect(res.body[0]).toHaveProperty('amount');
          expect(res.body[0]).toHaveProperty('status');
        });
    });
  });

  describe('GET /orders/:id', () => {
    it('returns order by id', async () => {
      const ordersRes = await request(app!.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const orderId = ordersRes.body[0]?.id;
      if (!orderId) {
        throw new Error('No orders found');
      }

      return request(app!.getHttpServer())
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', orderId);
          expect(res.body).toHaveProperty('userId', userId);
        });
    });

    it('returns 404 for non-existent order', () => {
      return request(app!.getHttpServer())
        .get('/orders/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});
