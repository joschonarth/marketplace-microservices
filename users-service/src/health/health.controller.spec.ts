import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let healthController: HealthController;
  let healthCheckService: HealthCheckService;
  let typeOrmIndicator: TypeOrmHealthIndicator;
  let healthCheckMock: jest.Mock;
  let pingCheckMock: jest.Mock;

  beforeEach(async () => {
    healthCheckMock = jest.fn(
      async (indicators: (() => Promise<Record<string, unknown>>)[]) => {
        const results = await Promise.all(indicators.map((fn) => fn()));
        const details = results.reduce<Record<string, unknown>>(
          (accumulator, result) => Object.assign(accumulator, result),
          {},
        );

        return {
          status: 'ok',
          info: details,
          error: {},
          details,
        };
      },
    );
    pingCheckMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: { check: healthCheckMock },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: { pingCheck: pingCheckMock },
        },
      ],
    }).compile();

    healthController = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    typeOrmIndicator = module.get<TypeOrmHealthIndicator>(
      TypeOrmHealthIndicator,
    );
  });

  describe('check', () => {
    it('should return healthy status when database is up', async () => {
      (typeOrmIndicator.pingCheck as jest.Mock).mockResolvedValue({
        database: { status: 'up' },
      });

      const result = await healthController.check();
      expect(result).toEqual({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      });
      expect(pingCheckMock).toHaveBeenCalledWith('database');
    });

    it('should call HealthCheckService.check with database indicator', async () => {
      (typeOrmIndicator.pingCheck as jest.Mock).mockResolvedValue({
        database: { status: 'up' },
      });

      await healthController.check();

      expect(healthCheckMock).toHaveBeenCalledTimes(1);
      expect(pingCheckMock).toHaveBeenCalledTimes(1);
    });

    it('should propagate error when database is down', async () => {
      const dbError = new Error('Connection refused');
      (typeOrmIndicator.pingCheck as jest.Mock).mockRejectedValue(dbError);

      (healthCheckService.check as jest.Mock).mockRejectedValue(dbError);

      await expect(healthController.check()).rejects.toThrow(
        'Connection refused',
      );
    });
  });
});
