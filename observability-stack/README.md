<div align="center">

# 📊 Observability Stack

_A Prometheus and Grafana observability stack for the marketplace microservices platform._

---

📃 [About](#-about)&nbsp;&nbsp;•&nbsp;&nbsp;
🏗️ [Role in the Architecture](#️-role-in-the-architecture)&nbsp;&nbsp;•&nbsp;&nbsp;
🧠 [Architecture Concepts](#-architecture-concepts)&nbsp;&nbsp;•&nbsp;&nbsp;
🛠️ [Technologies](#️-technologies)&nbsp;&nbsp;•&nbsp;&nbsp;
✨ [Features](#-features)&nbsp;&nbsp;•&nbsp;&nbsp;
🚀 [Getting Started](#-getting-started)&nbsp;&nbsp;•&nbsp;&nbsp;
📖 [API Documentation](#-api-documentation)&nbsp;&nbsp;•&nbsp;&nbsp;
🧪 [Testing](#-testing)

</div>

---

## 📃 About

The observability stack is the monitoring and visualization layer of the marketplace microservices ecosystem. It provides a Prometheus time-series metrics endpoint and a Grafana UI with a pre-provisioned datasource and ready-to-load dashboards for service visibility and business-level trends.

This stack is designed to observe the health of the NestJS services and to track operational signals such as endpoint metrics, traffic, and alert events from the metrics and health endpoints exposed by each service.

## 🏗️ Role in the Architecture

The observability stack runs alongside the service network and is not a business service by itself. It receives metrics from application services through the Prometheus scrape configuration, visualizes them using Grafana, and applies alert rules to support failure detection and operational response.

The deployment is described in the repository's `docker-compose.yml` file and contains two primary runtime services:

- `prometheus` — metrics collection and alert evaluation
- `grafana` — dashboard and panel visualization layer

## 🧠 Architecture Concepts

The stack implements a small but clear monitoring architecture:

- **Metrics Collection** — Prometheus reads metrics from the service endpoints declared in the configuration file and keeps a time-series store for dashboards and alert rules.
- **Dashboards as Code** — the Grafana provisioning configuration loads dashboards from disk and provides a reproducible visualization setup.
- **Alerting Rules** — `alert.rules.yml` declares alert conditions that can be evaluated by Prometheus against the collected series.
- **Provisioned Datasource** — the Grafana datasource provisioning file configures Prometheus as the default datasource.
- **Containerized Observability** — the service uses Docker Compose volumes and restart policies to make the stack reproducible in local development.

## 🛠️ Technologies

- 🐳 **[Docker Compose](https://docs.docker.com/compose/)** — orchestrates the Prometheus and Grafana containers locally.
- 📊 **[Prometheus](https://prometheus.io/)** — time-series metrics registry and alert evaluator.
- 📈 **[Grafana](https://grafana.com/)** — dashboard, panel, and visualization UI.
- 🧾 **[Prometheus Alertmanager Rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)** — alert expressions implemented inside the repository alert rules file.
- 📡 **[YAML Configurations](https://yaml.org/)** — the stack is configured through `prometheus.yml`, `alert.rules.yml`, and Grafana provisioning files.

## ✨ Features

- [x] 📉 Collect service metrics with a Prometheus scrape configuration
- [x] 📊 Load Grafana dashboards from the repository service provisioning folder
- [x] 🔔 Evaluate business and operational alert rules from Prometheus rule files
- [x] 🩺 Check service health through local URLs and health endpoints
- [x] 🧪 Support load and alert smoke tests via the repository's test scripts

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- The NestJS services should be running and exposing metrics endpoints such as `/metrics` or `/actuator` routes

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/joschonarth/marketplace-ms.git
   ```

2. Go to the observability stack directory:

   ```bash
   cd marketplace-ms/observability-stack
   ```

3. Start the stack locally:

   ```bash
   docker compose up -d
   ```

### Runtime Access

The stack is provisioned on the following ports:

| Service    | Port   | URL                     |
| ---------- | ------ | ----------------------- |
| Prometheus | `9090` | `http://localhost:9090` |
| Grafana    | `3010` | `http://localhost:3010` |

Credentials for Grafana are configured in the compose file:

```text
username: admin
password: admin
```

The `prometheus.yml` configuration points Prometheus to the `host.docker.internal` network host and uses the repository's `prometheus` and `grafana` provisioned directories.

## 📖 API Documentation

The observability stack is primarily a UI and metrics stack rather than an HTTP API service. Its user-facing documentation is the Grafana dashboard UI and the Prometheus targets/health URLs:

```text
http://localhost:9090/targets
http://localhost:3010
http://localhost:9090/-/healthy
http://localhost:3010/api/health
```

## 🧪 Testing

The repository includes operational and smoke scripts for the observability stack in the `tests` folder:

```bash
./tests/alert-test.sh
./tests/load-test.sh
```

These scripts are designed to verify the alert rules and to exercise the Prometheus/Grafana monitoring setup in a lightweight way.

---

## ⭐ Support this Project

If this monitoring stack helps you observe the marketplace ecosystem clearly, consider giving the repository a star on GitHub.

---

<div align="center">

Made with ♥ by **[João Otávio Schonarth](https://github.com/joschonarth)**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/joschonarth)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/joschonarth)
[![Gmail](https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:joschonarth@gmail.com)

</div>
