# SPEC: Infraestrutura de Observabilidade — Prometheus + Grafana

**Serviço:** observability-stack  
**Status:** Proposta  
**Autor:** Arquitetura  
**Data:** 2026-03-05

---

## 1. Visão Geral

Criar a stack de observabilidade do marketplace-ms utilizando **Prometheus** (coleta de métricas) e **Grafana** (visualização via dashboards). A stack será implantada como infraestrutura dedicada via Docker Compose, seguindo o mesmo padrão do `messaging-service/` (pasta isolada com Docker Compose próprio).

O Prometheus fará scraping do endpoint `/metrics` de cada serviço NestJS rodando no host. O Grafana será provisionado automaticamente com o datasource Prometheus pré-configurado, eliminando configuração manual após `docker-compose up`.

> **Importante:** esta spec cobre exclusivamente a infraestrutura (Prometheus + Grafana + configuração). A instrumentação dos serviços NestJS com métricas será tratada em spec futura.

---

## 2. Escopo

### Incluso

- Pasta `observability-stack/` na raiz do projeto com Docker Compose dedicado
- Container Prometheus com `prometheus.yml` configurado para scraping dos 5 serviços
- Container Grafana com provisioning automático do datasource Prometheus
- README com instruções de uso
- Mapa de portas atualizado do ecossistema

### Fora de escopo

- Instrumentação dos serviços NestJS (endpoint `/metrics`) — spec futura
- Criação de dashboards no Grafana — spec futura
- Configuração de alerting (Alertmanager) — spec futura
- Ferramentas adicionais como Loki, Jaeger, Tempo ou OpenTelemetry Collector
- Configurações de produção (TLS, autenticação, retenção de longo prazo)

---

## 3. Mapa de Portas do Ecossistema

Referência completa de todas as portas do marketplace-ms após esta implementação:

| Serviço               | Porta    | Descrição                        |
| --------------------- | -------- | -------------------------------- |
| users-service         | 3000     | API de usuários (NestJS)         |
| products-service      | 3001     | API de produtos (NestJS)         |
| checkout-service      | 3003     | API de checkout/pedidos (NestJS) |
| payments-service      | 3004     | API de pagamentos (NestJS)       |
| api-gateway           | 3005     | Gateway HTTP (NestJS)            |
| **Grafana**           | **3010** | **UI de dashboards (novo)**      |
| RabbitMQ (AMQP)       | 5672     | Protocolo de mensageria          |
| **Prometheus**        | **9090** | **UI e API de métricas (novo)**  |
| RabbitMQ (Management) | 15672    | Painel web de administração      |

---

## 4. Estrutura de Pastas

```
observability-stack/
├── docker-compose.yml
├── README.md
├── prometheus/
│   └── prometheus.yml
├── grafana/
│   └── provisioning/
│       └── datasources/
│           └── datasource.yml
└── docs/
    └── specs/
        └── 01-prometheus-grafana-stack.md   ← esta spec
```

---

## 5. Docker Compose

Arquivo `observability-stack/docker-compose.yml`:

```yaml
version: "3.8"

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: marketplace-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    extra_hosts:
      - "host.docker.internal:host-gateway"
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.retention.time=15d"
    restart: unless-stopped
    healthcheck:
      test: wget --no-verbose --tries=1 --spider http://localhost:9090/-/healthy || exit 1
      interval: 30s
      timeout: 10s
      retries: 5

  grafana:
    image: grafana/grafana:latest
    container_name: marketplace-grafana
    ports:
      - "3010:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - grafana_data:/var/lib/grafana
    depends_on:
      prometheus:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
      interval: 30s
      timeout: 10s
      retries: 5

volumes:
  prometheus_data:
  grafana_data:
```

### Decisões de design

- **`extra_hosts`**: o mapeamento `host.docker.internal:host-gateway` permite que o Prometheus dentro do container acesse os serviços NestJS rodando no host (macOS/Linux).
- **Porta do Grafana 3010→3000**: o Grafana roda internamente na 3000, mas é exposto na 3010 para evitar conflito com o `users-service`.
- **Volumes nomeados**: `prometheus_data` e `grafana_data` persistem dados entre restarts.
- **`depends_on` com condition**: o Grafana só inicia após o Prometheus estar healthy.
- **Retenção do Prometheus**: 15 dias (`--storage.tsdb.retention.time=15d`) é suficiente para desenvolvimento.
- **Credenciais Grafana**: `admin/admin` para ambiente de desenvolvimento (MUDAR EM PRODUÇÃO).

---

## 6. Configuração do Prometheus

Arquivo `observability-stack/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "users-service"
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:3000"]
        labels:
          service: users-service

  - job_name: "products-service"
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:3001"]
        labels:
          service: products-service

  - job_name: "checkout-service"
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:3003"]
        labels:
          service: checkout-service

  - job_name: "payments-service"
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:3004"]
        labels:
          service: payments-service

  - job_name: "api-gateway"
    metrics_path: /metrics
    static_configs:
      - targets: ["host.docker.internal:3005"]
        labels:
          service: api-gateway
```

### Decisões de design

- **`scrape_interval: 15s`**: intervalo padrão recomendado pelo Prometheus para desenvolvimento.
- **`metrics_path: /metrics`**: endpoint padrão que será exposto pelos serviços NestJS (instrumentação em spec futura).
- **Labels `service`**: cada job inclui um label para facilitar filtragem e agrupamento nos dashboards futuros.
- **Um job por serviço**: embora seja possível agrupar targets em um único job, jobs separados facilitam visualizar o status de cada serviço individualmente na UI do Prometheus (Status → Targets).

---

## 7. Provisioning do Grafana — Datasource

Arquivo `observability-stack/grafana/provisioning/datasources/datasource.yml`:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### Decisões de design

- **`access: proxy`**: as requisições ao Prometheus passam pelo backend do Grafana (não diretamente pelo browser), garantindo funcionamento dentro da rede Docker.
- **`url: http://prometheus:9090`**: usa o nome do serviço Docker como hostname (rede interna do Compose).
- **`isDefault: true`**: define como datasource padrão para novos dashboards.
- **`editable: false`**: impede alteração acidental via UI — a configuração é gerenciada via arquivo.

---

## 8. README

Arquivo `observability-stack/README.md`:

```markdown
# Observability Stack

Infraestrutura de observabilidade para o marketplace-ms usando Prometheus e Grafana.

## Serviços

| Serviço    | Porta | URL                   | Credenciais   |
| ---------- | ----- | --------------------- | ------------- |
| Prometheus | 9090  | http://localhost:9090 | —             |
| Grafana    | 3010  | http://localhost:3010 | admin / admin |

## Como usar

### Subir a stack

    docker-compose up -d

### Verificar status

    docker-compose ps

### Parar a stack

    docker-compose down

### Remover dados persistidos

    docker-compose down -v

## Verificações

- Prometheus targets: http://localhost:9090/targets
- Grafana datasources: http://localhost:3010 → Connections → Data sources
- Health check Prometheus: http://localhost:9090/-/healthy
- Health check Grafana: http://localhost:3010/api/health

## Pré-requisitos

Os serviços NestJS precisam estar rodando e expondo o endpoint `/metrics`
para que o Prometheus consiga coletar métricas (instrumentação em spec futura).
```

---

## 9. Critérios de Aceite

### CA-01: Estrutura de pastas

- A pasta `observability-stack/` deve existir na raiz do projeto com a estrutura definida na seção 4 (docker-compose.yml, prometheus/, grafana/provisioning/, README.md).

### CA-02: Docker Compose sobe sem erros

- Executar `docker-compose up -d` dentro de `observability-stack/` deve criar e iniciar os containers `marketplace-prometheus` e `marketplace-grafana` sem erros.

### CA-03: Prometheus acessível

- Acessar `http://localhost:9090` deve exibir a UI do Prometheus.
- Acessar `http://localhost:9090/-/healthy` deve retornar status healthy.

### CA-04: Grafana acessível

- Acessar `http://localhost:3010` deve exibir a tela de login do Grafana.
- Login com `admin/admin` deve funcionar.
- Acessar `http://localhost:3010/api/health` deve retornar status `ok`.

### CA-05: Datasource Prometheus provisionado

- Ao acessar Grafana → Connections → Data sources, o datasource "Prometheus" deve aparecer listado automaticamente (sem configuração manual).
- O datasource deve apontar para `http://prometheus:9090`.

### CA-06: Targets configurados no Prometheus

- Acessar `http://localhost:9090/targets` deve listar 5 targets configurados:
  - `users-service` → `host.docker.internal:3000`
  - `products-service` → `host.docker.internal:3001`
  - `checkout-service` → `host.docker.internal:3003`
  - `payments-service` → `host.docker.internal:3004`
  - `api-gateway` → `host.docker.internal:3005`
- Os targets aparecerão como DOWN até que os serviços sejam instrumentados com `/metrics` (esperado nesta fase).

### CA-07: Persistência de dados

- Executar `docker-compose down` seguido de `docker-compose up -d` deve preservar os dados do Prometheus e Grafana (volumes nomeados).

### CA-08: Sem conflito de portas

- A porta 3010 (Grafana) não deve conflitar com nenhum serviço existente do marketplace-ms.
- A porta 9090 (Prometheus) não deve conflitar com nenhum serviço existente.

### CA-09: Health checks funcionando

- Executar `docker-compose ps` deve mostrar ambos os containers como `healthy` após inicialização completa.

---

## 10. Observações Técnicas

- Os targets do Prometheus aparecerão como **DOWN** até que os serviços NestJS sejam instrumentados com o endpoint `/metrics`. Isso é esperado e não indica erro na configuração da stack.
- Em macOS, `host.docker.internal` funciona nativamente com Docker Desktop. Em Linux, o mapeamento `extra_hosts: host.docker.internal:host-gateway` resolve o acesso ao host.
- As credenciais `admin/admin` são adequadas apenas para desenvolvimento local.
- O provisioning do Grafana é idempotente — o datasource é recriado automaticamente a cada restart do container.

---

## 11. Arquivos Impactados

| Arquivo                                                               | Ação  |
| --------------------------------------------------------------------- | ----- |
| `observability-stack/docker-compose.yml`                              | Criar |
| `observability-stack/prometheus/prometheus.yml`                       | Criar |
| `observability-stack/grafana/provisioning/datasources/datasource.yml` | Criar |
| `observability-stack/README.md`                                       | Criar |
| `observability-stack/docs/specs/01-prometheus-grafana-stack.md`       | Criar |
