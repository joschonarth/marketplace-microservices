import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { OrderStatus } from './enums/order-status.enum';
import { CartService } from '../cart/cart.service';
import { PaymentQueueService } from '../events/payment-queue/payment-queue.service';
import { MetricsService } from '../metrics/metrics.service';
import { Cart } from '../cart/entities/cart.entity';
import { CartItem } from '../cart/entities/cart-item.entity';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepository: jest.Mocked<Repository<Order>>;
  let cartService: jest.Mocked<CartService>;
  let paymentQueueService: jest.Mocked<PaymentQueueService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockOrderRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockCartService = {
    getActiveCartWithItems: jest.fn(),
    completeCart: jest.fn(),
  };

  const mockPaymentQueueService = {
    publishPaymentOrder: jest.fn(),
  };

  const mockMetricsService = {
    ordersCreatedTotal: { inc: jest.fn() },
  };

  const userId = 'user-uuid';
  const cartId = 'cart-uuid';
  const orderId = 'order-uuid';

  const createMockCartItem = (): CartItem =>
    ({
      id: 'item-uuid',
      cartId,
      productId: 'product-uuid',
      productName: 'Test Product',
      price: 99.99,
      quantity: 1,
      subtotal: 99.99,
      createdAt: new Date(),
    }) as CartItem;

  const createMockCart = (overrides?: Partial<Cart>): Cart =>
    ({
      id: cartId,
      userId,
      status: 'active',
      total: 99.99,
      items: [createMockCartItem()],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as Cart;

  const createMockOrder = (overrides?: Partial<Order>): Order => ({
    id: orderId,
    userId,
    cartId,
    amount: 99.99,
    status: OrderStatus.PENDING,
    paymentMethod: 'credit_card',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepository },
        { provide: CartService, useValue: mockCartService },
        { provide: PaymentQueueService, useValue: mockPaymentQueueService },
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    orderRepository = module.get(getRepositoryToken(Order));
    cartService = module.get(CartService);
    paymentQueueService = module.get(PaymentQueueService);
    metricsService = module.get(MetricsService);
  });

  describe('checkout', () => {
    it('creates order and publishes payment', async () => {
      const cart = createMockCart();
      mockCartService.getActiveCartWithItems.mockResolvedValue(cart);

      const order = createMockOrder();
      mockOrderRepository.create.mockReturnValue(order);
      mockOrderRepository.save.mockResolvedValue(order);
      mockCartService.completeCart.mockResolvedValue(undefined);
      mockPaymentQueueService.publishPaymentOrder.mockResolvedValue(undefined);

      const dto = { paymentMethod: 'credit_card' };
      const result = await service.checkout(userId, dto);

      expect(mockCartService.getActiveCartWithItems).toHaveBeenCalledWith(
        userId,
      );
      expect(mockOrderRepository.create).toHaveBeenCalledWith({
        userId,
        cartId: cart.id,
        amount: cart.total,
        paymentMethod: dto.paymentMethod,
        status: OrderStatus.PENDING,
      });
      expect(mockOrderRepository.save).toHaveBeenCalled();
      expect(mockMetricsService.ordersCreatedTotal.inc).toHaveBeenCalled();
      expect(mockCartService.completeCart).toHaveBeenCalledWith(cart.id);
      expect(mockPaymentQueueService.publishPaymentOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: order.id,
          userId,
          amount: 99.99,
          paymentMethod: dto.paymentMethod,
          items: expect.any(Array),
        }),
      );
      expect(result).toEqual(order);
    });

    it('throws BadRequestException for empty cart', async () => {
      mockCartService.getActiveCartWithItems.mockResolvedValue(null);

      const dto = { paymentMethod: 'credit_card' };

      await expect(service.checkout(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.checkout(userId, dto)).rejects.toThrow(
        'Carrinho vazio ou não encontrado',
      );
      expect(mockOrderRepository.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when cart has no items', async () => {
      const emptyCart = createMockCart({ items: [], total: 0 });
      mockCartService.getActiveCartWithItems.mockResolvedValue(emptyCart);

      const dto = { paymentMethod: 'credit_card' };

      await expect(service.checkout(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockOrderRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns user orders', async () => {
      const orders = [createMockOrder(), createMockOrder({ id: 'order-2' })];
      mockOrderRepository.find.mockResolvedValue(orders);

      const result = await service.findAll(userId);

      expect(mockOrderRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(orders);
    });
  });

  describe('findOne', () => {
    it('returns order', async () => {
      const order = createMockOrder();
      mockOrderRepository.findOne.mockResolvedValue(order);

      const result = await service.findOne(userId, orderId);

      expect(mockOrderRepository.findOne).toHaveBeenCalledWith({
        where: { id: orderId, userId },
      });
      expect(result).toEqual(order);
    });

    it('throws NotFoundException when order not found', async () => {
      mockOrderRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(userId, orderId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(userId, orderId)).rejects.toThrow(
        'Pedido não encontrado',
      );
    });
  });

  describe('updateOrderStatus', () => {
    it('updates status', async () => {
      const order = createMockOrder();
      const updatedOrder = { ...order, status: OrderStatus.PAID };
      mockOrderRepository.findOne.mockResolvedValue(order);
      mockOrderRepository.save.mockResolvedValue(updatedOrder);

      const result = await service.updateOrderStatus(orderId, OrderStatus.PAID);

      expect(mockOrderRepository.findOne).toHaveBeenCalledWith({
        where: { id: orderId },
      });
      expect(order.status).toBe(OrderStatus.PAID);
      expect(mockOrderRepository.save).toHaveBeenCalledWith(order);
      expect(result).toEqual(updatedOrder);
    });

    it('throws NotFoundException when order not found', async () => {
      mockOrderRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateOrderStatus(orderId, OrderStatus.PAID),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateOrderStatus(orderId, OrderStatus.PAID),
      ).rejects.toThrow('Pedido não encontrado');
      expect(mockOrderRepository.save).not.toHaveBeenCalled();
    });
  });
});
