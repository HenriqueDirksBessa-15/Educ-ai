# Segurança e LGPD

## Controles implementados

- autenticação Google, sessão opaca e cookie HTTP-only/SameSite;
- cookie `__Host-` e `Secure` em produção;
- tokens Google cifrados com AES-256-GCM;
- CORS por origem configurada e rejeição de origem divergente em mutações;
- Helmet/CSP, limite global de requisições e corpo HTTP de 1 MiB;
- logs com credenciais e cookies redigidos;
- autorização por professor em repositórios e rotas;
- auditoria imutável de mutações sem corpo, tokens ou conteúdo pedagógico;
- exportação do professor sem credenciais;
- exclusão que revoga sessões/credenciais e anonimiza a identidade;
- retenção configurável para dados técnicos expirados.

## Minimização e retenção

O sistema não armazena senha Google. Boletins não inventam presença, participação ou responsável. Prompts usam apenas o contexto pedagógico autorizado. `DATA_RETENTION_DAYS` vale para credenciais revogadas e históricos técnicos; registros pedagógicos, solicitações LGPD, auditoria e cópias emitidas permanecem para integridade e precisam de política institucional antes de uma eliminação adicional.

## Direitos do titular

- `GET /api/privacy/export`: exporta perfil e metadados dos recursos próprios.
- `DELETE /api/privacy/account`: exige `{"confirmation":"EXCLUIR"}`, revoga acesso e anonimiza identidade.

A exclusão não apaga histórico pedagógico relacionado a alunos. Esse limite é informado na interface e preserva integridade/referências. Uma política institucional deve definir base legal e prazo desses registros.

## Limitações conhecidas

- não houve teste de penetração independente;
- CSP cobre a API; cabeçalhos da hospedagem estática devem repetir a política na web;
- o provedor real de e-mail e a entrega da outbox ainda precisam de configuração;
- backup/restauração real depende das ferramentas PostgreSQL ausentes nesta máquina;
- Firefox não estava instalado para o smoke local do navegador.
