# CV-D/E — coleta, correção e boletim simulados

## Objetivo

Provar em banco efêmero o caminho completo entre respostas sintéticas no
formato do Google Forms e o boletim PDF, preservando idempotência, isolamento e
autoridade docente sem chamar serviços externos.

## Cenários escritos antes da implementação

1. Um corpus versionado reproduz páginas de `forms.responses.list` sem chamada
   de rede.
2. A coleta associa respostas às questões pelo `questionId` persistido na
   CV-C, e não pela ordem do Form.
3. Executar duas coletas do mesmo corpus atualiza as submissões existentes sem
   duplicá-las.
4. Resposta de aluno matriculado segue para correção; aluno externo, ausência
   de e-mail e resposta objetiva vazia seguem para revisão manual.
5. Resposta objetiva correta recebe seus pontos; incorreta recebe zero; a nota
   mista permanece pendente até a decisão docente sobre a discursiva.
6. Sugestão discursiva não altera a nota. O professor revisa, aprova e produz o
   histórico imutável antes da liberação.
7. Sem identidade Classroom completa, a liberação ocorre localmente como
   `not_available` e uma repetição responde `already_released`.
8. Professor alheio não coleta a atividade, não corrige a submissão e não lê o
   PDF.
9. O boletim contém somente nota aprovada/liberada, feedback enviado, média e
   snapshot PDF do aluno fictício.

## Corpus sintético v1

O arquivo `google-forms-responses-v1.json` contém duas páginas e quatro
submissões:

- aluno matriculado com objetiva correta e discursiva preenchida;
- aluno externo com objetiva incorreta;
- resposta sem e-mail;
- segunda resposta do aluno matriculado com objetiva vazia e discursiva
  ausente.

O coletor fixture permanece vazio por padrão. O corpus só é injetado
explicitamente por teste, evitando que execução de desenvolvimento crie notas
ou respostas fictícias silenciosamente.

## Aceite

- corpus bruto versionado é normalizado pela mesma fronteira de coleta;
- repetição mantém quatro submissões e incrementa a execução sem duplicar IDs;
- três submissões inconsistentes ficam em revisão manual;
- a submissão válida percorre objetiva, discursiva, revisão, aprovação e
  liberação local idempotente;
- PDF começa com assinatura `%PDF-`, contém snapshot de nota 8 e é recusado a
  outro professor;
- regressão, lint, tipos, formato, build e PostgreSQL passam;
- nenhuma API Google/OpenAI, deploy ou migração no banco `educai` é executada.

## Resultado do gate

- `npm run check`: aprovado;
- 16 contratos, 87 testes de API e 9 testes web aprovados;
- 8 testes PostgreSQL aprovados em `educai_test_*` com migrações 001–025;
- duas coletas do corpus resultaram em quatro submissões, três revisões manuais
  e uma submissão válida corrigida/liberada com nota 8;
- boletim PDF e isolamento Professor A/B aprovados;
- smoke OpenAI ignorado por ser opt-in;
- bases temporárias removidas e Cloud SQL Auth Proxy encerrado.

## Roteiro para a homologação real

1. publicar a atividade da CV-C para uma turma fictícia autorizada;
2. realizar manualmente quatro envios equivalentes ao corpus v1;
3. encerrar ou vencer a atividade e executar a coleta duas vezes;
4. comparar contagens, motivos de revisão e vínculos por `questionId` com o
   resultado sintético;
5. revisar e aprovar a discursiva como professor;
6. liberar a nota no Classroom e confirmar a mesma nota no boletim PDF;
7. registrar IDs, horários, custo e limpeza sem incluir dados pessoais reais.

Esse roteiro pertence à CV-HML e depende das autorizações externas já
documentadas.
