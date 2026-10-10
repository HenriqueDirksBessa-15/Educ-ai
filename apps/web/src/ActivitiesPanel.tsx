import type {
  Activity,
  ActivityCollectionSummary,
  ActivityGeneration,
  ActivityInput,
  ActivityPublication,
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
  const [difficulty, setDifficulty] =
    useState<Activity["difficulty"]>("medium");
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
  const [generation, setGeneration] = useState<ActivityGeneration | null>(null);
  const [publication, setPublication] = useState<ActivityPublication | null>(
    null,
  );
  const [collection, setCollection] =
    useState<ActivityCollectionSummary | null>(null);
  const [correctionDrafts, setCorrectionDrafts] = useState<
    Record<string, { pointsAwarded: number; comment: string }>
  >({});
  const [questionCount, setQuestionCount] = useState(4);

  useEffect(() => {
    if (!collection) return;
    setCorrectionDrafts((current) => {
      const next = { ...current };
      for (const submission of collection.submissions) {
        for (const answer of submission.answers) {
          if (answer.kind !== "discursive") continue;
          next[answer.id] = next[answer.id] ?? {
            pointsAwarded:
              answer.pointsAwarded ?? answer.suggestedPointsAwarded ?? 0,
            comment:
              answer.teacherComment ??
              answer.suggestedComment ??
              "Revisão docente.",
          };
        }
      }
      return next;
    });
  }, [collection]);

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
    setDifficulty("medium");
    setDueAt("");
    setLateMode("blocked");
    setPenaltyPercent(0);
    setQuestions([emptyObjective()]);
    setGeneration(null);
    setPublication(null);
    setCollection(null);
    setCorrectionDrafts({});
    setMessage(null);
  };

  const loadAssistState = async (activityId: string) => {
    const [generationResponse, publicationResponse, collectionResponse] =
      await Promise.all([
        fetch(`${apiBaseUrl}/activities/${activityId}/generation`, {
          credentials: "include",
        }),
        fetch(`${apiBaseUrl}/activities/${activityId}/publication`, {
          credentials: "include",
        }),
        fetch(`${apiBaseUrl}/activities/${activityId}/collection`, {
          credentials: "include",
        }),
      ]);
    if (generationResponse.ok) {
      const body =
        (await generationResponse.json()) as DataEnvelope<ActivityGeneration | null>;
      setGeneration(body.data);
    }
    if (publicationResponse.ok) {
      const body =
        (await publicationResponse.json()) as DataEnvelope<ActivityPublication | null>;
      setPublication(body.data);
    }
    if (collectionResponse.ok) {
      const body =
        (await collectionResponse.json()) as DataEnvelope<ActivityCollectionSummary | null>;
      setCollection(body.data);
    }
  };

  const editActivity = (activity: Activity) => {
    setSelected(activity);
    setTitle(activity.title);
    setDescription(activity.description);
    setLessonPlanId(activity.lessonPlanId);
    setType(activity.type);
    setDifficulty(activity.difficulty);
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
    setGeneration(null);
    setPublication(null);
    setCollection(null);
    void loadAssistState(activity.id);
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
      difficulty,
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
                  difficulty: input.difficulty,
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
      if (selected) await loadAssistState(selected.id);
      else resetForm();
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
      if (action === "publish") {
        const body =
          (await response.json()) as DataEnvelope<ActivityPublication>;
        setPublication(body.data);
        setMessage(publicationMessage(body.data));
        if (body.data.status === "published")
          setSelected({
            ...activity,
            status: "published",
            publishedAt: new Date().toISOString(),
          });
      } else {
        setMessage(
          action === "finish"
            ? "Atividade finalizada."
            : "Atividade arquivada sem excluir respostas.",
        );
      }
      if (selected?.id === activity.id && action !== "publish")
        setSelected(null);
      await loadActivities();
    } catch {
      setMessage("A mudança de estado não pôde ser concluída.");
    } finally {
      setSaving(false);
    }
  };

  const generateActivity = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage("Gerando uma sugestão estruturada…");
    try {
      const response = await fetch(
        `${apiBaseUrl}/activities/${selected.id}/generate`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionCount }),
        },
      );
      if (!response.ok) throw new Error();
      const body = (await response.json()) as DataEnvelope<ActivityGeneration>;
      setGeneration(body.data);
      setMessage("Sugestão gerada. Carregue-a no editor e revise cada campo.");
    } catch {
      setMessage("A IA não respondeu corretamente; o rascunho foi preservado.");
      await loadAssistState(selected.id);
    } finally {
      setSaving(false);
    }
  };

  const loadSuggestion = () => {
    if (!generation?.suggestion) return;
    setTitle(generation.suggestion.title);
    setDescription(generation.suggestion.description);
    setType(generation.suggestion.type);
    setDifficulty(generation.suggestion.difficulty);
    setQuestions(generation.suggestion.questions);
    setMessage(
      "Sugestão carregada. Edite o conteúdo antes de confirmar a revisão.",
    );
  };

  const reviewGeneration = async () => {
    if (!selected || !generation?.suggestion) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/activities/${selected.id}/review`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            generationId: generation.id,
            suggestion: { title, description, type, difficulty, questions },
          }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage("Revisão registrada. A versão já pode ser aprovada.");
      await loadAssistState(selected.id);
      await loadActivities();
    } catch {
      setMessage("Não foi possível registrar a revisão desta sugestão.");
    } finally {
      setSaving(false);
    }
  };

  const approveGeneration = async () => {
    if (!selected || !generation) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/activities/${selected.id}/approve`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ generationId: generation.id }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage("Versão aprovada pelo professor e liberada para publicação.");
      await loadAssistState(selected.id);
    } catch {
      setMessage("Revise explicitamente a sugestão antes de aprová-la.");
    } finally {
      setSaving(false);
    }
  };

  const collectResponses = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage("Coletando e corrigindo respostas objetivas…");
    try {
      const response = await fetch(
        `${apiBaseUrl}/activities/${selected.id}/collect`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error();
      const body =
        (await response.json()) as DataEnvelope<ActivityCollectionSummary>;
      setCollection(body.data);
      setMessage(
        `${body.data.submissionCount} submissões processadas; ${body.data.manualReviewCount} exigem revisão manual.`,
      );
      await loadActivities();
    } catch {
      setMessage(
        "A coleta ainda não está disponível ou falhou. A repetição não duplicará respostas.",
      );
      await loadAssistState(selected.id);
    } finally {
      setSaving(false);
    }
  };

  const suggestDiscursiveCorrection = async (
    submissionId: string,
    answerId: string,
  ) => {
    if (!selected) return;
    setSaving(true);
    setMessage("Gerando sugestão discursiva para revisão…");
    try {
      const response = await fetch(
        `${apiBaseUrl}/submissions/${submissionId}/corrections/suggest`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answerId, rigour: "balanced" }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage(
        "Sugestão registrada. Revise pontos e comentário antes de salvar.",
      );
      await loadAssistState(selected.id);
    } catch {
      setMessage("A IA não sugeriu uma correção; faça a revisão manual.");
      await loadAssistState(selected.id);
    } finally {
      setSaving(false);
    }
  };

  const reviewSubmission = async (
    submission: ActivityCollectionSummary["submissions"][number],
  ) => {
    if (!selected) return;
    const discursive = submission.answers.filter(
      (answer) => answer.kind === "discursive",
    );
    setSaving(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/submissions/${submission.id}/correction`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            answers: discursive.map((answer) => ({
              answerId: answer.id,
              pointsAwarded: correctionDrafts[answer.id]?.pointsAwarded ?? 0,
              comment:
                correctionDrafts[answer.id]?.comment || "Revisão docente.",
            })),
            teacherComment: "Correção discursiva revisada pelo professor.",
          }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage("Correção docente salva. A submissão já pode ser aprovada.");
      await loadAssistState(selected.id);
    } catch {
      setMessage("Revise todas as discursivas e respeite a pontuação máxima.");
    } finally {
      setSaving(false);
    }
  };

  const changeCorrectionState = async (
    submissionId: string,
    action: "approve" | "release",
  ) => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/submissions/${submissionId}/${action}`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error();
      setMessage(
        action === "approve"
          ? "Nota aprovada pelo professor."
          : "Nota liberada; o estado do Classroom foi registrado.",
      );
      await loadAssistState(selected.id);
    } catch {
      setMessage(
        action === "approve"
          ? "Revise todas as discursivas antes de aprovar."
          : "A nota segue aprovada; tente novamente a devolução ao Classroom.",
      );
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
          <span className="section-label">Dia 11 · RF012</span>
          <h2 id="activities-title">
            Atividades assistidas e publicação Google
          </h2>
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
                    · {difficultyLabel(activity.difficulty)} ·{" "}
                    {activity.totalPoints} pontos
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
              Dificuldade
              <select
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(event.target.value as Activity["difficulty"])
                }
              >
                <option value="easy">Fácil</option>
                <option value="medium">Média</option>
                <option value="hard">Difícil</option>
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

          {selected?.status === "draft" && (
            <section
              className="activity-assistant"
              aria-label="Assistente de IA"
            >
              <div>
                <span className="section-label">
                  IA com revisão obrigatória
                </span>
                <h3>Gerar questões a partir do plano</h3>
                <p>
                  A sugestão não substitui o rascunho até você carregá-la,
                  revisar os campos e aprovar a versão.
                </p>
              </div>
              <div className="form-row assistant-controls">
                <label>
                  Quantidade de questões
                  <input
                    type="number"
                    min={type === "mixed" ? 2 : 1}
                    max="100"
                    value={questionCount}
                    onChange={(event) =>
                      setQuestionCount(Number(event.target.value))
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void generateActivity()}
                >
                  {saving ? "Processando…" : "Gerar sugestão"}
                </button>
              </div>
              {generation && (
                <div className="assistant-result">
                  <strong>
                    Versão {generation.version} · {generationStatus(generation)}
                  </strong>
                  <small>
                    {generation.model} · origem {generation.origin}
                  </small>
                  {generation.errorCode && (
                    <span className="status-error">{generation.errorCode}</span>
                  )}
                  {generation.suggestion && (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="secondary-action compact-action"
                        onClick={loadSuggestion}
                      >
                        Carregar no editor
                      </button>
                      <button
                        type="button"
                        className="secondary-action compact-action"
                        disabled={saving || questions.length === 0}
                        onClick={() => void reviewGeneration()}
                      >
                        Confirmar revisão
                      </button>
                      {generation.reviewStatus === "reviewed" && (
                        <button
                          type="button"
                          className="compact-action"
                          disabled={saving}
                          onClick={() => void approveGeneration()}
                        >
                          Aprovar versão
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
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
                  min="1"
                  step="1"
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
              {selected?.status === "draft" || !selected ? (
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
              ) : null}
            </fieldset>
          ))}
          {questions.length === 0 && (
            <p className="empty-state">
              Rascunho sem questões. Adicione manualmente ou use a geração por
              IA.
            </p>
          )}
          {selected && publication && (
            <section
              className="publication-status"
              aria-label="Publicação Google"
            >
              <span className="section-label">Google Forms e Classroom</span>
              <h3>{publicationStatusLabel(publication.status)}</h3>
              {publication.errorCode && (
                <p className="status-error">
                  {publicationErrorLabel(publication.errorCode)}
                </p>
              )}
              {publication.responderUri && (
                <a
                  href={publication.responderUri}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir formulário publicado
                </a>
              )}
              <ul className="publication-targets">
                {publication.distributions.map((distribution) => (
                  <li key={distribution.classId}>
                    <strong>{distribution.className}</strong>
                    <span>{distributionStatusLabel(distribution.status)}</span>
                    {distribution.errorCode && (
                      <small>
                        {publicationErrorLabel(distribution.errorCode)}
                      </small>
                    )}
                    {distribution.alternateLink && (
                      <a
                        href={distribution.alternateLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir no Classroom
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {publication.collectionScheduledAt && (
                <small>
                  Coleta agendada para{" "}
                  {new Date(publication.collectionScheduledAt).toLocaleString(
                    "pt-BR",
                  )}
                </small>
              )}
              {publication.status === "published" &&
                selected.status !== "draft" && (
                  <button
                    type="button"
                    className="secondary-action compact-action"
                    disabled={saving}
                    onClick={() => void collectResponses()}
                  >
                    {saving ? "Processando…" : "Coletar respostas"}
                  </button>
                )}
            </section>
          )}
          {selected && collection && (
            <section className="publication-status" aria-label="Correções">
              <span className="section-label">Coleta e correção objetiva</span>
              <h3>{collectionStatusLabel(collection.status)}</h3>
              <p>
                {collection.submissionCount} submissões ·{" "}
                {collection.gradedCount} corrigidas ·{" "}
                {collection.manualReviewCount} para revisão manual
              </p>
              {collection.lastErrorCode && (
                <p className="status-error">{collection.lastErrorCode}</p>
              )}
              <ul className="publication-targets">
                {collection.submissions.map((submission) => (
                  <li key={submission.id}>
                    <strong>
                      {submission.studentName ??
                        submission.respondentEmail ??
                        "Aluno não reconciliado"}
                    </strong>
                    <span>{submissionStatusLabel(submission.status)}</span>
                    <small>
                      {submission.grade === null
                        ? "Nota pendente"
                        : `Nota ${submission.grade.toLocaleString("pt-BR")}/10`}
                    </small>
                    {submission.manualReviewReason && (
                      <small>{submission.manualReviewReason}</small>
                    )}
                    <small>
                      Correção:{" "}
                      {correctionStatusLabel(submission.correctionStatus)}
                      {" · "}Classroom:{" "}
                      {classroomStatusLabel(submission.classroomReturnStatus)}
                    </small>
                    {submission.answers
                      .filter((answer) => answer.kind === "discursive")
                      .map((answer) => (
                        <div className="discursive-correction" key={answer.id}>
                          <strong>{answer.prompt}</strong>
                          <p>{answer.answerText || "Resposta vazia"}</p>
                          {answer.suggestedComment && (
                            <small>
                              Sugestão: {answer.suggestedPointsAwarded}/
                              {answer.pointsPossible} ·{" "}
                              {answer.suggestedComment}
                            </small>
                          )}
                          <div className="form-row">
                            <label>
                              Pontos
                              <input
                                type="number"
                                min="0"
                                max={answer.pointsPossible ?? undefined}
                                step="0.01"
                                value={
                                  correctionDrafts[answer.id]?.pointsAwarded ??
                                  0
                                }
                                onChange={(event) =>
                                  setCorrectionDrafts((current) => ({
                                    ...current,
                                    [answer.id]: {
                                      pointsAwarded: Number(event.target.value),
                                      comment:
                                        current[answer.id]?.comment ??
                                        "Revisão docente.",
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label>
                              Comentário docente
                              <input
                                value={
                                  correctionDrafts[answer.id]?.comment ?? ""
                                }
                                onChange={(event) =>
                                  setCorrectionDrafts((current) => ({
                                    ...current,
                                    [answer.id]: {
                                      pointsAwarded:
                                        current[answer.id]?.pointsAwarded ?? 0,
                                      comment: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <button
                            type="button"
                            className="secondary-action compact-action"
                            disabled={
                              saving ||
                              ["approved", "released"].includes(
                                submission.correctionStatus,
                              )
                            }
                            onClick={() =>
                              void suggestDiscursiveCorrection(
                                submission.id,
                                answer.id,
                              )
                            }
                          >
                            Sugerir com IA
                          </button>
                        </div>
                      ))}
                    {submission.answers.some(
                      (answer) => answer.kind === "discursive",
                    ) && (
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="secondary-action compact-action"
                          disabled={
                            saving ||
                            ["approved", "released"].includes(
                              submission.correctionStatus,
                            )
                          }
                          onClick={() => void reviewSubmission(submission)}
                        >
                          Salvar revisão
                        </button>
                        <button
                          type="button"
                          className="compact-action"
                          disabled={
                            saving || submission.correctionStatus !== "reviewed"
                          }
                          onClick={() =>
                            void changeCorrectionState(submission.id, "approve")
                          }
                        >
                          Aprovar nota
                        </button>
                        <button
                          type="button"
                          className="compact-action"
                          disabled={
                            saving || submission.correctionStatus !== "approved"
                          }
                          onClick={() =>
                            void changeCorrectionState(submission.id, "release")
                          }
                        >
                          Liberar
                        </button>
                      </div>
                    )}
                    {!submission.answers.some(
                      (answer) => answer.kind === "discursive",
                    ) && (
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="compact-action"
                          disabled={
                            saving || submission.correctionStatus !== "pending"
                          }
                          onClick={() =>
                            void changeCorrectionState(submission.id, "approve")
                          }
                        >
                          Aprovar nota objetiva
                        </button>
                        <button
                          type="button"
                          className="compact-action"
                          disabled={
                            saving || submission.correctionStatus !== "approved"
                          }
                          onClick={() =>
                            void changeCorrectionState(submission.id, "release")
                          }
                        >
                          Liberar
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
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

function difficultyLabel(difficulty: Activity["difficulty"]): string {
  return { easy: "Fácil", medium: "Média", hard: "Difícil" }[difficulty];
}

function generationStatus(generation: ActivityGeneration): string {
  if (generation.status === "failed") return "Falha na geração";
  return {
    generated: "Aguardando revisão",
    reviewed: "Revisada",
    approved: "Aprovada",
  }[generation.reviewStatus ?? "generated"];
}

function publicationStatusLabel(status: ActivityPublication["status"]): string {
  return {
    pending: "Publicação preparada",
    creating_form: "Criando Google Form",
    distributing: "Distribuindo no Classroom",
    published: "Publicada no Google",
    failed: "Publicação incompleta",
    reconciliation_required: "Reconciliação necessária",
  }[status];
}

function distributionStatusLabel(
  status: ActivityPublication["distributions"][number]["status"],
): string {
  return {
    pending: "Pendente",
    published: "Publicado",
    failed: "Falhou",
  }[status];
}

function publicationErrorLabel(code: string): string {
  const labels: Record<string, string> = {
    GOOGLE_CREDENTIAL_MISSING: "Conecte novamente sua conta Google.",
    GOOGLE_RECONSENT_REQUIRED:
      "Autorize os novos escopos de Forms e Classroom entrando novamente.",
    GOOGLE_CLASSROOM_ID_MISSING:
      "A turma ainda não possui vínculo com o Google Classroom.",
    GOOGLE_POINTS_MUST_BE_INTEGER:
      "O Google Forms exige pontuações inteiras em todas as questões.",
    GOOGLE_PERMISSION_DENIED: "A conta não tem permissão para publicar.",
    GOOGLE_RATE_LIMITED: "O limite temporário do Google foi atingido.",
    GOOGLE_DISTRIBUTION_INCOMPLETE:
      "Algumas turmas ainda não receberam a atividade.",
  };
  return labels[code] ?? `Falha externa: ${code}`;
}

function publicationMessage(publication: ActivityPublication): string {
  if (publication.status === "published")
    return "Atividade publicada no Forms e distribuída no Classroom.";
  if (publication.status === "reconciliation_required")
    return "A resposta do Google foi ambígua. Tente novamente para reconciliar sem duplicar.";
  if (publication.errorCode)
    return publicationErrorLabel(publication.errorCode);
  return "Publicação iniciada. Consulte o estado de cada turma.";
}

function collectionStatusLabel(
  status: ActivityCollectionSummary["status"],
): string {
  return {
    pending: "Coleta agendada",
    running: "Coleta em andamento",
    completed: "Coleta concluída",
    failed: "Coleta com falha recuperável",
  }[status];
}

function submissionStatusLabel(
  status: ActivityCollectionSummary["submissions"][number]["status"],
): string {
  return {
    collected: "Objetivas corrigidas; discursivas pendentes",
    objective_graded: "Correção objetiva concluída",
    manual_review_required: "Correção manual necessária",
  }[status];
}

function correctionStatusLabel(
  status: ActivityCollectionSummary["submissions"][number]["correctionStatus"],
): string {
  return {
    pending: "Pendente",
    suggested: "Sugestão disponível",
    manual_required: "Correção manual necessária",
    reviewed: "Revisada pelo professor",
    approved: "Aprovada",
    released: "Liberada",
  }[status];
}

function classroomStatusLabel(
  status: ActivityCollectionSummary["submissions"][number]["classroomReturnStatus"],
): string {
  return {
    pending: "Pendente",
    not_available: "Não disponível",
    returned: "Devolvida",
    failed: "Falha recuperável",
  }[status];
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
