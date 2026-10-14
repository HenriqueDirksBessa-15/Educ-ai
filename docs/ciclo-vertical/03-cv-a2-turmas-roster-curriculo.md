# CV-A2 — Turmas, roster e perfil curricular

**Estado:** concluído em código e banco temporário em 14/10/2026; migração no
banco de desenvolvimento e smoke Google real ainda não executados.

## Objetivo

Completar a Etapa A localmente: criar/importar turma sem duplicação, sincronizar
alunos do Classroom e manter etapa, ano e componentes curriculares explícitos no
EDUC.AI. A entrega inclui uma interface mínima para o professor executar e
inspecionar o fluxo.

## Cenários escritos antes da implementação

1. Uma turma local própria pode ser publicada no Classroom; uma turma alheia ou
   já Google não pode ser republicada por outro professor.
2. A criação remota usa `[EDUCAI-CLASS:<uuid-local>]`; se a resposta da primeira
   tentativa se perder, a repetição encontra o curso pelo marcador e não cria
   outro.
3. Curso novo é ativado após `courses.create`; falha parcial permanece
   recuperável pela repetição.
4. O roster é paginado e ignora entradas sem ID, nome ou e-mail.
5. Aluno Google é reconciliado por ID externo e e-mail; a origem Google prevalece
   sobre planilha/código.
6. Sincronização repetida não duplica aluno ou matrícula e não remove uma
   restrição aplicada pelo professor.
7. Turma sem ID Classroom não tenta buscar roster.
8. Etapa, ano/série e um ou mais componentes pertencem ao EDUC.AI, inclusive em
   turma importada; não são inferidos do nome do curso.
9. Perfil curricular de turma alheia retorna não encontrado e componentes
   duplicados são rejeitados.
10. A interface permite criar turma local, importar turmas, publicar uma turma
    local, sincronizar roster e salvar o perfil curricular, com estados de
    carregamento, sucesso e erro.

## Decisões

- criação remota é uma ação explícita posterior à criação local, preservando o
  rascunho se Google falhar;
- curso criado pelo EDUC.AI usa estado `PROVISIONED` e é promovido a `ACTIVE`;
- alunos ausentes em uma sincronização não são apagados nem automaticamente
  restritos, porque isso destruiria contexto histórico sem regra aprovada;
- perfil curricular aceita múltiplos componentes e usa valores de etapa
  fechados: educação infantil, fundamental I, fundamental II e ensino médio;
- nesta etapa não há chamada externa nem migração aplicada ao banco configurado.

## Aceite

- contratos, adapter, repositório e rotas possuem testes de sucesso, repetição e
  isolamento;
- migração 023 aplica em banco vazio no gate de integração autorizado;
- interface oferece o fluxo mínimo sem enviar `professorId`;
- regressão, lint, tipos, formato e build passam;
- smoke real fica separado em CV-HML.

## Resultado do gate

- `npm run check`: aprovado;
- 14 contratos, 76 testes de API e 5 testes web aprovados;
- 6 testes PostgreSQL aprovados em `educai_test_*`, incluindo migrações 001–023,
  isolamento curricular e roster repetido; a base temporária foi removida;
- smoke OpenAI ignorado por ser opt-in;
- Cloud SQL Auth Proxy encerrado após o teste;
- nenhuma chamada Classroom/Forms/OpenAI e nenhuma migração aplicada ao banco
  `educai`.

## Roteiro de teste manual local

Pré-requisito: aplicar a migração 023 no banco de desenvolvimento somente após
autorização explícita.

1. iniciar API e web pelos comandos do README;
2. entrar pela demonstração local;
3. em “Turmas e alunos”, criar uma turma com nome, ano/série e código;
4. abrir a turma e salvar etapa, ano/série e componentes separados por vírgula;
5. publicar no Classroom: em desenvolvimento a resposta é fixture e fica
   identificada como tal;
6. abrir novamente e sincronizar alunos; fixture retorna roster vazio;
7. confirmar que a turma e o perfil persistem após recarregar a página.

O teste com Google real exige ambiente HTTPS com `NODE_ENV=production`, novo
consentimento para os escopos e contas fictícias autorizadas; ele pertence a
CV-HML e não deve ser confundido com o roteiro local.
