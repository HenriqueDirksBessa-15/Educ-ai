# Progresso

Atualizado em 10/10/2026.

## Entrega atual - Dia 4

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
| `npm run check`                  | Aprovada: formatação, lint, tipos, 7 testes de contratos, 22 testes de API, 4 testes web e builds completos |
| `npm audit --omit=dev`           | Aprovada anteriormente; dependências de produção sem vulnerabilidades reportadas                            |
| Testes de repositório curricular | Aprovados; agrupamento, fonte e fallback de revisão                                                         |
| Testes de perfil                 | Aprovados; lista vazia e atualização sem e-mail                                                             |
| Testes do adaptador OpenAI       | Aprovados; ausência, adiamento, fixture e erro normalizado                                                  |
| Importador BNCC em modo seco     | Aprovado; schemas e contagens canônicas validados sem gravar no banco                                       |
| Migração/seed Cloud SQL          | Aprovada; `006_classes_students.sql` aplicada e seeds idempotentes no PostgreSQL 16 em São Paulo            |
| Testes unitários de turmas       | Aprovados; escopo por professor e upsert de matrícula                                                       |
| Smoke test Cloud SQL             | Aprovado; turma isolada, matrícula repetida resultou em 1 aluno e outro professor não acessou               |
| `npm run test:integration`       | Bloqueado no Cloud SQL: usuário IAM não tem permissão `CREATEDB`; os 3 testes foram pulados                 |

## Limitações e decisões pendentes

- Nenhuma chamada real OpenAI foi executada, conforme a restrição até 12/10.
- A fonte estruturada e a fonte oficial de validação foram registradas; a gravação completa no banco precisa ser executada em PostgreSQL acessível.
- A carga BNCC completa foi validada em modo seco; a execução transacional no `db-f1-micro` foi interrompida por lentidão e revertida, sem dados parciais.
- RF002 permanece implementado com integração externa adiada; RF003 depende da fonte oficial; RF005 depende da integração de banco.
- A migração `006_classes_students.sql` ainda precisa ser aplicada e validada no Cloud SQL.

## Próximo passo

Executar a suíte de integração contra o Cloud SQL quando necessário e iniciar o Dia 5 conforme o plano.
