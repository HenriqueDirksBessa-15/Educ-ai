# Pendências de backend do redesenho da interface

Documento único para o Codex. Reúne o que as etapas 02 a 10 do redesenho
(`docs/telas/`) encontraram no backend e que a interface não consegue
resolver sozinha. Atualizado em 16/10/2026, com o código conferido no commit
`09b3f60` (API sem mudanças desde `7803831`).

## Como usar

- **Prioridade:** P0 bloqueia uma tela ou deixa o professor com informação
  errada; P1 obriga a interface a um contorno visível; P2 é melhoria.
- Cada item diz **onde está no backend**, **onde afeta a interface**, o
  **contorno atual** e o **aceite**.
- A interface não muda o backend. Quando um item for resolvido, o Claude
  ajusta a tela correspondente, com testes, num commit próprio.
- Os códigos B-01 a B-07 são os mesmos da
  [proposta](./01-proposta-ui.md#7-dependências-do-backend-para-o-codex).

## Resumo

| ID    | Prioridade | Pendência                                                   | Tela afetada            |
| ----- | ---------- | ----------------------------------------------------------- | ----------------------- |
| B-01  | P0         | Plano com IA exige preencher tudo antes                     | Aulas (etapa 07 parada) |
| BK-01 | P0         | Habilidade BNCC de vários anos aparece só no primeiro       | Turmas, Aulas           |
| BK-02 | P0         | Questões editadas depois da aprovação são publicadas        | Atividades              |
| B-07  | P1         | Correção e revisão de recado exigem comentário do professor | Correções, Recados      |
| B-06  | P1         | Alunos para recado sem a turma                              | Recados                 |
| BK-03 | P1         | Códigos de erro genéricos escondem a causa                  | Todas                   |
| BK-04 | P1         | Recado com entrega falha não pode ser reenviado             | Recados                 |
| B-02  | P2         | Catálogo BNCC leve (sem habilidades)                        | Turmas                  |
| BK-05 | P2         | Resumo de pendências pronto para o Início                   | Início, menu            |
| B-04  | P2         | Devolver várias notas numa chamada                          | Correções               |
| B-05  | P2         | Turma aceita mais de uma matéria                            | Turmas                  |
| BK-06 | P2         | Ligar uma resposta sem e-mail a um aluno                    | Correções               |
| BK-07 | P2         | Preferência de notificação sem uso                          | Minha conta             |

## P0

### B-01 — Gerar o plano com IA a partir de um rascunho mínimo

- **Backend:** `lessonPlanInputSchema` (`packages/contracts/src/index.ts:327`)
  exige objetivos, conteúdos, metodologia e avaliação com pelo menos 1
  caractere; `/api/lesson-plans/:id/generate` só roda sobre plano salvo.
- **Interface:** a etapa 07 (Aulas) está parada. O assistente "Planejar uma
  aula" prevê turma e tema → habilidades → materiais → **Pedir sugestão à
  IA**. Hoje a IA só ajuda depois que o professor escreveu tudo o que ela
  deveria escrever.
- **Contorno atual:** nenhum; a tela antiga de planos continua em uso.
- **Aceite:** criar rascunho só com turma, matéria, ano, tema e habilidades, e
  gerar a sugestão a partir dele; a aprovação continua exigindo os campos
  completos.

### BK-01 — Habilidades BNCC de vários anos ligadas só ao primeiro ano

- **Backend:** a projeção `database/migrations/010_bncc_compatibility_projection.sql`
  escolhe um único recorte temporal por habilidade (`LIMIT 1` sobre
  `bncc_learning_time_cut`, linha 99, ordenado pelo número do ano). Uma
  habilidade de 6º a 9º ano vira um `syllabus` só do 6º ano.
- **Interface:** Turmas grava o ano da turma com o valor exato do catálogo
  (`ef-ano-08`), e Aulas busca as habilidades por esse ano. O professor do 8º
  ano não encontra habilidades que a BNCC prevê para ele.
- **Contorno atual:** nenhum possível na interface.
- **Aceite:** uma habilidade aparece em todos os anos em que a BNCC a prevê,
  sem duplicar o registro canônico; uma migração nova recompõe a projeção de
  forma idempotente.

### BK-02 — Questões editadas depois da aprovação da IA são publicadas

- **Backend:** `PATCH /api/activities/:id` (`apps/api/src/activities/repository.ts:131`)
  altera as questões sem desfazer a aprovação da versão da IA, e a publicação
  usa as questões atuais da atividade (`apps/api/src/activities/publication.ts:41`
  e `:100`).
- **Interface:** Atividades (`ActivitiesPages.tsx`) sempre revisa e aprova de
  novo depois de qualquer mudança, mas outro cliente da API pode publicar
  questões que o professor não aprovou.
- **Contorno atual:** só a disciplina da interface.
- **Aceite:** mudar questões de uma atividade que usou IA volta a exigir
  revisão e aprovação antes de publicar (teste de integração).

## P1

### B-07 — Comentário obrigatório na correção e na revisão de recado

- **Backend:** `discursiveAnswerReviewSchema` (`:660`) e
  `submissionCorrectionReviewSchema` (`:666`) exigem comentário com pelo
  menos 1 caractere; `feedbackReviewSchema` (`:809`) exige
  `teacherObservation`.
- **Interface:** a decisão DU-01 diz que o comentário pode ficar vazio. A tela
  antiga gravava "Revisão docente." em nome do professor.
- **Contorno atual:** Correções exige o comentário (decisão de 16/10/2026);
  Recados grava o texto revisado com `PATCH` em vez de `/review`.
- **Aceite:** aceitar comentário e observação vazios (ou nulos); então a
  interface torna os campos opcionais e Recados volta a usar `/review`.

### B-06 — Turma de cada aluno elegível para recado

- **Backend:** `eligibleFeedbackSubmissionSchema` (`:881`) devolve aluno,
  atividade e nota, sem turma.
- **Interface:** Recados prevê "Turma → Aluno"; hoje os alunos aparecem
  agrupados por atividade.
- **Aceite:** incluir `classId` e `className`; a interface adiciona o filtro
  por turma.

### BK-03 — Códigos de erro específicos (inclui B-03)

- **Backend:** situações diferentes voltam com o mesmo código:
  - falha da IA vira `INTEGRATION_UNAVAILABLE` em
    `apps/api/src/activities/routes.ts:228`,
    `apps/api/src/corrections/routes.ts:70` e
    `apps/api/src/feedback/routes.ts:128` (o código da OpenAI fica só no
    histórico);
  - falta de permissão do Google e Google fora do ar usam o mesmo código em
    `apps/api/src/classes/routes.ts` (linhas 40 e 406);
  - "antes do prazo" e "busca em andamento" usam `VALIDATION_ERROR` em
    `apps/api/src/activities/routes.ts:350` e `:357`;
  - "sem notas no período" e "ninguém abaixo da média" usam
    `VALIDATION_ERROR` em `apps/api/src/bulletins/routes.ts:49` e `:56`.
- **Interface:** `apps/web/src/labels.ts` traduz códigos em mensagens com o
  que fazer. Com códigos genéricos, as telas mostram mensagens que cobrem
  dois casos ("espere o prazo terminar ou encerre as respostas") ou supõem a
  causa (falha da IA).
- **Aceite:** um código por situação (ex.: `OPENAI_*` no corpo do erro,
  `GOOGLE_RECONSENT_REQUIRED`, `COLLECTION_NOT_DUE`, `COLLECTION_BUSY`,
  `BULLETIN_WITHOUT_GRADES`, `BULLETIN_FILTER_EMPTY`) e a lista exportada em
  `packages/contracts` (B-03) para a interface validar o mapa de mensagens.

### BK-04 — Reenviar um recado cuja entrega falhou

- **Backend:** enviar de novo não cria nova entrega
  (`ON CONFLICT (feedback_id) DO NOTHING` em
  `apps/api/src/feedback/repository.ts:422`); depois das tentativas
  automáticas, a entrega fica falha para sempre.
- **Interface:** Recados mostra "Não foi enviado – avise o suporte", sem
  botão.
- **Aceite:** uma ação para reenfileirar a entrega falha, idempotente; a
  interface volta a oferecer **Tentar de novo**.

## P2

### B-02 — Catálogo BNCC leve

- **Backend:** só existe `GET /api/curriculum`, que devolve todas as
  habilidades.
- **Interface:** Turmas monta etapa, ano e matéria a partir dessa resposta
  inteira (`apps/web/src/curriculumCatalog.ts`, uma vez por sessão).
- **Aceite:** endpoint com etapas, anos e matérias oficiais, sem habilidades.

### BK-05 — Resumo de pendências para o Início

- **Backend:** não há resumo; o Início chama a coleta de até 20 atividades e
  o detalhe de até 30 turmas a cada visita (`apps/web/src/overview.ts`).
- **Aceite:** um endpoint com as contagens que o Início e o menu usam
  (respostas para corrigir, notas aprovadas não devolvidas, devoluções
  falhas, planos para aprovar, turmas sem matéria, atividades que fecham em
  48 horas, recados e boletins não enviados).

### B-04 — Devolver várias notas numa chamada

- **Backend:** `/api/submissions/:id/release` é por aluno.
- **Interface:** Correções devolve em sequência e lista as falhas.
- **Aceite:** devolução em lote por atividade, com resultado por aluno.

### B-05 — Uma matéria por turma

- **Backend:** `classCurriculumInputSchema` (`:151`) aceita até 20 matérias.
- **Interface:** Turmas envia sempre uma (DU-06).
- **Aceite:** limitar a uma matéria, com migração para turmas que tenham mais.

### BK-06 — Ligar uma resposta sem e-mail a um aluno

- **Backend:** respostas sem e-mail do respondente ficam sem aluno e não há
  ação para associá-las.
- **Interface:** Correções mostra "Resposta sem aluno identificado" com o
  motivo.
- **Aceite:** ação para associar a resposta a um aluno da turma, com
  histórico.

### BK-07 — Preferência de notificação sem uso

- **Backend:** `notificationPreference` existe no perfil (`:57`), mas só é
  usada pelo próprio perfil, pela exportação e pela anonimização; nenhum aviso
  ao professor a consulta.
- **Interface:** Minha conta não mostra a opção para não enganar o
  professor.
- **Aceite:** usar a preferência em algum aviso ao professor, ou removê-la.

## Pendências só da interface (para não confundir)

- Etapa 07 (Aulas) aguarda B-01; o campo "Ano/série" do plano ainda mostra o
  valor técnico do ano.
- A mensagem de retorno das telas está repetida e pode virar um componente
  comum.
- O E2E foi atualizado em cada etapa, mas não foi executado (exige API e
  banco locais).
