# Próxima entrega: fundação

Objetivo: iniciar web/API/banco localmente a partir de um checkout limpo, sem antecipar telas ou regras fora do DERS.

## Trabalho

1. Verificar versões e documentação oficial das bibliotecas escolhidas. Registrar escolhas e comandos em arquitetura/README.
2. Criar workspace, lockfile, scripts de desenvolvimento/build/checagem e ambiente de banco local.
3. Definir contratos básicos de erro e autenticação; modelar tabelas/campos necessários a acesso, perfil, turma e integrações conforme o DERS.
4. Criar migrações reproduzíveis, configuração por ambiente e exemplo sem valores secretos.
5. Preparar adaptadores Google/OpenAI/e-mail e mecanismos de teste sem chamadas pagas por padrão.
6. Preparar testes separados por tipo e instruções para execução.

## Aceitação

* Instalação reproduzível com lockfile.
* Banco iniciado e migrações aplicadas a banco vazio.
* API e web iniciam pelos comandos documentados; a interface identifica o estágio de desenvolvimento.
* Configuração ausente gera erro claro, sem expor segredos.
* Contratos compilam e há tratamento padronizado de erros.
* Nenhum RF declarado pronto sem fluxos e validação.

Testes de regras devem preceder sua implementação nos próximos módulos. Não criar testes que apenas confirmem a existência de diretórios ou repitam constantes. Teste de migração é de integração.
