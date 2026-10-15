# CV-HML — homologação externa autorizada

## Escopo autorizado

Em 15/10/2026 foi autorizada a execução real com os recursos já configurados do
projeto `educai-511017`, banco `educai-dev`, conta docente e contas fictícias.
Não houve deploy público, criação de bucket, novo segredo ou dado de aluno real.

## Preparação

- migrações 024 e 025 aplicadas ao banco `educai` após 23 migrações previamente
  registradas;
- Classroom API e Forms API já estavam habilitadas;
- Drive API foi habilitada porque a reconciliação idempotente do Form depende
  de `drive.file`;
- a credencial OAuth armazenada possuía todos os escopos previstos e renovou o
  access token sem novo consentimento;
- a conta Google pessoal precisou ser ativada manualmente como professora no
  Classroom antes de permitir `courses.create`.

## Recursos de homologação

- turma local: `4221de3c-c1f8-4832-af7f-0081728be75a`;
- curso Classroom: `892449771929`;
- plano aprovado: `c24106f9-add8-4fd1-9ca9-87784d6dcc86`;
- atividade: `7e2b5a84-a081-4892-be15-92cc985f31e0`;
- Form: `1_TyF0LkMN-aX4h112zu3_9Zyl6VB9mzV4PvvLBbnOG4`;
- trabalho Classroom vigente: `892510798612`;
- boletim: `1671d42a-5fbd-445c-842d-fc891447ffda`.

Os recursos usam títulos `EDUCAI HML` e dados exclusivamente fictícios. Foram
mantidos para inspeção da evidência; o marcador local permite identificá-los
para rollback posterior.

## Divergências descobertas pela API real

1. IDs de item escolhidos pela aplicação foram recusados como `Invalid ID`,
   apesar de a referência permitir IDs fornecidos na criação. O publicador
   passou a tratar `itemId` e `questionId` como valores opacos atribuídos pelo
   Forms e a persistir o conjunto retornado.
2. Questões de parágrafo não aceitam `correctAnswers`. A discursiva mantém
   somente `pointValue`; resposta-alvo e critérios permanecem no EDUC.AI para
   revisão docente.
3. Conta Google pessoal não coleta e-mail por padrão. O Form agora usa
   `emailCollectionType: VERIFIED` e exige a identidade Google do respondente.
4. A edição de configurações deve ocorrer também na reconciliação de Forms já
   existentes, sem recriar itens.
5. Um Form anexado pela Classroom API aparece como link. O campo de material
   `form` é somente leitura; tentativa via `driveFile` foi recusada por
   visibilidade e a alternativa por URL canônica não produziu trabalho válido.

## Forms e estado “Concluída” no Classroom

O autoencerramento existe para **Criar → Atividade com teste**, criada pela
interface do Classroom, quando o Form é o único anexo. A API pública não expõe
esse tipo de criação. O trabalho criado pelo EDUC.AI permanece uma atividade
com link; portanto o aluno envia o Form e depois marca a tarefa como
concluída/entregue.

O endpoint `studentSubmissions.turnIn` não resolve essa lacuna: ele exige
`classroom.coursework.me` e só pode ser chamado pelo próprio aluno. Adicionar
OAuth discente ampliaria o produto e contraria a fronteira atual do DERS.

## Resultado Google real

- um curso real criado e ativado após a ativação docente;
- Form real com duas questões, IDs persistidos e e-mail verificado obrigatório;
- um trabalho Classroom real, associado ao projeto OAuth e publicado;
- roster real com um aluno fictício sincronizado;
- duas respostas reais coletadas: a anterior à exigência de e-mail foi isolada
  para revisão manual; a nova foi reconciliada com o aluno;
- objetiva corrigida em 2/2;
- resposta discursiva “não equivale” revisada pelo professor em 0/3;
- nota final 4/10, equivalente a 2/5 pontos no Classroom;
- submissão devolvida e confirmada remotamente como `RETURNED` com
  `draftGrade = assignedGrade = 2`;
- boletim PDF de 1.534 bytes com assinatura `%PDF-`.

## Idempotência e isolamento

- segunda coleta: `attemptCount = 2`, duas submissões preservadas;
- dois mapeamentos de questão preservados;
- três versões de histórico imutável: revisão, aprovação e liberação;
- apenas um trabalho remoto contém o marcador da atividade;
- correção já liberada permaneceu com nota 4 e retorno `returned` após a
  repetição.

## Gates finais

- `npm run check`: aprovado com 16 contratos, 87 testes de API e 9 testes web;
- 8 testes PostgreSQL aprovados em banco efêmero com migrações 001–025;
- migrações 024–025 confirmadas no banco de desenvolvimento;
- proxy encerrado após as verificações;
- nenhum deploy público ou envio de e-mail real.

## OpenAI real — bloqueado

O smoke opt-in foi executado uma vez. A validação respondeu
`OPENAI_API_KEY_INVALID`; nenhuma geração estruturada ocorreu. É necessário
substituir `OPENAI_API_KEY` por uma chave válida e repetir somente
`RUN_OPENAI_INTEGRATION=true npm run test:integration:openai` para concluir
essa parte da CV-HML.

## Rollback

Quando a inspeção não for mais necessária:

1. excluir o trabalho `892510798612`;
2. arquivar ou excluir o curso `892449771929`;
3. mover o Form `1_TyF0LkMN-aX4h112zu3_9Zyl6VB9mzV4PvvLBbnOG4` para a lixeira;
4. arquivar atividade, plano, material e turma locais marcados `EDUCAI HML`;
5. manter apenas este registro sem e-mails, tokens ou conteúdo pessoal.
