import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProxyService } from '../proxy/service/proxy.service';
import { JwtAuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() body: any,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'products',
      'POST',
      '/products',
      body,
      { authorization },
      user,
    );
  }

  @Get()
  async findAll() {
    return this.proxyService.proxyRequest('products', 'GET', '/products');
  }

  @Get('seller/:sellerId')
  async findBySeller(@Param('sellerId') sellerId: string) {
    return this.proxyService.proxyRequest(
      'products',
      'GET',
      `/products/seller/${sellerId}`,
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.proxyService.proxyRequest('products', 'GET', `/products/${id}`);
  }
}
