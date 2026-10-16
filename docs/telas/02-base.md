# Etapa 02 — Base da interface

Primeira etapa da Fase 3. Referências: [diagnóstico](./00-diagnostico-ui.md),
[proposta](./01-proposta-ui.md) e [protótipo](./prototipo-ui.html).

## Objetivo do professor

Encontrar cada tarefa por um menu claro, sem ver termos de desenvolvimento, e
não enviar nada aos alunos por engano.

## Escopo

Inclui:

- roteador próprio por `hash` (DU-05) com endereço e título de aba por tela;
- casca com menu lateral (computador) e barra inferior com "Mais" (celular),
  conforme o protótipo: **+ Criar**, Início, grupos Sala de aula e
  Comunicação, cartão do professor no rodapé;
- uma tela por item do menu, reaproveitando os painéis atuais:

  | Endereço       | Título      | Conteúdo nesta etapa                                  |
  | -------------- | ----------- | ----------------------------------------------------- |
  | `#/inicio`     | Início      | saudação e atalhos (pendências ficam para a etapa 03) |
  | `#/criar`      | Criar       | Nova atividade, Novo plano de aula, Nova turma        |
  | `#/turmas`     | Turmas      | painel de turmas                                      |
  | `#/aulas`      | Aulas       | calendário, materiais e planos                        |
  | `#/atividades` | Atividades  | painel de atividades                                  |
  | `#/correcoes`  | Correções   | painel de atividades filtrado em "Enviadas"           |
  | `#/recados`    | Recados     | painel de recados                                     |
  | `#/boletins`   | Boletins    | painel de boletins                                    |
  | `#/conta`      | Minha conta | dados do professor, privacidade e **Sair**            |

- remoção de todas as marcas do plano (UI-01) e do painel técnico de serviços
  Google, que vira aviso só quando algum serviço está fora do ar (DU-02);
- tradução de todos os valores internos e códigos de erro exibidos (UI-09,
  seção 3.3 do diagnóstico) por um módulo único de rótulos;
- listas completas, sem corte em 5 itens (UI-02);
- estados vazios com próximo passo e falhas de carregamento visíveis (UI-13);
- cores, foco, tamanhos e cursor desabilitado da proposta (UI-05);
- link "Ir para o conteúdo principal" funcional e título de aba por tela
  (UI-15);
- `MaterialsPanel` usando `VITE_API_BASE_URL` (UI-16);
- componente de confirmação acessível, aplicado a publicar, encerrar e guardar
  atividade, devolver nota, enviar e excluir recado, enviar boletim e excluir
  conta. A proposta previa aplicar esse componente tela a tela; foi antecipado
  porque é P0 (UI-03), não muda regra de negócio e evita envio acidental.

Não inclui (etapas seguintes):

- assistentes de Planejar aula e Criar atividade, fila de correção, novos
  formulários de turma, recado e boletim;
- troca de verbos dos botões dentro dos painéis (glossário completo, por tela);
- pendências e contadores no Início e no menu (etapa 03);
- mudanças de backend.

## Regras

- Endereço desconhecido ou âncora interna leva ao Início, sem erro.
- Trocar de tela move o foco para o conteúdo principal e muda o título da aba
  para "{Título} · EDUC.AI".
- O item atual do menu tem `aria-current="page"`.
- Aviso do Google aparece somente quando OAuth, Sala de Aula ou Formulários
  estiverem com estado `inactive`; sem verificação registrada, nada aparece.
- Código de erro nunca aparece na tela; desconhecido vira mensagem genérica.
- Confirmação: foco vai para a caixa, **Esc** e **Cancelar** não executam a
  ação, o foco volta ao botão de origem.

## Testes antes do código

- `router.test.ts`: leitura do endereço, endereço desconhecido, âncora
  interna, títulos.
- `labels.test.ts`: rótulos de todas as situações, mensagens de erro
  conhecidas e desconhecidas sem código, datas em português.
- `ConfirmDialog.test.tsx`: confirmar, cancelar, Esc, foco e `aria-modal`.
- `App.test.tsx`: menu com item atual, troca de tela por endereço, título da
  aba, aviso do Google só quando inativo, nenhuma marca interna em nenhuma
  tela, sair a partir de Minha conta.
- `LessonPlansPanel.test.tsx`: lista mostra o 6º plano.
- `ActivitiesPanel.test.tsx`: publicar só acontece após confirmar.

## Aceite

- [x] Nenhum texto "Dia N", "RFxxx", "Ciclo vertical", "OAuth", "API",
      "fixture" ou "Fundação" visível em qualquer tela (teste).
- [x] Toda tela tem um `h1`, endereço próprio e título de aba.
- [x] Menu navegável por teclado, com foco visível (contraste 11:1).
- [x] Nenhum texto com contraste abaixo de 4,5:1 (menor: 5,5:1).
- [x] Ações irreversíveis pedem confirmação.
- [x] Verificações do web aprovadas (ver Resultado).

## Resultado

Concluída em 16/10/2026.

- Testes web: 30 aprovados (eram 10), incluindo roteador, rótulos,
  confirmação, casca, ausência de marcas internas em todas as telas, lista com
  mais de 5 planos e publicação só após confirmar.
- `typecheck` e `build` do web, `lint` do repositório e formatação dos
  arquivos alterados aprovados; 17 testes de contratos aprovados.
- `npm run check` completo não passou por causa de alterações em andamento do
  Codex em `apps/api/src/app.ts` (dependência `@fastify/static` ainda não
  instalada e formatação). Nenhum arquivo da API foi tocado nesta etapa.
- Conferência visual no navegador com API fictícia local (sem banco e sem
  serviços externos): computador 1280×800 e celular 375×812, sem rolagem
  lateral e com todos os controles do conteúdo com pelo menos 44 px.
- E2E (`tests/e2e/public-shell.spec.ts`) atualizado para a nova navegação, mas
  não executado: exige API e banco locais.

Pendências para as próximas etapas: verbos dos botões dentro dos painéis
(glossário completo), textos padrão gravados em nome do professor (UI-12),
pendências e contadores no Início e no menu (etapa 03).
