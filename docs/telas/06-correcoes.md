# Etapa 06 — Correções

Referências: [proposta](./01-proposta-ui.md) (seção 4.4, DU-01),
[protótipo](./prototipo-ui.html) (Correções e correção por aluno) e
[etapa 05](./05-atividades.md).

## Objetivo do professor

Saber quantas respostas faltam corrigir, corrigir uma de cada vez com a
resposta esperada à vista, aprovar a nota e devolver as notas aos alunos de
uma vez. Hoje a correção fica no fim do formulário de edição da atividade,
com 4 cliques por aluno e sem fila.

## Regras da API que orientam o desenho

- Buscar respostas (`/collect`) só funciona depois do prazo ou com as
  respostas encerradas; repetir não duplica.
- Questões de múltipla escolha já vêm corrigidas.
- Resposta escrita: `PATCH /correction` grava pontos e comentário de cada
  resposta e um comentário geral; depois `approve` calcula a nota
  (soma dos pontos ÷ total × 10).
- Só objetivas: `approve` direto.
- `release` devolve a nota ao Google Sala de Aula; se o Google falhar, a nota
  continua aprovada e pode ser devolvida de novo; repetir é seguro.
- A IA sugere pontos e comentário (`/corrections/suggest`), sem mudar a nota.

## Decisão desta etapa

DU-01 dizia que o comentário pode ficar vazio, mas a API exige texto no
comentário de cada resposta escrita e no comentário geral. Por decisão de
16/10/2026, **o comentário fica obrigatório por enquanto** e nada é gravado em
nome do professor (a tela antiga gravava "Revisão docente."). Pedido ao Codex
(B-07): aceitar comentários vazios; então o campo volta a ser opcional.

## Escopo

Inclui:

- endereços `#/correcoes` e `#/correcoes/{atividade}`;
- **lista:** atividades enviadas ou encerradas com barra de progresso
  ("22 de 25 corrigidas") e **Corrigir {atividade}**;
- **fila da atividade:** **Buscar respostas**; grupos "Falta corrigir",
  "Aprovadas" e "Devolvidas" com contagem; **Devolver N notas aprovadas** com
  confirmação, devolvendo uma a uma e listando as que falharem;
- **correção de um aluno:** questões objetivas com certa/errada e pontos;
  respostas escritas com enunciado, resposta do aluno, resposta esperada e
  critério; **Pedir sugestão à IA** e **Usar sugestão**; pontos (0 até o
  máximo) e comentário; comentário geral; prévia da nota final; **Aprovar
  nota e ir para o próximo**, **Pular**; nota aprovada com **Devolver nota**
  (confirmação);
- respostas sem aluno identificado aparecem com o motivo, sem esconder;
- o menu Correções e as pendências do Início passam a apontar para esta tela;
  o painel antigo de atividades deixa de ser usado.

Não inclui: identificar manualmente o aluno de uma resposta sem e-mail,
mudanças de backend.

## Testes antes do código

- `corrections.test.ts`: grupos da fila, progresso, próximo pendente,
  validação de pontos e comentários, prévia da nota.
- `CorrectionsPages.test.tsx`: lista com progresso e link; buscar respostas e
  mensagem antes do prazo; corrigir uma resposta escrita (salva revisão com
  pontos e comentários, aprova e passa ao próximo); objetiva aprova direto;
  sugestão da IA preenche os campos sem salvar; campos obrigatórios; devolver
  em lote com confirmação e relato de falha; nenhum identificador do
  professor enviado.

## Aceite

- [x] Corrigir uma resposta escrita leva 1 botão depois de preencher.
- [x] Nenhum texto é gravado em nome do professor.
- [x] Devolver notas aos alunos sempre pede confirmação.
- [x] Testes web e build aprovados.

## Resultado

Concluída em 16/10/2026.

- Testes web: 99 aprovados (eram 87): 6 das regras da fila e da correção e
  8 das telas (lista com progresso, correção escrita com aprovação e avanço,
  objetiva direta, campos obrigatórios, sugestão da IA sem salvar, busca antes
  do prazo, devolução em lote com falha, resposta sem aluno identificado).
  Todos escritos antes do código. Os 2 testes do painel antigo saíram com
  ele.
- Abrir a correção de um aluno leva o foco ao nome dele (testado).
- Typecheck e build do web, lint, formatação e 17 testes de contratos
  aprovados. O `npm run check` completo segue bloqueado pelas alterações em
  andamento da API, fora desta etapa.
- Conferência no navegador com API fictícia local, no computador e no
  celular, sem rolagem lateral e com controles de pelo menos 44 px.
- O painel antigo de atividades (`ActivitiesPanel`) foi removido; o
  acompanhamento da atividade enviada agora leva direto à fila de correção.

## Pendências para o Codex (backend)

- **B-07:** aceitar comentário vazio por resposta e no comentário geral
  (`discursiveAnswerReviewSchema` e `submissionCorrectionReviewSchema`), para
  cumprir DU-01. Depois disso, os campos voltam a ser opcionais.
- Uma resposta sem e-mail do aluno não pode ser associada a um aluno pela
  interface; hoje ela só aparece com o motivo.
