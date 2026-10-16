import type {
  Activity,
  ActivityDifficulty,
  ActivityGeneration,
  ActivityPublication,
  ActivityQuestionInput,
  ActivityStatus,
  ActivityType,
  LessonPlan,
} from "@educai/contracts";
import { useCallback, useEffect, useId, useState } from "react";

import {
  activityTypeFor,
  emptyQuestion,
  fromLocalInput,
  initialQuestions,
  provisionalDueAt,
  questionErrors,
  toLocalInput,
  type QuestionErrors,
  type QuestionKind,
} from "./activityDraft.js";
import { ApiError, json, request } from "./api.js";
import { useConfirm } from "./ConfirmDialog.js";
import { errorMessage, formatDateTime } from "./labels.js";
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

const STATUS_LABEL: Record<ActivityStatus, [string, string]> = {
  draft: ["Rascunho", ""],
  published: ["Enviada para a turma", "ok"],
  finished: ["Respostas encerradas", ""],
};

const DIFFICULTY_LABEL: Record<ActivityDifficulty, string> = {
  easy: "Fácil",
  medium: "Média",
  hard: "Difícil",
};

const KIND_LABEL: Record<QuestionKind, string> = {
  objective: "Múltipla escolha",
  discursive: "Resposta escrita",
};

const PUBLICATION_LABEL: Record<ActivityPublication["status"], string> = {
  pending: "Preparando o envio…",
  creating_form: "Criando o formulário…",
  distributing: "Enviando para as turmas…",
  published: "Enviada para a turma",
  failed: "O envio não terminou",
  reconciliation_required: "O Google não confirmou o envio",
};

const stripIds = (questions: Activity["questions"]): ActivityQuestionInput[] =>
  questions.map((question) =>
    question.kind === "objective"
      ? {
          kind: "objective",
          prompt: question.prompt,
          points: question.points,
          alternatives: question.alternatives,
          correctAlternativeIndex: question.correctAlternativeIndex,
        }
      : {
          kind: "discursive",
          prompt: question.prompt,
          points: question.points,
          targetAnswer: question.targetAnswer,
          criteria: question.criteria,
        },
  );

/* ------------------------------- List -------------------------------- */

const FILTERS: Array<[ActivityStatus | "all", string]> = [
  ["all", "Todas"],
  ["draft", "Rascunhos"],
  ["published", "Enviadas"],
  ["finished", "Encerradas"],
];

export function ActivityListPage() {
  const [filter, setFilter] = useState<ActivityStatus | "all">("all");
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setActivities(
        await request<Activity[]>(
          filter === "all" ? "/activities" : `/activities?status=${filter}`,
        ),
      );
    } catch {
      setFailed(true);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="inline-actions page-actions">
        <a className="primary-action" href={routeHref("nova-atividade")}>
          Criar atividade
        </a>
      </div>
      <div className="activity-filters" role="group" aria-label="Mostrar">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? "filter-active" : "secondary-action"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {failed && (
        <div className="notice error" role="alert">
          <span>Não conseguimos carregar suas atividades.</span>
          <button type="button" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      )}
      {activities === null && !failed ? (
        <p className="empty-state">Carregando…</p>
      ) : activities && activities.length === 0 ? (
        <p className="empty-state">
          Nenhuma atividade aqui. Toque em “Criar atividade” para começar a
          partir de um plano aprovado.
        </p>
      ) : (
        <ul className="card-list">
          {activities?.map((item) => {
            const [label, tone] = STATUS_LABEL[item.status];
            const draft = item.status === "draft";
            return (
              <li key={item.id} className="card-row">
                <div>
                  <strong className="card-title">{item.title}</strong>
                  <span className="muted-line">
                    {item.lessonPlanTitle} · prazo {formatDateTime(item.dueAt)}
                  </span>
                  <span className={`tag ${tone}`}>{label}</span>
                  {!draft && (
                    <span className="muted-line">
                      {plural(item.responseCount, "resposta", "respostas")}
                    </span>
                  )}
                </div>
                <a
                  className="secondary-action"
                  href={routeHref("atividades", item.id)}
                >
                  {draft ? "Continuar" : "Ver"} {item.title}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* --------------------------- Existing activity ------------------------ */

export function ActivityPage({
  activityId,
  plans,
}: {
  activityId: string;
  plans: LessonPlan[];
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "failed" }
    | {
        kind: "ready";
        activity: Activity;
        publication: ActivityPublication | null;
        generation: ActivityGeneration | null;
      }
  >({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const activity = await request<Activity>(`/activities/${activityId}`);
      const [publication, generation] = await Promise.all([
        request<ActivityPublication | null>(
          `/activities/${activityId}/publication`,
        ),
        activity.status === "draft"
          ? request<ActivityGeneration | null>(
              `/activities/${activityId}/generation`,
            )
          : Promise.resolve(null),
      ]);
      setState({ kind: "ready", activity, publication, generation });
    } catch {
      setState({ kind: "failed" });
    }
  }, [activityId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading")
    return <p className="empty-state">Abrindo a atividade…</p>;
  if (state.kind === "failed")
    return (
      <>
        <a className="back-link" href={routeHref("atividades")}>
          ← Voltar para atividades
        </a>
        <div className="notice error" role="alert">
          <strong>Não conseguimos abrir esta atividade.</strong>
          <span>Volte para a lista e tente de novo.</span>
        </div>
      </>
    );

  const { activity, publication, generation } = state;
  // A draft whose sending was attempted is followed, not edited.
  if (activity.status === "draft" && !publication)
    return <ActivityWizard plans={plans} initial={{ activity, generation }} />;
  return (
    <ActivityTracking
      activity={activity}
      publication={publication}
      reload={load}
    />
  );
}

function ActivityTracking({
  activity,
  publication,
  reload,
}: {
  activity: Activity;
  publication: ActivityPublication | null;
  reload: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const failed =
    publication &&
    (publication.status === "failed" ||
      publication.status === "reconciliation_required");

  const act = async (
    path: string,
    success: string,
    question?: Parameters<typeof confirm>[0],
  ) => {
    if (question && !(await confirm(question))) return;
    setBusy(true);
    setFeedback(null);
    try {
      await request(`/activities/${activity.id}/${path}`, { method: "POST" });
      await reload();
      setFeedback({ kind: "ok", text: success });
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const [label, tone] = STATUS_LABEL[activity.status];
  return (
    <>
      <a className="back-link" href={routeHref("atividades")}>
        ← Voltar para atividades
      </a>
      <header className="page-head">
        <h1>{activity.title}</h1>
        <p>
          {activity.lessonPlanTitle} · prazo {formatDateTime(activity.dueAt)}
        </p>
      </header>
      <section className="timeline-panel" aria-labelledby="envio-titulo">
        <h2 id="envio-titulo">
          {publication ? PUBLICATION_LABEL[publication.status] : label}
        </h2>
        {!publication && <span className={`tag ${tone}`}>{label}</span>}
        {failed && (
          <div className="notice error" role="alert">
            <span>
              {publication.errorCode
                ? errorMessage(publication.errorCode)
                : "O Google não confirmou o envio. Tente de novo; nada será duplicado."}
            </span>
          </div>
        )}
        {activity.status !== "draft" && (
          <p>
            {plural(
              activity.responseCount,
              "resposta recebida",
              "respostas recebidas",
            )}
          </p>
        )}
        <div className="inline-actions">
          {publication?.responderUri && (
            <a
              className="secondary-action"
              href={publication.responderUri}
              target="_blank"
              rel="noreferrer"
            >
              Abrir o formulário
            </a>
          )}
          {publication?.distributions
            .filter((item) => item.alternateLink)
            .map((item) => (
              <a
                key={item.classId}
                className="secondary-action"
                href={item.alternateLink!}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no Google Sala de Aula ({item.className})
              </a>
            ))}
        </div>
        {publication && publication.distributions.length > 1 && (
          <ul className="student-list">
            {publication.distributions.map((item) => (
              <li key={item.classId}>
                <span>{item.className}</span>
                <span className="muted-line">
                  {item.status === "published"
                    ? "Recebeu a atividade"
                    : item.status === "failed"
                      ? "Não recebeu – tente de novo"
                      : "Enviando…"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <FeedbackMessage value={feedback} />
      <div className="inline-actions page-actions">
        {failed && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act("publish", "Atividade enviada para a turma.")
            }
          >
            Tentar enviar de novo
          </button>
        )}
        {activity.status !== "draft" && (
          <a className="primary-action" href={routeHref("correcoes")}>
            Ver respostas
          </a>
        )}
        {activity.status === "published" && (
          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={() =>
              void act("finish", "Respostas encerradas.", {
                title: "Encerrar as respostas?",
                body: `Os alunos não poderão mais responder “${activity.title}”.`,
                confirmLabel: "Encerrar respostas",
              })
            }
          >
            Encerrar respostas
          </button>
        )}
        <button
          type="button"
          className="secondary-action"
          disabled={busy}
          onClick={() =>
            void act("archive", "Atividade guardada.", {
              title: "Guardar esta atividade?",
              body: `“${activity.title}” sai da lista. As respostas e notas já recebidas são mantidas.`,
              confirmLabel: "Guardar atividade",
            })
          }
        >
          Guardar
        </button>
      </div>
    </>
  );
}

/* ------------------------------- Wizard ------------------------------- */

const STEPS = ["Plano", "Questões", "Revisar", "Prazo e envio"];
const DEFAULT_DESCRIPTION = "Leia com atenção e responda a todas as questões.";

type Initial = { activity: Activity; generation: ActivityGeneration | null };

export function ActivityWizard({
  plans,
  initial,
}: {
  plans: LessonPlan[];
  initial?: Initial;
}) {
  const confirm = useConfirm();
  const id = useId();
  const approvedPlans = plans.filter(
    (plan) => plan.status === "approved" && !plan.isArchived,
  );
  const saved = initial?.activity;
  const savedQuestions = saved ? stripIds(saved.questions) : [];
  const pendingSuggestion =
    initial?.generation?.suggestion &&
    initial.generation.reviewStatus !== "approved" &&
    savedQuestions.length === 0
      ? initial.generation
      : null;

  const [step, setStep] = useState(
    savedQuestions.length > 0 || pendingSuggestion ? 3 : saved ? 2 : 1,
  );
  const [planId, setPlanId] = useState(saved?.lessonPlanId ?? "");
  const [title, setTitle] = useState(saved?.title ?? "");
  const [description, setDescription] = useState(
    saved?.description ?? DEFAULT_DESCRIPTION,
  );
  const [type, setType] = useState<ActivityType>(saved?.type ?? "objective");
  const [difficulty, setDifficulty] = useState<ActivityDifficulty>(
    saved?.difficulty ?? "medium",
  );
  const [count, setCount] = useState(4);
  const [questions, setQuestions] = useState<ActivityQuestionInput[]>(
    pendingSuggestion?.suggestion?.questions ?? savedQuestions,
  );
  const [generation, setGeneration] = useState<ActivityGeneration | null>(
    pendingSuggestion,
  );
  const [activityId, setActivityId] = useState<string | null>(
    saved?.id ?? null,
  );
  const [dueAt, setDueAt] = useState(
    toLocalInput(saved?.dueAt ?? provisionalDueAt(new Date())),
  );
  const [lateMode, setLateMode] = useState<"blocked" | "allowed_with_penalty">(
    saved?.latePolicy.mode ?? "blocked",
  );
  const [penalty, setPenalty] = useState(
    saved?.latePolicy.mode === "allowed_with_penalty"
      ? saved.latePolicy.penaltyPercent
      : 10,
  );
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<QuestionErrors[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const plan = plans.find((item) => item.id === planId);

  const goTo = (next: number) => {
    setFeedback(null);
    setStep(next);
  };

  const draftFields = () => ({
    title: title.trim(),
    description: description.trim() || DEFAULT_DESCRIPTION,
    difficulty,
  });

  const createDraft = async (
    draftType: ActivityType,
    draftQuestions: ActivityQuestionInput[],
  ) => {
    const created = await request<{ id: string }>(
      "/activities",
      json("POST", {
        lessonPlanId: planId,
        ...draftFields(),
        type: draftType,
        dueAt: fromLocalInput(dueAt),
        latePolicy: { mode: "blocked" },
        questions: draftQuestions,
      }),
    );
    setActivityId(created.id);
    return created.id;
  };

  const continueFromPlan = () => {
    const found: Record<string, string> = {};
    if (!planId) found.plan = "Escolha o plano da atividade.";
    if (!title.trim()) found.title = "Escreva o título da atividade.";
    setStepErrors(found);
    if (Object.keys(found).length === 0) goTo(2);
  };

  const askAi = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      let currentId = activityId;
      if (currentId)
        await request(
          `/activities/${currentId}`,
          json("PATCH", { ...draftFields(), type, questions: [] }),
        );
      else currentId = await createDraft(type, []);
      const created = await request<ActivityGeneration>(
        `/activities/${currentId}/generate`,
        json("POST", { questionCount: count }),
      );
      if (!created.suggestion)
        throw new ApiError(created.errorCode ?? undefined);
      setGeneration(created);
      setQuestions(created.suggestion.questions);
      setErrors([]);
      goTo(3);
    } catch {
      setFeedback({
        kind: "error",
        text: errorMessage("OPENAI_GENERATION_FAILED"),
      });
    } finally {
      setBusy(false);
    }
  };

  const writeByHand = () => {
    setGeneration(null);
    if (questions.length === 0) setQuestions(initialQuestions(type));
    setErrors([]);
    goTo(3);
  };

  const approveQuestions = async () => {
    const found = questionErrors(questions);
    setErrors(found);
    const derivedType = activityTypeFor(questions);
    if (!derivedType) {
      setFeedback({ kind: "error", text: "Adicione pelo menos uma questão." });
      return;
    }
    if (found.some((item) => Object.keys(item).length > 0)) {
      setFeedback({
        kind: "error",
        text: "Algumas questões precisam de ajuste. Veja as mensagens abaixo de cada uma.",
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      if (generation && activityId) {
        await request(
          `/activities/${activityId}/review`,
          json("POST", {
            generationId: generation.id,
            suggestion: { ...draftFields(), type: derivedType, questions },
          }),
        );
        await request(
          `/activities/${activityId}/approve`,
          json("POST", { generationId: generation.id }),
        );
      } else if (activityId) {
        await request(
          `/activities/${activityId}`,
          json("PATCH", { ...draftFields(), type: derivedType, questions }),
        );
      } else {
        await createDraft(derivedType, questions);
      }
      setType(derivedType);
      goTo(4);
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const saveSchedule = async () => {
    await request(
      `/activities/${activityId}`,
      json("PATCH", {
        dueAt: fromLocalInput(dueAt),
        latePolicy:
          lateMode === "blocked"
            ? { mode: "blocked" }
            : { mode: "allowed_with_penalty", penaltyPercent: penalty },
      }),
    );
  };

  const scheduleIsValid = () => {
    const found: Record<string, string> = {};
    if (!dueAt) found.dueAt = "Escolha o prazo para responder.";
    else if (new Date(dueAt).getTime() <= Date.now())
      found.dueAt = "Escolha um prazo no futuro.";
    if (
      lateMode === "allowed_with_penalty" &&
      (!Number.isInteger(penalty) || penalty < 0 || penalty > 100)
    )
      found.penalty = "Use um número inteiro de 0 a 100.";
    setStepErrors(found);
    return Object.keys(found).length === 0;
  };

  const saveForLater = async () => {
    if (!activityId || !scheduleIsValid()) return;
    setBusy(true);
    try {
      await saveSchedule();
      window.location.hash = routeHref("atividades");
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!activityId || !scheduleIsValid()) return;
    const classes = plan?.classNames.join(", ") || "da turma do plano";
    const confirmed = await confirm({
      title: "Enviar para a turma?",
      body: `“${title}” será publicada no Google Formulários e aparecerá no Google Sala de Aula de ${classes}. Depois de enviada, as questões não podem mais ser alteradas.`,
      confirmLabel: "Enviar para a turma",
    });
    if (!confirmed) return;
    setBusy(true);
    setFeedback(null);
    try {
      await saveSchedule();
      await request(`/activities/${activityId}/publish`, { method: "POST" });
      window.location.hash = routeHref("atividades", activityId);
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const updateQuestion = (index: number, next: ActivityQuestionInput) =>
    setQuestions((current) =>
      current.map((item, position) => (position === index ? next : item)),
    );

  const fieldError = (key: string) =>
    stepErrors[key] && (
      <span className="field-error" id={`${id}-${key}`}>
        {stepErrors[key]}
      </span>
    );
  const invalid = (key: string) =>
    stepErrors[key]
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-${key}` }
      : {};

  return (
    <>
      <a className="back-link" href={routeHref("atividades")}>
        ← Voltar para atividades
      </a>
      <ol className="stepper">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={index + 1 < step ? "done" : undefined}
            aria-current={index + 1 === step ? "step" : undefined}
          >
            <b>
              Passo {index + 1} de {STEPS.length}
            </b>
            {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="timeline-panel stacked-form">
          {approvedPlans.length === 0 ? (
            <div className="all-clear">
              <p>Você ainda não tem plano aprovado.</p>
              <a className="primary-action" href={routeHref("aulas")}>
                Planejar uma aula
              </a>
            </div>
          ) : (
            <>
              <fieldset className="choice-group" {...invalid("plan")}>
                <legend>
                  De qual plano é esta atividade?{" "}
                  <span aria-hidden="true">*</span>
                </legend>
                <div className="choice-grid">
                  {approvedPlans.map((item) => (
                    <label key={item.id} className="choice">
                      <input
                        type="radio"
                        name={`${id}-plan`}
                        checked={planId === item.id}
                        onChange={() => setPlanId(item.id)}
                      />
                      <span>
                        {item.title}
                        <span className="muted-line">
                          {item.classNames.join(", ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {fieldError("plan")}
              </fieldset>
              <div className="field">
                <label>
                  <span>
                    Título da atividade <span aria-hidden="true">*</span>
                  </span>
                  <input
                    value={title}
                    placeholder="Ex.: Frações – exercício 1"
                    onChange={(event) => setTitle(event.target.value)}
                    {...invalid("title")}
                  />
                </label>
                {fieldError("title")}
              </div>
              <label className="field">
                <span>Orientação para os alunos</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="inline-actions">
                <button type="button" onClick={continueFromPlan}>
                  Continuar
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="timeline-panel stacked-form">
          <fieldset className="choice-group">
            <legend>Tipo de questão</legend>
            <div className="choice-grid">
              {(
                [
                  ["objective", "Múltipla escolha"],
                  ["discursive", "Resposta escrita"],
                  ["mixed", "As duas"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="choice">
                  <input
                    type="radio"
                    name={`${id}-type`}
                    checked={type === value}
                    onChange={() => setType(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <label className="field">
              <span>Dificuldade</span>
              <select
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as ActivityDifficulty)
                }
              >
                {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Quantas questões?</span>
              <select
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              >
                {[3, 4, 5, 10].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <FeedbackMessage value={feedback} />
          <div className="choice-grid">
            <button
              type="button"
              className="big-choice"
              disabled={busy}
              onClick={() => void askAi()}
            >
              {busy ? "Pedindo à IA…" : "Pedir questões à IA"}
            </button>
            <button
              type="button"
              className="big-choice secondary"
              disabled={busy}
              onClick={writeByHand}
            >
              Escrever as questões
            </button>
          </div>
          <p className="muted-line">
            A IA usa o plano escolhido. Você revisa tudo antes de enviar.
            {activityId &&
              questions.length > 0 &&
              " Se pedir à IA, as questões atuais serão substituídas pela sugestão."}
          </p>
          <div className="inline-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={() => goTo(1)}
            >
              Voltar
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="stacked-form">
          {generation && (
            <p className="notice warning" role="status">
              Sugestão da IA: leia e ajuste cada questão. Nada vai para os
              alunos antes do passo 4.
            </p>
          )}
          {questions.map((question, index) => (
            <QuestionEditor
              key={index}
              index={index}
              question={question}
              errors={errors[index] ?? {}}
              onChange={(next) => updateQuestion(index, next)}
              onRemove={() =>
                setQuestions((current) =>
                  current.filter((_, position) => position !== index),
                )
              }
            />
          ))}
          <div className="inline-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={() =>
                setQuestions((current) => [
                  ...current,
                  emptyQuestion("objective"),
                ])
              }
            >
              + Questão de múltipla escolha
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() =>
                setQuestions((current) => [
                  ...current,
                  emptyQuestion("discursive"),
                ])
              }
            >
              + Questão de resposta escrita
            </button>
          </div>
          <p className="muted-line">
            Total:{" "}
            {questions.reduce((total, item) => total + (item.points || 0), 0)}{" "}
            pontos
          </p>
          <FeedbackMessage value={feedback} />
          <div className="inline-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={() => goTo(2)}
            >
              Voltar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void approveQuestions()}
            >
              {busy ? "Salvando…" : "Aprovar questões"}
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="timeline-panel stacked-form">
          <div className="field">
            <label>
              <span>
                Prazo para responder <span aria-hidden="true">*</span>
              </span>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                {...invalid("dueAt")}
              />
            </label>
            {fieldError("dueAt")}
          </div>
          <fieldset className="choice-group">
            <legend>Depois do prazo</legend>
            <label className="choice">
              <input
                type="radio"
                name={`${id}-late`}
                checked={lateMode === "blocked"}
                onChange={() => setLateMode("blocked")}
              />
              Não aceitar mais respostas
            </label>
            <label className="choice">
              <input
                type="radio"
                name={`${id}-late`}
                checked={lateMode === "allowed_with_penalty"}
                onChange={() => setLateMode("allowed_with_penalty")}
              />
              Aceitar, tirando uma porcentagem da nota
            </label>
            {lateMode === "allowed_with_penalty" && (
              <div className="field">
                <label>
                  <span>Porcentagem tirada da nota</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={penalty}
                    onChange={(event) => setPenalty(Number(event.target.value))}
                    {...invalid("penalty")}
                  />
                </label>
                {fieldError("penalty")}
              </div>
            )}
          </fieldset>
          <p>
            <b>Vai para: {plan?.classNames.join(", ") || "turma do plano"}</b>
          </p>
          <FeedbackMessage value={feedback} />
          <div className="inline-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={() => goTo(3)}
            >
              Voltar
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={busy}
              onClick={() => void saveForLater()}
            >
              Salvar e enviar depois
            </button>
            <button type="button" disabled={busy} onClick={() => void send()}>
              {busy ? "Enviando…" : "Enviar para a turma"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function QuestionEditor({
  index,
  question,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  question: ActivityQuestionInput;
  errors: QuestionErrors;
  onChange: (question: ActivityQuestionInput) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const number = index + 1;
  const error = (key: keyof QuestionErrors) =>
    errors[key] && (
      <span className="field-error" id={`${id}-${key}`}>
        {errors[key]}
      </span>
    );
  const invalid = (key: keyof QuestionErrors) =>
    errors[key]
      ? { "aria-invalid": true as const, "aria-describedby": `${id}-${key}` }
      : {};

  return (
    <fieldset className="question-editor timeline-panel">
      <legend>
        Questão {number} · {KIND_LABEL[question.kind]}
      </legend>
      <div className="field">
        <label>
          <span>Enunciado</span>
          <textarea
            value={question.prompt}
            onChange={(event) =>
              onChange({ ...question, prompt: event.target.value })
            }
            {...invalid("prompt")}
          />
        </label>
        {error("prompt")}
      </div>
      {question.kind === "objective" ? (
        <div className="alternatives-editor">
          {question.alternatives.map((alternative, position) => (
            <div key={position} className="alternative-row">
              <label className="choice">
                <input
                  type="radio"
                  name={`${id}-correct`}
                  checked={question.correctAlternativeIndex === position}
                  onChange={() =>
                    onChange({ ...question, correctAlternativeIndex: position })
                  }
                  aria-label={`Alternativa ${position + 1} é a certa`}
                />
                Certa
              </label>
              <label className="field">
                <span className="visually-hidden">
                  Alternativa {position + 1}
                </span>
                <input
                  value={alternative}
                  placeholder={`Alternativa ${position + 1}`}
                  aria-label={`Alternativa ${position + 1}`}
                  onChange={(event) =>
                    onChange({
                      ...question,
                      alternatives: question.alternatives.map((item, place) =>
                        place === position ? event.target.value : item,
                      ),
                    })
                  }
                  {...invalid("alternatives")}
                />
              </label>
            </div>
          ))}
          {error("alternatives")}
          {error("correct")}
          {question.alternatives.length < 10 && (
            <button
              type="button"
              className="secondary-action compact-action"
              onClick={() =>
                onChange({
                  ...question,
                  alternatives: [...question.alternatives, ""],
                })
              }
            >
              + Alternativa
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="field">
            <label>
              <span>Resposta esperada</span>
              <textarea
                value={question.targetAnswer}
                onChange={(event) =>
                  onChange({ ...question, targetAnswer: event.target.value })
                }
                {...invalid("targetAnswer")}
              />
            </label>
            {error("targetAnswer")}
          </div>
          <div className="field">
            <label>
              <span>Como você vai corrigir</span>
              <textarea
                value={question.criteria}
                onChange={(event) =>
                  onChange({ ...question, criteria: event.target.value })
                }
                {...invalid("criteria")}
              />
            </label>
            {error("criteria")}
          </div>
        </>
      )}
      <div className="field points-field">
        <label>
          <span>Pontos</span>
          <input
            type="number"
            min="1"
            step="1"
            value={question.points}
            onChange={(event) =>
              onChange({ ...question, points: Number(event.target.value) })
            }
            {...invalid("points")}
          />
        </label>
        {error("points")}
      </div>
      <button
        type="button"
        className="danger-action compact-action"
        onClick={onRemove}
      >
        Remover questão {number}
      </button>
    </fieldset>
  );
}
