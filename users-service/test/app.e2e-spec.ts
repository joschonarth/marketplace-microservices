import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { User } from './entities/user.entity';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { UserRole } from '../src/users/enums/user-role.enum';

type HttpServerApp = Parameters<typeof request>[0];

type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
};

type UserResponse = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

describe('Users Service (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let registeredUserId: string;

  const httpServer = (): HttpServerApp => app.getHttpServer() as HttpServerApp;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'test-secret' })],
        }),
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: [User],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User]),
        PassportModule,
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '24h' },
        }),
      ],
      controllers: [AuthController, UsersController],
      providers: [
        AuthService,
        UsersService,
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
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

    await request(httpServer()).post('/auth/register').send({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      role: UserRole.SELLER,
    });

    const loginRes = await request(httpServer())
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    const loginBody = loginRes.body as LoginResponse;
    authToken = loginBody.token;
    registeredUserId = loginBody.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully (201)', async () => {
      const res = await request(httpServer()).post('/auth/register').send({
        email: 'newuser@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        role: UserRole.BUYER,
      });

      const body = res.body as UserResponse;

      expect(res.status).toBe(201);
      expect(body).toHaveProperty('id');
      expect(body.email).toBe('newuser@example.com');
      expect(body.firstName).toBe('New');
      expect(body.role).toBe(UserRole.BUYER);
    });

    it('should return 409 for duplicate email', async () => {
      const res = await request(httpServer()).post('/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Dup',
        lastName: 'User',
        role: UserRole.BUYER,
      });

      expect(res.status).toBe(409);
    });

    it('should return 400 for invalid data', async () => {
      const res = await request(httpServer()).post('/auth/register').send({
        email: 'invalid-email',
        password: 'short',
        firstName: '',
        lastName: '',
        role: 'invalid-role',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login successfully and return token (200)', async () => {
      const res = await request(httpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      const body = res.body as LoginResponse;

      expect(res.status).toBe(200);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('user');
      expect(body.user.email).toBe('test@example.com');
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(httpServer())
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('should return 401 for non-existent email', async () => {
      const res = await request(httpServer())
        .post('/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/validate-token', () => {
    it('should return user info with valid token', async () => {
      const res = await request(httpServer())
        .get('/auth/validate-token')
        .set('Authorization', `Bearer ${authToken}`);

      const body = res.body as { userId: string; email: string; role: string };

      expect(res.status).toBe(200);
      expect(body).toHaveProperty('userId');
      expect(body).toHaveProperty('email');
      expect(body).toHaveProperty('role');
      expect(body.email).toBe('test@example.com');
    });

    it('should return 401 without token', async () => {
      const res = await request(httpServer()).get('/auth/validate-token');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /users/profile', () => {
    it('should return profile with valid token', async () => {
      const res = await request(httpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      const body = res.body as UserResponse;

      expect(res.status).toBe(200);
      expect(body.email).toBe('test@example.com');
      expect(body.firstName).toBe('Test');
    });

    it('should return 401 without token', async () => {
      const res = await request(httpServer()).get('/users/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /users/sellers', () => {
    it('should return active sellers', async () => {
      const res = await request(httpServer())
        .get('/users/sellers')
        .set('Authorization', `Bearer ${authToken}`);

      const sellers = res.body as Array<{ role: string }>;

      expect(res.status).toBe(200);
      expect(Array.isArray(sellers)).toBe(true);
      expect(sellers.length).toBeGreaterThanOrEqual(1);
      expect(sellers[0].role).toBe(UserRole.SELLER);
    });

    it('should return 401 without token', async () => {
      const res = await request(httpServer()).get('/users/sellers');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /users/:id', () => {
    it('should return user by id', async () => {
      const res = await request(httpServer())
        .get(`/users/${registeredUserId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const body = res.body as UserResponse;

      expect(res.status).toBe(200);
      expect(body.id).toBe(registeredUserId);
      expect(body.email).toBe('test@example.com');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(httpServer())
        .get(`/users/${fakeUuid}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without token', async () => {
      const res = await request(httpServer()).get(`/users/${registeredUserId}`);
      expect(res.status).toBe(401);
    });
  });
});
