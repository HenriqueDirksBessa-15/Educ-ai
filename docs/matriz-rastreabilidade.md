# Matriz de rastreabilidade

Atualizada em 07/10/2026. A fundação cria suporte técnico; nenhum RF está concluído.

| Requisito         | Fluxo coberto no Dia 1                   | Persistência/contrato                                            | Endpoint/tela            | Teste/evidência                              | Estado          |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------------- | ------------------------ | -------------------------------------------- | --------------- |
| RF001             | Preparação de histórico de status Google | `integration_status`                                             | Apenas readiness técnico | Migração/seed de integração                  | Fundação apenas |
| RF002             | Preparação de histórico de status OpenAI | `integration_status`                                             | Apenas readiness técnico | Migração/seed de integração                  | Fundação apenas |
| RF003             | Estrutura de área, ementa e habilidade   | `curriculum_area`, `syllabus`, `bncc_skill`, contrato curricular | Sem endpoint pedagógico  | Seed marcada não oficial                     | Fundação apenas |
| RF004             | Limite de identidade Google              | contrato `identitySchema`, campos externos em professor          | Sem autenticação         | Unidade rejeita provedor diferente de Google | Fundação apenas |
| RF005             | Campos iniciais do perfil                | `professor`, contrato de perfil                                  | Sem endpoint de perfil   | Migração/contrato                            | Fundação apenas |
| RF006             | Propriedade e IDs local/Google da turma  | `class_group`, contrato de resumo                                | Sem endpoint de turma    | Integração da seed                           | Fundação apenas |
| RF007             | Aluno, origem e estado da matrícula      | `student`, `enrollment`, contrato de aluno                       | Sem endpoint de aluno    | Integração da seed                           | Fundação apenas |
| RF008–RF014       | Nenhum fluxo implementado                | Relações somente previstas na arquitetura                        | Não aplicável            | Não aplicável                                | Pendente        |
| RNF persistência  | Banco local e volume                     | PostgreSQL + migrações                                           | Readiness                | Migração vazia, seed repetida, reinício      | Parcial         |
| RNF segurança     | Configuração e limites de identidade     | Config validada e erros padronizados                             | CORS e health checks     | Unidades de configuração/health              | Parcial         |
| RNF portabilidade | Fundação web                             | React responsivo inicial                                         | Tela de estágio          | Build e componente                           | Parcial         |
