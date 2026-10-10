# Operação do EDUC.AI

## Instância local de demonstração

1. Configure `ENABLE_DEV_AUTH=true` e `VITE_ENABLE_DEV_AUTH=true` somente no `.env` local.
2. Inicie PostgreSQL 16, execute `npm run db:migrate` e `npm run db:seed`.
3. Execute `npm run dev`.
4. Abra `http://localhost:5173` e use **Entrar na demonstração local**.

A rota de demonstração retorna 404 quando `NODE_ENV` não é `development` ou quando a flag está desabilitada. Ela seleciona apenas um professor marcado como fixture e nunca cria credencial Google.

## Health, logs e encerramento

- `/api/health/live` verifica o processo.
- `/api/health/ready` verifica também o PostgreSQL.
- Logs estruturados removem `authorization`, `cookie` e `set-cookie`.
- `SIGINT` e `SIGTERM` encerram HTTP, monitor e pool dentro do timeout configurado.

## Retenção

Execute diariamente:

```powershell
npm run db:retention
```

`DATA_RETENTION_DAYS` controla credenciais revogadas e estados técnicos. Sessões expiradas e estados OAuth consumidos/expirados são removidos antecipadamente. Históricos pedagógicos, auditoria, solicitações LGPD e PDFs não entram nessa limpeza automática.

## Backup

O agendador da infraestrutura deve executar diariamente:

```powershell
./scripts/backup-database.ps1 -DatabaseUrl $env:DATABASE_URL -OutputDirectory C:\educai-backups
```

O script usa `pg_dump` em formato custom, sem proprietário/privilégios, e grava manifesto SHA-256. O diretório deve ficar criptografado, privado e fora do repositório.

## Ensaio de restauração

Crie um banco vazio isolado e restaure explicitamente:

```powershell
./scripts/restore-database.ps1 `
  -DatabaseUrl $env:EDUCAI_RESTORE_TEST_URL `
  -BackupPath C:\educai-backups\educai-AAAAMMDD-HHMMSS.dump `
  -ConfirmRestore
npm run db:migrate
```

Nunca aponte o ensaio para produção. Após restaurar, valide contagens, `/api/health/ready`, login de teste e os checksums de `schema_migrations`. Registre data, arquivo, SHA-256, banco alvo e resultado. Nesta entrega os scripts foram revisados, mas o ensaio real ficou pendente porque `pg_dump`/`pg_restore` não estão instalados nesta máquina.

## Falhas externas

- Google/OpenAI: estados e códigos normalizados permanecem persistidos; rascunhos locais são preservados.
- Coleta: jobs `failed` podem ser retomados sem duplicar `responseId`.
- Classroom: aprovação local permanece quando a devolução falha.
- E-mail: PDF permanece imutável e cada reenvio cria outra tentativa.

## Produção/GCP

Antes de publicar: configure HTTPS no balanceador, origem CORS exata, cookies `Secure`, segredos no Secret Manager, Cloud SQL privado/proxy, backups automáticos, retenção e provedor de e-mail. Execute migrações e smoke em homologação antes de produção.
