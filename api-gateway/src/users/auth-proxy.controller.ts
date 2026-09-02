import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProxyService } from '../proxy/service/proxy.service';
import { JwtAuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post('register')
  async register(@Body() body: any) {
    return this.proxyService.proxyRequest(
      'users',
      'POST',
      '/auth/register',
      body,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: any) {
    return this.proxyService.proxyRequest('users', 'POST', '/auth/login', body);
  }

  @Get('validate-token')
  @UseGuards(JwtAuthGuard)
  async validateToken(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'users',
      'GET',
      '/auth/validate-token',
      undefined,
      { authorization },
      user,
    );
  }
}
