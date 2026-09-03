import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CheckoutDto } from '../cart/dto/checkout.dto';
import { Order } from './entities/order.entity';

interface AuthenticatedRequest {
  user: { id: string; email: string; role: string };
}

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('cart/checkout')
  checkout(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CheckoutDto,
  ): Promise<Order> {
    return this.ordersService.checkout(req.user.id, dto);
  }

  @Get('orders')
  findAll(@Request() req: AuthenticatedRequest): Promise<Order[]> {
    return this.ordersService.findAll(req.user.id);
  }

  @Get('orders/:id')
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Order> {
    return this.ordersService.findOne(req.user.id, id);
  }
}
