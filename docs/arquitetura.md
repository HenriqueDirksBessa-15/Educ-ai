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
| OpenAI          | Responses API + Structured Outputs    | fixture sem chave e integração real somente no servidor                 |

As versões são exatas no manifesto e no lockfile. Vite 6 foi escolhido deliberadamente porque o Vite mais recente exige um runtime superior ao Node 20.16 disponível no ambiente.

O mesmo limite de runtime afeta o ESLint: a série 10 requer Node 20.19 ou superior. O projeto mantém ESLint 9.38 fixado até a atualização coordenada do Node, evitando uma troca de runtime dentro da entrega de fundação.

## Limites de segurança

- `DATABASE_URL` existe apenas na API e nas ferramentas de banco.
- Erros de configuração mostram nomes de variáveis, nunca valores.
- A prontidão não retorna erro bruto do PostgreSQL.
- Identidade autenticada é criada exclusivamente pelo Google; contratos não oferecem senha.
- Um `professorId` enviado pelo cliente nunca será aceito como prova de identidade.
- Toda consulta de domínio futura parte do professor resolvido pela sessão.
- A identidade externa de uma turma Google é única dentro do professor, permitindo
  co-docência sem transferir a propriedade local entre contas.
- Dados de aluno cuja origem é Google não podem ser sobrescritos por planilha ou
  código de acesso.
- Fixtures são marcadas por `is_fixture` e usam dados impossíveis de confundir com produção.
- OAuth usa `state` descartável e PKCE S256; cada `state` só pode ser consumido uma vez.
- Cookies são HTTP-only, `SameSite=Lax` e `Secure` em produção.
- Tokens Google são criptografados com AES-256-GCM e chave externa ao Git.

## Identidade e integrações Google

O callback verifica o ID token, exige e-mail confirmado e usa o `sub` Google como vínculo externo. O professor é criado ou atualizado no servidor. A sessão guarda apenas um token aleatório no navegador; seu hash e validade ficam no PostgreSQL.

O monitor consulta OAuth, Classroom e Forms em ciclos de cinco minutos. Cada falha recebe uma tentativa inicial e até três tentativas adicionais. Somente código normalizado chega ao contrato público; resposta bruta e tokens permanecem internos. Forms exige um formulário de teste configurado para não apresentar conectividade simulada como integração validada.

O adaptador OpenAI distingue chave ausente, disponibilidade e falhas normalizadas. Com chave configurada, o monitor valida a conexão e a geração usa a Responses API com JSON Schema estrito; sem chave, planos continuam usando fixture local. Chaves, cabeçalhos e respostas brutas não são persistidos.

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

IDs internos são UUIDs. Identificadores Google são opcionais; o identificador de turma
é único por professor para representar co-docência sem mistura de dados. E-mails usam
`citext`; códigos locais de turma são únicos sem distinção de caixa.

Índices foram criados para chaves estrangeiras e consultas concretas previstas: turmas por professor, ementas por componente/ano, matrículas por turma/aluno/status e último status por serviço. Nenhuma tabela vazia dos módulos posteriores foi antecipada.

## Infraestrutura externa preparada

O projeto Google Cloud é `educai-511017`. O bucket privado `gs://educai-511017-test-artifacts`, em `southamerica-east1`, usa acesso uniforme e prevenção de acesso público para artefatos de teste futuros. O bucket não executa containers e ainda não é consumido pela aplicação.

Para desenvolvimento remoto, o projeto usa a instância Cloud SQL `educai-dev` (`POSTGRES_16`, `db-f1-micro`, zonal, cobrança por uso) acessada pelo Cloud SQL Auth Proxy na porta local `5433`. A instância `educai-bncc-validation` (`POSTGRES_16`, `db-f1-micro`) permanece separada e intacta para validação.

Consultas curriculares e perfil exigem sessão autenticada. O perfil permite alterar nome e preferência, mas nunca e-mail; consultas sem habilidade retornam fallback marcado para revisão.

## Relações implementadas e próximas

Planos vinculam turma, ementa, BNCC e materiais e preservam revisões, gerações e aprovação docente. Atividades vinculam plano, dificuldade, questões e prazo, preservam gerações/revisões e mantêm uma máquina de publicação por Form e por turma Classroom. A conclusão agenda a coleta no prazo; submissões reconciliam o aluno dentro das turmas distribuídas e preservam o detalhamento por questão. Correções, feedbacks, notificações e boletins mantêm históricos ou snapshots imutáveis próprios.

## Publicação externa de atividades

A publicação não mantém transação aberta durante chamadas Google. Cada passo é persistido antes e depois da operação externa. Um marcador derivado do UUID local permite reconciliar Forms pelo Drive e trabalhos pela descrição do Classroom. Repetições ignoram IDs já confirmados; respostas ambíguas entram em `reconciliation_required` e nunca disparam recriação cega.

Uma atividade só muda de `draft` para `published` depois de existir um Form publicado e todas as turmas obrigatórias possuírem trabalho Classroom confirmado. Na mesma conclusão lógica, o plano é bloqueado e um `activity_collection_job` idempotente é criado para o prazo.

## Coleta e correção objetiva

O worker consulta somente trabalhos vencidos e usa uma aquisição persistida para impedir duas execuções simultâneas. A API do Forms é paginada e o `responseId` externo forma, com a atividade, a chave de idempotência. Cada nova coleta substitui atomicamente o detalhamento daquela submissão e registra uma execução com contagens e resultado.

O aluno é reconciliado por e-mail apenas entre matrículas ativas das turmas presentes em `activity_classroom_distribution`. O corretor objetivo é uma função pura: compara o texto recebido com a alternativa do gabarito, soma pesos e normaliza atividades totalmente objetivas para 0–10. Questões discursivas permanecem pendentes; vazio, ausência, questão desconhecida e aluno não reconciliado exigem correção manual.

## Correção discursiva e liberação

Cada resposta discursiva pode receber uma projeção de sugestão da OpenAI, mas pontos finais e comentário só são gravados pela revisão autenticada do professor. A aprovação exige todas as discursivas revisadas, combina os pontos com as objetivas e normaliza a nota entre 0 e 10. Atividades totalmente objetivas também exigem aprovação antes da liberação.

`activity_correction_history` é append-only e preserva snapshots de sugestão, falha, ajuste, aprovação e liberação. O estado corrente na submissão é apenas uma projeção para consulta; o banco rejeita atualização ou exclusão do histórico.

Na liberação, o adaptador procura a submissão do aluno pelo vínculo turma/trabalho/identidade Google, atribui a nota na escala de pontos da atividade e chama o retorno do Classroom. Ausência de vínculo produz liberação local; falha externa mantém a aprovação e permite nova tentativa.

## Feedbacks, avisos e notificações

`feedback` usa um escopo discriminado: o individual exige submissão aprovada, aluno e atividade; o global exige turma própria. Links pertencem à comunicação e anexos referenciam materiais já autorizados, evitando outra camada de armazenamento.

A geração preserva contexto e sugestão versionados. Conteúdo assistido muda para revisado somente com ação docente, enquanto edições manuais e exclusões lógicas respeitam `FEEDBACK_EDIT_WINDOW_MINUTES`. O histórico é append-only e diferencia eventos da IA, do professor e do sistema.

O envio cria uma única entrada em `notification_outbox`. O canal é Classroom quando há turma Google reconciliada e e-mail como fallback persistido; a entrega externa fica desacoplada do registro pedagógico e pode ser processada sem duplicar a comunicação.

## Boletins, PDF e e-mail

O boletim consulta apenas notas finais aprovadas ou liberadas da turma e do período. A média é aritmética simples das notas 0–10; presença, participação e responsável são omitidos porque não possuem fonte autorizada. O filtro abaixo da média recebe um limiar explícito do professor.

Antes da persistência, a API monta um snapshot, gera o PDF e calcula SHA-256. Snapshot, bytes, período, média e destinatário ficam protegidos por trigger; o status de envio pode mudar sem reescrever a cópia emitida.

Cada chamada de envio adquire o boletim, cria `bulletin_delivery` com número crescente e passa os mesmos bytes a `BulletinEmailSender`. Sucesso ou falha encerra apenas aquela tentativa. Desenvolvimento e teste usam fixture; produção usa um adaptador indisponível até a configuração deliberada de um provedor real.

## Segurança, privacidade e operação

A API limita corpo e frequência, aplica Helmet/CSP, CORS por origem e rejeita mutações com `Origin` divergente. Logs redigem autorização e cookies. `audit_event` registra método, rota, recurso, status, professor e request ID, sem corpo ou conteúdo pedagógico.

Exportação LGPD agrega somente dados próprios e nunca credenciais. Exclusão remove sessões/credenciais e anonimiza a linha do professor, mantendo FKs históricas. `DATA_RETENTION_DAYS` governa dados técnicos expirados; registros pedagógicos, auditoria, solicitações e PDFs permanecem até política institucional adicional.

Backup e restauração são scripts externos a partir de `pg_dump`/`pg_restore`, com arquivo custom, manifesto SHA-256, alvo explícito e confirmação de restauração. A demonstração local usa fixture somente quando ambiente e flag permitem.
