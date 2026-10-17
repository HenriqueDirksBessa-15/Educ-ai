# Ambiente de testes GCP

Criado em 16/10/2026 no projeto `educai-511017`, região `southamerica-east1`.

## Recursos

- Cloud Run público `educai-test`, mínimo 0 e máximo 2 instâncias;
- URL: `https://educai-test-821892619668.southamerica-east1.run.app`;
- Artifact Registry `educai-test`, imagem válida `20261016-2`;
- conta de serviço `educai-test-runner`;
- banco isolado `educai_test` e usuário `educai_test_app` no `educai-dev`;
- jobs `educai-test-migrate` e `educai-test-seed`;
- prefixo GCS `educai-test/materials` no bucket privado de testes;
- segredos com prefixo `educai-test-` no Secret Manager.

O container multi-stage usa Node 20.16, roda sem privilégios e leva somente
dependências de produção, builds e migrações. O audit de produção ficou zerado.

## Evidências

Cloud Build, migração inicial/repetida e seed fictícia foram aprovados. Root,
asset JavaScript, live e ready retornaram HTTP 200; CORS e CSP foram confirmados;
dev-login e rota API inexistente retornaram 404. OAuth inicia com state, PKCE e
callback do ambiente.

## Ação manual obrigatória

No cliente OAuth Web do Google, adicione exatamente:

- origem: `https://educai-test-821892619668.southamerica-east1.run.app`;
- callback: `https://educai-test-821892619668.southamerica-east1.run.app/api/auth/google/callback`.

## Atualização

Execute `./scripts/deploy-gcp-test.ps1`. O script publica a imagem, executa
migrações, atualiza o job de seed sem executá-lo, troca a revisão e verifica
live/ready.

## Custos e rollback

Cloud Run escala a zero e o banco reutiliza a instância já existente. Artifact
Registry, Cloud Build, Secret Manager e tráfego podem cobrar por uso. Para
rollback, remova serviço/jobs, banco/usuário, segredos `educai-test-*`,
repositório e prefixo GCS somente após confirmar cada alvo.
