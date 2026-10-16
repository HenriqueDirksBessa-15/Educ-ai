# Etapa 10 — Minha conta

Referências: [proposta](./01-proposta-ui.md) (seção 4.7),
[protótipo](./prototipo-ui.html) (Minha conta) e [etapa 09](./09-boletins.md).

## Objetivo do professor

Ver e corrigir o próprio nome, entender que o e-mail vem do Google, sair,
baixar uma cópia dos dados e, se quiser, excluir a conta sem risco de fazer
isso sem querer.

## Regras da API que orientam o desenho

- `GET/PATCH /api/profile`: nome editável (até 100 caracteres); e-mail e foto
  vêm do Google.
- O perfil também guarda uma "preferência de notificação", mas nenhuma parte
  do sistema a usa hoje.
- `GET /api/privacy/export` baixa os dados próprios, sem credenciais.
- `DELETE /api/privacy/account` exige `{"confirmation": "EXCLUIR"}`, revoga o
  acesso, anonimiza a identidade e mantém o histórico pedagógico.

## Decisões desta etapa

- A preferência de notificação **não** aparece: mostrar uma opção que não
  muda nada engana o professor. Pendência para o backend: usar a preferência
  (ou removê-la) antes de expô-la.
- A exclusão pede que o professor **digite EXCLUIR**, como a API exige, em vez
  da confirmação comum de um clique.
- O nome trocado aparece na hora no menu, sem recarregar a página.

## Escopo

Inclui:

- **seus dados:** foto (ou iniciais), nome editável com **Salvar nome**,
  e-mail somente leitura com a explicação de que vem do Google, data de
  entrada;
- **Sair**, sempre disponível, mesmo se o perfil não carregar;
- **Baixar uma cópia dos meus dados**, com explicação do que vem no arquivo;
- **Excluir minha conta:** explicação do que acontece, campo para digitar
  EXCLUIR e botão final liberado só depois disso; falha mostra mensagem e
  mantém o professor conectado;
- o painel de privacidade que estava em `App.tsx` passa para a nova tela.

Não inclui: troca de e-mail ou foto (vêm do Google), preferência de
notificação, mudanças de backend.

## Testes antes do código

- `AccountPage.test.tsx`: mostra nome, e-mail e link de download; salvar nome
  e avisar o menu; nome vazio; sair; excluir só depois de digitar EXCLUIR;
  falha ao excluir mantém a conta; perfil que não carrega ainda permite sair;
  nenhum identificador do professor enviado.

## Aceite

- [x] Excluir a conta exige digitar EXCLUIR.
- [x] Sair funciona mesmo se o perfil falhar.
- [x] Nenhuma opção na tela deixa de ter efeito.
- [x] Testes web e build aprovados.

## Resultado

Concluída em 16/10/2026.

- Testes web: 136 aprovados (eram 128), estáveis em execuções repetidas: 7
  da tela e 1 do app.
- Os 6 testes da tela planejados na especificação vieram antes do código.
  Dois surgiram depois: o perfil malformado (um teste do app mostrou que uma
  resposta incompleta derrubava o app inteiro; corrigido) e o retorno à tela
  de entrada após excluir a conta, que cobre a ligação com o app.
- O painel de privacidade saiu de `App.tsx` e foi para a nova tela.
- Typecheck e build do web, lint, formatação e 17 testes de contratos
  aprovados. O `npm run check` completo segue bloqueado pelas alterações em
  andamento da API, fora desta etapa.
- Conferência no navegador com API fictícia local, no computador e no
  celular, sem rolagem lateral e com controles de pelo menos 44 px.

## Pendências para o Codex (backend)

- A preferência de notificação do perfil não é usada por nenhuma parte do
  sistema; usar ou remover antes de mostrá-la ao professor.
