# Arquitetura implementada

Atualizado em 07/10/2026 para a entrega do Dia 1.

## Visão geral

O EDUC.AI começa como monorepositório npm com uma interface React, uma API Node.js e contratos compartilhados. PostgreSQL é a fonte persistente. Integrações futuras ficam atrás da API; o navegador não recebe credenciais nem acessa o banco.

```text
Navegador -> React/Vite -> Fastify -> PostgreSQL
                              |
                              +-> adaptadores Google/OpenAI (a partir do Dia 2)
```

Não há microsserviços. Jobs futuros usam a mesma base de código do backend e podem rodar como processo separado.

## Escolhas técnicas

| Área            | Escolha fixada                        | Motivo                                                                  |
| --------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Workspace       | npm workspaces + lockfile             | npm já acompanha o Node local e reduz ferramentas adicionais            |
| Frontend        | React 19.3, TypeScript 5.9 e Vite 6.4 | composição simples e Vite 6 compatível com Node 20.16                   |
| Backend         | Fastify 5.6 e TypeScript              | servidor pequeno, validação explícita e encerramento controlado         |
| Contratos       | Zod 4.6                               | schemas executáveis e tipos compartilhados sem duplicação               |
| Banco           | PostgreSQL 16.4                       | exigência do DERS, integridade relacional e migrações SQL transparentes |
| Driver          | `pg` 8.23                             | acesso direto, pool controlado e transações explícitas                  |
| Testes          | Vitest 3.2 + Testing Library          | mesma ferramenta para unidades do workspace e componentes React         |
| Desenvolvimento | Docker Compose                        | banco reproduzível com volume persistente e healthcheck                 |

As versões são exatas no manifesto e no lockfile. Vite 6 foi escolhido deliberadamente porque o Vite mais recente exige um runtime superior ao Node 20.16 disponível no ambiente.

O mesmo limite de runtime afeta o ESLint: a série 10 requer Node 20.19 ou superior. O projeto mantém ESLint 9.38 fixado até a atualização coordenada do Node, evitando uma troca de runtime dentro da entrega de fundação.

## Limites de segurança

- `DATABASE_URL` existe apenas na API e nas ferramentas de banco.
- Erros de configuração mostram nomes de variáveis, nunca valores.
- A prontidão não retorna erro bruto do PostgreSQL.
- Identidade autenticada futura será criada exclusivamente pelo Google; contratos não oferecem senha.
- Um `professorId` enviado pelo cliente nunca será aceito como prova de identidade.
- Toda consulta de domínio futura parte do professor resolvido pela sessão.
- Fixtures são marcadas por `is_fixture` e usam dados impossíveis de confundir com produção.

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

IDs internos são UUIDs. Identificadores Google são opcionais e únicos, preparados sem simular integração. E-mails usam `citext`; códigos locais de turma são únicos sem distinção de caixa.

Índices foram criados para chaves estrangeiras e consultas concretas previstas: turmas por professor, ementas por componente/ano, matrículas por turma/aluno/status e último status por serviço. Nenhuma tabela vazia dos módulos posteriores foi antecipada.

## Relações previstas, ainda não implementadas

Planos vinculam turma, ementa, BNCC e materiais; atividades vinculam plano, questões e prazos; submissões vinculam aluno e respostas; correções preservam sugestão, ajuste e aprovação; feedback e boletins preservam histórico. Essas relações entram apenas nos dias dos respectivos RFs.
