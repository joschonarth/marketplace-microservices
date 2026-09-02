import { Test, TestingModule } from '@nestjs/testing';
import { AuthProxyController } from './auth-proxy.controller';
import { ProxyService } from '../proxy/service/proxy.service';

describe('AuthProxyController', () => {
  let controller: AuthProxyController;
  let proxyService: jest.Mocked<Pick<ProxyService, 'proxyRequest'>>;

  beforeEach(async () => {
    proxyService = {
      proxyRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthProxyController],
      providers: [{ provide: ProxyService, useValue: proxyService }],
    }).compile();

    controller = module.get<AuthProxyController>(AuthProxyController);
  });

  describe('register', () => {
    it('should proxy POST /auth/register with body', async () => {
      const body = {
        email: 'test@email.com',
        password: 'Str0ng!Pass',
        firstName: 'Test',
        lastName: 'User',
        role: 'seller',
      };
      const expected = { id: 'uuid-1', ...body };
      proxyService.proxyRequest.mockResolvedValue(expected);

      const result = await controller.register(body);

      expect(proxyService.proxyRequest).toHaveBeenCalledWith(
        'users',
        'POST',
        '/auth/register',
        body,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('login', () => {
    it('should proxy POST /auth/login with body', async () => {
      const body = { email: 'test@email.com', password: 'Str0ng!Pass' };
      const expected = { user: { id: 'uuid-1' }, token: 'jwt-token' };
      proxyService.proxyRequest.mockResolvedValue(expected);

      const result = await controller.login(body);

      expect(proxyService.proxyRequest).toHaveBeenCalledWith(
        'users',
        'POST',
        '/auth/login',
        body,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('validateToken', () => {
    it('should proxy GET /auth/validate-token with authorization header and user info', async () => {
      const authorization = 'Bearer jwt-token';
      const user = { userId: 'uuid-1', email: 'test@email.com', role: 'buyer' };
      const expected = {
        userId: 'uuid-1',
        email: 'test@email.com',
        role: 'buyer',
      };
      proxyService.proxyRequest.mockResolvedValue(expected);

      const result = await controller.validateToken(authorization, user);

      expect(proxyService.proxyRequest).toHaveBeenCalledWith(
        'users',
        'GET',
        '/auth/validate-token',
        undefined,
        { authorization },
        user,
      );
      expect(result).toEqual(expected);
    });
  });
});
