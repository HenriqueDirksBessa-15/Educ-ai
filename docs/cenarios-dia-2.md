# Cenários do Dia 2

Definidos antes da implementação de RF001 e RF004.

## Autenticação

1. Professor autoriza o Google: o callback valida `state` e PKCE, confirma e-mail verificado, cria ou atualiza o professor, protege os tokens e abre uma sessão HTTP-only.
2. Professor já cadastrado retorna: o vínculo é localizado pelo `sub` ou e-mail verificado, sem duplicação.
3. Professor nega consentimento: nenhum token ou sessão é criado e a interface apresenta falha recuperável.
4. `state` ausente, expirado ou reutilizado: o callback é recusado.
5. Google não retorna e-mail verificado: o acesso é recusado.
6. Credencial Google não configurada: a API continua viva, login fica indisponível com erro claro e o monitor registra indisponibilidade.
7. Sessão ausente, expirada ou revogada: rota protegida retorna 401.
8. Cliente envia `professorId`: o valor é ignorado; a identidade sempre vem do cookie de sessão.
9. Logout: somente a sessão atual é revogada e o cookie é removido.
10. Desconexão Google: token é revogado no provedor, credencial e sessões locais são revogadas.

## Tokens e monitoramento

1. Token de acesso expirado com refresh válido: o adaptador renova e persiste o token novo criptografado.
2. Refresh inválido/revogado: a falha é normalizada e persistida sem token, resposta bruta ou segredo.
3. OAuth, Classroom ou Forms indisponível: executar tentativa inicial e até três tentativas adicionais; registrar cada tentativa.
4. Serviço volta a responder: registrar estado ativo no ciclo seguinte.
5. Novo ciclo: executar cinco minutos após o anterior enquanto a API estiver ativa.
6. Forms sem formulário de teste configurado: registrar configuração ausente, sem afirmar que a integração foi validada.

## Interface

1. Sessão desconhecida: mostrar carregamento.
2. Não autenticado: mostrar login exclusivo Google e eventual motivo de falha do callback.
3. Autenticado: mostrar shell do professor e estado atual das integrações.
4. Falha ao consultar sessão: mostrar erro recuperável.
