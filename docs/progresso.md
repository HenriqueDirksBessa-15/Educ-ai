# Progresso

Atualizado em 20/10/2026.

## Deploy de produção GCP

Publicado no projeto `educai-511017`, região `southamerica-east1`, a partir do
commit `8a80ddb`. A revisão técnica `educai-8a80ddb` serve SPA e API, conecta ao
banco `educai` existente e usa GCS para materiais. Antes da migração foi criado
o backup `1792458906805`; a migração `026_notification_delivery.sql` foi
aplicada e as contagens de dados foram preservadas.

Cloud Run permanece com mínimo zero e máximo um. Workers foram externalizados
para um job agendado a cada cinco minutos, e a retenção técnica roda diariamente
às 04:15. Smokes de frontend, rota interna, API, PostgreSQL, OAuth start,
Classroom, Forms, OpenAI estruturada e GCS foram aprovados sem enviar mensagens
nem alterar turmas. Logs não contêm code/state OAuth, cookies ou Authorization.

O balanceador global usa `136.81.217.99`, certificado gerenciado e redirect
HTTP para HTTPS. A ativação de `https://educai.dev.br` ainda depende do registro
A no Registro.br e da configuração do callback no cliente OAuth Web. Inventário,
procedimentos, validações e rollback estão em
[`gcp-production.md`](./gcp-production.md).

## Preparação de produção GCP

Concluída a etapa de hardening necessária para publicar o mesmo contêiner no
Cloud Run sem depender do disco efêmero nem de uma instância mínima:

- runtime atualizado para Node.js 22 LTS e porta compatível com `PORT` do
  Cloud Run;
- armazenamento GCS obrigatório quando `NODE_ENV=production`;
- URL de requisição redigida nos logs para não registrar `code` e `state` do
  callback OAuth;
- cadeia de dois proxies confiáveis para recuperar o IP do cliente atrás do
  balanceador global e do Cloud Run;
- adapter OpenAI de produção nunca substituído por fixture quando a chave
  estiver ausente;
- migrações SQL têm checkout obrigatório em LF para preservar os checksums
  gravados no PostgreSQL em builds iniciados no Windows;
- workers periódicos podem ser desabilitados no serviço HTTP e executados uma
  vez por Cloud Run Job, permitindo escala a zero com execução agendada.

Verificações desta etapa: 24 testes focados e a suíte completa da API com 120
testes aprovados; lint, typecheck, build de produção e audit de dependências de
produção também aprovados. A validação final da imagem é executada sobre uma
árvore limpa antes da publicação, porque mudanças locais independentes em
planos de aula permanecem fora desta etapa.

## Ambiente de testes GCP

Criado em 16/10/2026 um ambiente Cloud Run público protegido pelo login da
aplicação, com container único para SPA/API, banco e usuário isolados no Cloud
SQL existente, migrações/jobs, seed fictícia, Artifact Registry, Secret Manager
e conta de serviço mínima. Root, assets, live, ready, CORS, CSP e dev-login
foram validados. A URL ainda precisa ser cadastrada manualmente no cliente
OAuth Google. Inventário e rollback estão em
[`gcp-test-environment.md`](./gcp-test-environment.md).

## Interface — pendências de backend consolidadas

As pendências de backend encontradas nas etapas 02 a 10 do redesenho estão
reunidas, com prioridade e impacto na interface, em
[`telas/pendencias-backend.md`](./telas/pendencias-backend.md). P0: B-01
(plano com IA, bloqueia a etapa 07), BK-01 (habilidades BNCC de vários anos)
e BK-02 (questões editadas depois da aprovação).

## Interface — etapa 10: Minha conta

Concluída em 16/10/2026 ([etapa](./telas/10-minha-conta.md)):

- nome editável que aparece na hora no menu; e-mail do Google somente
  leitura;
- sair sempre disponível, mesmo se o perfil não carregar;
- cópia dos dados explicada antes do download;
- exclusão da conta só depois de digitar EXCLUIR, voltando à tela de entrada.

Verificações: 136 testes web e 17 de contratos aprovados; typecheck e build do
web, lint e formatação aprovados. Com esta etapa, todas as telas do
redesenho estão prontas, exceto Aulas (etapa 07), que aguarda o B-01.

## Interface — etapa 09: Boletins

Concluída em 16/10/2026 ([etapa](./telas/09-boletins.md)):

- período preenchido pelo tipo (mês, bimestre, trimestre ou ano atuais) ou
  datas escolhidas;
- alunos em caixas de seleção com "Selecionar todos", no lugar da seleção
  múltipla com Ctrl;
- envio de um boletim mostrando o e-mail do aluno, e envio em lote dos
  pendentes com relato de falhas;
- datas, médias e situações em português.

Verificações: 128 testes web e 17 de contratos aprovados; typecheck e build do
web, lint e formatação aprovados.

## Interface — etapa 08: Recados

Concluída em 16/10/2026 ([etapa](./telas/08-recados.md)):

- novo recado para um aluno (lista agrupada por atividade corrigida) ou aviso
  para a turma toda, com lembrete de que o aviso é visto por todos;
- confirmação antes de enviar dizendo destinatário e canal; excluir também
  pede confirmação;
- a IA só preenche a mensagem; o texto enviado é sempre o que o professor vê;
- histórico com a entrega em português e continuação de rascunhos.

Verificações: 114 testes web e 17 de contratos aprovados; typecheck e build do
web, lint e formatação aprovados. A etapa 07 (Aulas) aguarda o B-01 do
backend.

## Interface — etapa 06: Correções

Concluída em 16/10/2026 ([etapa](./telas/06-correcoes.md)):

- lista de atividades enviadas com o progresso da correção;
- fila por atividade (falta corrigir, aprovadas, devolvidas), buscar
  respostas e devolver as notas aprovadas de uma vez, com confirmação e relato
  de falhas;
- correção de um aluno com resposta esperada à vista, sugestão da IA que só
  preenche os campos, prévia da nota e aprovação que já passa ao próximo;
- nada é gravado em nome do professor; enquanto a API exigir, o comentário é
  obrigatório (pedido B-07 ao backend).

Verificações: 99 testes web e 17 de contratos aprovados; typecheck e build do
web, lint e formatação aprovados.

## Interface — etapa 05: Atividades

Concluída em 16/10/2026 ([etapa](./telas/05-atividades.md)):

- lista com filtros (Todas, Rascunhos, Enviadas, Encerradas) e próximo passo
  de cada atividade;
- assistente em 4 passos — plano, questões (IA ou à mão), revisão e prazo e
  envio — no lugar de cerca de 9 ações espalhadas;
- tipo da atividade calculado das questões e pontuação inteira, evitando os
  erros da API e do Google Formulários;
- acompanhamento da atividade enviada com links, respostas, encerrar e
  guardar com confirmação, e reenvio quando o Google falha.

Verificações: 87 testes web e 17 de contratos aprovados; typecheck e build do
web, lint e formatação aprovados. Duas pendências de backend registradas na
etapa.

## Interface — etapa 04: Turmas

Concluída em 16/10/2026 ([etapa](./telas/04-turmas.md)):

- lista de turmas com matéria e ano, ou aviso "Matéria não definida", e botão
  para trazer as turmas do Google Sala de Aula;
- página da turma com alunos, atualização da lista e criação no Google Sala de
  Aula com confirmação;
- etapa, ano e **uma** matéria escolhidos em listas montadas do catálogo
  BNCC, gravando exatamente os valores que a busca de habilidades usa (antes o
  professor precisaria digitar `ef-ano-08`);
- página de nova turma com código gerado.

Verificações: 66 testes web e 17 de contratos aprovados; typecheck e build do
web, lint e formatação aprovados. Pendências para o backend registradas na
etapa (habilidades de vários anos ligadas só ao primeiro ano na projeção da
BNCC).

## Interface — etapa 03: entrada e Início

Concluída em 16/10/2026 ([etapa](./telas/03-entrada-inicio.md)):

- tela de entrada simplificada, com a orientação de usar a mesma conta do
  Google Sala de Aula;
- Início com pendências e um botão para cada: respostas para corrigir, notas
  aprovadas não devolvidas, devoluções com falha, planos para aprovar, turmas
  sem matéria, atividades que fecham em 48 horas, recados e boletins não
  enviados; "Tudo em dia" quando não há nada;
- contadores no menu para Correções e Aulas, com rótulo acessível;
- falha de verificação não mostra números parciais.

Verificações: 51 testes web e 17 de contratos aprovados; typecheck e build do
web, lint e formatação aprovados. E2E atualizado, não executado.

## Interface — etapa 02: base

Concluída em 16/10/2026 a base do redesenho da interface do professor
([diagnóstico](./telas/00-diagnostico-ui.md),
[proposta](./telas/01-proposta-ui.md), [etapa](./telas/02-base.md)):

- menu por tarefas (lateral no computador, barra inferior no celular) com
  roteador próprio por endereço e título de aba por tela;
- marcas do plano ("Dia N", "RFxxx") e painel técnico de serviços Google
  removidos; aviso aparece só quando o Google está fora do ar;
- situações e códigos de erro traduzidos em um módulo único de rótulos;
- listas completas, estados vazios com próximo passo e falhas de carregamento
  visíveis;
- confirmação acessível antes de publicar, encerrar, guardar, devolver nota,
  enviar ou excluir recado, enviar boletim e excluir conta;
- cores, foco e tamanhos dentro de WCAG 2.2 AA.

Verificações: 30 testes web e 17 de contratos aprovados; typecheck e build do
web, lint e formatação aprovados. O `npm run check` completo ficou bloqueado
por alterações em andamento da API, fora desta etapa. E2E atualizado, não
executado (exige API e banco).

## Ciclo vertical — CV-F: Resend e outbox operacional

Concluída em 16/10/2026 a implementação da entrega híbrida:

- Resend para feedback individual e boletim PDF, com chave idempotente;
- anúncio Classroom apenas para aviso global;
- fallback do Classroom para e-mail dos alunos ativos após falha terminal;
- outbox por destinatário com lease, repetição exponencial e revisões;
- novo escopo OAuth `classroom.announcements`.

Testes direcionados e gate de tipagem/lint aprovados; nenhum envio externo foi
realizado. A validação da migração 026 em PostgreSQL ficou pendente porque o
Docker local não respondeu. Detalhes em
[`ciclo-vertical/11-cv-notificacoes-resend.md`](./ciclo-vertical/11-cv-notificacoes-resend.md).

## Ciclo vertical — CV-B1.2: backend GCS

Concluída em 16/10/2026 a implementação do armazenamento GCS:

- seleção explícita entre backend local e GCS, mantendo local como padrão;
- autenticação por Application Default Credentials, sem chave versionada;
- upload em streaming pela API JSON com precondição contra sobrescrita;
- download privado e exclusão idempotente sob a mesma autorização docente;
- bucket e prefixo obrigatórios/validados somente quando GCS é selecionado;
- smoke real opt-in que cria, lê e remove um objeto fictício.

Os testes usam transporte e token simulados. Nenhum objeto real foi criado; a
homologação externa permanece pendente de autorização. Roteiro e operação estão
em [`ciclo-vertical/10-cv-b1-gcs.md`](./ciclo-vertical/10-cv-b1-gcs.md).

Verificações: `npm run check` aprovado (17 contratos, 103 API e 10 web);
`npm audit --omit=dev` sem vulnerabilidades; smoke GCS coletado e ignorado sem
a flag opt-in.

## Ciclo vertical — CV-B1.1: upload privado local

Concluído em 16/10/2026 o upload privado de materiais:

- multipart em streaming com limite decidido de 100 MB;
- PDF, DOCX, PPT/PPTX, MP4 e imagens validados por extensão, MIME e assinatura;
- armazenamento local por adaptador, chave opaca interna e rollback de objeto
  em falha de limite ou persistência;
- metadados e vínculos gravados atomicamente, com isolamento por professor;
- download autenticado como anexo privado, sem expor a chave física;
- interface única para link externo ou arquivo privado.

Verificações: `npm run check` aprovado (17 contratos, 100 API e 10 web); 8
testes PostgreSQL aprovados em banco temporário, com smoke OpenAI ignorado por
ser opt-in; `npm audit --omit=dev` sem vulnerabilidades. O banco temporário foi
removido e nenhum arquivo foi enviado a serviço externo.

Nenhum arquivo foi enviado ao GCS. Decisões, segurança e roteiro estão em
[`ciclo-vertical/09-cv-b1-upload-privado.md`](./ciclo-vertical/09-cv-b1-upload-privado.md).

## Ciclo vertical — CV-HML: OpenAI real e ambiente determinístico

Concluída em 15/10/2026 a homologação OpenAI que faltava:

- a causa do falso `OPENAI_API_KEY_INVALID` era uma chave antiga herdada pelo
  processo, preservada pelo comportamento padrão do dotenv apesar da chave
  correta no `.env`;
- o smoke real validou a chave atual e gerou um plano estruturado com sucesso;
- em desenvolvimento e teste, o `.env` do repositório agora substitui valores
  herdados; em produção, variáveis injetadas pela plataforma continuam tendo
  precedência;
- testes de regressão protegem os dois comportamentos sem expor segredos.

## Ciclo vertical — CV-HML: homologação Google real

Executada em 15/10/2026 a homologação externa autorizada do caminho Google:

- migrações 024–025 aplicadas a `educai-dev` e Drive API habilitada;
- OAuth real renovado com os escopos planejados;
- turma, Form e trabalho Classroom reais criados com dados fictícios;
- roster de um aluno fictício sincronizado e resposta identificada por e-mail
  verificado;
- objetiva corrigida, discursiva revisada pelo professor, nota 4/10 aprovada e
  devolvida como 2/5 no Classroom;
- segunda coleta idempotente e boletim PDF válido gerado;
- correções de produção para IDs opacos do Forms, parágrafo sem gabarito
  automático e coleta verificada de e-mail.

O Classroom só conclui automaticamente o envio para “Atividade com teste”
criada pela interface; a API pública cria o Form como link, exigindo que o
aluno marque o trabalho como entregue. O smoke OpenAI foi executado e bloqueado
inicialmente por uma variável herdada, depois corrigido e aprovado. Evidências,
IDs, limitações e rollback estão em
[`ciclo-vertical/08-cv-hml.md`](./ciclo-vertical/08-cv-hml.md).

## Ciclo vertical — CV-D/E: coleta, correção e boletim simulados

Concluída em 15/10/2026 a regressão sintética ponta a ponta:

- corpus v1 em formato bruto do Google Forms, com duas páginas e quatro
  submissões cobrindo aluno matriculado, aluno externo, e-mail ausente e
  resposta vazia;
- coletor fixture parametrizável e vazio por padrão, sem chamadas externas nem
  dados fictícios implícitos em desenvolvimento;
- duas coletas idempotentes, quatro submissões persistidas e três encaminhadas
  para revisão manual;
- submissão válida corrigida objetiva e discursivamente, revisada, aprovada e
  liberada localmente com nota 8 e histórico imutável;
- boletim PDF gerado com nota/feedback e isolamento negativo Professor A/B.

Verificações: `npm run check` aprovado (16 contratos, 87 API e 9 web); 8 testes
PostgreSQL aprovados em banco temporário com migrações 001–025; smoke OpenAI
ignorado por ser opt-in. As bases temporárias foram removidas e o proxy
encerrado. Nenhuma API Google/OpenAI ou migração no banco `educai` foi
executada. Cenários, corpus e roteiro estão em
[`ciclo-vertical/07-cv-de-simulado.md`](./ciclo-vertical/07-cv-de-simulado.md).

## Ciclo vertical — CV-C: publicação idempotente

Concluída em 15/10/2026 a proteção do ciclo Forms/Classroom:

- `itemId` determinístico por questão e persistência explícita do vínculo entre
  questão local, item e `questionId` do Google Forms;
- confirmação atômica do Form apenas quando todos os mapeamentos pertencem à
  atividade e estão completos;
- coleta reconciliada pelos IDs persistidos, sem depender da ordem mutável do
  Form;
- preparação transacional, bloqueio estrutural após seu início e lease contra
  publicações concorrentes;
- retentativa preservando Form e trabalhos já reconciliados por marcadores;
- migração `025_activity_form_question_mapping.sql`.

Verificações: `npm run check` aprovado (16 contratos, 86 API e 9 web); 8 testes
PostgreSQL aprovados em banco temporário com migrações 001–025; smoke OpenAI
ignorado por ser opt-in. A base temporária foi removida e o proxy encerrado. A
migração 025 não foi aplicada ao banco `educai` e nenhuma API Google/OpenAI foi
chamada. Cenários e roteiro estão em
[`ciclo-vertical/06-cv-c-publicacao.md`](./ciclo-vertical/06-cv-c-publicacao.md).

## Ciclo vertical — CV-B2: plano completo e aprovado

Concluído em 15/10/2026 o planejamento docente completo:

- formulário de plano com turma, componente curricular, ano/série, ementa,
  habilidades BNCC, materiais, objetivos, conteúdos, metodologia, avaliação,
  duração e referências;
- currículo carregado do perfil explícito da turma e da fonte curricular, sem
  inferência pelo nome do curso Google;
- criação e edição de plano, vínculos e revisão protegidas por transação com
  rollback em falha intermediária;
- retorno dos IDs reais de turmas, habilidades e materiais para edição fiel;
- aprovação manual explícita e exigência de revisão para sugestão de IA;
- edição devolve o plano a rascunho; criação e geração de atividade exigem plano
  aprovado no banco;
- migração `024_lesson_plan_teacher_fields.sql` para duração e referências.

Verificações: `npm run check` aprovado (16 contratos, 84 API e 9 web); 8 testes
PostgreSQL aprovados em banco temporário com migrações 001–024, incluindo plano
completo, aprovação e gate de atividade; smoke OpenAI ignorado por ser
opt-in. A base temporária foi removida e o proxy encerrado. A migração 024 não
foi aplicada ao banco `educai`; nenhuma API Google/OpenAI foi chamada. O roteiro
e as decisões estão em
[`ciclo-vertical/05-cv-b2-plano-completo.md`](./ciclo-vertical/05-cv-b2-plano-completo.md).

## Ciclo vertical — CV-B1: materiais por link

Concluído em 15/10/2026 o cadastro de materiais externos utilizáveis:

- contrato estrito para links HTTP(S), sem aceitar `storageKey` ou metadados de
  arquivo enviados pelo navegador;
- criação atômica do material e dos vínculos com turmas/habilidades em uma única
  instrução PostgreSQL;
- isolamento por professor, retorno dos IDs reais vinculados e filtro explícito
  entre materiais ativos e arquivados;
- interface para selecionar turma, cadastrar título, descrição, categoria e URL,
  atualizar a lista e abrir o recurso com `noopener noreferrer`;
- limpeza da suíte PostgreSQL limitada às conexões do próprio usuário de teste.

Verificações: `npm run check` aprovado (15 contratos, 80 API e 7 web); 7 testes
PostgreSQL aprovados em banco temporário, incluindo atomicidade, isolamento e
arquivamento do material; smoke OpenAI ignorado por ser opt-in. A base temporária
foi removida e o proxy encerrado. Nenhuma migração foi aplicada ao banco
`educai`, nenhuma API externa foi chamada e nenhum bucket foi criado. O roteiro
e as decisões estão em
[`ciclo-vertical/04-cv-b1-materiais-link.md`](./ciclo-vertical/04-cv-b1-materiais-link.md).

## Ciclo vertical — CV-A2: turmas, roster e currículo

Concluída em 14/10/2026 a fatia local de turmas e alunos:

- publicação idempotente de turma local no Classroom por marcador determinístico;
- promoção do curso remoto de `PROVISIONED` para `ACTIVE`;
- roster paginado, reconciliado por ID Google/e-mail, sem apagar histórico nem
  remover restrição docente em sincronização repetida;
- perfil curricular explícito por turma, com etapa, ano/série e múltiplos
  componentes, inclusive para turmas Google;
- interface para criar/importar/abrir/publicar turma, sincronizar alunos e salvar
  currículo;
- migração `023_class_curriculum_profile.sql`.

Verificações: `npm run check` aprovado (14 contratos, 76 API e 5 web); 6 testes
PostgreSQL aprovados em banco temporário com migrações 001–023 e remoção ao
final. O proxy foi encerrado. A migração 023 não foi aplicada ao banco `educai`
e nenhuma API Google/OpenAI foi chamada. O roteiro de teste está em
[`ciclo-vertical/03-cv-a2-turmas-roster-curriculo.md`](./ciclo-vertical/03-cv-a2-turmas-roster-curriculo.md).

## Ciclo vertical — CV-A1: Classroom real e isolamento de status

A fronteira de produção do Classroom agora lista cursos docentes com paginação,
refresh de token e erros normalizados. Em produção, `app.ts` usa o adapter real;
desenvolvimento e teste continuam com fixture explicitamente identificada. A
sincronização obtém a credencial da sessão, exige os escopos mínimos aprovados e
persiste eventual renovação antes do upsert idempotente.

O monitor deixou de verificar apenas a credencial mais recente: percorre todas
as credenciais ativas. A consulta pública combina somente os estados Google do
professor autenticado com o estado global da OpenAI, eliminando contaminação
entre professores.

Verificações: 66 testes de API, typecheck e lint aprovados. Paginação, falha de
permissão, escopos, múltiplos professores, ausência de credencial e
reconsentimento foram cobertos com dublês. Nenhuma chamada Google/OpenAI ou
escrita em banco externo foi executada. Criação de curso e roster pertencem a
CV-A2.

## Ciclo vertical — CV-0: gate TDD determinístico

O primeiro patch de saneamento foi concluído antes das mudanças funcionais:

- Prettier passou a respeitar o fim de linha do checkout, mantendo o gate
  reproduzível em Windows sem reformatar 152 arquivos;
- a suíte PostgreSQL sem `DATABASE_URL` agora é coletada e ignorada sem tentar
  construir uma URL inválida ou abrir conexão;
- o teste web do shell lazy recebeu espera local e passou dentro da suíte
  agregada;
- os 76 casos locais foram inventariados em 61 unidades/contratos, 11
  componentes HTTP/API e 4 componentes web em
  [`ciclo-vertical/01-cv0-gate.md`](./ciclo-vertical/01-cv0-gate.md).

Verificações: `npm run check` aprovado; 5 integrações PostgreSQL e 1 smoke
OpenAI corretamente ignorados com variáveis deliberadamente vazias. Nenhuma
credencial externa foi usada e nenhuma escrita em banco foi realizada.

## Ciclo vertical — diagnóstico inicial

O ciclo vertical A → E foi auditado contra o DERS completo, migrações 001–022,
implementação e testes. O parecer e o menor conjunto de patches estão em
[`ciclo-vertical/00-diagnostico.md`](./ciclo-vertical/00-diagnostico.md).

Resultado: a base local de planos, atividades, correção e boletim é relevante,
mas o ciclo real está bloqueado antes da turma Google. A aplicação injeta um
adapter Classroom fixture em execução normal, não lista/cria turmas nem importa
roster real, e a interface não permite compor turma → currículo/BNCC → material
→ plano aprovado. Nenhum deploy, recurso cloud, chamada Google/OpenAI ou escrita
em banco compartilhado foi executado.

Gate reproduzido após instalação pelo lockfile: contratos 13/13 e API 59/59;
web 3/4 na execução agregada e 4/4 isolada (flakiness); lint, tipagem e build
aprovados; integração indisponível e com falha de skip sem `DATABASE_URL`;
formatação falhou por LF/CRLF; audit de produção sem vulnerabilidades. A próxima
etapa proposta é CV-0, para tornar o gate determinístico antes dos patches
funcionais.

## Entrega atual - Dia 14

O produto recebeu endurecimento HTTP, rate limit, logs redigidos, auditoria geral, exportação/anonimização LGPD, retenção técnica, scripts de backup/restauração, acessibilidade responsiva, E2E e uma entrada de demonstração estritamente local. A instância foi iniciada com o banco configurado, migrações e seeds atuais.

Verificações finais:

- `npm run test:unit`: 76 testes aprovados (13 contratos, 59 API e 4 web);
- `npm run test:integration`: 5 testes PostgreSQL aprovados e smoke OpenAI ignorado por ser opt-in;
- `npm run test:e2e`: 6 testes aprovados em Chrome e Edge;
- migrações 001–022 aprovadas em banco vazio; 014–022 aplicadas ao banco de desenvolvimento configurado;
- health live/ready, sessão de demonstração e isolamento de turma confirmados;
- `npm audit --omit=dev`, lint, tipagem, formatação e build aprovados.

Limitações registradas: Firefox e segundas versões dos navegadores não estavam disponíveis; `pg_dump`/`pg_restore` não estão instalados; provedor de e-mail e smokes Google/OpenAI reais continuam externos; não houve deploy público nem teste de penetração.

## Dia 14 - Etapa 1: segurança e auditoria

- Helmet/CSP, CORS exato, rejeição de origem divergente, rate limit e corpo de 1 MiB;
- cookie seguro em produção, tokens cifrados e logs com cabeçalhos sensíveis redigidos;
- auditoria imutável de mutações sem corpo ou conteúdo pedagógico;
- atualização de segurança do `ajv` e audit de produção zerado.

## Dia 14 - Etapa 2: LGPD, retenção e operação

- exportação própria sem tokens e exclusão com revogação/anonimização;
- retenção configurável de sessões, estados OAuth, credenciais revogadas e status técnicos;
- scripts de backup custom + SHA-256 e restauração com confirmação explícita;
- runbook operacional, política de segurança/LGPD e limitações documentadas.

## Dia 14 - Etapa 3: regressão e instância

- foco visível, skip link e breakpoints de telefone/tablet;
- Playwright sequencial em Chrome e Edge para evitar pressão de memória;
- entrada fixture protegida por `NODE_ENV=development` e flag local;
- instância web/API ativa em localhost, com banco pronto e seed idempotente.

## Entrega anterior - Dia 13

O fluxo de boletins agora consolida notas aprovadas por período, calcula média aritmética, inclui feedbacks enviados e comentário docente, gera PDF histórico imutável e permite envio ou reenvio com tentativas auditáveis. A geração funciona para um aluno ou lote e aceita filtro abaixo de um limiar informado, sem inventar presença, participação ou responsável.

Verificações finais:

- `npm run test:unit`: 74 testes aprovados (13 contratos, 57 API e 4 web);
- `npm run test:integration`: 4 testes PostgreSQL aprovados e smoke OpenAI ignorado por ser opt-in;
- migrações 001–021 aplicadas em banco vazio e repetição sem novas aplicações;
- integração PostgreSQL comprovou bloqueio sem notas, filtro por média, PDF, isolamento, snapshot imutável e dois envios preservados;
- `npm audit --omit=dev`: nenhuma vulnerabilidade de produção após atualização pontual do `ajv`;
- lint, tipagem, formatação e build de produção aprovados.

Validação externa pendente: aplicar as migrações 015–021 no Cloud SQL e configurar um provedor real de e-mail. Em produção, a ausência do provedor gera falha recuperável e preserva o PDF. Nenhuma chamada externa, deploy ou push foi executado automaticamente.

## Dia 13 - Etapa 1: consolidação e média

- boletim individual ou em lote para alunos ativos de turma própria;
- períodos mensal, bimestral, trimestral, anual e personalizado;
- somente notas aprovadas/liberadas com atividade dentro do período;
- média aritmética simples entre atividades normalizadas em 0–10;
- filtro opcional exige limiar explícito e boletim sem notas é bloqueado.

## Dia 13 - Etapa 2: PDF e cópia histórica

- snapshot com professor, turma, aluno, atividades, notas, feedbacks e comentário;
- PDF multipágina gerado no servidor e armazenado com SHA-256;
- visualização autenticada pelo professor proprietário;
- período, média, snapshot e bytes protegidos contra alteração no banco.

## Dia 13 - Etapa 3: envio e reenvio

- envio ao e-mail institucional do aluno por adaptador;
- fixture confirma envios em desenvolvimento/teste;
- produção falha explicitamente enquanto o provedor não estiver configurado;
- cada reenvio cria nova tentativa e falhas nunca apagam o PDF.

## Entrega anterior - Dia 12

O fluxo de comunicação pedagógica agora cobre feedback individual para submissões aprovadas e avisos globais para turmas, com texto manual, links, materiais autorizados, geração opcional por IA, revisão docente, histórico imutável e notificação idempotente. A janela de edição/exclusão é configurável por ambiente e usa 24 horas como padrão documentado.

Verificações finais:

- `npm run test:unit`: 67 testes aprovados (12 contratos, 51 API e 4 web);
- `npm run test:integration`: 4 testes PostgreSQL aprovados e smoke OpenAI ignorado por ser opt-in;
- migrações 001–020 aplicadas em banco vazio e repetição sem novas aplicações;
- integração PostgreSQL comprovou isolamento de destinatário, geração/revisão, feedback individual, aviso global, envio idempotente, duas notificações e histórico protegido;
- lint, tipagem, formatação e build de produção aprovados.

Validação externa pendente: aplicar as migrações 015–020 no Cloud SQL e executar geração OpenAI real. A outbox de notificações está persistida; a entrega externa efetiva por Classroom/e-mail permanece para integração operacional. Nenhuma chamada externa, deploy ou push foi executado automaticamente.

## Dia 12 - Etapa 1: contratos e persistência

- cenários de autorização, geração, revisão, janela, envio e histórico;
- feedback individual vinculado à submissão, aluno e atividade corrigida;
- aviso global vinculado à turma;
- links, materiais anexados, gerações versionadas, histórico append-only e outbox;
- janela `FEEDBACK_EDIT_WINDOW_MINUTES`, com padrão de 1.440 minutos.

## Dia 12 - Etapa 2: IA e autoridade docente

- prompt restrito a destinatário, atividade, nota, comentário e evidências por questão;
- Structured Outputs com pontos fortes, melhorias e mensagem sugerida;
- falha da IA preserva o rascunho manual;
- conteúdo gerado exige revisão explícita antes do envio;
- histórico diferencia origem `fixture`/`openai`, revisão e edição docente.

## Dia 12 - Etapa 3: interface e notificações

- painel para criar feedback ou aviso, escolher destinatário, link e material;
- edição, exclusão lógica e bloqueio após a janela configurada;
- geração, revisão e envio com estados visíveis;
- uma notificação por comunicação, direcionada a aluno ou turma e canal calculado.

## Entrega anterior - Dia 11

O fluxo de correção agora cobre sugestões discursivas estruturadas, correção manual, revisão docente obrigatória, aprovação explícita e liberação local ou via Google Classroom. Sugestões nunca alteram a nota final; cada tentativa, ajuste, aprovação e liberação gera histórico imutável. Atividades mistas combinam os pontos objetivos e discursivos somente após a decisão do professor.

Verificações finais:

- `npm run test:unit`: 63 testes aprovados (11 contratos, 48 API e 4 web);
- `npm run test:integration`: 4 testes PostgreSQL aprovados e smoke OpenAI ignorado por ser opt-in;
- migrações 001–019 aplicadas em banco vazio e repetição sem novas aplicações;
- integração PostgreSQL comprovou sugestão, ajuste, nota mista, aprovação, liberação, isolamento por professor e bloqueio de alteração do histórico;
- lint, tipagem, formatação e build de produção aprovados.

Validação externa pendente: aplicar as migrações 015–019 no Cloud SQL e executar sugestões OpenAI e devolução Classroom reais com conta e turma de teste. Nenhuma chamada externa, deploy ou push foi executado automaticamente.

## Dia 11 - Etapa 1: sugestão discursiva

- prompt com enunciado, resposta, resposta-alvo, critérios, rigor, ano escolar, dificuldade e conteúdo-base;
- Structured Outputs com pontos sugeridos, comentário e sinalização de revisão;
- vazio, ambiguidade, timeout e indisponibilidade direcionam para correção manual;
- sugestão persistida sem alterar pontos ou nota final.

## Dia 11 - Etapa 2: revisão, aprovação e histórico

- correção manual ou assistida de todas as respostas discursivas;
- validação da pontuação máxima de cada questão;
- cálculo da nota final 0–10 somente após aprovação explícita;
- aprovação direta de correções totalmente objetivas;
- histórico imutável de sugestão, falha, ajuste, aprovação e liberação.

## Dia 11 - Etapa 3: liberação e interface

- devolução de nota e retorno da submissão no Classroom quando os identificadores existem;
- liberação local marcada como indisponível no Classroom quando o vínculo externo não existe;
- falha externa preserva a aprovação e permite repetição idempotente;
- painel com sugestão, edição de pontos/comentário, aprovação, liberação e estados externos.

## Entrega anterior - Dia 10

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

Configurar credenciais externas e provedor de e-mail, executar smoke real Google/OpenAI, instalar ferramentas PostgreSQL para o ensaio de restauração e decidir o deploy público quando autorizado.
