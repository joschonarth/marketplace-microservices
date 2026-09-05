#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# Marketplace-MS: Load & Failure Testing Suite
# Tests the full alerting pipeline: metrics → Prometheus → Grafana
# ─────────────────────────────────────────────────────────

GATEWAY="http://localhost:3005"
PROM="http://localhost:9090"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()    { echo -e "${GREEN}  ✓${NC} $1"; }
warn()  { echo -e "${YELLOW}  ⚠${NC} $1"; }
error() { echo -e "${RED}  ✗${NC} $1"; }
header(){ echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

check_service() {
  if curl -sf "$1" > /dev/null 2>&1; then ok "$2 respondendo"; return 0
  else error "$2 NÃO respondendo"; return 1; fi
}

get_token() {
  local resp
  resp=$(curl -sf -X POST "$GATEWAY/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"loadtest@test.com","password":"Test@12345"}')
  echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
}

get_alerts() {
  curl -sf "$PROM/api/v1/rules" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for g in data['data']['groups']:
    for r in g['rules']:
        if r.get('alerts'):
            for a in r['alerts']:
                print(f\"  [{a['state'].upper():8}] {r['name']} (severity: {r['labels'].get('severity','?')})\")" 2>/dev/null || echo "  (nenhum alerta ativo)"
}

get_metrics_summary() {
  local svc=$1 port=$2
  curl -sf "http://localhost:${port}/metrics" | python3 -c "
import sys
lines = sys.stdin.readlines()
for l in lines:
    if l.startswith('http_requests_total') and not l.startswith('#'):
        print(f'  {l.strip()}')
" 2>/dev/null | head -20
}

fire_requests() {
  local url="$1"
  local method="${2:-GET}"
  local count="${3:-50}"
  local concurrency="${4:-10}"
  local headers="${5:-}"
  local data="${6:-}"

  local pids=()
  for ((batch=0; batch<concurrency; batch++)); do
    (
      local per_batch=$((count / concurrency))
      for ((i=0; i<per_batch; i++)); do
        if [ "$method" = "GET" ]; then
          curl -sf -o /dev/null -w "%{http_code}\n" $headers "$url" 2>/dev/null || true
        else
          curl -sf -o /dev/null -w "%{http_code}\n" -X "$method" $headers -d "$data" -H "Content-Type: application/json" "$url" 2>/dev/null || true
        fi
      done
    ) &
    pids+=($!)
  done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
}

# ═══════════════════════════════════════════════════════════
header "FASE 0: PRÉ-VERIFICAÇÃO"
# ═══════════════════════════════════════════════════════════

log "Verificando serviços..."
check_service "$GATEWAY/health" "API Gateway"
check_service "http://localhost:3000/health" "Users Service"
check_service "http://localhost:3001/health" "Products Service"
check_service "http://localhost:3003/health" "Checkout Service"
check_service "http://localhost:3004/health" "Payments Service"
check_service "$PROM/-/healthy" "Prometheus"
check_service "http://localhost:3010/api/health" "Grafana"

log "Obtendo token JWT..."
TOKEN=$(get_token)
if [ -n "$TOKEN" ]; then
  ok "Token obtido (${TOKEN:0:20}...)"
  AUTH="-H \"Authorization: Bearer $TOKEN\""
else
  error "Falha ao obter token!"; exit 1
fi

log "Status atual dos alertas:"
get_alerts

# ═══════════════════════════════════════════════════════════
header "FASE 1: TESTE DE CARGA — Tráfego Normal (métricas RED)"
# ═══════════════════════════════════════════════════════════

log "Disparando 200 requests GET /products (público, 10 paralelos)..."
fire_requests "$GATEWAY/products" "GET" 200 10
ok "200 requests em /products concluídos"

log "Disparando 200 requests GET /health (público, 10 paralelos)..."
fire_requests "$GATEWAY/health" "GET" 200 10
ok "200 requests em /health concluídos"

log "Disparando 100 requests GET /products/:id (público, 10 paralelos)..."
PRODUCT_ID=$(curl -sf "$GATEWAY/products" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)
if [ -n "$PRODUCT_ID" ]; then
  fire_requests "$GATEWAY/products/$PRODUCT_ID" "GET" 100 10
  ok "100 requests em /products/$PRODUCT_ID concluídos"
else
  warn "Nenhum produto encontrado, pulando..."
fi

log "Disparando 100 requests GET /users/profile (autenticado, 10 paralelos)..."
fire_requests "$GATEWAY/users/profile" "GET" 100 10 "-H \"Authorization: Bearer $TOKEN\""
ok "100 requests autenticados concluídos"

log "Aguardando 5s para métricas serem coletadas pelo Prometheus..."
sleep 5

log "Resumo de métricas HTTP após carga (api-gateway):"
get_metrics_summary "api-gateway" 3005

# ═══════════════════════════════════════════════════════════
header "FASE 2: GERAÇÃO DE ERROS — Disparo de HighErrorRate"
# ═══════════════════════════════════════════════════════════

log "Fase 2a: Gerando 404s (endpoints inexistentes)..."
fire_requests "$GATEWAY/api/nonexistent" "GET" 100 10
fire_requests "$GATEWAY/products/00000000-0000-0000-0000-000000000000" "GET" 100 10
ok "200 requests para endpoints inválidos concluídos"

log "Fase 2b: Gerando 401s (requests sem token em rotas protegidas)..."
fire_requests "$GATEWAY/users/profile" "GET" 100 10
fire_requests "$GATEWAY/orders" "GET" 100 10
fire_requests "$GATEWAY/cart" "GET" 100 10
ok "300 requests sem autenticação concluídos"

log "Fase 2c: Gerando 400s (payloads inválidos)..."
fire_requests "$GATEWAY/auth/register" "POST" 100 10 "" '{"invalid":"data"}'
fire_requests "$GATEWAY/auth/login" "POST" 100 10 "" '{"email":"bad","password":"x"}'
ok "200 requests com payloads inválidos concluídos"

log "Aguardando 10s para métricas serem coletadas..."
sleep 10

log "Status dos alertas após geração de erros:"
get_alerts

# ═══════════════════════════════════════════════════════════
header "FASE 3: TESTE DE LATÊNCIA — Requests Pesados"
# ═══════════════════════════════════════════════════════════

log "Enviando 500 requests simultâneos para sobrecarregar os serviços..."
fire_requests "$GATEWAY/products" "GET" 500 50
fire_requests "$GATEWAY/health" "GET" 200 50
ok "700 requests de alta concorrência concluídos"

log "Aguardando 10s para as métricas estabilizarem..."
sleep 10

log "Verificando métricas de latência (P95)..."
curl -sf "$PROM/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket[5m]))by(le,job))" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data['data']['result']:
    job = r['metric'].get('job', '?')
    val = float(r['value'][1])
    status = '⚠️' if val > 2 else '✓'
    print(f'  {status} {job}: P95 = {val:.4f}s')
" 2>/dev/null || warn "Não foi possível consultar P95"

# ═══════════════════════════════════════════════════════════
header "FASE 4: QUEDA DE SERVIÇO — Disparo de ServiceDown"
# ═══════════════════════════════════════════════════════════

log "Parando o products-service (porta 3001) para simular queda..."
PRODUCTS_PID=$(lsof -ti:3001 2>/dev/null | head -1)
if [ -n "$PRODUCTS_PID" ]; then
  kill "$PRODUCTS_PID" 2>/dev/null && ok "products-service (PID $PRODUCTS_PID) encerrado"
else
  warn "Não foi possível encontrar o PID do products-service"
fi

log "Aguardando 15s para Prometheus detectar a queda..."
sleep 5
log "  ... 10s restantes"
sleep 5
log "  ... 5s restantes"
sleep 5

log "Verificando target do products-service no Prometheus..."
curl -sf "$PROM/api/v1/targets" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['data']['activeTargets']:
    print(f\"  {t['labels']['job']}: {t['health']} (last scrape: {t.get('lastScrape','?')})\")" 2>/dev/null

log "Fazendo requests ao gateway para ver erro do products-service..."
for i in $(seq 1 5); do
  code=$(curl -so /dev/null -w "%{http_code}" "$GATEWAY/products" 2>/dev/null)
  echo "  Request $i → HTTP $code"
done

log "Aguardando 20s para o alerta ServiceDown disparar..."
sleep 10
log "  ... 10s restantes"
sleep 10

log "Status dos alertas após queda do serviço:"
get_alerts

# ═══════════════════════════════════════════════════════════
header "FASE 5: VERIFICAÇÃO FINAL — Resumo de Alertas"
# ═══════════════════════════════════════════════════════════

log "Consultando todos os alertas ativos no Prometheus..."
curl -sf "$PROM/api/v1/alerts" | python3 -c "
import sys, json
data = json.load(sys.stdin)
alerts = data['data']['alerts']
if not alerts:
    print('  Nenhum alerta ativo')
else:
    for a in alerts:
        name = a['labels']['alertname']
        state = a['state']
        severity = a['labels'].get('severity', '?')
        summary = a['annotations'].get('summary', '')
        print(f'  [{state.upper():8}] {name} ({severity})')
        print(f'           → {summary}')
" 2>/dev/null

log "Consultando métricas chave..."
echo ""
echo "  📊 Total de requests HTTP por serviço:"
curl -sf "$PROM/api/v1/query?query=sum(http_requests_total)by(job)" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data['data']['result']:
    print(f\"    {r['metric']['job']}: {r['value'][1]} requests\")" 2>/dev/null

echo ""
echo "  📊 Taxa de erro por serviço (últimos 5min):"
curl -sf "$PROM/api/v1/query?query=(sum(rate(http_requests_total{status_code=~\"5..\"}[5m]))by(job)/sum(rate(http_requests_total[5m]))by(job))*100" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data['data']['result']:
    val = float(r['value'][1])
    print(f\"    {r['metric']['job']}: {val:.1f}%\")" 2>/dev/null

echo ""
echo "  📊 Targets (UP/DOWN):"
curl -sf "$PROM/api/v1/query?query=up" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data['data']['result']:
    status = 'UP' if r['value'][1] == '1' else 'DOWN'
    print(f\"    {r['metric']['job']}: {status}\")" 2>/dev/null

# ═══════════════════════════════════════════════════════════
header "FASE 6: RECUPERAÇÃO — Reiniciar products-service"
# ═══════════════════════════════════════════════════════════

log "⚠️  O products-service foi parado durante o teste."
log "Para reiniciá-lo, execute no terminal do products-service:"
echo ""
echo "    cd /Users/thiagolima/www/marketplace-ms/products-service && npm run start:dev"
echo ""
log "Após reiniciar, os alertas ServiceDown devem resolver em ~1 minuto."
echo ""

header "TESTE CONCLUÍDO"
log "Abra o Grafana em http://localhost:3010 (admin/admin)"
log "Navegue até: Dashboards → Marketplace → Marketplace Overview"
log "Verifique:"
echo "  1. Service Health → products-service deve mostrar DOWN"
echo "  2. Request Rate → pico de requests durante o teste"
echo "  3. Error Rate → aumento durante Fase 2"
echo "  4. Latency P95 → possível aumento durante Fase 3"
echo "  5. Alerts → ServiceDown e NoPaymentsProcessed ativos"
echo ""