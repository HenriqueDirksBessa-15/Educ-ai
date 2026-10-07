# Banco, frontend e endpoints até domingo

Janela: 07–11/10/2026. Sem chamadas reais às APIs externas. Especificação subordinada ao DERS e às decisões registradas.

## Sequência local

1. Confirmar campos e relações pelos quadros do DERS. Criar migrações de professor, currículo, turma, aluno/matrícula, marcos, materiais/vínculos, planos, atividades/questões, respostas, correções, feedback, boletim e auditoria. Preparar IDs externos e status para integração posterior.
2. Definir schemas compartilhados de entrada, saída, erros e estados antes das telas. Contratos externos ficam atrás de interfaces com fixtures identificadas.
3. Implementar endpoints e telas por módulo, com persistência PostgreSQL, validações e isolamento por professor. Não confiar em `professorId` fornecido no corpo como identidade autenticada.
4. Implementar estados vazios, carregamento, erro e sucesso em cada tela, seguindo os protótipos. Não adicionar ações fora do DERS.
5. Verificar regras isoladas, integração API/banco, percurso local e layout. Registros de teste devem permitir verificar acesso cruzado entre dois professores.

## Contratos de endpoints locais

Rotas abaixo são propostas internas; finalizar nomes/schemas na implementação, sem ampliar funcionalidades.

| Área | Rotas previstas | RF |
| --- | --- | --- |
| Perfil | `GET/PATCH /api/me` | RF005 |
| Currículo | `GET /api/curriculo/ementas`, `GET /api/curriculo/habilidades` | RF003 |
| Turmas | `GET/POST /api/turmas`, `GET/PATCH /api/turmas/:id` | RF006 |
| Alunos | `GET /api/turmas/:id/alunos`, `POST /api/turmas/:id/alunos/importacao`, `PATCH /api/turmas/:id/alunos/:alunoId/status` | RF007 |
| Marcos | `GET/POST /api/turmas/:id/marcos`, `PATCH/DELETE /api/turmas/:id/marcos/:marcoId` | RF008 |
| Materiais | `GET/POST /api/materiais`, `GET/PATCH/DELETE /api/materiais/:id` | RF010 |
| Planos | `GET/POST /api/planos`, `GET/PATCH/DELETE /api/planos/:id` | RF009 |
| Atividades | `GET/POST /api/atividades`, `GET/PATCH/DELETE /api/atividades/:id` | RF011 |
| Avaliação | `GET /api/atividades/:id/respostas`, `POST /api/atividades/:id/correcao-objetiva`, `PATCH /api/correcoes/:id`, `POST /api/correcoes/:id/aprovacao` | RF012 |
| Feedback | `GET/POST /api/feedbacks`, `PATCH/DELETE /api/feedbacks/:id` | RF013 |
| Boletins | `GET /api/turmas/:id/boletins`, `POST /api/turmas/:id/boletins/geracao` | RF014 |

Fixtures entram por seed/ferramenta de teste; não criar endpoint público de carga de respostas artificiais. Não criar cadastro por senha. Identidade simulada é dependência exclusiva de desenvolvimento/teste, bloqueada em produção. A autenticação real permanece Google.

Preparar contratos de status externo, autenticação, sincronização, publicação, IA e envio para segunda. Não executar esses efeitos externos até lá. A importação local por planilha segue RF007; não deve ser confundida com sincronização Google.

## Aceitação até domingo

* Inicialização reproduzível; banco vazio recebe migrações e seed de teste.
* Alterações persistem e sobrevivem à reinicialização da API.
* Professor não acessa dados de outro; validações no backend e feedback na interface.
* Bloqueios de edição/exclusão respeitam DERS e decisões.
* Planos/questões manuais e correção objetiva funcionam sem GPT; sugestões discursivas reais permanecem pendentes.
* Frontend usa contratos da API local; adaptações externas não duplicam regras no frontend.
* Recursos simulados são identificados; nenhuma integração real declarada concluída.
* Testes unitários separados dos de integração/ponta a ponta; interface verificada visualmente.

Não adivinhar presença, responsáveis, médias ou limites ainda indefinidos. Registrar decisão pendente e continuar os módulos independentes.
