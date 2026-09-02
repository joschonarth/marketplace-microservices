# SPEC: Consulta de Produtos

**Serviço:** products-service  
**Porta:** 3001  
**Status:** Pendente  
**Criado em:** 2026-03-02

---

## 1. Objetivo

Implementar os endpoints de consulta de produtos no `products-service`, permitindo que qualquer pessoa (autenticada ou não) navegue o catálogo do marketplace — listando todos os produtos ativos, visualizando produtos de um vendedor específico, ou consultando os detalhes de um produto individual.

Estes endpoints são essenciais para o funcionamento básico do marketplace: sem eles, os produtos cadastrados pelos sellers não podem ser visualizados por ninguém.

---

## 2. Contexto

- O `products-service` já possui scaffold completo (spec `01-scaffold.md`) com PostgreSQL na porta 5434, TypeORM configurado e entidade `Product` definida
- A autenticação JWT já está implementada (spec `02-jwt-validation.md`) com guard global, decorator `@Public()` e `req.user` contendo `{ id, email, role }`
- O `ProductsController` já existe com o endpoint `POST /products` (spec `03-create-product.md`), protegido por JWT e restrito a sellers
- O `ProductsService` já existe com o método `create` que persiste produtos no banco
- O `ProductsModule` já registra controller, service e entidade `Product`
- O `ValidationPipe` global já está configurado no `main.ts`
- Todas as rotas são protegidas por padrão pelo `JwtAuthGuard` — rotas públicas exigem o decorator `@Public()`

---

## 3. Requisitos Funcionais

### RF-01: Listar todos os produtos ativos — GET /products

Deve existir um endpoint `GET /products` que:

- Seja uma rota **pública** (marcada com `@Public()`) — qualquer pessoa pode acessar sem autenticação
- Retorne todos os produtos que possuam `isActive = true`
- **Não** retorne produtos inativos (`isActive = false`)
- Ordene os resultados por data de criação (`createdAt`) em ordem decrescente (mais recentes primeiro)
- Retorne um array vazio (`[]`) caso não existam produtos ativos no banco
- Retorne status HTTP 200

### RF-02: Listar produtos de um vendedor — GET /products/seller/:sellerId

Deve existir um endpoint `GET /products/seller/:sellerId` que:

- Seja uma rota **pública** (marcada com `@Public()`) — qualquer pessoa pode visualizar os produtos de um vendedor
- Receba o `sellerId` como parâmetro de rota (UUID)
- Retorne todos os produtos ativos (`isActive = true`) do vendedor especificado
- **Não** retorne produtos inativos do vendedor
- Ordene os resultados por data de criação (`createdAt`) em ordem decrescente (mais recentes primeiro)
- Retorne um array vazio (`[]`) caso o vendedor não tenha produtos ativos (ou não exista)
- Retorne status HTTP 200

### RF-03: Buscar produto por ID — GET /products/:id

Deve existir um endpoint `GET /products/:id` que:

- Seja uma rota **pública** (marcada com `@Public()`) — qualquer pessoa pode visualizar os detalhes de um produto
- Receba o `id` do produto como parâmetro de rota (UUID)
- Retorne os dados completos do produto correspondente
- Retorne status HTTP 404 (Not Found) com mensagem clara caso o produto não exista no banco
- Retorne status HTTP 200 caso o produto seja encontrado

### RF-04: Ordem de declaração das rotas no controller

A ordem de declaração dos métodos no `ProductsController` **importa** e deve ser:

1. `POST /products` (já existente — rota protegida)
2. `GET /products` (listagem geral — rota pública)
3. `GET /products/seller/:sellerId` (produtos do vendedor — rota pública)
4. `GET /products/:id` (produto por ID — rota pública)

**Justificativa:** O NestJS avalia as rotas na ordem em que são declaradas. Se `GET /products/:id` for declarado antes de `GET /products/seller/:sellerId`, a rota `seller/abc` seria capturada pelo parâmetro `:id` — causando comportamento inesperado. Rotas estáticas e com prefixo devem ser declaradas antes de rotas com parâmetro dinâmico genérico.

### RF-05: Métodos no ProductsService

O `ProductsService` deve receber três novos métodos para atender os endpoints de consulta:

- Um método para buscar todos os produtos ativos, ordenados por data de criação decrescente
- Um método para buscar produtos ativos de um vendedor específico (por `sellerId`), ordenados por data de criação decrescente
- Um método para buscar um produto por `id`, lançando uma exceção HTTP 404 caso não seja encontrado

---

## 4. Estrutura de Pastas Esperada

Nenhum arquivo novo é criado. Apenas os seguintes arquivos existentes serão modificados:

```
products-service/
└── src/
    └── products/
        ├── products.controller.ts    (adicionar 3 endpoints de consulta)
        └── products.service.ts       (adicionar 3 métodos de consulta)
```

---

## 5. Respostas Esperadas

### 200 OK — Lista de produtos (GET /products e GET /products/seller/:sellerId)

Retorna um array de produtos ativos. Cada item do array contém:

| Campo       | Tipo      | Descrição                                                     |
| ----------- | --------- | ------------------------------------------------------------- |
| id          | UUID      | Identificador do produto                                      |
| name        | string    | Nome do produto                                               |
| description | string    | Descrição do produto                                          |
| price       | string    | Preço com 2 casas decimais (retorno do decimal do PostgreSQL) |
| stock       | number    | Quantidade em estoque                                         |
| sellerId    | UUID      | ID do vendedor                                                |
| isActive    | boolean   | Sempre `true` (apenas ativos são retornados)                  |
| createdAt   | timestamp | Data de criação                                               |
| updatedAt   | timestamp | Data de atualização                                           |

Retorna array vazio (`[]`) quando não houver produtos que atendam aos critérios.

### 200 OK — Dados de um produto (GET /products/:id)

Retorna um objeto com os dados completos do produto (mesma estrutura da tabela acima, mas como objeto único, não array).

### 404 Not Found — Produto não encontrado (apenas GET /products/:id)

Retornado quando o `id` fornecido não corresponde a nenhum produto no banco. A resposta deve conter uma mensagem clara indicando que o produto não foi encontrado.

---

## 6. Critérios de Aceite

### CA-01: Listagem geral retorna produtos ativos

- [ ] Requisição `GET /products` sem token retorna status 200 (rota pública)
- [ ] A resposta é um array contendo apenas produtos com `isActive = true`
- [ ] Produtos com `isActive = false` **não** aparecem na resposta
- [ ] Cada item do array contém todos os campos do produto (id, name, description, price, stock, sellerId, isActive, createdAt, updatedAt)

### CA-02: Listagem geral é ordenada por data

- [ ] Os produtos são retornados em ordem decrescente de `createdAt` (mais recentes primeiro)
- [ ] Ao criar dois produtos em sequência, o mais recente aparece primeiro na listagem

### CA-03: Listagem geral com banco vazio

- [ ] Requisição `GET /products` sem nenhum produto no banco retorna status 200 com array vazio (`[]`)

### CA-04: Produtos de um vendedor

- [ ] Requisição `GET /products/seller/{sellerId}` sem token retorna status 200 (rota pública)
- [ ] A resposta contém apenas produtos do vendedor especificado
- [ ] Produtos de outros vendedores **não** aparecem na resposta
- [ ] Apenas produtos com `isActive = true` do vendedor são retornados
- [ ] Os resultados são ordenados por `createdAt` decrescente

### CA-05: Vendedor sem produtos

- [ ] Requisição `GET /products/seller/{sellerId}` para um `sellerId` sem produtos retorna status 200 com array vazio (`[]`)
- [ ] Requisição `GET /products/seller/{sellerId}` para um `sellerId` inexistente retorna status 200 com array vazio (`[]`)

### CA-06: Busca por ID retorna produto

- [ ] Requisição `GET /products/{id}` sem token retorna status 200 (rota pública)
- [ ] A resposta contém todos os campos do produto (id, name, description, price, stock, sellerId, isActive, createdAt, updatedAt)
- [ ] O `id` na resposta corresponde ao `id` solicitado

### CA-07: Produto não encontrado retorna 404

- [ ] Requisição `GET /products/{id}` com UUID válido mas inexistente retorna status 404
- [ ] A resposta contém mensagem indicando que o produto não foi encontrado

### CA-08: Rotas são públicas

- [ ] `GET /products` é acessível sem header `Authorization`
- [ ] `GET /products/seller/{sellerId}` é acessível sem header `Authorization`
- [ ] `GET /products/{id}` é acessível sem header `Authorization`
- [ ] Nenhuma das rotas de consulta retorna 401

### CA-09: Rota de criação continua protegida

- [ ] `POST /products` sem token continua retornando 401
- [ ] As alterações nos arquivos não afetam o comportamento existente do endpoint de criação

### CA-10: Ordem das rotas está correta

- [ ] Requisição `GET /products/seller/{sellerId}` não é interceptada pela rota `GET /products/:id`
- [ ] A string `"seller"` no path não é tratada como valor do parâmetro `:id`

### CA-11: Serviço inicia sem erros

- [ ] Executar `npm run start:dev` e o serviço deve iniciar na porta 3001 sem erros de compilação
- [ ] Nenhum erro nos logs relacionado aos novos métodos do controller ou service

---

## 7. Fora de Escopo

- Paginação (offset, limit, cursor)
- Filtros por preço, nome, categoria ou qualquer outro campo
- Busca por texto (full-text search)
- Ordenação customizada (query params de sort)
- Atualização de produto (PUT/PATCH)
- Exclusão de produto (DELETE)
- Soft delete ou desativação de produto
- Retornar produtos inativos para o seller (painel do vendedor)
- Validação de formato UUID no parâmetro de rota
- Swagger/OpenAPI
- Testes unitários ou e2e (serão tratados em spec futura)
- Cache de consultas
- Integração com outros microserviços

---

## 8. Dependências desta Spec

- **Spec 01:** `01-scaffold.md` — scaffold do `products-service` deve estar implementado
- **Spec 02:** `02-jwt-validation.md` — autenticação JWT deve estar funcionando (guard global + `@Public()`)
- **Spec 03:** `03-create-product.md` — endpoint de criação de produto deve estar implementado (controller e service já existem)
- **Banco de dados:** PostgreSQL deve estar rodando na porta 5434 com o banco `products_db`
