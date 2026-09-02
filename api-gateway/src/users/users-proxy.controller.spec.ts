import { Test, TestingModule } from '@nestjs/testing';
import { UsersProxyController } from './users-proxy.controller';
import { ProxyService } from '../proxy/service/proxy.service';

describe('UsersProxyController', () => {
  let controller: UsersProxyController;
  let proxyService: jest.Mocked<Pick<ProxyService, 'proxyRequest'>>;

  beforeEach(async () => {
    proxyService = {
      proxyRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersProxyController],
      providers: [{ provide: ProxyService, useValue: proxyService }],
    }).compile();

    controller = module.get<UsersProxyController>(UsersProxyController);
  });

  describe('getProfile', () => {
    it('should proxy GET /users/profile with authorization and user info', async () => {
      const authorization = 'Bearer jwt-token';
      const user = { userId: 'uuid-1', email: 'test@email.com', role: 'buyer' };
      const expected = {
        id: 'uuid-1',
        email: 'test@email.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'buyer',
      };
      proxyService.proxyRequest.mockResolvedValue(expected);

      const result = await controller.getProfile(authorization, user);

      expect(proxyService.proxyRequest).toHaveBeenCalledWith(
        'users',
        'GET',
        '/users/profile',
        undefined,
        { authorization },
        user,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('getSellers', () => {
    it('should proxy GET /users/sellers with authorization and user info', async () => {
      const authorization = 'Bearer jwt-token';
      const user = { userId: 'uuid-1', email: 'test@email.com', role: 'buyer' };
      const expected = [
        { id: 'seller-1', email: 'seller@email.com', role: 'seller' },
      ];
      proxyService.proxyRequest.mockResolvedValue(expected);

      const result = await controller.getSellers(authorization, user);

      expect(proxyService.proxyRequest).toHaveBeenCalledWith(
        'users',
        'GET',
        '/users/sellers',
        undefined,
        { authorization },
        user,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('findById', () => {
    it('should proxy GET /users/:id with authorization and user info', async () => {
      const id = 'target-uuid';
      const authorization = 'Bearer jwt-token';
      const user = { userId: 'uuid-1', email: 'test@email.com', role: 'buyer' };
      const expected = {
        id: 'target-uuid',
        email: 'found@email.com',
        firstName: 'Found',
        lastName: 'User',
        role: 'seller',
      };
      proxyService.proxyRequest.mockResolvedValue(expected);

      const result = await controller.findById(id, authorization, user);

      expect(proxyService.proxyRequest).toHaveBeenCalledWith(
        'users',
        'GET',
        '/users/target-uuid',
        undefined,
        { authorization },
        user,
      );
      expect(result).toEqual(expected);
    });
  });
});
