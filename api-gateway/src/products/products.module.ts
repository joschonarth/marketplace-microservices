import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [ProxyModule],
  controllers: [ProductsController],
})
export class ProductsModule {}
