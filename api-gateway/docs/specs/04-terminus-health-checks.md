# SPEC: Health Checks Avançados com @nestjs/terminus — api-gateway

**Serviço:** api-gateway  
**Status:** Proposta  
**Autor:** Arquitetura  
**Data:** 2026-03-10

---

## 1. Visão Geral

Migrar o health check do `api-gateway` para `@nestjs/terminus`, substituindo a implementação customizada atual (`HealthService` + `HealthCheckService` + `HealthCheckModule`) por uma abordagem padronizada com `HttpHealthIndicator` do terminus.

O `api-gateway` não tem banco de dados próprio nem RabbitMQ — sua função é rotear requests para os 4 serviços downstream. O health check deve verificar se cada serviço downstream está respondendo via HTTP, usando o `HttpHealthIndicator` do terminus (que internamente usa `@nestjs/axios`, já instalado no gateway).

### Situação atual

O gateway já possui um sistema de health check customizado com:

- `HealthController` (4 endpoints: `/health`, `/health/services`, `/health/services/:name`, `/health/ready`, `/health/live`)
- `HealthService` (status do gateway, readiness, liveness)
- `HealthCheckService` (verifica serviços downstream via HTTP com circuit breaker e cache)
- `HealthCheckModule` em `src/common/health/`

Esta implementação será **simplificada** para usar o terminus, que fornece o mesmo resultado (verificação HTTP dos serviços) com menos código e formato padronizado.

---

## 2. Escopo

### Incluso

- Instalação de `@nestjs/terminus` no `api-gateway`
- Reescrita do `HealthController` usando `TerminusModule` + `HttpHealthIndicator`
- Verificação dos 4 serviços downstream via `HttpHealthIndicator.pingCheck()`
- Endpoint `GET /health` com formato terminus padronizado
- Remoção dos arquivos de health check customizado (`HealthService`, `HealthCheckService`, `HealthCheckModule`)

### Fora de escopo

- Readiness/liveness probes (conceito de Kubernetes)
- Circuit breaker para health checks (já existe no `ProxyService` para requests de negócio)
- Alterações em métricas ou dashboards existentes
- Notificações externas (Slack, email)

---

## 3. Contexto do Serviço

| Aspecto                | Detalhe                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| **Porta**              | 3005                                                                  |
| **Guard global**       | `JwtAuthGuard` (APP_GUARD)                                            |
| **@nestjs/axios**      | Já instalado (usado pelo `ProxyService` e `HealthCheckService` atual) |
| **Banco de dados**     | Nenhum                                                                |
| **RabbitMQ**           | Nenhum                                                                |
| **Health check atual** | 5 endpoints customizados com circuit breaker e cache                  |

### Serviços downstream

| Serviço          | URL padrão              | Variável de ambiente   |
| ---------------- | ----------------------- | ---------------------- |
| users-service    | `http://localhost:3000` | `USERS_SERVICE_URL`    |
| products-service | `http://localhost:3001` | `PRODUCTS_SERVICE_URL` |
| checkout-service | `http://localhost:3003` | `CHECKOUT_SERVICE_URL` |
| payments-service | `http://localhost:3004` | `PAYMENTS_SERVICE_URL` |

Configuração em `src/config/gateway.config.ts` (usada pelo health check).

---

## 4. Dependências

Instalar no `api-gateway/`:

```bash
npm install @nestjs/terminus
```

> `@nestjs/axios` já está instalado — o `HttpHealthIndicator` do terminus o utiliza internamente.

---

## 5. Estrutura de Arquivos

### Arquivos a criar/reescrever

```
api-gateway/
└── src/
    └── health/
        ├── health.module.ts       ← reescrever (usar TerminusModule)
        └── health.controller.ts   ← reescrever (usar terminus)
```

### Arquivos a remover

```
api-gateway/
└── src/
    ├── health/
    │   └── health.service.ts          ← remover (liveness/readiness customizado)
    └── common/
        └── health/
            ├── health-check.service.ts    ← remover (verificação HTTP customizada)
            ├── health-check.module.ts     ← remover
            └── health-check.interface.ts  ← remover
```

---

## 6. Implementação

### 6.1 HealthController (`src/health/health.controller.ts`)

Substituir os 5 endpoints customizados por um único `GET /health` que verifica todos os serviços downstream via terminus.

**Requisitos:**

- Injetar `HealthCheckService` e `HttpHealthIndicator` do `@nestjs/terminus`
- Usar `serviceConfig` de `src/config/gateway.config.ts` para URLs dos serviços
- Verificar cada serviço com `HttpHealthIndicator.pingCheck(name, url + '/health')`
- Endpoint público (sem JWT) — usar decorator adequado para bypass do guard
- Responder HTTP 200 quando todos saudáveis, HTTP 503 quando algum falhar

```typescript
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { serviceConfig } from '../config/gateway.config';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () =>
        this.http.pingCheck(
          'users-service',
          `${serviceConfig.users.url}/health`,
        ),
      () =>
        this.http.pingCheck(
          'products-service',
          `${serviceConfig.products.url}/health`,
        ),
      () =>
        this.http.pingCheck(
          'checkout-service',
          `${serviceConfig.checkout.url}/health`,
        ),
      () =>
        this.http.pingCheck(
          'payments-service',
          `${serviceConfig.payments.url}/health`,
        ),
    ]);
  }
}
```

> **Nota sobre autenticação:** O `api-gateway` usa `JwtAuthGuard` como guard global. Se existir um decorator `@Public()` ou mecanismo equivalente, usá-lo no endpoint. Caso contrário, verificar como os endpoints atuais de `/health` faziam bypass do guard (possivelmente via `IS_PUBLIC_KEY` metadata).

**Formato de resposta quando tudo saudável (HTTP 200):**

```json
{
  "status": "ok",
  "info": {
    "users-service": { "status": "up" },
    "products-service": { "status": "up" },
    "checkout-service": { "status": "up" },
    "payments-service": { "status": "up" }
  },
  "error": {},
  "details": {
    "users-service": { "status": "up" },
    "products-service": { "status": "up" },
    "checkout-service": { "status": "up" },
    "payments-service": { "status": "up" }
  }
}
```

**Formato de resposta quando um serviço está down (HTTP 503):**

```json
{
  "status": "error",
  "info": {
    "users-service": { "status": "up" },
    "products-service": { "status": "up" },
    "checkout-service": { "status": "up" }
  },
  "error": {
    "payments-service": {
      "status": "down",
      "message": "connect ECONNREFUSED 127.0.0.1:3004"
    }
  },
  "details": {
    "users-service": { "status": "up" },
    "products-service": { "status": "up" },
    "checkout-service": { "status": "up" },
    "payments-service": {
      "status": "down",
      "message": "connect ECONNREFUSED 127.0.0.1:3004"
    }
  }
}
```

### 6.2 HealthModule (`src/health/health.module.ts`)

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

> `HttpModule` é necessário para que o `HttpHealthIndicator` funcione (fornece `HttpService` do axios).

### 6.3 Atualizar AppModule (`src/app.module.ts`)

- Importar o novo `HealthModule`
- Remover referências ao `HealthController`, `HealthService`, `HealthCheckModule` antigos

**Depois:**

```typescript
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    MetricsModule,
    AuthModule,
    ProxyModule,
    UsersModule,
    ProductsModule,
    CheckoutModule,
    PaymentsModule,
    HealthModule, // ← novo, substitui HealthCheckModule e registro direto
  ],
  controllers: [AppController],
  providers: [AppService /* guards existentes */],
})
export class AppModule {}
```

### 6.4 Remover arquivos de health check customizado

Após a migração, remover os seguintes arquivos que não são mais necessários:

| Arquivo                                       | Motivo da remoção                      |
| --------------------------------------------- | -------------------------------------- |
| `src/health/health.service.ts`                | Substituído pelo terminus              |
| `src/common/health/health-check.service.ts`   | Substituído pelo `HttpHealthIndicator` |
| `src/common/health/health-check.module.ts`    | Substituído pelo `HealthModule`        |
| `src/common/health/health-check.interface.ts` | Tipos do terminus são suficientes      |

---

## 7. Decisões de Design

- **`HttpHealthIndicator.pingCheck()`**: faz um `GET` para a URL especificada e verifica se retorna 2xx. Simples, sem circuit breaker ou cache — essas preocupações são tratadas no nível de proxy de negócio.
- **Simplificação de 5→1 endpoint**: os endpoints `/health/services`, `/health/services/:name`, `/health/ready` e `/health/live` são removidos. O endpoint único `GET /health` fornece toda a informação necessária (quais serviços estão up/down) em formato padronizado.
- **Sem circuit breaker no health check**: o circuit breaker existente (`CircuitBreakerService`) é para requests de negócio (proxy). O terminus tem timeout interno (1000ms default) — se um serviço não responder em 1s, é reportado como down. Isso é suficiente para health checks.
- **Sem cache no health check**: health checks devem refletir o estado real no momento da consulta. Cache pode mascarar a recuperação de um serviço.
- **`HttpModule` no `HealthModule`**: o `HttpHealthIndicator` precisa do `HttpService` do `@nestjs/axios`. Importar `HttpModule` localmente no `HealthModule` isola a dependência.

---

## 8. Critérios de Aceite

### CA-01: Dependência instalada

- `@nestjs/terminus` deve estar listado em `api-gateway/package.json` nas `dependencies`.

### CA-02: Endpoint /health retorna formato terminus com 4 serviços

- `GET http://localhost:3005/health` deve retornar HTTP 200 com body contendo os 4 serviços (`users-service`, `products-service`, `checkout-service`, `payments-service`) em `info`/`details`.

### CA-03: Sem autenticação

- `GET /health` deve funcionar **sem** token JWT no header `Authorization`.

### CA-04: Verificação real dos serviços downstream

- Com todos os 4 serviços rodando: `GET /health` retorna HTTP 200, `status: "ok"`, todos com `status: "up"`.
- Parar um serviço (ex: `payments-service`): `GET /health` retorna HTTP 503, `status: "error"`, com o serviço parado em `error` e os demais em `info`.

### CA-05: Falha parcial reportada corretamente

- Se 3 serviços estão UP e 1 está DOWN, o response deve indicar claramente qual serviço falhou no campo `error` e quais estão saudáveis no campo `info`.

### CA-06: Arquivos customizados removidos

- Os arquivos `health.service.ts`, `health-check.service.ts`, `health-check.module.ts` e `health-check.interface.ts` devem ser removidos.
- Nenhuma referência a esses arquivos deve existir no código.

### CA-07: Endpoints antigos removidos

- Os endpoints `/health/services`, `/health/services/:name`, `/health/ready` e `/health/live` **não** devem mais existir (retornar 404).

---

## 9. Validação

```bash
# 1. Iniciar todos os 4 serviços downstream
cd users-service && npm run start:dev &
cd products-service && npm run start:dev &
cd checkout-service && npm run start:dev &
cd payments-service && npm run start:dev &

# 2. Iniciar o api-gateway
cd api-gateway && npm run start:dev

# 3. Verificar health check com todos os serviços UP
curl -s http://localhost:3005/health | jq .
# Esperado: { "status": "ok", "info": { "users-service": ..., "products-service": ..., ... } }

# 4. Parar um serviço downstream
kill <pid-payments-service>

# 5. Verificar health check com serviço DOWN
curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/health
# Esperado: 503

curl -s http://localhost:3005/health | jq .
# Esperado: { "status": "error", ..., "error": { "payments-service": { "status": "down", ... } } }

# 6. Verificar que endpoints antigos foram removidos
curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/health/services
# Esperado: 404

curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/health/ready
# Esperado: 404
```

---

## 10. Arquivos Impactados

| Arquivo                                                   | Ação                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `api-gateway/package.json`                                | Alterar — adicionar `@nestjs/terminus`                                                   |
| `api-gateway/src/health/health.controller.ts`             | Reescrever — usar terminus com HttpHealthIndicator                                       |
| `api-gateway/src/health/health.module.ts`                 | Reescrever — usar TerminusModule + HttpModule                                            |
| `api-gateway/src/health/health.service.ts`                | Remover                                                                                  |
| `api-gateway/src/common/health/health-check.service.ts`   | Remover                                                                                  |
| `api-gateway/src/common/health/health-check.module.ts`    | Remover                                                                                  |
| `api-gateway/src/common/health/health-check.interface.ts` | Remover                                                                                  |
| `api-gateway/src/app.module.ts`                           | Alterar — importar novo `HealthModule`, remover `HealthCheckModule` e `HealthController` |
