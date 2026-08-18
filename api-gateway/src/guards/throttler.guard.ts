import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    const userAgent: string = req.headers['user-agent'] ?? 'unknown';
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';

    return Promise.resolve(`${ip}-${userAgent}`);
  }
}
