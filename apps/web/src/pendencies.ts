import type {
  Activity,
  ActivityCollectionSummary,
  Bulletin,
  Feedback,
  LessonPlan,
} from "@educai/contracts";

import type { RouteId } from "./router.js";

// Everything the home page needs, loaded once by the shell.
export type Overview = {
  plans: LessonPlan[];
  classes: Array<{ id: string; name: string; hasSubject: boolean }>;
  activities: Activity[];
  collections: ActivityCollectionSummary[];
  feedbacks: Feedback[];
  bulletins: Bulletin[];
};

export type Pendency = {
  id: string;
  tone: "action" | "warning";
  title: string;
  detail?: string;
  actionLabel: string;
  route: RouteId;
};

const TO_CORRECT = new Set([
  "pending",
  "suggested",
  "manual_required",
  "reviewed",
]);
const DEADLINE_WINDOW_MS = 48 * 60 * 60 * 1000;

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

type Submission = ActivityCollectionSummary["submissions"][number];

function submissions(overview: Overview): Submission[] {
  return overview.collections.flatMap((item) => item.submissions);
}

function plansToApprove(overview: Overview): LessonPlan[] {
  return overview.plans.filter(
    (plan) => !plan.isArchived && plan.status !== "approved",
  );
}

function dayKey(date: Date, timeZone?: string): string {
  return date.toLocaleDateString("en-CA", { timeZone });
}

function closingText(due: Date, now: Date, timeZone?: string): string {
  const time = due.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (dayKey(due, timeZone) === dayKey(now, timeZone)) return `hoje às ${time}`;
  if (dayKey(due, timeZone) === dayKey(tomorrow, timeZone))
    return `amanhã às ${time}`;
  const day = due.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
  });
  return `em ${day} às ${time}`;
}

export function computePendencies(
  overview: Overview,
  now: Date,
  timeZone?: string,
): Pendency[] {
  const result: Pendency[] = [];
  const titles = new Map(
    overview.activities.map((item) => [item.id, item.title]),
  );

  for (const item of overview.collections) {
    const count = item.submissions.filter((submission) =>
      TO_CORRECT.has(submission.correctionStatus),
    ).length;
    if (count === 0) continue;
    result.push({
      id: `correct-${item.activityId}`,
      tone: "action",
      title: `${plural(count, "resposta", "respostas")} esperando sua correção`,
      detail: titles.get(item.activityId),
      actionLabel: "Corrigir",
      route: "correcoes",
    });
  }

  const all = submissions(overview);
  const approved = all.filter((item) => item.correctionStatus === "approved");
  if (approved.length > 0)
    result.push({
      id: "approved",
      tone: "action",
      title: `${plural(approved.length, "nota aprovada", "notas aprovadas")} ainda não ${approved.length === 1 ? "devolvida" : "devolvidas"}`,
      actionLabel: "Devolver",
      route: "correcoes",
    });

  const failedReturns = all.filter(
    (item) => item.classroomReturnStatus === "failed",
  );
  if (failedReturns.length > 0)
    result.push({
      id: "return-failed",
      tone: "warning",
      title: `${plural(failedReturns.length, "nota", "notas")} não ${failedReturns.length === 1 ? "chegou" : "chegaram"} ao Google Sala de Aula`,
      actionLabel: "Tentar de novo",
      route: "correcoes",
    });

  const plans = plansToApprove(overview);
  if (plans.length > 0)
    result.push({
      id: "plans",
      tone: "action",
      title:
        plans.length === 1
          ? `Plano “${plans[0]!.title}” aguardando sua aprovação`
          : `${plans.length} planos aguardando sua aprovação`,
      actionLabel: "Revisar",
      route: "aulas",
    });

  for (const group of overview.classes.filter((item) => !item.hasSubject))
    result.push({
      id: `subject-${group.id}`,
      tone: "action",
      title: `A turma ${group.name} ainda não tem matéria definida`,
      detail: "Sem isso, as habilidades da BNCC não aparecem ao planejar.",
      actionLabel: "Definir",
      route: "turmas",
    });

  const closing = overview.activities
    .filter((item) => {
      if (item.status !== "published" || item.archivedAt) return false;
      const left = new Date(item.dueAt).getTime() - now.getTime();
      return left > 0 && left <= DEADLINE_WINDOW_MS;
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  for (const item of closing)
    result.push({
      id: `due-${item.id}`,
      tone: "action",
      title: `${item.title} fecha ${closingText(new Date(item.dueAt), now, timeZone)}`,
      detail: `${plural(item.responseCount, "resposta recebida", "respostas recebidas")}`,
      actionLabel: "Ver",
      route: "atividades",
    });

  const failedFeedbacks = overview.feedbacks.filter(
    (item) => item.notification?.status === "failed",
  ).length;
  if (failedFeedbacks > 0)
    result.push({
      id: "feedback-failed",
      tone: "warning",
      title: `${plural(failedFeedbacks, "recado", "recados")} não ${failedFeedbacks === 1 ? "foi enviado" : "foram enviados"}`,
      actionLabel: "Ver recados",
      route: "recados",
    });

  const failedBulletins = overview.bulletins.filter(
    (item) => item.status === "failed",
  ).length;
  if (failedBulletins > 0)
    result.push({
      id: "bulletin-failed",
      tone: "warning",
      title: `${plural(failedBulletins, "boletim", "boletins")} não ${failedBulletins === 1 ? "foi enviado" : "foram enviados"}`,
      actionLabel: "Ver boletins",
      route: "boletins",
    });

  return result;
}

export type MenuCounts = Partial<
  Record<RouteId, { count: number; label: string }>
>;

export function menuCounts(overview: Overview): MenuCounts {
  const counts: MenuCounts = {};
  const toCorrect = submissions(overview).filter((item) =>
    TO_CORRECT.has(item.correctionStatus),
  ).length;
  if (toCorrect > 0)
    counts.correcoes = {
      count: toCorrect,
      label: `${plural(toCorrect, "resposta", "respostas")} para corrigir`,
    };
  const plans = plansToApprove(overview).length;
  if (plans > 0)
    counts.aulas = {
      count: plans,
      label: `${plural(plans, "plano", "planos")} para aprovar`,
    };
  return counts;
}
