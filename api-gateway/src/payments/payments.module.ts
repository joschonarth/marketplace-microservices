import { Module } from '@nestjs/common';
import { PaymentsProxyController } from './payments-proxy.controller';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [ProxyModule],
  controllers: [PaymentsProxyController],
})
export class PaymentsModule {}
