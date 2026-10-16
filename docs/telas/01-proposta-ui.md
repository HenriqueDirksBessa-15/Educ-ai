# Proposta de redesenho da interface do professor

Fase 2 do redesenho. Data: 16/10/2026. Base: diagnóstico
[`00-diagnostico-ui.md`](./00-diagnostico-ui.md) (commit `50dcb27`).
Protótipo navegável: [`prototipo-ui.html`](./prototipo-ui.html).

## 1. Decisões já tomadas

| ID    | Decisão                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------- |
| DU-01 | Comentário de correção e observação de feedback podem ficar vazios; nada é gravado em nome do professor |
| DU-02 | O painel "Serviços Google" sai da tela; um aviso aparece só quando algum serviço estiver fora do ar     |
| DU-03 | O código de acesso da turma é gerado automaticamente e pode ser trocado pelo professor                  |
| DU-04 | Celular e computador têm o mesmo peso: navegação inferior no celular, lateral no computador             |
| DU-06 | Cada turma tem uma única matéria; ela e o ano definem a BNCC usada nos planos                           |
| DU-05 | Navegação por roteador próprio baseado em `hash`, sem nova biblioteca                                   |

## 2. Princípios

1. **Uma tela, uma tarefa.** Cada tela responde "o que eu faço aqui?" no título
   e tem um botão principal.
2. **Sempre um próximo passo.** Estados vazios, mensagens de sucesso e o
   Início apontam a próxima ação.
3. **A IA ajuda, o professor decide.** Toda sugestão chega como rascunho
   editável e só vale depois de um botão de aprovação com nome claro.
4. **Nada vai para o aluno sem confirmação.** Publicar, enviar e devolver nota
   abrem uma confirmação que diz para quem vai e o que acontece.
5. **Linguagem da escola.** Sem siglas, códigos ou termos de sistema.

## 3. Navegação por tarefas

| Item no menu    | O que reúne hoje                              | Tarefa principal                       |
| --------------- | --------------------------------------------- | -------------------------------------- |
| **Início**      | (novo)                                        | Ver o que precisa de atenção agora     |
| **Turmas**      | Turmas e alunos, perfil curricular            | Trazer turmas do Google e ver alunos   |
| **Aulas**       | Planos de aula, materiais, linha do tempo     | Planejar uma aula                      |
| **Atividades**  | Criação, IA, publicação                       | Criar e enviar uma atividade           |
| **Correções**   | Coleta e correção (hoje dentro de Atividades) | Corrigir e devolver notas              |
| **Recados**     | Feedbacks e avisos                            | Mandar um recado a um aluno ou à turma |
| **Boletins**    | Boletins e envio                              | Gerar e enviar boletins                |
| **Minha conta** | Perfil, privacidade, sair                     | Baixar meus dados, sair                |

- **Celular:** barra inferior com Início, Turmas, Aulas, Atividades e Correções;
  "Mais" abre Recados, Boletins e Minha conta.
- **Computador:** menu lateral fixo, com altura da tela:
  - no topo, a marca e o botão **+ Criar**, que leva à página "O que você quer
    criar?" com **Nova atividade**, **Novo plano de aula** e **Nova turma**
    (no celular, o mesmo botão fica no topo de "Mais");
  - **Início** sozinho, seguido dos grupos **Sala de aula** (Turmas, Aulas,
    Atividades, Correções) e **Comunicação** (Recados, Boletins);
  - cada item tem ícone, nome e uma linha curta que explica para que serve
    ("Notas para dar", "Planos e materiais");
  - contadores do que espera o professor (correções a fazer, planos a
    aprovar), com texto para leitores de tela;
  - item atual destacado por fundo, negrito e barra à esquerda (não só cor);
  - no rodapé, um único cartão com foto (iniciais), nome e e-mail de quem
    está conectado; clicar nele abre **Minha conta**.
- Cada item tem endereço próprio (ex.: `#/correcoes`), para o botão Voltar do
  navegador funcionar e o título da aba mudar.
- **Roteamento sem nova biblioteca (DU-05):** um roteador simples por `hash`
  dentro do próprio `apps/web`.

### Início

Lista curta de pendências com um botão cada, calculada a partir dos dados que a
interface já carrega:

- "3 respostas esperando correção em _Frações – exercício 1_" → Corrigir
- "Plano _Sistema solar_ aguardando sua aprovação" → Revisar
- "A turma _7º B_ ainda não tem matéria definida" → Definir
- "Atividade _Leitura_ fecha amanhã às 23h"

Sem pendências: "Tudo em dia. Que tal planejar a próxima aula?" → Planejar aula.

## 4. Fluxos redesenhados

### 4.1 Turmas

- Botão principal: **Trazer minhas turmas do Google Sala de Aula**.
- Secundário: **Criar turma no EDUC.AI**, que abre a página **Nova turma**
  (nome, ano, matéria e código gerado, DU-03). A mesma página é aberta por
  **+ Criar → Nova turma**.
- Detalhe da turma: alunos, botão **Atualizar lista de alunos** e o bloco
  **O que esta turma estuda** com etapa, ano e **uma** matéria escolhidos em listas,
  nunca digitados (depende de B-02 para os valores do catálogo). É esse bloco
  que define a BNCC usada em todos os planos da turma.
- **Cada turma tem uma única matéria (DU-06).** Turma sem matéria definida
  mostra o aviso: "Defina a matéria para ver as habilidades da BNCC ao
  planejar."

### 4.2 Aulas: Planejar aula (assistente em 4 passos)

1. **Turma e tema**: turma, tema da aula e duração. A BNCC já está vinculada à
   matéria e ao ano da turma: o passo só mostra "Matemática · 7º ano" como
   informação. Matéria, ano e ementa nunca são perguntados no plano.
2. **Habilidades da BNCC**: já filtradas pela matéria e pelo ano da turma, com
   código e descrição, busca por palavra e caixas grandes. Um link **Mudar na
   turma** leva ao perfil da turma, que é o único lugar onde matéria e ano se
   alteram.
3. **Materiais**: escolher da turma ou adicionar um novo ali mesmo (link ou
   arquivo do computador).
4. **Conteúdo da aula**: dois botões lado a lado, **Escrever eu mesmo** e
   **Pedir sugestão à IA**. A sugestão preenche os campos para edição. Ao
   final, **Salvar rascunho** ou **Aprovar plano**.

A lista de planos mostra todos, com busca e etiqueta de situação (Rascunho,
Sugestão para revisar, Aprovado). **Depende de B-01**: hoje a API exige
objetivos, conteúdos, metodologia e avaliação preenchidos antes da sugestão.

### 4.3 Atividades: Criar atividade (assistente em 4 passos)

1. **Plano**: escolher um plano aprovado (se não houver, link para Planejar
   aula).
2. **Questões**: **Pedir questões à IA** (quantidade e tipo) ou **Escrever
   questões**. Por baixo, a interface cria o rascunho e chama a geração; o
   professor não vê "Carregar no editor" nem "Confirmar revisão".
3. **Revisar**: pré-visualização como o aluno verá, com o gabarito marcado;
   cada questão pode ser editada ou removida. Botão **Aprovar questões**
   (faz revisão e aprovação em sequência).
4. **Prazo e envio**: prazo, regra para atraso, e **Enviar para a turma**,
   que abre a confirmação: "Esta atividade será publicada no Google
   Formulários e aparecerá no Google Sala de Aula da turma 7º B. Depois de
   enviada, as questões não podem mais ser alteradas."

Sem dependência de backend: o contrato aceita rascunho sem questões.

### 4.4 Correções

- Lista de atividades com respostas, com contador "faltam 3 de 25".
- Ao abrir: fila de alunos. Objetivas já vêm corrigidas.
- Para cada resposta discursiva: resposta do aluno, resposta esperada,
  critérios, **Pedir sugestão à IA**, pontos e comentário (opcional, DU-01).
- Botões por aluno: **Salvar e ir para o próximo** e, quando todas estiverem
  revisadas, **Aprovar nota**.
- No topo: **Devolver notas aprovadas ao Google Sala de Aula (12)**, com
  confirmação. Por baixo, chama a liberação de cada aluno em sequência, com
  progresso e lista do que falhou (B-04 tornaria isso uma chamada única).

### 4.5 Recados

- **Novo recado** pergunta primeiro: "Para quem?" → **Um aluno** ou **A turma
  toda**. O formulário muda conforme a escolha:
  - **Um aluno:** primeiro a turma, depois o aluno (só os daquela turma com
    atividade corrigida), mensagem e **Pedir ajuda à IA**. Vai por e-mail, só
    para ele. O filtro por turma depende de B-06.
  - **A turma toda:** turma (com número de alunos), título do aviso,
    mensagem, link ou material opcional e **Pedir ajuda à IA**. Um lembrete
    avisa que todos verão o texto, então não se deve citar nota ou dado de um
    aluno. Vira aviso no mural da turma no Google Sala de Aula; se o Google
    falhar, o sistema envia por e-mail a cada aluno.
- **Enviar** abre confirmação dizendo o canal: "Será enviado por e-mail para
  Ana Souza" ou "Será publicado como aviso no Google Sala de Aula do 7º B".
- Histórico com situação em português (Rascunho, Enviado, Não enviado – tentar
  de novo).

### 4.6 Boletins

- Turma → período (Bimestre 1, 2…, ou datas) → alunos em **caixas de seleção**
  com "Selecionar todos".
- **Gerar boletins** → lista com **Ver PDF** e **Enviar por e-mail** (com
  confirmação mostrando o destinatário).

### 4.7 Minha conta

Nome, e-mail, **Baixar uma cópia dos meus dados**, **Sair** e, separado,
**Excluir minha conta** com confirmação digitada.

## 5. Guia de linguagem

### 5.1 Regras

- Falar com o professor por "você"; frases de até 20 palavras.
- Botões com verbo + objeto: "Enviar para a turma", não "Publicar".
- Nomes oficiais em português: **Google Sala de Aula**, **Google Formulários**.
- Nunca mostrar: códigos de erro, nomes de modelos de IA, "API", "OAuth",
  "token", "sessão", "sincronizar", "reconciliar", "submissão", "escopo",
  "fixture", "Dia N", "RFxxx".
- Datas por extenso curto: "16 de out., 14:00".

### 5.2 Glossário

| Termo atual                                             | Termo novo                           |
| ------------------------------------------------------- | ------------------------------------ |
| Importar Classroom / sincronizar                        | Trazer turmas do Google Sala de Aula |
| Sincronizar alunos                                      | Atualizar lista de alunos            |
| Perfil curricular                                       | O que esta turma estuda              |
| Componente curricular                                   | Matéria                              |
| Ementa                                                  | (oculto; escolhido automaticamente)  |
| Arquivo privado                                         | Arquivo do computador                |
| Rascunho manual                                         | Rascunho                             |
| Gerar sugestão                                          | Pedir sugestão à IA                  |
| Carregar no editor / Confirmar revisão / Aprovar versão | Aprovar questões                     |
| Publicar                                                | Enviar para a turma                  |
| Finalizar                                               | Encerrar respostas                   |
| Arquivar                                                | Guardar (sai da lista)               |
| Submissões                                              | Respostas                            |
| Coletar respostas                                       | Buscar respostas                     |
| Liberar                                                 | Devolver nota ao aluno               |
| Aviso global                                            | Aviso para a turma toda              |
| Feedback individual                                     | Recado para um aluno                 |
| Limiar                                                  | Média mínima                         |

### 5.3 Situações (substituem os valores internos)

| Valor interno                                | Texto                                             | Cor     |
| -------------------------------------------- | ------------------------------------------------- | ------- |
| `draft`                                      | Rascunho                                          | neutra  |
| `generated` (plano, atividade, recado)       | Sugestão para revisar                             | atenção |
| `reviewed`                                   | Revisado                                          | neutra  |
| `approved`                                   | Aprovado                                          | sucesso |
| `published`                                  | Enviada para a turma                              | sucesso |
| `finished`                                   | Respostas encerradas                              | neutra  |
| `manual_required` / `manual_review_required` | Precisa da sua correção                           | atenção |
| `released` / `returned`                      | Nota devolvida                                    | sucesso |
| `failed` (qualquer)                          | Não enviado – tentar de novo                      | erro    |
| `pending` (envio)                            | Enviando…                                         | neutra  |
| source `google` / `local`                    | Do Google Sala de Aula / Criada no EDUC.AI        | —       |
| categorias de material                       | Leitura, Apresentação, Vídeo, Imagem, Link, Outro | —       |
| tipos de marco                               | Aula, Avaliação, Evento, Prazo, Outro             | —       |

### 5.4 Mensagens de erro

Formato: **o que aconteceu** + **o que fazer** + botão quando houver ação.

| Código (grupo)                                           | Mensagem                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CREDENTIAL_MISSING`, `GOOGLE_RECONSENT_REQUIRED` | "Precisamos da sua permissão no Google de novo." [Entrar com Google]                                          |
| `GOOGLE_PERMISSION_DENIED`                               | "Sua conta do Google não pode publicar nesta turma. Confira se você é professor dela no Google Sala de Aula." |
| `GOOGLE_RATE_LIMITED`, `*_UNAVAILABLE`                   | "O Google está ocupado agora. Tente de novo em alguns minutos." [Tentar de novo]                              |
| `GOOGLE_CLASSROOM_ID_MISSING`                            | "Esta turma ainda não está no Google Sala de Aula." [Criar no Google Sala de Aula]                            |
| `GOOGLE_POINTS_MUST_BE_INTEGER`                          | "No Google Formulários, cada questão precisa valer um número inteiro de pontos."                              |
| `OPENAI_*`                                               | "A IA não conseguiu responder agora. Seu texto foi mantido. Tente de novo ou escreva você mesmo."             |
| `EMAIL_*`                                                | "O e-mail não foi enviado. O boletim está salvo; tente de novo mais tarde." [Tentar de novo]                  |
| sem conexão                                              | "Sem conexão com a internet. Seus dados não foram perdidos."                                                  |
| validação de formulário                                  | Mensagem junto ao campo: "Escreva o título da atividade."                                                     |
| desconhecido                                             | "Algo deu errado. Tente de novo; se continuar, fale com o suporte." (código só no console)                    |

## 6. Padrões visuais e de acessibilidade

| Item           | Especificação                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Texto          | 17 px no corpo, 16 px em rótulos, nada abaixo de 14 px; sem maiúsculas corridas                                                        |
| Cores          | texto `#15332f` (12,6:1); secundário `#4a605b` (6,2:1); primário `#0a6b5a` com texto branco (6,4:1); bordas de campo `#7d918c` (3,3:1) |
| Foco           | contorno de 3 px `#0b3d35` com afastamento de 2 px (11:1 sobre o fundo)                                                                |
| Alvos de toque | mínimo 48 × 48 px, incluindo caixas e opções de rádio (rótulo inteiro clicável)                                                        |
| Formulários    | obrigatório marcado no rótulo; erro junto ao campo com `aria-invalid` e `aria-describedby`                                             |
| Mensagens      | aviso perto da ação, com `role="status"`; foco movido para o título ao trocar de tela                                                  |
| Confirmações   | `<dialog>` nativo com foco preso e botão de cancelar à esquerda                                                                        |
| Listas         | todas completas, com busca a partir de 10 itens                                                                                        |
| Desabilitado   | botão desabilitado diz o que falta ("Escolha uma turma") e usa `cursor: not-allowed`                                                   |
| Pular conteúdo | link "Ir para o conteúdo" apontando para o `<main>` real, depois do menu                                                               |

## 7. Dependências do backend (para o Codex)

| ID   | Pedido                                                                                                                                             | Bloqueia                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| B-01 | Permitir rascunho de plano só com turma, matéria, tema e habilidades, e gerar sugestão a partir dele (hoje `lessonPlanInputSchema` exige 4 textos) | 4.2 passo 4                                   |
| B-02 | Endpoint com etapas, anos e matérias existentes no catálogo BNCC, para escolha em listas                                                           | 4.1 (perfil da turma)                         |
| B-03 | Catálogo de códigos de erro exportado em `packages/contracts`                                                                                      | 5.4 (a interface pode começar com mapa local) |
| B-04 | Devolver várias notas em uma chamada (opcional; a interface faz em sequência)                                                                      | 4.4                                           |
| B-05 | Limitar o perfil curricular da turma a uma matéria (`curricularComponents` hoje é lista); a interface já envia só uma                              | 4.1 (opcional)                                |
| B-06 | Incluir turma (`classId`, `className`) em `GET /api/feedbacks/eligible-submissions`, para filtrar alunos por turma no recado                       | 4.5                                           |

## 8. Ordem de implementação (Fase 3)

Cada item vira `docs/telas/NN-nome.md`, testes primeiro e um commit.

| Ordem | Etapa                                                                                                              | Resolve                                       | Depende de           |
| ----- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | -------------------- |
| 02    | Base: casca, menu, roteador, cores, foco, textos de situação e erro, remover marcas, listas completas, confirmação | UI-01, 02, 04, 05, 09, 13, 15, 16             | —                    |
| 03    | Entrada e Início                                                                                                   | login sem jargão, pendências, aviso do Google | 02                   |
| 04    | Turmas                                                                                                             | UI-10 (parcial), DU-03                        | 02; B-02 para listas |
| 05    | Atividades                                                                                                         | UI-03, UI-07                                  | 02                   |
| 06    | Correções                                                                                                          | UI-08, UI-12                                  | 05                   |
| 07    | Aulas                                                                                                              | UI-06                                         | 02, 04; B-01         |
| 08    | Recados                                                                                                            | UI-03, UI-12                                  | 02; B-06             |
| 09    | Boletins                                                                                                           | UI-03, UI-14                                  | 02                   |
| 10    | Minha conta                                                                                                        | erro na exclusão de conta                     | 02                   |

Aulas fica depois de Atividades e Correções porque depende de duas mudanças de
backend; as outras telas não esperam o Codex.

## 9. Aprovação

Proposta, protótipo e ordem de implementação aprovados em 16/10/2026, com
roteador próprio por `hash` (DU-05).
