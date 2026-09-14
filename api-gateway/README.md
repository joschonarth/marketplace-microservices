<div align="center">

# 🛡️ API Gateway

_A NestJS API Gateway that routes marketplace requests through a single secure entry point._

---

📃 [About](#-about)&nbsp;&nbsp;•&nbsp;&nbsp;
🏗️ [Role in the Architecture](#️-role-in-the-architecture)&nbsp;&nbsp;•&nbsp;&nbsp;
🧠 [Architecture Concepts](#-architecture-concepts)&nbsp;&nbsp;•&nbsp;&nbsp;
🛠️ [Technologies](#️-technologies)&nbsp;&nbsp;•&nbsp;&nbsp;
🚀 [Getting Started](#-getting-started)&nbsp;&nbsp;•&nbsp;&nbsp;
📖 [API Documentation](#-api-documentation)&nbsp;&nbsp;•&nbsp;&nbsp;
🧪 [Testing](#-testing)

</div>

---

## 📃 About

The API Gateway is the public HTTP facade for the marketplace platform. It receives client requests, applies authentication, throttling, request validation, and shared observability concerns, then forwards them to the users, products, checkout, and payments services through a resilient proxy layer.

The gateway provides a unified contract for the front end while keeping internal services independently deployable. It implements the API Gateway pattern for service composition, policy enforcement, and cross-cutting concerns in a single place.

## 🏗️ Role in the Architecture

The API Gateway sits in front of the other services and acts as the single entry point for the system. It receives requests from the client and routes them to the correct downstream service using the internal `ProxyService` configuration and route mappings defined in the gateway controllers.

Its controllers expose the following boundaries:

- `AuthProxyController` handles `POST /auth/register`, `POST /auth/login`, and `GET /auth/validate-token` and forwards the requests to the users service.
- `UsersProxyController` handles profile queries and lookups for users and sellers through the users service.
- `ProductsController` handles product creation, listing, seller filtering, and product lookup through the products service.
- `CartProxyController` and `OrdersProxyController` route cart and order flows to the checkout service.
- `PaymentsProxyController` routes payment lookup by order through the payments service.

The gateway is synchronous over HTTP, while the marketplace services may also use the messaging service for asynchronous event flows. The health controller probes each service through the configured service URLs, making the gateway a central health and routing surface.

## 🧠 Architecture Concepts

The gateway contains several verifiable resilience and protection patterns:

- **API Gateway Pattern** — the gateway centralizes authentication, proxying, security, throttling, metrics, health checks, and service aggregation for all incoming traffic.
- **Circuit Breaker** — the `CircuitBreakerService` wraps service calls and opens the breaker after repeated failures before allowing the proxy to recover.
- **Retry** — the `RetryService` executes retry attempts with exponential backoff for proxy calls across the internal services.
- **Timeout** — the `TimeoutService` enforces time-based constraints for upstream HTTP requests.
- **Fallback** — the `FallbackModule` provides cached and default service fallbacks so the gateway responds safely when a downstream service is unavailable.
- **Rate Limiting** — the `ThrottlerModule` and `CustomThrottlerGuard` limit requests by short, medium, and long windows through the application guard pipeline.
- **Health Checks** — the `HealthController` verifies the liveness of the gateway’s dependent services by calling their configured `/health` endpoints.
- **Observability Middleware** — `MetricsService` collects request counters and latency histograms through `prom-client`, exposed by the metrics controller.

## 🛠️ Technologies

- ⚙️ **[NestJS](https://nestjs.com/)** — modular backend framework that implements the API Gateway controllers, HTTP proxying, and dependency injection.
- 🟦 **[TypeScript](https://www.typescriptlang.org/)** — primary programming language and type system for the service.
- 🌐 **[Express](https://expressjs.com/)** — HTTP server platform used by the NestJS application.
- 📡 **[@nestjs/axios](https://docs.nestjs.com/techniques/http-module)** — client for downstream HTTP service calls and response forwarding.
- ⚙️ **[@nestjs/config](https://docs.nestjs.com/techniques/configuration)** — global configuration and environment binding for the service.
- 🛡️ **[@nestjs/jwt](https://github.com/nestjs/jwt)** — JWT support for token validation and protected resource access.
- 🔐 **[@nestjs/passport](https://github.com/nestjs/passport)** — authentication integration layer with Passport strategies.
- 📘 **[@nestjs/swagger](https://docs.nestjs.com/openapi/introduction)** — OpenAPI documentation generation and Swagger UI setup.
- 🩺 **[@nestjs/terminus](https://docs.nestjs.com/recipes/terminus)** — health checks and health indicator support.
- 🚦 **[@nestjs/throttler](https://github.com/nestjs/throttler)** — request throttling and rate-limiting guards.
- 🧪 **[Jest](https://jestjs.io/)** — unit and end-to-end test framework for the gateway service.
- 🧾 **[class-transformer](https://github.com/typestack/class-transformer)** — runtime DTO transformation support.
- ✅ **[class-validator](https://github.com/typestack/class-validator)** — request validation and DTO constraint enforcement.
- 🔒 **[Helmet](https://helmetjs.github.io/)** — security middleware for HTTP response headers.
- 📊 **[prom-client](https://github.com/siimon/prom-client)** — metric collection and Prometheus-compatible registry output.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+ recommended
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- A running instance of the marketplace services exposed through the environment variables in the gateway `.env` file

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/joschonarth/marketplace-ms.git
   ```

2. Enter the service directory:

   ```bash
   cd marketplace-ms/api-gateway
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

### Environment Variables

The gateway uses an environment file to point at upstream services. Copy the example file and adjust the values as needed:

```bash
cp .env.example .env
```

The example file declares the following keys:

```env
PORT=3005
JWT_SECRET=your-super-secret-jwt-key
USERS_SERVICE_URL=http://localhost:3000
PRODUCTS_SERVICE_URL=http://localhost:3001
CHECKOUT_SERVICE_URL=http://localhost:3003
PAYMENTS_SERVICE_URL=http://localhost:3004
CORS_ORIGIN=*
```

### Run the service

Use the Nest development command:

```bash
npm run start:dev
```

The service listens on the configured `PORT`, defaulting to `3005` and exposing the Swagger docs at:

```text
http://localhost:3005/api
```

## 📖 API Documentation

Interactive API documentation is generated by Swagger UI in the gateway service. After the gateway is running, open the docs at:

```text
http://localhost:3005/api
```

The OpenAPI document includes `JWT-auth` and `session-auth` security schemes. In Swagger UI, choose the **Authorize** button and provide the relevant bearer token or `x-session-token` header when calling protected routes.

## 🧪 Testing

The service includes automated unit and end-to-end tests written with Jest and Supertest. The command to run the suite is:

```bash
npm test
```

The repository also contains an e2e suite configuration under `test/jest-e2e.json` and a test runner script in the package manifest.

---

## ⭐ Support this Project

If this project helps you build or operate a marketplace platform, consider giving the repository a star on GitHub.

---

<div align="center">

Made with ♥ by **[João Otávio Schonarth](https://github.com/joschonarth)**

[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/joschonarth)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/joschonarth)
[![Gmail](https://img.shields.io/badge/Gmail-D14836?style=for-the-badge&logo=gmail&logoColor=white)](mailto:joschonarth@gmail.com)

</div>
