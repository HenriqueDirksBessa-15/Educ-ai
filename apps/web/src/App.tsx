import type {
  AuthSession,
  ClassDetail,
  ClassSummary,
  CurriculumSyllabus,
  Identity,
  IntegrationStatus,
  LessonPlan,
  LessonPlanGeneration,
  LessonPlanSuggestion,
  Material,
  Milestone,
} from "@educai/contracts";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ClassesPanel } from "./ClassesPanel";
import { MaterialsPanel } from "./MaterialsPanel";

const ActivitiesPanel = lazy(() =>
  import("./ActivitiesPanel").then((module) => ({
    default: module.ActivitiesPanel,
  })),
);
const FeedbackPanel = lazy(() =>
  import("./FeedbackPanel").then((module) => ({
    default: module.FeedbackPanel,
  })),
);
const BulletinsPanel = lazy(() =>
  import("./BulletinsPanel").then((module) => ({
    default: module.BulletinsPanel,
  })),
);

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
const devAuthEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_AUTH === "true";

type AppState =
  | { kind: "loading" }
  | { kind: "unauthenticated" }
  | {
      kind: "authenticated";
      identity: Identity;
      integrations: IntegrationStatus[];
    }
  | { kind: "error"; message: string };

type DataEnvelope<T> = { data: T };

export function App() {
  const [state, setState] = useState<AppState>({ kind: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);

  const loadSession = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const sessionResponse = await fetch(`${apiBaseUrl}/auth/session`, {
        credentials: "include",
      });
      if (!sessionResponse.ok) throw new Error("session unavailable");
      const { data: session } =
        (await sessionResponse.json()) as DataEnvelope<AuthSession>;
      if (!session.authenticated) {
        setState({ kind: "unauthenticated" });
        return;
      }

      const integrationsResponse = await fetch(
        `${apiBaseUrl}/integrations/status`,
        { credentials: "include" },
      );
      const integrations = integrationsResponse.ok
        ? (
            (await integrationsResponse.json()) as DataEnvelope<
              IntegrationStatus[]
            >
          ).data
        : [];
      setState({
        kind: "authenticated",
        identity: session.identity,
        integrations,
      });
    } catch {
      setState({
        kind: "error",
        message: "Não foi possível consultar sua sessão na API local.",
      });
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      window.history.replaceState({}, "", window.location.pathname);
      setState({ kind: "unauthenticated" });
    } finally {
      setLoggingOut(false);
    }
  };

  const devLogin = async () => {
    const response = await fetch(`${apiBaseUrl}/auth/dev-login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      setState({
        kind: "error",
        message: "A sessão de demonstração não está disponível.",
      });
      return;
    }
    await loadSession();
  };

  const authError = readAuthError();

  return (
    <main className="page-shell" id="main-content">
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo principal
      </a>
      <header className="app-header">
        <span className="brand">EDUC.AI</span>
        {state.kind === "authenticated" && (
          <button
            className="secondary-action"
            type="button"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? "Saindo…" : "Sair"}
          </button>
        )}
      </header>

      {state.kind === "loading" && (
        <section className="center-card" aria-live="polite">
          <span className="eyebrow">Identidade Google</span>
          <h1>Carregando sua sessão…</h1>
        </section>
      )}

      {state.kind === "error" && (
        <section className="center-card" role="alert">
          <span className="eyebrow">Falha de comunicação</span>
          <h1>Não conseguimos abrir o EDUC.AI.</h1>
          <p>{state.message}</p>
          <button type="button" onClick={() => void loadSession()}>
            Tentar novamente
          </button>
        </section>
      )}

      {state.kind === "unauthenticated" && (
        <section className="login-layout">
          <div className="login-copy">
            <span className="eyebrow">Dia 2 · acesso do professor</span>
            <h1>Seu planejamento começa com uma conta Google.</h1>
            <p>
              O EDUC.AI usa exclusivamente o Google para confirmar sua
              identidade e conectar Classroom e Forms com sua autorização.
            </p>
            {authError && (
              <div className="notice error" role="alert">
                <strong>Não foi possível entrar</strong>
                <span>{authError}</span>
              </div>
            )}
            <a
              className="primary-action"
              href={`${apiBaseUrl}/auth/google/start`}
            >
              Entrar com Google
            </a>
            {devAuthEnabled && (
              <button
                className="secondary-action"
                type="button"
                onClick={() => void devLogin()}
              >
                Entrar na demonstração local
              </button>
            )}
            <small>
              Nenhuma senha Google é recebida ou armazenada pelo EDUC.AI.
            </small>
          </div>
          <aside className="security-card">
            <span className="section-label">Limites desta etapa</span>
            <h2>Conexão explícita e revogável</h2>
            <ul>
              <li>Sessão protegida em cookie HTTP-only.</li>
              <li>Tokens criptografados somente no servidor.</li>
              <li>Nenhum conteúdo é publicado automaticamente.</li>
            </ul>
          </aside>
        </section>
      )}

      {state.kind === "authenticated" && (
        <ProfessorShell
          identity={state.identity}
          integrations={state.integrations}
        />
      )}

      <footer>
        <span>Dia 14 de 14</span>
        <span>Segurança · privacidade · operação</span>
      </footer>
    </main>
  );
}

function ProfessorShell({
  identity,
  integrations,
}: {
  identity: Identity;
  integrations: IntegrationStatus[];
}) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);

  const loadClasses = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/classes`, {
      credentials: "include",
    });
    if (!response.ok) return;
    const body = (await response.json()) as DataEnvelope<ClassSummary[]>;
    setClasses(Array.isArray(body.data) ? body.data : []);
  }, []);

  const loadMaterials = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/materials`, {
      credentials: "include",
    });
    if (!response.ok) return;
    const body = (await response.json()) as DataEnvelope<Material[]>;
    setMaterials(Array.isArray(body.data) ? body.data : []);
  }, []);

  const loadPlans = useCallback(async () => {
    const response = await fetch(`${apiBaseUrl}/lesson-plans`, {
      credentials: "include",
    });
    if (!response.ok) return;
    const body = (await response.json()) as DataEnvelope<LessonPlan[]>;
    setPlans(Array.isArray(body.data) ? body.data : []);
  }, []);

  useEffect(() => {
    void Promise.all([
      fetch(`${apiBaseUrl}/timeline/milestones`, { credentials: "include" }),
      loadClasses(),
      loadMaterials(),
      loadPlans(),
    ])
      .then(
        async ([
          milestoneResponse,
          _classesLoaded,
          _materialsLoaded,
          _plansLoaded,
        ]) => {
          const read = async <T,>(response: Response): Promise<T[]> => {
            if (!response.ok) return [];
            const body = (await response.json()) as DataEnvelope<T[]>;
            return Array.isArray(body.data) ? body.data : [];
          };
          setMilestones(await read<Milestone>(milestoneResponse));
        },
      )
      .catch(() => undefined);
  }, [loadClasses, loadMaterials, loadPlans]);

  return (
    <>
      <section className="hero compact">
        <span className="eyebrow">Sessão autenticada</span>
        <h1>Olá, {identity.displayName}.</h1>
        <p>
          Sua identidade veio da sessão Google validada pela API. O navegador
          não envia um identificador de professor como prova de acesso.
        </p>
        <span className="identity-email">{identity.email}</span>
      </section>

      <section className="status-panel" aria-labelledby="integrations-title">
        <div className="status-heading">
          <div>
            <span className="section-label">Monitoramento técnico</span>
            <h2 id="integrations-title">Serviços Google</h2>
          </div>
        </div>
        <div className="status-grid three-columns">
          {(["google_oauth", "google_classroom", "google_forms"] as const).map(
            (service) => {
              const status = integrations.find(
                (item) => item.service === service,
              );
              return (
                <IntegrationCard
                  key={service}
                  service={service}
                  status={status}
                />
              );
            },
          )}
        </div>
      </section>
      <ClassesPanel classes={classes} reload={loadClasses} />
      <TimelinePanel
        milestones={milestones}
        materials={materials}
        classes={classes}
        reloadMaterials={loadMaterials}
      />
      <LessonPlansPanel
        plans={plans}
        classes={classes}
        materials={materials}
        reload={loadPlans}
      />
      <Suspense fallback={<p className="empty-state">Carregando módulos…</p>}>
        <ActivitiesPanel plans={plans} />
        <FeedbackPanel classes={classes} materials={materials} />
        <BulletinsPanel />
      </Suspense>
      <PrivacyPanel />
    </>
  );
}

function TimelinePanel({
  milestones,
  materials,
  classes,
  reloadMaterials,
}: {
  milestones: Milestone[];
  materials: Material[];
  classes: ClassSummary[];
  reloadMaterials: () => Promise<void>;
}) {
  return (
    <section className="timeline-panel" aria-labelledby="timeline-title">
      <div className="status-heading">
        <div>
          <span className="section-label">Dia 5 · RF008 + RF010</span>
          <h2 id="timeline-title">Linha do tempo e materiais</h2>
        </div>
        <span className="timeline-count">{classes.length} turmas</span>
      </div>
      <div className="timeline-grid">
        <div>
          <h3>Próximos marcos</h3>
          {milestones.length === 0 ? (
            <p className="empty-state">Nenhum marco cadastrado.</p>
          ) : (
            <ul className="resource-list">
              {milestones.slice(0, 5).map((milestone) => (
                <li
                  key={milestone.id}
                  className={milestone.isPast ? "muted-item" : ""}
                >
                  <span>
                    {new Date(`${milestone.date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}
                  </span>
                  <strong>{milestone.description}</strong>
                  <small>
                    {milestone.className} · {milestone.type}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
        <MaterialsPanel
          materials={materials}
          classes={classes}
          reload={reloadMaterials}
        />
      </div>
    </section>
  );
}

export function LessonPlansPanel({
  plans,
  classes,
  materials,
  reload,
}: {
  plans: LessonPlan[];
  classes: ClassSummary[];
  materials: Material[];
  reload: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [component, setComponent] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [objectives, setObjectives] = useState("");
  const [contents, setContents] = useState("");
  const [methodology, setMethodology] = useState("");
  const [evaluationStrategy, setEvaluationStrategy] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(50);
  const [references, setReferences] = useState("");
  const [syllabuses, setSyllabuses] = useState<CurriculumSyllabus[]>([]);
  const [syllabusId, setSyllabusId] = useState("");
  const [bnccSkillIds, setBnccSkillIds] = useState<string[]>([]);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [components, setComponents] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<LessonPlan | null>(null);
  const [generation, setGeneration] = useState<LessonPlanGeneration | null>(
    null,
  );
  const [suggestion, setSuggestion] = useState<LessonPlanSuggestion | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!classes.some((group) => group.id === classId))
      setClassId(classes[0]?.id ?? "");
  }, [classes, classId]);

  useEffect(() => {
    if (!classId) return;
    void fetch(`${apiBaseUrl}/classes/${classId}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as DataEnvelope<ClassDetail>;
        const profile = body.data.curriculum;
        setSchoolYear(profile?.schoolYear ?? body.data.schoolYear);
        setComponents(profile?.curricularComponents ?? []);
        setComponent((current) =>
          profile?.curricularComponents.includes(current)
            ? current
            : (profile?.curricularComponents[0] ?? ""),
        );
      })
      .catch(() =>
        setMessage("Não foi possível carregar o currículo da turma."),
      );
  }, [classId]);

  useEffect(() => {
    if (!component || !schoolYear) {
      setSyllabuses([]);
      return;
    }
    const query = new URLSearchParams({
      component,
      schoolYear,
    });
    void fetch(`${apiBaseUrl}/curriculum?${query}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = (await response.json()) as { data: CurriculumSyllabus[] };
        setSyllabuses(body.data);
        setSyllabusId((current) =>
          body.data.some((item) => item.id === current)
            ? current
            : (body.data[0]?.id ?? ""),
        );
        const availableSkills = new Set(
          body.data.flatMap((item) => item.skills.map((skill) => skill.id)),
        );
        setBnccSkillIds((current) =>
          current.filter((id) => availableSkills.has(id)),
        );
      })
      .catch(() => setMessage("Não foi possível consultar a BNCC."));
  }, [component, schoolYear]);

  const savePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!classId || !title.trim() || !component || !schoolYear) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        editingId
          ? `${apiBaseUrl}/lesson-plans/${editingId}`
          : `${apiBaseUrl}/lesson-plans`,
        {
          method: editingId ? "PATCH" : "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title,
            curricularComponent: component,
            schoolYear,
            objectives,
            contents,
            methodology,
            evaluationStrategy,
            durationMinutes,
            references: references.trim() || null,
            classIds: [classId],
            syllabusId: syllabusId || null,
            bnccSkillIds,
            materialIds,
          }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage(
        editingId
          ? "Plano atualizado e devolvido a rascunho."
          : "Plano criado como rascunho manual.",
      );
      setEditingId(null);
      await reload();
    } catch {
      setMessage("Não foi possível criar o plano.");
    } finally {
      setSaving(false);
    }
  };

  const editPlan = (plan: LessonPlan) => {
    setEditingId(plan.id);
    setTitle(plan.title);
    setClassId(plan.classIds[0] ?? "");
    setComponent(plan.curricularComponent);
    setSchoolYear(plan.schoolYear);
    setObjectives(plan.objectives);
    setContents(plan.contents);
    setMethodology(plan.methodology);
    setEvaluationStrategy(plan.evaluationStrategy);
    setDurationMinutes(plan.durationMinutes ?? 50);
    setReferences(plan.references ?? "");
    setSyllabusId(plan.syllabusId ?? "");
    setBnccSkillIds(plan.bnccSkillIds);
    setMaterialIds(plan.materialIds);
  };

  const approvePlan = async (plan: LessonPlan) => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/lesson-plans/${plan.id}/approve`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error();
      setMessage("Plano aprovado explicitamente pelo professor.");
      await reload();
    } catch {
      setMessage("Revise a sugestão de IA antes de aprovar este plano.");
    } finally {
      setSaving(false);
    }
  };

  const generateSuggestion = async (plan: LessonPlan) => {
    setSelectedPlan(plan);
    setSuggestion(null);
    setGeneration(null);
    setGenerating(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/lesson-plans/${plan.id}/generate`,
        { method: "POST", credentials: "include" },
      );
      if (!response.ok) throw new Error();
      const body =
        (await response.json()) as DataEnvelope<LessonPlanGeneration>;
      setGeneration(body.data);
      setSuggestion(body.data.suggestion);
    } catch {
      setMessage(
        plan.syllabusDescription
          ? "A sugestão falhou; o plano manual foi preservado."
          : "Selecione uma ementa antes de gerar sugestões.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const reviewSuggestion = async () => {
    if (!selectedPlan || !generation || !suggestion) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/lesson-plans/${selectedPlan.id}/review`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ generationId: generation.id, suggestion }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage("Sugestão revisada pelo professor e salva no plano.");
      await reload();
    } catch {
      setMessage("Não foi possível registrar a revisão.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="timeline-panel" aria-labelledby="plans-title">
      <div className="status-heading">
        <div>
          <span className="section-label">Dia 7 · RF009</span>
          <h2 id="plans-title">Planos de aula e assistência de IA</h2>
        </div>
        <span className="timeline-count">{plans.length} planos</span>
      </div>
      <div className="plans-layout">
        <div>
          <h3>Seus planos</h3>
          {plans.length === 0 ? (
            <p className="empty-state">Nenhum plano criado.</p>
          ) : (
            <ul className="resource-list">
              {plans.slice(0, 5).map((plan) => (
                <li key={plan.id}>
                  <strong>{plan.title}</strong>
                  <span>
                    {plan.curricularComponent} · {plan.schoolYear}
                  </span>
                  <small>{plan.classNames.join(", ")}</small>
                  <small>Estado: {plan.status}</small>
                  <button
                    type="button"
                    className="secondary-action compact-action"
                    disabled={saving || plan.isLocked}
                    onClick={() => editPlan(plan)}
                  >
                    Editar plano
                  </button>
                  <button
                    type="button"
                    className="secondary-action compact-action"
                    disabled={generating || !plan.syllabusDescription}
                    onClick={() => void generateSuggestion(plan)}
                  >
                    {generating && selectedPlan?.id === plan.id
                      ? "Gerando…"
                      : "Gerar sugestão"}
                  </button>
                  {!plan.syllabusDescription && (
                    <small>Vincule uma ementa para habilitar a IA.</small>
                  )}
                  {plan.status !== "approved" &&
                    plan.status !== "generated" && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void approvePlan(plan)}
                      >
                        Aprovar plano
                      </button>
                    )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <form className="plan-form" onSubmit={(event) => void savePlan(event)}>
          <h3>{editingId ? "Editar plano" : "Novo plano manual"}</h3>
          <label>
            Turma
            <select
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {classes.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Componente curricular
            <select
              value={component}
              onChange={(event) => setComponent(event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {components.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ano/série
            <input
              value={schoolYear}
              onChange={(event) => setSchoolYear(event.target.value)}
              required
            />
          </label>
          <label>
            Título do plano
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Frações na prática"
              required
            />
          </label>
          <label>
            Objetivos
            <textarea
              value={objectives}
              onChange={(event) => setObjectives(event.target.value)}
              required
            />
          </label>
          <label>
            Conteúdos
            <textarea
              value={contents}
              onChange={(event) => setContents(event.target.value)}
              required
            />
          </label>
          <label>
            Metodologia/etapas
            <textarea
              value={methodology}
              onChange={(event) => setMethodology(event.target.value)}
              required
            />
          </label>
          <label>
            Estratégia de avaliação
            <textarea
              value={evaluationStrategy}
              onChange={(event) => setEvaluationStrategy(event.target.value)}
              required
            />
          </label>
          <label>
            Duração (minutos)
            <input
              type="number"
              min="1"
              max="600"
              value={durationMinutes}
              onChange={(event) =>
                setDurationMinutes(Number(event.target.value))
              }
              required
            />
          </label>
          <label>
            Referências opcionais
            <textarea
              value={references}
              onChange={(event) => setReferences(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>Ementa e habilidades BNCC</legend>
            <select
              value={syllabusId}
              onChange={(event) => {
                setSyllabusId(event.target.value);
                setBnccSkillIds([]);
              }}
            >
              <option value="">Sem ementa</option>
              {syllabuses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.description} · {item.sourceLabel}
                </option>
              ))}
            </select>
            {syllabuses
              .find((item) => item.id === syllabusId)
              ?.skills.map((skill) => (
                <label key={skill.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={bnccSkillIds.includes(skill.id)}
                    onChange={(event) =>
                      setBnccSkillIds((current) =>
                        event.target.checked
                          ? [...current, skill.id]
                          : current.filter((id) => id !== skill.id),
                      )
                    }
                  />
                  {skill.code} — {skill.description} ({skill.sourceLabel})
                </label>
              ))}
          </fieldset>
          <fieldset>
            <legend>Materiais da turma</legend>
            {materials
              .filter(
                (material) =>
                  !material.isArchived && material.classIds.includes(classId),
              )
              .map((material) => (
                <label key={material.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={materialIds.includes(material.id)}
                    onChange={(event) =>
                      setMaterialIds((current) =>
                        event.target.checked
                          ? [...current, material.id]
                          : current.filter((id) => id !== material.id),
                      )
                    }
                  />
                  {material.title}
                </label>
              ))}
          </fieldset>
          <button
            type="submit"
            disabled={
              saving || !classId || !title.trim() || !component || !schoolYear
            }
          >
            {saving ? "Salvando…" : "Salvar rascunho"}
          </button>
          {message && (
            <small className="form-message" role="status">
              {message}
            </small>
          )}
        </form>
      </div>
      {selectedPlan && suggestion && generation && (
        <div className="plan-comparison">
          <article>
            <span className="section-label">Plano atual</span>
            <h3>{selectedPlan.title}</h3>
            <p>{selectedPlan.objectives}</p>
            <p>{selectedPlan.methodology}</p>
          </article>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void reviewSuggestion();
            }}
          >
            <span className="section-label">Sugestão editável</span>
            <label>
              Título
              <input
                value={suggestion.title}
                onChange={(event) =>
                  setSuggestion({ ...suggestion, title: event.target.value })
                }
              />
            </label>
            <label>
              Objetivos
              <textarea
                value={suggestion.objectives}
                onChange={(event) =>
                  setSuggestion({
                    ...suggestion,
                    objectives: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Conteúdos
              <textarea
                value={suggestion.contents}
                onChange={(event) =>
                  setSuggestion({ ...suggestion, contents: event.target.value })
                }
              />
            </label>
            <label>
              Metodologia
              <textarea
                value={suggestion.methodology}
                onChange={(event) =>
                  setSuggestion({
                    ...suggestion,
                    methodology: event.target.value,
                  })
                }
              />
            </label>
            <label>
              Avaliação
              <textarea
                value={suggestion.evaluationStrategy}
                onChange={(event) =>
                  setSuggestion({
                    ...suggestion,
                    evaluationStrategy: event.target.value,
                  })
                }
              />
            </label>
            <button type="submit" disabled={saving}>
              Revisar e aplicar
            </button>
            <small>
              Modelo: {generation.model} · origem: {generation.origin}
            </small>
          </form>
        </div>
      )}
    </section>
  );
}

function IntegrationCard({
  service,
  status,
}: {
  service: "google_oauth" | "google_classroom" | "google_forms";
  status?: IntegrationStatus;
}) {
  const available = status?.status === "active";
  const labels = {
    google_oauth: "Google OAuth",
    google_classroom: "Google Classroom",
    google_forms: "Google Forms",
  };
  return (
    <article className="status-card">
      <div className="status-line">
        <span
          className={`status-dot ${available ? "available" : "unavailable"}`}
        />
        <span>
          {!status
            ? "Aguardando verificação"
            : available
              ? "Disponível"
              : "Indisponível"}
        </span>
      </div>
      <h3>{labels[service]}</h3>
      <p>
        {status
          ? `Última verificação: ${new Date(status.checkedAt).toLocaleString("pt-BR")}`
          : "O monitor ainda não registrou um ciclo para este serviço."}
      </p>
    </article>
  );
}

function PrivacyPanel() {
  const [deleting, setDeleting] = useState(false);
  const deleteAccount = async () => {
    if (
      !window.confirm(
        "Excluir a conta remove sessões e credenciais e anonimiza sua identidade. O histórico pedagógico obrigatório será preservado. Continuar?",
      )
    )
      return;
    setDeleting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/privacy/account`, {
        method: "DELETE",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmation: "EXCLUIR" }),
      });
      if (!response.ok) throw new Error();
      window.location.reload();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="timeline-panel" aria-labelledby="privacy-title">
      <div className="status-heading">
        <div>
          <span className="section-label">Privacidade e LGPD</span>
          <h2 id="privacy-title">Seus dados</h2>
        </div>
      </div>
      <p>
        Tokens nunca aparecem na exportação. A exclusão revoga o acesso e
        anonimiza a identidade, preservando somente históricos pedagógicos e de
        auditoria exigidos pela integridade do sistema.
      </p>
      <div className="inline-actions">
        <a
          className="secondary-action compact-action"
          href={`${apiBaseUrl}/privacy/export`}
        >
          Exportar meus dados
        </a>
        <button
          type="button"
          className="secondary-action compact-action"
          disabled={deleting}
          onClick={() => void deleteAccount()}
        >
          {deleting ? "Excluindo…" : "Excluir minha conta"}
        </button>
      </div>
    </section>
  );
}

function readAuthError(): string | null {
  const code = new URLSearchParams(window.location.search).get("auth_error");
  if (!code) return null;
  if (code === "access_denied") return "A autorização foi cancelada no Google.";
  if (code === "invalid_state")
    return "A tentativa expirou. Inicie o login novamente.";
  return "O Google não concluiu a autenticação. Tente novamente.";
}
