# Cenários do Dia 12

## Feedback individual e aviso global

1. O professor cria feedback individual somente para submissão corrigida e aprovada de um aluno pertencente às suas turmas.
2. O professor cria aviso global somente para uma turma própria.
3. Feedback individual registra aluno, atividade e submissão; aviso global registra a turma destinatária.
4. Texto, observação docente, links e materiais anexados são persistidos com data e hora.
5. Material de outro professor e submissão ou turma fora da sessão são rejeitados.

## Assistência de IA e revisão

6. A geração opcional usa apenas desempenho, comentários, atividade e público autorizados, produzindo pontos fortes, melhorias e mensagem sugerida.
7. Falha da OpenAI preserva o rascunho manual e registra a tentativa.
8. Conteúdo gerado permanece em estado gerado até o professor editar e revisar explicitamente.
9. Feedback manual pode ser editado e enviado sem geração de IA.
10. O histórico imutável distingue sugestão da IA, texto revisado pelo professor, envio e exclusão.

## Janela e notificação

11. Edição e exclusão são permitidas somente dentro da janela configurada no servidor, calculada a partir da criação.
12. Após a janela, o conteúdo e seus vínculos não podem ser alterados ou excluídos.
13. O envio cria uma notificação idempotente para o aluno ou turma e preserva o conteúdo histórico.
14. Repetir o envio não cria outra notificação.
15. Exclusão é lógica e não apaga histórico, links, anexos ou evidências de envio.
