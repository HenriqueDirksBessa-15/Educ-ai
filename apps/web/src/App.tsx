import type {
  AuthSession,
  ClassSummary,
  Identity,
  IntegrationStatus,
  Material,
  Milestone,
} from "@educai/contracts";
import { useCallback, useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

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

  const authError = readAuthError();

  return (
    <main className="page-shell">
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
        <span>Dia 3 de 14</span>
        <span>Perfil · currículo · BNCC</span>
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

  useEffect(() => {
    void Promise.all([
      fetch(`${apiBaseUrl}/timeline/milestones`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/materials`, { credentials: "include" }),
      fetch(`${apiBaseUrl}/classes`, { credentials: "include" }),
    ])
      .then(async ([milestoneResponse, materialResponse, classesResponse]) => {
        const read = async <T,>(response: Response): Promise<T[]> => {
          if (!response.ok) return [];
          const body = (await response.json()) as DataEnvelope<T[]>;
          return Array.isArray(body.data) ? body.data : [];
        };
        setMilestones(await read<Milestone>(milestoneResponse));
        setMaterials(await read<Material>(materialResponse));
        setClasses(await read<ClassSummary>(classesResponse));
      })
      .catch(() => undefined);
  }, []);

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
      <TimelinePanel
        milestones={milestones}
        materials={materials}
        classes={classes}
      />
    </>
  );
}

function TimelinePanel({
  milestones,
  materials,
  classes,
}: {
  milestones: Milestone[];
  materials: Material[];
  classes: ClassSummary[];
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
        <div>
          <h3>Materiais recentes</h3>
          {materials.length === 0 ? (
            <p className="empty-state">Nenhum material cadastrado.</p>
          ) : (
            <ul className="resource-list">
              {materials.slice(0, 5).map((material) => (
                <li key={material.id}>
                  <strong>{material.title}</strong>
                  <span>{material.category}</span>
                  <small>{material.classNames.join(", ")}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
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

function readAuthError(): string | null {
  const code = new URLSearchParams(window.location.search).get("auth_error");
  if (!code) return null;
  if (code === "access_denied") return "A autorização foi cancelada no Google.";
  if (code === "invalid_state")
    return "A tentativa expirou. Inicie o login novamente.";
  return "O Google não concluiu a autenticação. Tente novamente.";
}
