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

## Verificações

| Verificação                      | Resultado                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run check`                  | Aprovada: formatação, lint, tipos, 7 testes de contratos, 22 testes de API, 4 testes web e builds completos |
| `npm audit --omit=dev`           | Aprovada anteriormente; dependências de produção sem vulnerabilidades reportadas                            |
| Testes de repositório curricular | Aprovados; agrupamento, fonte e fallback de revisão                                                         |
| Testes de perfil                 | Aprovados; lista vazia e atualização sem e-mail                                                             |
| Testes do adaptador OpenAI       | Aprovados; ausência, adiamento, fixture e erro normalizado                                                  |
| Migração/seed PostgreSQL         | Não repetidos; Docker/PostgreSQL não está disponível neste computador                                       |

## Limitações e decisões pendentes

- Nenhuma chamada real OpenAI foi executada, conforme a restrição até 12/10.
- A fonte oficial da BNCC ainda não foi fornecida; a carga versionada atual continua simulada.
- A migração `003_curriculum_profile.sql` e a seed `002_curriculum_fixtures.sql` precisam ser executadas em um PostgreSQL acessível antes da validação de integração.
- RF002 permanece implementado com integração externa adiada; RF003 depende da fonte oficial; RF005 depende da integração de banco.

## Próximo passo

Executar a migração/seed em PostgreSQL de CI ou outro ambiente autorizado, validar os endpoints de perfil e currículo e, após 12/10, habilitar a verificação real do adaptador OpenAI. Depois iniciar o Dia 4 conforme o plano.
