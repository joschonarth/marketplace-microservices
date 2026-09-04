# SPEC: Dashboards Grafana e Métricas de Negócio

**Serviço:** observability-stack, payments-service, checkout-service  
**Status:** Proposta  
**Autor:** Arquitetura  
**Data:** 2026-03-05  
**Depende de:** [01-prometheus-grafana-stack](./01-prometheus-grafana-stack.md)

---

## 1. Visão Geral

Adicionar **métricas de negócio customizadas** aos serviços `payments-service` e `checkout-service`, e criar **dois dashboards provisionados** no Grafana para visibilidade operacional e de negócio do marketplace-ms.

Os dashboards serão versionados como JSON no repositório e provisionados automaticamente via Grafana provisioning, eliminando configuração manual.

> **Fora de escopo:** alerting (próxima spec), métricas de banco de dados, RabbitMQ exporter, alterações no Docker Compose ou Prometheus.

---

## 2. Escopo

### Incluso

- Métricas de negócio customizadas no `payments-service` (pagamentos processados, aprovados, rejeitados)
- Métricas de negócio customizadas no `checkout-service` (pedidos criados, mensagens publicadas)
- Dashboard "Marketplace Overview" (visão geral de todos os serviços)
- Dashboard "Service Details" (visão detalhada com variável `$service`)
- Provisioning automático dos dashboards via JSON
- Tabela de referência PromQL

### Fora de escopo

- Configuração de alerting (Alertmanager, Grafana alerts) — spec futura
- RabbitMQ exporter ou métricas de infraestrutura de mensageria
- Métricas de banco de dados (TypeORM, PostgreSQL/SQLite)
- Alterações no `docker-compose.yml` do observability-stack
- Alterações no `prometheus.yml`
- Dashboards de outros serviços (users, products, api-gateway) — usam apenas métricas HTTP existentes

---

## 3. Métricas de Negócio Customizadas

### 3.1 payments-service

Adicionar três Counters ao `MetricsService` do `payments-service`, registrados no mesmo `Registry` existente:

| Métrica                    | Tipo    | Labels   | Descrição                                                |
| -------------------------- | ------- | -------- | -------------------------------------------------------- |
| `payments_processed_total` | Counter | —        | Total de pagamentos processados (aprovados + rejeitados) |
| `payments_approved_total`  | Counter | —        | Total de pagamentos aprovados                            |
| `payments_rejected_total`  | Counter | `reason` | Total de pagamentos rejeitados, com motivo da rejeição   |

**Valores do label `reason`:**

| Valor            | Origem              |
| ---------------- | ------------------- |
| `limit_exceeded` | `amount > 10000`    |
| `card_declined`  | Decimal part `0.99` |

#### Arquivo impactado: `payments-service/src/metrics/metrics.service.ts`

Adicionar as três métricas como propriedades `readonly` da classe, registradas no `this.registry` existente:

```typescript
readonly paymentsProcessedTotal: Counter;
readonly paymentsApprovedTotal: Counter;
readonly paymentsRejectedTotal: Counter;

// No constructor, após as métricas HTTP existentes:
this.paymentsProcessedTotal = new Counter({
  name: 'payments_processed_total',
  help: 'Total number of payments processed',
  registers: [this.registry],
});

this.paymentsApprovedTotal = new Counter({
  name: 'payments_approved_total',
  help: 'Total number of approved payments',
  registers: [this.registry],
});

this.paymentsRejectedTotal = new Counter({
  name: 'payments_rejected_total',
  help: 'Total number of rejected payments',
  labelNames: ['reason'],
  registers: [this.registry],
});
```

#### Arquivo impactado: `payments-service/src/payments/payments.service.ts`

Injetar `MetricsService` e incrementar os contadores no método `processPayment()`, após determinar o status do pagamento:

```typescript
constructor(
  // ... dependências existentes
  private readonly metricsService: MetricsService,
) {}

async processPayment(data: PaymentOrderMessage): Promise<Payment> {
  // ... lógica existente de criar payment e chamar gateway ...

  this.metricsService.paymentsProcessedTotal.inc();

  if (payment.status === PaymentStatus.APPROVED) {
    this.metricsService.paymentsApprovedTotal.inc();
  } else {
    this.metricsService.paymentsRejectedTotal.inc({
      reason: this.normalizeRejectionReason(gatewayResult.rejectionReason),
    });
  }

  // ... lógica existente de salvar e retornar ...
}
```

O método `normalizeRejectionReason` converte a string legível do gateway no valor de label padronizado:

```typescript
private normalizeRejectionReason(reason?: string): string {
  if (reason?.includes('Limite')) return 'limit_exceeded';
  if (reason?.includes('Cartão') || reason?.includes('operadora')) return 'card_declined';
  return 'unknown';
}
```

### 3.2 checkout-service

Adicionar dois Counters ao `MetricsService` do `checkout-service`:

| Métrica                             | Tipo    | Labels  | Descrição                                 |
| ----------------------------------- | ------- | ------- | ----------------------------------------- |
| `orders_created_total`              | Counter | —       | Total de pedidos criados via checkout     |
| `rabbitmq_messages_published_total` | Counter | `queue` | Total de mensagens publicadas no RabbitMQ |

**Valores do label `queue`:**

| Valor           | Origem                                                            |
| --------------- | ----------------------------------------------------------------- |
| `payment_order` | Publicação em `payments` exchange com routing key `payment.order` |

#### Arquivo impactado: `checkout-service/src/metrics/metrics.service.ts`

```typescript
readonly ordersCreatedTotal: Counter;
readonly rabbitmqMessagesPublishedTotal: Counter;

// No constructor:
this.ordersCreatedTotal = new Counter({
  name: 'orders_created_total',
  help: 'Total number of orders created',
  registers: [this.registry],
});

this.rabbitmqMessagesPublishedTotal = new Counter({
  name: 'rabbitmq_messages_published_total',
  help: 'Total number of messages published to RabbitMQ',
  labelNames: ['queue'],
  registers: [this.registry],
});
```

#### Arquivo impactado: `checkout-service/src/orders/orders.service.ts`

Injetar `MetricsService` e incrementar após a criação do pedido:

```typescript
constructor(
  // ... dependências existentes
  private readonly metricsService: MetricsService,
) {}

async checkout(userId: number, dto: CheckoutDto): Promise<Order> {
  // ... lógica existente de criar order e salvar ...

  this.metricsService.ordersCreatedTotal.inc();

  // ... lógica existente de publicar no RabbitMQ ...
}
```

#### Arquivo impactado: `checkout-service/src/events/payment-queue/payment-queue.service.ts`

Incrementar o contador de mensagens publicadas ao publicar no RabbitMQ:

```typescript
constructor(
  // ... dependências existentes
  private readonly metricsService: MetricsService,
) {}

async publishPaymentOrder(message: PaymentOrderMessage): Promise<void> {
  // ... lógica existente de publish ...

  this.metricsService.rabbitmqMessagesPublishedTotal.inc({ queue: 'payment_order' });
}
```

> **Nota:** O `MetricsModule` já é `@Global()` em ambos os serviços, portanto o `MetricsService` está disponível para injeção em qualquer módulo sem necessidade de importação adicional.

---

## 4. Provisioning de Dashboards

### 4.1 Configuração do provider

Criar o arquivo de configuração do provider de dashboards do Grafana.

#### Arquivo: `observability-stack/grafana/provisioning/dashboards/dashboards.yml`

```yaml
apiVersion: 1

providers:
  - name: "marketplace-dashboards"
    orgId: 1
    folder: "Marketplace"
    type: file
    disableDeletion: false
    editable: true
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: false
```

### 4.2 Volume mapping

Adicionar o mapeamento de volume para dashboards no `docker-compose.yml` **não é necessário** — o volume existente `./grafana/provisioning:/etc/grafana/provisioning:ro` já mapeia toda a pasta `provisioning/`, incluindo subpastas criadas.

### 4.3 Arquivos de dashboard

Os dashboards serão exportados como JSON e salvos em:

```
observability-stack/grafana/provisioning/dashboards/
├── dashboards.yml                  ← provider config
├── marketplace-overview.json       ← Dashboard "Marketplace Overview"
└── service-details.json            ← Dashboard "Service Details"
```

---

## 5. Dashboard: Marketplace Overview

**UID:** `marketplace-overview`  
**Refresh:** 30s  
**Período padrão:** Last 1 hour

Visão panorâmica de saúde e performance de todos os serviços do marketplace.

### 5.1 Layout dos painéis

```
┌─────────────────────────────────────────────────────────────────────┐
│ Row: Service Health                                                 │
├───────────┬───────────┬───────────┬───────────┬─────────────────────┤
│ users     │ products  │ checkout  │ payments  │ api-gateway         │
│ UP/DOWN   │ UP/DOWN   │ UP/DOWN   │ UP/DOWN   │ UP/DOWN             │
│ (stat)    │ (stat)    │ (stat)    │ (stat)    │ (stat)              │
├───────────┴───────────┴───────────┴───────────┴─────────────────────┤
│ Row: Throughput & Errors                                            │
├─────────────────────────────────┬───────────────────────────────────┤
│ Throughput por serviço          │ Taxa de erros por serviço         │
│ (time series, req/s)            │ (time series, %)                  │
├─────────────────────────────────┴───────────────────────────────────┤
│ Row: Latency & Resources                                            │
├─────────────────────────────────┬───────────────────────────────────┤
│ Latência P95 por serviço        │ Uso de memória por serviço        │
│ (time series, seconds)          │ (time series, MB)                 │
├─────────────────────────────────┴───────────────────────────────────┤
│ Row: Business Metrics                                               │
├──────────────┬──────────────┬──────────────┬────────────────────────┤
│ Total        │ Pagamentos   │ Pagamentos   │ Taxa de aprovação      │
│ Pedidos      │ Aprovados    │ Rejeitados   │ (%)                    │
│ (stat)       │ (stat)       │ (stat)       │ (gauge)                │
├──────────────┴──────────────┴──────────────┴────────────────────────┤
│ Row: Business Trends                                                │
├─────────────────────────────────┬───────────────────────────────────┤
│ Pedidos e pagamentos ao longo   │ Rejeições por motivo              │
│ do tempo (time series)          │ (time series, stacked)            │
└─────────────────────────────────┴───────────────────────────────────┘
```

### 5.2 Painéis e queries PromQL

#### Row: Service Health

| Painel                    | Tipo | Query PromQL                 |
| ------------------------- | ---- | ---------------------------- |
| Status `users-service`    | Stat | `up{job="users-service"}`    |
| Status `products-service` | Stat | `up{job="products-service"}` |
| Status `checkout-service` | Stat | `up{job="checkout-service"}` |
| Status `payments-service` | Stat | `up{job="payments-service"}` |
| Status `api-gateway`      | Stat | `up{job="api-gateway"}`      |

**Configuração dos Stat panels:**

- Value mappings: `1` → "UP" (verde), `0` → "DOWN" (vermelho)
- Thresholds: `0` = vermelho, `1` = verde
- No graph (sparkline off)

#### Row: Throughput & Errors

| Painel                 | Tipo        | Query PromQL                                                                                                             |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Throughput por serviço | Time series | `sum(rate(http_requests_total[5m])) by (job)`                                                                            |
| Taxa de erros (%)      | Time series | `sum(rate(http_requests_total{status_code=~"[45].."}[5m])) by (job) / sum(rate(http_requests_total[5m])) by (job) * 100` |

**Configuração:**

- Throughput: unidade `reqps`, legend `{{job}}`
- Erros: unidade `percent (0-100)`, legend `{{job}}`, thresholds line em 1% (warning) e 5% (critical)

#### Row: Latency & Resources

| Painel        | Tipo        | Query PromQL                                                                                 |
| ------------- | ----------- | -------------------------------------------------------------------------------------------- |
| Latência P95  | Time series | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job))` |
| Memória (RSS) | Time series | `process_resident_memory_bytes{job=~".+"}`                                                   |

**Configuração:**

- Latência: unidade `seconds`, legend `{{job}}`
- Memória: unidade `bytes(SI)`, legend `{{job}}`

> **Nota sobre memória:** a métrica `process_resident_memory_bytes` vem do `collectDefaultMetrics` do prom-client. Cada serviço usa um prefixo diferente (ex: `payments_service_process_resident_memory_bytes`), mas o Prometheus adiciona o label `job` a todas as métricas. Para um painel unificado, usar queries individuais ou regex:
> `{__name__=~".+_process_resident_memory_bytes"}`
> Alternativa mais simples — 5 queries nomeadas, uma por serviço:
>
> - `payments_service_process_resident_memory_bytes` (legend: payments-service)
> - `checkout_service_process_resident_memory_bytes` (legend: checkout-service)
> - `users_service_process_resident_memory_bytes` (legend: users-service)
> - `products_service_process_resident_memory_bytes` (legend: products-service)
> - `api_gateway_process_resident_memory_bytes` (legend: api-gateway)

#### Row: Business Metrics (Stats)

| Painel                | Tipo  | Query PromQL                                               |
| --------------------- | ----- | ---------------------------------------------------------- |
| Total Pedidos         | Stat  | `orders_created_total{job="checkout-service"}`             |
| Pagamentos Aprovados  | Stat  | `payments_approved_total{job="payments-service"}`          |
| Pagamentos Rejeitados | Stat  | `payments_rejected_total{job="payments-service"}`          |
| Taxa de Aprovação (%) | Gauge | `payments_approved_total / payments_processed_total * 100` |

**Configuração:**

- Stats: color mode = background, graph mode = area
- Gauge: min=0, max=100, thresholds: <80% vermelho, <95% amarelo, >=95% verde

#### Row: Business Trends

| Painel                       | Tipo                  | Query PromQL                                                                                                                                                                                                      |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pedidos e pagamentos / tempo | Time series           | Query A: `rate(orders_created_total{job="checkout-service"}[5m])`<br>Query B: `rate(payments_approved_total{job="payments-service"}[5m])`<br>Query C: `rate(payments_rejected_total{job="payments-service"}[5m])` |
| Rejeições por motivo         | Time series (stacked) | `rate(payments_rejected_total{job="payments-service"}[5m]) by (reason)`                                                                                                                                           |

---

## 6. Dashboard: Service Details

**UID:** `service-details`  
**Refresh:** 30s  
**Período padrão:** Last 1 hour

Dashboard detalhado de um serviço individual, com variável template `$service`.

### 6.1 Variável template

| Nome      | Tipo  | Query                   | Multi | Include All |
| --------- | ----- | ----------------------- | ----- | ----------- |
| `service` | Query | `label_values(up, job)` | Não   | Não         |

Default: `api-gateway`

### 6.2 Layout dos painéis

```
┌──────────────────────────────────────────────────────────────────────┐
│ Row: RED Overview                                                    │
├──────────────────┬──────────────────┬────────────────────────────────┤
│ Request Rate     │ Error Rate       │ Duration P95                   │
│ (stat, instant)  │ (stat, %)        │ (stat, seconds)                │
├──────────────────┴──────────────────┴────────────────────────────────┤
│ Row: RED Method por Rota                                             │
├──────────────────┬──────────────────┬────────────────────────────────┤
│ Rate por rota    │ Errors por rota  │ Duration P50/P95/P99           │
│ (time series)    │ (time series)    │ (time series)                  │
├──────────────────┴──────────────────┴────────────────────────────────┤
│ Row: Traffic Analysis                                                │
├──────────────────────────────────┬───────────────────────────────────┤
│ Top rotas por volume             │ Distribuição de status codes      │
│ (tabela)                         │ (pie chart)                       │
├──────────────────────────────────┴───────────────────────────────────┤
│ Row: Process Resources                                               │
├────────────────┬────────────────┬────────────────┬───────────────────┤
│ CPU Usage      │ Memory RSS     │ Event Loop Lag │ Active Handles    │
│ (time series)  │ (time series)  │ (time series)  │ (time series)     │
└────────────────┴────────────────┴────────────────┴───────────────────┘
```

### 6.3 Painéis e queries PromQL

#### Row: RED Overview

| Painel       | Tipo | Query PromQL                                                                                                                           |
| ------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Request Rate | Stat | `sum(rate(http_requests_total{job="$service"}[5m]))`                                                                                   |
| Error Rate   | Stat | `sum(rate(http_requests_total{job="$service", status_code=~"[45].."}[5m])) / sum(rate(http_requests_total{job="$service"}[5m])) * 100` |
| Duration P95 | Stat | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="$service"}[5m])) by (le))`                                |

**Configuração:**

- Request Rate: unidade `reqps`, decimals=2
- Error Rate: unidade `percent (0-100)`, thresholds: <1% verde, <5% amarelo, >=5% vermelho
- Duration P95: unidade `seconds`, thresholds: <0.5s verde, <1s amarelo, >=1s vermelho

#### Row: RED Method por Rota

| Painel               | Tipo        | Query PromQL                                                                                                                                                                                        |
| -------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate por rota        | Time series | `sum(rate(http_requests_total{job="$service"}[5m])) by (method, route)`                                                                                                                             |
| Errors por rota      | Time series | `sum(rate(http_requests_total{job="$service", status_code=~"[45].."}[5m])) by (method, route)`                                                                                                      |
| Duration P50/P95/P99 | Time series | P50: `histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket{job="$service"}[5m])) by (le, route))`<br>P95: `histogram_quantile(0.95, ...)`<br>P99: `histogram_quantile(0.99, ...)` |

**Configuração:**

- Legend: `{{method}} {{route}}`
- Duration: três queries (P50, P95, P99) com legend override `P50 {{route}}`, etc.

#### Row: Traffic Analysis

| Painel               | Tipo      | Query PromQL                                                                                |
| -------------------- | --------- | ------------------------------------------------------------------------------------------- |
| Top rotas por volume | Table     | `topk(10, sum(increase(http_requests_total{job="$service"}[$__range])) by (method, route))` |
| Status codes         | Pie chart | `sum(increase(http_requests_total{job="$service"}[$__range])) by (status_code)`             |

**Configuração — Tabela:**

- Transformações: Instant query, format=table
- Colunas: Method, Route, Value (renomear para "Requests")
- Ordenação: Value desc

**Configuração — Pie chart:**

- Legend: `{{status_code}}`
- Value mappings de cores: 2xx=verde, 3xx=azul, 4xx=amarelo, 5xx=vermelho

#### Row: Process Resources

As métricas de processo usam o prefixo específico de cada serviço. A query deve mapear o `$service` para o prefixo correto usando uma variável auxiliar ou queries condicionais.

**Variável auxiliar `$prefix`:**

| Nome     | Tipo   | Custom values                                                                                                                                                                  |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prefix` | Custom | `users_service_ : users-service, products_service_ : products-service, checkout_service_ : checkout-service, payments_service_ : payments-service, api_gateway_ : api-gateway` |

Relação: quando `$service` = `checkout-service`, `$prefix` = `checkout_service_`.

**Implementação alternativa (recomendada):** usar queries com `{job="$service"}` e o nome completo da métrica com regex, já que o label `job` está presente em todas as métricas coletadas pelo Prometheus:

| Painel            | Tipo        | Query PromQL                                                           |
| ----------------- | ----------- | ---------------------------------------------------------------------- |
| CPU (user+system) | Time series | `rate({__name__=~".+_process_cpu_seconds_total", job="$service"}[5m])` |
| Memory RSS        | Time series | `{__name__=~".+_process_resident_memory_bytes", job="$service"}`       |
| Event Loop Lag    | Time series | `{__name__=~".+_nodejs_eventloop_lag_seconds", job="$service"}`        |
| Active Handles    | Time series | `{__name__=~".+_nodejs_active_handles_total", job="$service"}`         |

**Configuração:**

- CPU: unidade `seconds`, title "CPU Usage (rate)"
- Memory: unidade `bytes(SI)`
- Event Loop Lag: unidade `seconds`
- Active Handles: unidade `short`

---

## 7. Referência de Queries PromQL

Tabela consolidada das queries mais importantes para uso em dashboards, exploração no Prometheus e futuro alerting.

### 7.1 Saúde e disponibilidade

| Descrição                              | Query PromQL                                        |
| -------------------------------------- | --------------------------------------------------- |
| Status UP/DOWN de um serviço           | `up{job="<service>"}`                               |
| Todos os serviços DOWN                 | `up == 0`                                           |
| Tempo desde último scrape bem-sucedido | `time() - scrape_duration_seconds{job="<service>"}` |

### 7.2 Throughput (Rate)

| Descrição                           | Query PromQL                                                            |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Request rate geral (req/s)          | `sum(rate(http_requests_total[5m]))`                                    |
| Request rate por serviço            | `sum(rate(http_requests_total[5m])) by (job)`                           |
| Request rate por rota de um serviço | `sum(rate(http_requests_total{job="$service"}[5m])) by (method, route)` |
| Top 5 rotas mais acessadas          | `topk(5, sum(rate(http_requests_total[5m])) by (job, route))`           |

### 7.3 Erros (Errors)

| Descrição                    | Query PromQL                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Taxa de erro global (%)      | `sum(rate(http_requests_total{status_code=~"[45].."}[5m])) / sum(rate(http_requests_total[5m])) * 100`                   |
| Taxa de erro por serviço (%) | `sum(rate(http_requests_total{status_code=~"[45].."}[5m])) by (job) / sum(rate(http_requests_total[5m])) by (job) * 100` |
| Apenas erros 5xx por serviço | `sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (job)`                                                        |
| Erros por rota de um serviço | `sum(rate(http_requests_total{job="$service", status_code=~"[45].."}[5m])) by (route, status_code)`                      |

### 7.4 Latência (Duration)

| Descrição                  | Query PromQL                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P50 global                 | `histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))`                                   |
| P95 por serviço            | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job))`                              |
| P99 por rota de um serviço | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="$service"}[5m])) by (le, route))`            |
| Latência média por serviço | `sum(rate(http_request_duration_seconds_sum[5m])) by (job) / sum(rate(http_request_duration_seconds_count[5m])) by (job)` |

### 7.5 Recursos do processo

| Descrição               | Query PromQL                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Memória RSS por serviço | `{__name__=~".+_process_resident_memory_bytes"}`                                                  |
| CPU rate por serviço    | `rate({__name__=~".+_process_cpu_seconds_total"}[5m])`                                            |
| Event loop lag          | `{__name__=~".+_nodejs_eventloop_lag_seconds"}`                                                   |
| Heap usado vs total     | `{__name__=~".+_nodejs_heap_size_used_bytes"}` vs `{__name__=~".+_nodejs_heap_size_total_bytes"}` |

### 7.6 Métricas de negócio

| Descrição                        | Query PromQL                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Total de pedidos criados         | `orders_created_total{job="checkout-service"}`                                   |
| Rate de pedidos / segundo        | `rate(orders_created_total{job="checkout-service"}[5m])`                         |
| Total de pagamentos processados  | `payments_processed_total{job="payments-service"}`                               |
| Total de pagamentos aprovados    | `payments_approved_total{job="payments-service"}`                                |
| Total de pagamentos rejeitados   | `payments_rejected_total{job="payments-service"}`                                |
| Rejeições por motivo             | `payments_rejected_total{job="payments-service"} by (reason)`                    |
| Taxa de aprovação (%)            | `payments_approved_total / payments_processed_total * 100`                       |
| Rate de aprovações / segundo     | `rate(payments_approved_total{job="payments-service"}[5m])`                      |
| Mensagens publicadas no RabbitMQ | `rabbitmq_messages_published_total{job="checkout-service"}`                      |
| Rate de publicação por fila      | `rate(rabbitmq_messages_published_total{job="checkout-service"}[5m]) by (queue)` |

---

## 8. Estrutura de Pastas (resultado final)

```
observability-stack/
├── docker-compose.yml                            (sem alteração)
├── README.md                                     (sem alteração)
├── prometheus/
│   └── prometheus.yml                            (sem alteração)
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── datasource.yml                    (sem alteração)
│       └── dashboards/                           ← NOVO
│           ├── dashboards.yml                    ← provider config
│           ├── marketplace-overview.json          ← dashboard JSON
│           └── service-details.json               ← dashboard JSON
└── docs/
    └── specs/
        ├── 01-prometheus-grafana-stack.md
        └── 02-dashboards-metricas-negocio.md     ← esta spec

payments-service/
└── src/
    ├── metrics/
    │   └── metrics.service.ts                    (modificar — adicionar 3 counters)
    └── payments/
        └── payments.service.ts                   (modificar — incrementar counters)

checkout-service/
└── src/
    ├── metrics/
    │   └── metrics.service.ts                    (modificar — adicionar 2 counters)
    ├── orders/
    │   └── orders.service.ts                     (modificar — incrementar counter)
    └── events/
        └── payment-queue/
            └── payment-queue.service.ts          (modificar — incrementar counter)
```

---

## 9. Critérios de Aceite

### Métricas de Negócio

#### CA-01: Métricas do payments-service expostas

- O endpoint `GET http://localhost:3004/metrics` deve retornar as métricas `payments_processed_total`, `payments_approved_total` e `payments_rejected_total`.
- Após processar um pagamento aprovado, `payments_processed_total` e `payments_approved_total` devem incrementar em 1.
- Após processar um pagamento rejeitado, `payments_processed_total` e `payments_rejected_total{reason="..."}` devem incrementar em 1.

#### CA-02: Labels de rejeição corretos

- Pagamento rejeitado por limite: label `reason="limit_exceeded"`.
- Pagamento rejeitado por cartão: label `reason="card_declined"`.

#### CA-03: Métricas do checkout-service expostas

- O endpoint `GET http://localhost:3003/metrics` deve retornar as métricas `orders_created_total` e `rabbitmq_messages_published_total`.
- Após um checkout bem-sucedido, `orders_created_total` deve incrementar em 1.
- Após publicar mensagem no RabbitMQ, `rabbitmq_messages_published_total{queue="payment_order"}` deve incrementar em 1.

#### CA-04: Métricas coletadas pelo Prometheus

- No Prometheus (`http://localhost:9090`), as queries `payments_processed_total`, `payments_approved_total`, `payments_rejected_total`, `orders_created_total` e `rabbitmq_messages_published_total` devem retornar resultados.

#### CA-05: Métricas HTTP não afetadas

- As métricas existentes `http_requests_total` e `http_request_duration_seconds` devem continuar funcionando sem alteração.
- Os endpoints `/metrics` devem continuar retornando métricas padrão do Node.js.

### Dashboard Marketplace Overview

#### CA-06: Dashboard provisionado automaticamente

- Ao subir a stack (`docker-compose up -d`), o dashboard "Marketplace Overview" deve aparecer automaticamente no Grafana em `http://localhost:3010`, dentro da pasta "Marketplace".
- Nenhuma configuração manual deve ser necessária.

#### CA-07: Painéis de status UP/DOWN

- Com todos os serviços rodando, os 5 Stat panels devem exibir "UP" em verde.
- Ao parar um serviço, o Stat panel correspondente deve exibir "DOWN" em vermelho (após ~30s).

#### CA-08: Painel de throughput

- O painel de throughput deve exibir linhas separadas para cada serviço com rate de requests por segundo.
- Ao fazer requisições a um serviço, a linha correspondente deve subir.

#### CA-09: Painel de taxa de erros

- Requisições com status 4xx/5xx devem aparecer como taxa de erro percentual.
- Com zero erros, o painel deve mostrar 0% ou "No data".

#### CA-10: Painel de latência P95

- O painel deve exibir o percentil 95 de latência por serviço.
- Os valores devem ser coerentes (ex: < 10s para operações normais).

#### CA-11: Painéis de métricas de negócio

- O Stat "Total Pedidos" deve refletir o valor de `orders_created_total`.
- Os Stats de pagamentos devem refletir `payments_approved_total` e `payments_rejected_total`.
- O Gauge de taxa de aprovação deve mostrar um percentual entre 0-100%.

### Dashboard Service Details

#### CA-12: Dashboard provisionado com variável

- O dashboard "Service Details" deve aparecer automaticamente na pasta "Marketplace".
- A variável `$service` deve listar todos os 5 serviços no dropdown.
- Ao trocar o valor da variável, todos os painéis devem atualizar.

#### CA-13: RED Method funcional

- Os painéis Rate, Errors e Duration devem exibir dados quando o serviço selecionado tiver tráfego.
- As rotas individuais devem ser visíveis nas legendas.

#### CA-14: Tabela de top rotas

- A tabela deve listar rotas ordenadas por volume de requests.
- As colunas devem incluir método HTTP, rota e contagem.

#### CA-15: Pie chart de status codes

- O pie chart deve mostrar a distribuição de status codes (200, 201, 400, 404, 500, etc.).
- As cores devem seguir a convenção: 2xx verde, 4xx amarelo, 5xx vermelho.

#### CA-16: Métricas de processo

- Os painéis de CPU, memória, event loop e active handles devem exibir dados para o serviço selecionado.
- Os dados devem corresponder ao serviço escolhido na variável `$service`.

### Provisioning

#### CA-17: Dashboards versionados no repositório

- Os arquivos `marketplace-overview.json` e `service-details.json` devem existir no repositório dentro de `observability-stack/grafana/provisioning/dashboards/`.
- O arquivo `dashboards.yml` deve configurar o provider corretamente.

#### CA-18: Idempotência

- Executar `docker-compose down && docker-compose up -d` deve restaurar os dashboards automaticamente.
- Alterações manuais nos dashboards via UI do Grafana não devem ser persistidas após restart (gerenciados via arquivo).

---

## 10. Observações Técnicas

- **Prefixo de métricas padrão:** cada serviço usa `collectDefaultMetrics` com prefixo diferente (ex: `payments_service_`, `checkout_service_`). As métricas de negócio **não** usam prefixo — são globais por serviço, diferenciadas pelo label `job` do Prometheus.
- **Registry compartilhado:** as novas métricas devem ser registradas no mesmo `Registry` do `MetricsService` existente para serem expostas no endpoint `/metrics`.
- **Concorrência:** Counters do prom-client são thread-safe (process-level); não há risco de race condition.
- **Dashboards JSON:** os arquivos JSON devem ser gerados via "Share → Export → Save to file" no Grafana ou construídos manualmente. A spec define a estrutura e queries; a implementação pode usar qualquer método para gerar o JSON final.
- **Variável `$service`:** usa `label_values(up, job)` que retorna todos os jobs configurados no Prometheus, coincidindo com os nomes dos serviços.
- **`__name__` regex:** a abordagem `{__name__=~".+_process_resident_memory_bytes"}` é necessária porque cada serviço prefixa suas métricas padrão. Alternativamente, pode-se usar 5 queries explícitas nomeadas.
- **Performance:** regex em `__name__` pode ser mais lento que queries diretas em ambientes com muitas métricas. Para o marketplace-ms (5 serviços), o impacto é desprezível.

---

## 11. Arquivos Impactados

| Arquivo                                                                         | Ação                             |
| ------------------------------------------------------------------------------- | -------------------------------- |
| `payments-service/src/metrics/metrics.service.ts`                               | Modificar — adicionar 3 Counters |
| `payments-service/src/payments/payments.service.ts`                             | Modificar — incrementar Counters |
| `checkout-service/src/metrics/metrics.service.ts`                               | Modificar — adicionar 2 Counters |
| `checkout-service/src/orders/orders.service.ts`                                 | Modificar — incrementar Counter  |
| `checkout-service/src/events/payment-queue/payment-queue.service.ts`            | Modificar — incrementar Counter  |
| `observability-stack/grafana/provisioning/dashboards/dashboards.yml`            | Criar                            |
| `observability-stack/grafana/provisioning/dashboards/marketplace-overview.json` | Criar                            |
| `observability-stack/grafana/provisioning/dashboards/service-details.json`      | Criar                            |
| `observability-stack/docs/specs/02-dashboards-metricas-negocio.md`              | Criar (esta spec)                |

---

## 12. Sequência de Implementação Sugerida

1. **Métricas de negócio** — modificar `MetricsService` e services de ambos os serviços
2. **Testar métricas** — verificar output em `/metrics` e no Prometheus
3. **Provisioning config** — criar `dashboards.yml`
4. **Dashboard Overview** — criar JSON e testar no Grafana
5. **Dashboard Details** — criar JSON e testar no Grafana
6. **Validação final** — executar todos os critérios de aceite
