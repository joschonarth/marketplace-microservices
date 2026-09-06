import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { NotFoundException, BadGatewayException } from '@nestjs/common';
import { ProductsClientService } from './products-client.service';

describe('ProductsClientService', () => {
  let service: ProductsClientService;
  let httpService: jest.Mocked<HttpService>;

  const mockHttpService = {
    get: jest.fn(),
  };

  const productId = 'product-uuid';
  const productData = {
    id: productId,
    name: 'Test Product',
    price: 99.99,
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsClientService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<ProductsClientService>(ProductsClientService);
    httpService = module.get(HttpService);
  });

  describe('getProduct', () => {
    it('returns product data on success', async () => {
      const axiosResponse = {
        data: productData,
        status: 200,
      } as AxiosResponse;
      mockHttpService.get.mockReturnValue(of(axiosResponse));

      const result = await service.getProduct(productId);

      expect(mockHttpService.get).toHaveBeenCalledWith(
        `/products/${productId}`,
      );
      expect(result).toEqual(productData);
    });

    it('throws NotFoundException for 404', async () => {
      const axiosError = new AxiosError('Not Found');
      axiosError.response = { status: 404 } as AxiosError['response'];
      mockHttpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.getProduct(productId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getProduct(productId)).rejects.toThrow(
        'Produto não encontrado',
      );
    });

    it('throws BadGatewayException for other errors', async () => {
      const axiosError = new AxiosError('Server Error');
      axiosError.response = { status: 500 } as AxiosError['response'];
      mockHttpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.getProduct(productId)).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.getProduct(productId)).rejects.toThrow(
        'Serviço de produtos indisponível',
      );
    });

    it('throws BadGatewayException for network errors without response', async () => {
      const axiosError = new AxiosError('Network Error');
      mockHttpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.getProduct(productId)).rejects.toThrow(
        BadGatewayException,
      );
    });
  });
});
