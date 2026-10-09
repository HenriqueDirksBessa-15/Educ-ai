# Decisões e pendências

## Decisões técnicas do Dia 1

| ID    | Data       | Decisão                                                | Impacto                                                 |
| ----- | ---------- | ------------------------------------------------------ | ------------------------------------------------------- |
| DT-01 | 07/10/2026 | Usar npm workspaces, React/Vite, Fastify e PostgreSQL  | Fundação simples em uma base de código                  |
| DT-02 | 07/10/2026 | Usar migrações SQL com checksum                        | Esquema auditável e independente de ORM                 |
| DT-03 | 07/10/2026 | Separar liveness de readiness                          | Banco indisponível não é confundido com processo parado |
| DT-04 | 07/10/2026 | Fixtures com UUIDs fixos, `.invalid` e `is_fixture`    | Seed reproduzível e inequivocamente simulada            |
| DT-05 | 07/10/2026 | Manter IDs internos UUID e IDs Google opcionais/únicos | Integração futura sem tornar ID externo chave primária  |

## Decisões técnicas do Dia 2

| ID    | Data       | Decisão                                                       | Impacto                                                       |
| ----- | ---------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| DT-06 | 08/10/2026 | Usar sessão opaca persistida em vez de identidade no cliente  | Revogação central e `professorId` do cliente sem autoridade   |
| DT-07 | 08/10/2026 | Cifrar tokens Google com AES-256-GCM                          | Tokens protegidos em repouso com chave fora do banco/Git      |
| DT-08 | 08/10/2026 | OAuth com biblioteca oficial, `state` e PKCE S256             | Callback vinculado à tentativa iniciada pelo navegador        |
| DT-09 | 08/10/2026 | Monitor a cada cinco minutos, com no máximo quatro tentativas | Histórico explícito de OAuth, Classroom e Forms               |
| DT-10 | 08/10/2026 | Bucket privado em São Paulo somente para artefatos de teste   | Armazenamento futuro sem confundir bucket com execução Docker |

## Decisões técnicas do Dia 3

| ID    | Data       | Decisão                                                      | Impacto                                                                  |
| ----- | ---------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| DT-11 | 09/10/2026 | Não chamar OpenAI antes de 12/10; usar adaptador e fixture   | Substituída por DT-21 após autorização explícita do usuário              |
| DT-12 | 09/10/2026 | Registrar fonte, versão e checksum em cada carga curricular  | Histórico e repetição idempotente                                        |
| DT-13 | 09/10/2026 | Fallback curricular exige revisão explícita                  | Ausência de habilidade não inventa BNCC oficial                          |
| DT-14 | 09/10/2026 | Perfil resolve professor pela sessão                         | E-mail Google permanece bloqueado e `professorId` não autentica          |
| DT-15 | 09/10/2026 | Usar bncc-dados como estrutura derivada e MEC como validação | Proveniência preservada sem tratar dataset derivado como fonte normativa |

## Decisões técnicas do Dia 4

| ID    | Data       | Decisão                                                         | Impacto                                                          |
| ----- | ---------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| DT-16 | 10/10/2026 | Escopo de todas as consultas começa pelo professor da sessão    | Isolamento entre professores no backend                          |
| DT-17 | 10/10/2026 | E-mail é a chave de reconciliação local do aluno                | Sincronização repetida não duplica pessoas                       |
| DT-18 | 10/10/2026 | Turma Google usa código local separado do ID externo            | Código de acesso não é editado pelo Classroom                    |
| DT-19 | 10/10/2026 | Adapter Classroom de fixture antes da integração real           | Não apresentar sincronização externa simulada como concluída     |
| DT-20 | 10/10/2026 | Usar Cloud SQL `educai-bncc-validation` para validar PostgreSQL | Permite integração sem Docker local; cobrança por uso registrada |

## Decisões técnicas do Dia 7

| ID    | Data       | Decisão                                                     | Impacto                                                          |
| ----- | ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| DT-21 | 09/10/2026 | Liberar OpenAI real por chave explícita e smoke test opt-in | Sem chave usa fixture; teste faturável nunca roda acidentalmente |
| DT-22 | 09/10/2026 | Usar Responses API com Structured Outputs e validação Zod   | Sugestões respeitam contrato estrito antes de chegar ao domínio  |

## Decisões pós-auditoria do Dia 7

| ID    | Data       | Decisão                                                                | Impacto                                                                                 |
| ----- | ---------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| DT-23 | 09/10/2026 | Adotar o DERS completo de 96 páginas como autoridade funcional oficial | Encerra a incerteza documental e inclui os diagramas técnicos na referência do projeto  |
| DT-24 | 09/10/2026 | Restringir fixtures a desenvolvimento e teste, sempre identificadas    | Produção nunca apresenta sincronização ou geração simulada como integração disponível   |
| DT-25 | 09/10/2026 | Manter alunos sem acesso direto à aplicação web do EDUC.AI             | A interação do aluno ocorre exclusivamente pelo Google Classroom                        |
| DT-26 | 09/10/2026 | Arquivar logicamente marco vinculado após confirmação                  | O marco sai da linha do tempo ativa sem apagar o histórico de conteúdo publicado        |
| DT-27 | 09/10/2026 | Padronizar planilha de alunos com nome e e-mail                        | Registros entram pendentes até validação do professor; importações Google entram ativas |
| DT-28 | 09/10/2026 | Manter a quota de materiais configurável e sem limite fixo nesta etapa | Evita inventar restrição ausente no DERS e preserva configuração futura                 |

## Decisões técnicas do Dia 8

| ID    | Data       | Decisão                                                                            | Impacto                                                                        |
| ----- | ---------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| DT-29 | 09/10/2026 | Configurar atraso por atividade como bloqueado ou aceito com penalidade de 0–100%  | Torna a regra explícita e auditável sem impor política global ao professor     |
| DT-30 | 09/10/2026 | Bloquear estrutura no banco após publicar e sempre arquivar quando houver resposta | Evita divergência entre enunciado/gabarito aplicado e o histórico do estudante |

## Pendências do DERS

| ID   | Prazo do plano | Pendência                                                                    | Estado                                                                                     |
| ---- | -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D-01 | Dia 1          | Confirmar a cópia de 96 páginas como versão técnica oficial                  | Resolvida por DT-23: a cópia completa é a autoridade funcional oficial                     |
| D-02 | Dia 2          | Definir se o aluno possui interface própria ou permanece indireto via Google | Resolvida por DT-25: aluno interage exclusivamente pelo Google Classroom                   |
| D-03 | Dia 3          | Definir fonte e arquivo oficial da carga BNCC                                | Aberta; seed do Dia 1 é explicitamente não oficial                                         |
| D-04 | Dia 4          | Fornecer o modelo padrão da planilha de alunos                               | Resolvida por DT-27: colunas nome e e-mail; entrada pendente até validação                 |
| D-05 | Dia 5          | Resolver exclusão de marco vinculado                                         | Resolvida por DT-26: confirmação arquiva o marco e preserva o histórico publicado          |
| D-06 | Dia 5          | Fixar formatos e quota de materiais                                          | Resolvida por DT-28: formatos já aprovados; quota configurável sem limite fixo nesta etapa |
| D-07 | Dia 8          | Fixar opções de atraso e pesos                                               | Implementação adotada em DT-29; pesos são a pontuação explícita de cada questão            |
| D-08 | Dia 12         | Fixar janela de edição de feedback                                           | Aberta                                                                                     |
| D-09 | Dia 13         | Definir origem de presença, participação e responsáveis                      | Aberta                                                                                     |
| D-10 | Dia 13         | Definir meio de envio de e-mail compatível com o escopo                      | Aberta                                                                                     |
