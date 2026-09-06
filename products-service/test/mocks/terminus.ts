import { Module } from '@nestjs/common';

export function HealthCheck(): MethodDecorator {
  return () => undefined;
}

export class HealthCheckService {
  check() {
    return { status: 'ok' };
  }
}

export class TypeOrmHealthIndicator {
  pingCheck() {
    return { database: { status: 'up' } };
  }
}

@Module({
  providers: [HealthCheckService, TypeOrmHealthIndicator],
  exports: [HealthCheckService, TypeOrmHealthIndicator],
})
export class TerminusModule {}
