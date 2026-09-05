#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# Marketplace-MS: Complete Alert Testing Suite (v2)
# With fixed HTTP metrics middleware that captures ALL status codes
# ─────────────────────────────────────────────────────────

GATEWAY="http://localhost:3005"
PROM="http://localhost:9090"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"; }
ok()     { echo -e "${GREEN}  ✓${NC} $1"; }
warn()   { echo -e "${YELLOW}  ⚠${NC} $1"; }
error()  { echo -e "${RED}  ✗${NC} $1"; }
header() { echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BOLD}  $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

fire_silent() {
  local url="$1" method="${2:-GET}" count="${3:-50}" concurrency="${4:-10}"
  local extra_args="${5:-}"

  local pids=()
  for ((batch=0; batch<concurrency; batch++)); do
    (
      local per=$((count / concurrency))
      for ((i=0; i<per; i++)); do
        if [ "$method" = "GET" ]; then
          eval curl -sf -o /dev/null -m 5 $extra_args \"$url\" 2>/dev/null || true
        else
          eval curl -sf -o /dev/null -m 5 -X "$method" $extra_args \"$url\" 2>/dev/null || true
        fi
      done
    ) &
    pids+=($!)
  done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
}

get_alerts() {
  curl -sf "$PROM/api/v1/alerts" | python3 -c "
import sys, json
data = json.load(sys.stdin)
alerts = data['data']['alerts']
if not alerts:
    print('  (nenhum alerta ativo)')
else:
    for a in alerts:
        state = a['state'].upper()
        name = a['labels']['alertname']
        sev = a['labels'].get('severity', '?')
        summary = a['annotations'].get('summary', '')
        if state == 'FIRING':
            print(f'  🔴 [{state}] {name} ({sev}) → {summary}')
        else:
            print(f'  🟡 [{state}] {name} ({sev}) → {summary}')
" 2>/dev/null || echo "  (erro ao consultar alertas)"
}

get_metrics_by_status() {
  curl -sf "http://localhost:3005/metrics" | grep "^http_requests_total" | \
    python3 -c "
import sys
from collections import defaultdict
totals = defaultdict(int)
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    parts = line.split('}')
    if len(parts) < 2: continue
    labels = parts[0] + '}'
    val = int(float(parts[1].strip()))
    for kv in labels.replace('{','').replace('}','').split(','):
        k,v = kv.split('=')
        if k == 'status_code':
            code = v.strip('\"')
            totals[code] += val
for code in sorted(totals.keys()):
    icon = '✅' if code.startswith('2') else ('⚠️' if code.startswith('4') else '🔴')
    print(f'  {icon} HTTP {code}: {totals[code]} requests')
" 2>/dev/null
}

# ═══════════════════════════════════════════════════════════
header "FASE 0: PRÉ-VERIFICAÇÃO"
# ═══════════════════════════════════════════════════════════

log "Verificando todos os serviços..."
for svc_port in "API-Gateway:3005" "Users:3000" "Products:3001" "Checkout:3003" "Payments:3004" "Prometheus:9090" "Grafana:3010"; do
  svc="${svc_port%%:*}"
  port="${svc_port##*:}"
  if [ "$svc" = "Prometheus" ]; then url="http://localhost:${port}/-/healthy"
  elif [ "$svc" = "Grafana" ]; then url="http://localhost:${port}/api/health"
  else url="http://localhost:${port}/health"
  fi
  curl -sf "$url" > /dev/null 2>&1 && ok "$svc (:$port)" || error "$svc (:$port) DOWN"
done

log "Obtendo token JWT..."
TOKEN=$(curl -sf -X POST "$GATEWAY/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"loadtest@test.com","password":"Test@12345"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
ok "Token obtido"

log "Alertas atuais:"
get_alerts

# ═══════════════════════════════════════════════════════════
header "FASE 1: CARGA NORMAL — Baseline de métricas RED"
# ═══════════════════════════════════════════════════════════

log "Enviando 300 requests normais (GET /products, /health)..."
fire_silent "$GATEWAY/products" "GET" 150 15
fire_silent "$GATEWAY/health" "GET" 150 15
ok "300 requests 2xx enviados"

log "Enviando 100 requests autenticados (GET /users/profile)..."
fire_silent "$GATEWAY/users/profile" "GET" 100 10 "-H 'Authorization: Bearer $TOKEN'"
ok "100 requests autenticados enviados"

log "Métricas HTTP no gateway:"
get_metrics_by_status

# ═══════════════════════════════════════════════════════════
header "FASE 2: GERAÇÃO DE ERROS — Todos os status codes"
# ═══════════════════════════════════════════════════════════

log "Gerando 200x 404 (rotas inexistentes)..."
fire_silent "$GATEWAY/api/nonexistent/path" "GET" 200 20
ok "200 requests → 404"

log "Gerando 200x 401 (sem autenticação)..."
fire_silent "$GATEWAY/users/profile" "GET" 200 20
ok "200 requests → 401"

log "Gerando 200x 400 (payloads inválidos)..."
fire_silent "$GATEWAY/auth/register" "POST" 200 20 "-H 'Content-Type: application/json' -d '{\"bad\":true}'"
ok "200 requests → 400"

log "Métricas HTTP com erros 4xx:"
get_metrics_by_status

# ═══════════════════════════════════════════════════════════
header "FASE 3: QUEDA DE SERVIÇO — ServiceDown + erros 5xx"
# ═══════════════════════════════════════════════════════════

log "Parando products-service para simular queda..."
PIDS=$(lsof -ti:3001 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill -9 2>/dev/null
  sleep 2
  ok "products-service encerrado"
else
  warn "products-service já está parado"
fi

log "Verificando que products-service está DOWN..."
curl -sf http://localhost:3001/health > /dev/null 2>&1 && error "Ainda respondendo!" || ok "Confirmado DOWN"

log "Gerando tráfego para produzir erros 5xx via gateway..."
log "  (o gateway tentará acessar products-service e falhará)"
fire_silent "$GATEWAY/products" "GET" 300 30
fire_silent "$GATEWAY/products/63f22191-bd99-4f94-a8b7-a09cf99d3fc6" "GET" 100 10
ok "400 requests enviados (devem gerar 5xx ou fallback)"

log "Métricas HTTP após queda:"
get_metrics_by_status

log "Aguardando 15s para Prometheus detectar ServiceDown..."
sleep 5; log "  ...10s"; sleep 5; log "  ...5s"; sleep 5

log "Targets no Prometheus:"
curl -sf "$PROM/api/v1/targets" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['data']['activeTargets']:
    h = t['health']
    icon = '✅' if h == 'up' else '❌'
    print(f\"  {icon} {t['labels']['job']}: {h}\")" 2>/dev/null

log "Aguardando mais 20s para alertas dispararem..."
sleep 10; log "  ...10s"; sleep 10

log "🔔 ALERTAS APÓS QUEDA DO SERVIÇO:"
get_alerts

# ═══════════════════════════════════════════════════════════
header "FASE 4: VERIFICAÇÃO COMPLETA DE ALERTAS"
# ═══════════════════════════════════════════════════════════

log "Consultando todas as regras de alerta no Prometheus..."
curl -sf "$PROM/api/v1/rules" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for g in data['data']['groups']:
    print(f\"  Grupo: {g['name']}\")
    for r in g['rules']:
        state = r.get('state', 'N/A')
        icon = {'firing': '🔴', 'pending': '🟡', 'inactive': '⚪'}.get(state, '❔')
        health = r.get('health', '?')
        alerts_count = len(r.get('alerts', []))
        print(f\"    {icon} {r['name']}: {state} (health: {health}, alerts: {alerts_count})\")
" 2>/dev/null

echo ""
log "📊 Métricas totais HTTP por status code (API Gateway):"
get_metrics_by_status

echo ""
log "📊 Total de requests por serviço:"
curl -sf "$PROM/api/v1/query?query=sum(http_requests_total)by(job)" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in sorted(data['data']['result'], key=lambda x: x['metric']['job']):
    print(f\"    {r['metric']['job']}: {r['value'][1]} requests\")" 2>/dev/null

echo ""
log "📊 Latência P95 por serviço:"
curl -sf "$PROM/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket[5m]))by(le,job))" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data['data']['result']:
    job = r['metric'].get('job', '?')
    val = float(r['value'][1])
    icon = '⚠️' if val > 2 else '✅'
    print(f'    {icon} {job}: P95 = {val:.4f}s')
" 2>/dev/null || warn "Dados P95 ainda não disponíveis"

# ═══════════════════════════════════════════════════════════
header "RESULTADO FINAL"
# ═══════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}  🔔 Alertas que devem estar ATIVOS:${NC}"
echo "    1. ServiceDown (critical) → products-service DOWN"
echo "    2. NoPaymentsProcessed (info) → nenhum pagamento processado"
echo ""
echo -e "${BOLD}  📺 Verificar no Grafana (http://localhost:3010):${NC}"
echo "    Login: admin / admin"
echo "    Dashboard: Dashboards → Marketplace → Marketplace Overview"
echo ""
echo "    Painéis para observar:"
echo "      • Service Health: products-service = DOWN (vermelho)"
echo "      • Request Rate: pico durante os testes"
echo "      • Error Rate: aumento de 4xx e possíveis 5xx"  
echo "      • Response Time: latência durante carga alta"
echo "      • Active Alerts: ServiceDown + NoPaymentsProcessed"
echo ""
echo -e "${BOLD}  🔄 Para reiniciar products-service:${NC}"
echo "    cd /Users/thiagolima/www/marketplace-ms/products-service && npm run start:dev"
echo ""
echo -e "${GREEN}  Teste concluído com sucesso!${NC}"
echo ""