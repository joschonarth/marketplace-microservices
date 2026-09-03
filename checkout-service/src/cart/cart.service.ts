import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { CartStatus } from './enums/cart-status.enum';
import { ProductsClientService } from '../products-client/products-client.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    private readonly productsClient: ProductsClientService,
  ) {}

  async addItem(userId: string, dto: AddCartItemDto): Promise<Cart> {
    const product = await this.productsClient.getProduct(dto.productId);

    if (!product.isActive) {
      throw new BadRequestException('Produto não está disponível');
    }

    let cart = await this.cartRepository.findOne({
      where: { userId, status: CartStatus.ACTIVE },
      relations: { items: true },
    });

    if (!cart) {
      cart = this.cartRepository.create({
        userId,
        status: CartStatus.ACTIVE,
        total: 0,
        items: [],
      });
      cart = await this.cartRepository.save(cart);
    }

    const existingItem = cart.items.find(
      (item) => item.productId === dto.productId,
    );

    if (existingItem) {
      existingItem.quantity += dto.quantity;
      existingItem.subtotal =
        Math.round(Number(existingItem.price) * existingItem.quantity * 100) /
        100;
      await this.cartItemRepository.save(existingItem);
    } else {
      const newItem = this.cartItemRepository.create({
        cartId: cart.id,
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: dto.quantity,
        subtotal: Math.round(Number(product.price) * dto.quantity * 100) / 100,
      });
      await this.cartItemRepository.save(newItem);
    }

    return this.getActiveCart(userId);
  }

  async getCart(userId: string): Promise<Cart | { items: []; total: number }> {
    const cart = await this.cartRepository.findOne({
      where: { userId, status: CartStatus.ACTIVE },
      relations: { items: true },
    });

    if (!cart) {
      return { items: [], total: 0 };
    }

    return cart;
  }

  async removeItem(userId: string, itemId: string): Promise<Cart> {
    const cart = await this.cartRepository.findOne({
      where: { userId, status: CartStatus.ACTIVE },
      relations: { items: true },
    });

    if (!cart) {
      throw new NotFoundException('Carrinho não encontrado');
    }

    const item = cart.items.find((i) => i.id === itemId);

    if (!item) {
      throw new NotFoundException('Item não encontrado no carrinho');
    }

    await this.cartItemRepository.remove(item);

    return this.getActiveCart(userId);
  }

  private async getActiveCart(userId: string): Promise<Cart> {
    const cart = await this.cartRepository.findOneOrFail({
      where: { userId, status: CartStatus.ACTIVE },
      relations: { items: true },
    });

    const total = cart.items.reduce(
      (sum, item) => sum + Number(item.subtotal),
      0,
    );
    cart.total = Math.round(total * 100) / 100;
    await this.cartRepository.save(cart);

    return cart;
  }
}
