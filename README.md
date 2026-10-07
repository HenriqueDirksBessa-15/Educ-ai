# EducAI

Sistema de apoio ao planejamento pedagógico e à correção de atividades escolares com IA.

## Estado atual

Passo 0: documentação e estrutura inicial. Ainda não há aplicação executável nem funcionalidades implementadas. Repositório inicialmente vazio, verificado em 07/10/2026.

Prazo de trabalho: 14 dias, informado em 07/10/2026. Cronograma operacional assume 07–20/10, contando hoje como D1; data final é uma referência de planejamento. Até domingo, 11/10: banco, frontend e endpoints locais. APIs externas Google/GPT a partir de segunda, 12/10.

Fonte de autoridade: `Desenvolvimento_DERS_HenriqueBessa.pdf`, versão consultada de 30/09/2026, 78 páginas. O PDF não está neste repositório. Os agentes precisam receber acesso ao documento antes de interpretar campos ou fluxos não transcritos aqui.

## Começar

1. Ler `AGENTS.md` e `docs/progresso.md`.
2. Consultar `docs/plano.md`, `docs/arquitetura.md` e `docs/requisitos.md`.
3. Resolver apenas decisões que bloqueiem a entrega atual em `docs/decisoes.md`.
4. Executar `docs/modulos/fundacao.md`, seguindo a sequência de `docs/modulos/banco-front-endpoints.md`.

A estrutura está preparada para `apps/web`, `apps/api`, `packages/contracts`, `database/migrations`, `database/seeds` e testes separados por tipo. Dependências, scripts de execução e lockfile serão adicionados na fundação, após validar versões e compatibilidade.
