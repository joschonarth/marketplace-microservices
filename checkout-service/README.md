<div align="center">

# 🛒 Checkout Service

_A NestJS checkout, cart, and order orchestration service for the marketplace, powered by PostgreSQL, RabbitMQ, and TypeORM._

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

The checkout service implements the cart, checkout, and order domain for the marketplace. It owns the active cart lifecycle, cart items, order creation, and payment-order publishing flow behind the API Gateway.

The service combines HTTP controllers with event-driven integration to the payments domain. It receives the authenticated caller context from the gateway, creates an order in the order table, and pushes a payment request message to RabbitMQ for downstream payment processing.

## 🏗️ Role in the Architecture

The checkout service receives traffic from the API Gateway through the cart and orders proxy routes. The gateway routes product and checkout business operations into this service in a single synchronous HTTP entrypoint while using the checkout service as the coordinator for order state and payment orchestration.

The concrete observable HTTP routes implemented here are:

- `POST /cart/items` to add a product to the user’s cart.
- `GET /cart` to read the current active cart.
- `DELETE /cart/items/:itemId` to remove a cart line.
- `POST /cart/checkout` to create an order from the active cart.
- `GET /orders` to list orders for the authenticated user.
- `GET /orders/:id` to query a single order by ID.

Internally, the checkout service also publishes payment messages through RabbitMQ with an exchange and routing key such as `payments` and `payment.order`, and consumes `payment.result` messages to update the order status using the payment result consumer.

## 🧠 Architecture Concepts

The checkout service has the following verifiable patterns:

- **Database per Service** — the checkout service owns its own TypeORM/PostgreSQL mapping for the `Cart`, `CartItem`, and `Order` entities.
- **API Gateway Pattern** — the API Gateway proxies traffic and exposes the cart and order endpoints as a single public entry point.
- **Event-Driven Architecture** — the service publishes payment-order messages to RabbitMQ and consumes payment-result messages to update order status.
- **Publish/Subscribe Messaging** — the service uses `RabbitmqService` with a configured exchange in the `payments` domain and publishes messages with a routing key `payment.order`.
- **Request-Reply and Queue Integration** — the payment result consumer subscribes to the queue `payment_result_queue` using the `payments` exchange and `payment.result` routing key.
- **JWT Authentication** — `AuthModule` and the JWT guard establish per-request identity for cart and order flows.
- **Health Checks** — the health controller checks both the database and RabbitMQ channel through a custom health indicator.
- **Observability Middleware** — the metrics service captures HTTP request counters, durations, order creation counters, and RabbitMQ publish counters.

## 🛠️ Technologies

- ⚙️ **[NestJS](https://nestjs.com/)** — framework for controllers, services, modules, and event integration.
- 🟦 **[TypeScript](https://www.typescriptlang.org/)** — primary implementation language.
- 🌐 **[Express](https://expressjs.com/)** — HTTP server platform used by the service.
- 📡 **[@nestjs/axios](https://docs.nestjs.com/techniques/http-module)** — HTTP client support available in the service dependency set.
- 🔐 **[@nestjs/jwt](https://github.com/nestjs/jwt)** — JWT support and authentication semantics.
- 🛡️ **[@nestjs/passport](https://github.com/nestjs/passport)** — Passport wiring for JWT validation.
- 📘 **[@nestjs/swagger](https://docs.nestjs.com/openapi/introduction)** — OpenAPI and Swagger documentation generation.
- 🩺 **[@nestjs/terminus](https://docs.nestjs.com/recipes/terminus)** — health checks and database/RabbitMQ indicators.
- 🗄️ **[@nestjs/typeorm](https://docs.nestjs.com/techniques/database)** — TypeORM integration for repository-backed entities.
- 🐘 **[PostgreSQL](https://www.postgresql.org/)** — relational database engine used by the checkout service.
- 🐇 **[RabbitMQ](https://www.rabbitmq.com/)** — message broker used for payment-order publication and payment-result subscription.
- 🧾 **[TypeORM](https://typeorm.io/)** — ORM for `Cart`, `CartItem`, and `Order` entities.
- 🧪 **[Jest](https://jestjs.io/)** — automated test runner used by the service.
- 🧾 **[class-transformer](https://github.com/typestack/class-transformer)** — DTO transformation and serialization support.
- ✅ **[class-validator](https://github.com/typestack/class-validator)** — validation of request DTOs.
- 📊 **[prom-client](https://github.com/siimon/prom-client)** — metrics registry, counters, and histogram output.
- 🐰 **[amqplib](https://www.npmjs.com/package/amqplib)** — RabbitMQ client library for message publish/consume support.
- 📡 **[axios](https://axios-http.com/)** — HTTP client support used by the checkout service dependencies.

## 💾 Database Diagram

```mermaid
erDiagram
  CART {
    uuid id PK
    uuid userId
    enum status
    decimal total
    timestamp createdAt
    timestamp updatedAt
  }

  CART_ITEM {
    uuid id PK
    uuid cartId FK
    uuid productId
    varchar productName
    decimal price
    int quantity
    decimal subtotal
    timestamp createdAt
  }

  ORDER {
    uuid id PK
    uuid userId
    uuid cartId
    decimal amount
    enum status
    varchar paymentMethod
    timestamp createdAt
    timestamp updatedAt
  }

  CART ||--o{ CART_ITEM : contains
```

The service owns the cart and order records as persistent state. Cart items are attached to a cart via `cartId`, and the order is created from the cart snapshot during checkout.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+ recommended
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- PostgreSQL and RabbitMQ accessible through the configured environment values

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/joschonarth/marketplace-ms.git
   ```

2. Enter the service directory:

   ```bash
   cd marketplace-ms/checkout-service
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

### Environment Variables

The service configuration file binds both the database and messaging endpoints. Copy the example file before running locally:

```bash
cp .env.example .env
```

The example file declares:

```env
PORT=3003
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5434
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=checkout_db
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
USERS_SERVICE_URL=http://localhost:3000
PRODUCTS_SERVICE_URL=http://localhost:3001
PAYMENTS_SERVICE_URL=http://localhost:3004
RABBITMQ_URL=amqp://admin:admin@localhost:5672
RABBITMQ_QUEUE_PAYMENTS=payment_queue
RABBITMQ_EXCHANGE=payments
```

### Database and Messaging

The service connects to PostgreSQL via `TypeOrmModule.forRoot(databaseConfig)` and attempts to establish a RabbitMQ channel in the `RabbitmqService` during module initialization.

### Run the service

```bash
npm run start:dev
```

The service defaults to port `3003` when the environment variable `PORT` is not provided.

## 📖 API Documentation

Swagger UI is installed in the service bootstrap file and exposes the checkout, cart, and order routes through the generated OpenAPI document. After the service is running, the user-facing docs are at:

```text
http://localhost:3003/api
```

The Swagger document uses a JWT bearer auth scheme, so protected routes should be exercised with the token in the `Authorize` panel.

## 🧪 Testing

The checkout service contains controller and service specs, as well as an e2e suite. The test command declared in the package manifest is:

```bash
npm test
```

This service also provides a Jest e2e configuration in `test/jest-e2e.json` and verifies domain entities in the checkout service test folders.

---

## ⭐ Support this Project

If this checkout service helps power your marketplace order flow, consider giving the repository a star on GitHub.

---

<div align="center">

Made with ♥ by **[João Otávio Schonarth](https://github.com/joschonarth)**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/joschonarth)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/joschonarth)
[![Gmail](https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:joschonarth@gmail.com)

</div>
