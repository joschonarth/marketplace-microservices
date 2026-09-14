<div align="center">

# 💳 Payments Service

_A NestJS payment processing and event-driven payment result service, backed by PostgreSQL, RabbitMQ, and TypeORM._

---

📃 [About](#-about)&nbsp;&nbsp;•&nbsp;&nbsp;
🏗️ [Role in the Architecture](#️-role-in-the-architecture)&nbsp;&nbsp;•&nbsp;&nbsp;
🧠 [Architecture Concepts](#-architecture-concepts)&nbsp;&nbsp;•&nbsp;&nbsp;
🛠️ [Technologies](#️-technologies)&nbsp;&nbsp;•&nbsp;&nbsp;
💾 [Database Diagram](#-database-diagram)&nbsp;&nbsp;•&nbsp;&nbsp;
🚀 [Getting Started](#-getting-started)&nbsp;&nbsp;•&nbsp;&nbsp;
📖 [API Documentation](#-api-documentation)&nbsp;&nbsp;•&nbsp;&nbsp;
🧪 [Testing](#-testing)

</div>

---

## 📃 About

The payments service implements the marketplace payment processing boundary. It consumes payment requests from the checkout domain, simulates a payment gateway through a fake gateway adapter, records payment outcomes in a relational database, and publishes the final result back into the event exchange for the checkout service.

This service is responsible for storing payment records, validating payment-message structure, orchestrating the payment execution, and exposing the payment record by order ID through a lightweight REST endpoint.

## 🏗️ Role in the Architecture

The payments service is a downstream asynchronous event consumer that participates in the enterprise payment flow. It receives payment-order messages from the checkout service by listening to the `payments` exchange and `payment.order` routing key on the `payment_queue` queue. After a payment record is stored and processed, it publishes a `payment.result` event to the same exchange and uses the result to update the checkout order state.

The service exposes the following HTTP surface:

- `GET /payments/:orderId` — retrieves a persisted `Payment` record by order ID.

It also offers internal operational endpoints under `events/dlq` for inspecting, reprocessing, discarding, or purging failed payment messages from the controlled dead-letter structure.

## 🧠 Architecture Concepts

The service implements several event and resilience patterns in a way that is verifiable from the code:

- **Event-Driven Architecture** — the service consumes `PaymentOrderMessage` objects from RabbitMQ and publishes `PaymentResultMessage` events back to `payments` exchange.
- **Publish/Subscribe and Message Queue** — the queue `payment_queue` is bound to the `payments` exchange with the routing key `payment.order`, and results are published on `payment.result`.
- **Dead Letter Queue (DLQ)** — RabbitMQ configuration in `rabbitmq.service.ts` creates retry and DLQ exchanges and queues, including `payment_queue.dlq`, `payment_queue.retry`, and policy-backed retry/dead-letter routing behavior.
- **Retry** — the subscription code records retry attempts and uses `x-dead-letter-exchange`/`x-dead-letter-routing-key` to move failed messages through the retry exchange before they reach the DLQ.
- **Database per Service** — the service owns the `Payment` entity in PostgreSQL and persists payment state on its own database.
- **Health Checks** — the `HealthController` checks database reachability and the RabbitMQ connection through a custom health indicator.
- **Observability** — the service has a metrics registry and custom metrics classes for payment processing, average latency, retries, and failure summaries.

## 🛠️ Technologies

- ⚙️ **[NestJS](https://nestjs.com/)** — framework for controllers, services, event workers, and module composition.
- 🟦 **[TypeScript](https://www.typescriptlang.org/)** — primary implementation language.
- 🌐 **[Express](https://expressjs.com/)** — HTTP server platform used by the NestJS runtime.
- 📡 **[@nestjs/axios](https://docs.nestjs.com/techniques/http-module)** — HTTP support available in the dependency set.
- 🔐 **[@nestjs/jwt](https://github.com/nestjs/jwt)** — JWT support declared in the dependency file.
- 🛡️ **[@nestjs/passport](https://github.com/nestjs/passport)** — Passport integration used by the service dependency stack.
- 🩺 **[@nestjs/terminus](https://docs.nestjs.com/recipes/terminus)** — health-check support for database and RabbitMQ.
- 🗄️ **[@nestjs/typeorm](https://docs.nestjs.com/techniques/database)** — TypeORM configuration and repository integration.
- 🐘 **[PostgreSQL](https://www.postgresql.org/)** — primary relational datastore for payments.
- 🐇 **[RabbitMQ](https://www.rabbitmq.com/)** — message broker supporting payment-order consumption and payment-result publication.
- 🧾 **[TypeORM](https://typeorm.io/)** — ORM used to map the `Payment` entity.
- 🧪 **[Jest](https://jestjs.io/)** — automated test framework for unit and e2e suites.
- 📊 **[prom-client](https://github.com/siimon/prom-client)** — metrics collection library used by this service’s HTTP metrics and custom service metrics.
- 🐰 **[amqplib](https://www.npmjs.com/package/amqplib)** — client library for RabbitMQ publish and subscribe operations.
- 📡 **[axios](https://axios-http.com/)** — HTTP library declared in the dependency set.
- 🔑 **[bcryptjs](https://www.npmjs.com/package/bcryptjs)** — password-utility package found in the dependency list, although the payment service does not define authentication logic in this service file map.

## 💾 Database Diagram

```mermaid
erDiagram
  PAYMENT {
    uuid id PK
    uuid orderId UK
    uuid userId
    decimal amount
    enum status
    varchar paymentMethod
    varchar transactionId
    varchar rejectionReason
    timestamp processedAt
    timestamp createdAt
    timestamp updatedAt
  }
```

The `Payment` entity stores a one-to-one record per payment request keyed by `orderId`. The entity also preserves the transaction identifier, rejection reason, and processing timestamp after the fake gateway returns a result.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+ recommended
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- PostgreSQL and RabbitMQ reachable through the environment values in the service

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/joschonarth/marketplace-ms.git
   ```

2. Enter the service directory:

   ```bash
   cd marketplace-ms/payments-service
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

### Environment Variables

The service has a `.env.example` file with the values needed for the PostgreSQL database, JWT secret, upstream service URLs, RabbitMQ connectivity, and payment gateway credentials:

```bash
cp .env.example .env
```

The example file declares:

```env
PORT=3004
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5435
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=payments_db
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
USERS_SERVICE_URL=http://localhost:3000
PRODUCTS_SERVICE_URL=http://localhost:3001
CHECKOUT_SERVICE_URL=http://localhost:3003
RABBITMQ_URL=amqp://admin:admin@localhost:5672
RABBITMQ_QUEUE_PAYMENTS=payment_queue
RABBITMQ_EXCHANGE=payments
PAYMENT_GATEWAY_URL=
PAYMENT_GATEWAY_API_KEY=
```

### Database and Messaging

The service creates a `TypeOrmModule` connection using the configured `database.config.ts`, and the RabbitMQ exchange and queue wiring are handled by the `EventsModule` and the `RabbitmqService`.

### Run the service

```bash
npm run start:dev
```

The default port is `3004` if `PORT` is not set in the process environment.

## 📖 API Documentation

The payments service does not currently register a Swagger document in the bootstrap file, and its `main.ts` file contains only the Nest application creation, CORS enablement, and global validation pipe. Because the service is not configured with `@nestjs/swagger`, the endpoint reference is REST-only and the docs remain the route via `GET /payments/:orderId` in the controller.

After the service is started locally, the service is reachable through the gateway’s payment proxy endpoint and the direct service endpoint:

```text
http://localhost:3004/payments/:orderId
```

The gateway forwards GET requests for payment status by order ID, and the service stores the payment result in the relational database for later lookup.

## 🧪 Testing

The service has automated Jest test files for the fake gateway and payment service, as well as a service e2e suite. The command to run tests is:

```bash
npm test
```

The test scaffolding confirms that the code is designed for unit- and e2e-style verification around `Payment`, `PaymentsService`, and the fake payment gateway.

---

## ⭐ Support this Project

If this payment service helps your marketplace process transactions reliably, consider giving the repository a star on GitHub.

---

<div align="center">

Made with ♥ by **[João Otávio Schonarth](https://github.com/joschonarth)**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/joschonarth)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/joschonarth)
[![Gmail](https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:joschonarth@gmail.com)

</div>
