# Etapa 03 — Entrada e Início

Referências: [proposta](./01-proposta-ui.md) (seção 3, "Início"),
[protótipo](./prototipo-ui.html) (telas Entrar e Início) e
[etapa 02](./02-base.md).

## Objetivo do professor

Entrar sem dúvida sobre o que fazer e, ao abrir o EDUC.AI, ver na hora o que
precisa da sua atenção, com um botão que leva direto à tarefa.

## Escopo

Inclui:

- **Entrada:** cartão único com a frase "Planeje, envie e corrija suas
  atividades em um só lugar.", orientação para usar a mesma conta do Google
  Sala de Aula, botão **Entrar com Google** em largura total e a garantia "Não
  vemos sua senha do Google. Nada é enviado aos alunos sem a sua aprovação.";
- **Início:** lista de pendências calculada no navegador com dados que a API
  já oferece, cada uma com título, detalhe e um botão; atalhos abaixo;
- **contadores no menu:** Correções (respostas para corrigir) e Aulas (planos
  para aprovar), com texto completo para leitores de tela.

Não inclui: notificações em tempo real, novos endpoints, alteração de backend.

## Pendências, em ordem de prioridade

| Regra                                                                                                      | Texto                                                                     | Botão → destino            |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| Respostas com correção pendente (`pending`, `suggested`, `manual_required`, `reviewed`), uma por atividade | "N respostas esperando sua correção" · título da atividade                | Corrigir → Correções       |
| Notas aprovadas e ainda não devolvidas (`approved`)                                                        | "N notas aprovadas ainda não devolvidas"                                  | Devolver → Correções       |
| Devolução ao Google Sala de Aula com falha                                                                 | "N notas não chegaram ao Google Sala de Aula"                             | Tentar de novo → Correções |
| Planos não arquivados e não aprovados                                                                      | "Plano X aguardando sua aprovação" ou "N planos aguardando sua aprovação" | Revisar → Aulas            |
| Turma sem matéria definida                                                                                 | "A turma X ainda não tem matéria definida"                                | Definir → Turmas           |
| Atividade enviada com prazo nas próximas 48 horas                                                          | "X fecha hoje/amanhã às HH:MM" · "N respostas recebidas"                  | Ver → Atividades           |
| Recados com envio falho                                                                                    | "N recados não foram enviados"                                            | Ver recados → Recados      |
| Boletins com envio falho                                                                                   | "N boletins não foram enviados"                                           | Ver boletins → Boletins    |

Sem pendências: "Tudo em dia. Que tal planejar a próxima aula?" com botão
**Planejar uma aula**.

## Dados e limites

- Atividades: `GET /api/activities`; correções: `GET
/api/activities/:id/collection` só para atividades enviadas ou encerradas
  com respostas (até 20).
- Turmas sem matéria: `GET /api/classes/:id` por turma (até 30).
- Recados e boletins: `GET /api/feedbacks` e `GET /api/bulletins`.
- Carregado ao abrir o EDUC.AI e sempre que o professor volta ao Início.
- Falha ao verificar: o Início mostra "Não conseguimos verificar suas
  pendências agora." com **Tentar de novo**; os contadores somem, sem números
  errados.

## Testes antes do código

- `pendencies.test.ts`: cada regra, ordem, singular/plural, janela de 48 horas,
  planos arquivados e aprovados ignorados, lista vazia, contadores.
- `App.test.tsx`: entrada com o novo texto; Início com pendências e links;
  "Tudo em dia"; contadores no menu com rótulo acessível; falha de verificação
  com "Tentar de novo".

## Aceite

- [x] Cada pendência leva à tela certa.
- [x] Contadores do menu batem com as pendências e somem em caso de falha.
- [x] Nenhuma pendência é mostrada com dados que falharam ao carregar.
- [x] Testes web e build aprovados.

## Resultado

Concluída em 16/10/2026.

- Testes web: 51 aprovados (eram 30): 12 das regras de pendências e
  contadores, 5 do carregador de dados (limites de requisições, turmas sem
  matéria, falha sem dados parciais, nenhum identificador do professor
  enviado) e 5 de tela (entrada, pendências com links, contadores, "Tudo em
  dia" e falha de verificação).
- Os testes do carregador foram escritos depois do código; os demais, antes.
- Typecheck e build do web, lint, formatação e 17 testes de contratos
  aprovados. O `npm run check` completo segue bloqueado pelas alterações em
  andamento da API, fora desta etapa.
- Conferência visual com API fictícia local, no computador e no celular
  (375 px): sem rolagem lateral, controles com pelo menos 44 px e contadores
  com rótulo acessível.
- E2E atualizado para o novo texto da entrada, não executado (exige API e
  banco).

Limite conhecido: as pendências são calculadas no navegador com até 20
atividades com respostas e 30 turmas por visita ao Início; um resumo pronto
na API (pedido futuro ao backend) eliminaria essas requisições extras.
