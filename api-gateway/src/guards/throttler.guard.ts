import { Injectable } from '@nestjs/common';
import {
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const request = req as unknown as Request;
    const userAgent = request.headers['user-agent'] ?? 'unknown';
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';

    return Promise.resolve(`${ip}-${userAgent}`);
  }

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, limit, ttl, throttler } = requestProps;
    const { req, res } = this.getRequestResponse(context);
    const response = res as unknown as Response;
    const throttleName = throttler.name ?? 'default';
    const tracker = await this.getTracker(req);
    const key = requestProps.generateKey(context, tracker, throttleName);

    const { totalHits, timeToExpire } = await this.storageService.increment(
      key,
      ttl,
      limit,
      1,
      throttleName,
    );

    if (totalHits > limit) {
      response.setHeader('Retry-After', Math.round(timeToExpire / 1000));
      throw new ThrottlerException();
    }

    response.setHeader(`${this.headerPrefix}-Limit`, limit);
    response.setHeader(`${this.headerPrefix}-Remaining`, limit - totalHits);
    response.setHeader(
      `${this.headerPrefix}-Reset`,
      Math.round(timeToExpire / 1000),
    );

    return true;
  }
}
