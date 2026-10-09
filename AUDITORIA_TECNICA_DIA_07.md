# EducAI - Auditoria Técnica Completa - Dia 7 de 14

Data da auditoria: 09/10/2026

Escopo: estado do repositório no commit `f6df14b`, acrescido apenas da cópia local do DERS completo solicitada para referência.

Autoridade funcional: `Desenvolvimento_DERS_HenriqueBessa_ClaytonAraujo.pdf` (96 páginas).

## 1. Resumo executivo

O repositório possui uma fundação tecnicamente consistente: monorepositório tipado, autenticação Google bem delimitada no backend, migrações transacionais com checksum, carga BNCC canônica íntegra, contratos compartilhados, build reproduzível e 41 testes locais aprovados. O PostgreSQL configurado foi consultado somente para leitura e contém as migrações 001-013, 1.721 aprendizagens canônicas, 1.721 habilidades oficiais e 83 ementas sem as orfandades ou duplicações verificadas.

Entretanto, o estado atual não satisfaz o aceite acumulado dos Dias 1 a 7. A documentação registra RF006-RF010 como implementados, mas os principais fluxos de professor não estão acessíveis na interface. Turmas, alunos, perfil, currículo, marcos e materiais são, no máximo, listados ou expostos por API; não há as telas operacionais exigidas. A criação de plano pela interface preenche quase todos os campos com placeholders, não permite selecionar ementa, BNCC ou materiais, não atualiza a lista após salvar e não oferece aprovação final.

Foram identificados 18 problemas: **0 P0, 9 P1, 8 P2 e 1 P3**. Os P1 mais importantes são: risco de transferência de uma turma Google entre professores, alteração global de nome controlado pelo Google, exclusões de marcos/materiais incompatíveis com as FKs, escrita de agregados sem transação, monitoramento limitado a uma única credencial e ausência das interfaces previstas.

Indicador estrito de conformidade até o Dia 7: **0/10 RFs plenamente implementados e validados (0%)**. O denominador contém RF001-RF010, todos verificáveis por evidência estática e/ou execução local. O numerador exige cobertura integral dos fluxos do DERS previstos até o Dia 7, autorização, persistência e evidência de teste aplicável; nenhum RF atende simultaneamente a todos esses critérios. Isso não significa ausência de implementação: todos possuem partes relevantes, mas permanecem parciais, divergentes ou sem validação externa suficiente.

**Parecer:** o EducAI **não está tecnicamente apto a iniciar o Dia 8 conforme o DERS e o planejamento original**. Não há P0, mas há bloqueios P1 na base funcional e de integridade que precisam ser corrigidos e revalidados antes de construir atividades sobre ela.

## 2. Escopo analisado e limitações

### Escopo efetivamente analisado

- DERS completo de 96 páginas, incluindo RF001-RF014, fluxos alternativos, RNFs, protótipos e diagramas das páginas 81-89.
- `PLANO_IMPLEMENTACAO_14_DIAS.md`, arquitetura, decisões, progresso, matriz de rastreabilidade e cenários disponíveis.
- 33 arquivos TypeScript/TSX de produção, aproximadamente 5.332 linhas, excluindo dependências e artefatos gerados.
- 13 arquivos de teste, 45 casos declarados e aproximadamente 1.176 linhas.
- 13 migrações e 2 seeds, aproximadamente 1.303 linhas SQL.
- Configuração, Docker Compose, lockfile, histórico recente de commits e situação do Git.
- PostgreSQL configurado, exclusivamente em transação `READ ONLY`, para versão, migrações, contagens, integridade básica e regras de exclusão.
- Integridade visual e textual do DERS: 96 páginas renderizadas e inspecionadas em folhas de contato; SHA-256 da cópia e da origem: `d905efefff59719caaa67fb1523bb3357ad09153f8430570a7bde20b28606e24`.

### Limitações

- Não foi realizado login real no Google, sincronização real de Classroom/Forms nem smoke test faturável da OpenAI.
- O teste PostgreSQL existente não foi executado porque cria e remove um banco. A auditoria proíbe criar/apagar bancos sem autorização específica. Consultas somente leitura substituíram essa validação.
- Não houve E2E em navegador autenticado. O frontend foi validado por leitura, build e testes Testing Library.
- Cobertura não foi medida: não há provedor `@vitest/coverage-v8` ou `@vitest/coverage-istanbul` instalado.
- A configuração de backup do Cloud SQL não pôde ser consultada pelo CLI porque `gcloud` não está disponível. A documentação afirma que backups estão habilitados, mas essa afirmação não foi revalidada externamente.
- Nenhum segredo foi impresso. Apenas nomes de variáveis foram inventariados.
- Nenhuma correção, migração, seed, deploy ou commit foi executado.

## 3. Estado geral do projeto no dia 7

| Dimensão                 | Estado encontrado                                                                     | Parecer                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Fundação e contratos     | Workspace, TypeScript, Zod, lint, build e contratos funcionam                         | Sólida, com formatação pendente                                                   |
| Autenticação             | OAuth/PKCE, sessão opaca, token cifrado e logout/revogação implementados              | Boa implementação estática; E2E real não verificado                               |
| Google                   | Monitor e gateway existem; Classroom de domínio é apenas fixture e não importa alunos | Parcial                                                                           |
| OpenAI                   | Responses API com JSON Schema e fixture local                                         | Implementação relevante, mas comportamento sem chave diverge do bloqueio previsto |
| BNCC                     | Importador canônico, projeção legada e consulta                                       | Melhor área do projeto; carga real confirmada somente por leitura                 |
| Perfil/turmas/alunos     | APIs e tabelas existem                                                                | Fluxos e interface incompletos; riscos multiusuário                               |
| Linha do tempo/materiais | Tabelas e endpoints parciais                                                          | Exclusões quebradas, upload/edição ausentes e UI somente leitura                  |
| Planos                   | Backend amplo e geração/revisão por IA                                                | UI manual incompleta, relações retornadas vazias e aprovação ausente na tela      |
| Testes                   | 41 testes locais aprovados                                                            | Cobertura estreita; integração/E2E insuficientes                                  |
| Documentação             | Vários documentos e commits por etapa                                                 | Desatualizada e contraditória em pontos materiais                                 |

O repositório está mais avançado no backend e na modelagem de dados do que na experiência executável. A diferença entre "endpoint/tabela existente" e "fluxo do DERS concluído" não foi preservada na matriz de rastreabilidade atual.

## 4. Matriz de rastreabilidade DERS x implementação x testes

Critério de status:

- **Implementado e validado:** fluxo básico e alternativos aplicáveis concluídos, com evidência executada.
- **Parcial:** existe parte funcional, mas falta fluxo, interface, integração ou persistência obrigatória.
- **Com divergências:** comportamento implementado contradiz requisito ou contrato.
- **Não aplicável à etapa:** previsto para os Dias 8-14 e não contado como atraso.
- **Não verificável:** dependência externa impediu confirmar o comportamento real.

| RF    | Descrição DERS                                                       | Previsão                | Evidência de implementação                                   | Testes/evidência                                            | Status                                                                                                                                               |
| ----- | -------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF001 | Integração Google, monitoramento, Classroom/Forms/OAuth e degradação | Dia 2 e extensões Dia 9 | `auth/monitor.ts`, `google-gateway.ts`, `integration_status` | 2 testes do monitor; integração real não executada          | **Parcial e com divergências**: monitora só a credencial mais recente; Classroom é fixture; recursos dependentes não são bloqueados consistentemente |
| RF002 | Integração e disponibilidade OpenAI                                  | Dia 3 e Dia 7           | `openai/adapter.ts`, monitor, geração de plano               | 5 testes do adaptador; smoke real não executado             | **Implementado com divergências**: adapter real existe, mas sem chave o produto oferece geração fixture em vez de desativar o recurso                |
| RF003 | Ementa/BNCC, carga, histórico e fallback                             | Dia 3                   | importador, modelo canônico, projeção, `/api/curriculum`     | Dry-run 1.721; banco real com 1.721/83; 2 testes mockados   | **Parcial**: carga/consulta estão fortes, mas a associação automática por ano/disciplina não existe e IDs BNCC de planos não são validados           |
| RF004 | Autenticação exclusiva Google e cadastro automático                  | Dia 2                   | OAuth, PKCE, sessão, cookie, cifra e callback                | testes de rota/mocks; teste de integração não executado     | **Não verificável por falta de E2E real**, embora a implementação estática esteja substancialmente presente                                          |
| RF005 | Perfil, campos editáveis/bloqueados e turmas                         | Dia 3                   | `GET/PATCH /api/profile`                                     | 2 testes mockados                                           | **Parcial**: não existe tela de perfil, estado de falha de importação ou fluxo de edição no frontend                                                 |
| RF006 | Criar/importar/gerenciar turmas                                      | Dia 4                   | CRUD parcial e `/api/classes/sync`                           | 2 testes mockados de repositório                            | **Parcial e com divergências**: sem interface, adapter real ou importação efetiva; conflito pode transferir propriedade entre professores            |
| RF007 | Alunos por Classroom, planilha e código; filtros/restrição           | Dia 4                   | matrícula individual e estados no banco                      | upsert mockado; nenhuma integração                          | **Parcial**: não há roster Classroom, upload de planilha, entrada por código, orientação de remoção ou UI; nome Google pode ser sobrescrito          |
| RF008 | Linha do tempo, CRUD, bloqueio temporal e vínculo                    | Dia 5                   | endpoints de listar/criar/editar/excluir                     | sem teste específico                                        | **Implementado com divergências**: UI apenas lista; exclusão confirmada de marco vinculado falha pela FK `RESTRICT`; campos diferem do DERS          |
| RF009 | Plano manual/IA, vínculos, revisão, aprovação e histórico            | Dias 6-7                | endpoints, versões, adapter IA e comparação                  | 7 testes de prompt/adapter; sem testes do repositório/rotas | **Parcial e com divergências**: backend relevante, mas UI cria placeholders, não edita vínculos, não atualiza lista e não oferece aprovação          |
| RF010 | Upload, edição, visualização e gestão de materiais                   | Dia 5                   | metadados e endpoints de criar/listar/arquivar/excluir       | sem teste específico                                        | **Parcial e com divergências**: sem upload/storage adapter/edição/visualização; exclusão de qualquer material com turma falha pela FK                |
| RF011 | Atividades                                                           | Dias 8-9                | Apenas tabela-reserva de vínculo publicado                   | não aplicável                                               | **Não aplicável à etapa atual**                                                                                                                      |
| RF012 | Correção automática e revisão                                        | Dias 10-11              | Não implementado                                             | não aplicável                                               | **Não aplicável à etapa atual**                                                                                                                      |
| RF013 | Feedback e avisos                                                    | Dia 12                  | Não implementado                                             | não aplicável                                               | **Não aplicável à etapa atual**                                                                                                                      |
| RF014 | Boletim e envio                                                      | Dia 13                  | Não implementado                                             | não aplicável                                               | **Não aplicável à etapa atual**                                                                                                                      |

### Indicador de conformidade até o Dia 7

- Denominador: RF001-RF010 = 10 requisitos previstos e efetivamente verificáveis por código, execução local ou evidência somente leitura.
- Numerador: requisitos com todos os fluxos previstos até o Dia 7 implementados e validados = 0.
- **Conformidade estrita: 0/10 = 0%.**

Não foi criado indicador de "qualidade geral", "segurança" ou "conclusão do projeto".

## 5. Auditoria do frontend

### Pontos positivos

- Login Google exclusivo e mensagens recuperáveis de sessão.
- Cookie não é manipulado pelo JavaScript.
- Componentes possuem alguns rótulos, `aria-live`, `role="alert"`, foco visível em botões e breakpoint móvel.
- Comparação em duas colunas da sugestão de plano, com campos editáveis antes da revisão.
- Build Vite de produção aprovado.

### Lacunas funcionais

- `App.tsx` concentra toda a aplicação em um único arquivo e não possui navegação por rotas.
- Não há tela de perfil/currículo, criação e edição de turmas, gestão de alunos, criação/edição de marcos ou materiais.
- A área de linha do tempo e materiais é somente leitura (`App.tsx:263-325`).
- O formulário manual de plano pede apenas o título e envia valores "A definir"/"a detalhar" para campos obrigatórios (`App.tsx:347-368`). Isso satisfaz o schema, mas não o fluxo de preenchimento docente do DERS.
- O frontend não permite escolher turma, ementa, BNCC ou material. Usa sempre `classes[0]` e arrays vazios.
- Após criação ou revisão, a lista e o plano selecionado não são recarregados; a interface permanece desatualizada.
- Não há ação de aprovar o plano, embora o backend exija estado `reviewed` antes de `approved`.
- Falhas ao carregar marcos, materiais, turmas e planos são convertidas silenciosamente em listas vazias (`App.tsx:203-214`), confundindo erro com ausência de dados.
- Os testes web cobrem login, shell, logout e erro de sessão, mas não exercitam nenhum fluxo pedagógico.

### Acessibilidade e responsividade

Há base visual consistente e layout móvel abaixo de 640 px. Não houve validação em Chrome/Firefox/Edge, navegação completa por teclado, contraste automatizado ou tablet; essas validações estão previstas para o Dia 14 e não são consideradas atraso agora. Links não possuem estilo de foco explícito, e mensagens genéricas não associam erros aos campos.

## 6. Auditoria do backend

### Pontos positivos

- Identidade é resolvida pela sessão; `professorId` enviado pelo cliente não concede autoridade.
- Entradas principais usam Zod e queries parametrizadas.
- Tokens Google usam AES-256-GCM; tokens de sessão são opacos e persistidos apenas como hash.
- OAuth usa `state` descartável e PKCE S256.
- Consultas de domínio normalmente aplicam `professor_id`.
- Respostas de prontidão não expõem o erro PostgreSQL.
- Geração OpenAI usa Structured Outputs, timeout e validação Zod.

### Defeitos e riscos

- O adapter Classroom registrado fora de testes é uma fixture vazia (`app.ts:90-91`), inclusive em produção.
- O escopo OAuth não inclui roster de alunos nem permissões futuras de criação/coleta do Forms; RF007 não pode operar de forma real com os escopos atuais.
- `syncGoogleCourses` usa unicidade global de `google_classroom_id` e atualiza `professor_id` no conflito (`classes/repository.ts:185-192`). Uma turma compartilhada por dois professores pode mudar de proprietário.
- Matrícula manual sempre atualiza `student.name`, mesmo se a origem existente for Google (`classes/repository.ts:152-157`), alterando o nome para todos os professores que compartilham o mesmo aluno global.
- O monitor seleciona apenas `getLatestCredential()` e publica o status global mais recente. Em ambiente multiusuário, a maioria das credenciais não é verificada e usuários podem ver um status de outra conta.
- Retentativas Google ocorrem em 250/500/750 ms para qualquer erro, enquanto o DERS distingue credencial ausente, expirada e ciclo de cinco minutos.
- Recursos dependentes não consultam `integration_status` antes de operar. A geração fixture e o sync fixture permanecem disponíveis quando a integração está inativa.
- Operações compostas de material, plano, links, revisões e matrícula não usam uma transação comum. Falha intermediária pode deixar registros órfãos funcionais ou apagar vínculos já existentes.
- Versões de revisão/geração usam `MAX(version)+1` sem lock; chamadas concorrentes podem colidir.
- Objetivos BNCC recebidos no plano não são validados em `assertReferences`.
- Respostas de plano e material retornam `classIds`, `bnccSkillIds` e `materialIds` como arrays vazios, mesmo quando existem vínculos.
- O PATCH de turma aceita `localAccessCode` no contrato, mas o repositório ignora o campo. `description: null` e `generalNotice: null` não limpam valores por causa de `COALESCE`.

## 7. Auditoria do PostgreSQL e BNCC

### Evidência somente leitura do banco configurado

| Verificação                               | Resultado |
| ----------------------------------------- | --------- |
| PostgreSQL                                | 16.15     |
| Migrações registradas                     | 001-013   |
| Aprendizagens canônicas                   | 1.721     |
| Habilidades oficiais na projeção          | 1.721     |
| Ementas não fixture                       | 83        |
| Cargas reais                              | 1         |
| Aprendizagem sem documento                | 0         |
| Habilidade sem ementa                     | 0         |
| Matrícula sem turma/aluno                 | 0         |
| Código legado BNCC duplicado              | 0         |
| Chave canônica documento+código duplicada | 0         |
| Cargas com falha registradas              | 0         |

### Pontos positivos

- Migrações são ordenadas, transacionais e protegidas por checksum.
- IDs, FKs, checks e índices cobrem boa parte das consultas atuais.
- A carga BNCC valida schemas e contagens antes de gravar e executa tudo em uma transação.
- A fonte, versão, commit e checksum são preservados.
- Seeds usam IDs/e-mails inequívocos e são separadas de migrações.
- O dry-run confirmou 93 EI, 1.304 EF, 183 EM, 11 Computação/EI, 104 Computação/EF e 26 Computação/EM.

### Problemas

- `published_milestone_link` referencia marco com `ON DELETE RESTRICT`; a confirmação no código não remove o vínculo antes do `DELETE`.
- Todo material precisa de ao menos uma turma no contrato, criando `material_class`; essa FK também usa `ON DELETE RESTRICT`, e `deleteMaterial` não remove o vínculo. Portanto, a exclusão normal falha.
- `curriculum_change` registra todos os registros projetados como `update`, inclusive na primeira inserção, reduzindo a precisão do histórico.
- Não há transação de aplicação para operações de agregados fora do importador/migrador.
- O teste de banco espera exatamente migrações 001-009, embora 010-013 existam; quando houver permissão para criar banco, a asserção falhará.
- O processo de backup/restauração não foi verificado nesta auditoria.

## 8. Auditoria de segurança e configurações

### Controles presentes

- `.env` está ignorado e não é rastreado; `.env.example` não contém credenciais reais.
- Nenhum segredo conhecido foi encontrado em arquivos versionados; a string `user:secret` é fixture de teste local.
- CORS usa uma origem configurada e credenciais explícitas.
- Cookie é HTTP-only, `SameSite=Lax` e `Secure` em produção.
- Tokens Google são cifrados; sessões armazenam SHA-256 do token opaco.
- Erros públicos de banco e integração são normalizados.
- Queries são parametrizadas nas entradas analisadas.

### Riscos

- As falhas multiusuário D7-003 e D7-004 são violações relevantes de isolamento e integridade.
- Não há rate limiting, proteção CSRF explícita, política CSP, cabeçalhos de segurança, política de retenção/LGPD ou trilha geral de auditoria. O plano agenda esses controles para o Dia 14; são riscos, não atrasos do Dia 7.
- O monitor dentro de cada processo API não tem eleição/lock distribuído. Escalar horizontalmente duplica ciclos e registros.
- `npm audit --omit=dev` reportou uma vulnerabilidade moderada em `ajv` 8.17.1 (GHSA-2g4f-4pwh-qvx6). O vetor requer `$data`; o importador não habilita essa opção e usa schemas versionados locais, portanto não foi demonstrada exploração, mas a dependência deve ser atualizada de forma controlada.
- HTTPS é responsabilidade da implantação e não foi verificado.

## 9. Resultados dos testes

### Inventário correto por categoria

| Categoria                                                   | Casos existentes | Executados | Aprovados | Falhos | Ignorados/não executados |
| ----------------------------------------------------------- | ---------------: | ---------: | --------: | -----: | -----------------------: |
| Unitários puros (contratos e funções/repositórios mockados) |               31 |         31 |        31 |      0 |                        0 |
| Componente/contrato HTTP Fastify                            |                6 |          6 |         6 |      0 |                        0 |
| Componente React/jsdom                                      |                4 |          4 |         4 |      0 |                        0 |
| Integração PostgreSQL                                       |                3 |          0 |         0 |      0 |         3 não executados |
| Integração externa OpenAI                                   |                1 |          0 |         0 |      0 |          1 não executado |
| End-to-end em navegador                                     |                0 |          0 |         0 |      0 |                        0 |
| **Total**                                                   |           **45** |     **41** |    **41** |  **0** |     **4 não executados** |

O script chamado `test:unit` executa também 6 testes de contrato HTTP e 4 testes de componente React; eles não foram contabilizados como unitários nesta auditoria.

### Verificações executadas

| Comando/verificação              | Resultado                                                                |
| -------------------------------- | ------------------------------------------------------------------------ |
| `npm run format:check`           | **Falhou**: `apps/api/src/db/import-bncc-cli.ts` fora do padrão Prettier |
| `npm run lint`                   | Aprovado                                                                 |
| `npm run typecheck`              | Aprovado nos 3 workspaces                                                |
| `npm run test:unit`              | 41/41 aprovados                                                          |
| `npm run build`                  | Aprovado; bundle web 235,53 kB (73,19 kB gzip)                           |
| `db:import-bncc -- --dry-run`    | Aprovado; 1.721 itens e checksum esperado                                |
| Consultas PostgreSQL `READ ONLY` | Aprovadas; migrações/contagens/integridade acima                         |
| `npm audit --omit=dev`           | 1 vulnerabilidade moderada (`ajv`)                                       |
| Cobertura                        | Não medida; provedor não instalado                                       |

### Lacunas de teste

- Nenhum teste específico para `TimelineRepository`, `PlansRepository`, rotas de perfil/currículo/turmas/timeline/planos ou autorização cruzada de todos os recursos.
- Nenhum teste reproduz exclusão vinculada, concorrência de versões ou rollback de escrita composta.
- O teste de turma verifica presença de `WHERE professor_id`, mas não simula dois professores e dados reais.
- Testes web não exercitam dados pedagógicos; mocks insuficientes viram erro silenciosamente capturado.
- Não há teste E2E dos nove fluxos definidos no plano.
- O smoke OpenAI é opt-in e não foi executado; nenhuma chamada faturável foi feita.

## 10. Problemas encontrados, organizados por severidade

### Contagem

| Severidade      | Quantidade |
| --------------- | ---------: |
| P0 - Bloqueante |          0 |
| P1 - Alto       |          9 |
| P2 - Médio      |          8 |
| P3 - Baixo      |          1 |

### Ocorrências

| ID     | Sev. | RF                  | Arquivo/linha                                                                                             | Evidência e causa provável                                                                                 | Impacto                                                                    | Correção recomendada                                                                                                      | Complex. |
| ------ | ---- | ------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| D7-001 | P1   | RF005-RF010         | `apps/web/src/App.tsx:177-577`                                                                            | Shell único oferece listagens e formulário de título; faltam telas/ações previstas                         | Fluxos dos Dias 3-7 não são utilizáveis pelo professor                     | Implementar por módulo os formulários, estados e navegação já previstos, sem ampliar escopo                               | Alta     |
| D7-002 | P1   | RF001/RF006/RF007   | `apps/api/src/app.ts:90`, `classroom/adapter.ts:13`, `auth/google-gateway.ts:10`                          | Produção recebe fixture vazia; escopos não cobrem roster; não existe sync de alunos                        | Importação Classroom/alunos não funciona e pode parecer concluída          | Adapter real, escopos mínimos corretos, erro explícito quando indisponível e testes de conta de teste                     | Alta     |
| D7-003 | P1   | RF006/RNF segurança | `apps/api/src/classes/repository.ts:185`                                                                  | `ON CONFLICT (google_classroom_id)` atualiza `professor_id`                                                | Curso compartilhado pode migrar entre professores e expor matrículas       | Tornar chave externa composta por professor, nunca reatribuir proprietário no upsert e testar co-docência                 | Média    |
| D7-004 | P1   | RF007/RNF segurança | `apps/api/src/classes/repository.ts:152-157`                                                              | Upsert sempre substitui `student.name`; só preserva `origin` Google                                        | Professor manual pode alterar dado Google global visto em outras turmas    | Preservar todos os campos controlados pelo Google ou modelar dados por vínculo/tenant                                     | Média    |
| D7-005 | P1   | RF008               | `timeline/repository.ts:104-124`; `007_timeline_materials.sql:50`                                         | Confirmação não remove `published_milestone_link`; FK é `RESTRICT`                                         | Fluxo alternativo de exclusão confirmada retorna erro 500 do banco         | Implementar decisão aprovada de forma transacional ou arquivar, com teste PostgreSQL                                      | Baixa    |
| D7-006 | P1   | RF010               | `timeline/routes.ts:123-177`; `timeline/repository.ts:149-221`; `007_timeline_materials.sql:36`           | Não há upload/edit/preview/adaptador; FK `material_class` impede delete de todo material criado            | RF010 não entrega o fluxo básico e exclusão falha                          | Implementar storage autorizado, validações e edição; remover vínculos de forma transacional quando exclusão for permitida | Alta     |
| D7-007 | P1   | RF007-RF010         | `plans/repository.ts:68-155,374-436`; `timeline/repository.ts:149-188`; `classes/repository.ts:141-168`   | Escritas multiquery não usam transação; versões usam `MAX+1` sem lock                                      | Falha/concorrência gera plano/material parcial, perda de links ou conflito | Expor `PoolClient`/unit of work, transacionar agregados e alocar versão com lock/sequence                                 | Alta     |
| D7-008 | P1   | RF001/RF002         | `auth/monitor.ts:43-51`; `auth/repository.ts:152-167,250-272`                                             | Apenas a credencial mais recente é sondada; status público é global e scheduler vive em cada API           | Monitor incorreto em multiusuário e duplicado em escala horizontal         | Iterar contas com escopo correto ou separar estado global/por professor; worker com lock                                  | Alta     |
| D7-009 | P1   | RF009/RF010         | `plans/repository.ts:489-534`; `timeline/repository.ts:238-255`                                           | DTOs retornam IDs de relações sempre vazios                                                                | Cliente não consegue visualizar/editar fielmente vínculos persistidos      | Agregar/consultar IDs reais e adicionar testes de round-trip                                                              | Média    |
| D7-010 | P2   | RF001/RF002/RF009   | `app.ts:102-106`; `openai/adapter.ts:144-169`                                                             | Sem chave, geração fixture fica disponível embora DERS determine desativar dependências                    | Usuário pode confundir simulação com IA operacional                        | Decisão humana: limitar fixture a teste/dev ou aprovar explicitamente essa divergência e sinalizá-la                      | Baixa    |
| D7-011 | P2   | RF001/RF002         | `auth/monitor.ts:59-93,99-135`                                                                            | Retentativas imediatas para todos os erros, sem política por causa                                         | Diverge dos fluxos de 5 min/credencial expirada e amplia chamadas          | Modelar política por erro e testar relógio/backoff                                                                        | Média    |
| D7-012 | P2   | RF006               | `contracts/src/index.ts:130-142`; `classes/repository.ts:106-129`                                         | Contrato aceita `localAccessCode`, repositório ignora; `COALESCE` impede limpar nulos                      | API responde sucesso sem aplicar intenção do usuário                       | Alinhar contrato e SQL; distinguir `undefined` de `null`                                                                  | Baixa    |
| D7-013 | P2   | RF003/RF009         | `plans/repository.ts:347-371`; `App.tsx:357-368`                                                          | BNCC não é validada/associada automaticamente; UI envia arrays vazios                                      | Plano pode ficar desalinhado da base curricular ou falhar tarde por FK     | Validar habilidades e compatibilidade com ementa/ano/componente antes da transação                                        | Média    |
| D7-014 | P2   | Testes              | `tests/integration/database.integration.test.ts:53-64`                                                    | Teste espera 001-009, repositório/banco têm 001-013; não foi atualizado                                    | Próxima execução com `CREATEDB` falhará mesmo com migrações corretas       | Atualizar expectativa e adicionar cenários dos módulos 5-7                                                                | Baixa    |
| D7-015 | P2   | Governança          | `README.md:3`; `docs/arquitetura.md:3`; `docs/progresso.md:23,110`; `docs/matriz-rastreabilidade.md:3-15` | Documentos dizem simultaneamente Dias 1-3, Dia 7, carga pendente e carga concluída; matriz sobreclassifica | Decisões e aceite ficam baseados em evidência incorreta                    | Após correções, reconciliar documentos com uma única fotografia verificável                                               | Média    |
| D7-016 | P2   | RNF segurança       | `apps/api/package.json` / lockfile                                                                        | `npm audit` reporta GHSA-2g4f-4pwh-qvx6 em `ajv` 8.17.1                                                    | Risco moderado de ReDoS com `$data`; exploração atual não demonstrada      | Atualizar para release corrigida compatível e repetir schema/dry-run                                                      | Baixa    |
| D7-017 | P2   | Qualidade           | suíte inteira                                                                                             | Sem cobertura, E2E, testes de timeline/planos, rollback, concorrência e isolamento completo                | Defeitos centrais passaram com 41 testes verdes                            | Criar testes somente após autorização da fase corretiva, priorizando cada P1                                              | Alta     |
| D7-018 | P3   | Qualidade           | `apps/api/src/db/import-bncc-cli.ts`                                                                      | Prettier aponta divergência; `npm run check` encerra antes das demais etapas                               | Gate agregado fica vermelho                                                | Formatar o arquivo após autorização e repetir `npm run check`                                                             | Baixa    |

Todos os P1/P2 acima são evidências estáticas confirmadas ou resultados reproduzidos por comandos seguros. D7-003 depende do cenário de curso compartilhado para manifestação, mas a reatribuição está explicitamente codificada; não foi tratado como vazamento já ocorrido. A vulnerabilidade D7-016 foi confirmada pelo advisory, mas sua explorabilidade atual permanece não demonstrada.

## 11. Divergências em relação à arquitetura

| Arquitetura/plano                              | Implementação atual                                       | Efeito                                                                |
| ---------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| React Router, TanStack Query e React Hook Form | Um `App.tsx` com `useState`, `useEffect` e `fetch` direto | Sem navegação modular, cache/invalidação ou formulários completos     |
| Worker da mesma base para jobs                 | `setInterval` dentro de cada instância API                | Duplicação em escala e ausência de coordenação distribuída            |
| Adapter real Google                            | Gateway OAuth real + Classroom fixture                    | RF006/RF007 incompletos                                               |
| Adapter local/GCS de arquivos                  | Cliente envia URL ou `storageKey` como texto              | Sem upload, autorização de arquivo ou armazenamento controlado        |
| SDK oficial OpenAI                             | `fetch` direto para Responses API                         | Não é defeito funcional por si só, mas diverge da escolha documentada |
| Transações explícitas no backend               | Apenas migrações/importador/seeds usam transação          | Agregados de domínio podem ficar parciais                             |
| Playwright e E2E                               | Nenhuma dependência ou teste E2E                          | Aceites completos não são demonstrados                                |
| Falha externa vira estado funcional claro      | Várias cargas viram lista vazia ou fixture                | Erro é confundido com ausência/sucesso simulado                       |

## 12. Funcionalidades existentes fora do DERS

Não foi encontrada nova funcionalidade de produto claramente fora do DERS. Endpoints de saúde, importador BNCC, fixtures e infraestrutura de teste são suportes técnicos compatíveis com o plano.

Há, porém, dois comportamentos visíveis não descritos como produto final:

1. sincronização Classroom fixture exposta em qualquer ambiente não `test`;
2. geração de plano por fixture quando a OpenAI não está configurada.

Esses comportamentos devem ficar restritos a desenvolvimento/teste ou ser aprovados formalmente. Nenhum novo requisito é proposto nesta auditoria; o limite de no máximo um novo requisito permanece intacto.

## 13. Comparação do planejamento com a execução

| Dia | Entregas concluídas                                    | Parciais/pendentes                                                               | Antecipações                                                     |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Workspace, config, health, esquema base, seed, scripts | Tela de estado API/banco ausente; teste de banco vazio não reexecutado           | Nenhuma problemática                                             |
| 2   | OAuth/PKCE/sessão/cifra e monitor base                 | Conta real/E2E, degradação funcional e monitor multiusuário                      | Nenhuma                                                          |
| 3   | Adapter OpenAI, BNCC, consulta e perfil backend        | Perfil frontend, associação automática e validação real OpenAI                   | Carga BNCC canônica mais completa que o mínimo                   |
| 4   | Modelo e APIs locais de turma/matrícula                | Classroom real, roster, planilha, código, filtros, remoção e UI                  | Nenhuma                                                          |
| 5   | Modelo/endpoints parciais de marco/material            | Upload/storage/edit/preview/UI; exclusões quebradas                              | Tabelas-reserva de conteúdo publicado                            |
| 6   | Backend de planos, vínculos, revisão e arquivo         | Interface manual completa, round-trip de IDs e transações                        | Histórico de revisão estruturado                                 |
| 7   | Prompt, Responses API, validação, comparação e revisão | Aprovação na UI, atualização de estado, testes de repositório/rotas e smoke real | OpenAI real habilitável antes da data original por decisão DT-21 |

Atividades RF011-RF014 não são atraso; pertencem aos Dias 8-13. O problema é que a base aceita como concluídas etapas anteriores cujos fluxos obrigatórios permanecem incompletos.

## 14. Riscos para os dias 8 a 14

1. **Atividades construídas sobre planos incompletos:** a UI não produz plano com relações curriculares/materiais confiáveis.
2. **Integridade transacional:** atividades aumentarão o número de agregados e tornarão os padrões multiquery atuais mais perigosos.
3. **Isolamento multiusuário:** reatribuição de turma e alteração global de aluno podem contaminar submissões/notas futuras.
4. **Integração Google insuficiente:** escopos/adapters atuais não sustentam roster, Forms, publicação e coleta dos Dias 9-10.
5. **Material sem armazenamento controlado:** atividades não podem consumir anexos com autorização e integridade.
6. **Monitor não escalável:** mais integrações e jobs amplificam duplicidade e status incorreto.
7. **Testes não acompanham migrações:** regressões de banco e fluxos críticos só aparecerão tardiamente.
8. **Documentação divergente:** a equipe pode planejar o Dia 8 sobre premissas já refutadas.

## 15. Recomendações priorizadas

1. Corrigir D7-003 e D7-004 e adicionar testes de isolamento com dois professores antes de qualquer dado de atividade.
2. Tornar todas as escritas compostas transacionais e corrigir exclusões de marco/material.
3. Completar o fluxo manual de plano e o round-trip de vínculos; somente então liberar RF011.
4. Implementar adapter Classroom real, roster e escopos mínimos aprovados, sem apresentar fixture como sincronização.
5. Completar upload/storage/edição/visualização de materiais com autorização backend.
6. Redesenhar o monitor para múltiplos professores e execução coordenada.
7. Atualizar testes PostgreSQL, cobrir repositories/routes dos Dias 4-7 e adicionar E2E mínimo do professor.
8. Resolver o comportamento de fixture OpenAI e aplicar bloqueio coerente por disponibilidade.
9. Atualizar `ajv` de forma isolada e repetir dry-run BNCC.
10. Reconciliar README, arquitetura, progresso e matriz somente após a evidência corrigida.
11. Formatar o importador e repetir o gate completo.

## 16. Pendências que exigem decisão humana

1. Confirmar formalmente se o DERS de 96 páginas agora versionado é a autoridade oficial (D-01).
2. Definir se haverá interface própria de aluno ou se todo acesso permanecerá indireto via Google (D-02, vencida no Dia 2).
3. Fornecer/aprovar o modelo padrão de planilha de alunos (D-04, vencida no Dia 4).
4. Decidir se fixtures de Classroom/OpenAI podem aparecer para usuário em desenvolvimento ou devem ficar exclusivamente em teste.
5. Confirmar a decisão já documentada de exclusão de marco vinculado por confirmação, para que a FK e a transação sejam ajustadas sem ambiguidade.
6. Fixar ou confirmar que a quota de materiais continuará configurável e sem valor até decisão posterior.
7. Autorizar uma etapa corretiva antes do Dia 8 e definir se ela mantém o cronograma original ou exige proposta separada. O cronograma não foi alterado nesta auditoria.

## 17. Conclusão e parecer técnico

O EducAI tem bons fundamentos de segurança de autenticação, tipagem, build e modelagem curricular. A carga BNCC está íntegra e o backend de planos demonstra uma direção tecnicamente válida. Isso reduz o risco de recomeço estrutural.

Contudo, a metade inicial do cronograma não está concluída segundo o próprio critério diário do plano: faltam interfaces obrigatórias, integração Google real, transações e testes proporcionais; há falhas confirmadas de exclusão e riscos relevantes de isolamento. Os 41 testes verdes não cobrem essas áreas e o gate agregado está vermelho por formatação.

### Parecer obrigatório

**O EducAI está tecnicamente apto a iniciar o Dia 8, conforme o DERS e o planejamento original?**

**Não, existem bloqueios.**

Justificativa: existem 9 problemas P1, incluindo base funcional inacessível pela interface, integridade de exclusões/escritas, monitoramento multiusuário incorreto e riscos de propriedade entre professores. Iniciar RF011 agora aumentaria o acoplamento a uma base que ainda não cumpre os aceites dos Dias 4-7. Recomenda-se uma etapa corretiva explicitamente aprovada, seguida de reexecução de testes PostgreSQL/E2E e atualização documental. Nenhuma correção deve ser iniciada sem autorização.
