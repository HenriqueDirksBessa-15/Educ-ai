import type {
  ClassSummary,
  EligibleFeedbackSubmission,
  Feedback,
  FeedbackGeneration,
  FeedbackScope,
  Material,
} from "@educai/contracts";
import { useCallback, useEffect, useId, useState } from "react";

import { json, request } from "./api.js";
import { useConfirm } from "./ConfirmDialog.js";
import { errorMessage, formatDateTime } from "./labels.js";
import {
  confirmationFor,
  groupEligible,
  messageStatusLabel,
  recipientText,
  suggestedTitle,
  validateMessage,
  type MessageErrors,
} from "./messages.js";
import { routeHref } from "./router.js";

type Notice = { kind: "ok" | "error"; text: string } | null;

function NoticeMessage({ value }: { value: Notice }) {
  if (!value) return null;
  return value.kind === "error" ? (
    <p className="notice error" role="alert">
      {value.text}
    </p>
  ) : (
    <p className="form-message" role="status">
      {value.text}
    </p>
  );
}

type Form = {
  scope: FeedbackScope;
  targetId: string;
  title: string;
  autoTitle: boolean;
  content: string;
  linkUrl: string;
  materialId: string;
};

const emptyForm = (): Form => ({
  scope: "individual",
  targetId: "",
  title: "",
  autoTitle: true,
  content: "",
  linkUrl: "",
  materialId: "",
});

export function MessagesPage({
  classes,
  materials,
}: {
  classes: ClassSummary[];
  materials: Material[];
}) {
  const confirm = useConfirm();
  const id = useId();
  const [feedbacks, setFeedbacks] = useState<Feedback[] | null>(null);
  const [eligible, setEligible] = useState<EligibleFeedbackSubmission[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<Feedback | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [errors, setErrors] = useState<MessageErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const [list, students] = await Promise.all([
        request<Feedback[]>("/feedbacks"),
        request<EligibleFeedbackSubmission[]>(
          "/feedbacks/eligible-submissions",
        ),
      ]);
      setFeedbacks(list);
      setEligible(students);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const student = eligible.find((item) => item.id === form.targetId);
  const group = classes.find((item) => item.id === form.targetId);
  const recipientName = editing
    ? editing.scope === "individual"
      ? (editing.studentName ?? "o aluno")
      : (editing.className ?? "")
    : form.scope === "individual"
      ? (student?.studentName ?? "")
      : (group?.name ?? "");

  const update = (patch: Partial<Form>) => {
    setForm((current) => {
      const next = { ...current, ...patch };
      // Keep suggesting a title until the teacher writes their own.
      if (next.autoTitle && ("targetId" in patch || "scope" in patch)) {
        const context =
          next.scope === "individual"
            ? eligible.find((item) => item.id === next.targetId)?.activityTitle
            : classes.find((item) => item.id === next.targetId)?.name;
        next.title = context ? suggestedTitle(next.scope, context) : "";
      }
      return next;
    });
    setErrors({});
  };

  const reset = () => {
    setForm(emptyForm());
    setEditing(null);
    setDraftId(null);
    setErrors({});
  };

  const validate = () => {
    const found = validateMessage({
      targetId: editing ? "saved" : form.targetId,
      title: form.title,
      content: form.content,
      linkUrl: form.linkUrl,
    });
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const editableFields = () => ({
    title: form.title.trim(),
    content: form.content.trim(),
    links: form.linkUrl.trim()
      ? [{ label: "Material complementar", url: form.linkUrl.trim() }]
      : [],
    materialIds: form.materialId ? [form.materialId] : [],
  });

  // Always stores exactly what the teacher sees in the fields.
  const persist = async (): Promise<string> => {
    const currentId = editing?.id ?? draftId;
    if (currentId) {
      await request(`/feedbacks/${currentId}`, json("PATCH", editableFields()));
      return currentId;
    }
    const created = await request<{ id: string }>(
      "/feedbacks",
      json("POST", {
        scope: form.scope,
        ...(form.scope === "individual"
          ? { submissionId: form.targetId }
          : { classId: form.targetId }),
        ...editableFields(),
      }),
    );
    setDraftId(created.id);
    return created.id;
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const askAi = () => {
    if (!validate()) return;
    void run(async () => {
      const feedbackId = await persist();
      try {
        const generation = await request<FeedbackGeneration>(
          `/feedbacks/${feedbackId}/generate`,
          { method: "POST" },
        );
        if (!generation.suggestion) throw new Error();
        setForm((current) => ({
          ...current,
          content: generation.suggestion!.message,
        }));
        setNotice({
          kind: "ok",
          text: "Sugestão da IA colocada na mensagem. Revise antes de enviar.",
        });
      } catch {
        throw new Error(errorMessage("OPENAI_FEEDBACK_FAILED"));
      }
    });
  };

  const saveDraft = () => {
    if (!validate()) return;
    void run(async () => {
      await persist();
      reset();
      await load();
      setNotice({ kind: "ok", text: "Rascunho salvo." });
    });
  };

  const send = async () => {
    if (!validate()) return;
    const scope = editing?.scope ?? form.scope;
    const question = confirmationFor(scope, recipientName);
    const confirmed = await confirm({
      ...question,
      confirmLabel: scope === "individual" ? "Enviar recado" : "Enviar aviso",
    });
    if (!confirmed) return;
    await run(async () => {
      const feedbackId = await persist();
      await request(`/feedbacks/${feedbackId}/send`, { method: "POST" });
      reset();
      await load();
      setNotice({
        kind: "ok",
        text:
          scope === "individual"
            ? `Recado enviado para ${recipientName}.`
            : `Aviso enviado para a turma ${recipientName}.`,
      });
    });
  };

  const continueDraft = (feedback: Feedback) => {
    const suggestion =
      feedback.status === "generated"
        ? feedback.latestGeneration?.suggestion?.message
        : null;
    setEditing(feedback);
    setDraftId(feedback.id);
    setErrors({});
    setNotice(null);
    setForm({
      scope: feedback.scope,
      targetId: feedback.submissionId ?? feedback.classId ?? "",
      title: feedback.title,
      autoTitle: false,
      content: suggestion ?? feedback.content,
      linkUrl: feedback.links[0]?.url ?? "",
      materialId: feedback.attachments[0]?.id ?? "",
    });
  };

  const remove = async (feedback: Feedback) => {
    const confirmed = await confirm({
      title: "Excluir este recado?",
      body: `“${feedback.title}” sai da lista de recados.`,
      confirmLabel: "Excluir recado",
      danger: true,
    });
    if (!confirmed) return;
    await run(async () => {
      await request(`/feedbacks/${feedback.id}`, { method: "DELETE" });
      if (editing?.id === feedback.id) reset();
      await load();
      setNotice({ kind: "ok", text: "Recado excluído." });
    });
  };

  const fieldError = (key: keyof MessageErrors) =>
    errors[key] && (
      <span className="field-error" id={`${id}-${key}`}>
        {errors[key]}
      </span>
    );
  const invalid = (key: keyof MessageErrors) =>
    errors[key]
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-${key}` }
      : {};

  const visible = (feedbacks ?? []).filter((item) => item.status !== "deleted");
  const groups = groupEligible(eligible);
  const scope = editing?.scope ?? form.scope;

  return (
    <>
      <NoticeMessage value={notice} />
      {loadFailed && (
        <div className="notice error" role="alert">
          <span>Não conseguimos carregar seus recados.</span>
          <button type="button" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      )}

      {/* The form waits for the students, so a choice is never lost. */}
      {feedbacks === null ? (
        !loadFailed && <p className="empty-state">Carregando…</p>
      ) : (
        <section
          className="timeline-panel stacked-form"
          aria-labelledby={`${id}-novo`}
        >
          <h2 id={`${id}-novo`}>
            {editing ? "Continuar recado" : "Novo recado"}
          </h2>

          {editing ? (
            <p>
              <b>Para: {recipientText(editing)}</b>
            </p>
          ) : (
            <>
              <fieldset className="choice-group">
                <legend>
                  Para quem? <span aria-hidden="true">*</span>
                </legend>
                <div className="choice-grid">
                  <label className="choice">
                    <input
                      type="radio"
                      name={`${id}-scope`}
                      checked={form.scope === "individual"}
                      onChange={() =>
                        update({ scope: "individual", targetId: "" })
                      }
                    />
                    <span>
                      Um aluno
                      <span className="muted-line">
                        Vai por e-mail, só para ele.
                      </span>
                    </span>
                  </label>
                  <label className="choice">
                    <input
                      type="radio"
                      name={`${id}-scope`}
                      checked={form.scope === "global"}
                      onChange={() => update({ scope: "global", targetId: "" })}
                    />
                    <span>
                      A turma toda
                      <span className="muted-line">
                        Vira um aviso no mural da turma no Google Sala de Aula.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              {form.scope === "individual" ? (
                eligible.length === 0 ? (
                  <p className="notice warning">
                    Ainda não há alunos com atividade corrigida.{" "}
                    <a href={routeHref("correcoes")}>Corrigir respostas</a>
                  </p>
                ) : (
                  <div className="field">
                    <label>
                      <span>
                        Aluno <span aria-hidden="true">*</span>
                      </span>
                      <select
                        value={form.targetId}
                        onChange={(event) =>
                          update({ targetId: event.target.value })
                        }
                        {...invalid("target")}
                      >
                        <option value="">Escolha o aluno</option>
                        {groups.map((groupItem) => (
                          <optgroup
                            key={groupItem.activityTitle}
                            label={groupItem.activityTitle}
                          >
                            {groupItem.items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.studentName} · nota{" "}
                                {item.grade.toLocaleString("pt-BR")}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </label>
                    {fieldError("target")}
                    <span className="muted-line">
                      Aparecem os alunos com atividade já corrigida, separados
                      por atividade.
                    </span>
                  </div>
                )
              ) : (
                <div className="field">
                  <label>
                    <span>
                      Turma <span aria-hidden="true">*</span>
                    </span>
                    <select
                      value={form.targetId}
                      onChange={(event) =>
                        update({ targetId: event.target.value })
                      }
                      {...invalid("target")}
                    >
                      <option value="">Escolha a turma</option>
                      {classes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {fieldError("target")}
                </div>
              )}
            </>
          )}

          {scope === "global" && (
            <p className="notice warning">
              Todos os alunos da turma verão este aviso. Não cite notas nem
              dados de um aluno.
            </p>
          )}

          <div className="field">
            <label>
              <span>
                Título <span aria-hidden="true">*</span>
              </span>
              <input
                value={form.title}
                onChange={(event) =>
                  update({ title: event.target.value, autoTitle: false })
                }
                {...invalid("title")}
              />
            </label>
            {fieldError("title")}
          </div>
          <div className="field">
            <label>
              <span>
                Mensagem <span aria-hidden="true">*</span>
              </span>
              <textarea
                value={form.content}
                placeholder="Escreva o recado ou uma ideia curta para a IA desenvolver."
                onChange={(event) => update({ content: event.target.value })}
                {...invalid("content")}
              />
            </label>
            {fieldError("content")}
          </div>
          <div className="form-row">
            <div className="field">
              <label>
                <span>Link (opcional)</span>
                <input
                  type="url"
                  value={form.linkUrl}
                  placeholder="https://"
                  onChange={(event) => update({ linkUrl: event.target.value })}
                  {...invalid("link")}
                />
              </label>
              {fieldError("link")}
            </div>
            <div className="field">
              <label>
                <span>Material (opcional)</span>
                <select
                  value={form.materialId}
                  onChange={(event) =>
                    update({ materialId: event.target.value })
                  }
                >
                  <option value="">Nenhum</option>
                  {materials
                    .filter((item) => !item.isArchived)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>
          <div className="inline-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={busy}
              onClick={askAi}
            >
              Pedir ajuda à IA
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={busy}
              onClick={saveDraft}
            >
              Salvar rascunho
            </button>
            <button type="button" disabled={busy} onClick={() => void send()}>
              {busy ? "Aguarde…" : "Enviar recado"}
            </button>
            {editing && (
              <button
                type="button"
                className="secondary-action"
                onClick={reset}
              >
                Cancelar
              </button>
            )}
          </div>
        </section>
      )}

      <section className="queue-group" aria-labelledby={`${id}-anteriores`}>
        <h2 id={`${id}-anteriores`}>Recados anteriores</h2>
        {feedbacks === null && !loadFailed ? (
          <p className="empty-state">Carregando…</p>
        ) : visible.length === 0 ? (
          <p className="empty-state">Nenhum recado ainda.</p>
        ) : (
          <ul className="card-list" aria-label="Recados anteriores">
            {visible.map((item) => (
              <li key={item.id} className="card-row">
                <div>
                  <strong className="card-title">{item.title}</strong>
                  <span className="muted-line">{recipientText(item)}</span>
                  <span
                    className={`tag ${item.notification?.status === "failed" ? "warn" : item.status === "sent" ? "ok" : ""}`}
                  >
                    {messageStatusLabel(item)}
                  </span>
                  {item.sentAt && (
                    <span className="muted-line">
                      Enviado em {formatDateTime(item.sentAt)}
                    </span>
                  )}
                </div>
                {item.canEdit && item.status !== "sent" && (
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => continueDraft(item)}
                    >
                      Continuar {item.title}
                    </button>
                    <button
                      type="button"
                      className="danger-action"
                      disabled={busy}
                      onClick={() => void remove(item)}
                    >
                      Excluir {item.title}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
