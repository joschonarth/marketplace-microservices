import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { databaseConfig } from './config/database.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from './events/events.module';
import { ConfigModule } from '@nestjs/config';
import { PaymentsModule } from './payments/payments.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot(databaseConfig),
    EventsModule,
    PaymentsModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
