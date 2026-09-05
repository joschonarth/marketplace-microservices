# SPEC: Health Checks Avançados com @nestjs/terminus — checkout-service

**Serviço:** checkout-service  
**Status:** Proposta  
**Autor:** Arquitetura  
**Data:** 2026-03-10

---

## 1. Visão Geral

Substituir o health check simplificado do `checkout-service` (`{ status: "ok" }`) por health checks reais usando `@nestjs/terminus`, que verificam a conectividade com o **PostgreSQL** (via `TypeOrmHealthIndicator`) e com o **RabbitMQ** (via health indicator customizado).

O `checkout-service` depende de duas infraestruturas críticas:

1. **PostgreSQL**: armazena carrinho e pedidos (entidades Cart, CartItem, Order)
2. **RabbitMQ**: publica eventos de pagamento (`payment.order`) e consome resultados (`payment.result`)

Se qualquer uma dessas dependências estiver indisponível, o serviço não consegue processar checkouts. O health check atual retorna `{ status: "ok" }` estático, mascarando essas falhas.

---

## 2. Escopo

### Incluso

- Instalação de `@nestjs/terminus` no `checkout-service`
- Criação de `HealthModule` com `HealthController` usando `TerminusModule`
- Verificação do PostgreSQL via `TypeOrmHealthIndicator`
- Verificação do RabbitMQ via health indicator customizado (usando a conexão existente do `RabbitmqService`)
- Endpoint `GET /health` público (bypass JWT via `@Public()`)
- Resposta HTTP 200 quando saudável, HTTP 503 quando não saudável

### Fora de escopo

- Readiness/liveness probes (conceito de Kubernetes)
- Alterações no `RabbitmqService` existente (apenas leitura do estado da conexão)
- Alterações em métricas ou dashboards existentes
- Notificações externas (Slack, email)

---

## 3. Contexto do Serviço

| Aspecto                | Detalhe                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **Porta**              | 3003                                                                                                   |
| **Guard global**       | `JwtAuthGuard` (APP_GUARD)                                                                             |
| **@Public()**          | Disponível em `src/auth/decorators/public.decorator.ts`                                                |
| **Banco de dados**     | PostgreSQL via TypeORM (`@nestjs/typeorm`)                                                             |
| **RabbitMQ**           | `amqplib` via `RabbitmqService` (exchange `payments`, routing keys `payment.order` e `payment.result`) |
| **Health check atual** | `GET /health` → `{ status: 'ok', service: 'checkout-service' }` (estático)                             |

### Conexão RabbitMQ existente

O `RabbitmqService` (`src/events/rabbitmq/rabbitmq.service.ts`) mantém uma conexão `amqplib` e expõe:

- `getConnection(): amqp.ChannelModel` — retorna a conexão (ou `undefined` se não conectado)
- `getChannel(): amqp.Channel` — retorna o canal (ou `undefined` se não conectado)

O health indicator customizado usará esses métodos para verificar se a conexão está ativa.

---

## 4. Dependências

Instalar no `checkout-service/`:

```bash
npm install @nestjs/terminus
```

> `@nestjs/typeorm` e `amqplib` já estão instalados.

---

## 5. Estrutura de Arquivos

```
checkout-service/
└── src/
    └── health/
        ├── health.module.ts                  ← novo
        ├── health.controller.ts              ← reescrever (usar @nestjs/terminus)
        └── rabbitmq.health-indicator.ts      ← novo (health indicator customizado)
```

---

## 6. Implementação

### 6.1 RabbitMQ Health Indicator (`src/health/rabbitmq.health-indicator.ts`)

Health indicator customizado que verifica a conexão RabbitMQ usando o `RabbitmqService` existente.

**Requisitos:**

- Estender `HealthIndicator` do `@nestjs/terminus`
- Injetar `RabbitmqService` para acessar o estado da conexão
- Verificar se `getConnection()` e `getChannel()` retornam objetos válidos
- Retornar `HealthIndicatorResult` com key `rabbitmq`

```typescript
import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { RabbitmqService } from '../events/rabbitmq/rabbitmq.service';

@Injectable()
export class RabbitMQHealthIndicator extends HealthIndicator {
  constructor(private readonly rabbitmqService: RabbitmqService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const connection = this.rabbitmqService.getConnection();
    const channel = this.rabbitmqService.getChannel();

    const isHealthy = !!connection && !!channel;

    const result = this.getStatus(key, isHealthy);

    if (isHealthy) {
      return result;
    }

    throw new HealthCheckError('RabbitMQ check failed', result);
  }
}
```

**Decisão — Por que não usar `MicroserviceHealthIndicator`:**

O `MicroserviceHealthIndicator` do terminus espera um transport layer do `@nestjs/microservices` (ex: `Transport.RMQ`). O `checkout-service` usa `amqplib` diretamente via `RabbitmqService`, sem o módulo `@nestjs/microservices`. Criar um health indicator customizado é a abordagem correta para verificar a conexão existente sem adicionar dependências desnecessárias.

### 6.2 HealthController (`src/health/health.controller.ts`)

Substituir o controller atual por um que verifica PostgreSQL e RabbitMQ.

```typescript
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { RabbitMQHealthIndicator } from './rabbitmq.health-indicator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private rabbitmq: RabbitMQHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.rabbitmq.isHealthy('rabbitmq'),
    ]);
  }
}
```

**Formato de resposta quando tudo saudável (HTTP 200):**

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "rabbitmq": { "status": "up" }
  },
  "error": {},
  "details": {
    "database": { "status": "up" },
    "rabbitmq": { "status": "up" }
  }
}
```

**Formato de resposta quando RabbitMQ está indisponível (HTTP 503):**

```json
{
  "status": "error",
  "info": {
    "database": { "status": "up" }
  },
  "error": {
    "rabbitmq": { "status": "down" }
  },
  "details": {
    "database": { "status": "up" },
    "rabbitmq": { "status": "down" }
  }
}
```

### 6.3 HealthModule (`src/health/health.module.ts`)

O módulo precisa importar `TerminusModule` e ter acesso ao `RabbitmqService` para injeção no health indicator.

```typescript
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RabbitMQHealthIndicator } from './rabbitmq.health-indicator';
import { RabbitmqService } from '../events/rabbitmq/rabbitmq.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RabbitMQHealthIndicator, RabbitmqService],
})
export class HealthModule {}
```

> **Nota:** Se `RabbitmqService` já estiver exportado por um módulo global ou pelo módulo de eventos, pode-se importar esse módulo em vez de re-declarar o provider. Verificar a estrutura de módulos na implementação.

### 6.4 Atualizar AppModule (`src/app.module.ts`)

Substituir o registro direto do `HealthController` no `AppModule` pelo `HealthModule`:

**Antes:**

```typescript
@Module({
  imports: [/* ... */],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
```

**Depois:**

```typescript
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    /* ... imports existentes ... */
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

---

## 7. Decisões de Design

- **Health indicator customizado para RabbitMQ**: o `checkout-service` usa `amqplib` diretamente (não `@nestjs/microservices`), então `MicroserviceHealthIndicator` não se aplica. O indicator customizado verifica a conexão e canal existentes sem criar nova conexão.
- **Verificação leve**: apenas checa se `connection` e `channel` existem (não nulos). Não tenta publicar mensagem de teste para evitar side effects no health check.
- **Dois health indicators independentes**: banco e RabbitMQ são verificados separadamente. Se apenas o RabbitMQ estiver down, o `details` mostra exatamente qual dependência falhou.
- **Graceful degradation**: o `RabbitmqService` existente já lida com RabbitMQ indisponível (loga warning e continua). O health check apenas reflete o estado real sem alterar o comportamento.

---

## 8. Critérios de Aceite

### CA-01: Dependência instalada

- `@nestjs/terminus` deve estar listado em `checkout-service/package.json` nas `dependencies`.

### CA-02: Endpoint /health retorna formato terminus com 2 dependências

- `GET http://localhost:3003/health` deve retornar HTTP 200 com body contendo `database` e `rabbitmq` em `info`/`details`.

### CA-03: Sem autenticação

- `GET /health` deve funcionar **sem** token JWT no header `Authorization`.

### CA-04: Verificação real do PostgreSQL

- Parar o PostgreSQL e chamar `GET /health` deve retornar HTTP 503 com `error.database.status: "down"`.
- Reiniciar o PostgreSQL deve restaurar `info.database.status: "up"`.

### CA-05: Verificação real do RabbitMQ

- Parar o RabbitMQ e reiniciar o `checkout-service` — `GET /health` deve retornar HTTP 503 com `error.rabbitmq.status: "down"`.
- Com RabbitMQ rodando e o serviço conectado — `GET /health` deve retornar `info.rabbitmq.status: "up"`.

### CA-06: Falha parcial reportada corretamente

- Se PostgreSQL está UP e RabbitMQ está DOWN, o response deve ter `status: "error"`, com `info.database.status: "up"` e `error.rabbitmq.status: "down"`.

### CA-07: HealthModule registrado

- O `HealthModule` deve estar importado no `AppModule`.
- O `HealthController` **não** deve estar listado diretamente no array `controllers` do `AppModule`.

---

## 9. Validação

```bash
# 1. Iniciar dependências (PostgreSQL + RabbitMQ)
cd messaging-service && docker-compose up -d

# 2. Iniciar o checkout-service
cd checkout-service && npm run start:dev

# 3. Verificar health check com tudo disponível
curl -s http://localhost:3003/health | jq .
# Esperado: { "status": "ok", "info": { "database": { "status": "up" }, "rabbitmq": { "status": "up" } }, ... }

# 4. Parar o RabbitMQ
docker stop <rabbitmq-container>

# 5. Reiniciar o checkout-service e verificar
curl -s http://localhost:3003/health | jq .
# Esperado: { "status": "error", "info": { "database": { "status": "up" } }, "error": { "rabbitmq": { "status": "down" } }, ... }

# 6. Verificar status code
curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/health
# Esperado: 503
```

---

## 10. Arquivos Impactados

| Arquivo                                                    | Ação                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `checkout-service/package.json`                            | Alterar — adicionar `@nestjs/terminus`                                       |
| `checkout-service/src/health/health.controller.ts`         | Reescrever — usar terminus com DB + RabbitMQ                                 |
| `checkout-service/src/health/health.module.ts`             | Criar                                                                        |
| `checkout-service/src/health/rabbitmq.health-indicator.ts` | Criar                                                                        |
| `checkout-service/src/app.module.ts`                       | Alterar — importar `HealthModule`, remover `HealthController` do controllers |
