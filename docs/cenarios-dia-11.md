# Cenários do Dia 11

## Sugestão discursiva

1. Uma resposta discursiva não vazia pode receber sugestão de pontos, comentário e indicação de revisão com base no enunciado, resposta-alvo, critérios, rigor, nível e conteúdo do plano.
2. A sugestão da IA não altera a nota da submissão nem transforma a resposta em corrigida.
3. Resposta vazia ou ambígua é encaminhada para correção manual sem receber nota automática.
4. Falha, timeout ou indisponibilidade da OpenAI preserva a resposta e registra uma tentativa auditável para correção manual.
5. Atividades objetivas não aceitam geração de sugestão discursiva.

## Revisão e aprovação docente

6. O professor pode informar manualmente pontos e comentário para cada questão discursiva, com ou sem sugestão anterior.
7. Pontos acima do máximo da questão, submissão de outro professor e resposta não pertencente à submissão são rejeitados.
8. A aprovação exige revisão explícita de todas as questões discursivas e calcula a nota final ponderada de 0 a 10 combinando questões objetivas e discursivas.
9. Sugestão, falha da IA, ajuste docente, aprovação e liberação formam eventos imutáveis com snapshot do estado.
10. Uma nota aprovada não pode ser editada; uma nota liberada não pode ser aprovada ou liberada novamente com efeito duplicado.

## Liberação

11. A liberação exige aprovação docente e registra data, nota e comentário finais.
12. Quando aluno, turma e trabalho possuírem identificadores Google, a nota é devolvida e o trabalho é retornado no Classroom.
13. Sem vínculo Classroom suficiente, a nota é liberada localmente e o estado externo fica como indisponível.
14. Falha do Classroom mantém a aprovação e permite repetir somente a liberação externa, sem recriar correções ou histórico docente.
