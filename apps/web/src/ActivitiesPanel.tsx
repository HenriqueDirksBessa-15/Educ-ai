import type {
  Activity,
  ActivityInput,
  ActivityQuestionInput,
  ActivityStatus,
  ActivityType,
  LessonPlan,
} from "@educai/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
type DataEnvelope<T> = { data: T };
type Filter = "all" | ActivityStatus;

const emptyObjective = (): ActivityQuestionInput => ({
  kind: "objective",
  prompt: "",
  points: 1,
  alternatives: ["", ""],
  correctAlternativeIndex: 0,
});

const emptyDiscursive = (): ActivityQuestionInput => ({
  kind: "discursive",
  prompt: "",
  points: 1,
  targetAnswer: "",
  criteria: "",
});

export function ActivitiesPanel({ plans }: { plans: LessonPlan[] }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Activity | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lessonPlanId, setLessonPlanId] = useState("");
  const [type, setType] = useState<ActivityType>("objective");
  const [dueAt, setDueAt] = useState("");
  const [lateMode, setLateMode] = useState<"blocked" | "allowed_with_penalty">(
    "blocked",
  );
  const [penaltyPercent, setPenaltyPercent] = useState(0);
  const [questions, setQuestions] = useState<ActivityQuestionInput[]>([
    emptyObjective(),
  ]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadActivities = useCallback(async () => {
    const query = filter === "all" ? "" : `?status=${filter}`;
    const response = await fetch(`${apiBaseUrl}/activities${query}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error();
    const body = (await response.json()) as DataEnvelope<Activity[]>;
    setActivities(body.data);
  }, [filter]);

  useEffect(() => {
    void loadActivities().catch(() =>
      setMessage("Não foi possível carregar as atividades."),
    );
  }, [loadActivities]);

  const totalPoints = useMemo(
    () => questions.reduce((total, question) => total + question.points, 0),
    [questions],
  );

  const resetForm = () => {
    setSelected(null);
    setTitle("");
    setDescription("");
    setLessonPlanId(plans[0]?.id ?? "");
    setType("objective");
    setDueAt("");
    setLateMode("blocked");
    setPenaltyPercent(0);
    setQuestions([emptyObjective()]);
    setMessage(null);
  };

  const editActivity = (activity: Activity) => {
    setSelected(activity);
    setTitle(activity.title);
    setDescription(activity.description);
    setLessonPlanId(activity.lessonPlanId);
    setType(activity.type);
    setDueAt(toLocalDateTime(activity.dueAt));
    setLateMode(activity.latePolicy.mode);
    setPenaltyPercent(
      activity.latePolicy.mode === "allowed_with_penalty"
        ? activity.latePolicy.penaltyPercent
        : 0,
    );
    setQuestions(
      activity.questions.map((question) =>
        question.kind === "objective"
          ? {
              kind: question.kind,
              prompt: question.prompt,
              points: question.points,
              alternatives: question.alternatives,
              correctAlternativeIndex: question.correctAlternativeIndex,
            }
          : {
              kind: question.kind,
              prompt: question.prompt,
              points: question.points,
              targetAnswer: question.targetAnswer,
              criteria: question.criteria,
            },
      ),
    );
    setMessage(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const input: ActivityInput = {
      lessonPlanId,
      title,
      description,
      type,
      dueAt: new Date(dueAt).toISOString(),
      latePolicy:
        lateMode === "blocked"
          ? { mode: "blocked" }
          : { mode: "allowed_with_penalty", penaltyPercent },
      questions,
    };
    try {
      const response = await fetch(
        selected
          ? `${apiBaseUrl}/activities/${selected.id}`
          : `${apiBaseUrl}/activities`,
        {
          method: selected ? "PATCH" : "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            selected
              ? {
                  title: input.title,
                  description: input.description,
                  type: input.type,
                  dueAt: input.dueAt,
                  latePolicy: input.latePolicy,
                  questions: input.questions,
                }
              : input,
          ),
        },
      );
      if (!response.ok) throw new Error();
      setMessage(selected ? "Rascunho atualizado." : "Rascunho criado.");
      await loadActivities();
      if (!selected) resetForm();
    } catch {
      setMessage(
        "Revise o tipo, o prazo, as questões e todos os campos obrigatórios.",
      );
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (
    activity: Activity,
    action: "publish" | "finish" | "archive",
  ) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/activities/${activity.id}/${action}`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error();
      setMessage(
        action === "publish"
          ? "Atividade publicada e estrutura bloqueada."
          : action === "finish"
            ? "Atividade finalizada."
            : "Atividade arquivada sem excluir respostas.",
      );
      if (selected?.id === activity.id) setSelected(null);
      await loadActivities();
    } catch {
      setMessage("A mudança de estado não pôde ser concluída.");
    } finally {
      setSaving(false);
    }
  };

  const updateQuestion = (index: number, question: ActivityQuestionInput) =>
    setQuestions((current) =>
      current.map((item, position) => (position === index ? question : item)),
    );

  const canSave = Boolean(
    title.trim() && description.trim() && lessonPlanId && dueAt,
  );

  return (
    <section className="timeline-panel" aria-labelledby="activities-title">
      <div className="status-heading">
        <div>
          <span className="section-label">Dia 8 · RF011</span>
          <h2 id="activities-title">Atividades e questões locais</h2>
        </div>
        <button className="secondary-action" type="button" onClick={resetForm}>
          Nova atividade
        </button>
      </div>

      <div className="activity-filters" aria-label="Filtrar atividades">
        {(["all", "draft", "published", "finished"] as const).map((value) => (
          <button
            type="button"
            className={filter === value ? "filter-active" : "secondary-action"}
            key={value}
            onClick={() => setFilter(value)}
          >
            {statusLabel(value)}
          </button>
        ))}
      </div>

      <div className="activities-layout">
        <div>
          <h3>Atividades</h3>
          {activities.length === 0 ? (
            <p className="empty-state">Nenhuma atividade neste filtro.</p>
          ) : (
            <ul className="resource-list">
              {activities.map((activity) => (
                <li key={activity.id}>
                  <strong>{activity.title}</strong>
                  <span>
                    {statusLabel(activity.status)} · {typeLabel(activity.type)}{" "}
                    · {activity.totalPoints} pontos
                  </span>
                  <small>
                    {activity.lessonPlanTitle} · prazo{" "}
                    {new Date(activity.dueAt).toLocaleString("pt-BR")}
                  </small>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-action compact-action"
                      onClick={() => editActivity(activity)}
                    >
                      {activity.status === "draft"
                        ? "Editar e revisar"
                        : "Visualizar"}
                    </button>
                    {activity.status === "draft" && (
                      <button
                        type="button"
                        className="compact-action"
                        disabled={saving}
                        onClick={() => void runAction(activity, "publish")}
                      >
                        Publicar
                      </button>
                    )}
                    {activity.status === "published" && (
                      <button
                        type="button"
                        className="compact-action"
                        disabled={saving}
                        onClick={() => void runAction(activity, "finish")}
                      >
                        Finalizar
                      </button>
                    )}
                    <button
                      type="button"
                      className="secondary-action compact-action"
                      disabled={saving}
                      onClick={() => void runAction(activity, "archive")}
                    >
                      Arquivar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form className="activity-form" onSubmit={(event) => void save(event)}>
          <h3>{selected ? "Revisar atividade" : "Novo rascunho"}</h3>
          <label>
            Plano obrigatório
            <select
              value={lessonPlanId}
              disabled={Boolean(selected)}
              onChange={(event) => setLessonPlanId(event.target.value)}
            >
              <option value="">Selecione um plano</option>
              {plans
                .filter((plan) => !plan.isArchived)
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
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
            Descrição
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Tipo
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as ActivityType)
                }
              >
                <option value="objective">Objetiva</option>
                <option value="discursive">Discursiva</option>
                <option value="mixed">Mista</option>
              </select>
            </label>
            <label>
              Prazo
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Atrasos
              <select
                value={lateMode}
                onChange={(event) =>
                  setLateMode(
                    event.target.value as "blocked" | "allowed_with_penalty",
                  )
                }
              >
                <option value="blocked">Bloquear após o prazo</option>
                <option value="allowed_with_penalty">
                  Aceitar com penalidade
                </option>
              </select>
            </label>
            {lateMode === "allowed_with_penalty" && (
              <label>
                Penalidade (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={penaltyPercent}
                  onChange={(event) =>
                    setPenaltyPercent(Number(event.target.value))
                  }
                />
              </label>
            )}
          </div>

          <div className="questions-heading">
            <h3>Questões</h3>
            <div className="inline-actions">
              <button
                type="button"
                className="secondary-action compact-action"
                onClick={() =>
                  setQuestions((items) => [...items, emptyObjective()])
                }
              >
                + Objetiva
              </button>
              <button
                type="button"
                className="secondary-action compact-action"
                onClick={() =>
                  setQuestions((items) => [...items, emptyDiscursive()])
                }
              >
                + Discursiva
              </button>
            </div>
          </div>
          {questions.map((question, index) => (
            <fieldset
              className="question-editor"
              key={`${question.kind}-${index}`}
            >
              <legend>
                {index + 1}.{" "}
                {question.kind === "objective" ? "Objetiva" : "Discursiva"}
              </legend>
              <label>
                Enunciado
                <textarea
                  value={question.prompt}
                  onChange={(event) =>
                    updateQuestion(index, {
                      ...question,
                      prompt: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Pontuação
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={question.points}
                  onChange={(event) =>
                    updateQuestion(index, {
                      ...question,
                      points: Number(event.target.value),
                    })
                  }
                />
              </label>
              {question.kind === "objective" ? (
                <div className="alternatives-editor">
                  {question.alternatives.map(
                    (alternative, alternativeIndex) => (
                      <label key={alternativeIndex}>
                        <input
                          type="radio"
                          name={`answer-${index}`}
                          checked={
                            question.correctAlternativeIndex ===
                            alternativeIndex
                          }
                          onChange={() =>
                            updateQuestion(index, {
                              ...question,
                              correctAlternativeIndex: alternativeIndex,
                            })
                          }
                        />
                        <input
                          aria-label={`Alternativa ${alternativeIndex + 1}`}
                          value={alternative}
                          onChange={(event) =>
                            updateQuestion(index, {
                              ...question,
                              alternatives: question.alternatives.map(
                                (item, position) =>
                                  position === alternativeIndex
                                    ? event.target.value
                                    : item,
                              ),
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                  <button
                    type="button"
                    className="secondary-action compact-action"
                    onClick={() =>
                      updateQuestion(index, {
                        ...question,
                        alternatives: [...question.alternatives, ""],
                      })
                    }
                  >
                    + Alternativa
                  </button>
                </div>
              ) : (
                <>
                  <label>
                    Resposta-alvo
                    <textarea
                      value={question.targetAnswer}
                      onChange={(event) =>
                        updateQuestion(index, {
                          ...question,
                          targetAnswer: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Critérios de correção
                    <textarea
                      value={question.criteria}
                      onChange={(event) =>
                        updateQuestion(index, {
                          ...question,
                          criteria: event.target.value,
                        })
                      }
                    />
                  </label>
                </>
              )}
              {questions.length > 1 && (
                <button
                  type="button"
                  className="secondary-action compact-action"
                  onClick={() =>
                    setQuestions((items) =>
                      items.filter((_, position) => position !== index),
                    )
                  }
                >
                  Remover questão
                </button>
              )}
            </fieldset>
          ))}
          {selected?.status === "draft" || !selected ? (
            <button type="submit" disabled={saving || !canSave}>
              {saving
                ? "Salvando…"
                : selected
                  ? "Salvar revisão"
                  : "Criar rascunho"}
            </button>
          ) : (
            <small>A estrutura foi bloqueada após a publicação.</small>
          )}
          {message && (
            <small className="form-message" role="status">
              {message}
            </small>
          )}
        </form>
      </div>

      <article
        className="activity-preview"
        aria-label="Pré-visualização da atividade"
      >
        <span className="section-label">
          Pré-visualização antes da publicação
        </span>
        <h3>{title || "Atividade sem título"}</h3>
        <p>
          {description || "Adicione uma descrição para orientar os alunos."}
        </p>
        <small>
          {totalPoints} pontos no total · critérios e pontuação visíveis
        </small>
        <ol>
          {questions.map((question, index) => (
            <li key={index}>
              <strong>
                {question.prompt || "Enunciado pendente"} ({question.points} pt)
              </strong>
              {question.kind === "objective" ? (
                <ul>
                  {question.alternatives.map((alternative, position) => (
                    <li key={position}>
                      {alternative || `Alternativa ${position + 1}`}
                      {position === question.correctAlternativeIndex
                        ? " · gabarito"
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  <b>Critérios:</b> {question.criteria || "Pendente"}
                </p>
              )}
            </li>
          ))}
        </ol>
      </article>
    </section>
  );
}

function statusLabel(status: Filter): string {
  return {
    all: "Todas",
    draft: "Rascunho",
    published: "Publicada",
    finished: "Finalizada",
  }[status];
}

function typeLabel(type: ActivityType): string {
  return { objective: "Objetiva", discursive: "Discursiva", mixed: "Mista" }[
    type
  ];
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
