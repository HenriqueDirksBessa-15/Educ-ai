import type {
  Bulletin,
  BulletinPeriodType,
  EligibleBulletinStudent,
} from "@educai/contracts";

// Pure rules behind the bulletins page; see docs/telas/09-boletins.md.

const pad = (value: number) => String(value).padStart(2, "0");
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Months are counted from 0; day 0 of the next month is the last day.
const range = (year: number, firstMonth: number, months: number) => ({
  start: isoDate(new Date(year, firstMonth, 1)),
  end: isoDate(new Date(year, firstMonth + months, 0)),
});

// Calendar-year presets; "custom" keeps whatever the teacher typed.
export function periodRange(
  type: BulletinPeriodType,
  today: Date,
): { start: string; end: string } | null {
  const year = today.getFullYear();
  const month = today.getMonth();
  switch (type) {
    case "monthly":
      return range(year, month, 1);
    case "bimonthly":
      return range(year, month - (month % 2), 2);
    case "quarterly":
      return range(year, month - (month % 3), 3);
    case "annual":
      return range(year, 0, 12);
    default:
      return null;
  }
}

export function classesFromStudents(students: EligibleBulletinStudent[]) {
  const classes = new Map<string, string>();
  for (const student of students)
    classes.set(student.classId, student.className);
  return [...classes.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export type BulletinFormErrors = Partial<
  Record<
    "classId" | "students" | "start" | "end" | "title" | "threshold",
    string
  >
>;

export function validateBulletinForm(form: {
  classId: string;
  studentIds: string[];
  start: string;
  end: string;
  title: string;
  onlyBelowAverage: boolean;
  threshold: string;
}): BulletinFormErrors {
  const errors: BulletinFormErrors = {};
  if (!form.classId) errors.classId = "Escolha a turma.";
  if (form.studentIds.length === 0)
    errors.students = "Escolha pelo menos um aluno.";
  if (!form.start) errors.start = "Escolha o início do período.";
  if (!form.end) errors.end = "Escolha o fim do período.";
  else if (form.start && form.end < form.start)
    errors.end = "O fim não pode ser antes do início.";
  if (!form.title.trim()) errors.title = "Escreva o título.";
  if (form.onlyBelowAverage) {
    const value = Number(form.threshold.replace(",", "."));
    if (form.threshold.trim() === "" || !(value >= 0 && value <= 10))
      errors.threshold = "Use uma média de 0 a 10.";
  }
  return errors;
}

export const notYetSent = (bulletins: Bulletin[]) =>
  bulletins.filter(
    (item) => item.status === "generated" || item.status === "failed",
  );
