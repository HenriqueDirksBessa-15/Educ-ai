# CV-B1.2 — backend Google Cloud Storage

## Escopo

Implementado em 16/10/2026 o backend GCS substituível para arquivos privados
de materiais. A seleção é explícita por configuração; o backend local permanece
o padrão. Nenhum objeto foi enviado ao bucket real nesta etapa.

## Configuração

- `MATERIAL_STORAGE_BACKEND=local|gcs` seleciona o adapter;
- `MATERIAL_STORAGE_BUCKET` é obrigatório somente para `gcs`;
- `MATERIAL_STORAGE_PREFIX` isola os objetos da aplicação dentro do bucket;
- `MATERIAL_STORAGE_DIRECTORY` continua exclusivo do backend local;
- Application Default Credentials fornece a identidade da carga, sem chave de
  serviço armazenada no repositório.

O processo deve receber apenas `storage.objects.create`,
`storage.objects.get` e `storage.objects.delete` no bucket/prefixo necessário;
o papel predefinido `roles/storage.objectUser` cobre essa fronteira.

## Garantias

- upload por streaming na API JSON com `ifGenerationMatch=0`, impedindo
  sobrescrita caso uma chave opaca já exista;
- download autenticado pelo servidor; o bucket nunca é exposto como URL
  pública ou assinada ao navegador;
- exclusão trata objeto ausente como sucesso idempotente;
- falha de upload tenta remover o objeto de resultado ambíguo sem mascarar o
  erro original;
- prefixo, bucket e nome do objeto são codificados na URL;
- a mesma validação de extensão, MIME e assinatura da camada de serviço vale
  para os dois backends.

## Testes

Unidades simulam token ADC e transporte HTTP, cobrindo upload, precondição,
download, exclusão e limpeza após falha. O smoke real é opt-in:

```powershell
$env:RUN_GCS_INTEGRATION="true"
npm run test:integration:gcs
```

O smoke exige `MATERIAL_STORAGE_BUCKET` e ADC com acesso ao prefixo. Ele cria,
lê e remove um objeto fictício único. Não foi executado nesta etapa.

Verificações locais: `npm run check` aprovado com 17 contratos, 103 testes de
API e 10 testes web; audit de produção sem vulnerabilidades; smoke GCS coletado
e ignorado sem a flag opt-in.
