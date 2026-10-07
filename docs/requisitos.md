# Matriz inicial de rastreabilidade

Fonte: DERS, seção 2.7.3, identificadores RF001–RF014. Esta é a matriz inicial por requisito; detalhar linhas por fluxo, campo e regra no início de cada módulo. Nenhum requisito está implementado.

| RF | Entrega | Fluxos e regras a validar | Etapa | Estado |
| --- | --- | --- | --- | --- |
| RF001 | Integração Google | Status Classroom/Forms/OAuth; credencial ausente/expirada; até 3 tentativas adicionais no caso descrito; intervalo de 5 min; dependentes desativados na indisponibilidade | Acesso e atividades | Pendente |
| RF002 | Integração OpenAI | Chave ausente/inválida/expirada; serviço indisponível; registro de status; tentativas e intervalo conforme especificação; bloqueio dos recursos dependentes | Acesso | Pendente |
| RF003 | Ementa e BNCC | Carga técnica; consulta por série/disciplina; histórico de atualização; habilidade ausente e fallback com revisão | Base pedagógica | Pendente |
| RF004 | Autenticar professor | Google exclusivo; existente/novo; cadastro automático; cancelamento e falha de comunicação; proteção do token/sessão | Acesso | Pendente |
| RF005 | Perfil do professor | Nome/preferências editáveis; e-mail bloqueado; turmas vinculadas; falha de importação e ausência de turma | Acesso | Pendente |
| RF006 | Turmas | Criação local/importação; campos Google bloqueados; código inválido/duplicado; aluno duplicado; falha de sincronização | Base pedagógica | Pendente |
| RF007 | Alunos | Reconciliação por e-mail; origem Google primária; importação por planilha; ingresso por código; ativo/restrito/pendente; remoção Google orientada; falhas e dados inconsistentes | Base pedagógica | Pendente |
| RF008 | Linha do tempo | Criar/editar/excluir marcos; lista vazia; impedir edição de marcos passados; exclusão vinculada depende de D02 | Materiais e cronologia | Pendente |
| RF009 | Planos de aula | Manual/IA; ementa/BNCC/materiais; campos obrigatórios; edição e reutilização; ausência de ementa; alterações estruturais bloqueadas quando em uso; histórico/arquivamento | Planos | Pendente |
| RF010 | Materiais de apoio | Upload/metadados/vínculos/visualização; formatos inválidos; quota; bloqueio de exclusão quando vinculado a conteúdo publicado | Materiais e cronologia | Pendente |
| RF011 | Atividades | Objetiva/discursiva/mista; manual/IA; plano obrigatório; revisão/publicação; prazo/gabarito/critérios; restrição estrutural após publicação; exclusão bloqueada com respostas | Atividades | Pendente |
| RF012 | Correção e avaliação | Coleta de envios; gabarito objetivo; sugestão discursiva; critérios/resposta-alvo/rigidez; revisão e ajuste; histórico; falha/vazio/ambiguidade com correção manual | Avaliação | Pendente |
| RF013 | Feedback | Individual/aviso global; IA revisada pelo professor; links/anexos; histórico/notificação; edição/exclusão na janela configurada; canal externo a validar | Devolutivas | Pendente |
| RF014 | Boletim | Individual/lote/período/filtros; média e comentários; geração/cópia histórica/envio; ausência de notas; falha de e-mail e reenvio; fontes de presença/responsáveis a decidir | Boletins | Pendente |

## Requisitos não funcionais

| Grupo do DERS | Evidência prevista |
| --- | --- |
| Aparência e usabilidade | Interface coerente com protótipos, mensagens, carregamento e adaptação a telas |
| Desempenho | Medições dos fluxos reais; definir condições de rede/dados, sem inventar limite de tempo ausente do DERS |
| Persistência e backup | Migrações, dados persistentes e demonstração de restauração |
| Segurança e auditoria | Google exclusivo, autorização por professor, tokens protegidos, HTTPS no ambiente final e histórico de ações |
| Proteção de dados | Revisão dos dados coletados e das finalidades exigidas pelo DERS; sem dados reais nas fixtures |
| Portabilidade | Validação nas duas versões estáveis mais recentes dos navegadores indicados no DERS, registradas na entrega |
| Tolerância a falhas | Tentativas automáticas, estado preservado e notificação da falha persistente |

## Registro a preencher por módulo

Para cada fluxo: RF, seção/página do PDF, cenário, entrada, resultado esperado, decisão aplicável, arquivo/caso de uso, teste e estado. Conferir formulários contra os quadros do DERS e layout contra os protótipos. Fluxos não testados permanecem pendentes.

Separar a contagem de testes unitários, integração e ponta a ponta. Aproximadamente 200 unitários é uma estimativa inicial a validar pela matriz de regras, sem quota artificial.
