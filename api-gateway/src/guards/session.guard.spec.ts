import { Test, TestingModule } from '@nestjs/testing';
import { SessionGuard } from './session.guard';
import { AuthService } from '../auth/service/auth.service';

describe('SessionGuard', () => {
  let guard: SessionGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionGuard,
        {
          provide: AuthService,
          useValue: { validateSessionToken: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get<SessionGuard>(SessionGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });
});
