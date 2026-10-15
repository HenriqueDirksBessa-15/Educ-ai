# CV-B2 — plano de aula completo e aprovado

## Objetivo

Permitir que o professor componha, edite e aprove explicitamente um plano de
aula real usando turma, perfil curricular, ementa, habilidades BNCC e materiais
próprios. Atividades só podem nascer de um plano aprovado no banco.

## Cenários escritos antes da implementação

1. Ao selecionar a turma, a interface usa seu ano/série e componentes
   curriculares explícitos; não infere currículo pelo nome da turma Google.
2. Componente e ano consultam `/api/curriculum`, exibindo ementa, códigos,
   descrições e fonte das habilidades encontradas.
3. O formulário exige título, objetivos, conteúdos, metodologia, avaliação,
   duração positiva e uma turma; referências são opcionais.
4. Somente materiais ativos do professor vinculados à turma selecionada podem
   ser associados visualmente e persistidos.
5. Criação e edição validam turma, ementa, habilidades e materiais e gravam
   plano, vínculos e revisão em uma única transação; falha intermediária não
   deixa plano ou vínculos parciais.
6. A API retorna os IDs reais de turmas, habilidades e materiais para permitir
   edição fiel, sem reconstrução por título.
7. Plano manual em rascunho pode ser aprovado por gesto explícito. Sugestão de
   IA precisa ser revisada pelo professor antes da aprovação.
8. Edição de plano aprovado volta o estado para rascunho e exige nova aprovação.
9. Criação de atividade com plano inexistente/alheio retorna não encontrado;
   com plano próprio não aprovado retorna conflito; somente plano aprovado é
   aceito.
10. Falha da IA preserva integralmente o rascunho manual.

## Decisões

- duração será armazenada em minutos, entre 1 e 600;
- referências são texto docente opcional, sem alegar obrigatoriedade ou layout
  nacional da BNCC;
- uma habilidade selecionada deve pertencer à ementa escolhida;
- um material precisa pertencer ao professor, estar ativo e compartilhar ao
  menos uma turma com o plano;
- aprovação manual e aprovação após IA convergem no mesmo estado `approved`,
  mas uma geração bem-sucedida em estado `generated` exige revisão antes.

## Aceite

- contratos, repositório, rotas, atividade e componente web possuem testes de
  sucesso, isolamento, rollback e gate de aprovação;
- migração 024 aplica em banco vazio e a integração PostgreSQL comprova o fluxo;
- regressão, lint, tipos, formato e build passam;
- nenhuma chamada Google/OpenAI, deploy ou migração no banco compartilhado é
  executada.

## Resultado do gate

- `npm run check`: aprovado;
- 16 contratos, 84 testes de API e 9 testes web aprovados;
- 8 testes PostgreSQL aprovados em base `educai_test_*`, incluindo migração 024,
  plano completo, relações, aprovação e bloqueio/liberação de atividade;
- smoke OpenAI ignorado por ser opt-in;
- base temporária removida e Cloud SQL Auth Proxy encerrado;
- nenhuma migração aplicada ao banco `educai` e nenhuma chamada Google/OpenAI.

## Roteiro de teste manual local

1. iniciar API e web com as migrações aplicadas em uma base local isolada;
2. entrar, abrir uma turma com perfil curricular e manter ao menos um material
   por link vinculado a ela;
3. em “Planos de aula”, selecionar turma e componente e confirmar que a ementa,
   habilidades, descrições e fontes são exibidas;
4. preencher os campos docentes, selecionar habilidades e materiais e salvar o
   rascunho;
5. editar o plano e confirmar que ele permanece ou volta a `draft`;
6. aprovar explicitamente e confirmar o estado `approved`;
7. em “Atividades”, confirmar que somente planos aprovados aparecem na seleção;
8. editar novamente o plano e confirmar que uma atividade nova exige nova
   aprovação.

O roteiro local não comprova geração OpenAI real; esse smoke permanece separado
para a homologação autorizada.
