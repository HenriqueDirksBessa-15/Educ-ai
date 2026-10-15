# CV-B1 — materiais por link

## Objetivo

Permitir que o professor autenticado cadastre um material externo HTTP(S),
vincule-o a uma ou mais turmas próprias e abra o link pela interface. Esta etapa
não implementa upload: `storageKey` e metadados de arquivo não podem ser
fornecidos pelo navegador antes da escolha e implementação do armazenamento
privado.

## Cenários escritos antes da implementação

1. Um link exige título, categoria, URL HTTP(S) e ao menos uma turma.
2. Protocolos não navegáveis, turmas repetidas e habilidades BNCC repetidas são
   rejeitados no contrato antes da persistência.
3. O endpoint deriva o professor da sessão e não aceita `professorId` como prova
   de acesso.
4. Uma turma de outro professor faz a criação falhar sem deixar material órfão.
5. Material e vínculos com turmas/BNCC são criados em uma única instrução SQL,
   portanto a operação é atômica.
6. A listagem padrão omite arquivados, pode solicitá-los explicitamente e
   retorna os IDs reais das turmas e habilidades vinculadas.
7. A interface permite selecionar turma, preencher título, descrição, categoria
   e URL, mostra sucesso/erro, atualiza a lista e abre o link com proteção contra
   acesso ao contexto da janela.

## Decisões

- URL externa é a única origem gravável nesta etapa e aceita apenas `http` ou
  `https`.
- A categoria continua explícita porque um link pode representar leitura,
  vídeo, apresentação, imagem ou outro recurso.
- Upload, download autorizado e visualização de arquivo privado dependem da
  escolha de bucket/adaptador e permanecem fora da CV-B1.
- Habilidades BNCC continuam opcionais na API; a seleção curricular visual será
  concluída na CV-B2 junto do plano completo.

## Aceite

- contratos, repositório, rota e componente web cobrem sucesso, validação e
  isolamento;
- teste PostgreSQL comprova criação, vínculos, filtro de arquivados e recusa de
  turma alheia sem registro parcial;
- regressão, lint, tipos, formato e build passam;
- nenhuma API externa é chamada e nenhum banco compartilhado é alterado.

## Resultado do gate

- `npm run check`: aprovado;
- 15 contratos, 80 testes de API e 7 testes web aprovados;
- 7 testes PostgreSQL aprovados em base `educai_test_*`, incluindo recusa de
  turma alheia sem material órfão, retorno dos vínculos e filtro de arquivados;
- smoke OpenAI ignorado por ser opt-in;
- base temporária removida e Cloud SQL Auth Proxy encerrado;
- nenhuma migração aplicada ao banco `educai`, nenhuma API externa chamada e
  nenhum bucket criado.

## Roteiro de teste manual local

1. iniciar API e web com o banco de desenvolvimento já migrado;
2. entrar pela demonstração local e manter ao menos uma turma própria;
3. em “Linha do tempo e materiais”, informar título e URL HTTP(S), selecionar a
   turma e a categoria e adicionar o material;
4. confirmar a mensagem de sucesso e o item na lista;
5. abrir o título do material em nova aba e confirmar o destino;
6. repetir com protocolo `file:` ou sem turma e confirmar que a criação não é
   aceita.

Upload e visualização de arquivo privado permanecem bloqueados até a escolha do
bucket/adaptador e não devem ser simulados com uma `storageKey` do cliente.
