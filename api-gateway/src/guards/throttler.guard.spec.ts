import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorage } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './throttler.guard';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomThrottlerGuard,
        { provide: Reflector, useValue: { get: jest.fn() } },
        {
          provide: ThrottlerStorage,
          useValue: { increment: jest.fn() },
        },
        { provide: 'THROTTLER:MODULE_OPTIONS', useValue: [] },
      ],
    }).compile();

    guard = module.get<CustomThrottlerGuard>(CustomThrottlerGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
