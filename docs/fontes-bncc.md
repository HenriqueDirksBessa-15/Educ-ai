# Fontes BNCC

## Fonte de dados estruturados

O importador usa a release versionada do repositório [bncc-dados](https://github.com/bncc-dev/bncc-dados):

- versão de dados: `dados-2026.07.1`;
- schema: `schema-v1.0.0`;
- commit registrado no importador: `daabd7dd63ae0cac0aa520b6189e79f95c24f583`;
- proveniência por registro preservada nos campos de fonte;
- contagens validadas em modo seco: 93 EI, 1.304 EF, 183 EM e 141 Computação.

## Fonte oficial para validação

O documento oficial de validação indicado pelo projeto é o [Download BNCC do MEC](https://downloadbncc.mec.gov.br/). A carga derivada não substitui a publicação oficial: os registros mantêm arquivo, localizador e URL de origem quando disponíveis.

O banco só marca `is_official=true` quando o registro pertence à fonte validada; fixtures e dados de fallback permanecem explicitamente não oficiais.

## Processo

```powershell
npm run db:import-bncc -- --dry-run
npm run db:import-bncc
```

O primeiro comando valida schemas e contagens sem gravar no banco. O segundo aplica a carga em uma transação PostgreSQL, com upsert por documento/código e histórico. Se a carga falhar, a transação é revertida.
