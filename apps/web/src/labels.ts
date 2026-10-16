import type {
  Bulletin,
  ClassSummary,
  StudentSummary,
  Feedback,
  LessonPlan,
  MaterialCategory,
  MilestoneType,
} from "@educai/contracts";

// Teacher-facing words for internal values. Screens must never print the raw
// enum or error code; see docs/telas/01-proposta-ui.md, sections 5.3 and 5.4.

export function lessonPlanStatusLabel(status: LessonPlan["status"]): string {
  return {
    draft: "Rascunho",
    generated: "Sugestão para revisar",
    reviewed: "Revisado",
    approved: "Aprovado",
  }[status];
}

export function classSourceLabel(source: ClassSummary["source"]): string {
  return { google: "Do Google Sala de Aula", local: "Criada no EDUC.AI" }[
    source
  ];
}

export function enrollmentStatusLabel(
  status: StudentSummary["status"],
): string {
  return {
    active: "Ativo",
    restricted: "Restrito",
    pending: "Aguardando confirmação",
  }[status];
}

export function materialCategoryLabel(category: MaterialCategory): string {
  return {
    reading: "Leitura",
    presentation: "Apresentação",
    video: "Vídeo",
    image: "Imagem",
    link: "Link",
    other: "Outro",
  }[category];
}

export function milestoneTypeLabel(type: MilestoneType): string {
  return {
    lesson: "Aula",
    assessment: "Avaliação",
    event: "Evento",
    deadline: "Prazo",
    other: "Outro",
  }[type];
}

export function notificationLabel(
  notification: NonNullable<Feedback["notification"]>,
): string {
  if (notification.status === "failed") return "Não enviado – tente de novo";
  const google = notification.channel === "google_classroom";
  if (notification.status === "sent")
    return google ? "Publicado no Google Sala de Aula" : "Enviado por e-mail";
  return google ? "Publicando no Google Sala de Aula…" : "Enviando por e-mail…";
}

export function bulletinStatusLabel(status: Bulletin["status"]): string {
  return {
    generated: "Ainda não enviado",
    pending: "Enviando…",
    sent: "Enviado",
    failed: "Não enviado – tente de novo",
  }[status];
}

const GENERIC_ERROR =
  "Algo deu errado. Tente de novo; se continuar, fale com o suporte.";

const ERROR_MESSAGES: Record<string, string> = {
  GOOGLE_CREDENTIAL_MISSING:
    "Precisamos da sua permissão no Google de novo. Saia e entre com Google.",
  GOOGLE_RECONSENT_REQUIRED:
    "Precisamos da sua permissão no Google de novo. Saia e entre com Google.",
  GOOGLE_PERMISSION_DENIED:
    "Sua conta do Google não pode publicar nesta turma. Confira se você é professor dela no Google Sala de Aula.",
  GOOGLE_CLASSROOM_ID_MISSING:
    "Esta turma ainda não está no Google Sala de Aula. Abra a turma e crie-a lá primeiro.",
  GOOGLE_POINTS_MUST_BE_INTEGER:
    "No Google Formulários, cada questão precisa valer um número inteiro de pontos.",
  GOOGLE_DISTRIBUTION_INCOMPLETE:
    "Algumas turmas ainda não receberam a atividade. Tente de novo.",
  GOOGLE_RATE_LIMITED:
    "O Google está ocupado agora. Tente de novo em alguns minutos.",
  EMAIL_PROVIDER_NOT_CONFIGURED:
    "O envio de e-mail ainda não está disponível. O documento ficou salvo.",
  EMAIL_CREDENTIAL_INVALID:
    "O envio de e-mail não está funcionando agora. O documento ficou salvo; avise o suporte.",
  EMAIL_RATE_LIMITED:
    "Muitos e-mails enviados de uma vez. Tente de novo em alguns minutos.",
  EMAIL_MESSAGE_INVALID:
    "O e-mail não foi aceito. Confira o endereço do aluno no Google Sala de Aula.",
  INTEGRATION_UNAVAILABLE:
    "Não conseguimos falar com o Google agora. Tente de novo; se continuar, saia e entre com Google de novo para renovar a permissão.",
  VALIDATION_ERROR: "Confira os dados preenchidos e tente de novo.",
  FORBIDDEN: "Você não tem acesso a este item.",
  NOT_FOUND: "Este item não existe mais. Atualize a página.",
  UNAUTHENTICATED: "Sua entrada expirou. Entre com Google de novo.",
};

export function errorMessage(code: string | null | undefined): string {
  if (!code) return GENERIC_ERROR;
  const known = ERROR_MESSAGES[code];
  if (known) return known;
  if (code.startsWith("OPENAI_"))
    return "A IA não conseguiu responder agora. Seu texto foi mantido. Tente de novo ou escreva você mesmo.";
  if (code.startsWith("EMAIL_"))
    return "O e-mail não foi enviado. O documento ficou salvo; tente de novo mais tarde.";
  if (code.startsWith("GOOGLE_"))
    return "O Google não respondeu como esperado. Tente de novo em alguns minutos.";
  return GENERIC_ERROR;
}

export function formatDate(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "pt-BR",
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
