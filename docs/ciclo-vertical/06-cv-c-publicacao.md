# CV-C — publicação idempotente de atividades

## Objetivo

Publicar no Google Forms e no Classroom somente a versão docente válida da
atividade, sem duplicar recursos em concorrência ou retentativa, e persistir o
vínculo explícito entre cada questão local e os IDs criados no Form.

## Cenários escritos antes da implementação

1. Cada questão recebe do Forms um `itemId` e `questionId`; o retorno confirmado
   persiste ambos junto à questão e posição locais.
2. Reordenar itens no Form não altera a questão local associada a uma resposta.
3. Um Form incompleto ou sem IDs reconciliáveis interrompe a publicação em
   `reconciliation_required`; ele não é confirmado localmente.
4. O Form e todos os mapeamentos de questões são confirmados na mesma instrução
   PostgreSQL e somente quando o conjunto estiver completo.
5. A coleta usa o mapeamento persistido, não a ordem mutável retornada pelo
   Forms.
6. A preparação da publicação bloqueia a atividade em transação; uma edição
   concorrente não pode publicar uma versão antiga do rascunho.
7. Se existir geração de IA, somente uma geração revisada e aprovada pode ser
   preparada. A atividade criada manualmente continua publicável pelo gesto
   explícito do professor.
8. Duas requisições concorrentes não criam dois Forms nem dois trabalhos; a
   segunda observa o lease persistido e retorna o estado corrente.
9. Retentativa reconcilia Form pelo marcador do Drive e trabalho pelo marcador
   do Classroom, reutilizando IDs já confirmados.
10. A atividade muda para `published` somente depois do Form, dos mapeamentos e
    de todas as distribuições obrigatórias.

## Decisões

- `itemId` e `questionId` são opacos e atribuídos pelo Google; a confirmação
  exige quantidade completa e unicidade de ambos;
- Forms antigos sem IDs determinísticos podem ser reconciliados uma única vez
  por posição somente se a quantidade de itens for exatamente a esperada;
- depois que a publicação é preparada, a estrutura da atividade fica bloqueada
  para eliminar a janela entre a versão aprovada e a chamada externa;
- nenhuma transação de banco permanece aberta durante chamadas Google;
- respostas com `questionId` externo desconhecido seguem para revisão manual.

## Aceite

- migração 025 cria vínculo íntegro atividade/questão/item/question do Forms;
- publisher, serviço, repositório e coleta possuem testes de mapeamento,
  reordenação, lease, retentativa e uso do vínculo persistido;
- migrações 001–025 e o ciclo de publicação passam em banco temporário;
- regressão, lint, tipos, formato e build passam;
- nenhuma chamada Forms/Classroom/OpenAI, deploy ou migração no banco `educai`
  é executada.

## Resultado do gate

- `npm run check`: aprovado;
- 16 contratos, 86 testes de API e 9 testes web aprovados;
- 8 testes PostgreSQL aprovados em `educai_test_*`, incluindo migração 025,
  mapeamento de questões, bloqueio durante publicação e ciclo completo;
- smoke OpenAI ignorado por ser opt-in;
- base temporária removida e Cloud SQL Auth Proxy encerrado;
- nenhuma migração aplicada ao banco `educai` e nenhuma chamada Google/OpenAI.

## Roteiro de teste manual de homologação

1. usar uma atividade baseada em plano aprovado, com geração revisada/aprovada
   ou conteúdo integralmente manual;
2. publicar para uma turma Google fictícia e confirmar um único Form e um único
   trabalho Classroom;
3. conferir no banco um mapeamento para cada questão da atividade;
4. repetir a publicação e confirmar que os mesmos IDs externos são mantidos;
5. reordenar visualmente as perguntas no Form de homologação, enviar respostas
   fictícias e confirmar que a coleta as associa pelos `questionId` persistidos;
6. provocar uma falha após a criação do Form e confirmar que a retentativa
   reconcilia o recurso, sem criar outro;
7. disparar duas publicações simultâneas e confirmar que apenas uma adquire o
   lease.

O roteiro exige a homologação autorizada CV-HML; esta etapa não chamou APIs
Google reais.
