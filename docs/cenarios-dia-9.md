# Cenários do Dia 9

## Geração por IA

1. Um professor pode gerar questões para um rascunho próprio informando a quantidade desejada.
2. O prompt usa somente o plano, a ementa, as habilidades BNCC, os materiais vinculados, o tipo e a dificuldade da atividade.
3. Uma resposta inválida, timeout ou indisponibilidade registra a tentativa e preserva o rascunho.
4. Cada nova tentativa recebe uma versão crescente e não apaga versões anteriores.
5. Um professor não pode gerar nem consultar sugestões de outro professor.

## Revisão e aprovação

1. Conteúdo gerado permanece separado do rascunho até revisão explícita.
2. A revisão pode alterar todos os campos sugeridos e aplica a versão validada ao rascunho.
3. A aprovação exige uma revisão anterior da mesma geração.
4. Uma edição estrutural posterior invalida a aprovação da geração.
5. Conteúdo gerado não pode ser publicado sem revisão e aprovação docente.

## Google Forms e Classroom

1. Uma atividade cria no máximo um Google Form.
2. O Form contém questões, alternativas, pontuação, gabaritos objetivos e campos discursivos.
3. Cada turma Google vinculada ao plano recebe no máximo um trabalho Classroom.
4. Turmas locais sem vínculo Google impedem a conclusão e exibem uma falha recuperável.
5. Publicação repetida retoma o estado persistido e não duplica recursos já confirmados.
6. Falha depois da criação remota e antes da confirmação local exige reconciliação, nunca recriação cega.
7. A atividade local só muda para publicada quando Form e todas as distribuições obrigatórias forem concluídos.
8. O prazo gera um trabalho de coleta pendente para o Dia 10.

## Falhas e segurança

1. Escopos OAuth insuficientes solicitam novo consentimento sem revogar o rascunho.
2. Tokens renovados são persistidos cifrados e nunca aparecem em resposta ou log.
3. Erros de permissão, quota, entrada e indisponibilidade são normalizados.
4. Fixtures são permitidas somente em desenvolvimento e teste e permanecem identificadas.
5. Estados parcial, falho e recuperável aparecem na interface por turma.
