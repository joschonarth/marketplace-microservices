import { Controller, Get, Param, Headers, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProxyService } from '../proxy/service/proxy.service';
import { JwtAuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get(':orderId')
  async getPaymentByOrderId(
    @Param('orderId') orderId: string,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'payments',
      'GET',
      `/payments/${orderId}`,
      undefined,
      { authorization },
      user,
    );
  }
}
