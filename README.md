<div align="center">

# 🛒 Marketplace Microservices

_A microservices-based marketplace platform with an API gateway, business services, and a RabbitMQ, Prometheus, and Grafana observability layer._

<img src="https://img.shields.io/github/last-commit/joschonarth/marketplace-microservices?style=default&logo=git&logoColor=white&color=3178C6&labelColor=27272a" alt="last-commit">
<img src="https://img.shields.io/github/languages/top/joschonarth/marketplace-microservices?style=default&color=3178C6&labelColor=27272a" alt="repo-top-language">
<img src="https://img.shields.io/github/languages/count/joschonarth/marketplace-microservices?style=default&color=3178C6&labelColor=27272a" alt="repo-language-count">

---

📃 [About](#-about)&nbsp;&nbsp;•&nbsp;&nbsp;
🏗️ [Architecture](#️-architecture)&nbsp;&nbsp;•&nbsp;&nbsp;
🛠️ [Microservices](#️-microservices)&nbsp;&nbsp;•&nbsp;&nbsp;
🧠 [Key Concepts & Patterns](#-key-concepts--patterns)&nbsp;&nbsp;•&nbsp;&nbsp;
⚙️ [Tech Stack](#️-tech-stack)&nbsp;&nbsp;•&nbsp;&nbsp;
📡 [Communication](#-communication)&nbsp;&nbsp;•&nbsp;&nbsp;
🚀 [Getting Started](#-getting-started)

</div>

---

## 📃 About

Marketplace Microservices is a service-oriented marketplace implemented as a monorepo of independently deployable NestJS services. The repository organizes the customer-facing API, business workflows, authentication and users, catalog management, payment orchestration, checkout and ordering, and the observability tooling around a consistent event-driven architecture.

Instead of a single process handling all concerns, the codebase separates responsibilities into service folders such as the API gateway, users service, products service, checkout service, payments service, messaging infrastructure, and observability stack. The design enables isolated database ownership, asynchronous messaging, and focused operational monitoring.

## 🏗️ Architecture

```mermaid
flowchart LR
    Client[Client] --> Gateway[API Gateway]
    Gateway --> Users[users-service]
    Gateway --> Products[products-service]
    Gateway --> Checkout[checkout-service]
    Gateway --> Payments[payments-service]

    Checkout -->|payment.order| RabbitMQ[RabbitMQ]
    RabbitMQ -->|payment.order| Payments
    Payments -->|payment.result| RabbitMQ
    RabbitMQ -->|result flow| Checkout

    Observability[observability-stack\nPrometheus + Grafana] -->|scrape metrics| Gateway
    Observability -->|scrape metrics| Users
    Observability -->|scrape metrics| Products
    Observability -->|scrape metrics| Checkout
    Observability -->|scrape metrics| Payments
```

## 🛠️ Microservices

| Service               | Responsibility                                                                                               | README                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `api-gateway`         | Single entry point for the marketplace and route proxying for users, products, checkout and payment traffic. | [README](./api-gateway/README.md)         |
| `checkout-service`    | Cart, orders, checkout orchestration, and RabbitMQ event publication for payment processing.                 | [README](./checkout-service/README.md)    |
| `messaging-service`   | RabbitMQ broker and management interface for asynchronous event exchange.                                    | [README](./messaging-service/README.md)   |
| `observability-stack` | Prometheus metrics collection and Grafana dashboard provisioning for service observability.                  | [README](./observability-stack/README.md) |
| `payments-service`    | Payment processing, fake gateway simulation, payment result publication, DLQ inspection and metrics.         | [README](./payments-service/README.md)    |
| `products-service`    | Product catalog, product listing, and product-owned data access.                                             | [README](./products-service/README.md)    |
| `users-service`       | Registration, login, authentication flows, and user profile logic.                                           | [README](./users-service/README.md)       |

## 🧠 Key Concepts & Patterns

- **API Gateway Pattern** — the repository exposes a single API entry point in the gateway service that routes incoming traffic to the correct internal service.
- **Database per Service** — the services keep ownership boundaries around their own databases in their code and configuration patterns.
- **Event-Driven Architecture** — the checkout and payments services exchange payment-related events through RabbitMQ instead of synchronous direct calls.
- **Messaging Patterns** — the repository uses publish/subscribe and point-to-point queue patterns across the payment and event transaction flow.
- **Dead Letter Queue (DLQ)** — the payments service includes DLQ inspection, reprocessing, discard, and purge facilities for failed messages.
- **Circuit Breaker** — resilience patterns are represented by the project's gateway proxy and retry/fallback strategy patterns in the infrastructure layer.
- **Rate Limiting** — the gateway and proxy layers show request control patterns that restrict call intensity and protect downstream services.
- **Idempotency** — payment records store order-level processing state, and the payment event model supports repeated order dispatch without duplicate accounting semantics.

## ⚙️ Tech Stack

The repository is mainly implemented in TypeScript through the NestJS framework. Shared technical foundations across the services include:

- 🟦 **[TypeScript](https://www.typescriptlang.org/)** — primary implementation language.
- ⚙️ **[NestJS](https://nestjs.com/)** — modular service framework for the application services.
- 🌐 **[Express](https://expressjs.com/)** — HTTP runtime used by the NestJS application runtime.
- 🐘 **[PostgreSQL](https://www.postgresql.org/)** — relational database technology used across the services.
- 🐇 **[RabbitMQ](https://www.rabbitmq.com/)** — asynchronous event broker used for payment and checkout integration flows.
- 🐳 **[Docker Compose](https://docs.docker.com/compose/)** — local developer and infrastructure orchestration for the messaging and observability services.
- 📊 **[Prometheus](https://prometheus.io/)** — metrics collection and alert evaluation layer.
- 📈 **[Grafana](https://grafana.com/)** — dashboard and visualization layer.
- 🧪 **[Jest](https://jestjs.io/)** — automated test framework used by the services.
- 🐼 **[TypeORM](https://typeorm.io/)** — object-relational mapping pattern applied across the repository's database-backed services.

## 📡 Communication

The repository uses two communication styles:

- **Synchronous HTTP** — the API gateway receives requests and proxies them to the internal services via configured routes and controller patterns.
- **Asynchronous messaging** — the checkout and payments services exchange payment order and payment result events over RabbitMQ exchanges and queues.

This combination enables the gateway to keep a clean external interface while the internal services communicate through durable events for the payment lifecycle.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ or 22+
- [npm](https://www.npmjs.com/)
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- An available Postgres and RabbitMQ instance for the service configuration files

### Local development

From the repository root:

```bash
git clone https://github.com/joschonarth/marketplace-microservices.git
cd marketplace-microservices
```

Then run the required infrastructure services:

```bash
cd messaging-service
docker compose up -d
```

```bash
cd ../observability-stack
docker compose up -d
```

Finally, start each NestJS service separately:

```bash
cd ../api-gateway
npm install
npm run start:dev
```

Repeat the same shape of command for the other service folders:

```bash
cd ../users-service && npm run start:dev
cd ../products-service && npm run start:dev
cd ../checkout-service && npm run start:dev
cd ../payments-service && npm run start:dev
```

The repository's environment examples define ports and credentials such as `3000`, `3001`, `3003`, `3004`, `3005`, and `RABBITMQ_URL=amqp://admin:admin@localhost:5672`.

---

## ⭐ Support this Project

If this marketplace microservices architecture helps you understand how a service-oriented commerce platform is organized, consider giving the repository a star on GitHub.

---

<div align="center">

Made with ♥ by **[João Otávio Schonarth](https://github.com/joschonarth)**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/joschonarth)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/joschonarth)
[![Gmail](https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:joschonarth@gmail.com)

</div>
