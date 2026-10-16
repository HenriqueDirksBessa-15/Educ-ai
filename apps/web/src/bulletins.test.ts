import type { Bulletin, EligibleBulletinStudent } from "@educai/contracts";
import { describe, expect, it } from "vitest";

import {
  classesFromStudents,
  notYetSent,
  periodRange,
  validateBulletinForm,
} from "./bulletins.js";

const today = new Date(2026, 9, 16);

describe("period presets", () => {
  it("fills the current month, two-month block, quarter and year", () => {
    expect(periodRange("monthly", today)).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(periodRange("bimonthly", today)).toEqual({
      start: "2026-09-01",
      end: "2026-10-31",
    });
    expect(periodRange("quarterly", today)).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(periodRange("annual", today)).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("handles short months and leaves chosen dates alone", () => {
    expect(periodRange("monthly", new Date(2028, 1, 10))).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(periodRange("bimonthly", new Date(2026, 0, 5))).toEqual({
      start: "2026-01-01",
      end: "2026-02-28",
    });
    expect(periodRange("custom", today)).toBeNull();
  });
});

describe("classes from eligible students", () => {
  it("lists each class once, in alphabetical order", () => {
    const students = [
      {
        id: "1",
        name: "A",
        email: "a@x.invalid",
        classId: "c2",
        className: "8º A",
      },
      {
        id: "2",
        name: "B",
        email: "b@x.invalid",
        classId: "c1",
        className: "7º B",
      },
      {
        id: "3",
        name: "C",
        email: "c@x.invalid",
        classId: "c2",
        className: "8º A",
      },
    ] as EligibleBulletinStudent[];
    expect(classesFromStudents(students)).toEqual([
      { id: "c1", name: "7º B" },
      { id: "c2", name: "8º A" },
    ]);
  });
});

describe("bulletin form", () => {
  const valid = {
    classId: "c1",
    studentIds: ["1"],
    start: "2026-09-01",
    end: "2026-10-31",
    title: "Boletim",
    onlyBelowAverage: false,
    threshold: "",
  };

  it("accepts a complete form", () => {
    expect(validateBulletinForm(valid)).toEqual({});
  });

  it("explains every missing choice", () => {
    expect(
      validateBulletinForm({
        classId: "",
        studentIds: [],
        start: "",
        end: "",
        title: " ",
        onlyBelowAverage: true,
        threshold: "11",
      }),
    ).toEqual({
      classId: "Escolha a turma.",
      students: "Escolha pelo menos um aluno.",
      start: "Escolha o início do período.",
      end: "Escolha o fim do período.",
      title: "Escreva o título.",
      threshold: "Use uma média de 0 a 10.",
    });
  });

  it("rejects a period that ends before it starts", () => {
    expect(
      validateBulletinForm({
        ...valid,
        start: "2026-10-31",
        end: "2026-09-01",
      }),
    ).toEqual({ end: "O fim não pode ser antes do início." });
  });
});

describe("sending", () => {
  it("finds bulletins never sent or that failed", () => {
    const bulletins = [
      { id: "a", status: "generated" },
      { id: "b", status: "sent" },
      { id: "c", status: "failed" },
      { id: "d", status: "pending" },
    ] as Bulletin[];
    expect(notYetSent(bulletins).map((item) => item.id)).toEqual(["a", "c"]);
  });
});
