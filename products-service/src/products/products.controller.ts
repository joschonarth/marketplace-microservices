import {
  Controller,
  Post,
  Body,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  async create(
    @Body() createProductDto: CreateProductDto,
    @Req() req: Request,
  ) {
    const user = req.user as { id: string; email: string; role: string };

    if (user.role !== 'seller') {
      throw new ForbiddenException('Only sellers can create products');
    }

    return this.productsService.create(createProductDto, user.id);
  }
}
