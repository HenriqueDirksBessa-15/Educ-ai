import { useEffect, useState } from "react";

export type RouteId =
  | "inicio"
  | "criar"
  | "turmas"
  | "aulas"
  | "atividades"
  | "correcoes"
  | "recados"
  | "boletins"
  | "conta";

type RouteInfo = { title: string; hint?: string };

export const routes: Record<RouteId, RouteInfo> = {
  inicio: { title: "Início", hint: "O que fazer hoje" },
  criar: { title: "Criar" },
  turmas: { title: "Turmas", hint: "Alunos e matéria" },
  aulas: { title: "Aulas", hint: "Planos e materiais" },
  atividades: { title: "Atividades", hint: "Criar e enviar" },
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

export function parseRoute(hash: string): RouteId {
  const match = /^#\/([a-z-]*)$/.exec(hash);
  const id = match?.[1];
  return id && id in routes ? (id as RouteId) : "inicio";
}

export function routeHref(route: RouteId): string {
  return `#/${route}`;
}

export function pageTitle(route: RouteId): string {
  return `${routes[route].title} · EDUC.AI`;
}

export function useRoute(): RouteId {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
