# SPEC: Criação de Produto

**Serviço:** products-service  
**Porta:** 3001  
**Status:** Pendente  
**Criado em:** 2026-03-02

---

## 1. Objetivo

Implementar o endpoint de criação de produto no `products-service`, incluindo `ProductsController`, `ProductsService`, DTO de entrada com validações, verificação de role do usuário e persistência no banco de dados via TypeORM.

Este endpoint permite que usuários com role `seller` cadastrem novos produtos no marketplace. Usuários com role `buyer` devem ser rejeitados com erro 403.

---

## 2. Contexto

- O `products-service` já possui scaffold completo (spec `01-scaffold.md`) com PostgreSQL na porta 5434, TypeORM configurado e entidade `Product` definida
- A autenticação JWT já está implementada (spec `02-jwt-validation.md`) com guard global, decorator `@Public()` e `req.user` contendo `{ id, email, role }`
- O `ProductsModule` já existe e registra a entidade `Product` via `TypeOrmModule.forFeature()`, mas **não possui** controller nem service
- O `ValidationPipe` global já está configurado no `main.ts` com `whitelist`, `forbidNonWhitelisted` e `transform`
- O `sellerId` do produto corresponde ao `id` do usuário autenticado, extraído do token JWT (`req.user.id`)
- A verificação de role (`seller` vs `buyer`) deve ser feita dentro do fluxo de criação — **não** existe um `RoleGuard` global

---

## 3. Requisitos Funcionais

### RF-01: ProductsService

Deve existir um service `ProductsService` em `src/products/products.service.ts` que:

- Seja um provider injetável (`@Injectable()`)
- Receba o repositório da entidade `Product` via injeção de dependência do TypeORM
- Contenha um método para criar produto que:
  - Receba os dados validados do DTO e o `sellerId` (vindo do controller)
  - Defina `isActive` como `true` automaticamente
  - Persista o produto no banco de dados
  - Retorne o produto criado com todos os campos (incluindo `id`, `createdAt`, `updatedAt`)

### RF-02: ProductsController

Deve existir um controller `ProductsController` em `src/products/products.controller.ts` que:

- Use o prefixo de rota `products`
- Injete o `ProductsService`
- Contenha o endpoint `POST /products` que:
  - Seja uma rota **protegida** (não usar `@Public()` — o guard global já exige JWT)
  - Extraia o usuário autenticado da requisição (`req.user`)
  - **Antes de criar o produto**, verifique se `req.user.role` é `"seller"`
  - Se o role **não** for `"seller"`, retorne erro HTTP 403 (Forbidden) com mensagem clara
  - Se for seller, extraia `req.user.id` como `sellerId` e delegue a criação ao `ProductsService`
  - Receba os dados do produto via body, validados pelo DTO
  - Retorne o produto criado com status HTTP 201

### RF-03: DTO de Criação (CreateProductDto)

Deve existir um DTO `CreateProductDto` em `src/products/dto/create-product.dto.ts` com as seguintes propriedades e validações:

| Campo       | Tipo   | Validações                                                           |
| ----------- | ------ | -------------------------------------------------------------------- |
| name        | string | Obrigatório, não vazio, máximo 255 caracteres                        |
| description | string | Obrigatório, não vazio                                               |
| price       | number | Obrigatório, número decimal, valor mínimo 0.01, até 2 casas decimais |
| stock       | number | Obrigatório, número inteiro, valor mínimo 0                          |

**Regras importantes:**

- O campo `sellerId` **não** deve existir no DTO — é extraído do token JWT
- O campo `isActive` **não** deve existir no DTO — é definido automaticamente como `true`
- Todas as validações devem ter mensagens de erro em inglês, claras e descritivas
- Propriedades não reconhecidas no body devem ser rejeitadas (já garantido pelo `forbidNonWhitelisted` do `ValidationPipe` global)

### RF-04: Registro no ProductsModule

O `ProductsModule` deve ser atualizado para:

- Registrar o `ProductsController` na lista de controllers
- Registrar o `ProductsService` na lista de providers
- Manter o registro existente da entidade `Product` via `TypeOrmModule.forFeature()`

---

## 4. Estrutura de Pastas Esperada

Arquivos novos a serem criados (além da estrutura existente):

```
products-service/
└── src/
    └── products/
        ├── products.controller.ts    (novo)
        ├── products.service.ts       (novo)
        └── dto/
            └── create-product.dto.ts (novo)
```

Arquivo a ser modificado:

```
products-service/
└── src/
    └── products/
        └── products.module.ts        (atualizar com controller e service)
```

---

## 5. Respostas Esperadas

### 201 Created — Produto criado com sucesso

Retornado quando um seller autenticado envia dados válidos. O corpo da resposta deve conter o produto completo:

| Campo       | Tipo      | Descrição                                                     |
| ----------- | --------- | ------------------------------------------------------------- |
| id          | UUID      | Gerado automaticamente                                        |
| name        | string    | Nome do produto                                               |
| description | string    | Descrição do produto                                          |
| price       | string    | Preço com 2 casas decimais (retorno do decimal do PostgreSQL) |
| stock       | number    | Quantidade em estoque                                         |
| sellerId    | UUID      | ID do vendedor (extraído do token)                            |
| isActive    | boolean   | Sempre `true` na criação                                      |
| createdAt   | timestamp | Data de criação                                               |
| updatedAt   | timestamp | Data de atualização                                           |

### 400 Bad Request — Dados inválidos

Retornado quando o body da requisição falha na validação do DTO. Exemplos de cenários:

- Campo obrigatório ausente
- `name` excede 255 caracteres
- `price` menor que 0.01 ou não numérico
- `stock` negativo, decimal ou não numérico
- Propriedade desconhecida no body (ex: `sellerId`, `isActive`, `category`)

### 401 Unauthorized — Sem autenticação

Retornado automaticamente pelo `JwtAuthGuard` quando:

- O header `Authorization` está ausente
- O token é inválido ou expirado

### 403 Forbidden — Usuário não é seller

Retornado quando o usuário autenticado possui `role` diferente de `"seller"` (ex: `"buyer"`). A resposta deve conter uma mensagem clara indicando que apenas sellers podem criar produtos.

---

## 6. Critérios de Aceite

### CA-01: Seller cria produto com sucesso

- [ ] Requisição `POST /products` com token JWT de um seller e body válido retorna status 201
- [ ] O corpo da resposta contém todos os campos do produto (id, name, description, price, stock, sellerId, isActive, createdAt, updatedAt)
- [ ] O `sellerId` na resposta corresponde ao `id` do usuário autenticado (do token)
- [ ] O `isActive` na resposta é `true`
- [ ] O `id` é um UUID gerado automaticamente
- [ ] `createdAt` e `updatedAt` estão preenchidos

### CA-02: Produto é persistido no banco

- [ ] Após criar um produto com sucesso, ele deve existir na tabela `product` do banco `products_db`
- [ ] Todos os campos devem estar com os valores corretos no banco

### CA-03: Buyer é rejeitado com 403

- [ ] Requisição `POST /products` com token JWT de um buyer retorna status 403
- [ ] A resposta contém mensagem indicando que apenas sellers podem criar produtos
- [ ] Nenhum produto é criado no banco

### CA-04: Requisição sem token retorna 401

- [ ] Requisição `POST /products` sem header `Authorization` retorna status 401
- [ ] Requisição `POST /products` com token inválido retorna status 401
- [ ] Requisição `POST /products` com token expirado retorna status 401

### CA-05: Validação de campos obrigatórios

- [ ] Body vazio (`{}`) retorna status 400 com mensagens de erro para todos os campos obrigatórios
- [ ] Ausência de `name` retorna 400 com mensagem de erro específica
- [ ] Ausência de `description` retorna 400 com mensagem de erro específica
- [ ] Ausência de `price` retorna 400 com mensagem de erro específica
- [ ] Ausência de `stock` retorna 400 com mensagem de erro específica

### CA-06: Validação de regras de campo

- [ ] `name` com mais de 255 caracteres retorna 400
- [ ] `price` com valor 0 retorna 400
- [ ] `price` com valor negativo retorna 400
- [ ] `stock` com valor negativo retorna 400
- [ ] `stock` com valor decimal (ex: 1.5) retorna 400

### CA-07: Propriedades desconhecidas são rejeitadas

- [ ] Body contendo `sellerId` retorna 400 (propriedade não permitida)
- [ ] Body contendo `isActive` retorna 400 (propriedade não permitida)
- [ ] Body contendo qualquer propriedade não definida no DTO retorna 400

### CA-08: sellerId não vem do body

- [ ] Mesmo que o body contenha `sellerId`, ele deve ser rejeitado (CA-07)
- [ ] O `sellerId` salvo no banco é sempre o `req.user.id` do token JWT

### CA-09: Serviço inicia sem erros

- [ ] Executar `npm run start:dev` e o serviço deve iniciar na porta 3001 sem erros de compilação
- [ ] Nenhum erro nos logs relacionado ao `ProductsController` ou `ProductsService`

---

## 7. Fora de Escopo

- Listagem, busca, atualização ou exclusão de produtos (specs futuras)
- Upload de imagens do produto
- Categorias ou tags de produto
- Paginação ou filtros
- `RoleGuard` genérico reutilizável (a verificação de role é feita diretamente no controller)
- Swagger/OpenAPI
- Testes unitários ou e2e (serão tratados em spec futura)
- Integração com outros microserviços
- Soft delete
- Auditoria ou logs de criação

---

## 8. Dependências desta Spec

- **Spec 01:** `01-scaffold.md` — scaffold do `products-service` deve estar implementado
- **Spec 02:** `02-jwt-validation.md` — autenticação JWT deve estar funcionando
- **Serviço externo:** `users-service` deve estar funcional para gerar tokens JWT com roles `seller` e `buyer`
- **Banco de dados:** PostgreSQL deve estar rodando na porta 5434 com o banco `products_db`
