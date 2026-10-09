# EDUC.AI

Sistema executável de apoio ao planejamento pedagógico e à correção de atividades escolares. A entrega atual inclui os Dias 1 a 9 do plano: identidade Google, currículo, turmas, materiais, planos, atividades, geração assistida e publicação no Google Forms/Classroom.

A autenticação é exclusivamente Google. O adaptador OpenAI usa fixture sem chave e ativa a Responses API somente quando `OPENAI_API_KEY` está configurada no servidor.

## Requisitos locais

- Node.js 20.16.x;
- npm 10.8 ou superior;
- PostgreSQL 16 acessível pela `DATABASE_URL`; Docker Compose v2 é a opção local padrão, não uma exigência da aplicação.

## Instalação

```powershell
npm ci
Copy-Item .env.example .env
```

O arquivo `.env.example` contém somente valores locais. Não versione `.env`, tokens ou chaves.

Gere uma chave local de 32 bytes em hexadecimal para `TOKEN_ENCRYPTION_KEY`. Credenciais Google devem existir apenas no `.env` local.

## Google OAuth

Crie um cliente OAuth do tipo aplicação Web e configure exatamente:

- origem JavaScript autorizada: `http://localhost:5173`;
- URI de redirecionamento autorizada: `http://localhost:3000/api/auth/google/callback`.

Preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env`. Para verificar Google Forms de forma real, informe também o identificador de um formulário de teste em `GOOGLE_FORMS_TEST_FORM_ID`.

Os escopos solicitados são identidade básica, leitura de cursos, gerenciamento de trabalhos do Classroom, criação de Forms, leitura futura de respostas e acesso aos arquivos Drive criados pelo EDUC.AI. Professores que autorizaram versões anteriores precisam entrar novamente para conceder os escopos do Dia 9. Nenhuma senha Google passa pelo EDUC.AI.

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

O smoke test real da OpenAI é opt-in porque faz uma chamada faturável. Após preencher `OPENAI_API_KEY` no `.env`, execute:

```powershell
$env:RUN_OPENAI_INTEGRATION="true"
npm run test:integration:openai
```

Todas as verificações não dependentes de banco podem ser executadas juntas:

```powershell
npm run check
```

## Configuração

| Variável                          | Finalidade                                |
| --------------------------------- | ----------------------------------------- |
| `NODE_ENV`                        | `development`, `test` ou `production`     |
| `API_HOST`                        | Interface de rede da API                  |
| `API_PORT`                        | Porta HTTP da API                         |
| `DATABASE_URL`                    | URL PostgreSQL usada somente no servidor  |
| `WEB_ORIGIN`                      | Origem autorizada no CORS                 |
| `LOG_LEVEL`                       | Nível de log estruturado                  |
| `SHUTDOWN_TIMEOUT_MS`             | Limite do encerramento gracioso           |
| `VITE_API_BASE_URL`               | Prefixo público consumido pela interface  |
| `GOOGLE_CLIENT_ID`                | ID público do cliente OAuth Web           |
| `GOOGLE_CLIENT_SECRET`            | Segredo OAuth, somente no servidor        |
| `GOOGLE_REDIRECT_URI`             | Callback autorizado no Google             |
| `GOOGLE_FORMS_TEST_FORM_ID`       | Formulário opcional para monitorar Forms  |
| `TOKEN_ENCRYPTION_KEY`            | Chave hexadecimal de 32 bytes para tokens |
| `SESSION_TTL_SECONDS`             | Duração máxima da sessão                  |
| `INTEGRATION_MONITOR_INTERVAL_MS` | Intervalo do monitor Google               |
| `OPENAI_API_KEY`                  | Chave OpenAI usada somente no servidor    |
| `OPENAI_BASE_URL`                 | Base URL da Responses API                 |
| `OPENAI_MODEL`                    | Modelo usado para sugestões estruturadas  |
| `RUN_OPENAI_INTEGRATION`          | Habilita o smoke test real, com custo     |

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

## Infraestrutura Google Cloud

- projeto: `educai-511017`;
- bucket privado de artefatos de teste: `gs://educai-511017-test-artifacts`;
- região: `southamerica-east1`.

O bucket armazena fixtures, relatórios e artefatos; ele não executa Docker. Nenhum deploy foi realizado.

Endpoints do Dia 3:

- `GET /api/profile` e `PATCH /api/profile` para perfil autenticado;
- `GET /api/curriculum?component=...&schoolYear=...&skillCode=...` para consulta curricular protegida.

O PostgreSQL de validação está disponível no Cloud SQL `educai-bncc-validation` (`POSTGRES_16`, `db-f1-micro`, `southamerica-east1`) e pode ser acessado pelo Cloud SQL Auth Proxy. A instância usa cobrança por uso.

Endpoints do Dia 4:

- `GET/POST /api/classes` e `GET/PATCH /api/classes/:classId`;
- `POST /api/classes/:classId/students` para matrícula idempotente;
- `POST /api/classes/sync` para adapter Classroom de fixture.

Endpoints do Dia 9:

- `POST /api/activities/:activityId/generate`, `review` e `approve` para o ciclo assistido;
- `GET /api/activities/:activityId/generation` para a versão mais recente;
- `POST /api/activities/:activityId/publish` para criação ou retomada idempotente;
- `GET /api/activities/:activityId/publication` para estado do Form e de cada turma.

Endpoints do Dia 10:

- `POST /api/activities/:activityId/collect` para coletar e corrigir respostas após o prazo ou finalização;
- `GET /api/activities/:activityId/collection` para submissões, detalhamento objetivo, nota e pendências manuais.

Em produção, um worker verifica trabalhos vencidos a cada minuto, pagina respostas do Forms e usa o ID externo como chave idempotente. Atividades mistas mantêm a nota final pendente até a revisão discursiva do Dia 11.

Em produção, a publicação usa as APIs reais. Em desenvolvimento e teste, o adaptador Google é uma fixture identificada. A validação externa requer uma conta docente, uma turma Classroom vinculada e novo consentimento OAuth.

O plano completo está em [PLANO_IMPLEMENTACAO_14_DIAS.md](./PLANO_IMPLEMENTACAO_14_DIAS.md). A matriz registra separadamente implementação e validação real de cada RF.
