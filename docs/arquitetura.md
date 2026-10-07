# Arquitetura inicial

Estado: proposta de implementação, registrada no passo 0. Escolhas técnicas não alteram o DERS.

Frontend React/TypeScript; backend Node.js/TypeScript modular; PostgreSQL conforme o DERS. Confirmar frameworks, versões e compatibilidade na fundação. Banco local em contêiner; destino final GCP. Não iniciar migração de Supabase: este repositório estava vazio.

| Caminho | Responsabilidade |
| --- | --- |
| `apps/web` | Interface e formulários, sem segredos ou acesso direto ao banco |
| `apps/api` | Casos de uso, autorização, regras, persistência e adaptadores externos |
| `packages/contracts` | Entradas, saídas, estados e erros compartilhados |
| `database/migrations` | Alterações versionadas do PostgreSQL |
| `database/seeds` | BNCC/ementas e dados de teste identificados |
| `tests/unit` | Regras isoladas |
| `tests/integration` | Banco, autorização, rotinas e adaptadores |
| `tests/e2e` | Percurso do professor pela aplicação |

Organizar backend por módulos: acesso/perfil; integrações; currículo; turmas/alunos; cronologia; materiais; planos; atividades; avaliação; feedback; boletins. Domínio não depende de HTTP ou SDK externo. Adaptadores traduzem contratos dos provedores. UI não decide autorização.

Entidades previstas: professor, turma, aluno, matrícula, ementa, habilidade BNCC, marco, material, plano, atividade, questão, resposta, correção, feedback, boletim, credencial, status de serviço e auditoria. Definir relações/campos na fundação a partir do DERS; não criar campos indefinidos para presença/responsáveis.

Materiais usam armazenamento de objetos com vínculos no banco. Desenvolvimento deve disponibilizar adaptador local. Rotinas agendadas funcionam sem navegador aberto. Tentativas de sincronização, publicação e envio preservam IDs externos e evitam efeitos duplicados.

Uma base de código de backend é suficiente inicialmente; rotinas podem ter processo separado sem virar microsserviços. A configuração final de hospedagem, e-mail e bibliotecas fica registrada em decisões antes do módulo afetado.
