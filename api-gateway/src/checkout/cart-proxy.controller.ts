import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProxyService } from '../proxy/service/proxy.service';
import { JwtAuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Cart')
@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('items')
  async addItem(
    @Body() body: any,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'POST',
      '/cart/items',
      body,
      { authorization },
      user,
    );
  }

  @Get()
  async getCart(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'GET',
      '/cart',
      undefined,
      { authorization },
      user,
    );
  }

  @Delete('items/:itemId')
  async removeItem(
    @Param('itemId') itemId: string,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'checkout',
      'DELETE',
      `/cart/items/${itemId}`,
      undefined,
      { authorization },
      user,
    );
  }
}
