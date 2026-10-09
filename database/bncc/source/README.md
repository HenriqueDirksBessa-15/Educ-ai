# Snapshot BNCC versionado

Este diretório contém o snapshot canônico usado pelo importador local do EducAI.

- Fonte: https://github.com/bncc-dev/bncc-dados
- Commit fixado: `daabd7dd63ae0cac0aa520b6189e79f95c24f583`
- Data-version declarada pela fonte: `dados-2026.07.1`
- Schema declarado pela fonte: `schema-v1.0.0`
- Fonte oficial de validação: https://downloadbncc.mec.gov.br/
- BNCC oficial complementar: https://www.gov.br/mec/pt-br/escola-em-tempo-integral/BNCC_EI_EF_110518_versaofinal.pdf

## Conteúdo

- `dados/bncc-2018/`: Educação Infantil, Ensino Fundamental, Ensino Médio, estrutura, marcos legais e perfis;
- `dados/computacao-2022/`: complemento de Computação;
- `schema/`: JSON Schemas draft 2020-12;
- `DECISOES.md`, `CHANGELOG.md`, `CITATION.cff` e licenças da fonte.

Os JSONs são tratados como fonte canônica. O importador não altera códigos ou textos e registra o commit, versão, arquivo e checksum no banco. Qualquer nova versão deve entrar como novo snapshot e passar pelas validações antes de substituir a versão ativa.
