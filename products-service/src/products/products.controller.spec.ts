import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import type { Request } from 'express';

describe('ProductsController', () => {
  let controller: ProductsController;
  let productsService: jest.Mocked<ProductsService>;

  const mockProduct: Product = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Product',
    description: 'Test description',
    price: 99.99,
    stock: 10,
    sellerId: '123e4567-e89b-12d3-a456-426614174001',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  type MockUser = { id: string; email: string; role: string };
  type MockRequest = Request & { user: MockUser };

  const mockRequest = (role: string): MockRequest =>
    ({
      user: {
        id: '123e4567-e89b-12d3-a456-426614174001',
        email: 'test@test.com',
        role,
      },
    }) as unknown as MockRequest;

  beforeEach(async () => {
    const mockProductsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findBySeller: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: mockProductsService,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
    productsService = module.get(ProductsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create product when user is seller', async () => {
      const createProductDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test description',
        price: 99.99,
        stock: 10,
      };
      const req = mockRequest('seller');
      productsService.create.mockResolvedValue(mockProduct);

      const result = await controller.create(createProductDto, req);

      expect(productsService.create.mock.calls).toContainEqual([
        createProductDto,
        req.user.id,
      ]);
      expect(result).toEqual(mockProduct);
    });

    it('should throw ForbiddenException when user is buyer', async () => {
      const createProductDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test description',
        price: 99.99,
        stock: 10,
      };
      const req = mockRequest('buyer');

      await expect(controller.create(createProductDto, req)).rejects.toThrow(
        ForbiddenException,
      );
      expect(productsService.create.mock.calls).toHaveLength(0);
    });
  });

  describe('findAll', () => {
    it('should return all products', async () => {
      const products = [mockProduct];
      productsService.findAll.mockResolvedValue(products);

      const result = await controller.findAll();

      expect(productsService.findAll.mock.calls).not.toHaveLength(0);
      expect(result).toEqual(products);
    });
  });

  describe('findBySeller', () => {
    it('should return products for seller', async () => {
      const sellerId = '123e4567-e89b-12d3-a456-426614174001';
      const products = [mockProduct];
      productsService.findBySeller.mockResolvedValue(products);

      const result = await controller.findBySeller(sellerId);

      expect(productsService.findBySeller.mock.calls).toContainEqual([
        sellerId,
      ]);
      expect(result).toEqual(products);
    });
  });

  describe('findOne', () => {
    it('should return product by id', async () => {
      productsService.findOne.mockResolvedValue(mockProduct);

      const result = await controller.findOne(mockProduct.id);

      expect(productsService.findOne.mock.calls).toContainEqual([
        mockProduct.id,
      ]);
      expect(result).toEqual(mockProduct);
    });
  });
});
