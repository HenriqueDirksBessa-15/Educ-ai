# EDUC.AI

Fundação executável do sistema de apoio ao planejamento pedagógico e à correção de atividades escolares. A entrega atual corresponde ao Dia 1 do plano de 14 dias: workspace, web, API, PostgreSQL, contratos, migrações e dados fictícios reproduzíveis.

Nenhuma integração real com Google ou OpenAI é executada nesta etapa.

## Requisitos locais

- Node.js 20.16.x;
- npm 10.8 ou superior;
- Docker Desktop com Docker Compose v2.

## Instalação

```powershell
npm ci
Copy-Item .env.example .env
```

O arquivo `.env.example` contém somente valores locais. Não versione `.env`, tokens ou chaves.

## Banco de dados

Iniciar o PostgreSQL e aguardar o healthcheck:

```powershell
npm run db:up
docker compose ps
```

Aplicar as migrações e a seed fictícia:

```powershell
npm run db:migrate
npm run db:seed
```

A seed pode ser repetida sem duplicar registros. Todos os e-mails usam `example.invalid`; a referência curricular tem o código `SIM-NAO-OFICIAL-01` e está marcada como não oficial.

Parar os serviços preservando o volume:

```powershell
npm run db:down
```

Para acompanhar o banco:

```powershell
npm run db:logs
```

## Desenvolvimento

Com PostgreSQL iniciado, migrações aplicadas e `.env` criado:

```powershell
npm run dev
```

- Interface: <http://localhost:5173>
- API viva: <http://localhost:3000/api/health/live>
- API pronta: <http://localhost:3000/api/health/ready>

`/api/health/live` confirma que o processo da API responde. `/api/health/ready` também consulta o PostgreSQL e retorna HTTP 503 quando o banco estiver indisponível.

Para iniciar os processos separadamente:

```powershell
npm run dev:api
npm run dev:web
```

## Qualidade e testes

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
```

O teste de integração cria um banco temporário no mesmo servidor PostgreSQL, aplica a migração em banco vazio, executa a seed duas vezes e remove o banco temporário ao terminar:

```powershell
npm run test:integration
```

Todas as verificações não dependentes de banco podem ser executadas juntas:

```powershell
npm run check
```

## Configuração

| Variável              | Finalidade                               |
| --------------------- | ---------------------------------------- |
| `NODE_ENV`            | `development`, `test` ou `production`    |
| `API_HOST`            | Interface de rede da API                 |
| `API_PORT`            | Porta HTTP da API                        |
| `DATABASE_URL`        | URL PostgreSQL usada somente no servidor |
| `WEB_ORIGIN`          | Origem autorizada no CORS                |
| `LOG_LEVEL`           | Nível de log estruturado                 |
| `SHUTDOWN_TIMEOUT_MS` | Limite do encerramento gracioso          |
| `VITE_API_BASE_URL`   | Prefixo público consumido pela interface |

Configuração ausente ou inválida encerra a API antes de abrir a porta e informa apenas os nomes das variáveis afetadas.

## Estrutura

```text
apps/web              React, TypeScript e Vite
apps/api              Fastify, configuração, PostgreSQL e rotas técnicas
packages/contracts    contratos Zod compartilhados
database/migrations   esquema PostgreSQL versionado
database/seeds        fixtures reproduzíveis e identificadas
docs                   arquitetura, decisões, progresso e rastreabilidade
```

O plano completo está em [PLANO_IMPLEMENTACAO_14_DIAS.md](./PLANO_IMPLEMENTACAO_14_DIAS.md). Nenhum RF001–RF014 está concluído apenas por esta fundação.
