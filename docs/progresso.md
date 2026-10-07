# Progresso

Atualizado em 07/10/2026.

## Entrega atual - Dia 1

Implementados:

- workspace npm com web, API e contratos;
- PostgreSQL local com volume persistente e healthcheck;
- configuração por ambiente, validação e encerramento gracioso;
- liveness e readiness com estados distintos;
- primeira migração de professor, currículo/ementa/BNCC, turma, aluno/matrícula e status técnico;
- seed idempotente com dois professores e turmas fictícias isoladas;
- contratos iniciais de erros, paginação, identidade, perfil, currículo, turma e aluno;
- interface mínima com carregamento, sucesso, banco indisponível e falha da API;
- testes unitários e integração separados;
- documentação operacional, arquitetura, decisões e matriz.

## Verificações

Executadas após a estabilização:

| Verificação                                    | Resultado                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm ci --ignore-scripts --no-audit --no-fund` | Aprovada; 381 pacotes instalados pelo lockfile                                                   |
| `npm run check`                                | Aprovada; formatação, lint, tipos, 12 testes unitários/componentes e builds de API/web/contratos |
| `npm run test:integration`                     | Aprovada; 2 testes de PostgreSQL em banco temporário                                             |
| `npm run db:migrate` duas vezes                | Aprovada; primeira aplicação criou o esquema e segunda informou banco atualizado                 |
| `npm run db:seed` duas vezes                   | Aprovada; permaneceram 2 professores fictícios e 2 turmas distintas                              |
| Reinício de `postgres` sem remover volume      | Aprovada; contagem de professores fictícios permaneceu 2 antes/depois                            |
| API com banco disponível                       | Aprovada; liveness 200 e readiness 200/`available`                                               |
| API com banco parado                           | Aprovada; liveness 200 e readiness 503/`unavailable`                                             |
| Retomada do banco                              | Aprovada; readiness voltou a 200/`available`                                                     |
| API compilada recebendo `SIGINT`               | Aprovada; logs confirmaram início e conclusão do encerramento gracioso                           |
| Interface em `http://localhost:5173`           | Aprovada no navegador; estágio, API e PostgreSQL renderizados como disponíveis                   |

Observações do ambiente:

- Docker Desktop estava inicialmente desligado e foi iniciado para a validação.
- O primeiro pull da imagem PostgreSQL foi lento, mas concluiu sem erro.
- O Docker Desktop local exigiu timeout de conexão de 10 segundos no pool; depois de aquecido, readiness respondeu normalmente.
- npm informou que ESLint 9.38 saiu de suporte, porém ESLint 10 exige Node 20.19 ou superior. A versão 9.38 permanece fixada por compatibilidade com o Node 20.16 disponível e deve ser atualizada junto com o runtime, não isoladamente.

## Bloqueios

- O PDF indicado pelo usuário termina antes da seção de diagramas. A cópia de 96 páginas foi usada para inspeção técnica, mas a confirmação como versão oficial permanece aberta.
- A carga BNCC oficial não foi fornecida. A seed contém somente uma referência simulada, inequivocamente marcada como não oficial.

## Próximo passo

Dia 2: OAuth Google, cadastro automático do professor, sessão segura e monitoramento real de OAuth, Classroom e Forms, após disponibilização das credenciais.
