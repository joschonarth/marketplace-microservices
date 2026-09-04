import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { CartService } from '../cart/cart.service';
import { PaymentQueueService } from '../events/payment-queue/payment-queue.service';
import { CheckoutDto } from '../cart/dto/checkout.dto';
import { PaymentOrderMessage } from '../events/payment-queue.interface';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly cartService: CartService,
    private readonly paymentQueueService: PaymentQueueService,
  ) {}

  async checkout(userId: string, dto: CheckoutDto): Promise<Order> {
    const cart = await this.cartService.getActiveCartWithItems(userId);

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new BadRequestException('Carrinho vazio ou não encontrado');
    }

    const order = this.orderRepository.create({
      userId,
      cartId: cart.id,
      amount: cart.total,
      paymentMethod: dto.paymentMethod,
      status: OrderStatus.PENDING,
    });

    const savedOrder = await this.orderRepository.save(order);

    await this.cartService.completeCart(cart.id);

    const paymentMessage: PaymentOrderMessage = {
      orderId: savedOrder.id,
      userId,
      amount: Number(savedOrder.amount),
      items: cart.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.price),
      })),
      paymentMethod: dto.paymentMethod,
    };

    await this.paymentQueueService.publishPaymentOrder(paymentMessage);

    return savedOrder;
  }

  async findAll(userId: string): Promise<Order[]> {
    return this.orderRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, userId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return order;
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    order.status = status;
    return this.orderRepository.save(order);
  }
}
