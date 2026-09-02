import { Controller, Get, Param, Headers, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProxyService } from '../proxy/service/proxy.service';
import { JwtAuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get('profile')
  async getProfile(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'users',
      'GET',
      '/users/profile',
      undefined,
      { authorization },
      user,
    );
  }

  @Get('sellers')
  async getSellers(
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'users',
      'GET',
      '/users/sellers',
      undefined,
      { authorization },
      user,
    );
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Headers('authorization') authorization: string,
    @CurrentUser() user: { userId: string; email: string; role: string },
  ) {
    return this.proxyService.proxyRequest(
      'users',
      'GET',
      `/users/${id}`,
      undefined,
      { authorization },
      user,
    );
  }
}
