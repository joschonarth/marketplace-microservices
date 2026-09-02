import { Test, TestingModule } from '@nestjs/testing';
import { ProxyService } from './proxy.service';
import { HttpService } from '@nestjs/axios';
import { CircuitBreakerService } from '../../common/circuit-breaker/circuit-breaker.service';
import { CacheFallbackService } from '../../common/fallback/cache.fallback';
import { DefaultFallbackService } from '../../common/fallback/default.fallback';
import { TimeoutService } from '../../common/timeout/timeout.service';
import { RetryService } from '../../common/retry/retry.service';

describe('ProxyService', () => {
  let service: ProxyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        { provide: HttpService, useValue: { request: jest.fn() } },
        {
          provide: CircuitBreakerService,
          useValue: { executeWithCircuitBreaker: jest.fn() },
        },
        {
          provide: CacheFallbackService,
          useValue: {
            setCachedData: jest.fn(),
            createCacheFallback: jest.fn(),
          },
        },
        {
          provide: DefaultFallbackService,
          useValue: { createErrorFallback: jest.fn() },
        },
        {
          provide: TimeoutService,
          useValue: { executeWithCustomTimeout: jest.fn() },
        },
        {
          provide: RetryService,
          useValue: { executeWithExponentialBackoff: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
