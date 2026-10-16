import type {
  Activity,
  ActivityCollectionSummary,
  DiscursiveCorrectionSuggestion,
} from "@educai/contracts";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ApiError, json, request } from "./api.js";
import { useConfirm } from "./ConfirmDialog.js";
import {
  correctionProgress,
  groupSubmissions,
  hasErrors,
  nextToCorrect,
  previewGrade,
  validateCorrection,
  writtenAnswers,
  type Answer,
  type CorrectionDrafts,
  type CorrectionErrors,
  type Submission,
} from "./corrections.js";
import { errorMessage } from "./labels.js";
import { routeHref } from "./router.js";

type Feedback = { kind: "ok" | "error"; text: string } | null;

function FeedbackMessage({ value }: { value: Feedback }) {
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

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const number = (value: number) => value.toLocaleString("pt-BR");

const studentName = (submission: Submission) =>
  submission.studentName ??
  submission.respondentEmail ??
  "Resposta sem aluno identificado";

const STATUS_LABEL: Record<Submission["correctionStatus"], string> = {
  pending: "Falta corrigir",
  suggested: "Sugestão da IA para revisar",
  manual_required: "Precisa da sua correção",
  reviewed: "Revisada, falta aprovar",
  approved: "Nota aprovada",
  released: "Nota devolvida",
};

const RETURN_LABEL: Record<Submission["classroomReturnStatus"], string> = {
  pending: "",
  not_available: "Turma fora do Google Sala de Aula",
  returned: "Devolvida no Google Sala de Aula",
  failed: "Não chegou ao Google Sala de Aula",
};

const progressText = (done: number, total: number) =>
  done === total
    ? "Tudo corrigido"
    : `${done} de ${total} corrigidas · faltam ${total - done}`;

/* -------------------------------- List -------------------------------- */

type ListItem = {
  activity: Activity;
  progress: { done: number; total: number } | null;
};

export function CorrectionListPage() {
  const [items, setItems] = useState<ListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const sent = (await request<Activity[]>("/activities")).filter(
        (item) =>
          (item.status === "published" || item.status === "finished") &&
          !item.archivedAt,
      );
      const withAnswers = new Set(
        sent
          .filter((item) => item.responseCount > 0)
          .slice(0, 20)
          .map((item) => item.id),
      );
      const summaries = await Promise.all(
        sent.map((item) =>
          withAnswers.has(item.id)
            ? request<ActivityCollectionSummary | null>(
                `/activities/${item.id}/collection`,
              )
            : Promise.resolve(null),
        ),
      );
      setItems(
        sent.map((activity, index) => {
          const summary = summaries[index];
          return {
            activity,
            progress: summary ? correctionProgress(summary.submissions) : null,
          };
        }),
      );
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed)
    return (
      <div className="notice error" role="alert">
        <span>Não conseguimos carregar suas correções.</span>
        <button type="button" onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  if (!items) return <p className="empty-state">Carregando…</p>;
  if (items.length === 0)
    return (
      <p className="empty-state">
        Nenhuma atividade enviada ainda. Quando os alunos responderem, as
        correções aparecem aqui.
      </p>
    );

  return (
    <ul className="card-list">
      {items.map(({ activity, progress }) => (
        <li key={activity.id} className="card-row">
          <div className="grow">
            <strong className="card-title">{activity.title}</strong>
            <span className="muted-line">{activity.lessonPlanTitle}</span>
            {progress && progress.total > 0 ? (
              <>
                <div
                  className="progress"
                  role="progressbar"
                  aria-label={`Correções de ${activity.title}`}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.done}
                >
                  <span
                    style={{
                      width: `${(progress.done / progress.total) * 100}%`,
                    }}
                  />
                </div>
                <span className="muted-line">
                  {progressText(progress.done, progress.total)}
                </span>
              </>
            ) : (
              <span className="muted-line">
                {activity.responseCount === 0
                  ? "Nenhuma resposta ainda"
                  : "Respostas ainda não buscadas"}
              </span>
            )}
          </div>
          <a
            className="secondary-action"
            href={routeHref("correcoes", activity.id)}
          >
            Corrigir {activity.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- Queue ------------------------------- */

export function CorrectionQueuePage({ activityId }: { activityId: string }) {
  const confirm = useConfirm();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [summary, setSummary] = useState<ActivityCollectionSummary | null>(
    null,
  );
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadSummary = useCallback(async () => {
    const data = await request<ActivityCollectionSummary | null>(
      `/activities/${activityId}/collection`,
    );
    setSummary(data);
    return data;
  }, [activityId]);

  useEffect(() => {
    void (async () => {
      try {
        setActivity(await request<Activity>(`/activities/${activityId}`));
        await loadSummary();
        setState("ready");
      } catch {
        setState("failed");
      }
    })();
  }, [activityId, loadSummary]);

  const collect = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const data = await request<ActivityCollectionSummary>(
        `/activities/${activityId}/collect`,
        { method: "POST" },
      );
      setSummary(data);
      setFeedback({
        kind: "ok",
        text: `${plural(data.submissionCount, "resposta recebida", "respostas recebidas")}.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        text:
          error instanceof ApiError && error.code === "VALIDATION_ERROR"
            ? "Ainda não dá para buscar as respostas: espere o prazo terminar ou encerre as respostas da atividade."
            : (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const returnApproved = async (approved: Submission[]) => {
    const confirmed = await confirm({
      title: "Devolver as notas aos alunos?",
      body: `${plural(approved.length, "aluno vai", "alunos vão")} ver a nota no Google Sala de Aula. Isso não pode ser desfeito.`,
      confirmLabel: "Devolver notas",
    });
    if (!confirmed) return;
    setBusy(true);
    setFeedback(null);
    const failures: string[] = [];
    for (const submission of approved) {
      try {
        await request(`/submissions/${submission.id}/release`, {
          method: "POST",
        });
      } catch {
        failures.push(studentName(submission));
      }
    }
    await loadSummary().catch(() => null);
    setBusy(false);
    const returned = approved.length - failures.length;
    setFeedback(
      failures.length > 0
        ? {
            kind: "error",
            text: `${plural(failures.length, "nota não chegou", "notas não chegaram")} ao Google Sala de Aula: ${failures.join(", ")}. Tente de novo.`,
          }
        : {
            kind: "ok",
            text: `${plural(returned, "nota devolvida", "notas devolvidas")}.`,
          },
    );
  };

  if (state === "loading")
    return <p className="empty-state">Abrindo as correções…</p>;
  if (state === "failed" || !activity)
    return (
      <>
        <a className="back-link" href={routeHref("correcoes")}>
          ← Voltar para correções
        </a>
        <div className="notice error" role="alert">
          <strong>Não conseguimos abrir estas correções.</strong>
          <span>Volte para a lista e tente de novo.</span>
        </div>
      </>
    );

  const submissions = summary?.submissions ?? [];
  const groups = groupSubmissions(submissions);
  const progress = correctionProgress(submissions);
  const selected = submissions.find((item) => item.id === selectedId) ?? null;

  const afterApproval = async (current: Submission) => {
    const fresh = await loadSummary().catch(() => null);
    const list = fresh?.submissions ?? submissions;
    setSelectedId(nextToCorrect(list, current.id));
    setFeedback({
      kind: "ok",
      text: `Nota de ${studentName(current)} aprovada.`,
    });
  };

  return (
    <>
      <a className="back-link" href={routeHref("correcoes")}>
        ← Voltar para correções
      </a>
      <header className="page-head">
        <h1>{activity.title}</h1>
        <p>
          {submissions.length > 0
            ? progressText(progress.done, progress.total)
            : "Nenhuma resposta buscada ainda. Toque em “Buscar respostas”."}
        </p>
      </header>
      <div className="inline-actions page-actions">
        <button
          type="button"
          className="secondary-action"
          disabled={busy}
          onClick={() => void collect()}
        >
          {busy ? "Buscando…" : "Buscar respostas"}
        </button>
        {groups.approved.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void returnApproved(groups.approved)}
          >
            Devolver{" "}
            {plural(groups.approved.length, "nota aprovada", "notas aprovadas")}
          </button>
        )}
      </div>
      <FeedbackMessage value={feedback} />

      {selected && (
        <CorrectionForm
          key={selected.id}
          activity={activity}
          submission={selected}
          busy={busy}
          setBusy={setBusy}
          onApproved={() => void afterApproval(selected)}
          onReturned={async () => {
            await loadSummary().catch(() => null);
            setFeedback({
              kind: "ok",
              text: `Nota de ${studentName(selected)} devolvida.`,
            });
          }}
          onSkip={() => setSelectedId(nextToCorrect(submissions, selected.id))}
          onClose={() => setSelectedId(null)}
        />
      )}

      {(
        [
          ["Falta corrigir", groups.toCorrect, "Corrigir"],
          ["Aprovadas", groups.approved, "Ver"],
          ["Devolvidas", groups.released, "Ver"],
        ] as const
      ).map(([title, list, verb]) => (
        <section key={title} className="queue-group">
          <h2>
            {title} ({list.length})
          </h2>
          {list.length > 0 && (
            <ul className="card-list">
              {list.map((submission) => (
                <li key={submission.id} className="card-row">
                  <div>
                    <strong className="card-title">
                      {studentName(submission)}
                    </strong>
                    <span className="muted-line">
                      {STATUS_LABEL[submission.correctionStatus]}
                      {submission.grade !== null &&
                        ` · nota ${number(submission.grade)} de 10`}
                      {RETURN_LABEL[submission.classroomReturnStatus] &&
                        submission.correctionStatus === "released" &&
                        ` · ${RETURN_LABEL[submission.classroomReturnStatus]}`}
                    </span>
                    {submission.manualReviewReason && (
                      <span className="muted-line">
                        {submission.manualReviewReason}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => {
                      setFeedback(null);
                      setSelectedId(submission.id);
                    }}
                  >
                    {verb} {studentName(submission)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

/* --------------------------- One submission --------------------------- */

function CorrectionForm({
  activity,
  submission,
  busy,
  setBusy,
  onApproved,
  onReturned,
  onSkip,
  onClose,
}: {
  activity: Activity;
  submission: Submission;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onApproved: () => void;
  onReturned: () => Promise<void>;
  onSkip: () => void;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const id = useId();
  const name = studentName(submission);
  const written = writtenAnswers(submission);
  const editable =
    submission.correctionStatus !== "approved" &&
    submission.correctionStatus !== "released";
  const [drafts, setDrafts] = useState<CorrectionDrafts>(() =>
    Object.fromEntries(
      written.map((answer) => [
        answer.id,
        {
          points:
            answer.pointsAwarded === null ? "" : String(answer.pointsAwarded),
          comment: answer.teacherComment ?? "",
        },
      ]),
    ),
  );
  const [general, setGeneral] = useState(submission.teacherComment ?? "");
  const [errors, setErrors] = useState<CorrectionErrors>({
    answers: {},
    general: undefined,
  });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Opening a student moves the reader straight to their correction.
  useEffect(() => {
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView?.({ block: "start" });
  }, []);

  const setDraft = (
    answerId: string,
    patch: Partial<CorrectionDrafts[string]>,
  ) =>
    setDrafts((current) => ({
      ...current,
      [answerId]: { ...current[answerId]!, ...patch },
    }));

  const suggest = async (answer: Answer) => {
    setBusy(true);
    setFeedback(null);
    try {
      const suggestion = await request<DiscursiveCorrectionSuggestion>(
        `/submissions/${submission.id}/corrections/suggest`,
        json("POST", { answerId: answer.id, rigour: "balanced" }),
      );
      setDraft(answer.id, {
        points: String(suggestion.pointsAwarded),
        comment: suggestion.comment,
      });
      setFeedback({
        kind: "ok",
        text: "Sugestão da IA colocada nos campos. Confira antes de aprovar.",
      });
    } catch {
      setFeedback({
        kind: "error",
        text: errorMessage("OPENAI_CORRECTION_FAILED"),
      });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    const found = validateCorrection(written, drafts, general);
    setErrors(found);
    if (hasErrors(found)) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (written.length > 0)
        await request(
          `/submissions/${submission.id}/correction`,
          json("PATCH", {
            answers: written.map((answer) => ({
              answerId: answer.id,
              pointsAwarded: Number(
                drafts[answer.id]!.points.replace(",", "."),
              ),
              comment: drafts[answer.id]!.comment.trim(),
            })),
            teacherComment: general.trim(),
          }),
        );
      await request(`/submissions/${submission.id}/approve`, {
        method: "POST",
      });
      onApproved();
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const giveBack = async () => {
    const confirmed = await confirm({
      title: "Devolver a nota ao aluno?",
      body: `${name} vai ver a nota no Google Sala de Aula. Isso não pode ser desfeito.`,
      confirmLabel: "Devolver nota",
    });
    if (!confirmed) return;
    setBusy(true);
    setFeedback(null);
    try {
      await request(`/submissions/${submission.id}/release`, {
        method: "POST",
      });
      await onReturned();
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const grade = previewGrade(submission, drafts);
  const question = (answer: Answer) =>
    activity.questions.find((item) => item.id === answer.questionId);

  return (
    <section
      className="timeline-panel correction-form"
      aria-label={`Correção de ${name}`}
    >
      <div className="status-heading">
        <h2 ref={headingRef} tabIndex={-1}>
          {name}
        </h2>
        <button type="button" className="secondary-action" onClick={onClose}>
          Fechar
        </button>
      </div>
      {submission.manualReviewReason && (
        <p className="notice warning">{submission.manualReviewReason}</p>
      )}

      {submission.answers.map((answer) => {
        const position = (answer.questionPosition ?? 0) + 1;
        if (answer.kind !== "discursive")
          return (
            <div key={answer.id} className="answer-summary">
              <strong>Questão {position} · múltipla escolha</strong>
              <span>
                {answer.isCorrect === null
                  ? "Precisa da sua revisão"
                  : `${answer.isCorrect ? "Certa" : "Errada"} · ${number(answer.pointsAwarded ?? 0)} de ${number(answer.pointsPossible ?? 0)} pontos`}
              </span>
            </div>
          );
        const draft = drafts[answer.id]!;
        const answerErrors = errors.answers[answer.id] ?? {};
        const expected = question(answer);
        const max = answer.pointsPossible ?? 0;
        return (
          <fieldset key={answer.id} className="question-editor">
            <legend>
              Questão {position} · resposta escrita (vale {number(max)} pontos)
            </legend>
            <p className="muted-line">{answer.prompt}</p>
            <div className="preview">
              <b>Resposta do aluno</b>
              <p>{answer.answerText || "Resposta em branco"}</p>
            </div>
            {expected?.kind === "discursive" && (
              <dl className="expected">
                <dt>Resposta esperada</dt>
                <dd>{expected.targetAnswer}</dd>
                <dt>Como corrigir</dt>
                <dd>{expected.criteria}</dd>
              </dl>
            )}
            {editable && (
              <>
                {answer.suggestedPointsAwarded !== null &&
                  answer.suggestedComment && (
                    <div className="notice warning">
                      <span>
                        Sugestão da IA: {number(answer.suggestedPointsAwarded)}{" "}
                        de {number(max)} pontos — {answer.suggestedComment}
                      </span>
                      <button
                        type="button"
                        className="secondary-action compact-action"
                        onClick={() =>
                          setDraft(answer.id, {
                            points: String(answer.suggestedPointsAwarded),
                            comment: answer.suggestedComment ?? "",
                          })
                        }
                      >
                        Usar sugestão
                      </button>
                    </div>
                  )}
                <button
                  type="button"
                  className="secondary-action"
                  disabled={busy}
                  onClick={() => void suggest(answer)}
                >
                  Pedir sugestão à IA
                </button>
                <div className="field points-field">
                  <label>
                    <span>Pontos (de 0 a {number(max)})</span>
                    <input
                      type="number"
                      min="0"
                      max={max}
                      step="0.5"
                      value={draft.points}
                      onChange={(event) =>
                        setDraft(answer.id, { points: event.target.value })
                      }
                      {...(answerErrors.points
                        ? {
                            "aria-invalid": true,
                            "aria-describedby": `${id}-${answer.id}-points`,
                          }
                        : {})}
                    />
                  </label>
                  {answerErrors.points && (
                    <span
                      className="field-error"
                      id={`${id}-${answer.id}-points`}
                    >
                      {answerErrors.points}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label>
                    <span>Comentário sobre esta resposta</span>
                    <textarea
                      value={draft.comment}
                      onChange={(event) =>
                        setDraft(answer.id, { comment: event.target.value })
                      }
                      {...(answerErrors.comment
                        ? {
                            "aria-invalid": true,
                            "aria-describedby": `${id}-${answer.id}-comment`,
                          }
                        : {})}
                    />
                  </label>
                  {answerErrors.comment && (
                    <span
                      className="field-error"
                      id={`${id}-${answer.id}-comment`}
                    >
                      {answerErrors.comment}
                    </span>
                  )}
                </div>
              </>
            )}
          </fieldset>
        );
      })}

      {editable && written.length > 0 && (
        <div className="field">
          <label>
            <span>Comentário geral para o aluno</span>
            <textarea
              value={general}
              onChange={(event) => setGeneral(event.target.value)}
              {...(errors.general
                ? { "aria-invalid": true, "aria-describedby": `${id}-general` }
                : {})}
            />
          </label>
          {errors.general && (
            <span className="field-error" id={`${id}-general`}>
              {errors.general}
            </span>
          )}
        </div>
      )}

      {editable ? (
        <p className="grade-preview">
          {grade === null
            ? "Preencha os pontos para ver a nota final."
            : `Nota final prevista: ${number(grade)} de 10`}
        </p>
      ) : (
        <p className="grade-preview">
          Nota{" "}
          {submission.correctionStatus === "released"
            ? "devolvida"
            : "aprovada"}
          : {number(submission.grade ?? 0)} de 10
          {RETURN_LABEL[submission.classroomReturnStatus] &&
            submission.correctionStatus === "released" &&
            ` · ${RETURN_LABEL[submission.classroomReturnStatus]}`}
        </p>
      )}
      <FeedbackMessage value={feedback} />
      <div className="inline-actions">
        {editable ? (
          <>
            <button type="button" className="secondary-action" onClick={onSkip}>
              Pular por enquanto
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void approve()}
            >
              {busy ? "Salvando…" : "Aprovar nota e ir para o próximo"}
            </button>
          </>
        ) : (
          (submission.correctionStatus === "approved" ||
            submission.classroomReturnStatus === "failed") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void giveBack()}
            >
              Devolver nota
            </button>
          )
        )}
      </div>
    </section>
  );
}
