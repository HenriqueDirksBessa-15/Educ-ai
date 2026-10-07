# Decisões pendentes

Nenhuma mudança de requisito aprovada. Nenhum requisito adicional aprovado.

| ID | Referência | Ambiguidade ou dependência | Encaminhamento | Bloqueia |
| --- | --- | --- | --- | --- |
| D01 | Escopo, RF006/007/012 | Aluno indireto versus código de ingresso e interface EducAI | Henrique define canais de acesso e autenticação; não criar portal implicitamente | Ingresso e visualização pelo aluno |
| D02 | RF008 | Bloqueio de exclusão de marco publicado versus confirmação no alternativo | Definir regra por estado/vínculo; apresentar alternativas | Exclusão de marcos vinculados |
| D03 | RF003/009 | Ementa mantida tecnicamente versus pedido de preenchimento ao professor | Definir seleção/solicitação sem painel institucional novo | Geração sem ementa |
| D04 | RF001/011/012 | Associação de envio Classroom e respostas Forms por aluno/questão | Prova técnica com contas de teste e contrato de reconciliação | Coleta real |
| D05 | RF013 | Comentários particulares no Classroom e capacidades da API | Verificar documentação e acesso; apresentar canal suportado antes de mudar comportamento | Entrega externa do feedback |
| D06 | RF014 | Origem de presença, participação e e-mail de responsáveis | Henrique define fonte e comportamento para dados ausentes | Campos/canais correspondentes do boletim |
| D07 | RF010/013/014 e regras | Limites de armazenamento, planilha, edição, média/pesos e atrasos | Enumerar opções por módulo e fechar os valores necessários | Validações respectivas |
| D08 | RF002 e escopo | Modelo GPT-4 citado e configuração disponível | Verificar modelo/acesso; apresentar eventual mudança | Integração real de IA |
| D09 | Integrações | Contas de teste, projeto OAuth, permissões Google, chave IA e remetente | Configurar fora do git; mocks permitem desenvolvimento, não aceitação real | Provas externas e envio de e-mail |
| D10 | Prazo | Prazo de 14 dias sem data final explicitada | Cronograma assume 07–20/10, contando hoje como D1; confirmar data final quando definida | Data final confirmada |

## Decisão de execução aprovada

07/10/2026, Henrique: APIs externas ficam para segunda-feira, 12/10. Até domingo, priorizar banco, frontend e endpoints locais. Interfaces/fixtures preparam integrações; não executar chamadas reais nesse período. Mudança de ordem de execução, sem alteração do DERS nem novo requisito.

Registrar cada decisão com data, responsável, opção escolhida e requisitos afetados. Verificações técnicas podem ser resolvidas pelo desenvolvimento; alterações de comportamento precisam de decisão de Henrique.
