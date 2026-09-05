# SPEC: Instrumentação de Métricas HTTP — api-gateway

**Serviço:** api-gateway  
**Status:** Proposta  
**Autor:** Arquitetura  
**Data:** 2026-03-05

---

## 1. Visão Geral

Instrumentar o `api-gateway` (porta 3005) com métricas HTTP usando `prom-client`, expondo o endpoint `GET /metrics` no formato Prometheus. Isso permitirá que o Prometheus (já configurado na SPEC 01 do `observability-stack`) colete métricas automaticamente a cada 15s.

O `api-gateway` tem um padrão de guards diferente dos demais serviços: **não possui `JwtAuthGuard` global** (APP_GUARD). Em vez disso, utiliza `CustomThrottlerGuard` como APP_GUARD e aplica `JwtAuthGuard` por controller via `@UseGuards()`. Portanto, o `MetricsController` não precisa do decorator `@Public()` para bypass de JWT, mas **deve usar `@SkipThrottle()`** para evitar rate limiting no scraping do Prometheus.

---

## 2. Escopo

### Incluso

- Instalação do `prom-client` como dependência
- Criação do `MetricsModule` (`@Global`) com `MetricsService`, `HttpMetricsInterceptor` e `MetricsController`
- Registro do módulo no `AppModule`
- Endpoint `GET /metrics` público (sem JWT, sem rate limiting) retornando métricas no formato Prometheus

### Fora de escopo

- Métricas de negócio customizadas — spec futura
- Dashboards no Grafana — spec futura
- Alterações no Prometheus ou Grafana — já configurados

---

## 3. Contexto do Serviço

| Aspecto               | Detalhe                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| **Porta**             | 3005                                                                   |
| **Guard global**      | `CustomThrottlerGuard` (APP_GUARD) — rate limiting                     |
| **JWT**               | Aplicado por controller via `@UseGuards(JwtAuthGuard)`, **não** global |
| **Middleware**        | `LoggingMiddleware` em todas as rotas                                  |
| **prom-client**       | Não instalado                                                          |
| **Endpoint /metrics** | Não existe                                                             |

---

## 4. Dependências

Instalar no `api-gateway/`:

```bash
npm install prom-client
```

---

## 5. Estrutura de Arquivos

```
api-gateway/
└── src/
    └── metrics/
        ├── metrics.module.ts            ← módulo @Global
        ├── metrics.service.ts           ← registry, counter, histogram
        ├── metrics.controller.ts        ← GET /metrics
        └── http-metrics.interceptor.ts  ← interceptor global
```

---

## 6. Implementação

### 6.1 MetricsService (`src/metrics/metrics.service.ts`)

Responsável por encapsular o `prom-client` Registry e expor as métricas.

**Requisitos:**

- Criar um `Registry` dedicado (não usar o default global, para isolamento)
- Registrar `collectDefaultMetrics` com o registry dedicado e prefix `api_gateway_`
- Criar um `Counter` chamado `http_requests_total` com labels: `method`, `route`, `status_code`
- Criar um `Histogram` chamado `http_request_duration_seconds` com labels: `method`, `route`, `status_code`
- Buckets do histogram: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` (padrão Prometheus)
- Expor método `getMetrics(): Promise<string>` que retorna `registry.metrics()`
- Expor método `getContentType(): string` que retorna `registry.contentType`

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;
  readonly httpRequestsTotal: Counter;
  readonly httpRequestDuration: Histogram;

  constructor() {
    this.registry = new Registry();

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  onModuleInit() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'api_gateway_',
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
```

### 6.2 HttpMetricsInterceptor (`src/metrics/http-metrics.interceptor.ts`)

Interceptor global que captura métricas de cada request HTTP.

**Requisitos:**

- Implementar `NestInterceptor`
- Capturar `method`, `route` e `status_code` de cada request
- Medir a duração da request em segundos
- Incrementar `http_requests_total` e observar `http_request_duration_seconds`
- **Excluir** o endpoint `/metrics` da contabilização (evitar loop de métricas do Prometheus)
- Usar `req.route?.path || req.url` para capturar o route pattern (ex: `/users/:id` em vez de `/users/123`)

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;

    if (url === '/metrics') {
      return next.handle();
    }

    const startTime = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          this.recordMetrics(req, context, startTime);
        },
        error: () => {
          this.recordMetrics(req, context, startTime);
        },
      }),
    );
  }

  private recordMetrics(
    req: any,
    context: ExecutionContext,
    startTime: bigint,
  ): void {
    const res = context.switchToHttp().getResponse();
    const route = req.route?.path || req.url;
    const method = req.method;
    const statusCode = res.statusCode?.toString() || '500';
    const duration =
      Number(process.hrtime.bigint() - startTime) / 1_000_000_000;

    const labels = { method, route, status_code: statusCode };
    this.metricsService.httpRequestsTotal.inc(labels);
    this.metricsService.httpRequestDuration.observe(labels, duration);
  }
}
```

### 6.3 MetricsController (`src/metrics/metrics.controller.ts`)

**Requisitos:**

- Rota `GET /metrics` que retorna métricas no formato Prometheus (text/plain)
- Usar `@SkipThrottle()` do `@nestjs/throttler` para bypass do rate limiting global
- **Não** precisa de `@Public()` porque o `api-gateway` não tem `JwtAuthGuard` global
- Definir `Content-Type` correto via `@Header()` ou `res.set()`

```typescript
import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    res.set('Content-Type', this.metricsService.getContentType());
    res.send(metrics);
  }
}
```

### 6.4 MetricsModule (`src/metrics/metrics.module.ts`)

**Requisitos:**

- Decorado com `@Global()` para que `MetricsService` esteja disponível em toda a aplicação
- Registrar `HttpMetricsInterceptor` como `APP_INTERCEPTOR` (interceptor global)
- Exportar `MetricsService`

```typescript
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
```

### 6.5 Registro no AppModule (`src/app.module.ts`)

Adicionar `MetricsModule` no array de `imports` do `AppModule`:

```typescript
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({/* ... */}),
    MetricsModule, // ← adicionar aqui
    ProxyModule,
    MiddlewareModule,
    AuthModule,
    // ... demais módulos
  ],
  // ...
})
export class AppModule implements NestModule {
  /* ... */
}
```

---

## 7. Métricas Expostas

| Métrica                           | Tipo      | Labels                           | Descrição                                                       |
| --------------------------------- | --------- | -------------------------------- | --------------------------------------------------------------- |
| `http_requests_total`             | Counter   | `method`, `route`, `status_code` | Total de requisições HTTP recebidas                             |
| `http_request_duration_seconds`   | Histogram | `method`, `route`, `status_code` | Duração das requisições HTTP em segundos                        |
| `api_gateway_*` (default metrics) | Vários    | —                                | Métricas padrão do Node.js (CPU, memória, event loop, GC, etc.) |

---

## 8. Decisões de Design

- **`@SkipThrottle()` em vez de `@Public()`**: o `api-gateway` não usa `JwtAuthGuard` global (JWT é por controller). O guard global é `CustomThrottlerGuard`, então usamos `@SkipThrottle()` para permitir scraping a cada 15s sem rate limiting.
- **Registry dedicado**: não usa o registry global do `prom-client` para evitar colisão entre módulos ou testes.
- **Prefix `api_gateway_`**: as métricas padrão do Node.js recebem prefix para diferenciação quando visualizadas no Prometheus junto com outros serviços.
- **Exclusão de `/metrics` do interceptor**: evita que o próprio scraping do Prometheus infle as métricas HTTP.
- **`process.hrtime.bigint()`**: alta resolução para medir duração com precisão de nanosegundos.

---

## 9. Critérios de Aceite

### CA-01: Dependência instalada

- `prom-client` deve estar listado em `api-gateway/package.json` nas `dependencies`.

### CA-02: Endpoint /metrics acessível

- `GET http://localhost:3005/metrics` deve retornar HTTP 200 com `Content-Type: text/plain` (ou `application/openmetrics-text`).
- O body deve conter métricas no formato Prometheus exposition format.

### CA-03: Sem autenticação ou rate limiting

- `GET /metrics` deve funcionar **sem** token JWT no header `Authorization`.
- `GET /metrics` **não** deve ser afetado pelo `CustomThrottlerGuard` (rate limiting).

### CA-04: Métricas HTTP registradas

- Após fazer requests a outros endpoints (ex: `GET /health`), executar `GET /metrics` deve retornar:
  - `http_requests_total` com labels `method="GET"`, `route="/health"`, `status_code="200"` com valor ≥ 1
  - `http_request_duration_seconds_bucket` com os mesmos labels

### CA-05: Endpoint /metrics excluído das métricas

- Após múltiplas chamadas a `GET /metrics`, a métrica `http_requests_total` **não** deve conter label `route="/metrics"`.

### CA-06: Métricas padrão do Node.js

- `GET /metrics` deve incluir métricas com prefix `api_gateway_` como:
  - `api_gateway_process_cpu_user_seconds_total`
  - `api_gateway_process_resident_memory_bytes`
  - `api_gateway_nodejs_eventloop_lag_seconds`

### CA-07: Target UP no Prometheus

- No Prometheus (`http://localhost:9090/targets`), o target `api-gateway` (`host.docker.internal:3005`) deve aparecer como **UP**.

---

## 10. Validação

```bash
# 1. Iniciar o api-gateway
cd api-gateway && npm run start:dev

# 2. Verificar se /metrics responde (sem token JWT)
curl -s http://localhost:3005/metrics | head -20

# 3. Fazer uma request normal
curl -s http://localhost:3005/health

# 4. Verificar se métricas HTTP foram registradas
curl -s http://localhost:3005/metrics | grep http_requests_total

# 5. Verificar que /metrics não aparece nas métricas
curl -s http://localhost:3005/metrics | grep 'route="/metrics"'
# (deve retornar vazio)

# 6. Verificar no Prometheus (stack de observabilidade rodando)
# Acessar http://localhost:9090/targets → api-gateway deve estar UP
```

---

## 11. Arquivos Impactados

| Arquivo                                               | Ação                               |
| ----------------------------------------------------- | ---------------------------------- |
| `api-gateway/package.json`                            | Alterar — adicionar `prom-client`  |
| `api-gateway/src/metrics/metrics.module.ts`           | Criar                              |
| `api-gateway/src/metrics/metrics.service.ts`          | Criar                              |
| `api-gateway/src/metrics/metrics.controller.ts`       | Criar                              |
| `api-gateway/src/metrics/http-metrics.interceptor.ts` | Criar                              |
| `api-gateway/src/app.module.ts`                       | Alterar — importar `MetricsModule` |
