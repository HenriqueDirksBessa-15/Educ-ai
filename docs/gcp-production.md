# Produção no Google Cloud

Estado em 20/10/2026. O ambiente está no projeto `educai-511017`, região
`southamerica-east1`, e publica o frontend React e a API Fastify no mesmo
serviço e origem.

## URLs

- plataforma: `https://educai.dev.br` (registro A salvo no Registro.br; aguarda
  a transição dos servidores DNS e a emissão final do certificado);
- endereço técnico validado:
  `https://educai-821892619668.southamerica-east1.run.app`;
- API: `/api` na mesma origem; não há subdomínio `api.educai.dev.br`.

## Arquitetura e recursos

```text
Internet -> balanceador HTTPS global -> serverless NEG -> Cloud Run educai
                                                        -> Cloud SQL educai-dev/educai
                                                        -> GCS educai/materials
Cloud Scheduler -> Cloud Run Jobs (workers e retenção)
```

| Recurso           | Nome/configuração                                                                                              | Finalidade                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Cloud Run         | `educai`, revisão `educai-8a80ddb`, 1 vCPU, 512 MiB, concorrência 40, mínimo 0, máximo 1                       | SPA e API com escala a zero e limite de conexões ao banco |
| Artifact Registry | `educai-test/educai:8a80ddb`, digest `sha256:dd89b36c0b450066bb2124a791d63ef6c0c6a22126a71cd95535bab78e57c702` | imagem imutável publicada                                 |
| Cloud SQL         | `educai-dev`, PostgreSQL 16, banco `educai`, usuário `educai_app`, `db-f1-micro`, 10 GB SSD, zonal             | banco existente preservado                                |
| Backup Cloud SQL  | `1792458906805`, `pre-prod-deploy-1f02509`                                                                     | ponto de retorno anterior à migração `026`                |
| GCS               | `gs://educai-511017-test-artifacts/educai/materials`                                                           | uploads privados persistentes                             |
| Cloud Run Jobs    | `educai-migrate`, `educai-workers`, `educai-retention`                                                         | migrações, ciclos externos e retenção                     |
| Cloud Scheduler   | `educai-workers` a cada 5 minutos; `educai-retention` às 04:15, fuso de São Paulo                              | execução sem instância HTTP mínima                        |
| Runtime SA        | `educai-runner@educai-511017.iam.gserviceaccount.com`                                                          | Cloud SQL Client, acesso aos segredos e objetos GCS       |
| Scheduler SA      | `educai-scheduler@educai-511017.iam.gserviceaccount.com`                                                       | invocação apenas dos jobs operacionais                    |
| IP global         | `educai-ip`: `136.81.217.99`                                                                                   | endereço A do domínio                                     |
| Load balancer     | NEG `educai-neg`, backend `educai-backend`, mapas `educai-url-map` e `educai-http-redirect`                    | HTTPS global e redirect 80 -> 443                         |
| Certificado       | `educai-cert`, domínio `educai.dev.br`                                                                         | TLS gerenciado; ativa após o DNS apontar para o IP        |

O Cloud SQL mantém backups automáticos às 03:00 UTC, retenção de sete cópias e
agora possui proteção contra exclusão acidental. A instância continua sem PITR
e usa o perfil econômico compartilhado, que não possui SLA.

## Configuração e segredos

Variáveis literais relevantes:

| Variável                     | Produção                                                  |
| ---------------------------- | --------------------------------------------------------- |
| `NODE_ENV`                   | `production`                                              |
| `WEB_ORIGIN`                 | `https://educai.dev.br`                                   |
| `GOOGLE_REDIRECT_URI`        | `https://educai.dev.br/api/auth/google/callback`          |
| `OPENAI_MODEL`               | `gpt-5-mini`                                              |
| `MATERIAL_STORAGE_BACKEND`   | `gcs`                                                     |
| `MATERIAL_STORAGE_BUCKET`    | `educai-511017-test-artifacts`                            |
| `MATERIAL_STORAGE_PREFIX`    | `educai/materials`                                        |
| `MATERIAL_UPLOAD_MAX_BYTES`  | `31457280` (30 MiB, abaixo do limite HTTP/1 do Cloud Run) |
| `BACKGROUND_WORKERS_ENABLED` | `false` no serviço; os jobs executam os ciclos            |
| `ENABLE_DEV_AUTH`            | `false`                                                   |

Segredos no Secret Manager, todos injetados somente no servidor:

- `educai-database-url`;
- `educai-token-key`;
- `educai-google-client-id`;
- `educai-google-client-secret`;
- `educai-google-forms-test-form-id`;
- `educai-openai-api-key`.

`RESEND_API_KEY` e `EMAIL_FROM` não estão configurados. Envio por e-mail
permanece indisponível de forma recuperável; Classroom continua sendo usado
quando aplicável.

Para criar ou rotacionar deliberadamente os segredos a partir do `.env` local:

```powershell
./scripts/configure-gcp-production-secrets.ps1
```

O script nunca imprime valores. A rotação da `TOKEN_ENCRYPTION_KEY` exige uma
migração própria; trocá-la diretamente impediria a leitura de tokens Google já
armazenados.

## Atualização

1. Finalize e commite a etapa; a árvore deve estar limpa.
2. Execute verificações e revise o diff.
3. Em um checkout limpo do commit, execute:

```powershell
./scripts/deploy-gcp-production.ps1
```

O script cria uma imagem identificada pelo commit, faz backup, atualiza os três
jobs, executa a migração uma única vez, troca a revisão do serviço e valida
root/live/ready. Seeds nunca são executadas em produção. Use
`-SmokeBaseUrl` com a URL técnica apenas enquanto o domínio estiver pendente.

## Domínio e HTTPS

Os nameservers são `a.auto.dns.br` e `b.auto.dns.br`. O registro abaixo foi
salvo no painel do Registro.br em 20/10/2026:

| Tipo | Nome                 | Valor           |
| ---- | -------------------- | --------------- |
| `A`  | `@` (ou campo vazio) | `136.81.217.99` |

Preserve o MX nulo e o TXT `v=spf1 -all` existentes. Não é necessário CNAME e
não deve ser usado o endereço `run.app` como valor DNS. Depois da propagação:

```powershell
Resolve-DnsName educai.dev.br -Type A
gcloud compute ssl-certificates describe educai-cert `
  --project educai-511017 --global
```

No momento da entrega, o painel indicava servidores DNS em transição por cerca
de 1h19, os autoritativos ainda não publicavam o A e o certificado aparecia como
`PROVISIONING/FAILED_NOT_VISIBLE`. Esse estado é esperado até o fim da transição
e não requer recriar o balanceador ou o certificado.

Quando o certificado estiver `ACTIVE` e o domínio responder 200, restrinja o
Cloud Run para impedir acesso direto fora do balanceador:

```powershell
gcloud run services update educai --project educai-511017 `
  --region southamerica-east1 `
  --ingress internal-and-cloud-load-balancing --quiet
```

## Google OAuth

No cliente OAuth Web do projeto, preserve localhost e homologação e adicione:

- origem JavaScript: `https://educai.dev.br`;
- URI de redirecionamento:
  `https://educai.dev.br/api/auth/google/callback`.

Não publique a tela de consentimento nem amplie escopos como parte do deploy.
Os monitores confirmaram Google OAuth, Classroom e Forms como ativos com a
credencial já armazenada, mas o login pelo novo domínio só pode ser declarado
funcional depois dessa alteração e de um login de teste.

## Verificações realizadas

| Verificação                                       | Resultado                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Imagem Node 22 e build de produção                | aprovado; runtime final com zero vulnerabilidades de produção                    |
| Migração `026_notification_delivery.sql`          | aplicada após backup; contagens de dados preservadas                             |
| Root, asset versionado e fallback de rota interna | HTTP 200; HTML sem cache e JS imutável                                           |
| `/api/health/live` e `/api/health/ready`          | HTTP 200; PostgreSQL disponível                                                  |
| CSP, HSTS, CORS e origem de mutações              | aprovados; origem indevida retorna 403                                           |
| Dev login e API inexistente                       | 404                                                                              |
| Google OAuth start                                | 302 para Google com callback de produção, `state` e PKCE S256                    |
| Google OAuth/Classroom/Forms                      | monitor real `active`; nenhuma turma ou mensagem foi alterada                    |
| OpenAI                                            | monitor `active` e geração estruturada real com fixture pedagógica aprovada      |
| GCS                                               | objeto-fixture criado, lido e removido                                           |
| Workers agendados                                 | execuções reais concluídas; filas previamente confirmadas vazias                 |
| Logs                                              | URL redigida; sem OAuth code/state, Authorization, cookies ou erros da aplicação |
| HTTP -> HTTPS no IP do LB                         | 301 preservando caminho e query                                                  |

## Rollback

Liste revisões e direcione todo o tráfego para a anterior:

```powershell
gcloud run revisions list --service educai --project educai-511017 `
  --region southamerica-east1
gcloud run services update-traffic educai --project educai-511017 `
  --region southamerica-east1 --to-revisions REVISAO_ANTERIOR=100
```

Atualize os jobs para a mesma tag/digest anterior antes da próxima execução.
A migração `026` é compatível com a revisão anterior. Restauração do backup
`1792458906805` é último recurso, requer janela de manutenção e confirmação
explícita porque substitui o estado atual do banco.

## Custos e orçamento

A conta de faturamento ativa possui orçamento mensal de R$ 100, com alertas em
50%, 90%, 100% e 150%. Esses alertas não bloqueiam consumo. O principal custo
fixo incremental é o balanceador global; Cloud Run e jobs escalam a zero.

Estimativa de baixo tráfego, 730 horas/mês e câmbio de referência assumido de
R$ 5,60 por US$ 1:

| Parcela                                    |         USD/mês |           BRL/mês | Premissa                                                                                           |
| ------------------------------------------ | --------------: | ----------------: | -------------------------------------------------------------------------------------------------- |
| Balanceador global                         |           18,25 |            102,20 | primeiros cinco forwarding rules por US$ 0,025/h; os dois rules do EDUC.AI compartilham essa faixa |
| Cloud SQL existente                        |           13,20 |             73,92 | `db-f1-micro` zonal em São Paulo (~US$ 11,53) + 10 GiB SSD (~US$ 1,70)                             |
| Cloud Run, Jobs e Scheduler                |       0,00-2,00 |        0,00-11,20 | mínimo zero, baixa utilização e franquias da conta                                                 |
| GCS, Artifact Registry, segredos e backups |       0,00-1,00 |         0,00-5,60 | poucos objetos/imagens, seis versões de segredo e backup incremental pequeno                       |
| **Total fixo/baixo uso**                   | **31,45-34,45** | **176,12-192,92** | antes de tráfego relevante                                                                         |

Custos variáveis: processamento/egresso do balanceador e internet, chamadas
Cloud Run acima da franquia, crescimento de banco/backup/GCS e tokens OpenAI.
OpenAI é faturada fora do Google Cloud e não foi projetada sem volume de uso.
O orçamento de R$ 100 provavelmente emitirá alerta; isso não interrompe o
serviço.

Referências: [Load Balancing](https://cloud.google.com/load-balancing/pricing),
[Cloud SQL](https://cloud.google.com/sql/pricing) e
[Cloud Run](https://cloud.google.com/run/pricing).
