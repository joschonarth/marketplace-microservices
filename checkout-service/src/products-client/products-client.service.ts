import {
  Injectable,
  NotFoundException,
  BadGatewayException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

interface ProductResponse {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

@Injectable()
export class ProductsClientService {
  constructor(private readonly httpService: HttpService) {}

  async getProduct(productId: string): Promise<ProductResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<ProductResponse>(`/products/${productId}`),
      );
      return data;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        throw new NotFoundException('Produto não encontrado');
      }
      throw new BadGatewayException('Serviço de produtos indisponível');
    }
  }
}
