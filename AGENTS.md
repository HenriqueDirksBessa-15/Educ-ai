# Instruções de trabalho

## Escopo

O DERS do EducAI é a fonte de autoridade. Implementar RF001 a RF014, fluxos principais/alternativos e requisitos não funcionais. Não confundir com documentação do CropAI.

Cada ação visível no frontend precisa de referência no DERS. Não adicionar cobrança, treinamento de IA, painel institucional ou recursos por conveniência. Referências antigas são visuais e precisam ser confrontadas com o DERS.

Qualquer mudança funcional no DERS exige decisão de Henrique. No máximo um requisito adicional pode ser proposto; não há nenhum aprovado. Ambiguidades não autorizam escolher silenciosamente. Registrar evidência, opções e recomendação em `docs/decisoes.md`; continuar o trabalho independente.

## Execução

Trabalhar em uma entrega delimitada por sessão. Ler progresso, arquitetura e módulo afetado; consultar o DERS completo quando a especificação local não responder à dúvida. Se faltar acesso ao DERS, não inventar campos ou regras.

Sequência: investigação, planejamento, critérios e testes das regras, implementação, validação e revisão. Implementar cada módulo com persistência, regras, API e interface. Usar testes unitários para regras isoladas; não contar testes de integração como unitários.

Não redesenhar a arquitetura, atualizar todas as dependências nem reler todo o projeto sem necessidade. Manter contratos compartilhados e adaptadores externos. Mudança arquitetural relevante precisa ser registrada com motivação e impacto.

Validar os testes afetados e as verificações necessárias à entrega. Regressão completa nos marcos de integração e antes da entrega final. Não repetir verificações já aprovadas sem mudança relevante. Registrar comandos e resultados em progresso; testes não executados devem ser explicitados.

## Integridade e acesso

Aplicar autorização no backend para todos os dados da turma e do professor. Chaves e tokens ficam no servidor, fora do git e dos logs. Dados simulados devem ser identificados; não afirmar que uma integração real funciona por haver somente mocks.

Publicação de material pedagógico e liberação de avaliações seguem revisão/aprovação do professor. Rotinas devem evitar duplicação quando repetidas. Monitoramento externo segue intervalos e tentativas do DERS.

Não apagar nem sobrescrever trabalho de terceiros. Deploy, publicação do ambiente e migrações em produção exigem autorização explícita de Henrique. Commits de desenvolvimento não equivalem a autorização de deploy.

## Encerramento

Atualizar `docs/progresso.md` e a matriz de rastreabilidade: entrega, arquivos, verificações, pendências e próximo passo. Um requisito fica concluído apenas com todos os fluxos aplicáveis e validação registrada.
