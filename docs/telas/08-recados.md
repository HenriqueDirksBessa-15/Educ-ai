# Etapa 08 — Recados

Referências: [proposta](./01-proposta-ui.md) (seção 4.5, B-06),
[protótipo](./prototipo-ui.html) (Recados) e [etapa 06](./06-correcoes.md).

## Objetivo do professor

Mandar um recado para um aluno ou um aviso para a turma toda sabendo, antes
de enviar, quem vai receber e por onde. Hoje a criação e a edição ficam em
lugares diferentes, "Enviar" e "Excluir" não pedem confirmação e o histórico
mostra valores internos.

## Regras da API que orientam o desenho

- Recado individual nasce de uma resposta já corrigida
  (`/feedbacks/eligible-submissions`) e vai por e-mail; aviso para a turma
  vira aviso no Google Sala de Aula (ou e-mail aos alunos se o Google
  falhar).
- Título e mensagem são obrigatórios; link e material são opcionais.
- A IA só funciona sobre um recado já salvo (`/generate`) e devolve uma
  sugestão; o recado fica "aguardando revisão".
- Revisar pelo caminho próprio (`/review`) exige uma observação do professor
  preenchida. **Editar o texto** (`PATCH`) devolve o recado a rascunho, e
  rascunho pode ser enviado.
- Editar e excluir só valem dentro do prazo de alteração; enviar de novo não
  cria outro envio.

## Decisões desta etapa

- A IA só preenche o campo de mensagem; o professor edita e, ao salvar ou
  enviar, o EDUC.AI grava **o texto do professor** (`PATCH`) antes de enviar.
  A sugestão continua no histórico do recado. Assim nada é gravado em nome do
  professor e a observação interna não é exigida (DU-01).
- Sem o B-06 (turma de cada aluno elegível), não há filtro por turma; a lista
  de alunos é agrupada pela atividade corrigida. O filtro entra quando o
  backend devolver a turma.

## Escopo

Inclui:

- **novo recado:** "Para quem?" (um aluno ou a turma toda); para um aluno,
  lista agrupada por atividade com a nota; para a turma, a turma; título já
  sugerido e editável; mensagem; link e material opcionais; lembrete de que o
  aviso é visto por todos; **Pedir ajuda à IA**, **Salvar rascunho** e
  **Enviar recado** com confirmação dizendo o canal e o destinatário;
- **recados anteriores:** destinatário, situação em português (incluindo a
  entrega: enviando, enviado por e-mail, publicado no Google Sala de Aula, não
  enviado), **Continuar** para rascunhos e **Excluir** com confirmação;
- campos com erro ao lado, mensagens sem código.

Não inclui: filtro de alunos por turma (B-06), reenvio manual de entrega que
falhou (a fila do servidor já repete sozinha), mudanças de backend.

## Testes antes do código

- `messages.test.ts`: situação e entrega do recado, destinatário,
  agrupamento de alunos por atividade, título sugerido, validação, texto da
  confirmação por canal.
- `MessagesPage.test.tsx`: recado individual enviado após confirmação;
  aviso para a turma com lembrete; cancelar não envia; IA preenche a mensagem
  e o envio grava o texto editado antes de enviar; campos obrigatórios;
  continuar um rascunho; excluir com confirmação; histórico sem valores
  internos; nenhum identificador do professor enviado.

## Aceite

- [x] Antes de enviar, o professor sabe quem recebe e por onde.
- [x] Nada é enviado ou excluído sem confirmação.
- [x] O texto enviado é sempre o que o professor vê no campo.
- [x] Testes web e build aprovados.

## Resultado

Concluída em 16/10/2026.

- Testes web: 114 aprovados (eram 99), estáveis em execuções repetidas: 7
  das regras dos recados e 8 da tela. Todos escritos antes do código, menos
  o teste de carregamento, que nasceu de um defeito achado no caminho.
- Defeito corrigido: o campo de aluno aparecia antes de a lista de alunos
  chegar, e uma escolha rápida se perdia. O formulário agora espera os dados
  (teste dedicado).
- Ajuste após conferência no navegador: entrega que falhou aparece como "Não
  foi enviado – avise o suporte", porque a tela não tem como reenviar; o
  teste da regra foi atualizado.
- O painel antigo (`FeedbackPanel`) foi removido.
- Typecheck e build do web, lint, formatação e 17 testes de contratos
  aprovados. O `npm run check` completo segue bloqueado pelas alterações em
  andamento da API, fora desta etapa.
- Conferência no navegador com API fictícia local, no computador e no
  celular, sem rolagem lateral e com controles de pelo menos 44 px.

## Pendências para o Codex (backend)

- **B-06:** devolver a turma em `/feedbacks/eligible-submissions` para o
  filtro de alunos por turma.
- Permitir reenviar um recado cuja entrega falhou de vez (hoje enviar de novo
  não cria outra entrega).
- `/review` exige observação do professor; enquanto isso, a tela grava a
  revisão como edição do texto (`PATCH`).
