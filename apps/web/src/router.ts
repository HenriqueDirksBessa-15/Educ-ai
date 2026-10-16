import { useEffect, useState } from "react";

export type RouteId =
  | "inicio"
  | "criar"
  | "turmas"
  | "nova-turma"
  | "aulas"
  | "atividades"
  | "nova-atividade"
  | "correcoes"
  | "recados"
  | "boletins"
  | "conta";

type RouteInfo = { title: string; hint?: string };

export const routes: Record<RouteId, RouteInfo> = {
  inicio: { title: "Início", hint: "O que fazer hoje" },
  criar: { title: "Criar" },
  turmas: { title: "Turmas", hint: "Alunos e matéria" },
  "nova-turma": { title: "Nova turma" },
  aulas: { title: "Aulas", hint: "Planos e materiais" },
  atividades: { title: "Atividades", hint: "Criar e enviar" },
  "nova-atividade": { title: "Nova atividade" },
  correcoes: { title: "Correções", hint: "Notas para dar" },
  recados: { title: "Recados", hint: "Para alunos e turmas" },
  boletins: { title: "Boletins", hint: "PDF por aluno" },
  conta: { title: "Minha conta" },
};

// Menu order; `label: null` is the ungrouped top item.
export const navigation: Array<{ label: string | null; items: RouteId[] }> = [
  { label: null, items: ["inicio"] },
  {
    label: "Sala de aula",
    items: ["turmas", "aulas", "atividades", "correcoes"],
  },
  { label: "Comunicação", items: ["recados", "boletins"] },
];

// Shown in the phone bottom bar; the rest live under "Mais".
export const primaryRoutes: RouteId[] = [
  "inicio",
  "turmas",
  "aulas",
  "atividades",
  "correcoes",
];

// Only these routes take an id after the slash, e.g. "#/turmas/{id}".
const routesWithParam = new Set<RouteId>(["turmas", "atividades", "correcoes"]);

export type Location = { route: RouteId; param: string | null };

export function parseLocation(hash: string): Location {
  const match = /^#\/([a-z-]*)(?:\/([A-Za-z0-9-]+))?$/.exec(hash);
  const id = match?.[1];
  if (!id || !(id in routes)) return { route: "inicio", param: null };
  const route = id as RouteId;
  return {
    route,
    param: routesWithParam.has(route) ? (match?.[2] ?? null) : null,
  };
}

export function parseRoute(hash: string): RouteId {
  return parseLocation(hash).route;
}

export function routeHref(route: RouteId, param?: string): string {
  return param ? `#/${route}/${param}` : `#/${route}`;
}

export function pageTitle(route: RouteId): string {
  return `${routes[route].title} · EDUC.AI`;
}

export function useLocation(): Location {
  const [location, setLocation] = useState(() =>
    parseLocation(window.location.hash),
  );
  useEffect(() => {
    const update = () => setLocation(parseLocation(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return location;
}
