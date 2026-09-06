import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { CartStatus } from './enums/cart-status.enum';
import { ProductsClientService } from '../products-client/products-client.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

describe('CartService', () => {
  let service: CartService;
  let cartRepository: jest.Mocked<Repository<Cart>>;
  let cartItemRepository: jest.Mocked<Repository<CartItem>>;
  let productsClient: jest.Mocked<ProductsClientService>;

  const mockCartRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockCartItemRepository = {
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockProductsClient = {
    getProduct: jest.fn(),
  };

  const userId = 'user-uuid';
  const productId = 'product-uuid';
  const cartId = 'cart-uuid';
  const itemId = 'item-uuid';

  const activeProduct = {
    id: productId,
    name: 'Test Product',
    price: 99.99,
    isActive: true,
  };

  const inactiveProduct = {
    ...activeProduct,
    isActive: false,
  };

  const createMockCart = (overrides?: Partial<Cart>): Cart => ({
    id: cartId,
    userId,
    status: CartStatus.ACTIVE,
    total: 0,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const createMockCartItem = (overrides?: Partial<CartItem>): CartItem =>
    ({
      id: itemId,
      cartId,
      productId,
      productName: 'Test Product',
      price: 99.99,
      quantity: 1,
      subtotal: 99.99,
      createdAt: new Date(),
      ...overrides,
    }) as CartItem;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getRepositoryToken(Cart), useValue: mockCartRepository },
        {
          provide: getRepositoryToken(CartItem),
          useValue: mockCartItemRepository,
        },
        { provide: ProductsClientService, useValue: mockProductsClient },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
    cartRepository = module.get(getRepositoryToken(Cart));
    cartItemRepository = module.get(getRepositoryToken(CartItem));
    productsClient = module.get(ProductsClientService);
  });

  describe('addItem', () => {
    it('creates new cart when none exists', async () => {
      const dto: AddCartItemDto = { productId, quantity: 1 };
      productsClient.getProduct.mockResolvedValue(activeProduct);
      mockCartRepository.findOne.mockResolvedValue(null);

      const newCart = createMockCart();
      mockCartRepository.create.mockReturnValue(newCart);
      mockCartRepository.save.mockResolvedValue(newCart);

      const newItem = createMockCartItem();
      mockCartItemRepository.create.mockReturnValue(newItem);
      mockCartItemRepository.save.mockResolvedValue(newItem);

      const cartWithItems = createMockCart({
        items: [newItem],
        total: 99.99,
      });
      mockCartRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(cartWithItems);

      const result = await service.addItem(userId, dto);

      expect(productsClient.getProduct).toHaveBeenCalledWith(productId);
      expect(mockCartRepository.findOne).toHaveBeenCalledWith({
        where: { userId, status: CartStatus.ACTIVE },
        relations: { items: true },
      });
      expect(mockCartRepository.create).toHaveBeenCalledWith({
        userId,
        status: CartStatus.ACTIVE,
        total: 0,
        items: [],
      });
      expect(mockCartRepository.save).toHaveBeenCalled();
      expect(mockCartItemRepository.create).toHaveBeenCalledWith({
        cartId,
        productId: activeProduct.id,
        productName: activeProduct.name,
        price: activeProduct.price,
        quantity: 1,
        subtotal: 99.99,
      });
      expect(result).toEqual(cartWithItems);
    });

    it('adds to existing cart', async () => {
      const dto: AddCartItemDto = { productId, quantity: 2 };
      productsClient.getProduct.mockResolvedValue(activeProduct);

      const existingCart = createMockCart({ items: [] });
      mockCartRepository.findOne.mockResolvedValue(existingCart);

      const newItem = createMockCartItem({ quantity: 2, subtotal: 199.98 });
      mockCartItemRepository.create.mockReturnValue(newItem);
      mockCartItemRepository.save.mockResolvedValue(newItem);

      const cartWithItems = createMockCart({
        items: [newItem],
        total: 199.98,
      });
      mockCartRepository.findOne
        .mockResolvedValueOnce(existingCart)
        .mockResolvedValueOnce(cartWithItems);

      const result = await service.addItem(userId, dto);

      expect(mockCartRepository.create).not.toHaveBeenCalled();
      expect(mockCartItemRepository.create).toHaveBeenCalledWith({
        cartId,
        productId: activeProduct.id,
        productName: activeProduct.name,
        price: activeProduct.price,
        quantity: 2,
        subtotal: 199.98,
      });
      expect(result).toEqual(cartWithItems);
    });

    it('updates quantity for existing item', async () => {
      const dto: AddCartItemDto = { productId, quantity: 3 };
      productsClient.getProduct.mockResolvedValue(activeProduct);

      const existingItem = createMockCartItem({ quantity: 1, subtotal: 99.99 });
      const existingCart = createMockCart({ items: [existingItem] });

      mockCartItemRepository.save.mockImplementation((item) =>
        Promise.resolve(item),
      );

      const cartWithItems = createMockCart({
        items: [{ ...existingItem, quantity: 4, subtotal: 399.96 }],
        total: 399.96,
      });
      mockCartRepository.findOne
        .mockResolvedValueOnce(existingCart)
        .mockResolvedValueOnce(cartWithItems);

      const result = await service.addItem(userId, dto);

      expect(mockCartItemRepository.create).not.toHaveBeenCalled();
      expect(mockCartItemRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 4,
          subtotal: 399.96,
        }),
      );
      expect(result).toEqual(cartWithItems);
    });

    it('throws BadRequestException for inactive product', async () => {
      const dto: AddCartItemDto = { productId, quantity: 1 };
      productsClient.getProduct.mockResolvedValue(inactiveProduct);

      await expect(service.addItem(userId, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.addItem(userId, dto)).rejects.toThrow(
        'Produto não está disponível',
      );
      expect(mockCartRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getCart', () => {
    it('returns cart with items', async () => {
      const cart = createMockCart({
        items: [createMockCartItem()],
        total: 99.99,
      });
      mockCartRepository.findOne.mockResolvedValue(cart);

      const result = await service.getCart(userId);

      expect(mockCartRepository.findOne).toHaveBeenCalledWith({
        where: { userId, status: CartStatus.ACTIVE },
        relations: { items: true },
      });
      expect(result).toEqual(cart);
    });

    it('returns empty when no cart', async () => {
      mockCartRepository.findOne.mockResolvedValue(null);

      const result = await service.getCart(userId);

      expect(mockCartRepository.findOne).toHaveBeenCalledWith({
        where: { userId, status: CartStatus.ACTIVE },
        relations: { items: true },
      });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('removeItem', () => {
    it('removes item from cart', async () => {
      const item = createMockCartItem();
      const cart = createMockCart({ items: [item] });
      mockCartRepository.findOne.mockResolvedValue(cart);
      mockCartItemRepository.remove.mockResolvedValue(undefined);

      const cartAfterRemoval = createMockCart({ items: [], total: 0 });
      mockCartRepository.findOne
        .mockResolvedValueOnce(cart)
        .mockResolvedValueOnce(cartAfterRemoval);

      const result = await service.removeItem(userId, itemId);

      expect(mockCartItemRepository.remove).toHaveBeenCalledWith(item);
      expect(result).toEqual(cartAfterRemoval);
    });

    it('throws NotFoundException when no cart', async () => {
      mockCartRepository.findOne.mockResolvedValue(null);

      await expect(service.removeItem(userId, itemId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.removeItem(userId, itemId)).rejects.toThrow(
        'Carrinho não encontrado',
      );
      expect(mockCartItemRepository.remove).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when item not in cart', async () => {
      const cart = createMockCart({ items: [] });
      mockCartRepository.findOne.mockResolvedValue(cart);

      await expect(service.removeItem(userId, itemId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.removeItem(userId, itemId)).rejects.toThrow(
        'Item não encontrado no carrinho',
      );
      expect(mockCartItemRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('completeCart', () => {
    it('updates status to COMPLETED', async () => {
      mockCartRepository.update.mockResolvedValue(undefined);

      await service.completeCart(cartId);

      expect(mockCartRepository.update).toHaveBeenCalledWith(cartId, {
        status: CartStatus.COMPLETED,
      });
    });
  });
});
