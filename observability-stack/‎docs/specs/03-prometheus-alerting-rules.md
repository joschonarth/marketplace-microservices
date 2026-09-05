# SPEC: Alerting Rules no Prometheus + Painel de Alertas no Grafana

**Serviço:** observability-stack  
**Status:** Proposta  
**Autor:** Arquitetura  
**Data:** 2026-03-10

---

## 1. Visão Geral

Configurar **alerting rules** no Prometheus para detectar proativamente problemas de infraestrutura e negócio no marketplace-ms, e adicionar um **painel de alertas ativos** ao dashboard "Marketplace Overview" do Grafana.

Atualmente o Prometheus coleta métricas de todos os 5 serviços, e os dashboards do Grafana permitem visualizar o estado em tempo real. Porém, não há mecanismo para detectar automaticamente condições anômalas — a equipe precisa monitorar os dashboards manualmente.

Com alerting rules, o Prometheus avaliará condições a cada 15s e disparará alertas quando thresholds forem violados. O Grafana exibirá os alertas ativos diretamente no dashboard Overview, dando visibilidade imediata de problemas sem necessidade de navegar para a UI do Prometheus.

> **Nota:** Esta spec configura apenas as alerting rules e o painel de visualização. Notificações externas (Slack, email, PagerDuty via Alertmanager) são escopo futuro.

---

## 2. Escopo

### Incluso

- Arquivo `alert.rules.yml` com 6 alerting rules
- Atualização do `prometheus.yml` para carregar as rules
- Novo painel "Active Alerts" no dashboard "Marketplace Overview" do Grafana
- Atualização do `docker-compose.yml` para montar o arquivo de rules

### Fora de escopo

- Alertmanager e notificações externas (Slack, email, PagerDuty)
- Readiness/liveness probes
- Alteração de métricas existentes nos serviços
- Alteração de painéis existentes nos dashboards (apenas adição de novo painel)
- Configurações de produção (thresholds podem ser ajustados conforme baseline real)

---

## 3. Alerting Rules

### 3.1 Resumo das regras

| Nome                         | Expressão            | For | Severidade | Descrição                           |
| ---------------------------- | -------------------- | --- | ---------- | ----------------------------------- |
| **ServiceDown**              | `up == 0`            | 30s | critical   | Serviço completamente fora do ar    |
| **HighErrorRate**            | Taxa de 5xx > 10%    | 1m  | warning    | Taxa de erro HTTP alta              |
| **HighLatencyP95**           | P95 > 2s             | 1m  | warning    | Latência alta no percentil 95       |
| **HighMemoryUsage**          | RSS > 512MB          | 2m  | warning    | Uso de memória alto                 |
| **NoPaymentsProcessed**      | 0 pagamentos em 5min | 5m  | info       | Nenhum pagamento processado         |
| **HighPaymentRejectionRate** | Rejeições > 50%      | 2m  | warning    | Taxa de rejeição de pagamentos alta |

### 3.2 Arquivo de regras (`prometheus/alert.rules.yml`)

```yaml
groups:
  - name: marketplace-infrastructure
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Serviço {{ $labels.job }} está fora do ar"
          description: "O serviço {{ $labels.job }} ({{ $labels.instance }}) está DOWN há mais de 30 segundos."

      - alert: HighErrorRate
        expr: >
          (
            sum(rate(http_requests_total{status_code=~"5.."}[5m])) by (job)
            /
            sum(rate(http_requests_total[5m])) by (job)
          ) * 100 > 10
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Taxa de erro alta no {{ $labels.job }}"
          description: 'O serviço {{ $labels.job }} tem {{ printf "%.1f" $value }}% de respostas 5xx nos últimos 5 minutos (threshold: 10%).'

      - alert: HighLatencyP95
        expr: >
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job)
          ) > 2
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "Latência P95 alta no {{ $labels.job }}"
          description: 'O serviço {{ $labels.job }} tem P95 de {{ printf "%.2f" $value }}s nos últimos 5 minutos (threshold: 2s).'

      - alert: HighMemoryUsage
        expr: >
          users_service_process_resident_memory_bytes > 536870912
          or products_service_process_resident_memory_bytes > 536870912
          or checkout_service_process_resident_memory_bytes > 536870912
          or payments_service_process_resident_memory_bytes > 536870912
          or api_gateway_process_resident_memory_bytes > 536870912
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Uso de memória alto"
          description: 'Um serviço está usando mais de 512MB de RSS há mais de 2 minutos (atual: {{ printf "%.0f" $value }} bytes).'

  - name: marketplace-business
    rules:
      - alert: NoPaymentsProcessed
        expr: >
          sum(increase(payments_processed_total{job="payments-service"}[5m])) == 0
        for: 5m
        labels:
          severity: info
        annotations:
          summary: "Nenhum pagamento processado nos últimos 5 minutos"
          description: "O payments-service não processou nenhum pagamento nos últimos 5 minutos. Verificar se o fluxo de checkout e a fila RabbitMQ estão funcionando."

      - alert: HighPaymentRejectionRate
        expr: >
          (
            sum(rate(payments_rejected_total{job="payments-service"}[5m]))
            /
            sum(rate(payments_processed_total{job="payments-service"}[5m]))
          ) * 100 > 50
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Taxa de rejeição de pagamentos alta"
          description: '{{ printf "%.1f" $value }}% dos pagamentos estão sendo rejeitados nos últimos 5 minutos (threshold: 50%). Verificar o gateway de pagamento.'
```

### 3.3 Detalhes das regras

#### ServiceDown (`up == 0`)

- **Métrica**: `up` é uma métrica automática do Prometheus que indica se o scrape do target foi bem-sucedido (1) ou falhou (0).
- **For 30s**: aguarda 30s antes de disparar para evitar falsos positivos durante restarts rápidos.
- **Severidade critical**: serviço fora do ar é o problema mais urgente.

#### HighErrorRate (> 10% 5xx)

- **Métrica**: `http_requests_total` com label `status_code=~"5.."` (regex para 500-599).
- **Rate window 5m**: usa janela de 5 minutos para suavizar spikes pontuais.
- **For 1m**: a taxa precisa estar acima de 10% por pelo menos 1 minuto para disparar.
- **Guard clause implícito**: se `http_requests_total` total for 0, a divisão retorna NaN e a rule não dispara (comportamento correto — sem requests, sem erro).

#### HighLatencyP95 (P95 > 2s)

- **Métrica**: `http_request_duration_seconds_bucket` (histogram).
- **`histogram_quantile(0.95, ...)`**: calcula o percentil 95 a partir dos buckets do histogram.
- **Threshold 2s**: 2 segundos é generoso para APIs internas; pode ser ajustado conforme baseline real.

#### HighMemoryUsage (> 512MB)

- **Métrica**: `*_process_resident_memory_bytes` (RSS) — cada serviço tem seu prefix (ex: `users_service_`, `api_gateway_`).
- **536870912 bytes = 512MB**: threshold em bytes pois a métrica é em bytes.
- **Expressão com `or`**: necessário porque cada serviço tem prefix diferente na métrica. Não é possível usar wildcard no PromQL.
- **For 2m**: aguarda 2 minutos para evitar alarmes em picos temporários (ex: GC compaction).

#### NoPaymentsProcessed (0 em 5min)

- **Métrica**: `payments_processed_total` (counter do payments-service).
- **`increase(...[5m]) == 0`**: verifica se o counter não incrementou nos últimos 5 minutos.
- **For 5m**: o alerta só dispara após 5 minutos contínuos sem pagamentos (total de 10min de gap antes de alertar).
- **Severidade info**: pode ser normal fora do horário comercial; é um indicador, não uma falha confirmada.

#### HighPaymentRejectionRate (> 50%)

- **Métricas**: `payments_rejected_total` / `payments_processed_total`.
- **Threshold 50%**: mais da metade dos pagamentos rejeitados é um forte indicador de problema no gateway de pagamento ou em dados de cartão.
- **For 2m**: aguarda 2 minutos de taxa alta sustentada.

---

## 4. Configuração do Prometheus

### 4.1 Atualizar `prometheus.yml`

Adicionar referência ao arquivo de rules:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert.rules.yml"

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

A única alteração é a adição do bloco `rule_files`.

### 4.2 Atualizar `docker-compose.yml`

Montar o arquivo de rules no container do Prometheus:

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: marketplace-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/alert.rules.yml:/etc/prometheus/alert.rules.yml:ro
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
```

A única alteração é a adição da linha de volume para `alert.rules.yml`.

---

## 5. Painel de Alertas Ativos no Grafana

Adicionar um novo row "Active Alerts" com um painel table ao dashboard "Marketplace Overview" (`marketplace-overview.json`).

### 5.1 Posicionamento

O novo row será adicionado **entre** o row "Service Health" (y=0) e o row "Throughput & Errors" (y=5), deslocando todos os painéis existentes para baixo.

### 5.2 Painel: Alertas Ativos (Table)

```json
{
  "type": "row",
  "title": "Active Alerts",
  "gridPos": { "h": 1, "w": 24, "x": 0, "y": 5 },
  "collapsed": false
},
{
  "type": "table",
  "title": "Alertas Ativos",
  "gridPos": { "h": 6, "w": 24, "x": 0, "y": 6 },
  "datasource": { "type": "prometheus", "uid": "PBFA97CFB590B2093" },
  "targets": [
    {
      "expr": "ALERTS{alertstate=\"firing\"}",
      "legendFormat": "",
      "refId": "A",
      "format": "table",
      "instant": true
    }
  ],
  "transformations": [
    {
      "id": "organize",
      "options": {
        "excludeByName": {
          "Time": true,
          "__name__": true,
          "instance": false
        },
        "renameByName": {
          "alertname": "Alerta",
          "alertstate": "Estado",
          "severity": "Severidade",
          "job": "Serviço",
          "instance": "Instância",
          "Value": "Valor"
        }
      }
    }
  ],
  "fieldConfig": {
    "defaults": {
      "custom": {
        "align": "auto",
        "cellOptions": { "type": "auto" }
      }
    },
    "overrides": [
      {
        "matcher": { "id": "byName", "options": "Severidade" },
        "properties": [
          {
            "id": "custom.cellOptions",
            "value": {
              "type": "color-background",
              "mode": "gradient"
            }
          },
          {
            "id": "mappings",
            "value": [
              { "type": "value", "options": { "critical": { "text": "CRITICAL", "color": "red" } } },
              { "type": "value", "options": { "warning": { "text": "WARNING", "color": "orange" } } },
              { "type": "value", "options": { "info": { "text": "INFO", "color": "blue" } } }
            ]
          }
        ]
      }
    ]
  },
  "options": {
    "showHeader": true,
    "footer": {
      "show": false
    }
  }
}
```

### 5.3 Ajuste de posições dos painéis existentes

Os painéis existentes precisam ter suas posições `y` incrementadas em **7** (1 para o row header + 6 para o painel table) para acomodar o novo bloco de alertas:

| Painel existente               | y atual | y novo       |
| ------------------------------ | ------- | ------------ |
| Row "Service Health"           | 0       | 0 (mantido)  |
| 5 stat panels (service health) | 1       | 1 (mantido)  |
| **Row "Active Alerts"**        | —       | **5** (novo) |
| **Table "Alertas Ativos"**     | —       | **6** (novo) |
| Row "Throughput & Errors"      | 5       | **12**       |
| Throughput por Serviço         | 6       | **13**       |
| Taxa de Erros por Serviço      | 6       | **13**       |
| Row "Latency & Resources"      | 14      | **21**       |
| Latência P95                   | 15      | **22**       |
| Uso de Memória                 | 15      | **22**       |
| Row "Business Metrics"         | 23      | **30**       |
| Stats de negócio               | 24      | **31**       |
| Row "Business Trends"          | 29      | **36**       |
| Gráficos de tendência          | 30      | **37**       |

---

## 6. Estrutura de Arquivos

```
observability-stack/
├── docker-compose.yml                                    ← alterar (mount do alert.rules.yml)
├── prometheus/
│   ├── prometheus.yml                                    ← alterar (adicionar rule_files)
│   └── alert.rules.yml                                   ← novo
├── grafana/
│   └── provisioning/
│       └── dashboards/
│           └── marketplace-overview.json                  ← alterar (adicionar painel de alertas)
└── docs/
    └── specs/
        └── 03-prometheus-alerting-rules.md               ← esta spec
```

---

## 7. Decisões de Design

- **Rules no Prometheus (não no Grafana)**: as alerting rules do Prometheus são avaliadas continuamente no backend a cada `evaluation_interval` (15s), independente de alguém estar olhando o dashboard. Alertas no Grafana só são avaliados quando o dashboard está aberto.
- **Dois grupos de rules**: separação em `marketplace-infrastructure` (problemas técnicos) e `marketplace-business` (problemas de negócio) facilita organização e futura configuração de routing no Alertmanager.
- **`for` clause em todas as rules**: evita falsos positivos de condições transitórias (restart, deploy, spike pontual).
- **Labels de severidade**: `critical`, `warning`, `info` seguem a convenção padrão e permitirão routing diferenciado no Alertmanager futuro.
- **Annotations com templates**: `{{ $labels.job }}` e `{{ printf "%.1f" $value }}` fornecem contexto rico nas mensagens dos alertas.
- **Painel table no Grafana**: visualização tabular de `ALERTS{alertstate="firing"}` é a forma padrão de listar alertas ativos. Mostra todas as regras que estão em estado `firing`.
- **Sem Alertmanager**: o Prometheus sozinho avalia as rules e mantém o estado dos alertas (pending → firing → resolved). O Grafana consulta `ALERTS{}` para exibir. O Alertmanager só é necessário para notificações externas.
- **HighMemoryUsage com expressões `or`**: cada serviço usa um prefix diferente nas métricas padrão do Node.js (ex: `users_service_`, `api_gateway_`), impossibilitando uma expressão genérica com wildcard.

---

## 8. Critérios de Aceite

### CA-01: Arquivo de rules criado

- O arquivo `observability-stack/prometheus/alert.rules.yml` deve existir com 6 alerting rules em 2 grupos.

### CA-02: Prometheus carrega as rules

- Acessar `http://localhost:9090/rules` deve listar os 2 grupos (`marketplace-infrastructure` e `marketplace-business`) com as 6 rules.
- Nenhuma rule deve estar com status `error` (syntax válida).

### CA-03: Rules avaliadas continuamente

- Na UI do Prometheus em `http://localhost:9090/rules`, cada rule deve mostrar um timestamp de última avaliação recente (< 30s atrás).

### CA-04: ServiceDown dispara corretamente

- Parar um serviço NestJS (ex: `users-service`). Após ~45s (30s for + 15s evaluation), acessar `http://localhost:9090/alerts` deve mostrar `ServiceDown` com status `firing` para o job correspondente.
- Reiniciar o serviço — o alerta deve desaparecer após ~15s.

### CA-05: HighErrorRate dispara corretamente

- Gerar requests que retornem 5xx em um serviço (ex: via rota inexistente ou bug simulado). Após >10% de 5xx sustentados por 1 minuto, o alerta `HighErrorRate` deve aparecer em `firing`.

### CA-06: Painel de alertas no Grafana

- O dashboard "Marketplace Overview" deve exibir um row "Active Alerts" com um painel table.
- Quando não há alertas ativos, a tabela deve aparecer vazia (ou com mensagem "No data").
- Quando há alertas ativos, a tabela deve mostrar o nome do alerta, severidade, serviço e instância.

### CA-07: Painéis existentes não afetados

- Todos os painéis existentes do dashboard "Marketplace Overview" devem continuar funcionando e exibindo dados corretamente.
- Apenas suas posições verticais foram ajustadas para acomodar o novo row.

### CA-08: Docker Compose atualizado

- O volume mount de `alert.rules.yml` deve estar configurado no `docker-compose.yml`.
- `docker-compose down && docker-compose up -d` deve funcionar sem erros.

### CA-09: Severidades com cores no Grafana

- No painel de alertas, a coluna "Severidade" deve exibir cores: vermelho para `critical`, laranja para `warning`, azul para `info`.

---

## 9. Validação

```bash
# 1. Subir a stack de observabilidade
cd observability-stack && docker-compose down && docker-compose up -d

# 2. Verificar que as rules foram carregadas
curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[].name'
# Esperado: "marketplace-infrastructure", "marketplace-business"

# 3. Verificar número de rules por grupo
curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[].rules | length'
# Esperado: 4, 2

# 4. Verificar alertas com todos os serviços UP
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts'
# Esperado: [] (nenhum alerta ativo) — ou ServiceDown se serviços estão parados

# 5. Parar um serviço e aguardar ~45s
kill <pid-users-service>
sleep 45

# 6. Verificar alerta ServiceDown ativo
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.labels.alertname == "ServiceDown")'
# Esperado: alerta com job="users-service" e state="firing"

# 7. Verificar painel no Grafana
# Acessar http://localhost:3010 → Dashboard "Marketplace Overview"
# O row "Active Alerts" deve mostrar o alerta ServiceDown na tabela

# 8. Reiniciar o serviço e verificar resolução
cd users-service && npm run start:dev
# Após ~15s, o alerta deve desaparecer
```

---

## 10. Observações Técnicas

- **Alertas em ambiente de dev**: como os serviços nem sempre estão rodando, é normal ver `ServiceDown` ativo. Isso não indica erro na configuração — confirma que as rules estão funcionando.
- **NoPaymentsProcessed em dev**: este alerta provavelmente ficará ativo frequentemente em ambiente de desenvolvimento (ninguém está fazendo pagamentos contínuos). É um alerta `info` — mais relevante em produção.
- **Threshold tuning**: os thresholds (10% erro, 2s latência, 512MB memória, 50% rejeição) são valores iniciais conservadores. Devem ser ajustados conforme o baseline real do sistema em produção.
- **Sem Alertmanager**: os alertas ficam visíveis na UI do Prometheus (`/alerts`) e no Grafana (painel table). Para receber notificações push (Slack, email), será necessário adicionar o Alertmanager em spec futura.

---

## 11. Arquivos Impactados

| Arquivo                                                                         | Ação                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `observability-stack/prometheus/alert.rules.yml`                                | Criar                                                         |
| `observability-stack/prometheus/prometheus.yml`                                 | Alterar — adicionar `rule_files`                              |
| `observability-stack/docker-compose.yml`                                        | Alterar — mount do `alert.rules.yml`                          |
| `observability-stack/grafana/provisioning/dashboards/marketplace-overview.json` | Alterar — adicionar row e painel de alertas, ajustar posições |
