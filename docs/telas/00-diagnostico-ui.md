# Diagnóstico da interface do professor

Fase 1 do redesenho da UI. Data: 16/10/2026. Base: commit `7803831`.

## 1. Escopo e método

- Leitura integral de `apps/web/src` (`App.tsx`, `ClassesPanel`, `MaterialsPanel`,
  `ActivitiesPanel`, `FeedbackPanel`, `BulletinsPanel`), `styles.css`,
  `index.html`, testes web e `tests/e2e/public-shell.spec.ts`.
- Contraste calculado pela fórmula WCAG 2.2 a partir das cores do CSS.
- **Limitação:** a aplicação não foi aberta no navegador. A demonstração exige
  PostgreSQL com seed; não iniciei banco nem toquei o `educai-dev`. Capturas de
  tela ficam para a Fase 2, com um banco local autorizado.
- Nenhum arquivo de código foi alterado.

Público-alvo considerado: professor da educação básica com pouca familiaridade
com tecnologia, muitas vezes no celular, com pouco tempo e sem treinamento.

## 2. Resumo executivo

A interface funciona como **painel de engenharia**, não como ferramenta do
professor. Os três problemas estruturais:

1. **Linguagem de desenvolvimento visível.** Marcas do plano ("Dia 2", "Dia 14
   de 14", "RF009"), nomes técnicos ("API", "OAuth", "tokens", "cookie
   HTTP-only", "reconciliação", "submissões") e valores internos crus
   (`google`, `draft`, `reading`, `email · pending`, códigos de erro como
   `GOOGLE_RATE_LIMITED`).
2. **Uma página única e longa, ordenada pelo plano de implementação.** São nove
   seções empilhadas, sem navegação e sem indicação do próximo passo. Criar,
   publicar e corrigir uma atividade acontece dentro de um só formulário de
   cerca de 900 linhas.
3. **Fluxos com IA longos e pouco claros.** Para obter uma sugestão, o
   professor precisa antes preencher manualmente tudo o que a IA deveria
   ajudar a escrever. Depois há 4 ou 5 botões encadeados ("Gerar", "Carregar no
   editor", "Confirmar revisão", "Aprovar versão", "Publicar") sem um caminho
   visível.

Há também **defeitos funcionais** que pesam na usabilidade: listas cortadas em 5
itens (o 6º plano não pode ser editado nem aprovado), ações irreversíveis sem
confirmação e campos de texto livre que precisam coincidir exatamente com o
catálogo da BNCC.

## 3. Inventário de texto interno ou técnico visível

### 3.1 Marcas do plano de implementação (remover)

| Local                     | Texto atual                                          |
| ------------------------- | ---------------------------------------------------- |
| `index.html:6-7`          | "Fundação local do EDUC.AI", "EDUC.AI - Fundação"    |
| `App.tsx:170`             | "Dia 2 · acesso do professor"                        |
| `App.tsx:202`             | "Limites desta etapa"                                |
| `App.tsx:221-222`         | "Dia 14 de 14", "Segurança · privacidade · operação" |
| `App.tsx:366`             | "Dia 5 · RF008 + RF010"                              |
| `App.tsx:637`             | "Dia 7 · RF009"                                      |
| `ClassesPanel.tsx:132`    | "Ciclo vertical · Etapa A"                           |
| `ActivitiesPanel.tsx:514` | "Dia 11 · RF012"                                     |
| `FeedbackPanel.tsx:182`   | "Dia 12 · RF013"                                     |
| `BulletinsPanel.tsx:139`  | "Dia 13 · RF014"                                     |

### 3.2 Jargão técnico (reescrever em linguagem da escola)

| Local                            | Texto atual                                                                       | Direção sugerida                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `App.tsx:88`                     | "Não foi possível consultar sua sessão na API local."                             | "Não conseguimos abrir o EDUC.AI. Verifique a internet e tente de novo."         |
| `App.tsx:151`                    | "Identidade Google"                                                               | remover                                                                          |
| `App.tsx:203-207`                | "Sessão protegida em cookie HTTP-only", "Tokens criptografados"                   | "Não vemos sua senha do Google. Nada é publicado sem você aprovar."              |
| `App.tsx:295-299`                | "Sessão autenticada", "identidade veio da sessão Google validada pela API…"       | remover                                                                          |
| `App.tsx:307-308, 959, 981`      | "Monitoramento técnico", "Google OAuth", "O monitor ainda não registrou um ciclo" | mostrar só quando houver problema: "O Google Sala de Aula está fora do ar agora" |
| `App.tsx:533-534, 574`           | "devolvido a rascunho", "rascunho manual", "aprovado explicitamente"              | "Plano salvo", "Plano aprovado"                                                  |
| `App.tsx:676, 795`               | "Vincule uma ementa", "Ementa e habilidades BNCC"                                 | "Escolha as habilidades da BNCC desta aula"                                      |
| `App.tsx:806, 825`               | `sourceLabel` ao lado de cada habilidade                                          | omitir ou mostrar em detalhe                                                     |
| `App.tsx:941`                    | "Modelo: {model} · origem: {origin}"                                              | remover                                                                          |
| `App.tsx:1015, 1020-1022`        | "Privacidade e LGPD", "Tokens nunca aparecem na exportação…"                      | "Seus dados": "Baixar uma cópia dos meus dados"                                  |
| `ClassesPanel.tsx:140, 143`      | "Importar Classroom", "sincronizadas"                                             | "Trazer minhas turmas do Google Sala de Aula"                                    |
| `ClassesPanel.tsx:174`           | "Nova turma local"                                                                | "Criar turma"                                                                    |
| `ClassesPanel.tsx:191`           | "Código de acesso" (sem explicação, mínimo 4 caracteres)                          | explicar para que serve ou gerar automaticamente                                 |
| `ClassesPanel.tsx:217, 244`      | "alunos sincronizados", "Sincronizar alunos"                                      | "Atualizar lista de alunos"                                                      |
| `ClassesPanel.tsx:250`           | "Perfil curricular EDUC.AI"                                                       | "O que esta turma estuda"                                                        |
| `MaterialsPanel.tsx:103, 127`    | "Arquivo privado"                                                                 | "Arquivo do computador"                                                          |
| `ActivitiesPanel.tsx:516`        | "Atividades assistidas e publicação Google"                                       | "Atividades"                                                                     |
| `ActivitiesPanel.tsx:715`        | "{model} · origem {origin}"                                                       | remover                                                                          |
| `ActivitiesPanel.tsx:393, 1013`  | "submissões"                                                                      | "respostas recebidas"                                                            |
| `ActivitiesPanel.tsx:398`        | "A repetição não duplicará respostas."                                            | "Você pode tentar de novo sem perder nada."                                      |
| `ActivitiesPanel.tsx:1026`       | "Aluno não reconciliado"                                                          | "Resposta sem aluno identificado"                                                |
| `ActivitiesPanel.tsx:1207`       | "A estrutura foi bloqueada após a publicação."                                    | "Atividade já enviada aos alunos; as questões não podem mais mudar."             |
| `ActivitiesPanel.tsx:1296, 1331` | "Reconciliação necessária", "resposta do Google foi ambígua… reconciliar"         | "O Google não confirmou o envio. Toque em Tentar de novo."                       |
| `ActivitiesPanel.tsx:1314`       | "Autorize os novos escopos de Forms e Classroom…"                                 | "Saia e entre de novo para permitir que o EDUC.AI publique no Google."           |
| `FeedbackPanel.tsx:202`          | "Aviso global"                                                                    | "Aviso para a turma toda"                                                        |
| `FeedbackPanel.tsx:333`          | "N anexos · N links · N eventos"                                                  | remover "eventos"                                                                |
| `FeedbackPanel.tsx:434`          | "Comunicação excluída logicamente."                                               | "Mensagem excluída."                                                             |
| `BulletinsPanel.tsx:126, 128`    | "a tentativa foi preservada", "O PDF foi preservado"                              | "Boletim enviado." / "Não foi possível enviar. Tente de novo."                   |
| `BulletinsPanel.tsx:245, 249`    | "Somente desempenho abaixo do limiar", "Limiar"                                   | "Só alunos com média abaixo de…"                                                 |

### 3.3 Valores internos exibidos crus

| Local                      | O que aparece                                       |
| -------------------------- | --------------------------------------------------- |
| `App.tsx:390`              | tipo do marco (`milestone.type`) sem tradução       |
| `App.tsx:656`              | "Estado: draft / generated / approved"              |
| `ClassesPanel.tsx:157`     | "Origem: google / local"                            |
| `ClassesPanel.tsx:41`      | mensagem de erro da API repassada sem tratamento    |
| `MaterialsPanel.tsx:200`   | categoria `reading`, `presentation`, `video`…       |
| `ActivitiesPanel.tsx:718`  | `generation.errorCode` cru                          |
| `ActivitiesPanel.tsx:1018` | `collection.lastErrorCode` cru                      |
| `ActivitiesPanel.tsx:1324` | "Falha externa: {CÓDIGO}" para códigos não mapeados |
| `FeedbackPanel.tsx:338`    | "Notificação: email · pending"                      |
| `BulletinsPanel.tsx:292`   | datas no formato `2026-10-01`                       |
| `BulletinsPanel.tsx:298`   | `bulletin.lastErrorCode` cru                        |

### 3.4 Textos padrão escritos pelo sistema em nome do professor

`ActivitiesPanel.tsx:79, 456, 458` grava "Revisão docente." e "Correção
discursiva revisada pelo professor." como comentário quando o campo fica
vazio. `FeedbackPanel.tsx:154` faz o mesmo com "Sugestão revisada pelo
professor.". O aluno ou o histórico pode receber um texto que o professor não
escreveu. Isso precisa de decisão (ver item 8).

## 4. Telas atuais × tarefas do professor

### 4.1 Estrutura atual

Após o login, tudo fica numa única página, nesta ordem (`App.tsx:292-347`):

1. Saudação com explicação técnica da sessão
2. "Serviços Google" (monitoramento)
3. Turmas e alunos
4. Linha do tempo + Materiais
5. Planos de aula
6. Atividades, publicação, coleta **e** correção
7. Feedbacks e avisos
8. Boletins
9. Privacidade

Não há menu, rotas, âncoras nem indicação de onde o professor parou. No
celular, isso vira uma rolagem muito longa. A ordem segue o plano de 14 dias,
não a rotina da semana.

### 4.2 Atrito por tarefa

| Tarefa do professor       | Caminho atual                                                                                                                                                                                                                    | Problemas                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trazer turmas do Google   | "Importar Classroom" → "Abrir turma" → preencher etapa/ano/componentes → salvar → "Sincronizar alunos"                                                                                                                           | 5 passos sem guia. Componentes digitados separados por vírgula. Nada avisa que, sem esse perfil, a BNCC não aparece no plano.                                                |
| Planejar uma aula com IA  | Preencher **todos** os campos obrigatórios (objetivos, conteúdos, metodologia, avaliação) → salvar → "Gerar sugestão" → editar → "Revisar e aplicar" → "Aprovar plano"                                                           | A IA só ajuda depois que o professor já escreveu tudo (`App.tsx:742-773` com `required`). A sugestão aparece no fim da seção, longe do botão.                                |
| Escolher habilidades BNCC | Selecionar ementa → marcar caixas                                                                                                                                                                                                | Lista aparece só se ano e componente baterem exatamente com o catálogo (`curriculum/repository.ts:52-53`). Se não baterem, a lista fica vazia sem explicação.                |
| Criar atividade com IA    | Escolher plano aprovado, preencher título, descrição e prazo → "Criar rascunho" → achar na lista → "Editar e revisar" → "Gerar sugestão" → "Carregar no editor" → "Confirmar revisão" → "Aprovar versão" → "Publicar" (na lista) | ~9 ações espalhadas entre a lista e o formulário. Os nomes "Carregar no editor" e "Confirmar revisão" não dizem o resultado. O assistente só aparece após salvar o rascunho. |
| Publicar no Google        | Botão "Publicar" na lista                                                                                                                                                                                                        | Sem confirmação, embora envie aos alunos. Aparece mesmo quando a versão ainda não foi aprovada; o erro só vem depois.                                                        |
| Corrigir respostas        | Abrir atividade → rolar até o fim do formulário → "Coletar respostas" → por aluno: "Sugerir com IA" → ajustar → "Salvar revisão" → "Aprovar nota" → "Liberar"                                                                    | Correção mora dentro do formulário de edição. São 4 cliques por aluno, sem ação em lote, sem fila "falta corrigir" e sem contador de progresso.                              |
| Enviar feedback           | Criar → depois, no histórico, "Gerar com IA" → "Revisar sugestão" → "Enviar"                                                                                                                                                     | Criação e edição acontecem em lugares diferentes. "Enviar" e "Excluir" não pedem confirmação.                                                                                |
| Gerar boletim             | Turma → `select multiple` de alunos → período → datas → título → "Gerar PDF" → "Enviar"                                                                                                                                          | `select multiple` exige Ctrl+clique no computador e é confuso no celular. "Enviar" manda e-mail sem confirmação.                                                             |

### 4.3 Conteúdo escondido

- `App.tsx:378` mostra só os 5 primeiros marcos.
- `App.tsx:649` mostra só os 5 primeiros planos. **A partir do 6º plano não há
  como editar, gerar sugestão ou aprovar pela interface.**
- `MaterialsPanel.tsx:191` mostra só os 5 primeiros materiais.

Nenhuma dessas listas tem "ver todos", busca ou paginação.

## 5. Acessibilidade (WCAG 2.2 AA)

| ID   | Critério                   | Achado                                                                                                                                                                                         | Evidência                                                                              |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A-01 | 1.4.3 Contraste            | Texto `#6b827d` tem 4,11:1 sobre branco e 3,82:1 sobre o fundo `#f2f8f6`. Mínimo: 4,5:1. É a cor dos textos auxiliares e dos estados vazios.                                                   | `styles.css:165, 550, 666`                                                             |
| A-02 | 1.4.11 / 2.4.13 Foco       | O anel de foco dos botões (`#8ae4d1`) tem 1,39:1 sobre o fundo claro. Mínimo: 3:1. Quem navega por teclado não vê onde está.                                                                   | `styles.css:71-73`                                                                     |
| A-03 | 2.4.1 Pular blocos         | O link "Ir para o conteúdo principal" aponta para `#main-content`, que é o próprio `<main>` onde ele está, antes do cabeçalho. O salto não pula nada.                                          | `App.tsx:131-133`                                                                      |
| A-04 | 1.4.4 / legibilidade       | Rótulos de seção em 0,78rem, maiúsculas e espaçamento largo; botões compactos em 0,82rem. Pequeno para o público-alvo.                                                                         | `styles.css:198-203, 303-308`                                                          |
| A-05 | 3.3.2 Rótulos e instruções | Campos obrigatórios não são marcados. O botão fica desabilitado sem dizer o que falta (ex.: "Criar turma" exige código com 4+ caracteres).                                                     | `ClassesPanel.tsx:198-205`                                                             |
| A-06 | 3.3.1 / 3.3.3 Erros        | Erros genéricos ("Revise o tipo, o prazo, as questões e todos os campos obrigatórios") não apontam o campo nem dão sugestão. Nenhum campo recebe `aria-invalid`.                               | `ActivitiesPanel.tsx:243-245`                                                          |
| A-07 | 3.3.4 Prevenção de erros   | Publicar atividade, arquivar, enviar feedback, excluir feedback e enviar boletim são ações externas ou irreversíveis sem confirmação. Só a exclusão de conta confirma, e por `window.confirm`. | `ActivitiesPanel.tsx:571, 590`; `FeedbackPanel.tsx:384, 396`; `BulletinsPanel.tsx:316` |
| A-08 | 4.1.3 Mensagens de status  | Cada painel tem uma única mensagem `role="status"`, muitas vezes no fim de um formulário longo. No celular, o resultado da ação fica fora da tela.                                             | ex.: `ActivitiesPanel.tsx:1209`                                                        |
| A-09 | 1.3.1 Estrutura            | Cada seção tem `h2`, mas não há `nav` nem marcos que permitam saltar entre seções. Botões de lista repetem o mesmo nome ("Editar plano", "Publicar") sem dizer de qual item.                   | `App.tsx:657-664`; `ActivitiesPanel.tsx:557-593`                                       |
| A-10 | 2.5.8 Tamanho do alvo      | Botões têm 44 px de altura. Radios e checkboxes usam o tamanho nativo (~13 px), e o rótulo não é a área de toque principal na escolha do gabarito.                                             | `ActivitiesPanel.tsx:849-878`                                                          |
| A-11 | Controles                  | `select multiple` para escolher alunos.                                                                                                                                                        | `BulletinsPanel.tsx:165-181`                                                           |
| A-12 | Estado desabilitado        | Botão desabilitado usa `cursor: wait`, sugerindo carregamento quando na verdade falta preencher algo.                                                                                          | `styles.css:76-79`                                                                     |
| A-13 | Títulos de página          | O título da aba é sempre "EDUC.AI - Fundação".                                                                                                                                                 | `index.html:7`                                                                         |

Pontos positivos já existentes: `lang="pt-BR"`, rótulos `<label>` envolvendo
os campos, `aria-labelledby` nas seções, `role="alert"` nos erros de login,
botões com 44 px de altura, layout responsivo com breakpoints em 640 e 1024 px.

## 6. Estados de carregamento, vazio e erro

| Painel      | Carregando                | Vazio                                         | Erro                                                                       |
| ----------- | ------------------------- | --------------------------------------------- | -------------------------------------------------------------------------- |
| Sessão      | "Carregando sua sessão…"  | n/a                                           | genérico, com "Tentar novamente"                                           |
| Turmas      | nenhum                    | "Nenhuma turma cadastrada." sem próximo passo | erro da API repassado cru                                                  |
| Materiais   | nenhum (falha silenciosa) | "Nenhum material cadastrado."                 | silencioso no carregamento (`App.tsx:253`)                                 |
| Planos      | nenhum (falha silenciosa) | "Nenhum plano criado."                        | silencioso no carregamento (`App.tsx:262`)                                 |
| Atividades  | nenhum                    | "Nenhuma atividade neste filtro."             | mensagem única                                                             |
| Feedbacks   | nenhum                    | "Nenhum feedback ou aviso criado."            | mensagem única                                                             |
| Boletins    | nenhum                    | "Nenhum boletim gerado."                      | código cru                                                                 |
| Privacidade | "Excluindo…"              | n/a                                           | **sem tratamento**: falha na exclusão não mostra nada (`App.tsx:997-1008`) |

Nenhum estado vazio orienta o próximo passo (ex.: "Você ainda não tem turmas.
Comece trazendo suas turmas do Google Sala de Aula.").

## 7. Problemas priorizados

| ID    | Prioridade | Problema                                                                                | Seção                        |
| ----- | ---------- | --------------------------------------------------------------------------------------- | ---------------------------- |
| UI-01 | P0         | Marcas do plano ("Dia N", "RFxxx", "Fundação") visíveis ao professor                    | 3.1                          |
| UI-02 | P0         | Planos, materiais e marcos a partir do 6º ficam inacessíveis                            | 4.3                          |
| UI-03 | P0         | Publicar, enviar e excluir sem confirmação                                              | A-07                         |
| UI-04 | P0         | Página única sem navegação, ordenada pelo plano técnico                                 | 4.1                          |
| UI-05 | P0         | Foco invisível nos botões e contraste insuficiente em textos auxiliares                 | A-01, A-02                   |
| UI-06 | P1         | IA do plano só funciona depois do preenchimento manual completo                         | 4.2                          |
| UI-07 | P1         | Fluxo de IA da atividade com ~9 ações e nomes que não dizem o resultado                 | 4.2                          |
| UI-08 | P1         | Correção embutida no formulário de edição, sem fila nem ação em lote                    | 4.2                          |
| UI-09 | P1         | Jargão técnico e valores internos crus                                                  | 3.2, 3.3                     |
| UI-10 | P1         | Componente curricular e ano digitados livremente precisam coincidir com o catálogo BNCC | 4.2                          |
| UI-11 | P1         | Erros sem indicação do campo e do que fazer                                             | A-05, A-06                   |
| UI-12 | P1         | Textos padrão gravados em nome do professor                                             | 3.4                          |
| UI-13 | P2         | Estados vazios sem próximo passo; falhas de carregamento silenciosas                    | 6                            |
| UI-14 | P2         | `select multiple` de alunos; radios e checkboxes pequenos                               | A-10, A-11                   |
| UI-15 | P2         | Link de pular conteúdo ineficaz; título da aba fixo                                     | A-03, A-13                   |
| UI-16 | P2         | `MaterialsPanel` usa `/api` fixo em vez de `VITE_API_BASE_URL`                          | `MaterialsPanel.tsx:54, 194` |

## 8. Pendências e decisões

### Para você decidir

1. **Textos padrão (UI-12):** o comentário de correção e a observação de
   feedback podem ficar vazios, ou devem ser obrigatórios?
2. **Monitoramento do Google:** o painel "Serviços Google" deve sumir e virar
   um aviso que só aparece quando algo está fora do ar?
3. **Código de acesso da turma:** o professor precisa escolher esse código ou o
   sistema pode gerá-lo?
4. **Público e dispositivo principal:** priorizamos o celular ou o computador
   da escola?

### Para o Codex (backend)

- **IA no plano sem preenchimento manual (UI-06):** hoje a geração parte de um
  plano salvo e o formulário exige objetivos, conteúdos, metodologia e
  avaliação. Verificar se a API aceita gerar a partir de um rascunho com só
  turma, componente, habilidades e tema. Se não aceitar, é mudança de backend.
- **Catálogo para seleção (UI-10):** um endpoint que liste os componentes e
  anos existentes na BNCC permitiria trocar texto livre por listas de escolha.
- **Mensagens de erro:** os códigos (`GOOGLE_*`, `EMAIL_*`, `OPENAI_*`)
  precisam de um catálogo único compartilhado em `packages/contracts` para a
  interface traduzir todos, sem "Falha externa: CÓDIGO".
- **Ações em lote na correção (UI-08):** aprovar e liberar várias notas de uma
  vez exige endpoint novo ou chamadas em sequência pela interface.

## 9. Impacto em testes

28 asserções web e E2E dependem de texto visível. As que mudarão com o
redesenho incluem "Boletins e envio" e "Seus dados" (`public-shell.spec.ts:65-67`).
Nenhum teste atual verifica a ausência de marcas internas; a Fase 3 deve
adicionar esse teste.

## 10. Próximo passo

Fase 2 (proposta), após sua aprovação deste diagnóstico:

1. navegação por tarefas e vocabulário da escola;
2. guia de linguagem e de mensagens de erro;
3. protótipo navegável em HTML;
4. ordem de refatoração tela a tela, começando pelos P0.
