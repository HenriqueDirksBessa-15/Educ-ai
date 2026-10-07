import type { LiveResponse, ReadyResponse } from "@educai/contracts";
import { useCallback, useEffect, useState } from "react";

type HealthState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; live: LiveResponse; ready: ReadyResponse };

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  const checkHealth = useCallback(async () => {
    setHealth({ kind: "loading" });
    try {
      const [liveResponse, readyResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/health/live`),
        fetch(`${apiBaseUrl}/health/ready`),
      ]);

      if (!liveResponse.ok) throw new Error("A API respondeu com erro.");

      const [live, ready] = await Promise.all([
        readJson<LiveResponse>(liveResponse),
        readJson<ReadyResponse>(readyResponse),
      ]);
      setHealth({ kind: "success", live, ready });
    } catch {
      setHealth({
        kind: "error",
        message: "Não foi possível comunicar com a API local.",
      });
    }
  }, []);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  return (
    <main className="page-shell">
      <section className="hero" aria-labelledby="page-title">
        <span className="eyebrow">EDUC.AI · desenvolvimento local</span>
        <h1 id="page-title">Fundação executável</h1>
        <p>
          Este ambiente valida a comunicação entre a interface, a API e o
          PostgreSQL. As funcionalidades pedagógicas serão entregues nos
          próximos dias do plano.
        </p>
      </section>

      <section
        className="status-panel"
        aria-live="polite"
        aria-busy={health.kind === "loading"}
      >
        <div className="status-heading">
          <div>
            <span className="section-label">Estado do ambiente</span>
            <h2>Serviços locais</h2>
          </div>
          <button
            type="button"
            onClick={() => void checkHealth()}
            disabled={health.kind === "loading"}
          >
            Verificar novamente
          </button>
        </div>

        {health.kind === "loading" && (
          <p className="notice loading">Verificando os serviços…</p>
        )}

        {health.kind === "error" && (
          <div className="notice error" role="alert">
            <strong>API indisponível</strong>
            <span>{health.message}</span>
          </div>
        )}

        {health.kind === "success" && (
          <div className="status-grid">
            <StatusCard
              label="API"
              available={health.live.status === "alive"}
              description="Processo Node.js respondendo"
            />
            <StatusCard
              label="PostgreSQL"
              available={health.ready.database === "available"}
              description={
                health.ready.database === "available"
                  ? "Conexão pronta para consultas"
                  : "API ativa, banco indisponível"
              }
            />
          </div>
        )}
      </section>

      <footer>
        <span>Dia 1 de 14</span>
        <span>Nenhuma integração externa é necessária nesta etapa.</span>
      </footer>
    </main>
  );
}

function StatusCard({
  label,
  available,
  description,
}: {
  label: string;
  available: boolean;
  description: string;
}) {
  return (
    <article className="status-card">
      <div className="status-line">
        <span
          className={
            available ? "status-dot available" : "status-dot unavailable"
          }
        />
        <span>{available ? "Disponível" : "Indisponível"}</span>
      </div>
      <h3>{label}</h3>
      <p>{description}</p>
    </article>
  );
}
