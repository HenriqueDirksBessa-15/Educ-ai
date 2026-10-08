# Progresso

Atualizado em 08/10/2026.

## Entrega atual - Dia 2

Implementados:

- OAuth Google exclusivo com `state`, PKCE S256, callback e tratamento de negação/falha;
- cadastro ou atualização do professor pelo `sub`, nome, e-mail verificado e imagem Google;
- sessões opacas no PostgreSQL e cookie HTTP-only;
- tokens cifrados com AES-256-GCM, renovação pelo cliente oficial e revogação;
- logout, desconexão Google e shell protegido;
- fronteira que ignora `professorId` do cliente e resolve identidade apenas pela sessão;
- monitor de OAuth, Classroom e Forms a cada cinco minutos, com tentativa inicial e três adicionais;
- histórico de tentativa, código normalizado e último estado por serviço;
- tela de login, falha recuperável, carregamento e shell autenticado;
- migração de credencial, sessão e autorização descartável;
- contratos de sessão e status de integrações;
- projeto Google Cloud `educai-511017`;
- bucket privado `gs://educai-511017-test-artifacts` em São Paulo para artefatos futuros.

O bucket não executa Docker e ainda não é consumido pelo produto. Nenhum deploy foi realizado.

## Verificações

| Verificação                 | Resultado                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run check`             | Aprovada em 08/10: formatação, lint, tipos, 23 testes unitários/componentes e builds de contratos/API/web             |
| `npm audit --omit=dev`      | Aprovada após atualizar Fastify para 5.12.5; zero vulnerabilidades de produção                                        |
| Migração no banco existente | Aprovada antes do reinício; `002_google_auth.sql` aplicada                                                            |
| `npm run test:integration`  | Aprovada antes do reinício; 3 cenários em banco temporário, incluindo OAuth simulado, sessão e tokens cifrados        |
| URL OAuth real              | Aprovada após configurar as URIs; Google abriu “Sign in with Google” para o app `educai`, sem `redirect_uri_mismatch` |
| Callback real completo      | Não executado após o reinício porque o computador não executa Docker/PostgreSQL local                                 |
| Classroom real              | Pendente do primeiro login/callback completo                                                                          |
| Forms real                  | Pendente de `GOOGLE_FORMS_TEST_FORM_ID` e do primeiro login                                                           |
| Bucket Google Cloud         | Aprovada; criado em `SOUTHAMERICA-EAST1`, acesso uniforme e prevenção de acesso público                               |

## Restrições e bloqueios atuais

- O computador informado pelo usuário não executa Docker. A suíte de integração foi aprovada antes do reinício, mas não foi repetida na estabilização final.
- A validação ponta a ponta com conta Google depende de PostgreSQL disponível para persistir `state`, professor, tokens e sessão.
- Nenhum ID de formulário de teste foi informado; Forms permanece corretamente como não configurado, sem simulação de sucesso.
- O PDF indicado originalmente termina antes dos diagramas; a cópia completa de 96 páginas segue como referência técnica ainda não confirmada formalmente.
- A carga BNCC oficial ainda não foi fornecida.

RF001 e RF004 não são marcados como totalmente concluídos enquanto os fluxos reais dependentes acima não forem executados. A implementação e os testes isolados estão prontos.

## Próximo passo

Dia 3: ementa/BNCC e perfil do professor, preservando a autenticação já implementada. Antes de integrar Forms, informar um formulário de teste. Para repetir testes PostgreSQL sem Docker local, decidir futuramente por runner de CI ou banco efêmero; não criar Cloud SQL pago sem autorização.
