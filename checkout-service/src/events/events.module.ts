import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitmqService } from './rabbitmq/rabbitmq.service';
import { PaymentQueueService } from './payment-queue/payment-queue.service';

@Module({
  imports: [ConfigModule],
  providers: [RabbitmqService, PaymentQueueService],
  exports: [RabbitmqService, PaymentQueueService],
})
export class EventsModule {}
