# CV-B1.1 — upload privado de materiais

## Escopo

Concluída em 16/10/2026 a fatia local de arquivos do RF010. O professor pode
enviar um arquivo, vinculá-lo a uma turma própria, listá-lo como material e
baixá-lo somente por uma rota autenticada. Nenhum objeto foi enviado ao GCS e
nenhum recurso externo foi criado.

## Contrato e segurança

- upload multipart em streaming, com um arquivo e um campo de metadados;
- limite decidido de 100 MB por arquivo, configurável para valores menores por
  `MATERIAL_UPLOAD_MAX_BYTES`;
- PDF, DOCX, PPT/PPTX, MP4, JPEG, PNG, GIF e WebP permitidos;
- extensão, MIME declarado e assinatura inicial do conteúdo precisam ser
  compatíveis;
- SVG e tipos executáveis não são aceitos;
- nome normalizado, chave opaca gerada somente no servidor e proteção contra
  travessia de diretório;
- `storageKey` nunca faz parte da resposta pública;
- download exige sessão válida, propriedade do professor e material ativo;
- resposta usa anexo, `nosniff`, cache privado sem armazenamento e nome seguro;
- falha de vínculo ou limite remove o objeto parcial/órfão.

## Persistência e armazenamento

Os metadados e vínculos com turma/BNCC são gravados em uma única instrução
PostgreSQL. Os bytes ficam no diretório privado configurado por
`MATERIAL_STORAGE_DIRECTORY`, ignorado pelo Git, atrás da interface
`MaterialStorage`. A implementação GCS permanece uma etapa operacional futura;
o bucket de artefatos não foi utilizado.

Ao excluir um material não publicado, o registro é removido e o objeto local é
apagado de forma idempotente. Materiais vinculados a conteúdo publicado
continuam protegidos contra exclusão.

## Interface

O painel de materiais permite escolher entre link externo e arquivo privado,
exibe formatos/limite aceitos e usa a rota autenticada para baixar arquivos já
cadastrados.

## Verificações

- contratos rejeitam categoria de link e identificador físico enviado pelo
  cliente;
- unidades cobrem assinatura incompatível, truncamento, rollback do objeto,
  persistência atômica e travessia de diretório;
- componentes HTTP cobrem upload multipart e download como anexo privado;
- componente web cobre montagem do `FormData` e atualização da lista;
- integração PostgreSQL cobre isolamento entre professores e não exposição da
  chave de armazenamento.

Resultado: `npm run check` aprovado com 17 testes de contratos, 100 testes de
API e 10 testes web; 8 cenários PostgreSQL aprovados em banco temporário; smoke
OpenAI ignorado por ser opt-in; audit de produção sem vulnerabilidades.

O roteiro não contém dados pessoais, credenciais nem chamadas faturáveis.
