# SPEC: Scaffold do products-service

**Serviço:** products-service  
**Porta:** 3001  
**Status:** Pendente  
**Criado em:** 2026-03-02

---

## 1. Objetivo

Configurar o scaffold do microserviço `products-service` dentro do projeto `marketplace-ms`, incluindo conexão com banco de dados PostgreSQL, definição da entidade `Product`, Docker Compose para o banco e configuração base do NestJS seguindo o padrão dos demais serviços (especialmente `users-service`).

Este scaffold NÃO inclui endpoints, autenticação ou lógica de negócio — apenas a fundação do serviço.

---

## 2. Contexto do Sistema

| Serviço           | Porta | Banco        | Porta DB |
| ----------------- | ----- | ------------ | -------- |
| users-service     | 3000  | users_db     | 5433     |
| products-service  | 3001  | products_db  | 5434     |
| checkout-service  | 3003  | checkout_db  | 5434     |
| payments-service  | 3004  | payments_db  | 5435     |
| api-gateway       | 3005  | —            | —        |
| messaging-service | —     | — (RabbitMQ) | 5672     |

> **Nota:** O `checkout-service` já usa a porta 5434 para seu banco. Porém, conforme requisito do projeto de curso, o `products-service` também usará a porta **5434** para o PostgreSQL. Os dois serviços não devem rodar seus bancos simultaneamente na mesma máquina sem ajuste de portas.

---

## 3. Requisitos Funcionais

### RF-01: Dependências do Projeto

O projeto (já criado via `nest new`) deve ter as seguintes dependências adicionais instaladas:

- `@nestjs/typeorm` — integração TypeORM com NestJS
- `typeorm` — ORM
- `pg` — driver PostgreSQL
- `@nestjs/config` — gerenciamento de variáveis de ambiente
- `class-validator` — validação de DTOs
- `class-transformer` — transformação de objetos

### RF-02: Docker Compose com PostgreSQL

Deve existir um arquivo `docker-compose.yml` na raiz do `products-service` com:

- Imagem: `postgres:15`
- Nome do container: `marketplace-products-db`
- Porta exposta: `5434:5432`
- Database: `products_db`
- Credenciais padrão: `postgres` / `postgres`
- Volume nomeado para persistência de dados
- Healthcheck configurado
- Política de restart: `unless-stopped`

### RF-03: Configuração de Banco de Dados

Deve existir um arquivo de configuração de banco em `src/config/database.config.ts` que:

- Exporte um objeto compatível com `TypeOrmModuleOptions`
- Use variáveis de ambiente para todas as configurações de conexão
- Tenha valores padrão (fallback) para desenvolvimento local:
  - Host: `localhost`
  - Porta: `5434`
  - Username: `postgres`
  - Password: `postgres`
  - Database: `products_db`
- Carregue entidades automaticamente via glob pattern (`**/*.entity{.ts,.js}`)
- Habilite `synchronize` apenas fora de produção (`NODE_ENV !== 'production'`)
- Habilite `logging` apenas em desenvolvimento (`NODE_ENV === 'development'`)

### RF-04: Módulo Principal (AppModule)

O `AppModule` deve importar:

- `ConfigModule.forRoot()` com `isGlobal: true`
- `TypeOrmModule.forRoot()` usando a configuração de banco
- `ProductsModule` (módulo de produtos)

### RF-05: Configuração do main.ts

O arquivo `main.ts` deve:

- Criar a aplicação NestJS
- Habilitar CORS
- Configurar `ValidationPipe` global com:
  - `whitelist: true`
  - `forbidNonWhitelisted: true`
  - `transform: true`
- Escutar na porta definida pela variável `PORT` (fallback: `3001`)
- Exibir mensagem de log ao iniciar (ex: `📦 Products Service running on port ${port}`)

### RF-06: Módulo de Produtos (ProductsModule)

Deve existir um módulo `ProductsModule` em `src/products/products.module.ts` que:

- Registre a entidade `Product` via `TypeOrmModule.forFeature()`
- Exporte o módulo para uso futuro por outros módulos
- NÃO contenha controllers ou services neste momento

### RF-07: Entidade Product

Deve existir uma entidade `Product` em `src/products/entities/product.entity.ts` com a seguinte estrutura:

| Campo       | Tipo           | Restrições                                       |
| ----------- | -------------- | ------------------------------------------------ |
| id          | UUID           | PK, gerado automaticamente                       |
| name        | string (255)   | Não nulo                                         |
| description | text           | Não nulo                                         |
| price       | decimal (10,2) | Não nulo                                         |
| stock       | int            | Não nulo, default: `0`                           |
| sellerId    | UUID           | Não nulo (referência ao vendedor, sem FK física) |
| isActive    | boolean        | Não nulo, default: `true`                        |
| createdAt   | timestamp      | Gerado automaticamente na criação                |
| updatedAt   | timestamp      | Atualizado automaticamente                       |

> **Importante:** O campo `sellerId` é uma referência lógica ao usuário vendedor no `users-service`. NÃO deve existir foreign key física, pois os serviços possuem bancos de dados separados.

### RF-08: Variáveis de Ambiente

Deve existir um arquivo `.env.example` na raiz do `products-service` com as seguintes variáveis:

```
PORT=
NODE_ENV=
DB_HOST=
DB_PORT=
DB_USERNAME=
DB_PASSWORD=
DB_DATABASE=
```

Deve existir também um arquivo `.env` (para desenvolvimento local) com valores preenchidos:

```
PORT=3001
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5434
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=products_db
```

---

## 4. Estrutura de Pastas Esperada

```
products-service/
├── docker-compose.yml
├── .env
├── .env.example
├── package.json
├── tsconfig.json
├── nest-cli.json
├── docs/
│   └── specs/
│       └── scaffold.md
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── app.controller.ts
    ├── app.service.ts
    ├── config/
    │   └── database.config.ts
    └── products/
        ├── products.module.ts
        └── entities/
            └── product.entity.ts
```

---

## 5. Critérios de Aceite

### CA-01: Projeto inicia sem erros

- [ ] Executar `npm run start:dev` e o serviço deve iniciar na porta 3001 sem erros de compilação

### CA-02: Banco de dados sobe via Docker

- [ ] Executar `docker-compose up -d` na raiz do `products-service` e o container `marketplace-products-db` deve estar rodando na porta 5434
- [ ] Deve ser possível conectar ao banco `products_db` via qualquer client PostgreSQL

### CA-03: Conexão com banco funciona

- [ ] Com o banco rodando, o serviço deve conectar automaticamente ao PostgreSQL ao iniciar
- [ ] Não deve haver erros de conexão nos logs

### CA-04: Tabela é criada automaticamente

- [ ] Com `synchronize: true` (dev), a tabela `product` deve ser criada automaticamente no banco ao iniciar o serviço
- [ ] A tabela deve conter todas as colunas definidas na entidade com os tipos corretos

### CA-05: Dependências instaladas

- [ ] `@nestjs/typeorm`, `typeorm`, `pg`, `@nestjs/config`, `class-validator` e `class-transformer` devem constar no `package.json` em `dependencies`

### CA-06: ValidationPipe ativo

- [ ] O `ValidationPipe` global deve estar configurado com `whitelist`, `forbidNonWhitelisted` e `transform`

### CA-07: Padrão consistente com outros serviços

- [ ] A estrutura de `database.config.ts` deve seguir o mesmo padrão do `users-service`
- [ ] O `main.ts` deve seguir o mesmo padrão de bootstrap dos demais serviços
- [ ] O `AppModule` deve seguir o padrão de imports do `users-service`

### CA-08: Variáveis de ambiente configuradas

- [ ] Arquivo `.env.example` deve existir com todas as variáveis listadas (sem valores)
- [ ] Arquivo `.env` deve existir com valores de desenvolvimento local preenchidos

---

## 6. Fora de Escopo

- Endpoints REST (CRUD de produtos)
- Autenticação / JWT
- Integração com outros microserviços
- Swagger/OpenAPI
- Testes unitários customizados
- Seeds ou migrations
- CI/CD
- Health check endpoint (será implementado em spec futura)
