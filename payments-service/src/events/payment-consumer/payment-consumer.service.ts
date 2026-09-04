import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PaymentQueueService } from '../payment-queue/payment-queue.service';
import { PaymentOrderMessage } from '../payment-queue.interface';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { MetricsService } from '../metrics/metrics.service';
import { PaymentsService } from 'src/payments/payments.service';
import { PaymentResultPublisherService } from '../payment-result/payment-result-publisher.service';

@Injectable()
export class PaymentConsumerService implements OnModuleInit {
  private readonly logger = new Logger(PaymentConsumerService.name);

  constructor(
    private readonly paymentQueueService: PaymentQueueService,
    private readonly rabbitMQService: RabbitmqService,
    private readonly metricsService: MetricsService,
    private readonly paymentsService: PaymentsService,
    private readonly paymentResultPublisher: PaymentResultPublisherService,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 Starting Payment Consumer Service');
    this.metricsService.startTracking();
    await this.startConsuming();
  }

  async startConsuming() {
    try {
      this.logger.log('👂 Starting to consume payment orders from queue');

      const isConnected = await this.rabbitMQService.waitForConnection();

      if (!isConnected) {
        this.logger.error(
          '❌ Could not connect to RabbitMQ after multiple attempts',
        );
        return;
      }

      await this.paymentQueueService.consumePaymentOrders(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        this.processPaymentOrder.bind(this),
      );

      this.logger.log('✅ Payment Consumer Service started successfully');
    } catch (error) {
      this.logger.error('❌ Failed to start consuming payment orders:', error);
    }
  }

  private async processPaymentOrder(
    message: PaymentOrderMessage,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      if (!this.validateMessage(message)) {
        this.logger.error('❌ Invalid payment message received');
        throw new Error('Invalid payment message received');
      }

      const payment = await this.paymentsService.processPayment(message);

      try {
        await this.paymentResultPublisher.publishPaymentResult(payment);
      } catch (publishError) {
        this.logger.error(
          `⚠️ Failed to publish payment result for orderId=${message.orderId}, payment is saved and can be queried via REST`,
          publishError,
        );
      }

      this.logger.log('✅ Payment order processed successfully');
      this.metricsService.recordSuccess(Date.now() - startTime);
    } catch (error) {
      this.metricsService.recordFailure(Date.now() - startTime);

      this.logger.error(
        `❌ Failed to process payment for order ${message.orderId}:`,
        error,
      );

      throw error;
    }
  }

  private validateMessage(message: PaymentOrderMessage): boolean {
    if (!message.orderId) {
      this.logger.error('Missing orderId in payment message');
      return false;
    }

    if (!message.userId) {
      this.logger.error('Missing userId in payment message');
      return false;
    }

    if (!message.amount || message.amount <= 0) {
      this.logger.error('Invalid amount in payment message');
      return false;
    }

    if (!message.paymentMethod) {
      this.logger.error('Missing paymentMethod in payment message');
      return false;
    }

    if (!message.items || message.items.length === 0) {
      this.logger.error('No items in payment message');
      return false;
    }

    return true;
  }
}
