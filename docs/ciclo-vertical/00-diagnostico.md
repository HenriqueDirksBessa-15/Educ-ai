# Diagnóstico do ciclo vertical A → E

Atualizado em 10/10/2026. Este documento executa a primeira tarefa de
[`CICLO_VERTICAL_TDD_EDUCAI.md`](../../CICLO_VERTICAL_TDD_EDUCAI.md): mapear o
caminho real antes de alterar a implementação.

## 1. Escopo e regra de evidência

Foram confrontados:

- o DERS completo de 96 páginas, especialmente RF001 e RF003–RF014 nas páginas
  físicas 38–78 e os diagramas técnicos das páginas 81–89;
- as migrações 001–022;
- rotas, repositórios, adaptadores, contratos e interface atuais;
- os testes declarados e os gates executáveis neste worktree;
- [`README.md`](../../README.md),
  [`relatorio-final.md`](../relatorio-final.md),
  [`matriz-rastreabilidade.md`](../matriz-rastreabilidade.md) e
  [`AUDITORIA_TECNICA_DIA_07.md`](../../AUDITORIA_TECNICA_DIA_07.md).

Neste diagnóstico, “real” significa uma chamada executada contra Google ou
OpenAI com credencial de homologação. Código de produção, mocks HTTP, fixtures e
testes de contrato provam preparação, não integração externa concluída.

Nenhuma chamada Google/OpenAI, escrita em Cloud SQL, criação de recurso cloud,
deploy ou publicação foi realizada.

## 2. Parecer executivo

**O ciclo A → E ainda não é demonstrável de ponta a ponta.** Há uma base local
substancial para planos, atividades, correção e boletins, mas o caminho quebra
antes da primeira turma real e volta a quebrar na composição da experiência do
professor.

Os bloqueios determinantes são:

| ID     | Prioridade | Evidência atual                                                                                                                                                             | Consequência                                                                                  |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| CV-001 | P0         | `classroom/adapter.ts` contém somente `FixtureClassroomAdapter`; `app.ts` o injeta em todo ambiente que não seja teste                                                      | `/api/classes/sync` nunca consulta uma turma real, inclusive em produção                      |
| CV-002 | P0         | o adaptador de turma só expõe `listCourses()`; não há criação de curso, listagem de professores/alunos ou sincronização de matrículas                                       | não é possível concluir a Etapa A nem obter identidade Google do aluno para devolução de nota |
| CV-003 | P0         | a interface lista turmas, materiais e planos, mas não oferece sincronização/criação de turma, seleção curricular/BNCC, cadastro de material ou formulário completo de plano | um professor real não consegue montar B pela aplicação                                        |
| CV-004 | P0         | a UI cria plano com textos “A definir” e listas vazias, não busca `/api/curriculum` e não expõe `/approve`; a atividade aceita plano apenas não arquivado                   | não se comprova plano contextualizado e aprovado antes da atividade                           |
| CV-005 | P0         | não há ambiente HTTPS de homologação nem evidência externa atual; Google/OpenAI continuam sem smoke real                                                                    | os critérios externos do ciclo não foram exercitados                                          |
| CV-006 | P1         | materiais recebem `url` ou `storageKey` fornecido pelo cliente; não existe upload, adaptador local/GCS, download autorizado, edição ou visualização                         | arquivo não é armazenado nem pode ser verificado com segurança                                |
| CV-007 | P1         | monitor usa apenas `getLatestCredential()` e `/api/integrations/status` lê o último status global por serviço                                                               | duas contas podem visualizar estado derivado da credencial mais recente, não o próprio estado |
| CV-008 | P1         | operações agregadas de turmas, materiais, planos e revisões fazem várias queries sem cliente/transação de domínio                                                           | falha intermediária pode deixar registros e vínculos parciais                                 |
| CV-009 | P1         | publicação persiste Form e course work, mas não o vínculo explícito questão local ↔ item/question ID do Forms; coleta reconstrói por posição                               | alteração/ordem externa pode mapear resposta à questão errada                                 |
| CV-010 | P1         | o conjunto automático do coletor tem um caso de paginação/mapeamento; faltam duplicação, aluno sem matrícula, aluno alheio, vazio e payload inválido                        | a fronteira simulada obrigatória da Etapa D não está coberta                                  |
| CV-011 | P1         | a suíte web falhou agregada e passou isolada; `format:check` falha no checkout Windows por LF/CRLF                                                                          | o gate TDD não é determinístico neste worktree                                                |

Não foi identificado P0 de vazamento direto de token: credenciais permanecem no
servidor, cifradas, e as rotas de domínio partem da sessão. Isso não reduz os
bloqueios funcionais acima.

## 3. Mapa por ação do ciclo

### Etapa A — Google e turmas

| Ação / DERS                                         | Implementação atual                                                      | Dependências                                                        | Bloqueio                                                                             | Teste existente                                        | Menor alteração necessária                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Login Google real — RF004, p. 46–48                 | OAuth com state, PKCE, callback, cadastro, cookie e token cifrado        | client ID/secret, redirect HTTPS, consent screen e conta autorizada | código preparado, não executado externamente                                         | callback simulado no teste PostgreSQL; rotas unitárias | criar smoke manual de homologação e evidência redigida; nenhum bypass fixture                      |
| Listar turmas reais — RF001/RF006, p. 38–40 e 51–53 | endpoint de sync + upsert por `(professor_id, google_classroom_id)`      | escopo de cursos e credencial do professor                          | CV-001; adapter fixture vazio                                                        | 3 testes SQL/mocks do repositório                      | adapter Classroom de produção com refresh, paginação, filtro de papel docente e erros normalizados |
| Criar turma real — RF006, p. 51–53                  | criação apenas local                                                     | `classroom.courses` e permissão da conta                            | método/rota/estado remoto inexistentes                                               | nenhum                                                 | `courses.create`, persistência idempotente do ID e reconciliação por marcador/resultado            |
| Associar currículo à turma — RF003/RF006            | componente/ano existem no plano; turma guarda apenas `school_year` livre | decisão de etapa, ano e um ou mais componentes                      | vínculo curricular explícito de turma inexistente                                    | nenhum                                                 | migração + contratos + API para perfil curricular da turma, sem inferir pelo nome do curso Google  |
| Importar alunos — RF001/RF007, p. 54–56             | matrícula local e precedência da origem Google existem                   | roster, e-mail/perfil e ID Google                                   | adapter não lista roster; contrato de curso não traz alunos; UI não gerencia estados | teste de upsert SQL; sem adapter real                  | sincronizar roster paginado, external ID, origem/status e remoções/restrições sem apagar histórico |

### Etapa B — Materiais, BNCC e plano

| Ação / DERS                                                      | Implementação atual                                                                          | Dependências                                     | Bloqueio                                                                             | Teste existente                                | Menor alteração necessária                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Selecionar componente/ano/BNCC — RF003 e RF009, p. 44–46 e 59–63 | base canônica, endpoint filtrado e vínculos de plano                                         | carga BNCC no banco de homologação               | API existe; UI não consulta nem seleciona; turma não possui perfil curricular        | 2 unidades de repositório; dry-run documentado | painel curricular da turma/plano com fonte, códigos, descrições e fallback explícito                            |
| Adicionar link/material — RF010, p. 63–66                        | metadados, categorias e vínculos no PostgreSQL                                               | armazenamento privado ou URL externa             | CV-006; UI apenas lista                                                              | nenhum teste específico do material            | primeiro suportar link pela UI; depois upload multipart com storage adapter, tamanho/tipo e download autorizado |
| Criar plano manual/IA — RF009, p. 59–63                          | contratos, CRUD, prompt e Responses API estruturada                                          | turma, ementa, BNCC, materiais e OpenAI opcional | formulário reduzido cria placeholders e vínculos vazios; geração fica inviável       | prompt: 2; OpenAI: casos estruturados          | formulário completo usando relações reais e preservação do rascunho em falha                                    |
| Campos docentes do plano — RF009, Quadro 23                      | título, componente, ano, objetivos, conteúdos, metodologia e avaliação; recursos por relação | decisão sobre tempo/referências do ciclo         | tempo e referências do plano vertical não existem; recursos não são editáveis na UI  | validação contratual genérica                  | adicionar somente campos aprovados; não alegar layout nacional obrigatório                                      |
| Revisar e aprovar — autoridade docente                           | API registra geração, revisão e aprovação; histórico versionado                              | geração válida ou plano manual                   | UI revisa sugestão, mas não aprova; plano manual não tem gesto explícito equivalente | prompt e integração ampla de banco             | expor aprovação e exigir `lesson_plan.status = 'approved'` antes de gerar/publicar atividade                    |

### Etapa C — questões e publicação

| Ação / DERS                               | Implementação atual                                               | Dependências                                        | Bloqueio                                                                         | Teste existente                                            | Menor alteração necessária                                                            |
| ----------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Gerar a partir do plano — RF011, p. 66–69 | contexto usa ementa, códigos BNCC e títulos de materiais          | plano íntegro e OpenAI real                         | repositório aceita plano não aprovado; conteúdo de arquivo não entra no contexto | 1 unidade de contexto + OpenAI                             | gate de plano aprovado e decisão explícita sobre extração de conteúdo permitido       |
| Validar/revisar/aprovar questões          | schemas estritos, prévia editável, revisão e aprovação da geração | modelo configurado                                  | preparada localmente; smoke real ausente                                         | 12 testes do adapter incluem atividades/correções/feedback | executar smoke com limite de custo e registrar payload sanitizado/metadados           |
| Criar Form e atividade Classroom          | publisher real cria/configura/publica Form e course work          | escopos Forms, Drive e Classroom; turma Google real | não exercido; turma real é inalcançável pelo fluxo atual                         | 3 unidades HTTP mockadas + 1 serviço                       | após A/B, smoke real idempotente em uma turma de homologação                          |
| Persistir IDs e repetir sem duplicar      | Form e course work têm estados e marcadores determinísticos       | Drive `drive.file` e acesso ao curso                | CV-009 para questões; ausência de teste concorrente                              | serviço testa repetição básica                             | salvar IDs retornados por item e testar retentativa após falha parcial e concorrência |

### Etapa D — resposta real e regressão sintética

| Ação / DERS                                  | Implementação atual                                                           | Dependências                                                | Bloqueio                          | Teste existente              | Menor alteração necessária                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| Resposta humana real — RF011/RF012, p. 66–73 | fronteira de coleta pronta; não há automação de login do aluno                | 1–2 alunos fictícios legitimamente geridos e Form publicado | teste externo ainda não realizado | nenhum por definição         | roteiro humano com correta/incorreta/discursiva e evidência sem dado real                 |
| Ingestão automática sintética                | fixture collector retorna lista vazia por padrão; teste injeta HTTP sintético | fixtures do formato `forms.responses.list`                  | CV-010                            | 1 teste de paginação/posição | coleção versionada de fixtures para repetição, duplicação, aluno externo/ausente e vazios |

### Etapa E — coleta, correção e boletim

| Ação / DERS            | Implementação atual                                          | Dependências                                  | Bloqueio                                                               | Teste existente                                                 | Menor alteração necessária                                                     |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Buscar respostas reais | coletor Forms paginado, lease e upsert por resposta externa  | Form real e credencial com respostas readonly | não exercido; mapeamento por posição                                   | 1 coletor + 1 serviço                                           | vínculo explícito de questão e smoke de coleta repetida                        |
| Corrigir objetiva      | função pura ponderada e normalização 0–10                    | gabarito local íntegro                        | sem bloqueio estrutural identificado                                   | 3 unidades                                                      | ampliar limites, tolerância de normalização e propriedades relevantes          |
| Sugerir discursiva     | prompt estruturado; vazio/ambíguo direciona ao manual        | OpenAI real opcional                          | não exercido externamente                                              | casos no adapter                                                | smoke real sanitizado; preservar sempre decisão docente                        |
| Revisar e liberar      | ajuste, aprovação, histórico append-only e retorno Classroom | external user ID e course work da matrícula   | ID Google do aluno não entra pelo fluxo atual; devolução real inviável | unidades de release/return + banco não executado neste worktree | completar roster e testar liberação local + externa sem perder estado em falha |
| Gerar PDF              | consolidação de notas liberadas, snapshot imutável e PDF     | ao menos uma nota aprovada/liberada           | preparado localmente; ciclo real não chega a uma nota                  | média: 3; PDF: 1; serviço: 1                                    | validar PDF resultante do aluno fictício e isolamento entre professores        |

## 4. Banco, integridade e isolamento

### O que já é favorável

- todas as entidades pedagógicas principais usam UUID e FKs;
- turma Google é única por professor, permitindo co-docência local sem transferir
  a propriedade;
- consultas centrais filtram `professor_id` ou chegam ao recurso por uma relação
  pertencente ao professor;
- publicação e coleta têm chaves únicas, estados persistidos e retomada;
- históricos de correção, feedback e boletim possuem proteção de imutabilidade.

### Lacunas a fechar antes do smoke real

1. O monitor e a consulta de status devem ser por professor para Google e global
   apenas para OpenAI.
2. Criação de material/plano e substituição de vínculos precisam usar uma única
   conexão/transação; o mesmo vale para sincronizações agregadas.
3. A aprovação do plano deve ser uma pré-condição consultada no banco, não uma
   convenção da interface.
4. O vínculo questão local ↔ item/question ID do Forms deve ser persistido e
   único por publicação.
5. Testes negativos devem cobrir professor B em todos os recursos usados no
   ciclo, URL de anexo, matrícula alheia e reutilização de IDs externos.

## 5. Inventário e gate atual de testes

Uma triagem por arquivo dos 76 casos reportados produz a classificação
provisória abaixo. Ela ainda não substitui o inventário caso a caso exigido pelo
ciclo; esse inventário faz parte de CV-0 e deve eliminar testes triviais antes
de fixar a linha de base da meta:

| Classe                             | Quantidade declarada | Classificação                                                       |
| ---------------------------------- | -------------------: | ------------------------------------------------------------------- |
| Contratos compartilhados           |                   13 | unidades genuínas de schema/regra                                   |
| API fora de `app.test.ts`          |                   48 | unidades de domínio/adaptador/repositório com dublês                |
| API em `app.test.ts`               |                   11 | testes de componente HTTP em processo; não contam como unidade pura |
| Web                                |                    4 | testes de componente; não contam como unidade pura                  |
| **Candidatas a unidades genuínas** |               **61** | teto provisório, sujeito ao inventário individual                   |

Integração e E2E permanecem separados: existem 5 casos PostgreSQL, 1 smoke
OpenAI opt-in e 3 cenários Playwright executados historicamente em dois projetos
de navegador. Nenhum deles é o ciclo A → E externo.

Gate executado neste worktree após `npm ci`:

- contratos: 13/13 aprovados;
- API: 59/59 aprovados;
- web agregado: 3/4 aprovados; o caso do shell autenticado excedeu o tempo de
  espera do lazy import, mas passou 4/4 quando repetido isoladamente — evidência
  de flakiness, não de regressão funcional confirmada;
- integração PostgreSQL: não executada; sem `.env`/`DATABASE_URL`, a suíte
  deveria ignorar o bloco, mas tentou construir `new URL(baseUrl)` e falhou com
  `Invalid URL`; smoke OpenAI foi ignorado;
- lint, typecheck e build: aprovados;
- formato: falhou em 152 arquivos no checkout CRLF; amostras passam com
  `prettier --end-of-line auto`;
- `npm audit --omit=dev`: zero vulnerabilidades de produção; o audit completo
  após instalação reportou 14 vulnerabilidades de desenvolvimento.

Conclusão do gate: a fotografia “76 testes aprovados” não é reproduzível de
forma agregada neste worktree sem sanear flakiness, ausência de banco e política
de fim de linha.

## 6. Menor conjunto de patches proposto

Cada patch é uma etapa própria, com especificação/teste primeiro, documentação,
gate e commit separado.

1. **CV-0 — tornar o gate confiável:** corrigir skip da integração sem URL,
   estabilizar o teste lazy e tornar a checagem Prettier compatível com LF/CRLF;
   produzir inventário individual dos 76 casos.
2. **CV-A1 — Classroom real por professor:** adapter de produção com refresh,
   paginação, papéis, erros e escopos; status isolado por professor; TDD sem
   chamada externa.
3. **CV-A2 — turmas e roster:** listar/importar, criar curso idempotente e
   sincronizar alunos/external IDs; perfil curricular explícito da turma;
   interface mínima e testes negativos Professor A/B.
4. **CV-B1 — material utilizável:** cadastro de link ponta a ponta; upload
   privado por adapter somente após escolha de bucket; download/visualização
   autorizados e transacionais.
5. **CV-B2 — plano completo:** seleção turma/componente/ano/BNCC/material,
   formulário docente, revisão/aprovação explícita e gate de plano aprovado.
6. **CV-C — publicação:** persistir mapeamento de questões Forms, fechar
   concorrência/retentativa e publicar somente geração aprovada.
7. **CV-D/E simulado:** fixtures sintéticas completas, ingestão idempotente,
   isolamento, objetiva, discursiva, aprovação, liberação e PDF em banco
   efêmero.
8. **CV-HML — homologação autorizada:** preparar configuração/CI, executar
   login/turma/OpenAI/Forms/coleta reais com dados fictícios e o envio humano de
   1–2 alunos; registrar custo, evidência e rollback.

Os patches 1–7 não exigem criar recursos cloud nem chamar APIs faturáveis. O
patch 8 depende de aprovação explícita das decisões abaixo.

## 7. Permissões, recursos e decisões antes da homologação

### OAuth e APIs Google propostas

- APIs: Google Classroom API, Google Forms API e Google Drive API;
- escopos de identidade: `openid`, `email`, `profile`;
- cursos: `classroom.courses` (necessário para listar e criar);
- roster: `classroom.rosters.readonly`, `classroom.profile.emails` e, apenas se
  a imagem for usada, `classroom.profile.photos`;
- publicação/devolução: `classroom.coursework.students`;
- Forms: `forms.body`, `forms.responses.readonly`;
- reconciliação idempotente do Form: `drive.file`.

Esses escopos devem ser validados contra o consent screen e reduzidos se o smoke
mostrar que uma permissão mais restrita atende. Não será solicitado acesso a
arquivos gerais do Drive.

### Recursos de homologação propostos, não criados

- URL HTTPS de web e API e seus redirects/origens OAuth;
- serviço Cloud Run para API, com service account dedicada;
- banco/schema isolado no Cloud SQL, preferível a escrever diretamente na base
  de desenvolvimento existente;
- bucket privado de homologação ou prefixo isolado, com acesso uniforme;
- Secret Manager para Google client secret, chave de cifra, URL do banco e
  chave OpenAI;
- IAM mínimo: Cloud SQL Client, Secret Manager Secret Accessor e Storage Object
  User somente no bucket/prefixo necessário; permissão de deploy separada da
  identidade de runtime.

### Aprovações necessárias

1. autorizar os escopos OAuth acima e indicar Professor A/B e 1–2 alunos
   fictícios gerenciados legitimamente;
2. escolher banco isolado ou autorizar explicitamente o uso de `educai-dev`;
3. autorizar reutilização do bucket documentado ou criação de bucket/prefixo de
   homologação;
4. informar URLs/domínio de homologação e autorizar configuração/deploy;
5. autorizar um smoke OpenAI, com modelo e teto de custo por execução;
6. confirmar que o operador humano fará os envios no Forms e que não haverá
   automação de login de aluno.

Até essas decisões, o trabalho seguro é CV-0 a CV-D/E simulado. Nenhum sucesso
externo deve ser marcado por fixture, documentação ou código não executado.
