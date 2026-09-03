import { Module } from '@nestjs/common';
import { CartProxyController } from './cart-proxy.controller';
import { OrdersProxyController } from './orders-proxy.controller';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [ProxyModule],
  controllers: [CartProxyController, OrdersProxyController],
})
export class CheckoutModule {}
