import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProxyService } from '../proxy/service/proxy.service';
import { JwtAuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Orders')
@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('cart/checkout')
  async checkout(
    @Body() body: any,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'POST',
      '/cart/checkout',
      body,
      { authorization },
      user,
    );
  }

  @Get('orders')
  async listOrders(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'GET',
      '/orders',
      undefined,
      { authorization },
      user,
    );
  }

  @Get('orders/:id')
  async getOrder(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'GET',
      `/orders/${id}`,
      undefined,
      { authorization },
      user,
    );
  }
}
