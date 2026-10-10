# EDUC.AI — Ciclo vertical funcional, TDD e homologação

**Estado:** plano para aprovação e execução progressiva. **Unidade de trabalho:** etapas e módulos, não dias. **Autoridade funcional:** `Desenvolvimento_DERS_HenriqueBessa_ClaytonAraujo.pdf` (96 páginas); alterações e lacunas exigem decisão explícita. **Repositório:** `HenriqueDirksBessa-15/Educ-ai`.

## 1. Missão

Demonstrar, o quanto antes, um fluxo pedagógico real e completo: **professor faz login Google → importa ou cria turma Google Classroom → seleciona componente/ano e habilidades BNCC → associa materiais → cria e aprova plano de aula → gera e aprova atividade via OpenAI → publica Form vinculado ao Classroom → alunos fictícios respondem pelo Forms → sistema importa as submissões → corrige questões objetivas e propõe correção discursiva → professor revisa e libera notas → produz boletim PDF**.

O plano é uma **fatia vertical de ponta a ponta**, não uma reimplementação de 14 etapas. Priorizar o caminho demonstrável com dados fictícios e integrações reais, preservando código existente e registrando lacunas para refatoração por tela. É permitido um MVP visual simples, mas **não** tratar mocks/fixtures como integrações reais ou aprovação da IA como decisão do professor.

## 2. Primeira decisão técnica: auditoria rápida do esqueleto

Antes de alterar código, mapear de forma objetiva cada passo do ciclo para: telas, rotas, serviços, contratos, tabelas, integrações e testes já existentes. Verificar `README.md`, `docs/relatorio-final.md`, `docs/matriz-rastreabilidade.md`, `AUDITORIA_TECNICA_DIA_07.md`, migrações 001–022 e o DERS. Os documentos descrevem a situação em datas diferentes e **não provam** que o fluxo real esteja funcionando.

Verificar: transações, FKs, restrições de exclusão, múltiplos professores, identidade Google vs identidade local, owner/teacher no Classroom, idempotência de curso/Form/publicação/coleta, consistência da BNCC, estados de revisão/publicação/correção e localização/configuração do banco. Não trocar stack nem reescrever módulos íntegros por preferência de estilo. Produzir `docs/ciclo-vertical/00-diagnostico.md` com bloqueios P0/P1 e evidências de código.

## 3. Ambiente de homologação real

- **API e web:** URLs HTTPS de homologação, separadas da produção, com variáveis e segredos geridos no servidor. Cloud Run é opção preferencial para API; frontend pode ser servido em hospedagem web adequada.
- **Banco:** PostgreSQL em Cloud SQL (não em bucket); avaliar reaproveitamento seguro de `educai-bncc-validation` ou uma base isolada. Conferir conexão privada, migrações, backup, restauração e custo antes de escrever.
- **Arquivos:** Cloud Storage em bucket privado com IAM mínimo e validação de tamanho/tipo. O bucket guarda materiais e artefatos, não executa o banco.
- **OAuth:** configurar redirect/origens reais; confirmar consent screen, escopos exigidos e tokens. Login deve usar conta real autorizada; sem login fixture no ambiente de homologação.
- **OpenAI:** smoke de geração real com dados fictícios e limite de custo, logs técnicos sem dados pessoais/segredos; desabilitar sugestão se chave ausente ou inválida.
- **Segurança:** somente dados fictícios, acessos limitados e autorização por professor em todos os endpoints. Segredos nunca no Git, browser, logs ou relatório.
- **Deploy:** preparar CI/CD para homologação com healthcheck, migração controlada, testes pertinentes e rollback; **não executar deploy sem aprovação inicial explícita**. Após aprovação do workflow e das regras, mudanças futuras podem seguir o procedimento automatizado aprovado.

**Critério de aceite:** o professor consegue abrir a aplicação via HTTPS, autenticar com Google e consultar seus dados persistidos após reinício. Testes reais documentados com evidência, não apenas respostas mockadas.

## 4. Etapas funcionais do ciclo (sem prazo fixo)

### Etapa A — Google e turmas

1. Entrar com conta Google real; renovar consentimento para escopos adicionais, se necessário.
2. Listar **turmas reais existentes** do professor por API Classroom.
3. Criar turma real pelo Classroom quando a conta tiver permissão; registrar ID remoto sem duplicação após retentativa.
4. Associar turma a componente curricular, etapa, ano/série e, quando pertinente, múltiplos componentes. **Não assumir que a BNCC pertence automaticamente ao curso Google:** manter vínculo curricular explícito no EDUC.AI.
5. Importar alunos e estados de matrícula permitidos pela API; manter isolamento e propriedade.

**Aceite:** duas contas de professor não conseguem acessar ou modificar a turma uma da outra sem permissão explícita; curso criado é visível no Classroom real e no EDUC.AI.

### Etapa B — Materiais, BNCC e plano de aula

1. Selecionar turma e componente curricular com filtragem de habilidades BNCC compatíveis, incluindo etapa/ano; apresentar códigos e descrições oficiais com fonte.
2. Enviar PDF ou documento de teste, adicionar link, visualizar e vincular materiais à turma/plano. Validar permissões de leitura.
3. Criar plano de aula manual ou solicitar sugestão real OpenAI usando turma, série, habilidades, objetivos e materiais permitidos.
4. Mostrar campos próprios de planejamento docente: identificação, tema, objetivos, habilidades, conteúdos, metodologia/etapas, recursos, tempo, avaliação e referências. A BNCC não impõe um formulário único; não inventar obrigatoriedade nacional de layout.
5. Editar, revisar e **aprovar explicitamente** o plano; salvar vínculos e histórico.

**Aceite:** plano aprovado persiste, retorna com todas as relações reais e utiliza conteúdo curricular autorizado. Falha OpenAI não destrói rascunho/manual.

### Etapa C — Questões e publicação

1. Gerar atividade de teste baseada **no plano aprovado e nos materiais associados**, com dificuldade e tipos de questão (objetiva, discursiva ou mista).
2. Validar formato da resposta OpenAI, pontuação, alternativas, gabarito, rubrica e alinhamento ao plano; professor revisa e aprova.
3. Criar Form real via Google Forms, inserir as questões, configurar publicação/aceitação de respostas conforme a API e vincular o link em atividade real no Classroom.
4. Persistir IDs externos, vínculo das questões locais com itens Forms e estado de publicação; reexecutar sem duplicar.

**Aceite:** aluno teste consegue abrir o Form pelo Classroom. Professor consegue ver o link e o status no EDUC.AI. Nenhuma questão gerada é publicada sem aprovação humana.

### Etapa D — Resposta do aluno: real + automatizada

**Teste ponta a ponta obrigatório (real):** utilizar 1–2 contas de alunos de teste, matriculadas em uma turma de homologação. Um operador humano abre o Classroom, acessa o Forms e envia respostas fictícias, incluindo uma objetiva correta, uma incorreta e uma discursiva. Confirmar conta/permissão/identificação do respondente conforme configuração do Form.

**Teste automático repetível (sem login robótico):** salvar **fixtures sintéticas** no mesmo formato da resposta de `forms.responses.list` e injetá-las no adaptador de coleta em ambiente de teste, exercitando mapeamento questão/resposta, paginação, duplicação, submissão sem aluno, aluno de outra turma e respostas vazias. Usar API ou serviço interno de teste isolado para reproduzir a importação e correção. **Não afirmar que fixtures equivalem ao teste real no Classroom**, nem automatizar login de aluno ou contornar autenticação do Google.

A API Forms permite listar respostas, mas **não fornece um endpoint público geral equivalente a `submit response`**; por isso o envio externo real será feito pelo formulário no navegador, e a regressão automatizada cobrirá a camada de ingestão com fixtures. Registrar esta fronteira explicitamente.

### Etapa E — Coleta, correção e boletim

1. Buscar respostas reais via Google Forms, incluindo paginação e retentativa idempotente. Relacionar a turma, o Form, a questão e a matrícula do aluno corretamente.
2. Calcular nota objetiva deterministicamente e normalizar para escala prevista; registrar pendências e inconsistências.
3. Para resposta discursiva, solicitar **sugestão** de correção OpenAI com critérios/rubrica, sem torná-la nota final automática.
4. Professor revisa pontos/comentários, aprova e libera; registrar histórico e falha de devolução externa sem perder correção local.
5. Emitir boletim de teste (PDF) a partir das notas liberadas; verificar média, período, integridade, histórico e isolamento. Envio de e-mail externo só entra no aceite se houver provedor autorizado/configurado; geração e visualização do PDF não dependem dele.

**Aceite final do ciclo:** professora real consegue executar desde login até PDF do boletim de um aluno fictício; evidência de Forms e Classroom reais, correção auditável e nenhum acesso indevido entre turmas/professores.

## 5. TDD e meta de aproximadamente 200 testes unitários

**Fluxo obrigatório em toda alteração:** investigação → especificação MD → testes unitários primeiro (vermelho) → implementação mínima (verde) → refatoração → testes de integração pertinentes → smoke E2E → revisão → deploy de homologação autorizado.

Meta de produto: **aproximadamente 200 testes unitários genuínos**, sem inflar contagem com mocks triviais, integração, snapshots superficiais ou E2E. Fazer inventário dos 76 testes unitários/componentes/contratos reportados anteriormente e classificá-los individualmente antes de contabilizar. Testes de integração e E2E contam separadamente.

Distribuição **indicativa, a ajustar após inventário**: autenticação/autorização 25; turmas/matrículas 25; BNCC/materiais 25; planos 25; atividades/publicação 35; ingestão/correção 40; boletins 15; políticas/validações gerais 10 = **200**. Cobrir casos normais, erros, limites, concorrência e idempotência. Não criar testes sem comportamento relevante apenas para atingir a meta.

**Gates por módulo:** testes unitários do módulo, integração de banco/adaptador quando aplicável, regressão de fluxos afetados, build/lint/tipos e um E2E do caminho principal se impactado. Registrar o que foi testado realmente e o que ficou pendente por falta de credencial/ambiente.

## 6. Testes de isolamento (mínimo inicial)

Contas de teste autorizadas: Professor A (Turmas A/B), Professor B (Turma C), Aluno 1 (A), Aluno 2 (A/B), Aluno 3 (C), Aluno 4 (sem turma). Preferir usuários fictícios gerenciados/fornecidos legitimamente pela equipe; não é necessário criar 10 logins reais para começar.

Validar acessos cruzados negativos diretamente na API, independentemente do que a interface esconde: recursos de outros professores; plano/material de turma alheia; anexos por URL; aluno sem matrícula; reutilização de IDs externos; sincronização Classroom compartilhado; correção e boletim de aluno alheio. Regras de visibilidade de alunos no Classroom/Forms devem respeitar permissões do próprio Google; o EDUC.AI não deve criar acesso de aluno não previsto no DERS.

## 7. Arquivo por tela e decisão de produto

Após validar a fatia vertical, refatorar **uma tela por vez**. Cada tela terá `docs/telas/NN-nome.md` com: objetivo do professor, DERS, estado real, campos, regras de negócio, vínculos no banco, endpoints, casos alternativos, proposta visual, decisões do usuário, testes antes do código, aceites e histórico da revisão. Mudança fora do DERS exige autorização e registro em `docs/decisoes/` (máximo de um novo requisito autorizado). Não antecipar refatorações de outras telas sem necessidade técnica comprovada.

## 8. Skill e pipeline reutilizáveis

Criar skill `educai-ciclo-tdd` para o Codex:

- Ler somente o MD da tela/etapa, contratos associados e contexto mínimo; consultar DERS integral apenas para ambiguidades.
- Detectar impacto na arquitetura, nas permissões e em migrações.
- Escrever testes antes das alterações; executar apenas suíte pertinente durante desenvolvimento e regressão final antes do deploy.
- Validar em dois modos explicitamente separados: **simulado automatizado** e **real externo**.
- Produzir resumo curto: critérios atendidos, testes (unitários / integração / E2E), evidência, custos/chamadas externas, pendências e rollback.
- Executar deploy de homologação apenas quando autorizado pelas regras aprovadas, sem deploy de produção automático.

## 9. Primeira tarefa para o agente

**Sem refatorar tudo:** realizar um diagnóstico do caminho A → E e produzir `docs/ciclo-vertical/00-diagnostico.md` com uma tabela por ação: DERS, implementação atual, dependências, bloqueio, teste existente, menor alteração necessária. Em seguida propor o menor conjunto de patches para demonstrar login real → turma real → plano/material → atividade Forms publicada, sem sacrificar a preparação de coleta/correção/boletim.

Apresentar o plano e a lista de permissões/recursos Google Cloud antes de criar recursos, executar chamadas faturáveis, alterar banco compartilhado ou publicar. Após aprovação, realizar o trabalho por etapas até o ciclo completo, registrando evidência após cada gate. **Não marcar sucesso por documentação, mocks ou testes que não executaram.**

## 10. Critério de encerramento

A primeira versão do ciclo está aprovada quando: (a) uma conta de professor entra via OAuth real; (b) uma turma real é importada/criada no Classroom; (c) BNCC, material e plano são vinculados; (d) atividade IA é revisada e publicada via Forms/Classroom; (e) resposta real de aluno fictício é coletada; (f) objetiva corrigida e discursiva revisada; (g) boletim PDF gerado; (h) operações repetidas não duplicam dados; (i) acessos indevidos são recusados; (j) evidências distinguem integração real de simulação. As telas poderão receber acabamento posterior sem regressão deste ciclo.
