# Etapa 04 — Turmas

Referências: [proposta](./01-proposta-ui.md) (seção 4.1, DU-03, DU-06),
[protótipo](./prototipo-ui.html) (Turmas, turma e Nova turma) e
[etapa 03](./03-entrada-inicio.md).

## Objetivo do professor

Trazer as turmas do Google Sala de Aula ou criar uma turma, ver os alunos e
dizer **uma vez** a matéria e o ano de cada turma, para que a BNCC certa
apareça sozinha ao planejar.

## Achado que orienta a etapa

O catálogo BNCC grava o ano como identificador técnico (`ef-ano-08`,
`em-sem-seriacao`, grupos da educação infantil pelo nome) e a busca de
habilidades exige o mesmo texto no perfil da turma
(`apps/api/src/curriculum/repository.ts`, comparação exata sem maiúsculas).
Hoje o professor precisaria digitar esse identificador. A partir desta etapa,
etapa, ano e matéria são escolhidos em listas montadas do próprio catálogo
(`GET /api/curriculum`), com nomes amigáveis ("8º ano"). Isso cobre B-02 sem
mudar o backend; um endpoint enxuto de catálogo continua desejável porque a
resposta atual inclui todas as habilidades.

## Escopo

Inclui:

- endereços `#/turmas`, `#/turmas/{id}` e `#/nova-turma` (o roteador ganha um
  parâmetro);
- **lista:** botão principal **Trazer minhas turmas do Google Sala de Aula**,
  link **+ Criar turma no EDUC.AI**, cartões com ano, origem e matéria (ou o
  aviso "Matéria não definida") e link **Abrir {turma}**;
- **turma:** alunos com situação traduzida; **Atualizar lista de alunos**
  (turma do Google) ou **Criar no Google Sala de Aula** com confirmação (turma
  local); bloco **O que esta turma estuda** com etapa, ano e **uma** matéria
  (DU-06) escolhidos em listas;
- **nova turma:** nome, etapa, ano, matéria e código gerado e editável
  (DU-03); cria a turma e o perfil e abre a turma criada;
- **+ Criar → Nova turma** passa a abrir a página de nova turma;
- mensagem para a falha de integração com o Google (`INTEGRATION_UNAVAILABLE`),
  que hoje também cobre a falta de permissão após o novo escopo de avisos.

Não inclui: matrícula manual ou por planilha, edição de nome/descrição,
mudanças de backend.

## Regras

- O catálogo mostra só itens oficiais (sem `isFixture`); etapa vem do ano:
  `ef-ano-01`–`05` anos iniciais, `06`–`09` anos finais, `em-*` ensino médio,
  grupos etários educação infantil.
- Valor atual da turma que não exista no catálogo continua visível como
  opção "(atual)", para não ser apagado sem querer.
- Catálogo vazio: aviso "A BNCC ainda não foi carregada neste ambiente. Avise
  o suporte." e o perfil não pode ser salvo.
- Nova turma: se o perfil falhar depois de a turma ser criada, a turma abre
  com o aviso para concluir a matéria; nada é criado em duplicidade.
- Código gerado no formato `TURMA-1234`, editável, com no mínimo 4
  caracteres.

## Testes antes do código

- `router.test.ts`: endereço com parâmetro e nova turma.
- `curriculumCatalog.test.ts`: etapas, anos em ordem e com nome amigável,
  matérias por ano, itens de demonstração ignorados, rótulo de ano.
- `labels.test.ts`: falha de integração e situação de matrícula.
- `ClassesPages.test.tsx`: lista com matéria ou aviso, trazer turmas do Google,
  turma com alunos, salvar perfil com uma matéria e o ano do catálogo,
  confirmação antes de criar no Google, atualizar alunos, nova turma com
  código gerado criando turma e perfil, nenhum identificador do professor
  enviado.

## Aceite

- [x] Ano e matéria nunca são digitados.
- [x] O perfil salvo usa exatamente os valores do catálogo da BNCC.
- [x] Toda ação externa (criar no Google) pede confirmação.
- [x] Testes web e build aprovados.

## Resultado

Concluída em 16/10/2026.

- Testes web: 66 aprovados (eram 51): 4 do catálogo BNCC, 2 do roteador com
  parâmetro, 1 de rótulos e 9 das telas de Turmas (lista, trazer do Google,
  falha de permissão do Google, perfil com uma matéria, atualizar alunos,
  confirmação antes de criar no Google, nova turma completa, campos
  obrigatórios e BNCC não carregada). Todos escritos antes do código.
- `ClassesPanel` e seu teste foram substituídos pelas novas telas.
- Typecheck e build do web, lint, formatação e 17 testes de contratos
  aprovados. O `npm run check` completo segue bloqueado pelas alterações em
  andamento da API, fora desta etapa.
- Conferência no navegador com API fictícia local, no computador e no
  celular. Ela revelou dois defeitos de layout corrigidos na mesma etapa: o
  estilo dos campos de texto também pegava os botões de opção, e opções longas
  da lista de etapas podiam alargar a página.

## Pendências

Para o Codex (backend):

- A projeção da BNCC (`010_bncc_compatibility_projection.sql`) liga cada
  habilidade só ao **primeiro** ano em que ela aparece (`LIMIT 1` no recorte
  temporal). Uma habilidade de 6º a 9º ano aparece só no 6º ano, e o
  professor do 8º ano não a encontra. Precisa ser revisto.
- Um endpoint de catálogo (etapas, anos e matérias sem as habilidades)
  deixaria esta tela mais leve; hoje `GET /api/curriculum` traz todas as
  habilidades.

Para a etapa 07 (Aulas): o formulário de plano ainda mostra o valor técnico do
ano (ex.: `ef-ano-08`) no campo "Ano/série"; ele deve vir da turma e não ser
editável.
