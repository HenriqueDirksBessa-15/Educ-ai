import type {
  ClassSummary,
  EligibleFeedbackSubmission,
  Feedback,
  FeedbackScope,
  Material,
} from "@educai/contracts";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { useConfirm } from "./ConfirmDialog.js";
import { notificationLabel } from "./labels.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
type DataEnvelope<T> = { data: T };

export function FeedbackPanel({
  classes,
  materials,
}: {
  classes: ClassSummary[];
  materials: Material[];
}) {
  const confirm = useConfirm();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [eligible, setEligible] = useState<EligibleFeedbackSubmission[]>([]);
  const [scope, setScope] = useState<FeedbackScope>("individual");
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [observation, setObservation] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [draftObservations, setDraftObservations] = useState<
    Record<string, string>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [feedbackResponse, eligibleResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/feedbacks`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/feedbacks/eligible-submissions`, {
        credentials: "include",
      }),
    ]);
    if (!feedbackResponse.ok || !eligibleResponse.ok) throw new Error();
    const feedbackBody = (await feedbackResponse.json()) as DataEnvelope<
      Feedback[]
    >;
    const eligibleBody = (await eligibleResponse.json()) as DataEnvelope<
      EligibleFeedbackSubmission[]
    >;
    setFeedbacks(feedbackBody.data);
    setEligible(eligibleBody.data);
    setDraftTexts(
      Object.fromEntries(
        feedbackBody.data.map((item) => [
          item.id,
          item.status === "generated" && item.latestGeneration?.suggestion
            ? item.latestGeneration.suggestion.message
            : item.content,
        ]),
      ),
    );
    setDraftObservations(
      Object.fromEntries(
        feedbackBody.data.map((item) => [
          item.id,
          item.status === "generated" && item.latestGeneration?.suggestion
            ? item.latestGeneration.suggestion.improvements.join(" ")
            : (item.teacherObservation ?? ""),
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    void load().catch(() =>
      setMessage("Não foi possível carregar seus recados. Tente de novo."),
    );
  }, [load]);

  useEffect(() => {
    setTargetId(
      scope === "individual" ? (eligible[0]?.id ?? "") : (classes[0]?.id ?? ""),
    );
  }, [scope, eligible, classes]);

  const createFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyId("new");
    setMessage(null);
    try {
      const response = await fetch(`${apiBaseUrl}/feedbacks`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope,
          ...(scope === "individual"
            ? { submissionId: targetId }
            : { classId: targetId }),
          title,
          content,
          teacherObservation: observation || null,
          links: linkUrl
            ? [{ label: "Material complementar", url: linkUrl }]
            : [],
          materialIds: materialId ? [materialId] : [],
        }),
      });
      if (!response.ok) throw new Error();
      setTitle("");
      setContent("");
      setObservation("");
      setLinkUrl("");
      setMaterialId("");
      setMessage(
        "Recado salvo. Revise o texto e toque em Enviar quando estiver pronto.",
      );
      await load();
    } catch {
      setMessage(
        "Não foi possível salvar. Confira para quem vai, o texto e o link.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const act = async (
    feedback: Feedback,
    action: "generate" | "review" | "send" | "save" | "delete",
  ) => {
    const recipient =
      feedback.scope === "individual"
        ? `${feedback.studentName} por e-mail`
        : `a turma ${feedback.className} no Google Sala de Aula`;
    if (
      action === "send" &&
      !(await confirm({
        title: "Enviar este recado?",
        body: `“${feedback.title}” será enviado para ${recipient}.`,
        confirmLabel: "Enviar recado",
      }))
    )
      return;
    if (
      action === "delete" &&
      !(await confirm({
        title: "Excluir este recado?",
        body: `“${feedback.title}” sai da lista de recados.`,
        confirmLabel: "Excluir recado",
        danger: true,
      }))
    )
      return;
    setBusyId(feedback.id);
    setMessage(null);
    try {
      const generation = feedback.latestGeneration;
      const request =
        action === "delete"
          ? { method: "DELETE" }
          : action === "save"
            ? {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  content: draftTexts[feedback.id],
                  teacherObservation: draftObservations[feedback.id] || null,
                }),
              }
            : action === "review"
              ? {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    generationId: generation?.id,
                    content: draftTexts[feedback.id],
                    teacherObservation:
                      draftObservations[feedback.id] ||
                      "Sugestão revisada pelo professor.",
                  }),
                }
              : { method: "POST" };
      const suffix =
        action === "save" || action === "delete" ? "" : `/${action}`;
      const response = await fetch(
        `${apiBaseUrl}/feedbacks/${feedback.id}${suffix}`,
        { ...request, credentials: "include" },
      );
      if (!response.ok) throw new Error();
      setMessage(actionMessage(action));
      await load();
    } catch {
      setMessage(
        feedback.canEdit
          ? "Não foi possível concluir. Se houver sugestão da IA, revise-a antes."
          : "Este recado não pode mais ser alterado: o prazo para mudanças acabou.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="timeline-panel" aria-labelledby="feedback-title">
      <div className="status-heading">
        <h2 id="feedback-title">Seus recados</h2>
        <span className="timeline-count">
          {feedbacks.length} {feedbacks.length === 1 ? "recado" : "recados"}
        </span>
      </div>
      <div className="activities-layout">
        <form
          className="activity-form"
          onSubmit={(event) => void createFeedback(event)}
        >
          <h3>Novo recado</h3>
          <label>
            Para quem
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as FeedbackScope)
              }
            >
              <option value="individual">Um aluno (por e-mail)</option>
              <option value="global">A turma toda (aviso)</option>
            </select>
          </label>
          <label>
            Destinatário
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              {scope === "individual"
                ? eligible.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.studentName} · {item.activityTitle} · nota{" "}
                      {item.grade}
                    </option>
                  ))
                : classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
            </select>
          </label>
          <label>
            Título
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Texto
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <label>
            Observação para você (opcional)
            <textarea
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
            />
          </label>
          <label>
            Link opcional
            <input
              type="url"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
            />
          </label>
          <label>
            Material opcional
            <select
              value={materialId}
              onChange={(event) => setMaterialId(event.target.value)}
            >
              <option value="">Sem anexo</option>
              {materials
                .filter((item) => !item.isArchived)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
          <button
            disabled={
              busyId === "new" || !targetId || !title.trim() || !content.trim()
            }
          >
            {busyId === "new" ? "Salvando…" : "Salvar recado"}
          </button>
        </form>
        <div>
          <h3>Recados anteriores</h3>
          {feedbacks.length === 0 ? (
            <p className="empty-state">
              Nenhum recado ainda. Escreva o primeiro ao lado.
            </p>
          ) : (
            <ul className="resource-list feedback-list">
              {feedbacks.map((feedback) => (
                <li
                  key={feedback.id}
                  className={feedback.status === "deleted" ? "muted-item" : ""}
                >
                  <strong>{feedback.title}</strong>
                  <span>
                    {feedback.scope === "individual"
                      ? feedback.studentName
                      : feedback.className}{" "}
                    · {feedbackStatusLabel(feedback.status)}
                  </span>
                  <textarea
                    value={draftTexts[feedback.id] ?? feedback.content}
                    disabled={
                      !feedback.canEdit || feedback.status === "deleted"
                    }
                    onChange={(event) =>
                      setDraftTexts((current) => ({
                        ...current,
                        [feedback.id]: event.target.value,
                      }))
                    }
                  />
                  <textarea
                    aria-label={`Observação de ${feedback.title}`}
                    value={draftObservations[feedback.id] ?? ""}
                    disabled={
                      !feedback.canEdit || feedback.status === "deleted"
                    }
                    onChange={(event) =>
                      setDraftObservations((current) => ({
                        ...current,
                        [feedback.id]: event.target.value,
                      }))
                    }
                    placeholder="Observação para você (opcional)"
                  />
                  {feedback.latestGeneration?.suggestion && (
                    <small>
                      IA:{" "}
                      {feedback.latestGeneration.suggestion.strengths.join(" ")}{" "}
                      {feedback.latestGeneration.suggestion.improvements.join(
                        " ",
                      )}
                    </small>
                  )}
                  {feedback.attachments.length + feedback.links.length > 0 && (
                    <small>
                      {feedback.attachments.length} anexos ·{" "}
                      {feedback.links.length} links
                    </small>
                  )}
                  {feedback.notification && (
                    <small>{notificationLabel(feedback.notification)}</small>
                  )}
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-action compact-action"
                      disabled={
                        !feedback.canEdit ||
                        busyId === feedback.id ||
                        feedback.status === "deleted"
                      }
                      onClick={() => void act(feedback, "save")}
                    >
                      Salvar edição
                    </button>
                    <button
                      type="button"
                      className="secondary-action compact-action"
                      disabled={
                        !feedback.canEdit ||
                        busyId === feedback.id ||
                        ["sent", "deleted"].includes(feedback.status)
                      }
                      onClick={() => void act(feedback, "generate")}
                    >
                      Pedir ajuda à IA
                    </button>
                    {feedback.status === "generated" && (
                      <button
                        type="button"
                        className="secondary-action compact-action"
                        disabled={busyId === feedback.id}
                        onClick={() => void act(feedback, "review")}
                      >
                        Revisar sugestão
                      </button>
                    )}
                    <button
                      type="button"
                      className="compact-action"
                      disabled={
                        busyId === feedback.id ||
                        ["generated", "deleted"].includes(feedback.status)
                      }
                      onClick={() => void act(feedback, "send")}
                    >
                      Enviar
                    </button>
                    <button
                      type="button"
                      className="secondary-action compact-action"
                      disabled={
                        !feedback.canEdit ||
                        busyId === feedback.id ||
                        feedback.status === "deleted"
                      }
                      onClick={() => void act(feedback, "delete")}
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {message && (
        <small className="form-message" role="status">
          {message}
        </small>
      )}
    </section>
  );
}

function feedbackStatusLabel(status: Feedback["status"]): string {
  return {
    draft: "Rascunho",
    generated: "Aguardando revisão",
    reviewed: "Revisado",
    sent: "Enviado",
    deleted: "Excluído",
  }[status];
}

function actionMessage(
  action: "generate" | "review" | "send" | "save" | "delete",
) {
  return {
    generate: "Sugestão gerada; revise o texto antes do envio.",
    review: "Sugestão revisada.",
    send: "Recado enviado.",
    save: "Alterações salvas.",
    delete: "Recado excluído.",
  }[action];
}
