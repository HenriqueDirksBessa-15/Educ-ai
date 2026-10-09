# Progresso

Atualizado em 09/10/2026.

## Entrega atual - Carga BNCC direta e compatibilidade legada

Implementado nesta etapa:

- `import-bncc-cli.ts --dry-run` valida os schemas e as 1.721 aprendizagens sem conexão com o banco, emitindo checksum SHA-256 do snapshot.
- Migração `010_bncc_compatibility_projection.sql` instala uma projeção idempotente do modelo canônico para `curriculum_area`, `syllabus` e `bncc_skill`.
- A projeção usa UUIDs determinísticos, registra `curriculum_load`/`curriculum_change` e roda dentro da mesma transação da carga canônica.
- Nenhuma operação no bucket, Cloud SQL ou deploy foi executada nesta etapa.

Evidência local: `npm run lint`, `npm run build --workspace @educai/api`, testes do workspace e `npm run db:import-bncc --workspace @educai/api -- --dry-run` concluídos; o dry-run reportou 93 EI, 1.304 EF, 183 EM, 141 Computação e total 1.721.

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

Aplicar as migrações dos Dias 5–7 no Cloud SQL quando disponível e iniciar o Dia 8 conforme o plano.
