# Plano de implementação do EDUC.AI - 14 dias

Período: 07/10/2026 a 20/10/2026.

Fonte principal: DERS do EDUC.AI, requisitos RF001 a RF014, regras de negócio, requisitos não funcionais, protótipos e diagramas técnicos.

## 1. Premissas e regra de execução

Este plano é o contrato de execução dos 14 dias. Cada dia termina com uma entrega executável, testes proporcionais ao risco, documentação atualizada e um commit delimitado. Funcionalidades de dias posteriores não serão antecipadas, exceto a criação de contratos ou chaves estrangeiras indispensáveis ao módulo corrente.

As chaves de Google e OpenAI estarão disponíveis a partir de 08/10/2026. O primeiro dia não depende delas. Segredos nunca serão versionados; serão carregados no servidor por variáveis de ambiente e representados apenas por nomes em `.env.example`.

O texto dos requisitos, regras de negócio e quadros de campos prevalece quando um diagrama omite uma informação. Os diagramas serão usados para relações e limites de componentes, mas não para eliminar dados expressamente exigidos pelos fluxos.

Não fazem parte do produto:

- aplicativo móvel nativo;
- painel administrativo institucional;
- autenticação por senha ou por provedor diferente do Google;
- publicação automática de conteúdo gerado por IA sem revisão do professor;
- integrações externas além de Google e OpenAI;
- treinamento de modelo próprio;
- funcionalidades não descritas no DERS.

## 2. Evidência documental e ressalva das versões

O arquivo indicado `Desenvolvimento_DERS_HenriqueBessa.pdf` contém 78 páginas físicas e termina no item 2.8.4, antes da seção 2.9. O sumário desse arquivo anuncia diagramas nas páginas seguintes, mas elas não estão presentes na exportação.

A cópia `Desenvolvimento_DERS_HenriqueBessa_ClaytonAraujo.pdf`, encontrada na mesma pasta, contém 96 páginas e completa o mesmo conteúdo com:

- casos de uso do professor, ambiente Google, OpenAI e aluno;
- diagrama de classes;
- diagrama entidade-relacionamento;
- diagrama de componentes;
- diagramas de sequência para criação de atividades e manutenção de planos.

Antes de iniciar o banco no Dia 1, será registrada a versão completa como referência oficial do projeto ou será fornecida nova exportação completa do arquivo indicado. Até essa confirmação, o modelo pode ser preparado, mas não será tratado como congelado.

## 3. Dimensionamento do DERS

O esforço foi distribuído pelo tamanho das especificações, quantidade de fluxos alternativos, dependências externas e volume de estado persistido.

| Bloco                | Extensão aproximada no DERS | Complexidade | Motivo                                                               |
| -------------------- | --------------------------: | ------------ | -------------------------------------------------------------------- |
| RF001 Google         |                   4 páginas | Alta         | Três APIs, rotina periódica, credenciais, log e degradação funcional |
| RF002 OpenAI         |                   4 páginas | Alta         | Monitoramento, falhas, retentativas e bloqueio de dependências       |
| RF003 Ementa/BNCC    |                   4 páginas | Média        | Carga técnica, filtros curriculares, histórico e fallback            |
| RF004 Autenticação   |                   3 páginas | Alta         | OAuth, sessão, cadastro automático e proteção de tokens              |
| RF005 Professor      |                   3 páginas | Média        | Campos externos bloqueados, preferências e turmas                    |
| RF006 Turmas         |                   4 páginas | Alta         | CRUD local, importação, código único e campos bloqueados             |
| RF007 Alunos         |                   4 páginas | Alta         | Três origens, reconciliação por e-mail e estados de validação        |
| RF008 Linha do tempo |                   3 páginas | Média        | Regras temporais e vínculos com atividade                            |
| RF009 Planos         |                   5 páginas | Alta         | Criação manual/IA, BNCC, materiais, bloqueios e arquivamento         |
| RF010 Materiais      |                   4 páginas | Média/alta   | Upload, metadados, armazenamento, vínculos e bloqueios               |
| RF011 Atividades     |                   4 páginas | Alta         | Questões, IA, publicação, prazo e restrições após uso                |
| RF012 Correção       |                   5 páginas | Muito alta   | Coleta externa, objetiva, discursiva, revisão e histórico            |
| RF013 Feedback       |                   4 páginas | Alta         | Individual/global, IA, anexos, histórico e notificação               |
| RF014 Boletim        |                   4 páginas | Alta         | Consolidação, filtros, PDF/e-mail, reenvio e histórico               |
| RNFs e diagramas     |                 10+ páginas | Transversal  | LGPD, auditoria, backup, responsividade, navegadores e falhas        |

RF009, RF011 e RF012 recebem mais de um dia ou um dia dedicado. RF013 e RF014 ficam separados. RF008 e RF010 são agrupados porque possuem dependências já estabelecidas e menor extensão individual.

## 4. Arquitetura que será implementada

### 4.1 Estrutura

Monorepositório com npm workspaces:

```text
apps/
  web/                 React, TypeScript e Vite
  api/                 Node.js, TypeScript e Fastify
packages/
  contracts/           schemas, DTOs, erros e tipos compartilhados
database/
  migrations/          migrações SQL versionadas
  seeds/               cargas reproduzíveis e identificadas
tests/
  integration/         PostgreSQL e adaptadores
  e2e/                 fluxos completos em navegador
```

Tecnologias:

- frontend: React, TypeScript, Vite, React Router, TanStack Query, React Hook Form e Zod;
- backend: Node.js LTS, TypeScript, Fastify, Zod e `pg`;
- persistência: PostgreSQL, migrações SQL explícitas e transações no backend;
- testes: Vitest para unidades/componentes, Testing Library para interface e Playwright para ponta a ponta;
- ambiente local: Docker Compose para PostgreSQL e armazenamento persistente;
- APIs externas: SDK oficial Google APIs e SDK oficial OpenAI;
- arquivos: adaptador de armazenamento com implementação local em desenvolvimento e Google Cloud Storage na implantação;
- execução periódica: processo worker da mesma base de código, sem microsserviços adicionais;
- implantação: serviços compatíveis com GCP, HTTPS, banco PostgreSQL gerenciado e armazenamento no Google Cloud.

As versões exatas serão estáveis, compatíveis entre si e fixadas no lockfile no Dia 1. Não haverá atualização ampla de dependências durante os demais dias.

### 4.2 Limites de componentes

- A interface nunca acessa PostgreSQL, Google ou OpenAI diretamente.
- O backend resolve identidade pela sessão; nenhum `professorId` vindo do cliente vale como autenticação.
- Casos de uso dependem de interfaces de repositório e adaptadores externos.
- Conteúdo de IA só muda para estado publicável após revisão explícita do professor.
- Turmas e todos os recursos subordinados são consultados com escopo do professor autenticado.
- Falhas externas são persistidas e transformadas em estados funcionais claros na interface.

## 5. Modelo de dados de referência

### 5.1 Entidades presentes no DER

O DER apresenta as seguintes tabelas ou associações, que serão transcritas para PostgreSQL com nomes consistentes, chaves estrangeiras, unicidade e índices:

- `professor`;
- `turma`;
- `aluno`;
- `turma_aluno`;
- `marco`;
- `aviso`;
- `plano_aula`;
- `bncc_objetivo`;
- `plano_aula_bncc_objetivo`;
- `material_apoio`;
- `material_apoio_bncc_objetivo`;
- `atividade`;
- `questao`;
- `nota`;
- `submissao_atividade`;
- `aluno_submissao_atividade`;
- `feedback`;
- `boletim`.

O diagrama usa tipos de outro dialeto (`TINYINT`, `MEDIUMTEXT`, `ENUM`). A implementação preservará os significados, convertendo-os para tipos PostgreSQL, sem copiar limitações do dialeto do desenho.

### 5.2 Complementos exigidos pelo texto do DERS

Serão adicionados apenas porque os fluxos os exigem explicitamente:

- estado e histórico das integrações Google/OpenAI, incluindo serviço, status, horário e mensagem;
- credenciais OAuth protegidas, sessão e vínculo externo do professor;
- ementa/área curricular e histórico de atualização da base BNCC;
- origem e identificadores externos de turma, aluno, atividade e submissão;
- preferência de notificação e imagem do professor;
- código de acesso local único da turma, separado do identificador Google;
- estado de matrícula (`ativo`, `restrito`, `pendente`) e origem;
- vínculo de materiais com turma e plano/atividade;
- status e histórico de publicação/arquivamento de planos e atividades;
- respostas por questão, gabarito e resposta-alvo;
- sugestão de correção, ajuste/aprovação docente e histórico;
- feedback individual/global e seus anexos/links;
- cópia histórica e tentativas de envio do boletim;
- auditoria das ações do professor.

Índices obrigatórios: todas as chaves estrangeiras consultadas, e-mail normalizado, identificadores externos, código de acesso, status/prazo de atividades e pares únicos das tabelas associativas. Exclusões e atualizações usarão restrições que preservem histórico pedagógico.

## 6. Critério de conclusão diário

Um dia só é concluído quando:

1. cenários do módulo foram escritos antes da regra;
2. migração e seed aplicam em banco vazio;
3. API valida entrada e aplica autorização no backend;
4. interface cobre carregamento, vazio, sucesso e erro;
5. testes unitários, de integração e/ou E2E pertinentes passam;
6. nenhum segredo aparece no código, Git ou logs;
7. documentação, rastreabilidade RF e decisões são atualizadas;
8. o diff é revisado e recebe um único commit coerente.

## 7. Cronograma de 14 dias

### Dia 1 - 07/10 - Fundação, contratos e banco base

Objetivo: tornar o repositório executável sem depender de chaves externas.

Implementar:

- monorepositório, lockfile, lint, formatação, build, checagem de tipos e testes;
- React/Vite mínimo e API Fastify com encerramento gracioso;
- Docker Compose com PostgreSQL e volume persistente;
- configuração validada por ambiente e `.env.example` sem segredos;
- contratos compartilhados de resposta, paginação, erro e identidade;
- endpoints de vida e prontidão, distinguindo processo ativo de banco disponível;
- primeira migração com extensões, convenções, professor, turma, aluno/matrícula, currículo/BNCC e monitoramento técnico;
- seed idempotente com dados explicitamente fictícios e dois professores isolados;
- tela mínima identificando ambiente e estado da API/banco;
- matriz RF -> fluxos -> tabelas -> endpoints -> telas -> testes.

Aceite:

- checkout limpo instala pelo lockfile;
- banco vazio migra e recebe seed repetível;
- reinício preserva dados;
- configuração inválida falha com mensagem clara e sem valores secretos;
- web e API iniciam pelos comandos documentados;
- nenhum RF é marcado como completo apenas pela fundação.

### Dia 2 - 08/10 - Google, OAuth e monitoramento (RF001 + RF004)

Objetivo: estabelecer identidade real e conectividade Google assim que as chaves estiverem disponíveis.

Implementar:

- OAuth 2.0 Google exclusivo, callback, sessão segura e logout;
- cadastro automático por nome, e-mail e imagem retornados pelo Google;
- armazenamento protegido de tokens, renovação e revogação;
- adaptadores de teste para OAuth, Classroom e Forms;
- rotina de status por serviço, última verificação, erro normalizado e recursos dependentes;
- cenários de credencial ausente/expirada, negação, falha de comunicação e serviço indisponível;
- até três tentativas adicionais no caso especificado e novo ciclo a cada cinco minutos;
- tela de login e retorno de falha; acesso protegido ao shell do professor.

Aceite: login/cadastro/sessão funcionam com conta de teste, falhas são persistidas e nenhuma rota protegida aceita identidade do corpo da requisição.

### Dia 3 - 09/10 - OpenAI, base curricular e perfil (RF002 + RF003 + RF005)

Objetivo: concluir os serviços-base usados pelos módulos pedagógicos.

Implementar:

- adaptador OpenAI e verificação de chave/serviço;
- estados ausente, inválida, expirada e indisponível, intervalo de cinco minutos e bloqueio de recursos;
- carga técnica idempotente de ementa, áreas, componentes e habilidades BNCC;
- consulta por componente e ano/série, habilidade ausente e fallback marcado para revisão;
- histórico de alteração curricular;
- perfil com nome editável, e-mail bloqueado, imagem, preferência de notificação e turmas;
- tratamento de falha de importação e estado sem turma.

Aceite: dados curriculares reais têm fonte registrada; fixtures nunca se apresentam como BNCC oficial; perfil não permite editar e-mail controlado pelo Google.

### Dia 4 - 10/10 - Turmas e alunos (RF006 + RF007)

Objetivo: entregar a base multi-turma com isolamento real por professor.

Implementar:

- criação manual e importação de turmas do Classroom;
- nome, descrição, ano letivo, avisos gerais e código de acesso único;
- bloqueio de campos controlados pelo Google;
- sincronização de alunos, importação da planilha padrão e entrada por código;
- reconciliação por e-mail institucional;
- origem Google como primária e não editável;
- estados ativo, restrito e pendente de validação;
- orientação de remoção no Classroom e exclusão local quando permitida;
- filtros e identificação de dados inconsistentes.

Aceite: dois professores não acessam turmas/alunos entre si; código duplicado e aluno duplicado são rejeitados; a sincronização repetida é idempotente.

### Dia 5 - 11/10 - Linha do tempo e materiais (RF008 + RF010)

Objetivo: fornecer os insumos locais usados por planos e atividades.

Implementar:

- marcos com data, tipo, descrição e vínculo à turma;
- estado vazio, bloqueio de edição de marco passado e confirmação de exclusão vinculada;
- upload de PDF, DOCX, PPT/PPTX, MP4, imagem e links conforme os fluxos;
- categoria, descrição, turmas e objetivos BNCC;
- armazenamento local/GCS por adaptador, validação de tipo e visualização segura;
- edição, arquivamento e bloqueio de exclusão quando vinculado a conteúdo publicado.

Aceite: autorização inclui arquivo e metadados; tipo inválido é rejeitado; material vinculado não é apagado; limite não será inventado e ficará configurável após decisão.

### Dia 6 - 12/10 - Planos de aula manuais (RF009, parte 1)

Objetivo: entregar todo o ciclo de plano sem depender da IA.

Implementar:

- listagem, criação, edição, visualização, reutilização e arquivamento;
- componente curricular, ano escolar, objetivos BNCC, conteúdo e metodologia;
- título, objetivos, conteúdos, recursos didáticos e estratégia de avaliação;
- vínculos com turma, BNCC, ementa e materiais;
- validações obrigatórias e bloqueios estruturais após uso em atividade;
- interface em duas colunas preparada para sugestões, sem gerar ainda.

Aceite: plano manual persiste, respeita propriedade do professor e mantém histórico/vínculos ao arquivar.

### Dia 7 - 13/10 - Geração e revisão de planos com IA (RF009, parte 2)

Objetivo: completar a assistência de IA com autoridade final do professor.

Implementar:

- montagem de prompt com ementa, BNCC e materiais permitidos;
- geração estruturada, validação do retorno e tratamento de timeout/erro;
- aviso e bloqueio quando não houver ementa;
- comparação/edição de sugestões na interface;
- estados rascunho, gerado, revisado e aprovado pelo professor;
- registro de versão, modelo e origem sem armazenar segredos.

Aceite: nenhum plano gerado é publicável sem revisão/validação explícita; falha da IA preserva o formulário manual.

### Dia 8 - 14/10 - Atividades e questões locais (RF011, parte 1)

Objetivo: entregar criação e revisão manual completa.

Implementar:

- listagem e filtros por rascunho, publicada e finalizada;
- título, descrição, tipo objetiva/discursiva/mista, prazo e plano obrigatório;
- questões, alternativas, gabarito, pontuação, resposta-alvo e critérios;
- pré-visualização e edição antes de publicar;
- política de atraso configurada pelo professor no escopo da atividade;
- bloqueio estrutural após publicação e arquivamento quando houver respostas.

Aceite: objetiva, discursiva e mista funcionam sem IA; critérios e pontuação são visíveis antes da execução.

### Dia 9 - 15/10 - IA e publicação Google de atividades (RF011, parte 2 + RF001)

Objetivo: completar geração, distribuição e coleta externa.

Implementar:

- prompt baseado em plano, materiais, tipo e dificuldade;
- geração estruturada de questões/respostas e revisão obrigatória;
- criação/publicação no Google Forms e distribuição pelo Classroom;
- IDs externos e operação idempotente para evitar duplicação;
- sincronização de status e agendamento de coleta;
- recuperação de falhas sem perder o rascunho local.

Aceite: repetição não cria Forms/atividades duplicadas; publicação só ocorre após aprovação do professor; falha externa é visível e recuperável.

### Dia 10 - 16/10 - Coleta e correção objetiva (RF012, parte 1)

Objetivo: trazer submissões e concluir a avaliação determinística.

Implementar:

- coleta de envios ao encerrar o prazo;
- reconciliação aluno, atividade, submissão e respostas por questão;
- correção objetiva pelo gabarito;
- nota de 0 a 10 e detalhamento por questão;
- estados de processamento e correção manual para dados vazios/inconsistentes;
- histórico e auditoria da execução.

Aceite: coleta repetida é idempotente; correção objetiva possui testes unitários independentes do banco; dados de outro professor não são processados.

### Dia 11 - 17/10 - Correção discursiva, revisão e liberação (RF012, parte 2)

Objetivo: completar o maior fluxo do sistema sem delegar a decisão final à IA.

Implementar:

- prompt com enunciado, resposta, resposta-alvo opcional, critérios, rigidez, nível e conteúdo-base;
- sugestão de nota/comentário, indicação de revisão e falha por vazio/ambiguidade;
- edição da nota e observação pelo professor;
- aprovação/liberação e devolução ao Classroom quando disponível;
- histórico imutável de sugestão, ajuste e aprovação;
- correção manual e mista.

Aceite: nenhuma sugestão discursiva vira nota final sem aprovação docente; alterações ficam auditáveis; indisponibilidade da IA direciona para correção manual.

### Dia 12 - 18/10 - Feedback e avisos (RF013)

Objetivo: entregar comunicação pedagógica individual e global.

Implementar:

- feedback individual associado a aluno/atividade corrigida;
- aviso global associado à turma;
- geração opcional por IA com pontos fortes, melhorias e revisão sugerida;
- observação editável do professor;
- links, anexos, data/hora, histórico e notificação;
- edição/exclusão dentro da janela configurada após definição do valor.

Aceite: feedback de IA exige revisão; anexos respeitam autorização; histórico diferencia texto gerado e texto docente.

### Dia 13 - 19/10 - Boletins e envio (RF014)

Objetivo: consolidar os resultados e preservar o histórico emitido.

Implementar:

- boletim individual e em lote;
- período mensal, bimestral, trimestral, anual e personalizado conforme os fluxos/quadros;
- notas, média, atividades e feedbacks, sem inventar presença/participação ausentes do modelo;
- comentários do professor e filtro por desempenho abaixo da média;
- geração de PDF, visualização interna, envio e reenvio;
- status pendente/enviado/falha e cópia histórica imutável.

Aceite: boletim sem notas é bloqueado; falha de envio não perde o PDF e permite reenvio; cálculo de média possui teste unitário após decisão sobre pesos.

### Dia 14 - 20/10 - Requisitos não funcionais, regressão e entrega

Objetivo: validar o sistema como produto integrado e preparar a execução em GCP.

Implementar e verificar:

- consistência visual, responsividade para desktop/notebook/tablet e feedback visual;
- navegação por teclado, rótulos e contraste básico;
- autorização negativa e isolamento em todas as rotas;
- consentimento, minimização de dados, retenção documentada e exportação/exclusão aplicável à LGPD;
- HTTPS, cookies seguros, proteção de tokens, CORS, limites de requisição e logs sem segredos;
- auditoria de criação de planos, publicação, correção e envio;
- backup periódico e ensaio documentado de restauração;
- tolerância às falhas Google/OpenAI e retomada dos jobs;
- testes nas duas últimas versões estáveis de Chrome, Firefox e Edge;
- regressão unitária, integração e E2E dos RF001 a RF014;
- build de produção, migrações em ambiente de homologação GCP e smoke test;
- README, arquitetura, decisões, rastreabilidade, operação e relatório final.

Aceite: todos os fluxos básicos e alternativos implementados têm evidência; falhas conhecidas são registradas; nenhuma funcionalidade é declarada pronta sem validação.

## 8. Estratégia de testes

### Unitários

- validações e transições de estado;
- código único de turma e reconciliação por e-mail;
- bloqueios temporais e de vínculo;
- correção objetiva e cálculo de notas/médias após decisões;
- construção/validação de prompts e respostas estruturadas;
- políticas de publicação, arquivamento e aprovação.

### Integração

- migrações e seeds em PostgreSQL vazio;
- repositórios, transações, unicidade e autorização;
- OAuth/callback/sessão com conta de teste;
- adaptadores Google/OpenAI em sucesso, erro e timeout;
- upload/armazenamento e jobs idempotentes;
- coleta, correção, feedback e boletim com histórico.

### Ponta a ponta

1. professor novo autentica e cria/importa turma;
2. professor gerencia alunos, marco e materiais;
3. professor cria/revisa plano manual ou por IA;
4. professor cria/revisa/publica atividade;
5. sistema coleta respostas e corrige objetivas;
6. professor revisa discursivas e libera resultados;
7. professor envia feedback e gera boletim;
8. segundo professor não acessa qualquer dado do primeiro;
9. falhas Google/OpenAI degradam somente funções dependentes.

## 9. Decisões que precisam ser fechadas sem ampliar o escopo

Estas lacunas são do próprio DERS e não autorizam inventar comportamento. Devem ser decididas no máximo até o dia indicado; o restante do trabalho segue em paralelo.

| Decisão                                        | Prazo  | Evidência/conflito                                                                  |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| Confirmar a versão completa do DERS            | Dia 1  | O PDF indicado não contém a seção técnica; a cópia de 96 páginas contém             |
| Canal de acesso do aluno                       | Dia 2  | Texto define aluno indireto via Classroom, mas caso de uso mostra interface própria |
| Fonte/carga oficial da BNCC                    | Dia 3  | RF003 permite script, API ou painel restrito; não define fonte                      |
| Modelo de planilha de alunos                   | Dia 4  | RF007 exige formato padrão, mas não fornece colunas/arquivo                         |
| Exclusão de marco vinculado                    | Dia 5  | Fluxo básico impede; alternativo permite confirmação                                |
| Tipos e limite de arquivos                     | Dia 5  | Quadro e fluxo listam formatos diferentes; quota não é informada                    |
| Política de atraso e peso de avaliação         | Dia 8  | Regra delega ao professor, mas campos/opções não estão definidos                    |
| Janela de edição de feedback                   | Dia 12 | O DERS usa “ex: 24h”, não um valor definitivo                                       |
| Origem de presença/participação e responsáveis | Dia 13 | RF014 cita dados/e-mails sem entidade ou fluxo de coleta                            |
| Meio de envio de e-mail                        | Dia 13 | RF014 exige envio, mas as exclusões limitam integrações externas ao Google          |

Recomendação inicial para os conflitos: escolher a opção mais restritiva e rastreável, nunca a que cria um novo perfil, integração ou dado pessoal sem autorização.

## 10. Resultado esperado ao fim dos 14 dias

- aplicação web responsiva e backend executáveis;
- PostgreSQL versionado por migrações e protegido por autorização;
- autenticação Google exclusiva;
- monitoramento e tolerância a falhas para Google/OpenAI;
- RF001 a RF014 implementados nos fluxos aprovados;
- professor como autoridade final sobre conteúdo e avaliação;
- integrações idempotentes, auditáveis e sem segredos no cliente;
- testes unitários, integração e E2E com evidência;
- implantação de homologação na GCP, sem dados reais, após autorização;
- documentação suficiente para operar, testar e continuar o projeto.
