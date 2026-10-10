# CV-0 — Gate TDD determinístico

**Estado:** concluído localmente em 10/10/2026, sem integração externa.

## Objetivo

Tornar os gates locais reproduzíveis antes dos patches funcionais do ciclo
vertical, sem usar credenciais externas nem escrever no banco configurado.

## Evidência vermelha anterior à implementação

1. `npm run test:unit` aprovou contratos (13) e API (59), mas falhou no teste
   web “renders the protected professor shell and integration states”; o mesmo
   teste passou isoladamente, caracterizando espera insuficiente do lazy import.
2. `npm run test:integration` sem `DATABASE_URL` falhou durante a definição da
   suíte em `new URL(baseUrl!)`, embora o bloco estivesse declarado com
   `describe.skip`.
3. `npm run format:check` marcou 152 arquivos no checkout Windows; as mesmas
   amostras passaram com `--end-of-line auto`, confirmando divergência LF/CRLF.

## Alteração mínima

- usar uma URL PostgreSQL inerte apenas para construir a suíte que já estará
  marcada como ignorada quando `DATABASE_URL` estiver ausente;
- aumentar somente a espera do heading carregado por `React.lazy`, sem adicionar
  espera global nem ocultar falhas de requisição;
- executar Prettier com detecção do fim de linha existente;
- manter integração PostgreSQL e OpenAI fora deste gate para não usar o `.env`.

## Aceite

- `npm run format:check`, lint, tipagem, unidade e build passam de modo agregado;
- a suíte PostgreSQL pode ser coletada sem URL e fica ignorada, sem abrir
  conexão;
- nenhuma variável secreta tem valor exibido;
- nenhum endpoint Google/OpenAI é chamado;
- os 76 testes antes chamados genericamente de “unitários/componentes/contratos”
  recebem classificação explícita antes da meta de aproximadamente 200.

## Inventário dos 76 casos locais

Legenda: **U** = unidade/contrato contabilizável; **C** = componente em processo,
mantido separado da meta unitária. Os testes de integração e E2E aparecem ao
final e não entram nos 76.

### Contratos — 13 U

| ID    | Comportamento                                                  | Classe |
| ----- | -------------------------------------------------------------- | ------ |
| CT-01 | exige Google como provedor de identidade                       | U      |
| CT-02 | representa readiness do banco sem detalhe técnico              | U      |
| CT-03 | valida envelope de erro padrão                                 | U      |
| CT-04 | distingue sessão anônima e autenticada                         | U      |
| CT-05 | expõe status normalizado de integração                         | U      |
| CT-06 | rejeita e-mail controlado pelo Google em atualização de perfil | U      |
| CT-07 | representa fallback curricular sem inventar habilidade oficial | U      |
| CT-08 | exige código local e rejeita campos Google na turma local      | U      |
| CT-09 | valida atividades objetiva, discursiva e mista                 | U      |
| CT-10 | rejeita tipo incompatível e gabarito inválido                  | U      |
| CT-11 | valida resumo de coleta e nota de 0 a 10                       | U      |
| CT-12 | distingue feedback individual e aviso global                   | U      |
| CT-13 | valida períodos e limiar explícito do boletim                  | U      |

### API — 48 U

| ID     | Comportamento                                                         | Classe |
| ------ | --------------------------------------------------------------------- | ------ |
| API-01 | inclui somente contexto pedagógico persistido na atividade            | U      |
| API-02 | cria recursos externos uma vez e conclui publicação local             | U      |
| API-03 | solicita os escopos Google previstos                                  | U      |
| API-04 | cria, configura e publica um Form por HTTP simulado                   | U      |
| API-05 | reutiliza course work encontrado por marcador                         | U      |
| API-06 | executa uma tentativa e três retentativas no monitor                  | U      |
| API-07 | interrompe retentativas após sucesso                                  | U      |
| API-08 | cifra token sem texto puro e decifra o envelope                       | U      |
| API-09 | aplica hash determinístico ao token de sessão                         | U      |
| API-10 | inclui ementa, BNCC e materiais no prompt do plano                    | U      |
| API-11 | bloqueia geração de plano sem ementa                                  | U      |
| API-12 | agrupa habilidades e preserva metadados da fonte                      | U      |
| API-13 | retorna fallback revisável para habilidade ausente                    | U      |
| API-14 | libera localmente sem identificadores Classroom                       | U      |
| API-15 | carrega ambiente válido                                               | U      |
| API-16 | relata variáveis ausentes sem expor valores                           | U      |
| API-17 | rejeita porta inválida                                                | U      |
| API-18 | exige client ID e secret Google em conjunto                           | U      |
| API-19 | aceita Google ausente mantendo login desabilitado                     | U      |
| API-20 | aceita OpenAI ausente sem habilitar chamada externa                   | U      |
| API-21 | faz upsert de resposta externa repetida pela fronteira do repositório | U      |
| API-22 | bloqueia verificação OpenAI sem chave                                 | U      |
| API-23 | verifica chave OpenAI por HTTP simulado                               | U      |
| API-24 | suporta fixture explícita e normaliza falhas OpenAI                   | U      |
| API-25 | gera sugestão fixture de plano sem chamada externa                    | U      |
| API-26 | gera atividade mista fixture com quantidade pedida                    | U      |
| API-27 | valida Structured Outputs de plano                                    | U      |
| API-28 | valida Structured Outputs de atividade                                | U      |
| API-29 | sugere pontos discursivos sem decisão final                           | U      |
| API-30 | envia resposta vazia/ambígua para correção manual                     | U      |
| API-31 | valida retorno estruturado da correção discursiva                     | U      |
| API-32 | gera feedback fixture com forças e melhorias                          | U      |
| API-33 | valida Structured Outputs de feedback                                 | U      |
| API-34 | corrige pelo gabarito e normaliza pesos para 0–10                     | U      |
| API-35 | envia respostas vazias/questões ausentes para revisão manual          | U      |
| API-36 | mantém atividade mista parcial até a discursiva                       | U      |
| API-37 | pagina Forms e mapeia IDs externos a posições                         | U      |
| API-38 | atribui e devolve nota à submissão Classroom simulada                 | U      |
| API-39 | limita listagem de turmas ao professor autenticado                    | U      |
| API-40 | usa upsert em sincronização repetida de aluno                         | U      |
| API-41 | isola identidade de curso Google por professor                        | U      |
| API-42 | retorna perfil sem turmas                                             | U      |
| API-43 | atualiza somente campos editáveis do perfil                           | U      |
| API-44 | calcula média aritmética de notas normalizadas                        | U      |
| API-45 | arredonda média para duas casas                                       | U      |
| API-46 | bloqueia boletim sem nota                                             | U      |
| API-47 | gera bytes de PDF a partir do snapshot                                | U      |
| API-48 | preserva PDF e registra falha recuperável de envio                    | U      |

Os API-39 a API-41 verificam principalmente SQL emitido por um repositório com
dublê. Permanecem unidades contabilizadas, mas precisam de confirmação no gate
PostgreSQL de isolamento; não podem, sozinhos, provar segurança multi-tenant.

### Componentes HTTP/API — 11 C

| ID    | Comportamento                                               | Classe |
| ----- | ----------------------------------------------------------- | ------ |
| CP-01 | health live independe do banco                              | C      |
| CP-02 | readiness responde com banco disponível                     | C      |
| CP-03 | readiness distingue banco indisponível                      | C      |
| CP-04 | rejeita mutação com origem divergente                       | C      |
| CP-05 | mantém login de demonstração desabilitado por padrão        | C      |
| CP-06 | protege planos por sessão                                   | C      |
| CP-07 | protege atividades por sessão                               | C      |
| CP-08 | protege feedbacks por sessão                                | C      |
| CP-09 | protege boletins por sessão                                 | C      |
| CP-10 | informa indisponibilidade quando OAuth não está configurado | C      |
| CP-11 | rejeita `professorId` do corpo como identidade              | C      |

### Componentes web — 4 C

| ID    | Comportamento                                     | Classe |
| ----- | ------------------------------------------------- | ------ |
| CW-01 | mostra Google como login exclusivo                | C      |
| CW-02 | renderiza shell protegido e estados de integração | C      |
| CW-03 | faz logout sem enviar ID de professor             | C      |
| CW-04 | mostra erro recuperável da API                    | C      |

### Totais classificados

| Classe                          |  Total |
| ------------------------------- | -----: |
| Unidade/contrato contabilizável |     61 |
| Componente HTTP/API             |     11 |
| Componente web                  |      4 |
| **Total local inventariado**    | **76** |

### Fora da meta unitária

- PostgreSQL: 5 casos de integração (migração idempotente, seed idempotente,
  retenção, ciclo pedagógico misto e identidade por sessão);
- OpenAI: 1 smoke real opt-in;
- Playwright: 3 cenários, multiplicados historicamente por Chrome e Edge.

Este inventário não transforma quantidade em cobertura. Novos testes devem
nascer de riscos do módulo, e integração/E2E continuam contabilizados à parte.

## Resultado do gate

- `npm run check`: aprovado (formato, lint, tipagem, 76 testes locais e build);
- integração com `DATABASE_URL`, `OPENAI_API_KEY` e opt-in deliberadamente
  vazios: 5 testes PostgreSQL e 1 OpenAI corretamente ignorados, sem conexão;
- nenhuma chamada Google/OpenAI e nenhuma escrita em banco foram realizadas.
