import type { CurriculumSyllabus, EducationStage } from "@educai/contracts";

// Builds the class-profile choices from the official BNCC syllabi, so the
// saved profile matches the values the skill search compares exactly.

export type CatalogYear = { value: string; label: string; subjects: string[] };
export type CatalogStage = {
  value: EducationStage;
  label: string;
  years: CatalogYear[];
};
export type Catalog = { stages: CatalogStage[] };

const STAGES: Array<{ value: EducationStage; label: string }> = [
  { value: "early_childhood", label: "Educação infantil" },
  {
    value: "elementary_1",
    label: "Ensino fundamental – anos iniciais (1º ao 5º)",
  },
  {
    value: "elementary_2",
    label: "Ensino fundamental – anos finais (6º ao 9º)",
  },
  { value: "high_school", label: "Ensino médio" },
];

// BNCC early-childhood age groups, in age order.
const EARLY_CHILDHOOD = ["Bebês", "Crianças bem pequenas", "Crianças pequenas"];

function stageOf(schoolYear: string): EducationStage | null {
  const elementary = /^ef-ano-(\d{2})$/.exec(schoolYear);
  if (elementary)
    return Number(elementary[1]) <= 5 ? "elementary_1" : "elementary_2";
  if (schoolYear.startsWith("em-")) return "high_school";
  if (EARLY_CHILDHOOD.includes(schoolYear)) return "early_childhood";
  return null;
}

function yearOrder(schoolYear: string): number {
  const elementary = /^ef-ano-(\d{2})$/.exec(schoolYear);
  if (elementary) return Number(elementary[1]);
  const early = EARLY_CHILDHOOD.indexOf(schoolYear);
  return early >= 0 ? early : 100;
}

export function schoolYearLabel(schoolYear: string): string {
  const elementary = /^ef-ano-(\d{2})$/.exec(schoolYear);
  if (elementary) return `${Number(elementary[1])}º ano`;
  if (schoolYear === "em-sem-seriacao") return "Ensino médio (todas as séries)";
  return schoolYear;
}

export function stageLabel(stage: EducationStage): string {
  return STAGES.find((item) => item.value === stage)!.label;
}

export function buildCatalog(syllabi: CurriculumSyllabus[]): Catalog {
  const years = new Map<string, Set<string>>();
  for (const item of syllabi) {
    if (item.isFixture || !stageOf(item.schoolYear)) continue;
    const subjects = years.get(item.schoolYear) ?? new Set<string>();
    subjects.add(item.curricularComponent);
    years.set(item.schoolYear, subjects);
  }

  const stages: CatalogStage[] = [];
  for (const stage of STAGES) {
    const stageYears = [...years.entries()]
      .filter(([value]) => stageOf(value) === stage.value)
      .sort(([a], [b]) => yearOrder(a) - yearOrder(b))
      .map(([value, subjects]) => ({
        value,
        label: schoolYearLabel(value),
        subjects: [...subjects].sort((a, b) => a.localeCompare(b, "pt-BR")),
      }));
    if (stageYears.length > 0) stages.push({ ...stage, years: stageYears });
  }
  return { stages };
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";
let cached: Promise<Catalog> | null = null;

// The catalog only changes when the BNCC is reloaded, so one request per
// session is enough.
export function loadCatalog(): Promise<Catalog> {
  cached ??= fetch(`${apiBaseUrl}/curriculum`, { credentials: "include" })
    .then(async (response) => {
      if (!response.ok) throw new Error("curriculum");
      const body = (await response.json()) as { data: CurriculumSyllabus[] };
      return buildCatalog(Array.isArray(body.data) ? body.data : []);
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

export function resetCatalogCache(): void {
  cached = null;
}
