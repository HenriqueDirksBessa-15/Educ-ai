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
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import {
  ActivityListPage,
  ActivityPage,
  ActivityWizard,
} from "./ActivitiesPages";
import { AccountPage } from "./AccountPage";
import { AppShell, Page } from "./AppShell";
import { BulletinsPage } from "./BulletinsPage";
import { ClassDetailPage, ClassListPage, NewClassPage } from "./ClassesPages";
import { JoinPage, useJoinRoute } from "./JoinPage";
import { ConfirmProvider } from "./ConfirmDialog";
import { CorrectionListPage, CorrectionQueuePage } from "./CorrectionsPages";
import {
  formatDate,
  lessonPlanStatusLabel,
  milestoneTypeLabel,
} from "./labels";
import { MaterialsPanel } from "./MaterialsPanel";
import { MessagesPage } from "./MessagesPage";
import { loadOverview } from "./overview";
import { computePendencies, menuCounts, type Overview } from "./pendencies";
import { pageTitle, routeHref, useLocation, type RouteId } from "./router";

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
        message: "Verifique sua conexão com a internet e tente de novo.",
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
  const { route, param } = useLocation();
  const joining = useJoinRoute();

  useEffect(() => {
    document.title =
      state.kind === "authenticated" ? pageTitle(route) : "Entrar · EDUC.AI";
  }, [state.kind, route]);

  // The hash belongs to the router, so the skip link moves focus itself.
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById("conteudo")?.focus();
  };

  const skipLink = (
    <a className="skip-link" href="#conteudo" onClick={skipToContent}>
      Ir para o conteúdo principal
    </a>
  );

  if (joining)
    return (
      <>
        {skipLink}
        <main className="page-shell" id="conteudo" tabIndex={-1}>
          <header className="app-header">
            <span className="brand">
              <span className="brand-mark" aria-hidden="true">
                E
              </span>
              EDUC.AI
            </span>
          </header>
          <JoinPage />
        </main>
      </>
    );

  if (state.kind === "authenticated")
    return (
      <ConfirmProvider>
        {skipLink}
        <ProfessorShell
          route={route}
          param={param}
          identity={state.identity}
          integrations={state.integrations}
          loggingOut={loggingOut}
          onLogout={() => void logout()}
          onNameChange={(displayName) =>
            setState((current) =>
              current.kind === "authenticated"
                ? { ...current, identity: { ...current.identity, displayName } }
                : current,
            )
          }
          onAccountDeleted={() => {
            window.history.replaceState({}, "", window.location.pathname);
            setState({ kind: "unauthenticated" });
          }}
        />
      </ConfirmProvider>
    );

  return (
    <>
      {skipLink}
      <main className="page-shell" id="conteudo" tabIndex={-1}>
        <header className="app-header">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              E
            </span>
            EDUC.AI
          </span>
        </header>

        {state.kind === "loading" && (
          <section className="center-card" aria-live="polite">
            <h1>Abrindo o EDUC.AI…</h1>
          </section>
        )}

        {state.kind === "error" && (
          <section className="center-card" role="alert">
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
              <h1>Planeje, envie e corrija suas atividades em um só lugar.</h1>
              <p>
                Entre com a mesma conta do Google que você usa no Google Sala de
                Aula.
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
                Não vemos sua senha do Google. Nada é enviado aos alunos sem a
                sua aprovação.
              </small>
            </div>
          </section>
        )}
      </main>
    </>
  );
}

type LoadState = "loading" | "ready" | "failed";

function ProfessorShell({
  route,
  param,
  identity,
  integrations,
  loggingOut,
  onLogout,
  onNameChange,
  onAccountDeleted,
}: {
  route: RouteId;
  param: string | null;
  identity: Identity;
  integrations: IntegrationStatus[];
  loggingOut: boolean;
  onLogout: () => void;
  onNameChange: (displayName: string) => void;
  onAccountDeleted: () => void;
}) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const readList = async <T,>(path: string): Promise<T[]> => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error(path);
    const body = (await response.json()) as DataEnvelope<T[]>;
    return Array.isArray(body.data) ? body.data : [];
  };

  const loadClasses = useCallback(
    async () => setClasses(await readList<ClassSummary>("/classes")),
    [],
  );
  const loadMaterials = useCallback(
    async () => setMaterials(await readList<Material>("/materials")),
    [],
  );
  const loadPlans = useCallback(
    async () => setPlans(await readList<LessonPlan>("/lesson-plans")),
    [],
  );

  const loadAll = useCallback(async () => {
    setLoadState("loading");
    try {
      await Promise.all([
        readList<Milestone>("/timeline/milestones").then(setMilestones),
        loadClasses(),
        loadMaterials(),
        loadPlans(),
      ]);
      setLoadState("ready");
    } catch {
      setLoadState("failed");
    }
  }, [loadClasses, loadMaterials, loadPlans]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Pendencies drive the home page and the menu counters; refreshed on every
  // visit to the home page.
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewState, setOverviewState] = useState<LoadState>("loading");
  const refreshOverview = useCallback(async () => {
    setOverviewState("loading");
    try {
      setOverview(await loadOverview());
      setOverviewState("ready");
    } catch {
      setOverview(null);
      setOverviewState("failed");
    }
  }, []);

  const overviewRequested = useRef(false);
  useEffect(() => {
    if (route !== "inicio" && overviewRequested.current) return;
    overviewRequested.current = true;
    void refreshOverview();
  }, [route, refreshOverview]);

  const loadFailure = loadState === "failed" && (
    <div className="notice error" role="alert">
      <strong>Não conseguimos carregar todos os seus dados.</strong>
      <span>Verifique a internet e tente de novo.</span>
      <button type="button" onClick={() => void loadAll()}>
        Tentar de novo
      </button>
    </div>
  );

  const pages: Record<RouteId, () => ReactNode> = {
    inicio: () => (
      <Page
        title={`Olá, ${identity.displayName}`}
        subtitle="Isto é o que precisa da sua atenção hoje."
      >
        {loadFailure}
        <Pendencies
          state={overviewState}
          overview={overview}
          onRetry={() => void refreshOverview()}
        />
        <h2 className="section-title">Atalhos</h2>
        <Shortcuts
          items={[
            ["aulas", "Planejar uma aula", "Com ou sem ajuda da IA"],
            [
              "nova-atividade",
              "Criar uma atividade",
              "A partir de um plano aprovado",
            ],
            ["recados", "Mandar um recado", "Para um aluno ou para a turma"],
          ]}
        />
      </Page>
    ),
    criar: () => (
      <Page
        title="O que você quer criar?"
        subtitle="Escolha uma opção para começar."
      >
        <Shortcuts
          items={[
            [
              "nova-atividade",
              "Nova atividade",
              "Questões para a turma responder no Google Formulários, a partir de um plano aprovado.",
            ],
            [
              "aulas",
              "Novo plano de aula",
              "Tema, habilidades da BNCC e roteiro da aula, com ou sem ajuda da IA.",
            ],
            [
              "nova-turma",
              "Nova turma",
              "Para turmas que ainda não estão no Google Sala de Aula.",
            ],
          ]}
        />
      </Page>
    ),
    turmas: () =>
      param ? (
        <ClassDetailPage key={param} classId={param} reload={loadClasses} />
      ) : (
        <Page
          title="Turmas"
          subtitle="Turmas do Google Sala de Aula e turmas criadas aqui."
        >
          {loadFailure}
          <ClassListPage classes={classes} reload={loadClasses} />
        </Page>
      ),
    "nova-turma": () => (
      <Page
        title="Nova turma"
        subtitle="Para turmas que ainda não estão no Google Sala de Aula."
      >
        <NewClassPage reload={loadClasses} />
      </Page>
    ),
    aulas: () => (
      <Page
        title="Aulas"
        subtitle="Planos de aula, materiais e datas das suas turmas."
      >
        {loadFailure}
        <LessonPlansPanel
          plans={plans}
          classes={classes}
          materials={materials}
          reload={loadPlans}
        />
        <TimelinePanel
          milestones={milestones}
          materials={materials}
          classes={classes}
          reloadMaterials={loadMaterials}
        />
      </Page>
    ),
    atividades: () =>
      param ? (
        <ActivityPage key={param} activityId={param} plans={plans} />
      ) : (
        <Page
          title="Atividades"
          subtitle="Crie, envie e acompanhe as atividades das suas turmas."
        >
          <ActivityListPage />
        </Page>
      ),
    "nova-atividade": () => (
      <Page
        title="Nova atividade"
        subtitle="Quatro passos: plano, questões, revisão e envio."
      >
        <ActivityWizard plans={plans} />
      </Page>
    ),
    correcoes: () =>
      param ? (
        <CorrectionQueuePage key={param} activityId={param} />
      ) : (
        <Page
          title="Correções"
          subtitle="As questões de múltipla escolha já vêm corrigidas. Você corrige as respostas escritas e devolve as notas."
        >
          <CorrectionListPage />
        </Page>
      ),
    recados: () => (
      <Page
        title="Recados"
        subtitle="Mensagens para um aluno ou avisos para a turma toda."
      >
        <MessagesPage classes={classes} materials={materials} />
      </Page>
    ),
    boletins: () => (
      <Page
        title="Boletins"
        subtitle="Gere boletins em PDF com as notas aprovadas e envie por e-mail."
      >
        <BulletinsPage />
      </Page>
    ),
    conta: () => (
      <Page title="Minha conta">
        <AccountPage
          identity={identity}
          loggingOut={loggingOut}
          onLogout={onLogout}
          onNameChange={onNameChange}
          onDeleted={onAccountDeleted}
        />
      </Page>
    ),
  };

  return (
    <AppShell
      route={route}
      identity={identity}
      integrations={integrations}
      counts={overview ? menuCounts(overview) : {}}
    >
      {pages[route]()}
    </AppShell>
  );
}

function Pendencies({
  state,
  overview,
  onRetry,
}: {
  state: LoadState;
  overview: Overview | null;
  onRetry: () => void;
}) {
  if (state === "failed")
    return (
      <div className="notice error" role="alert">
        <strong>Não conseguimos verificar suas pendências agora.</strong>
        <span>Verifique a internet e tente de novo.</span>
        <button type="button" onClick={onRetry}>
          Tentar de novo
        </button>
      </div>
    );
  if (state === "loading" || !overview)
    return (
      <p className="empty-state" aria-live="polite">
        Verificando o que precisa da sua atenção…
      </p>
    );

  const items = computePendencies(overview, new Date());
  if (items.length === 0)
    return (
      <div className="all-clear">
        <p>Tudo em dia. Que tal planejar a próxima aula?</p>
        <a className="primary-action" href={routeHref("aulas")}>
          Planejar uma aula
        </a>
      </div>
    );

  return (
    <ul className="pendency-list" aria-label="Pendências">
      {items.map((item) => (
        <li key={item.id} className={`pendency ${item.tone}`}>
          <div>
            <strong id={`pendencia-${item.id}`}>{item.title}</strong>
            {item.detail && <span>{item.detail}</span>}
          </div>
          <a
            className={
              item.tone === "warning" ? "secondary-action" : "primary-action"
            }
            href={routeHref(item.route)}
            aria-describedby={`pendencia-${item.id}`}
          >
            {item.actionLabel}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Shortcuts({ items }: { items: Array<[RouteId, string, string]> }) {
  return (
    <ul className="shortcut-grid">
      {items.map(([route, title, description]) => (
        <li key={title}>
          <a className="shortcut" href={routeHref(route)}>
            <strong>{title}</strong>
            <span>{description}</span>
          </a>
        </li>
      ))}
    </ul>
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
      <h2 id="timeline-title">Calendário e materiais</h2>
      <div className="timeline-grid">
        <div>
          <h3>Próximas datas</h3>
          {milestones.length === 0 ? (
            <p className="empty-state">Nenhuma data marcada ainda.</p>
          ) : (
            <ul className="resource-list">
              {milestones.map((milestone) => (
                <li
                  key={milestone.id}
                  className={milestone.isPast ? "muted-item" : ""}
                >
                  <span>{formatDate(milestone.date)}</span>
                  <strong>{milestone.title}</strong>
                  <small>
                    {milestone.className} · {milestoneTypeLabel(milestone.type)}
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
  const [profileMissing, setProfileMissing] = useState(false);
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
        setProfileMissing(!profile?.curricularComponents.length);
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
          ? "Plano atualizado. Ele voltou para rascunho e precisa ser aprovado de novo."
          : "Plano salvo como rascunho.",
      );
      setEditingId(null);
      await reload();
    } catch {
      setMessage(
        "Não foi possível salvar o plano. Confira os campos e tente de novo.",
      );
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
      setMessage(
        "Plano aprovado. Agora você pode criar atividades a partir dele.",
      );
      await reload();
    } catch {
      setMessage(
        "Não foi possível aprovar. Se houver sugestão da IA, revise-a antes.",
      );
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
          ? "A IA não conseguiu responder agora. Seu plano foi mantido. Tente de novo ou escreva você mesmo."
          : "Escolha as habilidades da BNCC antes de pedir sugestão à IA.",
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
      setMessage("Sugestão revisada e salva no plano.");
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
        <h2 id="plans-title">Planos de aula</h2>
        <span className="timeline-count">
          {plans.length} {plans.length === 1 ? "plano" : "planos"}
        </span>
      </div>
      <div className="plans-layout">
        <div>
          <h3>Seus planos</h3>
          {plans.length === 0 ? (
            <p className="empty-state">
              Você ainda não tem planos. Preencha o formulário ao lado para
              criar o primeiro.
            </p>
          ) : (
            <ul className="resource-list">
              {plans.map((plan) => (
                <li key={plan.id}>
                  <strong>{plan.title}</strong>
                  <span>
                    {plan.curricularComponent} · {plan.schoolYear}
                  </span>
                  <small>{plan.classNames.join(", ")}</small>
                  <small>{lessonPlanStatusLabel(plan.status)}</small>
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
                      : "Pedir sugestão à IA"}
                  </button>
                  {!plan.syllabusDescription && (
                    <small>
                      Escolha as habilidades da BNCC para pedir sugestão à IA.
                    </small>
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
          <h3>{editingId ? "Editar plano" : "Novo plano"}</h3>
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
          {profileMissing && (
            <small className="form-message" role="status">
              Esta turma ainda não tem perfil curricular. Abra a{" "}
              <a href={routeHref("turmas", classId)}>tela da turma</a>, defina o
              ano/série e o componente curricular e volte aqui.
            </small>
          )}
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
            <legend>Habilidades da BNCC</legend>
            <select
              value={syllabusId}
              onChange={(event) => {
                setSyllabusId(event.target.value);
                setBnccSkillIds([]);
              }}
            >
              <option value="">Nenhuma</option>
              {syllabuses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.description}
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
                  {skill.code} — {skill.description}
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
            <span className="section-label">
              Sugestão da IA (edite à vontade)
            </span>
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
          </form>
        </div>
      )}
    </section>
  );
}

function readAuthError(): string | null {
  const code = new URLSearchParams(window.location.search).get("auth_error");
  if (!code) return null;
  if (code === "access_denied") return "A autorização foi cancelada no Google.";
  if (code === "invalid_state")
    return "A tentativa expirou. Toque em Entrar com Google de novo.";
  return "O Google não concluiu a entrada. Tente de novo.";
}
