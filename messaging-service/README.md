<div align="center">

# 📨 Messaging Service

_A RabbitMQ messaging infrastructure for the marketplace microservices platform._

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

The messaging service is the RabbitMQ runtime that powers asynchronous communication inside the marketplace microservices architecture. It is defined as a Docker Compose stack and provides a durable broker that the application services use to exchange payment, order, checkout, and processing messages.

This stack is the event backbone of the platform, providing the publish-subscribe and queue-based exchange patterns that decouple the API gateway, checkout, products, users, and payments services from synchronous integration.

## 🏗️ Role in the Architecture

The messaging service is not a business API. It is the infrastructure component responsible for the message bus used across the repository. In the compose file, RabbitMQ is started as a service named `rabbitmq` with the management plugin image `rabbitmq:3-management` and a persistent named volume.

Runtime access is exposed on the following ports:

- `5672` — AMQP client connection port
- `15672` — RabbitMQ management UI port

The service is configured with the default administrative credentials:

```text
username: admin
password: admin
```

The repository services already use these runtime connection values for RabbitMQ, including the `RABBITMQ_URL` variable as `amqp://admin:admin@localhost:5672` in the service environment templates.

## 🧠 Architecture Concepts

The messaging infrastructure implements the following architecture concepts directly in the compose file and the service code patterns across the monorepo:

- **Message Queue** — the broker supports FIFO-style routing of messages between producers and consumers using AMQP queues.
- **Publish/Subscribe** — the project uses topics and exchanges such as `payments`, `payment.order`, and `payment.result` in the payment and event modules.
- **Event-Driven Architecture** — services use asynchronous message exchange instead of synchronous request chaining for payment and order coordination.
- **Dead Letter Queue** — the payments service and the event configuration include retry and DLQ routing patterns for failed message handling.
- **Database per Service** — the broker supports independent event traffic without consolidating business data into a shared schema.

## 🛠️ Technologies

- 🐳 **[Docker Compose](https://docs.docker.com/compose/)** — starts the broker in an isolated local development container.
- 🐇 **[RabbitMQ](https://www.rabbitmq.com/)** — the AMQP broker used for asynchronous service-to-service event exchange.
- 🌐 **[RabbitMQ Management UI](https://www.rabbitmq.com/docs/management)** — runs in the same image and is exposed on port `15672`.
- 🧾 **[YAML](https://yaml.org/)** — the infrastructure configuration is declared in the repository's compose file.

## ✨ Features

- [x] 📨 Start a RabbitMQ broker with a persistent volume
- [x] 🌍 Expose AMQP traffic on port `5672`
- [x] 🖥️ Expose the RabbitMQ management UI on port `15672`
- [x] 🔐 Configure administrative credentials from the environment block
- [x] ♻️ Keep the broker restarted automatically with the `restart: unless-stopped` policy

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/joschonarth/marketplace-ms.git
   ```

2. Move into the messaging service directory:

   ```bash
   cd marketplace-ms/messaging-service
   ```

3. Start RabbitMQ:

   ```bash
   docker compose up -d
   ```

You can then reach the management UI at:

```text
http://localhost:15672
```

Use the configured credentials:

```text
username: admin
password: admin
```

The broker data volume is persisted through the declared `rabbitmq_data` volume.

## 📖 API Documentation

The messaging service is infrastructure-oriented rather than an HTTP application with Swagger endpoints. Its operational UI is the RabbitMQ management interface:

```text
http://localhost:15672
```

The UI gives access to exchanges, queues, bindings, and broker health from the same RabbitMQ image.

## 🧪 Testing

This messaging folder does not contain automated source tests. The repository's runtime and operational verification relies on the application services' own test suites and the observability stack's smoke scripts rather than a direct test suite inside this infrastructure-only folder.

---

## ⭐ Support this Project

If this messaging backbone helps you run the platform reliably, consider giving the repository a star on GitHub.

---

<div align="center">

Made with ♥ by **[João Otávio Schonarth](https://github.com/joschonarth)**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/joschonarth)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/joschonarth)
[![Gmail](https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:joschonarth@gmail.com)

</div>
