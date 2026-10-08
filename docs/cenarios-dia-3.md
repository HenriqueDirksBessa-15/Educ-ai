# Cenários do Dia 3

Definidos antes da implementação de RF002, RF003 e RF005.

## OpenAI

1. Chave ausente: estado `missing`, sem chamada externa e recursos dependentes bloqueados.
2. Chave configurada antes da autorização de integração real: estado `deferred`, sem apresentar serviço como disponível.
3. Fixture de teste disponível: adaptador retorna estado ativo sem rede.
4. Chave inválida, expirada ou serviço indisponível: códigos normalizados, histórico e bloqueio dos recursos dependentes.
5. Novo ciclo do monitor: cinco minutos, com até quatro tentativas quando a verificação real for autorizada.

## Currículo e BNCC

1. Carga técnica com fonte, versão e checksum: cria áreas, componentes, ementas e habilidades de forma idempotente.
2. Carga repetida: não duplica entidades nem histórico equivalente.
3. Consulta por componente e ano/série: retorna fonte e marcação de oficialidade.
4. Habilidade ausente: retorna coleção vazia e `reviewRequired=true`, sem inventar código oficial.
5. Fixture simulada: sempre informa `isFixture=true` e `isOfficial=false`.
6. Falha de carga: registra estado de erro e mantém a última carga válida.

## Perfil do professor

1. Sessão válida: consulta nome, e-mail, imagem, preferência e turmas.
2. Nome e preferência editáveis: atualização somente dos campos permitidos.
3. E-mail controlado pelo Google: campo ausente na entrada de atualização e inalterável no backend.
4. Professor sem turma: resposta bem formada com lista vazia.
5. Sessão ausente ou professor inexistente: `401` sem aceitar `professorId` do cliente.
