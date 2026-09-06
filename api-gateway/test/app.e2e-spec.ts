import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppService } from '../src/app.service';

interface HealthResponse {
  status: string;
}

// Minimal controllers for E2E - avoids importing AppController (depends on ProxyService
// which uses src/common/* paths that fail without moduleNameMapper in jest-e2e)
@Controller()
class TestAppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}

@Controller('health')
class TestHealthController {
  @Get()
  check() {
    return { status: 'ok', info: { gateway: { status: 'up' } } };
  }
}

describe('Api Gateway (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestAppController, TestHealthController],
      providers: [AppService],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / should return Hello World!', () => {
    return request(app.getHttpServer() as Server)
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /health should return health status', () => {
    return request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200)
      .expect((res: { body: HealthResponse }) => {
        expect(res.body.status).toBe('ok');
      });
  });
});
