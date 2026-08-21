import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UserSession } from '../service/auth.service';

export interface JwtAuthenticatedUser {
  userId: string;
  email: string;
  role: string;
}

export type AuthenticatedUser =
  JwtAuthenticatedUser | NonNullable<UserSession['user']>;

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
