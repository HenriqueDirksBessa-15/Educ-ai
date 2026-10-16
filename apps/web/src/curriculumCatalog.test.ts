import type { CurriculumSyllabus } from "@educai/contracts";
import { describe, expect, it } from "vitest";

import { buildCatalog, schoolYearLabel } from "./curriculumCatalog.js";

const syllabus = (
  curricularComponent: string,
  schoolYear: string,
  isFixture = false,
) =>
  ({
    id: `${curricularComponent}-${schoolYear}`,
    curricularComponent,
    schoolYear,
    isFixture,
  }) as CurriculumSyllabus;

describe("BNCC catalog for class profiles", () => {
  it("names school years the way teachers say them", () => {
    expect(schoolYearLabel("ef-ano-01")).toBe("1º ano");
    expect(schoolYearLabel("ef-ano-08")).toBe("8º ano");
    expect(schoolYearLabel("em-sem-seriacao")).toBe(
      "Ensino médio (todas as séries)",
    );
    expect(schoolYearLabel("Crianças pequenas")).toBe("Crianças pequenas");
  });

  it("groups years by stage in school order", () => {
    const catalog = buildCatalog([
      syllabus("Matemática", "ef-ano-08"),
      syllabus("Matemática", "ef-ano-02"),
      syllabus("Ciências", "ef-ano-06"),
      syllabus("Matemática", "em-sem-seriacao"),
      syllabus("Educação Infantil", "Bebês"),
    ]);
    expect(catalog.stages.map((stage) => stage.value)).toEqual([
      "early_childhood",
      "elementary_1",
      "elementary_2",
      "high_school",
    ]);
    const finals = catalog.stages.find(
      (stage) => stage.value === "elementary_2",
    )!;
    expect(finals.label).toBe("Ensino fundamental – anos finais (6º ao 9º)");
    expect(finals.years.map((year) => [year.value, year.label])).toEqual([
      ["ef-ano-06", "6º ano"],
      ["ef-ano-08", "8º ano"],
    ]);
  });

  it("lists the subjects of each year once, in alphabetical order", () => {
    const catalog = buildCatalog([
      syllabus("Matemática", "ef-ano-08"),
      syllabus("Ciências", "ef-ano-08"),
      syllabus("Matemática", "ef-ano-08"),
      syllabus("História", "ef-ano-07"),
    ]);
    const year = catalog.stages[0]!.years.find(
      (item) => item.value === "ef-ano-08",
    )!;
    expect(year.subjects).toEqual(["Ciências", "Matemática"]);
  });

  it("ignores demonstration data and unknown years", () => {
    const catalog = buildCatalog([
      syllabus("Matemática", "8º ano EF", true),
      syllabus("Matemática", "ef-ano-03", true),
      syllabus("Matemática", "algo-desconhecido"),
    ]);
    expect(catalog.stages).toEqual([]);
  });
});
