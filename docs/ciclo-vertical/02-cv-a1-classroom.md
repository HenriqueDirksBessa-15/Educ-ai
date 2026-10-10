# CV-A1 — Classroom real e status por professor

**Estado:** concluído localmente em 10/10/2026, sem chamada externa.

## Objetivo

Substituir a sincronização de turmas sempre-fixture por uma fronteira Classroom
de produção testável, sem executar chamadas reais nesta etapa, e impedir que o
status Google de um professor seja apresentado a outro.

## Cenários escritos antes da implementação

1. Com credencial válida, listar todas as páginas de cursos em que `me` é
   docente e normalizar somente cursos com ID e nome.
2. Preservar a credencial renovada retornada pelo provedor de token.
3. Normalizar 401, 403, 429, 5xx e falha de rede sem persistir resposta bruta.
4. Sem credencial do professor, a rota de sincronização retorna indisponível e
   não chama Classroom.
5. Com escopos antigos, a rota exige novo consentimento antes da chamada.
6. Repetir a sincronização mantém o upsert por professor e ID do curso.
7. O monitor verifica todas as credenciais ativas, não apenas a mais recente.
8. A consulta de status retorna Google do professor autenticado e OpenAI global;
   nunca Google de outro professor.
9. Em teste/desenvolvimento, fixtures continuam explicitamente identificadas.

## Decisões

- `teacherId=me` limita a listagem a cursos em que a conta é docente.
- Classroom não fornece ano letivo estruturado; a importação registra “A
  definir” até CV-A2 criar o perfil curricular explícito. Não será inferido pelo
  título do curso.
- os escopos de sincronização ficam separados dos escopos de publicação para
  que cada caso de uso valide apenas o mínimo que consome;
- o adapter recebe um provedor de access token injetável nos testes; nenhuma
  chave do `.env` é lida pelos testes unitários.

## Aceite

- testes cobrem paginação, refresh, normalização e isolamento de status;
- `app.ts` usa adapter de produção somente em `NODE_ENV=production` e fixture
  explícita nos demais ambientes;
- `/api/classes/sync` usa a credencial da sessão e salva eventual refresh;
- monitor itera todas as credenciais ativas;
- gates locais passam sem chamadas Google/OpenAI.

## Fora desta etapa

Criação de curso, roster/alunos, perfil curricular da turma, interface e smoke
real pertencem a CV-A2/CV-HML.

## Resultado do gate

- API: 66 testes aprovados, incluindo 9 casos adicionados/ajustados nesta etapa;
- typecheck e lint aprovados;
- adapter real não foi instanciado contra o Google; todos os HTTPs foram
  simulados;
- nenhum recurso cloud, credencial, banco compartilhado ou custo externo foi
  utilizado.
