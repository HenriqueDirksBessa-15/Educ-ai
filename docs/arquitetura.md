# Arquitetura implementada

Atualizado em 09/10/2026 para a entrega do Dia 3.

## Visão geral

O EDUC.AI começa como monorepositório npm com uma interface React, uma API Node.js e contratos compartilhados. PostgreSQL é a fonte persistente. Integrações futuras ficam atrás da API; o navegador não recebe credenciais nem acessa o banco.

```text
Navegador -> React/Vite -> Fastify -> PostgreSQL
                              |
                              +-> Google OAuth/Classroom/Forms
```

Não há microsserviços. Jobs futuros usam a mesma base de código do backend e podem rodar como processo separado.

## Escolhas técnicas

| Área            | Escolha fixada                        | Motivo                                                                  |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Workspace       | npm workspaces + lockfile             | npm já acompanha o Node local e reduz ferramentas adicionais            |
| Frontend        | React 19.3, TypeScript 5.9 e Vite 6.4 | composição simples e Vite 6 compatível com Node 20.16                   |
| Backend         | Fastify 5.12 e TypeScript             | servidor pequeno, validação explícita e correções de segurança atuais   |
| Contratos       | Zod 4.6                               | schemas executáveis e tipos compartilhados sem duplicação               |
| Banco           | PostgreSQL 16.4                       | exigência do DERS, integridade relacional e migrações SQL transparentes |
| Driver          | `pg` 8.23                             | acesso direto, pool controlado e transações explícitas                  |
| Testes          | Vitest 3.2 + Testing Library          | mesma ferramenta para unidades do workspace e componentes React         |
| Desenvolvimento | Docker Compose                        | banco reproduzível com volume persistente e healthcheck                 |
| OAuth           | `google-auth-library` 10.5            | cliente oficial compatível com Node 20                                  |
| Sessão          | token opaco + cookie HTTP-only        | revogação no servidor sem expor identidade ao cliente                   |
| OpenAI          | adaptador tipado + fixture            | prepara estados sem chamada externa antes de 12/10                      |

As versões são exatas no manifesto e no lockfile. Vite 6 foi escolhido deliberadamente porque o Vite mais recente exige um runtime superior ao Node 20.16 disponível no ambiente.

O mesmo limite de runtime afeta o ESLint: a série 10 requer Node 20.19 ou superior. O projeto mantém ESLint 9.38 fixado até a atualização coordenada do Node, evitando uma troca de runtime dentro da entrega de fundação.

## Limites de segurança

- `DATABASE_URL` existe apenas na API e nas ferramentas de banco.
- Erros de configuração mostram nomes de variáveis, nunca valores.
- A prontidão não retorna erro bruto do PostgreSQL.
- Identidade autenticada é criada exclusivamente pelo Google; contratos não oferecem senha.
- Um `professorId` enviado pelo cliente nunca será aceito como prova de identidade.
- Toda consulta de domínio futura parte do professor resolvido pela sessão.
- Fixtures são marcadas por `is_fixture` e usam dados impossíveis de confundir com produção.
- OAuth usa `state` descartável e PKCE S256; cada `state` só pode ser consumido uma vez.
- Cookies são HTTP-only, `SameSite=Lax` e `Secure` em produção.
- Tokens Google são criptografados com AES-256-GCM e chave externa ao Git.

## Identidade e integrações Google

O callback verifica o ID token, exige e-mail confirmado e usa o `sub` Google como vínculo externo. O professor é criado ou atualizado no servidor. A sessão guarda apenas um token aleatório no navegador; seu hash e validade ficam no PostgreSQL.

O monitor consulta OAuth, Classroom e Forms em ciclos de cinco minutos. Cada falha recebe uma tentativa inicial e até três tentativas adicionais. Somente código normalizado chega ao contrato público; resposta bruta e tokens permanecem internos. Forms exige um formulário de teste configurado para não apresentar conectividade simulada como integração validada.

O adaptador OpenAI distingue chave ausente, verificação adiada, disponibilidade de fixture e indisponibilidade normalizada. Esse estado entra no ciclo técnico de cinco minutos; antes de 12/10 ele não faz requisição externa.

Logout revoga a sessão atual. A rota de desconexão revoga o token Google e todas as sessões locais do professor.

## Configuração e encerramento

A API valida todo o ambiente antes de abrir a porta. `SIGINT` e `SIGTERM` param novas requisições, fecham Fastify e encerram o pool PostgreSQL, respeitando um timeout configurável.

## Health checks

- `GET /api/health/live`: retorna 200 se o processo responde, independentemente do banco.
- `GET /api/health/ready`: executa `SELECT 1`; retorna 200 com banco disponível ou 503 com banco indisponível.

Essa separação permite diagnosticar aplicação ativa com dependência indisponível.

## Migrações

Migrações são SQL ordenado e executadas em transação. `schema_migrations` registra nome, checksum e horário. Uma migração aplicada não pode ser alterada silenciosamente. Seeds são operações idempotentes e permanecem separadas das migrações.

## Modelo inicial

O primeiro esquema contém somente entidades necessárias à fundação:

- `professor` 1:N `class_group`;
- `class_group` N:N `student` por `enrollment`;
- `curriculum_area` 1:N `syllabus` 1:N `bncc_skill`;
- `integration_status` como histórico temporal por serviço.
- `google_oauth_credential` 1:1 `professor`, com tokens cifrados;
- `auth_session` N:1 `professor`, com token somente em hash;
- `oauth_authorization_state` para `state`/PKCE descartável.
- `curriculum_load` para fonte, versão, checksum e estado da carga;
- `curriculum_change` para histórico de entidades alteradas.

IDs internos são UUIDs. Identificadores Google são opcionais e únicos, preparados sem simular integração. E-mails usam `citext`; códigos locais de turma são únicos sem distinção de caixa.

Índices foram criados para chaves estrangeiras e consultas concretas previstas: turmas por professor, ementas por componente/ano, matrículas por turma/aluno/status e último status por serviço. Nenhuma tabela vazia dos módulos posteriores foi antecipada.

## Infraestrutura externa preparada

O projeto Google Cloud é `educai-511017`. O bucket privado `gs://educai-511017-test-artifacts`, em `southamerica-east1`, usa acesso uniforme e prevenção de acesso público para artefatos de teste futuros. O bucket não executa containers e ainda não é consumido pela aplicação.

Consultas curriculares e perfil exigem sessão autenticada. O perfil permite alterar nome e preferência, mas nunca e-mail; consultas sem habilidade retornam fallback marcado para revisão.

## Relações previstas, ainda não implementadas

Planos vinculam turma, ementa, BNCC e materiais; atividades vinculam plano, questões e prazos; submissões vinculam aluno e respostas; correções preservam sugestão, ajuste e aprovação; feedback e boletins preservam histórico. Essas relações entram apenas nos dias dos respectivos RFs.
