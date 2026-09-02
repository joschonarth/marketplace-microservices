import { Module } from '@nestjs/common';
import { AuthProxyController } from './auth-proxy.controller';
import { UsersProxyController } from './users-proxy.controller';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [ProxyModule],
  controllers: [AuthProxyController, UsersProxyController],
})
export class UsersModule {}
