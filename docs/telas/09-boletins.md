# Etapa 09 — Boletins

Referências: [proposta](./01-proposta-ui.md) (seção 4.6, UI-14),
[protótipo](./prototipo-ui.html) (Boletins) e [etapa 08](./08-recados.md).

## Objetivo do professor

Gerar os boletins de uma turma para um período sem decorar datas, escolher os
alunos com caixas simples e enviar por e-mail sabendo para qual endereço vai
cada um. Hoje a escolha de alunos usa uma lista de seleção múltipla (Ctrl+clique),
as datas aparecem como `2026-10-01`, o envio não pede confirmação e é preciso
enviar um a um.

## Regras da API que orientam o desenho

- Alunos elegíveis vêm de `/bulletins/eligible-students`, já com turma e
  e-mail.
- Gerar exige turma, ao menos um aluno, tipo de período, início, fim (fim não
  antes do início) e título; comentário é opcional; o filtro "abaixo da
  média" exige a média mínima.
- Sem notas aprovadas no período, ou sem aluno abaixo da média, a API responde
  `VALIDATION_ERROR` (409) para os dois casos.
- O PDF é imutável; cada envio é uma nova tentativa e pode ser repetido.

## Escopo

Inclui:

- **gerar:** turma; tipo de período que já preenche início e fim (mês,
  bimestre, trimestre ou ano atuais; "datas escolhidas" deixa livre); título
  sugerido; comentário opcional para todos; alunos em **caixas de seleção** com
  **Selecionar todos (N)**, todos marcados ao escolher a turma; filtro opcional
  "só alunos com média abaixo de"; **Gerar boletins**;
- **gerados:** aluno, média, turma, período em datas brasileiras, situação em
  português, **Ver PDF de {aluno}**, **Enviar por e-mail** (ou **Enviar de
  novo**) com confirmação mostrando o e-mail do aluno;
- **Enviar N boletins ainda não enviados** em lote, com confirmação e relato
  dos que falharem;
- campos com erro ao lado.

Não inclui: calendário escolar próprio (os períodos usam o ano civil),
mudanças de backend.

## Testes antes do código

- `bulletins.test.ts`: períodos (mês, bimestre, trimestre, ano, datas
  escolhidas), turmas a partir dos alunos, validação, boletins pendentes de
  envio.
- `BulletinsPage.test.tsx`: gerar para a turma inteira com período
  preenchido; desmarcar alunos; filtro de média; sem notas no período;
  campos obrigatórios; enviar um com confirmação mostrando o e-mail; cancelar
  não envia; enviar em lote com relato de falha; datas e situações em
  português; nenhum identificador do professor enviado.

## Aceite

- [x] Nenhuma seleção múltipla com Ctrl; caixas com pelo menos 44 px.
- [x] Período preenchido sem o professor digitar datas.
- [x] Todo envio mostra o destinatário e pede confirmação.
- [x] Testes web e build aprovados.

## Resultado

Concluída em 16/10/2026.

- Testes web: 128 aprovados (eram 114), estáveis em execuções repetidas: 7
  das regras (períodos, turmas, validação, pendentes de envio) e 7 da tela.
  Todos escritos antes do código.
- O painel antigo (`BulletinsPanel`) foi removido; com ele saiu o
  carregamento sob demanda, que não é mais necessário.
- Ajuste após conferência no navegador: o subtítulo dizia "notas já
  devolvidas", mas o boletim usa as notas aprovadas.
- Typecheck e build do web, lint, formatação e 17 testes de contratos
  aprovados. O `npm run check` completo segue bloqueado pelas alterações em
  andamento da API, fora desta etapa.
- Conferência no navegador com API fictícia local, no computador e no
  celular, sem rolagem lateral e com controles de pelo menos 44 px.

## Pendências para o Codex (backend)

- "Sem notas no período" e "ninguém abaixo da média" voltam com o mesmo
  código (`VALIDATION_ERROR`); códigos próprios permitiriam mensagens
  específicas.

Limpeza futura no web: o componente de mensagem de retorno está repetido em
quatro telas e pode virar um componente comum.
