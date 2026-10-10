# Cenários do Dia 14

1. Respostas da API incluem cabeçalhos de segurança e não expõem detalhes internos.
2. Mutação com origem divergente é rejeitada; CORS continua limitado à origem configurada.
3. Limite global reduz abuso sem registrar cookies ou autorização nos logs.
4. Toda mutação autenticada cria evento de auditoria sem corpo da requisição.
5. Exportação LGPD não inclui tokens; exclusão revoga sessão e anonimiza a identidade.
6. Sessões, estados OAuth e credenciais técnicas expiradas obedecem à retenção configurada.
7. Login de demonstração funciona somente em desenvolvimento, com flag explícita e fixture.
8. Backup produz dump custom e SHA-256; restauração exige confirmação e banco alvo explícito.
9. Interface oferece foco visível, atalho de conteúdo e layout de telefone/tablet.
10. Chrome e Edge executam smoke público; navegadores não disponíveis são registrados como lacuna.
11. Migrações, unidades, integração, build, audit de dependências e E2E formam o gate final.
