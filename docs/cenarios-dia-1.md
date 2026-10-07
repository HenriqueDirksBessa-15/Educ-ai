# Cenários de aceitação - Dia 1

Definidos antes da implementação em 07/10/2026.

| ID    | Tipo              | Cenário                                      | Resultado esperado                                                       |
| ----- | ----------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| D1-01 | Reprodutibilidade | Instalar em checkout limpo                   | `npm ci` usa o lockfile sem alterar dependências                         |
| D1-02 | Configuração      | Iniciar API sem `DATABASE_URL`               | Processo encerra com nomes das variáveis inválidas, sem imprimir valores |
| D1-03 | Configuração      | Informar porta ou URL inválida               | Erro claro antes de abrir a porta                                        |
| D1-04 | Unidade           | Consultar vida com banco indisponível        | Vida retorna 200 porque o processo está ativo                            |
| D1-05 | Unidade           | Consultar prontidão com banco disponível     | Prontidão retorna 200 e `database=available`                             |
| D1-06 | Unidade           | Consultar prontidão com banco indisponível   | Prontidão retorna 503 e `database=unavailable` sem detalhes sensíveis    |
| D1-07 | Integração        | Aplicar migrações em banco vazio e reaplicar | Esquema é criado uma vez e a segunda execução não altera o resultado     |
| D1-08 | Integração        | Executar seed duas vezes                     | Permanecem dois professores fictícios, turmas distintas e sem duplicação |
| D1-09 | Integração        | Consultar vínculos dos dados fictícios       | Cada turma pertence a um professor e possui apenas suas matrículas       |
| D1-10 | Persistência      | Reiniciar API e contêiner sem remover volume | Dados previamente inseridos continuam disponíveis                        |
| D1-11 | Interface         | API e banco respondem                        | Tela mostra estágio de fundação e ambos disponíveis                      |
| D1-12 | Interface         | Requisição em andamento                      | Tela apresenta estado de carregamento                                    |
| D1-13 | Interface         | API responde, banco falha                    | Tela diferencia API ativa de banco indisponível                          |
| D1-14 | Interface         | API não responde                             | Tela apresenta erro de comunicação e opção de tentar novamente           |
| D1-15 | Qualidade         | Executar build, tipos, lint e unidades       | Todos terminam sem erro                                                  |
