# Observability Stack

Infraestrutura de observabilidade para o marketplace-ms usando Prometheus e Grafana.

## Serviços

| Serviço    | Porta | URL                   | Credenciais   |
| ---------- | ----- | --------------------- | ------------- |
| Prometheus | 9090  | http://localhost:9090 | —             |
| Grafana    | 3010  | http://localhost:3010 | admin / admin |

## Como usar

### Subir a stack

```bash
docker-compose up -d
```

### Verificar status

```bash
docker-compose ps
```

### Parar a stack

```bash
docker-compose down
```

### Remover dados persistidos

```bash
docker-compose down -v
```

## Verificações

- **Prometheus targets:** http://localhost:9090/targets
- **Grafana datasources:** http://localhost:3010 → Connections → Data sources
- **Health check Prometheus:** http://localhost:9090/-/healthy
- **Health check Grafana:** http://localhost:3010/api/health

## Pré-requisitos

Os serviços NestJS precisam estar rodando e expondo o endpoint `/metrics`
para que o Prometheus consiga coletar métricas (instrumentação em spec futura).
