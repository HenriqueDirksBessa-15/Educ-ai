import { z } from "zod";

export const STUDENT_IMPORT_MAX_ROWS = 500;

export type ParsedStudentRow = {
  line: number;
  name: string;
  registrationNumber: string;
  email: string | null;
  errors: string[];
};

export type StudentImportParse =
  | { ok: true; rows: ParsedStudentRow[] }
  | { ok: false; error: string };

const emailSchema = z.email();

// Lê o CSV da turma: colunas nome e matricula obrigatórias, email opcional.
// Aceita vírgula ou ponto e vírgula (padrão do Excel em português) e aspas.
export function parseStudentCsv(text: string): StudentImportParse {
  const lines = splitRecords(text.replace(/^\uFEFF/, ""));
  const header = lines.shift();
  if (!header || header.cells.every((cell) => !cell.trim()))
    return { ok: false, error: "A planilha está vazia." };
  const columns = header.cells.map(normalizeHeader);
  const nameAt = columns.indexOf("nome");
  const registrationAt = columns.indexOf("matricula");
  const emailAt = columns.indexOf("email");
  if (nameAt < 0 || registrationAt < 0)
    return {
      ok: false,
      error:
        "A primeira linha precisa ter as colunas nome e matricula (email é opcional).",
    };
  const records = lines.filter((record) =>
    record.cells.some((cell) => cell.trim()),
  );
  if (records.length === 0)
    return { ok: false, error: "A planilha não tem alunos." };
  if (records.length > STUDENT_IMPORT_MAX_ROWS)
    return {
      ok: false,
      error: `Envie no máximo ${STUDENT_IMPORT_MAX_ROWS} alunos por vez.`,
    };

  const seenRegistrations = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const rows = records.map((record) => {
    const cell = (index: number) => (record.cells[index] ?? "").trim();
    const name = cell(nameAt);
    const registrationNumber = cell(registrationAt);
    const rawEmail = emailAt >= 0 ? cell(emailAt).toLowerCase() : "";
    const errors: string[] = [];
    if (!name) errors.push("Falta o nome.");
    else if (name.length > 100) errors.push("Nome com mais de 100 letras.");
    if (!registrationNumber) errors.push("Falta a matrícula.");
    else if (registrationNumber.length > 40)
      errors.push("Matrícula com mais de 40 caracteres.");
    if (rawEmail && !emailSchema.safeParse(rawEmail).success)
      errors.push("E-mail inválido.");
    const registrationKey = registrationNumber.toLowerCase();
    if (registrationNumber && seenRegistrations.has(registrationKey))
      errors.push(
        `Matrícula repetida na linha ${seenRegistrations.get(registrationKey)}.`,
      );
    else if (registrationNumber)
      seenRegistrations.set(registrationKey, record.line);
    if (rawEmail && seenEmails.has(rawEmail))
      errors.push(`E-mail repetido na linha ${seenEmails.get(rawEmail)}.`);
    else if (rawEmail) seenEmails.set(rawEmail, record.line);
    return {
      line: record.line,
      name,
      registrationNumber,
      email: rawEmail || null,
      errors,
    };
  });
  return { ok: true, rows };
}

function normalizeHeader(value: string): string {
  const plain = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s_-]+/g, "");
  if (plain === "matricula" || plain === "numerodematricula")
    return "matricula";
  if (plain === "email") return "email";
  return plain;
}

// Separa registros respeitando aspas; o separador é o mais frequente no
// cabeçalho entre vírgula e ponto e vírgula.
function splitRecords(text: string): Array<{ line: number; cells: string[] }> {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else {
        if (char === "\n") line += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      cells.push(cell);
      records.push({ line: recordLine, cells });
      cells = [];
      cell = "";
      line += 1;
      recordLine = line;
    } else cell += char;
  }
  if (cell || cells.length > 0) {
    cells.push(cell);
    records.push({ line: recordLine, cells });
  }
  return records;
}
