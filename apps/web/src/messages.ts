import type {
  EligibleFeedbackSubmission,
  Feedback,
  FeedbackScope,
} from "@educai/contracts";

import { notificationLabel } from "./labels.js";

// Pure rules behind the messages page; see docs/telas/08-recados.md.

export function messageStatusLabel(feedback: Feedback): string {
  if (feedback.status === "sent") {
    if (!feedback.notification) return "Enviado";
    // The server already retried delivery; the page has no way to resend.
    if (feedback.notification.status === "failed")
      return "Não foi enviado – avise o suporte";
    return notificationLabel(feedback.notification);
  }
  return {
    draft: "Rascunho",
    generated: "Sugestão da IA para revisar",
    reviewed: "Revisado",
    deleted: "Excluído",
  }[feedback.status];
}

export function recipientText(feedback: Feedback): string {
  return feedback.scope === "individual"
    ? (feedback.studentName ?? "Aluno")
    : `Turma ${feedback.className ?? ""}`.trim();
}

export function groupEligible(items: EligibleFeedbackSubmission[]) {
  const groups = new Map<string, EligibleFeedbackSubmission[]>();
  for (const item of items) {
    const list = groups.get(item.activityTitle) ?? [];
    list.push(item);
    groups.set(item.activityTitle, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([activityTitle, list]) => ({
      activityTitle,
      items: [...list].sort((a, b) =>
        a.studentName.localeCompare(b.studentName, "pt-BR"),
      ),
    }));
}

export function suggestedTitle(scope: FeedbackScope, context: string): string {
  return scope === "individual"
    ? `Recado sobre ${context}`
    : "Aviso para a turma";
}

export type MessageErrors = Partial<
  Record<"target" | "title" | "content" | "link", string>
>;

export function validateMessage(form: {
  targetId: string;
  title: string;
  content: string;
  linkUrl: string;
}): MessageErrors {
  const errors: MessageErrors = {};
  if (!form.targetId) errors.target = "Escolha quem vai receber.";
  if (!form.title.trim()) errors.title = "Escreva o título.";
  if (!form.content.trim()) errors.content = "Escreva a mensagem.";
  if (form.linkUrl.trim() && !/^https?:\/\/\S+\.\S+/.test(form.linkUrl.trim()))
    errors.link = "Use um endereço completo, começando com https://";
  return errors;
}

export function confirmationFor(scope: FeedbackScope, name: string) {
  return scope === "individual"
    ? {
        title: `Enviar recado para ${name}?`,
        body: `O recado será enviado por e-mail só para ${name}.`,
      }
    : {
        title: `Enviar aviso para a turma ${name}?`,
        body: `O aviso aparecerá no mural do Google Sala de Aula da turma ${name} e todos os alunos poderão vê-lo. Se o Google falhar, enviamos por e-mail para cada aluno.`,
      };
}
