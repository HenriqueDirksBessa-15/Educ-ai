# Etapa 05 — Atividades

Referências: [proposta](./01-proposta-ui.md) (seção 4.3),
[protótipo](./prototipo-ui.html) (Atividades e Criar atividade) e
[etapa 04](./04-turmas.md).

## Objetivo do professor

Criar uma atividade a partir de um plano aprovado, com ou sem IA, revisar as
questões como o aluno vai vê-las e enviá-la para a turma sabendo exatamente o
que vai acontecer. Hoje são cerca de 9 ações espalhadas entre lista e
formulário ("Criar rascunho", "Editar e revisar", "Gerar sugestão", "Carregar
no editor", "Confirmar revisão", "Aprovar versão", "Publicar"…).

## Regras da API que orientam o desenho

- O rascunho exige título, descrição, tipo, dificuldade e **prazo** já na
  criação; aceita zero questões (`activityInputSchema`).
- A IA gera a partir do rascunho salvo e usa o tipo e a dificuldade dele; o
  plano precisa estar aprovado e ter habilidades da BNCC.
- Revisar a sugestão (`/review`) grava as questões na atividade; aprovar
  (`/approve`) exige a revisão.
- Publicar exige rascunho com questões válidas e, **se a IA foi usada**, uma
  versão aprovada; sem IA, publica direto.
- O tipo precisa combinar com as questões (só objetivas, só discursivas ou as
  duas).
- O Google Formulários exige pontuação inteira.

## Escopo

Inclui:

- endereços `#/atividades` (lista), `#/nova-atividade` (assistente) e
  `#/atividades/{id}` (assistente do rascunho ou acompanhamento da enviada);
- **lista:** filtros Todas, Rascunhos, Enviadas e Encerradas; cartão com
  título, plano, situação, prazo e respostas; **Continuar** (rascunho) ou
  **Ver** (enviada/encerrada); botão principal **Criar atividade**;
- **assistente em 4 passos:**
  1. **Plano:** escolher um plano aprovado (ou ir planejar), título e
     orientação para os alunos (já preenchida, editável);
  2. **Questões:** tipo (múltipla escolha, resposta escrita ou as duas),
     dificuldade e quantidade; **Pedir questões à IA** ou **Escrever as
     questões**;
  3. **Revisar:** questões editáveis como o aluno vai ver, com resposta certa
     marcada, adicionar e remover; **Aprovar questões** grava (revisão e
     aprovação da IA em sequência, ou rascunho manual);
  4. **Prazo e envio:** prazo, regra para atraso e turmas que vão receber;
     **Salvar e enviar depois** ou **Enviar para a turma** com confirmação;
- **acompanhamento:** situação do envio por turma, links para o formulário e
  para o Google Sala de Aula, respostas recebidas, **Ver respostas**,
  **Encerrar respostas** e **Guardar** (com confirmação), **Tentar enviar de
  novo** quando o envio falhou;
- **+ Criar → Nova atividade** e o atalho do Início abrem o assistente.

Não inclui: correção (etapa 06, a tela Correções continua com o painel atual),
mudanças de backend.

## Decisões de desenho

- O rascunho é criado no primeiro passo que precisa do servidor (pedir à IA
  ou aprovar questões), com prazo provisório de 7 dias às 23:59; o passo 4
  mostra e permite trocar esse prazo.
- O tipo é calculado a partir das questões, para nunca divergir.
- Pontuação só aceita números inteiros a partir de 1.
- Qualquer mudança nas questões depois de aprovadas exige aprovar de novo.

## Testes antes do código

- `activityDraft.test.ts`: tipo calculado, validação das questões com
  mensagens por campo, questão vazia por tipo, prazo provisório e conversão
  para o campo de data.
- `ActivitiesPages.test.tsx`: lista com filtros e links; assistente sem IA
  (cria rascunho com as questões e envia com confirmação); assistente com IA
  (cria rascunho, gera, revisa e aprova a sugestão editada); erro da IA sem
  perder o que foi escrito; validação no passo 3; cancelar a confirmação não
  envia; rascunho existente abre no passo certo; acompanhamento com links,
  encerrar e guardar com confirmação, tentar de novo após falha; nenhum
  identificador do professor enviado.

## Aceite

- [x] Criar e enviar uma atividade com IA leva no máximo 4 telas e 4 botões
      principais (Continuar, Pedir questões à IA, Aprovar questões, Enviar
      para a turma).
- [x] Nada é enviado à turma sem confirmação.
- [x] Questões inválidas mostram o problema junto à questão.
- [x] Testes web e build aprovados.

## Resultado

Concluída em 16/10/2026.

- Testes web: 87 aprovados (eram 66): 8 das regras das questões, 9 das telas
  de Atividades e 4 do módulo comum de chamadas à API.
- Os testes das regras e das telas foram escritos antes do código; os 4 do
  módulo comum (`api.ts`, extraído de Turmas nesta etapa) foram escritos
  depois.
- As mensagens de erro passaram a ficar fora do rótulo do campo (também em
  Turmas): antes, o leitor de tela lia o erro como parte do nome do campo.
- Typecheck e build do web, lint, formatação e 17 testes de contratos
  aprovados. O `npm run check` completo segue bloqueado pelas alterações em
  andamento da API, fora desta etapa.
- Conferência no navegador com API fictícia local, no computador e no celular,
  sem rolagem lateral e com controles de pelo menos 44 px.
- A tela Correções continua usando o painel antigo até a etapa 06.

## Pendências para o Codex (backend)

- `PATCH /api/activities/:id` não desfaz a aprovação da versão da IA: as
  questões podem mudar depois de aprovadas e ainda assim ser publicadas. A
  interface sempre revisa e aprova de novo, mas a regra deveria estar no
  servidor.
- Falha da IA em `/generate` volta como `INTEGRATION_UNAVAILABLE`, sem o
  código da OpenAI; a interface assume que foi a IA.
