# CV-F — entrega operacional de feedbacks e boletins

Implementado em 16/10/2026 o fluxo de entrega híbrida escolhido:

- feedback individual sempre segue por e-mail, nunca como anúncio público;
- aviso global usa anúncio Classroom quando a turma está vinculada;
- após esgotar tentativas no Classroom, o aviso global muda para e-mail dos
  alunos ativos;
- boletins PDF usam o mesmo adapter Resend;
- idempotência por entrega evita e-mails duplicados em retentativas;
- a outbox materializa entregas por destinatário, usa lease, `SKIP LOCKED`,
  backoff exponencial e limite de cinco tentativas;
- edições posteriores criam uma nova revisão sem apagar entregas históricas;
- anexos privados não são expostos externamente; somente links HTTP(S)
  autorizados acompanham feedbacks e anúncios.

A migração `026_notification_delivery.sql` adiciona revisões e histórico por
destinatário. O OAuth passa a solicitar `classroom.announcements`, exigindo novo
consentimento dos professores existentes.

Configuração Resend: `RESEND_API_KEY` e `EMAIL_FROM`. Nesta etapa, testes usam
transportes simulados; nenhum e-mail ou anúncio real foi enviado. A migração
PostgreSQL não foi executada externamente porque o Docker local não respondeu.
