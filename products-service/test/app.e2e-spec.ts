import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { Product } from '../src/products/entities/product.entity';
import { ProductsModule } from '../src/products/products.module';
import { AuthModule } from '../src/auth/auth.module';
import { HealthModule } from '../src/health/health.module';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

type ProductResponse = {
  id: string;
  name: string;
  description: string;
  price: number | string;
  stock: number;
  sellerId: string;
  isActive: boolean;
};

type ProductsResponse = ProductResponse[];
type HealthResponse = { status: string };

describe('Products Service (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let sellerToken: string;
  let buyerToken: string;
  let createdProductId: string;
  let sellerId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    sellerId = '123e4567-e89b-12d3-a456-426614174001';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [Product],
          synchronize: true,
        }),
        ProductsModule,
        AuthModule,
        HealthModule,
      ],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = app.get(JwtService);
    sellerToken = jwtService.sign({
      sub: sellerId,
      email: 'seller@test.com',
      role: 'seller',
    });
    buyerToken = jwtService.sign({
      sub: '123e4567-e89b-12d3-a456-426614174002',
      email: 'buyer@test.com',
      role: 'buyer',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /', () => {
    it('should return Hello World!', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
    });
  });

  describe('GET /products', () => {
    it('should return empty array (200)', async () => {
      const res = await request(app.getHttpServer()).get('/products');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /products', () => {
    it('should create product with seller token (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: 'Test Product',
          description: 'Test description',
          price: 99.99,
          stock: 10,
        });

      const product = res.body as ProductResponse;
      expect(res.status).toBe(201);
      expect(product.id).toBeDefined();
      expect(product.name).toBe('Test Product');
      expect(product.description).toBe('Test description');
      expect(Number(product.price)).toBe(99.99);
      expect(product.stock).toBe(10);
      expect(product.sellerId).toBe(sellerId);
      expect(product.isActive).toBe(true);

      createdProductId = product.id;
    });

    it('should return 403 with buyer token', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          name: 'Test Product',
          description: 'Test description',
          price: 99.99,
          stock: 10,
        });

      expect(res.status).toBe(403);
    });

    it('should return 401 without token', async () => {
      const res = await request(app.getHttpServer()).post('/products').send({
        name: 'Test Product',
        description: 'Test description',
        price: 99.99,
        stock: 10,
      });

      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid data', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          name: '',
          description: '',
          price: -1,
          stock: -1,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /products/:id', () => {
    it('should return product (200)', async () => {
      const res = await request(app.getHttpServer()).get(
        `/products/${createdProductId}`,
      );

      expect(res.status).toBe(200);
      const product = res.body as ProductResponse;
      expect(product.id).toBe(createdProductId);
      expect(product.name).toBe('Test Product');
    });

    it('should return 404 for missing product', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app.getHttpServer()).get(
        `/products/${fakeUuid}`,
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /products/seller/:sellerId', () => {
    it('should return products by seller (200)', async () => {
      const res = await request(app.getHttpServer()).get(
        `/products/seller/${sellerId}`,
      );

      expect(res.status).toBe(200);
      const products = res.body as ProductsResponse;
      expect(Array.isArray(products)).toBe(true);
      expect(products.length).toBe(1);
      expect(products[0].sellerId).toBe(sellerId);
    });
  });

  describe('GET /health', () => {
    it('should return ok (200)', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      const health = res.body as HealthResponse;
      expect(health.status).toBe('ok');
    });
  });
});
