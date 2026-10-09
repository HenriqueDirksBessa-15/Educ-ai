# Progresso

Atualizado em 09/10/2026.

## Entrega atual - Dia 10

O fluxo de correção agora coleta respostas paginadas do Google Forms no prazo, reconcilia o aluno apenas dentro das turmas da atividade, persiste submissões idempotentes e corrige questões objetivas pelo gabarito. Atividades objetivas recebem nota normalizada de 0 a 10; atividades mistas preservam a parcela discursiva para o Dia 11; dados vazios ou inconsistentes seguem para revisão manual sem decisão automática.

Verificações finais:

- `npm run test:unit`: 58 testes aprovados (11 contratos, 43 API e 4 web);
- `npm run test:integration`: 4 testes PostgreSQL aprovados e smoke OpenAI ignorado por ser opt-in;
- migrações 001–018 aplicadas em banco vazio e repetição sem novas aplicações;
- integração PostgreSQL comprovou coleta repetida sem duplicação, reconciliação por matrícula, detalhamento por questão e preservação da correção parcial mista;
- lint, tipagem, formatação e build de produção aprovados.

Validação externa pendente: aplicar as migrações 015–018 no Cloud SQL controlado e executar uma coleta real com respostas de uma turma Google de teste após novo consentimento. Nenhuma chamada externa, deploy ou push foi executado automaticamente.

## Dia 10 - Etapa 1: cenários, contratos e persistência

- cenários de coleta, isolamento, repetição, inconsistência e correção objetiva;
- contratos de submissão, resposta por questão e resumo de coleta;
- tabelas de submissões, respostas e execuções auditáveis, com chaves externas idempotentes;
- estados explícitos para correção concluída, parcela discursiva pendente e revisão manual.

## Dia 10 - Etapa 2: coleta e reconciliação

- adaptador paginado para o endpoint de respostas do Google Forms;
- mapeamento do identificador externo da questão pela posição imutável do Form;
- worker periódico somente quando o coletor Google real está ativo;
- reconciliação por e-mail limitada às matrículas ativas nas turmas distribuídas da atividade;
- falhas normalizadas preservam dados anteriores e permitem nova tentativa.

## Dia 10 - Etapa 3: correção objetiva e interface

- corretor puro, independente do banco, com pesos e nota normalizada entre 0 e 10;
- respostas vazias, ausentes ou não reconciliadas seguem para correção manual;
- atividades mistas mantêm nota final pendente até a etapa discursiva;
- endpoints autenticados para consultar e iniciar a coleta;
- painel com quantidades, notas, estados e motivos de revisão por submissão.

## Entrega anterior - Dia 9

O fluxo de atividades agora cobre geração estruturada por IA, revisão e aprovação docente, Google Forms, distribuição por turma no Classroom, retomada idempotente de falhas e agendamento da coleta. A interface apresenta dificuldade, versões geradas, estado externo por turma e links dos recursos publicados.

Verificações finais:

- `npm run test:unit`: 52 testes aprovados (10 contratos, 38 API e 4 web);
- `npm run test:integration`: 4 testes PostgreSQL aprovados e smoke OpenAI ignorado por ser opt-in;
- migrações 001–017 aplicadas em banco vazio e repetição sem novas aplicações;
- lint, tipagem, formatação e build de produção aprovados;
- integração comprovou revisão/aprovação, invalidação após edição, publicação por turma e agendamento idempotente da coleta.

Validação externa pendente: executar smoke real com uma conta docente que conceda os novos escopos e uma turma Classroom de teste. Nenhuma chamada externa, deploy ou push foi executado automaticamente.

## Dia 9 - Etapa 1: contratos e persistência

Implementado nesta etapa:

- cenários de geração, revisão, publicação idempotente e recuperação externa;
- dificuldade e suporte a rascunho sem questões para geração assistida;
- contratos de geração, revisão, publicação, distribuição e agendamento;
- persistência versionada para IA, Google Forms, Classroom e coleta futura;
- restrições únicas para um Form por atividade e um trabalho por turma.

## Dia 9 - Etapa 2: geração estruturada

Implementado nesta etapa:

- prompt de atividade limitado ao plano, currículo, materiais, tipo e dificuldade;
- Structured Outputs para questões objetivas, discursivas e mistas;
- fixture identificada e adaptador OpenAI com validação de quantidade e formato;
- endpoints autenticados para gerar e consultar a tentativa mais recente;
- persistência versionada de sucessos e falhas sem alterar o rascunho em erro.

## Dia 9 - Etapa 3: revisão e aprovação

Implementado nesta etapa:

- aplicação da sugestão somente por revisão autenticada e explícita;
- edição integral da sugestão antes de incorporá-la ao rascunho;
- aprovação vinculada à geração revisada escolhida pelo professor;
- invalidação automática da revisão e aprovação após edição estrutural;
- isolamento por professor e bloqueio para atividades publicadas ou arquivadas.

## Dia 9 - Etapa 4: adaptadores Google

Implementado nesta etapa:

- escopos OAuth de escrita em Forms e Classroom, leitura de respostas e Drive;
- criação, configuração como quiz e publicação explícita de Google Forms;
- questões objetivas com gabarito e discursivas com campo de resposta longa;
- criação de trabalho Classroom por turma com prazo, pontos e link do Form;
- reconciliação por marcador determinístico e normalização de falhas Google.

## Dia 9 - Etapa 5: publicação idempotente

Implementado nesta etapa:

- máquina de estados persistida para criação do Form e distribuição por turma;
- retomada que ignora Form e trabalhos Classroom já confirmados;
- falha parcial por turma, reconsentimento e reconciliação explicitamente visíveis;
- publicação local somente após concluir todos os destinos obrigatórios;
- criação idempotente do agendamento de coleta no prazo da atividade.

## Entrega atual - Dia 8

Implementado nesta etapa:

- contratos tipados para atividades objetivas, discursivas e mistas, com
  validação de gabarito, pontuação, resposta-alvo e critérios;
- migração PostgreSQL para atividades, questões, alternativas e reserva de
  respostas, com proteção estrutural no banco após a publicação;
- endpoints autenticados para listar e filtrar, criar, visualizar, editar,
  publicar, finalizar e arquivar atividades;
- plano de aula obrigatório e isolado pelo professor da sessão;
- política local de atraso por atividade: bloqueio após o prazo ou aceite com
  penalidade percentual configurável;
- interface responsiva para edição manual, pré-visualização, filtros e mudanças
  de estado, sem dependência de IA;
- arquivamento lógico que preserva respostas já registradas.

Verificações da etapa:

- `npm run test:unit`: 45 testes aprovados;
- `npm run test:integration`: 4 testes PostgreSQL aprovados e smoke OpenAI
  ignorado por ausência de chave explícita;
- a integração criou e removeu um banco temporário, aplicou as migrações
  `001`–`015` e comprovou atividade mista, bloqueio após publicação e
  preservação de resposta no arquivamento;
- Docker local permaneceu indisponível; a validação PostgreSQL usou a conexão
  de teste já configurada;
- lint, tipagem, formatação e build foram executados no gate final da etapa.

## Correções pós-auditoria - Etapa 1

Implementado nesta etapa:

- identidade de turma Google passou a ser única por professor, preservando
  co-docência sem transferir propriedade local;
- códigos locais derivados de turmas Google incluem o professor e permanecem
  globalmente únicos;
- dados de aluno controlados pelo Google não podem ser sobrescritos por uma
  matrícula de planilha ou código de acesso;
- teste de migrações foi atualizado para incluir as migrações 010-014;
- testes de repositório cobrem conflito de turma compartilhada e precedência da
  origem Google.

Verificações da etapa:

- migração 014 validada em tabela PostgreSQL temporária com rollback: o mesmo
  curso é permitido para professores diferentes e rejeitado quando repetido para
  o mesmo professor;
- `npm run lint`, `npm run typecheck`, `npm run test:unit` (42 testes) e
  `npm run build` concluídos com sucesso;
- Docker local estava indisponível, portanto a suíte que cria um banco temporário
  completo não foi executada nesta etapa.

## Entrega atual - Carga BNCC direta e compatibilidade legada

Implementado nesta etapa:

- `import-bncc-cli.ts --dry-run` valida os schemas e as 1.721 aprendizagens sem conexão com o banco, emitindo checksum SHA-256 do snapshot.
- Migração `010_bncc_compatibility_projection.sql` instala uma projeção idempotente do modelo canônico para `curriculum_area`, `syllabus` e `bncc_skill`.
- A projeção usa UUIDs determinísticos, registra `curriculum_load`/`curriculum_change` e roda dentro da mesma transação da carga canônica.
- Nenhuma operação no bucket ou deploy foi executada nesta etapa.

Configuração Cloud SQL concluída posteriormente nesta etapa:

- instância nova `educai-dev`, PostgreSQL 16, zonal, 10 GiB SSD e backups habilitados;
- banco `educai` e usuário dedicado `educai_app` criados; `educai-bncc-validation` permaneceu intacta;
- migrações `001`–`013`, seeds e carga BNCC aplicadas pelo Auth Proxy na porta local `5433`;
- smoke test autenticado de `/api/curriculum` encontrou `EF05MA03` e a repetição da carga confirmou idempotência.

Evidência local: `npm run lint`, `npm run build --workspace @educai/api`, testes do workspace e `npm run db:import-bncc --workspace @educai/api -- --dry-run` concluídos; o dry-run reportou 93 EI, 1.304 EF, 183 EM, 141 Computação e total 1.721. No Cloud SQL, a carga confirmou 1.721 habilidades canônicas e legadas, 83 syllabi e um único `curriculum_load` para o checksum do snapshot.

Próxima etapa operacional: aplicar migrações e executar a carga em uma conexão controlada do Cloud SQL; depois validar contagens, `EF05MA03`, `/api/curriculum` e idempotência antes de publicar o snapshot no bucket.

## Entrega anterior - Dia 7

Implementados no Dia 7:

- geração estruturada de sugestões por fixture local ou Responses API quando uma chave é configurada;
- contexto de geração com ementa, habilidades BNCC e materiais permitidos;
- bloqueio e aviso quando o plano não possui ementa;
- persistência das tentativas, versões, modelo, origem, contexto e erros sem segredos;
- estados `draft`, `generated`, `reviewed` e `approved`;
- revisão explícita e editável antes da aprovação docente;
- tratamento de resposta inválida, timeout e indisponibilidade sem sobrescrever o plano manual;
- interface comparativa em duas colunas para plano atual e sugestão.

## Entrega anterior - Dia 6

Implementados no Dia 6:

- contratos tipados para planos de aula e filtros de arquivamento;
- migração PostgreSQL para planos, vínculos com turmas, BNCC, ementas e materiais;
- histórico de revisões com snapshots versionados;
- endpoints autenticados para listar, criar, editar, visualizar, reutilizar e arquivar planos;
- validação de propriedade das turmas e materiais e existência da ementa;
- bloqueio estrutural de edição após uso em conteúdo publicado;
- interface inicial de planos manuais com estado vazio e criação de rascunho.

## Entrega anterior - Dia 5

Implementados no Dia 5:

- contratos tipados para marcos, categorias e materiais;
- migração PostgreSQL para linha do tempo, materiais, vínculos com turmas/BNCC e proteção de conteúdo publicado;
- endpoints autenticados para listar, criar, editar, arquivar e excluir marcos e materiais;
- bloqueio de edição de marcos passados;
- confirmação obrigatória para excluir marcos vinculados a conteúdo publicado;
- bloqueio de exclusão de materiais vinculados a conteúdo publicado;
- validação de fonte do material, tipo, metadados e propriedade das turmas;
- painel autenticado inicial para linha do tempo e materiais, com estados vazios.

## Entrega anterior - Dia 4

Implementados:

- classes multi-turma com isolamento por professor da sessão;
- criação/edição de turma local e código de acesso único;
- adapter Classroom de fixture e sync idempotente por ID externo;
- alunos reconciliados por e-mail e matrículas com estados ativo/restrito/pendente;
- origem Google protegida e flags de inconsistência;
- endpoints protegidos para turmas, detalhes e matrícula;
- cenários e contratos do Dia 4.

- adaptador OpenAI tipado com fixture e bloqueio de chamadas externas até 12/10;
- estados OpenAI `missing`, `deferred`, `available` e `unavailable` normalizados;
- estado OpenAI incluído no ciclo técnico de monitoramento sem chamada externa;
- migração curricular com fonte, versão, checksum, estado e histórico de alterações;
- seed curricular idempotente e explicitamente simulada;
- consulta curricular protegida por componente, ano/série e habilidade;
- fallback `reviewRequired` quando a habilidade não é encontrada;
- perfil protegido com nome e preferência editáveis;
- e-mail Google ausente da entrada de atualização e bloqueado no backend;
- listagem de turmas do professor, incluindo estado vazio;
- contratos e testes isolados para OpenAI, currículo e perfil.
- fonte BNCC canônica registrada em [docs/fontes-bncc.md](./fontes-bncc.md), com schemas e contagens validados em modo seco.

## Verificações

| Verificação                      | Resultado                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run check`                  | Aprovada: formatação, lint, tipos, 8 testes de contratos, 29 testes de API, 4 testes web e builds completos |
| `npm audit --omit=dev`           | Aprovada anteriormente; dependências de produção sem vulnerabilidades reportadas                            |
| Testes de repositório curricular | Aprovados; agrupamento, fonte e fallback de revisão                                                         |
| Testes de perfil                 | Aprovados; lista vazia e atualização sem e-mail                                                             |
| Testes do adaptador OpenAI       | Aprovados; conexão, Structured Outputs, fixture e erros normalizados                                        |
| Smoke test OpenAI real           | Configurado e pulado sem chave; exige `RUN_OPENAI_INTEGRATION=true`                                         |
| Importador BNCC em modo seco     | Aprovado; schemas e contagens canônicas validados sem gravar no banco                                       |
| Migração/seed Cloud SQL          | Aprovada; `006_classes_students.sql` aplicada e seeds idempotentes no PostgreSQL 16 em São Paulo            |
| Testes unitários de turmas       | Aprovados; escopo por professor e upsert de matrícula                                                       |
| Smoke test Cloud SQL             | Aprovado; turma isolada, matrícula repetida resultou em 1 aluno e outro professor não acessou               |
| `npm run test:integration`       | Bloqueado no Cloud SQL: usuário IAM não tem permissão `CREATEDB`; os 3 testes foram pulados                 |

## Limitações e decisões pendentes

- Nenhuma chamada faturável OpenAI foi executada; o campo local da chave permanece vazio.
- A fonte estruturada e a fonte oficial de validação foram registradas; a gravação completa no banco precisa ser executada em PostgreSQL acessível.
- A carga BNCC completa foi validada em modo seco; a execução transacional no `db-f1-micro` foi interrompida por lentidão e revertida, sem dados parciais.
- RF002 possui integração real preparada e depende da chave; RF003 depende da fonte oficial; RF005 depende da integração de banco.
- A migração `006_classes_students.sql` ainda precisa ser aplicada e validada no Cloud SQL.

## Próximo passo

Aplicar as migrações 015–018 no Cloud SQL controlado e executar o smoke Google dos Dias 9–10; em seguida iniciar sugestão discursiva, revisão docente e liberação de notas do Dia 11.
