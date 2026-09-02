# SPEC: Integração do Products Service com o API Gateway

**Serviço:** products-service / api-gateway  
**Porta:** 3001 (products) / 3005 (gateway)  
**Status:** Pendente  
**Criado em:** 2026-03-02

---

## 1. Objetivo

Finalizar a integração entre o `products-service` e o `api-gateway`, de modo que todas as operações de produtos sejam acessíveis exclusivamente através do gateway (porta 3005). Isso envolve: adicionar ao `products-service` os recursos que faltam para operar dentro da arquitetura de gateway (health check e documentação Swagger), criar no gateway o controller que roteia requisições `/products/*` através do `ProxyService` existente, e validar o fluxo completo de ponta a ponta.

---

## 2. Contexto

- O `products-service` (porta 3001) está completo com:
  - Entidade `Product` com TypeORM e PostgreSQL (porta 5434)
  - Autenticação JWT com guard global, decorator `@Public()` e `req.user` contendo `{ id, email, role }`
  - `POST /products` — criação de produto (protegido, apenas sellers)
  - `GET /products` — listagem de produtos ativos (público)
  - `GET /products/seller/:sellerId` — produtos de um vendedor (público)
  - `GET /products/:id` — detalhes de um produto (público)
  - `ValidationPipe` global com `whitelist`, `forbidNonWhitelisted` e `transform`
  - **Não possui** endpoint `/health` para health check
  - **Não possui** documentação Swagger/OpenAPI
  - **Não possui** o pacote `@nestjs/swagger` como dependência

- O `api-gateway` (porta 3005) já possui:
  - `ProxyService` com circuit breaker, retry, timeout e cache fallback — já configurado para o serviço `products` em `gateway.config.ts`
  - `HealthCheckService` que consulta `{SERVICE_URL}/health` para cada serviço registrado (incluindo products)
  - `PRODUCTS_SERVICE_URL=http://localhost:3001` configurado no `.env` e em `gateway.config.ts`
  - Swagger configurado em `/api` com tag "Products" já definida
  - Auth controller (`/auth/login`, `/auth/register`) que roteia para o `users-service` via `HttpService`
  - Guards de autenticação JWT e session já funcionais
  - **Não possui** controller que exponha rotas `/products/*` — o `ProxyService` aceita `'products'` como `serviceName`, mas nenhum controller o utiliza para esse serviço

---

## 3. Requisitos Funcionais — products-service

### RF-01: Endpoint de Health Check — GET /health

O `products-service` deve expor um endpoint `GET /health` que:

- Seja uma rota **pública** (não requer autenticação)
- Retorne status HTTP 200 com o corpo `{ "status": "ok", "service": "products-service" }`
- Esteja acessível na raiz do serviço (`http://localhost:3001/health`), **não** dentro do prefixo `/products`
- Sirva como alvo para o health check do gateway (`HealthCheckService` consulta `{PRODUCTS_SERVICE_URL}/health`)

### RF-02: Documentação Swagger/OpenAPI

O `products-service` deve ter documentação Swagger/OpenAPI que:

- Seja acessível em `/api` (ex: `http://localhost:3001/api`)
- Tenha o título "Products Service" e versão "1.0"
- Inclua suporte a Bearer Auth (botão "Authorize" no Swagger UI para inserir token JWT)
- Documente automaticamente todos os endpoints existentes do `ProductsController`
- Requer que o pacote `@nestjs/swagger` seja adicionado como dependência do projeto

---

## 4. Requisitos Funcionais — api-gateway

### RF-03: Controller de Produtos no Gateway

O `api-gateway` deve possuir um controller que exponha rotas `/products` e encaminhe as requisições para o `products-service` utilizando o `ProxyService` existente:

| Rota no Gateway              | Método | Autenticação | Encaminha para                                       |
| ---------------------------- | ------ | ------------ | ---------------------------------------------------- |
| `/products`                  | POST   | Protegida    | `POST /products` no products-service                 |
| `/products`                  | GET    | Pública      | `GET /products` no products-service                  |
| `/products/seller/:sellerId` | GET    | Pública      | `GET /products/seller/:sellerId` no products-service |
| `/products/:id`              | GET    | Pública      | `GET /products/:id` no products-service              |

**Regras:**

- Deve utilizar o `ProxyService.proxyRequest()` — **não** criar mecanismo de proxy alternativo
- Deve utilizar os guards e decorators já existentes no gateway (`@Public()`, auth guard global)
- Para a rota protegida (`POST /products`): repassar o header `Authorization` da requisição original e as informações do usuário autenticado (`userInfo`) para que o `ProxyService` inclua os headers `x-user-id`, `x-user-email`, `x-user-role`
- Para as rotas públicas: encaminhar a requisição sem necessidade de autenticação

### RF-04: Repasse correto de erros HTTP do backend (4xx)

O `ProxyService` e as camadas de resiliência (`RetryService`, `CircuitBreakerService`) devem distinguir entre **erros de aplicação** (4xx) e **falhas de infraestrutura** (5xx, timeout, conexão recusada):

- **Respostas 4xx** do backend (ex: 404 Not Found, 403 Forbidden, 400 Bad Request) são respostas legítimas da aplicação e devem ser repassadas ao cliente com o mesmo status code e body, **sem** acionar retry, circuit breaker ou fallback
- **Respostas 5xx** e falhas de conexão continuam acionando o pipeline de resiliência (retry → circuit breaker → fallback) normalmente
- O `ProxyService` deve usar `validateStatus: () => true` no Axios para receber todas as respostas sem lançar erro, e tratar manualmente cada faixa de status
- O `RetryService` não deve retentar quando o erro é um `HttpException` com status < 500
- O `CircuitBreakerService` não deve contar como falha quando o erro é um `HttpException` com status < 500

---

## 5. Verificações no API Gateway

Estas verificações confirmam que a infraestrutura do gateway está corretamente preparada para a integração. Devem ser validadas antes ou durante a implementação:

### VR-01: Configuração de URL do Serviço

- `PRODUCTS_SERVICE_URL=http://localhost:3001` está presente no `.env` do gateway
- `gateway.config.ts` contém a entrada `products` com URL e timeout configurados

### VR-02: ProxyService Preparado para Products

- O `ProxyService` aceita `'products'` como `serviceName` válido
- O fallback para requisições GET de produtos utiliza cache ou retorna resposta padrão
- O fallback para outros métodos retorna mensagem de erro "Product service unavailable"

### VR-03: Health Check do Gateway

- O `HealthCheckService` já consulta `{PRODUCTS_SERVICE_URL}/health` para verificar o status do products-service
- O endpoint `GET /health/services/products` no gateway retorna o status do products-service

### VR-04: Repasse de Headers

- O header `Authorization` da requisição original é repassado ao products-service através do parâmetro `headers` do `ProxyService`
- O `ProxyService` adiciona os headers `x-user-id`, `x-user-email` e `x-user-role` a partir do `userInfo`

---

## 6. Fluxo Completo Esperado (via gateway na porta 3005)

O fluxo E2E deve funcionar inteiramente através do gateway. O consumidor (frontend, curl, Postman) **nunca** acessa o products-service diretamente.

### Fluxo 1: Autenticação

1. `POST http://localhost:3005/auth/login` com credenciais de um seller
2. Gateway encaminha para `users-service`
3. Retorna token JWT no campo `access_token`

### Fluxo 2: Criação de produto (rota protegida)

1. `POST http://localhost:3005/products` com header `Authorization: Bearer {token}` e body com dados do produto (`name`, `description`, `price`, `stock`)
2. Gateway valida o token, identifica o usuário, encaminha para products-service com `Authorization` e `userInfo`
3. Products-service valida o JWT, verifica que o role é `seller`, cria o produto
4. Retorna status 201 com o produto criado (incluindo `id`, `sellerId`, `createdAt`)

### Fluxo 3: Listagem de produtos (rota pública)

1. `GET http://localhost:3005/products` — sem autenticação
2. Gateway encaminha para products-service
3. Retorna status 200 com array de produtos ativos, ordenados por data de criação decrescente

### Fluxo 4: Detalhes de um produto (rota pública)

1. `GET http://localhost:3005/products/{id}` — sem autenticação
2. Gateway encaminha para products-service
3. Retorna status 200 com dados completos do produto, ou 404 se não encontrado

### Fluxo 5: Produtos de um vendedor (rota pública)

1. `GET http://localhost:3005/products/seller/{sellerId}` — sem autenticação
2. Gateway encaminha para products-service
3. Retorna status 200 com array de produtos ativos do vendedor

---

## 7. Critérios de Aceite

### CA-01: Health check do products-service funciona

- [ ] `GET http://localhost:3001/health` retorna status 200 com `{ "status": "ok", "service": "products-service" }`
- [ ] O endpoint é acessível sem autenticação (rota pública)

### CA-02: Health check via gateway

- [ ] `GET http://localhost:3005/health/services/products` retorna status `healthy` quando o products-service está rodando
- [ ] `GET http://localhost:3005/health/services/products` retorna status `unhealthy` quando o products-service está parado
- [ ] `GET http://localhost:3005/health/services` inclui o products-service na lista

### CA-03: Swagger do products-service

- [ ] `http://localhost:3001/api` exibe a interface Swagger UI
- [ ] O título exibido é "Products Service" e a versão é "1.0"
- [ ] O botão "Authorize" permite inserir token JWT (Bearer Auth)
- [ ] Todos os endpoints do `ProductsController` aparecem documentados (`POST /products`, `GET /products`, `GET /products/:id`, `GET /products/seller/:sellerId`)

### CA-04: Criação de produto via gateway

- [ ] `POST http://localhost:3005/products` com token JWT de seller e body válido retorna status 201 com o produto criado
- [ ] O `sellerId` no produto criado corresponde ao ID do usuário autenticado
- [ ] O produto é persistido no banco de dados do products-service
- [ ] `POST http://localhost:3005/products` sem token retorna 401
- [ ] `POST http://localhost:3005/products` com token de buyer retorna 403

### CA-05: Listagem de produtos via gateway

- [ ] `GET http://localhost:3005/products` sem autenticação retorna status 200 com array de produtos
- [ ] A resposta contém os mesmos dados que uma chamada direta a `GET http://localhost:3001/products`

### CA-06: Detalhes de produto via gateway

- [ ] `GET http://localhost:3005/products/{id}` com ID existente retorna status 200 com dados do produto
- [ ] `GET http://localhost:3005/products/{id}` com ID inexistente retorna status 404

### CA-07: Produtos de um vendedor via gateway

- [ ] `GET http://localhost:3005/products/seller/{sellerId}` retorna status 200 com array de produtos do vendedor
- [ ] `GET http://localhost:3005/products/seller/{sellerId}` para vendedor sem produtos retorna status 200 com array vazio

### CA-08: Serviços iniciam sem erros

- [ ] `npm run start:dev` no products-service inicia na porta 3001 sem erros de compilação
- [ ] `npm run start:dev` no api-gateway inicia na porta 3005 sem erros de compilação
- [ ] Nenhum erro nos logs relacionado à integração entre os serviços

---

## 8. Fora de Escopo

- Alterações nos guards de autenticação existentes do gateway
- Testes unitários ou e2e automatizados
- Rate limiting específico para rotas de produtos no gateway
- Transformação ou manipulação de dados no gateway (o gateway repassa e retorna as respostas sem modificação)
- Swagger no gateway para rotas de produtos (o Swagger do gateway já possui a tag "Products" definida, a documentação detalhada fica no Swagger do products-service)
- Integração com checkout-service ou payments-service
- Deploy, containerização ou Docker Compose
- Configuração de ambiente de produção

---

## 9. Dependências desta Spec

- **Spec 01:** `01-scaffold.md` — scaffold do products-service
- **Spec 02:** `02-jwt-validation.md` — autenticação JWT funcionando no products-service
- **Spec 03:** `03-create-product.md` — endpoint de criação de produto implementado
- **Spec 04:** `04-query-products.md` — endpoints de consulta de produtos implementados
- **Serviço externo:** `users-service` funcional para autenticação e geração de tokens JWT com roles `seller` e `buyer`
- **Serviço externo:** `api-gateway` funcional com `ProxyService`, `HealthCheckService` e guards de autenticação
- **Banco de dados:** PostgreSQL rodando na porta 5434 com o banco `products_db`
