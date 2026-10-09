# Progresso

Atualizado em 09/10/2026.

## Entrega atual - Dia 3

Implementados:

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
| Importador BNCC em modo seco    | Aprovado; schemas e contagens canônicas validados sem gravar no banco                                    |
| Migração/seed PostgreSQL         | Não repetidos; Docker/PostgreSQL não está disponível neste computador                                    |

## Limitações e decisões pendentes

- Nenhuma chamada real OpenAI foi executada, conforme a restrição até 12/10.
- A fonte estruturada e a fonte oficial de validação foram registradas; a gravação completa no banco precisa ser executada em PostgreSQL acessível.
- As migrações `003_curriculum_profile.sql`, `004_bncc_canonical.sql`, `005_bncc_identifier_width.sql` e a seed `002_curriculum_fixtures.sql` precisam ser executadas em PostgreSQL acessível antes da validação de integração.
- RF002 permanece implementado com integração externa adiada; RF003 depende da fonte oficial; RF005 depende da integração de banco.

## Próximo passo

Executar a migração/seed em PostgreSQL de CI ou outro ambiente autorizado, validar os endpoints de perfil e currículo e, após 12/10, habilitar a verificação real do adaptador OpenAI. Depois iniciar o Dia 4 conforme o plano.
