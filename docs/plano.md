# Plano de execução em 14 dias

Reorganizado por Henrique em 07/10/2026: até domingo, foco em PostgreSQL, frontend e endpoints locais. Integrações reais Google, GPT e demais chamadas externas ficam para segunda-feira, 12/10, ou depois, conforme as dependências.

Cronograma operacional assume 07/10 como D1 e 14 dias corridos, encerrando em 20/10. A data final é uma referência de planejamento, ainda não confirmada separadamente. Todos os 14 RF e os RNFs permanecem no escopo.

## Cronograma

| Dia | Data | Foco | Critério de entrega |
| --- | --- | --- | --- |
| D1 | 07/10, quarta | Fundação e banco | Web/API iniciáveis, PostgreSQL local, migrações, modelo e contratos iniciais |
| D2 | 08/10, quinta | Perfil, currículo, turmas e alunos | Endpoints e telas com persistência, validações e campos restritos; identidade de teste local |
| D3 | 09/10, sexta | Materiais e linha do tempo | Upload local, metadados e vínculos; telas/endpoints de marcos e bloqueios do DERS |
| D4 | 10/10, sábado | Planos e atividades manuais | BNCC/materiais, questões, gabarito, critérios e prazo; interface de revisão |
| D5 | 11/10, domingo | Avaliação local e frontend | Respostas de teste, correção objetiva, ajuste manual, feedback e prévia do boletim; percurso persistente e responsivo |
| D6 | 12/10, segunda | OAuth e acesso às APIs | Login Google real, cadastro/perfil, credenciais e sessões; acesso Google/GPT verificado |
| D7 | 13/10, terça | Classroom e monitoramento | Importação de turmas/alunos sem duplicação; status e tentativas RF001/002 |
| D8 | 14/10, quarta | Forms e publicação | Formulário/atividade de teste e distribuição após revisão; IDs externos registrados |
| D9 | 15/10, quinta | Respostas Google | Coleta e associação por aluno/questão; prazos e repetição sem duplicação |
| D10 | 16/10, sexta | GPT em planos e atividades | Geração contextualizada, edição/revisão e tratamento de erros |
| D11 | 17/10, sábado | Avaliação e feedback completos | Sugestões discursivas, aprovação e histórico; canal de feedback validado |
| D12 | 18/10, domingo | Boletins e operação | Envio real/reenvio, filtros/médias, histórico, auditoria e backup/restauração |
| D13 | 19/10, segunda | Validação integral | Fluxos principais/alternativos, isolamento, integrações reais e navegadores |
| D14 | 20/10, terça | Correções e entrega | Regressão necessária, pendências explícitas e entrega; deploy só após autorização |

## Trabalho até domingo

Construir banco, contratos, regras e interface juntos, por módulos. A interface consome a API local com contratos estáveis. Fixtures/adaptadores de desenvolvimento simulam somente os provedores externos; os dados locais persistem no PostgreSQL.

Preparar interfaces dos adaptadores e contratos dos endpoints externos, sem chamadas reais antes de segunda. Não criar autenticação alternativa no produto: identidade simulada existe apenas em desenvolvimento/teste, com configuração bloqueada fora desses ambientes. Login do produto continua exclusivamente Google.

Planos e questões manuais, correção objetiva por gabarito e revisão manual não dependem do GPT. Recursos simulados devem ser identificados e não contam como requisito concluído. Não anunciar sucesso de publicação, geração ou envio real ao retornar mock.

Ver `docs/modulos/banco-front-endpoints.md` para sequência local.

## Pontos de controle

* Domingo: percurso local persistente, contratos estáveis, estados de erro e responsividade verificados.
* Segunda: provar OAuth e acesso às APIs disponíveis antes de publicação e sincronização reais.
* Após coleta: demonstrar associação de respostas a aluno/atividade e impedir duplicação.
* Antes da entrega: preservar dois dias para validação/correção, sem cortes silenciosos de requisitos.

Resolver D02/D03 e parâmetros locais antes dos módulos afetados. D01 segue pendente para acesso do aluno; não criar portal implicitamente. D04/D05/D08/D09 entram na etapa externa; D06 deve ser resolvida antes dos boletins.

Cada sessão trabalha em uma entrega delimitada, com testes das regras definidos antes da implementação e registro em progresso. Quando uma dependência ameaçar a janela final, registrar impacto e opções para decisão de Henrique. Ordem de execução não altera o DERS.
