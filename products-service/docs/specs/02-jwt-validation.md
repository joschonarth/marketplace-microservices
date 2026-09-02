# SPEC: Validação de JWT no products-service

**Serviço:** products-service  
**Porta:** 3001  
**Status:** Pendente  
**Criado em:** 2026-03-02

---

## 1. Objetivo

Implementar a validação de tokens JWT no `products-service`, permitindo que o serviço verifique a autenticidade de tokens emitidos pelo `users-service`. O `products-service` **não emite tokens** — apenas os valida para proteger suas rotas.

A implementação deve seguir **exatamente** o mesmo padrão já estabelecido no `users-service`.

---

## 2. Contexto

- O `users-service` (porta 3000) já possui autenticação completa com login/registro e geração de tokens JWT
- O token é assinado com `JWT_SECRET` e contém o payload: `{ sub: UUID, email: string, role: "seller" | "buyer" }`
- O `JWT_SECRET` é compartilhado entre os serviços (mesmo valor configurado via variável de ambiente)
- O `products-service` precisa validar esses tokens para proteger suas rotas futuras (CRUD de produtos)
- A verificação de roles (seller/buyer) **não** faz parte desta spec — será feita diretamente nos controllers/services

---

## 3. Requisitos Funcionais

### RF-01: Dependências

O `products-service` deve ter as seguintes dependências adicionais instaladas:

| Pacote                | Tipo            | Finalidade                            |
| --------------------- | --------------- | ------------------------------------- |
| `@nestjs/jwt`         | dependencies    | Integração JWT com NestJS             |
| `@nestjs/passport`    | dependencies    | Integração Passport com NestJS        |
| `passport`            | dependencies    | Middleware de autenticação            |
| `passport-jwt`        | dependencies    | Strategy JWT para Passport            |
| `@types/passport-jwt` | devDependencies | Tipagens TypeScript para passport-jwt |

### RF-02: Variável de Ambiente JWT_SECRET

- A variável `JWT_SECRET` deve ser adicionada aos arquivos `.env` e `.env.example`
- O valor em `.env` deve ser o **mesmo** utilizado no `users-service`
- O `ConfigModule` (já configurado como global) será usado para acessar a variável

### RF-03: AuthModule

Deve existir um módulo `AuthModule` em `src/auth/auth.module.ts` que:

- Importe o `PassportModule`
- Importe o `JwtModule` configurado de forma assíncrona, injetando `ConfigService` para obter o `JWT_SECRET`
- Registre o `JwtStrategy` como provider
- Registre o `JwtAuthGuard` como **guard global** via `APP_GUARD`
- **Não** possua controllers (sem endpoints de auth)
- **Não** possua services (sem lógica de login/registro)

### RF-04: JwtStrategy

Deve existir uma strategy `JwtStrategy` em `src/auth/strategies/jwt.strategy.ts` que:

- Estenda `PassportStrategy(Strategy)` do `@nestjs/passport`
- Extraia o token do header `Authorization: Bearer <token>`
- Use o `JWT_SECRET` (via `ConfigService`) para validar a assinatura
- **Não** ignore a expiração do token (`ignoreExpiration: false`)
- Extraia do payload os campos `sub`, `email` e `role`
- Retorne um objeto `{ id, email, role }` que ficará disponível em `req.user`
  - O campo `sub` do payload deve ser mapeado para `id` no objeto retornado

### RF-05: JwtAuthGuard

Deve existir um guard `JwtAuthGuard` em `src/auth/guards/jwt-auth.guard.ts` que:

- Estenda `AuthGuard('jwt')` do `@nestjs/passport`
- Verifique se a rota está marcada como pública (via metadata `IS_PUBLIC_KEY`)
- Se a rota for pública, permita o acesso sem validação de token
- Se a rota **não** for pública, delegue a validação para o `AuthGuard('jwt')` (comportamento padrão do Passport)
- Seja registrado como guard **global** no `AuthModule` via `APP_GUARD`

### RF-06: Decorator @Public()

Deve existir um decorator `@Public()` em `src/auth/decorators/public.decorator.ts` que:

- Defina a metadata `IS_PUBLIC_KEY` na rota
- Permita marcar rotas individuais ou controllers inteiros como públicos
- Rotas marcadas com `@Public()` devem ser acessíveis sem token JWT

### RF-07: Integração com AppModule

- O `AuthModule` deve ser importado no `AppModule`
- Ao ser importado, o guard global é ativado automaticamente (via `APP_GUARD`)
- Todas as rotas passam a exigir JWT por padrão
- As rotas existentes que devem permanecer públicas (como a rota raiz do `AppController`) devem ser marcadas com `@Public()`

---

## 4. Estrutura de Pastas Esperada

Arquivos novos a serem criados (além da estrutura existente):

```
products-service/
└── src/
    └── auth/
        ├── auth.module.ts
        ├── strategies/
        │   └── jwt.strategy.ts
        ├── guards/
        │   └── jwt-auth.guard.ts
        └── decorators/
            └── public.decorator.ts
```

---

## 5. Comportamento Esperado

### Fluxo de uma requisição autenticada

1. Cliente envia requisição com header `Authorization: Bearer <token>`
2. O `JwtAuthGuard` intercepta a requisição (guard global)
3. O guard verifica se a rota está marcada com `@Public()`
4. Se **não** for pública, delega para o Passport
5. O `JwtStrategy` extrai o token do header
6. Valida a assinatura usando `JWT_SECRET`
7. Valida a expiração do token
8. Extrai `sub`, `email` e `role` do payload
9. Retorna `{ id, email, role }` que fica disponível em `req.user`
10. A requisição prossegue para o controller

### Fluxo de uma requisição sem token (rota protegida)

1. Cliente envia requisição **sem** header Authorization
2. O `JwtAuthGuard` intercepta a requisição
3. A rota não está marcada com `@Public()`
4. Passport tenta extrair o token e falha
5. Retorna HTTP `401 Unauthorized`

### Fluxo de uma requisição com token inválido

1. Cliente envia requisição com token inválido ou expirado
2. O `JwtAuthGuard` intercepta a requisição
3. Passport extrai o token mas a validação falha (assinatura ou expiração)
4. Retorna HTTP `401 Unauthorized`

### Fluxo de uma rota pública

1. Cliente envia requisição (com ou sem token)
2. O `JwtAuthGuard` intercepta a requisição
3. Detecta que a rota está marcada com `@Public()`
4. Permite o acesso sem validação
5. `req.user` **não** estará disponível (a menos que um token válido seja fornecido e tratado separadamente — mas isso está fora desta spec)

---

## 6. Critérios de Aceite

### CA-01: Serviço inicia sem erros

- [ ] Executar `npm run start:dev` e o serviço deve iniciar na porta 3001 sem erros de compilação
- [ ] Nenhum erro relacionado a JWT ou Passport nos logs

### CA-02: Dependências instaladas

- [ ] `@nestjs/jwt`, `@nestjs/passport`, `passport` e `passport-jwt` devem constar em `dependencies` no `package.json`
- [ ] `@types/passport-jwt` deve constar em `devDependencies` no `package.json`

### CA-03: Variável JWT_SECRET configurada

- [ ] `JWT_SECRET` deve existir no `.env` com o mesmo valor usado no `users-service`
- [ ] `JWT_SECRET` deve existir no `.env.example` (sem valor)

### CA-04: Rota protegida rejeita requisição sem token

- [ ] Uma requisição GET a qualquer rota **não** marcada com `@Public()` sem header Authorization deve retornar `401 Unauthorized`

### CA-05: Rota protegida rejeita token inválido

- [ ] Uma requisição com `Authorization: Bearer token_invalido` deve retornar `401 Unauthorized`
- [ ] Uma requisição com token expirado deve retornar `401 Unauthorized`

### CA-06: Rota protegida aceita token válido

- [ ] Uma requisição com token JWT válido (gerado pelo `users-service` com o mesmo `JWT_SECRET`) deve ser aceita (não retornar 401)
- [ ] O objeto `req.user` deve conter `{ id, email, role }` extraídos do token

### CA-07: Rota pública é acessível sem token

- [ ] Rotas marcadas com `@Public()` devem ser acessíveis sem header Authorization
- [ ] Rotas marcadas com `@Public()` devem retornar a resposta normalmente (sem 401)

### CA-08: Guard global ativo

- [ ] Novas rotas criadas no futuro devem ser protegidas por padrão (sem precisar adicionar guard manualmente)
- [ ] Apenas rotas explicitamente marcadas com `@Public()` devem ser acessíveis sem token

### CA-09: Padrão consistente com users-service

- [ ] A estrutura de pastas de `src/auth/` deve seguir o mesmo padrão do `users-service`
- [ ] O `JwtStrategy` deve seguir a mesma abordagem do `users-service` (mesma extração de payload, mesmo mapeamento de campos)
- [ ] O `JwtAuthGuard` deve seguir a mesma abordagem do `users-service` (mesma lógica de rota pública)
- [ ] O decorator `@Public()` deve usar a mesma chave de metadata (`IS_PUBLIC_KEY`) do `users-service`

---

## 7. Fora de Escopo

- Endpoints de login ou registro (responsabilidade do `users-service`)
- `RoleGuard` ou guard de verificação de roles (será feito nos controllers/services)
- Refresh token
- Blacklist de tokens
- Swagger/OpenAPI para autenticação
- Testes unitários (serão tratados em spec futura)
- Rate limiting
- Integração com outros microserviços (além da validação do token compartilhado)

---

## 8. Dependências desta Spec

- **Spec anterior:** `scaffold.md` — o scaffold do `products-service` deve estar implementado
- **Serviço externo:** `users-service` deve estar funcional e gerando tokens JWT com o payload esperado
- **Variável compartilhada:** O `JWT_SECRET` deve ter o mesmo valor em ambos os serviços
