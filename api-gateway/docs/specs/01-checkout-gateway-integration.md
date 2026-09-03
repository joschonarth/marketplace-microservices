# SPEC: Integração do checkout-service com o api-gateway

**Serviço:** api-gateway + checkout-service  
**Portas:** 3005 (api-gateway) / 3003 (checkout-service)  
**Status:** Pendente  
**Criado em:** 2026-03-05  
**Depende de:** checkout-service specs [01](../../../checkout-service/docs/specs/01-fix-infrastructure-port-conflicts-and-broken-test.md) a [04](../../../checkout-service/docs/specs/04-implement-order-checkout.md), products-service spec [05-gateway-integration](../../../products-service/docs/specs/05-gateway-integration.md)

---

## 1. Objetivo

Expor as rotas de carrinho e pedidos do `checkout-service` através do `api-gateway`, criando os proxy controllers necessários no gateway para que o consumidor (frontend, curl, Postman) acesse todas as funcionalidades de checkout exclusivamente pela porta 3005.

Esta spec **NÃO** altera o `checkout-service`, o `ProxyService`, nem qualquer mecanismo de resiliência existente no gateway. Também **NÃO** cria rotas para o `payments-service` — isso será feito em spec separada.

---

## 2. Contexto

### 2.1 checkout-service (porta 3003)

O `checkout-service` já possui (specs 01 a 04):

- NestJS configurado com `ValidationPipe` global
- TypeORM conectado ao PostgreSQL
- Autenticação JWT com guard global (`JwtAuthGuard` via `APP_GUARD`) — todas as rotas exigem token JWT por padrão
- O usuário autenticado está disponível em `req.user` com `{ id, email, role }` (extraído do payload JWT, campo `sub`)
- `CartController` (`@Controller('cart')`):
  - `POST /cart/items` — adiciona item ao carrinho (body: `{ productId: UUID, quantity: number }`)
  - `GET /cart` — retorna o carrinho ativo do usuário
  - `DELETE /cart/items/:itemId` — remove item do carrinho
- `OrdersController` (`@Controller()` sem prefixo):
  - `POST /cart/checkout` — finaliza o carrinho e cria um pedido (body: `{ paymentMethod: string }`, valores aceitos: `credit_card`, `debit_card`, `pix`, `boleto`)
  - `GET /orders` — lista pedidos do usuário (ordenados por data decrescente)
  - `GET /orders/:id` — retorna detalhes de um pedido específico
- `ProductsClientService` que consulta o `products-service` para validar produtos ao adicionar ao carrinho
- `PaymentQueueService` que publica mensagens no RabbitMQ ao criar pedidos
- Entidades: `Cart` (com `CartItem`) e `Order`
- Enums: `CartStatus` (`active`, `completed`, `abandoned`), `OrderStatus` (`pending`, `paid`, `failed`, `cancelled`)

### 2.2 api-gateway (porta 3005)

O `api-gateway` já possui:

- `ProxyModule` com `ProxyService` que implementa circuit breaker, retry com backoff exponencial, timeout e fallback
- `serviceConfig` em `gateway.config.ts` com entrada `checkout` configurada: `{ url: 'http://localhost:3003', timeout: 10000 }`
- `ProxyService` já aceita `'checkout'` como `serviceName` e possui fallback configurado (retorna erro "checkout service unavailable")
- O `ProxyService` repassa headers (incluindo `Authorization`) e injeta headers `x-user-id`, `x-user-email`, `x-user-role` via parâmetro `userInfo`
- Erros 4xx do backend são repassados ao cliente sem acionar retry ou circuit breaker
- `AuthModule` com `JwtStrategy`, `JwtAuthGuard`, decorators `@CurrentUser()`, `@Public()`, `@Roles()`
- `UsersModule` com `AuthProxyController` e `UsersProxyController` — proxy de rotas `/auth/*` e `/users/*` para o users-service
- `ProductsModule` com `ProductsController` — proxy de rotas `/products/*` para o products-service
- `AppModule` que importa `ProxyModule`, `AuthModule`, `UsersModule`, `ProductsModule` e demais módulos
- Swagger configurado em `/api`
- Rate limiting global via `CustomThrottlerGuard`
- `LoggingMiddleware` aplicado em todas as rotas
- **Não possui** controllers que exponham rotas de carrinho ou pedidos

### 2.3 Padrão de Referência

Os controllers de proxy existentes (`UsersProxyController`, `AuthProxyController`, `ProductsController`) seguem um padrão consistente:

- Cada controller recebe `ProxyService` via injeção de dependência
- Rotas protegidas usam `@UseGuards(JwtAuthGuard)`, `@Headers('authorization')` e `@CurrentUser()` para repassar autenticação
- O módulo importa `ProxyModule` e declara os controllers
- O módulo é registrado no `AppModule`

Esta spec aplica exatamente o mesmo padrão ao `checkout-service`.

### 2.4 Lacunas Identificadas

| Lacuna                                   | Onde        | Impacto                                                |
| ---------------------------------------- | ----------- | ------------------------------------------------------ |
| Não existem rotas `/cart/*` no gateway   | api-gateway | Consumidor não consegue acessar o carrinho via gateway |
| Não existem rotas `/orders/*` no gateway | api-gateway | Consumidor não consegue consultar pedidos via gateway  |
| Não existe `CheckoutModule` no gateway   | api-gateway | Não há agrupamento lógico das rotas de checkout        |

---

## 3. Requisitos Funcionais — api-gateway

### RF-01: CheckoutModule

Deve ser criado um módulo `CheckoutModule` no gateway que agrupe os controllers de proxy para o `checkout-service`:

- Importa o `ProxyModule` (para acesso ao `ProxyService`)
- Declara dois controllers: `CartProxyController` e `OrdersProxyController`
- Deve ser registrado no array `imports` do `AppModule`

### RF-02: CartProxyController

Deve ser criado um controller com prefixo `/cart` que encaminhe requisições de carrinho para o `checkout-service` via `ProxyService`:

| Rota no Gateway       | Método | Encaminha para no checkout-service | Dados repassados              |
| --------------------- | ------ | ---------------------------------- | ----------------------------- |
| `/cart/items`         | POST   | `POST /cart/items`                 | body, authorization, userInfo |
| `/cart`               | GET    | `GET /cart`                        | authorization, userInfo       |
| `/cart/items/:itemId` | DELETE | `DELETE /cart/items/:itemId`       | authorization, userInfo       |

**Regras:**

- Todas as rotas são protegidas por `JwtAuthGuard` (aplicado no nível do controller)
- O header `Authorization` deve ser capturado e repassado ao `checkout-service`
- As informações do usuário autenticado (`userId`, `email`, `role`) devem ser repassadas via parâmetro `userInfo` do `ProxyService`
- O body da requisição deve ser repassado sem transformação nas rotas que o recebem (POST)
- O parâmetro `:itemId` deve ser capturado e incluído no path encaminhado ao checkout-service

### RF-03: OrdersProxyController

Deve ser criado um controller que encaminhe requisições de checkout e pedidos para o `checkout-service` via `ProxyService`:

| Rota no Gateway  | Método | Encaminha para no checkout-service | Dados repassados              |
| ---------------- | ------ | ---------------------------------- | ----------------------------- |
| `/cart/checkout` | POST   | `POST /cart/checkout`              | body, authorization, userInfo |
| `/orders`        | GET    | `GET /orders`                      | authorization, userInfo       |
| `/orders/:id`    | GET    | `GET /orders/:id`                  | authorization, userInfo       |

**Regras:**

- Todas as rotas são protegidas por `JwtAuthGuard`
- O header `Authorization` deve ser capturado e repassado
- As informações do usuário autenticado devem ser repassadas via `userInfo`
- O body da requisição deve ser repassado sem transformação na rota de checkout (POST)
- O parâmetro `:id` deve ser capturado e incluído no path encaminhado
- O controller precisa lidar com dois prefixos distintos (`/cart/checkout` e `/orders/*`); a abordagem recomendada é um controller sem prefixo fixo, usando paths completos em cada rota

### RF-04: Registro do CheckoutModule no AppModule

O `CheckoutModule` deve ser adicionado ao array `imports` do `AppModule` do gateway, ao lado dos módulos existentes (`UsersModule`, `ProductsModule`, etc.).

### RF-05: Repasse do Header Authorization

Todas as rotas de proxy criadas nesta spec devem capturar o header `Authorization: Bearer <token>` da requisição do cliente e repassá-lo ao `checkout-service` através do parâmetro `headers` do `ProxyService.proxyRequest()`. Isso é necessário porque o `checkout-service` possui seu próprio `JwtAuthGuard` que valida o token independentemente.

---

## 4. Fluxo Completo Esperado (via gateway na porta 3005)

O fluxo E2E deve funcionar inteiramente através do gateway. O consumidor **nunca** acessa o checkout-service diretamente.

### 4.1 Autenticação (pré-requisito)

```
Cliente → POST http://localhost:3005/auth/login (body com email e password)
       → Gateway encaminha para users-service
       → Retorna token JWT no campo access_token
```

### 4.2 Adicionar Item ao Carrinho

```
Cliente → POST http://localhost:3005/cart/items
         Header: Authorization: Bearer <token>
         Body: { "productId": "<uuid>", "quantity": 2 }
       → Gateway valida o token via JwtAuthGuard
       → CartProxyController chama ProxyService.proxyRequest('checkout', 'POST', '/cart/items', body, { authorization }, userInfo)
       → ProxyService encaminha para http://localhost:3003/cart/items (com Authorization + x-user-*)
       → checkout-service valida o token, consulta o products-service para validar o produto, adiciona ao carrinho
       → Resposta com o carrinho atualizado retorna ao cliente via gateway
```

### 4.3 Visualizar Carrinho

```
Cliente → GET http://localhost:3005/cart
         Header: Authorization: Bearer <token>
       → Gateway valida o token via JwtAuthGuard
       → CartProxyController chama ProxyService.proxyRequest('checkout', 'GET', '/cart', undefined, { authorization }, userInfo)
       → ProxyService encaminha para http://localhost:3003/cart
       → checkout-service retorna o carrinho ativo do usuário (ou { items: [], total: 0 } se vazio)
       → Resposta retorna ao cliente via gateway
```

### 4.4 Remover Item do Carrinho

```
Cliente → DELETE http://localhost:3005/cart/items/<itemId>
         Header: Authorization: Bearer <token>
       → Gateway valida o token via JwtAuthGuard
       → CartProxyController chama ProxyService.proxyRequest('checkout', 'DELETE', '/cart/items/<itemId>', undefined, { authorization }, userInfo)
       → ProxyService encaminha para http://localhost:3003/cart/items/<itemId>
       → checkout-service remove o item e retorna o carrinho atualizado
       → Resposta retorna ao cliente via gateway
       → Se item não encontrado: checkout-service retorna 404 → gateway repassa 404
```

### 4.5 Finalizar Compra (Checkout)

```
Cliente → POST http://localhost:3005/cart/checkout
         Header: Authorization: Bearer <token>
         Body: { "paymentMethod": "pix" }
       → Gateway valida o token via JwtAuthGuard
       → OrdersProxyController chama ProxyService.proxyRequest('checkout', 'POST', '/cart/checkout', body, { authorization }, userInfo)
       → ProxyService encaminha para http://localhost:3003/cart/checkout
       → checkout-service cria o pedido, marca o carrinho como completed, publica mensagem de pagamento no RabbitMQ
       → Resposta com o pedido criado retorna ao cliente via gateway
       → Se carrinho vazio: checkout-service retorna 400 → gateway repassa 400
```

### 4.6 Listar Pedidos

```
Cliente → GET http://localhost:3005/orders
         Header: Authorization: Bearer <token>
       → Gateway valida o token via JwtAuthGuard
       → OrdersProxyController chama ProxyService.proxyRequest('checkout', 'GET', '/orders', undefined, { authorization }, userInfo)
       → ProxyService encaminha para http://localhost:3003/orders
       → checkout-service retorna array de pedidos do usuário (ordenados por data decrescente)
       → Resposta retorna ao cliente via gateway
```

### 4.7 Detalhe de um Pedido

```
Cliente → GET http://localhost:3005/orders/<orderId>
         Header: Authorization: Bearer <token>
       → Gateway valida o token via JwtAuthGuard
       → OrdersProxyController chama ProxyService.proxyRequest('checkout', 'GET', '/orders/<orderId>', undefined, { authorization }, userInfo)
       → ProxyService encaminha para http://localhost:3003/orders/<orderId>
       → checkout-service retorna os dados do pedido
       → Resposta retorna ao cliente via gateway
       → Se pedido não encontrado: checkout-service retorna 404 → gateway repassa 404
```

---

## 5. Respostas Esperadas

### 5.1 POST /cart/items — 200/201 OK (item adicionado)

Retorna o carrinho com o item adicionado:

```json
{
  "id": "uuid-do-carrinho",
  "userId": "uuid-do-usuario",
  "status": "active",
  "total": 59.98,
  "items": [
    {
      "id": "uuid-do-item",
      "productId": "uuid-do-produto",
      "productName": "Nome do Produto",
      "price": 29.99,
      "quantity": 2,
      "subtotal": 59.98
    }
  ],
  "createdAt": "2026-03-05T...",
  "updatedAt": "2026-03-05T..."
}
```

### 5.2 GET /cart — 200 OK (carrinho vazio)

```json
{
  "items": [],
  "total": 0
}
```

### 5.3 POST /cart/checkout — 200/201 OK (pedido criado)

```json
{
  "id": "uuid-do-pedido",
  "userId": "uuid-do-usuario",
  "cartId": "uuid-do-carrinho",
  "amount": 59.98,
  "status": "pending",
  "paymentMethod": "pix",
  "createdAt": "2026-03-05T...",
  "updatedAt": "2026-03-05T..."
}
```

### 5.4 POST /cart/checkout — 400 Bad Request (carrinho vazio)

```json
{
  "statusCode": 400,
  "message": "Carrinho vazio ou não encontrado",
  "error": "Bad Request"
}
```

### 5.5 GET /orders — 200 OK

```json
[
  {
    "id": "uuid-do-pedido",
    "userId": "uuid-do-usuario",
    "cartId": "uuid-do-carrinho",
    "amount": 59.98,
    "status": "pending",
    "paymentMethod": "pix",
    "createdAt": "2026-03-05T...",
    "updatedAt": "2026-03-05T..."
  }
]
```

### 5.6 GET /orders/:id — 404 Not Found

```json
{
  "statusCode": 404,
  "message": "Pedido não encontrado",
  "error": "Not Found"
}
```

### 5.7 Qualquer rota sem token — 401 Unauthorized

```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 5.8 Checkout-service indisponível — fallback do gateway

Quando o `checkout-service` está fora do ar e o circuit breaker é acionado:

```json
{
  "error": "Service unavailable",
  "service": "checkout",
  "message": "checkout service unavailable"
}
```

---

## 6. Estrutura de Pastas Esperada

Novos arquivos a serem criados no `api-gateway`:

```
api-gateway/
└── src/
    ├── app.module.ts                             # (alterado) importar CheckoutModule
    └── checkout/
        ├── checkout.module.ts                    # (novo) importa ProxyModule, declara controllers
        ├── cart-proxy.controller.ts              # (novo) proxy de /cart/* para checkout-service
        └── orders-proxy.controller.ts            # (novo) proxy de /cart/checkout e /orders/* para checkout-service
```

Nenhum arquivo existente será removido. Apenas o `AppModule` será alterado para incluir o novo módulo.

---

## 7. Critérios de Aceite

### CA-01: Adicionar item ao carrinho via gateway

- [ ] `POST http://localhost:3005/cart/items` com token JWT válido e body `{ "productId": "<uuid>", "quantity": 1 }` retorna o carrinho com o item adicionado
- [ ] O item é persistido no banco de dados do checkout-service
- [ ] `POST http://localhost:3005/cart/items` sem token retorna `401 Unauthorized`
- [ ] `POST http://localhost:3005/cart/items` com `productId` inexistente retorna `404` (repassado do checkout-service que consulta o products-service)
- [ ] `POST http://localhost:3005/cart/items` com body inválido (ex: `quantity` negativa) retorna `400 Bad Request`

### CA-02: Visualizar carrinho via gateway

- [ ] `GET http://localhost:3005/cart` com token JWT válido retorna o carrinho ativo do usuário
- [ ] Se o usuário não tem carrinho ativo, retorna `{ "items": [], "total": 0 }`
- [ ] `GET http://localhost:3005/cart` sem token retorna `401 Unauthorized`
- [ ] O carrinho retornado contém os itens adicionados anteriormente com `productName`, `price`, `quantity` e `subtotal`

### CA-03: Remover item do carrinho via gateway

- [ ] `DELETE http://localhost:3005/cart/items/<itemId>` com token JWT válido remove o item e retorna o carrinho atualizado
- [ ] O total do carrinho é recalculado após a remoção
- [ ] `DELETE http://localhost:3005/cart/items/<itemId>` com `itemId` inexistente retorna `404`
- [ ] `DELETE http://localhost:3005/cart/items/<itemId>` sem token retorna `401 Unauthorized`

### CA-04: Checkout via gateway

- [ ] `POST http://localhost:3005/cart/checkout` com token JWT válido e body `{ "paymentMethod": "pix" }` cria um pedido e retorna os dados do pedido com status `pending`
- [ ] O carrinho é marcado como `completed` no banco do checkout-service
- [ ] `POST http://localhost:3005/cart/checkout` com carrinho vazio retorna `400 Bad Request`
- [ ] `POST http://localhost:3005/cart/checkout` sem token retorna `401 Unauthorized`
- [ ] `POST http://localhost:3005/cart/checkout` com `paymentMethod` inválido retorna `400 Bad Request`

### CA-05: Listar pedidos via gateway

- [ ] `GET http://localhost:3005/orders` com token JWT válido retorna array de pedidos do usuário
- [ ] Os pedidos são retornados em ordem decrescente de data de criação
- [ ] Se o usuário não tem pedidos, retorna array vazio `[]`
- [ ] `GET http://localhost:3005/orders` sem token retorna `401 Unauthorized`

### CA-06: Detalhar pedido via gateway

- [ ] `GET http://localhost:3005/orders/<orderId>` com token JWT válido retorna os dados do pedido
- [ ] `GET http://localhost:3005/orders/<orderId>` com ID inexistente retorna `404 Not Found`
- [ ] `GET http://localhost:3005/orders/<orderId>` sem token retorna `401 Unauthorized`
- [ ] O usuário só consegue acessar seus próprios pedidos (o checkout-service filtra por `userId`)

### CA-07: Erros 4xx do checkout-service são repassados corretamente

- [ ] Erros 4xx retornados pelo checkout-service (400, 404, etc.) são repassados ao cliente com o mesmo status code e body
- [ ] O circuit breaker não é acionado por erros 4xx
- [ ] O retry não é executado para erros 4xx

### CA-08: Resiliência do gateway funciona para o checkout-service

- [ ] Com o checkout-service parado, as rotas de checkout retornam o fallback configurado ("checkout service unavailable")
- [ ] Após o checkout-service voltar, as rotas voltam a funcionar normalmente (circuit breaker reseta)

### CA-09: Serviços iniciam sem erros

- [ ] `npm run start:dev` no api-gateway inicia na porta 3005 sem erros de compilação
- [ ] O `CheckoutModule` é carregado corretamente (visível nos logs de inicialização do NestJS)
- [ ] Nenhum conflito de rotas com os controllers existentes

### CA-10: Lint passa sem erros

- [ ] Executar `npm run lint` no api-gateway não apresenta erros nos arquivos criados ou alterados

---

## 8. Fluxo de Teste E2E via curl

Sequência completa para validar o fluxo de ponta a ponta passando pelo gateway:

```bash
# 0. Pré-requisito: users-service (3000), products-service (3001), checkout-service (3003) e api-gateway (3005) rodando
# Pré-requisito: pelo menos um produto cadastrado no products-service

# 1. Fazer login e obter token
curl -s -X POST http://localhost:3005/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer@email.com","password":"Str0ng!Pass"}'
# → Esperado: 200 OK com access_token — Guardar o token retornado

# 2. Adicionar item ao carrinho
curl -s -X POST http://localhost:3005/cart/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"productId":"<PRODUCT_UUID>","quantity":2}'
# → Esperado: 200/201 com o carrinho contendo o item adicionado

# 3. Visualizar carrinho
curl -s http://localhost:3005/cart \
  -H "Authorization: Bearer <TOKEN>"
# → Esperado: 200 OK com carrinho ativo, items e total

# 4. Adicionar outro item
curl -s -X POST http://localhost:3005/cart/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"productId":"<OUTRO_PRODUCT_UUID>","quantity":1}'
# → Esperado: 200/201 com carrinho contendo 2 itens

# 5. Remover o segundo item
curl -s -X DELETE http://localhost:3005/cart/items/<ITEM_ID> \
  -H "Authorization: Bearer <TOKEN>"
# → Esperado: 200 OK com carrinho contendo 1 item, total recalculado

# 6. Finalizar compra (checkout)
curl -s -X POST http://localhost:3005/cart/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"paymentMethod":"pix"}'
# → Esperado: 200/201 com dados do pedido, status "pending"

# 7. Tentar checkout novamente (carrinho vazio)
curl -s -X POST http://localhost:3005/cart/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"paymentMethod":"pix"}'
# → Esperado: 400 Bad Request — "Carrinho vazio ou não encontrado"

# 8. Listar pedidos
curl -s http://localhost:3005/orders \
  -H "Authorization: Bearer <TOKEN>"
# → Esperado: 200 OK com array contendo o pedido criado no passo 6

# 9. Detalhar pedido
curl -s http://localhost:3005/orders/<ORDER_ID> \
  -H "Authorization: Bearer <TOKEN>"
# → Esperado: 200 OK com dados completos do pedido

# 10. Tentar acessar pedido inexistente
curl -s http://localhost:3005/orders/00000000-0000-0000-0000-000000000000 \
  -H "Authorization: Bearer <TOKEN>"
# → Esperado: 404 Not Found — "Pedido não encontrado"

# 11. Tentar acessar sem token (qualquer rota)
curl -s http://localhost:3005/cart
# → Esperado: 401 Unauthorized

curl -s http://localhost:3005/orders
# → Esperado: 401 Unauthorized
```

Todos os comandos acima devem retornar as respostas esperadas sem erros.

---

## 9. Fora de Escopo

- Alteração no `checkout-service` (controllers, services, entities, DTOs — tudo já está funcional)
- Alteração no `ProxyService`, `RetryService`, `CircuitBreakerService` ou qualquer mecanismo de resiliência do gateway
- Criação de rotas para o `payments-service` (será feito em spec separada)
- Alteração nos guards de autenticação existentes do gateway
- DTOs de validação no gateway (o gateway repassa o body sem transformação; a validação é feita no checkout-service)
- Swagger específico para rotas de checkout no gateway
- Testes unitários dos proxy controllers (os controllers são proxies simples e a lógica de negócio está no checkout-service)
- Rate limiting específico para rotas de checkout
- Deploy, containerização ou Docker Compose
- Health check do checkout-service via gateway (já funciona pela infraestrutura existente do `HealthCheckService`)

---

## 10. Dependências desta Spec

- **checkout-service:** Specs 01 a 04 implementadas — endpoints de cart e orders funcionais
- **api-gateway:** `ProxyModule` com `ProxyService` funcional
- **api-gateway:** `gateway.config.ts` com entrada `checkout` configurada
- **api-gateway:** `AuthModule` com `JwtAuthGuard` e decorators funcionais
- **Serviço externo:** `users-service` funcional para autenticação e geração de tokens JWT
- **Serviço externo:** `products-service` funcional (o checkout-service consulta produtos ao adicionar itens)
- **Infraestrutura:** RabbitMQ rodando (para a fila de pagamento do checkout no momento do checkout)
- **Banco de dados:** PostgreSQL rodando com banco do checkout-service
