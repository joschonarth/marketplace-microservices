import { Injectable, Logger } from '@nestjs/common';

export interface ConsumerMetrics {
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  totalRetries: number;
  lastProcessedAt: Date | null;
  startedAt: Date;
  averageProcessingTime: number;
}

@Injectable()
export class MetricsService {
  private metrics: ConsumerMetrics = {
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalRetries: 0,
    lastProcessedAt: null,
    startedAt: new Date(),
    averageProcessingTime: 0,
  };

  private totalProcessingTime = 0;

  private readonly logger = new Logger(MetricsService.name);

  startTracking(): void {
    this.metrics.startedAt = new Date();
  }

  recordSuccess(processingTime: number): void {
    this.updateMetrics(true, processingTime);
  }

  recordFailure(processingTime: number): void {
    this.updateMetrics(false, processingTime);
  }

  private updateMetrics(success: boolean, processingTime: number): void {
    this.metrics.totalProcessed++;
    this.metrics.lastProcessedAt = new Date();

    if (success) {
      this.metrics.totalSuccess++;
    } else {
      this.metrics.totalFailed++;
    }

    this.totalProcessingTime += processingTime;
    this.metrics.averageProcessingTime = Math.round(
      this.totalProcessingTime / this.metrics.totalProcessed,
    );

    if (this.metrics.totalProcessed % 10 === 0) {
      this.logMetricsSummary();
    }
  }

  incrementRetryCount(): void {
    this.metrics.totalRetries++;
  }

  private logMetricsSummary(): void {
    const successRate =
      this.metrics.totalProcessed > 0
        ? (
            (this.metrics.totalSuccess / this.metrics.totalProcessed) *
            100
          ).toFixed(2)
        : '0';

    this.logger.log('📊 ====== CONSUMER METRICS ======');
    this.logger.log(`.   Total Processed: ${this.metrics.totalProcessed}`);
    this.logger.log(`.   Success: ${this.metrics.totalSuccess}`);
    this.logger.log(`.   Failed: ${this.metrics.totalFailed}`);
    this.logger.log(`.   Retries: ${this.metrics.totalRetries}`);
    this.logger.log(`.   Success Rate: ${successRate}%`);
    this.logger.log(
      `.   Avg Processing Time: ${this.metrics.averageProcessingTime}ms`,
    );
    this.logger.log('📊 ================================');
  }

  getMetrics(): ConsumerMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalRetries: 0,
      lastProcessedAt: null,
      startedAt: new Date(),
      averageProcessingTime: 0,
    };
    this.totalProcessingTime = 0;

    this.logger.log('🔄 Metrics reset');
  }
}
