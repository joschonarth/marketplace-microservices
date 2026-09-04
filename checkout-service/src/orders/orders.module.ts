import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { CartModule } from 'src/cart/cart.module';
import { EventsModule } from 'src/events/events.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentResultConsumerService } from './payment-result-consumer/payment-result-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), CartModule, EventsModule],
  controllers: [OrdersController],
  providers: [OrdersService, PaymentResultConsumerService],
})
export class OrdersModule {}
