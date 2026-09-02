import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { RoleGuard } from './role.guard';

describe('RoleGuard', () => {
  let guard: RoleGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
      ],
    }).compile();

    guard = module.get<RoleGuard>(RoleGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
