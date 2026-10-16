import type { Identity, IntegrationStatus } from "@educai/contracts";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { MenuCounts } from "./pendencies.js";
import {
  navigation,
  primaryRoutes,
  routeHref,
  routes,
  type RouteId,
} from "./router.js";

const ICONS: Record<RouteId | "mais", string> = {
  inicio: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z",
  criar: "M12 5v14M5 12h14",
  "nova-turma": "M12 5v14M5 12h14",
  turmas:
    "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17.5 11.5a2.5 2.5 0 1 0 0-5M16 14.2c3 .2 5.5 2.4 5.5 5.8",
  aulas: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM8 9h6M8 13h6",
  atividades:
    "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h8M8 12h8M8 16h5",
  correcoes: "M4 13l5 5L20 7",
  recados: "M4 5h16v11H8l-4 4z",
  boletins: "M6 3h9l4 4v14H6zM9 13h6M9 17h6M14 3v5h5",
  conta: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7",
  mais: "M5 12h.01M12 12h.01M19 12h.01",
};

function Icon({ name }: { name: RouteId | "mais" }) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "mais" ? 3.2 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const GOOGLE_SERVICE_NAMES: Partial<
  Record<IntegrationStatus["service"], string>
> = {
  google_oauth: "A conexão com o Google",
  google_classroom: "O Google Sala de Aula",
  google_forms: "O Google Formulários",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return `${parts[0]?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export function AppShell({
  route,
  identity,
  integrations,
  counts = {},
  children,
}: {
  route: RouteId;
  identity: Identity;
  integrations: IntegrationStatus[];
  counts?: MenuCounts;
  children: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // Moving between pages puts the reader at the start of the new page.
  useEffect(() => {
    setMoreOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [route]);

  const down = integrations.filter(
    (item) => item.status === "inactive" && GOOGLE_SERVICE_NAMES[item.service],
  );
  const current = (id: RouteId) =>
    id === route ? ({ "aria-current": "page" } as const) : {};
  const badge = (id: RouteId) => {
    const item = counts[id];
    return (
      item && (
        <span className="badge" role="img" aria-label={item.label}>
          {item.count}
        </span>
      )
    );
  };

  return (
    <div className="app-layout">
      <nav className="sidebar" aria-label="Menu principal">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          EDUC.AI
        </span>
        <a
          className="primary-action side-create"
          href={routeHref("criar")}
          {...(route === "criar" || route === "nova-turma"
            ? ({ "aria-current": "page" } as const)
            : {})}
        >
          + Criar
        </a>
        {navigation.map((group) => (
          <div className="side-group" key={group.label ?? "top"}>
            {group.label && <h2>{group.label}</h2>}
            <ul>
              {group.items.map((id) => (
                <li key={id}>
                  <a
                    className="side-link"
                    href={routeHref(id)}
                    {...current(id)}
                  >
                    <Icon name={id} />
                    <span>
                      {routes[id].title}
                      <span className="side-hint">{routes[id].hint}</span>
                    </span>
                    {badge(id)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <a
          className="side-link side-user"
          href={routeHref("conta")}
          {...current("conta")}
        >
          <span className="avatar" aria-hidden="true">
            {initials(identity.displayName)}
          </span>
          <span className="side-user-text">
            <strong>{identity.displayName}</strong>
            <span className="side-email">{identity.email}</span>
            <span className="side-hint">Minha conta</span>
          </span>
        </a>
      </nav>

      <main className="app-main" id="conteudo" tabIndex={-1} ref={mainRef}>
        {down.length > 0 && (
          <div className="notice warning" role="alert">
            <strong>Atenção</strong>
            {down.map((item) => (
              <span key={item.service}>
                {GOOGLE_SERVICE_NAMES[item.service]} está fora do ar agora. Você
                pode continuar planejando; os envios para a turma ficam para
                quando ele voltar.
              </span>
            ))}
          </div>
        )}
        {children}
      </main>

      <nav className="bottom-nav" aria-label="Menu rápido">
        {moreOpen && (
          <ul className="more-sheet" id="mais-opcoes">
            <li>
              <a href={routeHref("criar")}>+ Criar</a>
            </li>
            {(["recados", "boletins", "conta"] as const).map((id) => (
              <li key={id}>
                <a href={routeHref(id)} {...current(id)}>
                  <Icon name={id} />
                  {routes[id].title}
                </a>
              </li>
            ))}
          </ul>
        )}
        {primaryRoutes.map((id) => (
          <a
            key={id}
            className="bottom-link"
            href={routeHref(id)}
            {...current(id)}
          >
            <Icon name={id} />
            {routes[id].title}
            {badge(id)}
          </a>
        ))}
        <button
          type="button"
          className="bottom-link"
          aria-expanded={moreOpen}
          aria-controls="mais-opcoes"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <Icon name="mais" />
          Mais
        </button>
      </nav>
    </div>
  );
}

export function Page({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="page-head">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
      {children}
    </>
  );
}
