# SPEC: Integração do Payments no API Gateway e Teste E2E do Marketplace

**Escopo:** api-gateway, checkout-service (limpeza), teste E2E  
**Status:** Proposta  
**Autor:** Arquitetura  
**Data:** 2026-03-05

---

## 1. Visão Geral

O `payments-service` já está completo e funcional (entidade `Payment`, `FakePaymentGatewayService`, consumer RabbitMQ, endpoint `GET /payments/:orderId`, health check). Porém, ele ainda não é acessível através do `api-gateway`.

Esta spec define:

- A criação do proxy de pagamentos no `api-gateway` para expor o `payments-service` ao mundo externo
- A limpeza de um endpoint de teste remanescente no `checkout-service`
- O roteiro de teste E2E que valida o fluxo completo do marketplace, desde o registro de usuários até a consulta de pagamentos processados

---

## 2. Escopo

### Incluso

- Criação do `PaymentsModule` no `api-gateway` com proxy para o `payments-service`
- Remoção do endpoint de teste `POST /test/send-message` do `checkout-service`
- Roteiro de teste E2E cobrindo o fluxo completo do marketplace via `api-gateway`

### Fora de escopo

- Alterações no `payments-service` (já está completo)
- Alterações no `checkout-service` além da remoção do endpoint de teste
- Webhook de atualização de status do pedido (checkout ← payments)
- Alterações nos demais serviços (users-service, products-service)

---

## 3. Requisitos Funcionais — API Gateway

### 3.1 PaymentsModule

Criar um novo módulo `PaymentsModule` no `api-gateway`, seguindo exatamente o mesmo padrão arquitetural dos módulos existentes (`UsersModule`, `ProductsModule`, `CheckoutModule`).

O módulo deve:

- Importar o `ProxyModule` para ter acesso ao `ProxyService`
- Declarar o controller de proxy de pagamentos
- Ser auto-contido e focado exclusivamente no domínio de pagamentos

### 3.2 PaymentsProxyController

Criar um controller `PaymentsProxyController` que atue como proxy entre o gateway e o `payments-service`.

| Método | Rota no Gateway      | Rota no Payments-Service | Autenticação    | Descrição                       |
| ------ | -------------------- | ------------------------ | --------------- | ------------------------------- |
| GET    | `/payments/:orderId` | `/payments/:orderId`     | JWT obrigatório | Consultar pagamento por orderId |

Comportamento esperado:

- Utilizar o `ProxyService` existente com o service name `'payments'` (já configurado em `gateway.config.ts`)
- Proteger o endpoint com `JwtAuthGuard`, exigindo token válido
- Propagar os headers de autorização e informações do usuário (`x-user-id`, `x-user-email`, `x-user-role`) para o serviço downstream, seguindo o padrão dos demais controllers
- Em caso de sucesso, retornar a resposta do `payments-service` diretamente (200 com dados do pagamento)
- Em caso de pagamento não encontrado, retornar 404 (propagado do `payments-service`)

### 3.3 Registro no AppModule

Importar e registrar o `PaymentsModule` no array de imports do `AppModule` do `api-gateway`, junto aos demais módulos de domínio já registrados (`ProductsModule`, `UsersModule`, `CheckoutModule`).

---

## 4. Limpeza no Checkout-Service

### 4.1 Remoção do endpoint de teste

Remover o endpoint `POST /test/send-message` do `AppController` do `checkout-service`. Este endpoint foi criado apenas para testes manuais durante o desenvolvimento e não deve existir em ambiente de produção.

**O que remover:**

- O método `testSendMessage` do `AppController`
- A injeção do `PaymentQueueService` no construtor do `AppController` (se não for utilizada por outros métodos)
- Os imports que se tornarem órfãos após a remoção (`PaymentQueueService`, `PaymentOrderMessage`, `Body`, `Post`, `Public` — apenas se não forem mais necessários)

**O que manter intacto:**

- `GET /` — endpoint raiz do serviço
- `GET /health` — health check (se existir no `AppController`)
- Todos os demais controllers, services e módulos do `checkout-service`

---

## 5. Teste E2E — Fluxo Completo do Marketplace

O teste E2E deve ser executado inteiramente via `api-gateway` (porta 3005), validando a integração de todos os serviços do marketplace de ponta a ponta.

**Pré-requisitos:** todos os serviços devem estar rodando (users-service:3000, products-service:3001, checkout-service:3003, payments-service:3004, api-gateway:3005, PostgreSQL, RabbitMQ).

### 5.1 Registro e Autenticação

1. **Registrar seller** — criar um usuário com role `seller` via `POST /auth/register`
2. **Registrar buyer** — criar um usuário com role `buyer` via `POST /auth/register`
3. **Login como seller** — autenticar via `POST /auth/login` e obter o token JWT do seller
4. **Login como buyer** — autenticar via `POST /auth/login` e obter o token JWT do buyer

### 5.2 Catálogo de Produtos

5. **Criar produto normal** (autenticado como seller) — criar um produto com preço inteiro (ex: `150.00`) via `POST /products`
6. **Criar produto .99** (autenticado como seller) — criar um produto com preço terminado em `.99` (ex: `49.99`) via `POST /products`. Este preço acionará a regra de rejeição do `FakePaymentGatewayService`
7. **Listar produtos** (autenticado como buyer) — consultar o catálogo via `GET /products` e verificar que ambos os produtos estão disponíveis

### 5.3 Fluxo de Compra — Pagamento Aprovado

8. **Adicionar produto normal ao carrinho** (autenticado como buyer) — via `POST /cart/items`
9. **Visualizar carrinho** — via `GET /cart` e confirmar que o item está presente com quantidade e preço corretos
10. **Realizar checkout** — via `POST /cart/checkout` e obter o `orderId` do pedido criado
11. **Consultar pedido** — via `GET /orders/:orderId` e verificar que o pedido foi criado com status esperado
12. **Aguardar processamento do pagamento** — o `payments-service` processa a mensagem da fila de forma assíncrona; aguardar um intervalo adequado para que o processamento complete (considerar a latência simulada de 500ms–2000ms do `FakePaymentGatewayService`)
13. **Consultar pagamento via gateway** — via `GET /payments/:orderId` (autenticado como buyer) e verificar:
    - Status do pagamento é `approved`
    - `transactionId` está preenchido
    - `rejectionReason` é nulo
    - `orderId` corresponde ao pedido criado
    - `amount` corresponde ao valor do produto

### 5.4 Fluxo de Compra — Pagamento Rejeitado

14. **Adicionar produto .99 ao carrinho** (autenticado como buyer) — via `POST /cart/items`
15. **Visualizar carrinho** — via `GET /cart` e confirmar o item
16. **Realizar checkout** — via `POST /cart/checkout` e obter o novo `orderId`
17. **Consultar pedido** — via `GET /orders/:orderId`
18. **Aguardar processamento do pagamento** — mesmo intervalo do passo 12
19. **Consultar pagamento via gateway** — via `GET /payments/:orderId` (autenticado como buyer) e verificar:
    - Status do pagamento é `rejected`
    - `transactionId` está preenchido
    - `rejectionReason` é `"Cartão recusado pela operadora"`
    - `orderId` corresponde ao pedido criado
    - `amount` corresponde ao valor do produto (.99)

### 5.5 Validações Complementares

20. **Consultar pagamento inexistente** — via `GET /payments/:orderId` com um UUID aleatório e verificar retorno 404
21. **Acesso sem autenticação** — tentar `GET /payments/:orderId` sem token JWT e verificar retorno 401
22. **Health checks** — verificar `GET /health` de todos os serviços via gateway ou diretamente, confirmando que todos estão operacionais

---

## 6. Critérios de Aceite

### CA-01: Proxy de pagamentos no gateway

- `GET /payments/:orderId` no `api-gateway` (porta 3005) deve encaminhar a requisição para `payments-service` (porta 3004) e retornar a resposta corretamente.

### CA-02: Autenticação obrigatória

- `GET /payments/:orderId` no gateway sem token JWT válido deve retornar 401 Unauthorized.

### CA-03: Propagação de headers

- O gateway deve propagar `authorization`, `x-user-id`, `x-user-email` e `x-user-role` ao `payments-service`.

### CA-04: Pagamento não encontrado

- `GET /payments/:orderId` com um `orderId` inexistente deve retornar 404, propagado do `payments-service`.

### CA-05: Endpoint de teste removido

- `POST /test/send-message` no `checkout-service` não deve mais existir. Requisições para essa rota devem retornar 404.

### CA-06: Endpoints preservados no checkout

- `GET /` e `GET /health` do `checkout-service` devem continuar funcionando normalmente após a limpeza.

### CA-07: Fluxo E2E — pagamento aprovado

- O fluxo completo (registro → login → criar produto → adicionar ao carrinho → checkout → consultar pagamento) com um produto de preço inteiro deve resultar em um pagamento com status `approved`.

### CA-08: Fluxo E2E — pagamento rejeitado

- O mesmo fluxo com um produto de preço terminado em `.99` deve resultar em um pagamento com status `rejected` e `rejectionReason` = `"Cartão recusado pela operadora"`.

### CA-09: Consistência de dados

- O `orderId` retornado pelo checkout deve ser o mesmo `orderId` presente no registro de pagamento consultado via gateway.

### CA-10: Registro no AppModule

- O `PaymentsModule` deve estar registrado no `AppModule` do `api-gateway` e o serviço deve iniciar sem erros.

### CA-11: Padrão arquitetural

- O `PaymentsModule` e o `PaymentsProxyController` devem seguir os mesmos padrões de código, estrutura de pastas e convenções dos módulos existentes no gateway (`UsersModule`, `ProductsModule`, `CheckoutModule`).

---

## 7. Dependências entre Componentes

```
                           API Gateway (:3005)
                          ┌─────────────────────┐
                          │  AuthProxyController │──▶ users-service (:3000)
                          │  UsersProxyController│──▶ users-service (:3000)
                          │  ProductsController  │──▶ products-service (:3001)
                          │  CartProxyController │──▶ checkout-service (:3003)
                          │  OrdersProxyController──▶ checkout-service (:3003)
                          │  PaymentsProxyController──▶ payments-service (:3004)  ← NOVO
                          └─────────────────────┘

checkout-service (:3003)                    payments-service (:3004)
┌──────────────────┐                        ┌────────────────────────┐
│  POST /cart/      │    RabbitMQ            │  PaymentConsumerService│
│    checkout       │───▶ payment_queue ───▶│  PaymentsService       │
│                   │                        │  PaymentsController    │
└──────────────────┘                        │  GET /payments/:orderId│
                                            └────────────────────────┘
```

---

## 8. Arquivos Impactados

### API Gateway

| Arquivo                                                 | Ação                               |
| ------------------------------------------------------- | ---------------------------------- |
| `api-gateway/src/payments/payments.module.ts`           | Criar                              |
| `api-gateway/src/payments/payments-proxy.controller.ts` | Criar                              |
| `api-gateway/src/app.module.ts`                         | Alterar (adicionar PaymentsModule) |

### Checkout Service

| Arquivo                                  | Ação                                                     |
| ---------------------------------------- | -------------------------------------------------------- |
| `checkout-service/src/app.controller.ts` | Alterar (remover endpoint de teste e dependências órfãs) |

---

## 9. Observações Técnicas

- O `gateway.config.ts` já possui a configuração do `payments-service` com URL `http://localhost:3004` e timeout de `10000ms`. Não é necessário alterar este arquivo.
- O `ProxyService` já suporta o service name `'payments'` no type union. Não é necessário alterar o proxy.
- A latência do `FakePaymentGatewayService` (500ms–2000ms) deve ser considerada no teste E2E ao aguardar o processamento do pagamento antes de consultá-lo.
- O teste E2E descrito na seção 5 é um roteiro manual/automatizável. A implementação de testes automatizados (e2e test suite) fica a critério da equipe e pode ser tratada em spec futura.
