import { describe, expect, it } from "vitest";

import { parseStudentCsv, STUDENT_IMPORT_MAX_ROWS } from "./student-import.js";

describe("student CSV import", () => {
  it("reads Excel-style semicolons, accents in the header and an optional email", () => {
    const parsed = parseStudentCsv(
      '\uFEFFNome;Matrícula;E-mail\r\nAna Souza;2026001;ANA@Example.invalid\r\n"Silva, Beto";2026002;\r\n',
    );

    expect(parsed).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          name: "Ana Souza",
          registrationNumber: "2026001",
          email: "ana@example.invalid",
          errors: [],
        },
        {
          line: 3,
          name: "Silva, Beto",
          registrationNumber: "2026002",
          email: null,
          errors: [],
        },
      ],
    });
  });

  it("accepts a file without the email column", () => {
    const parsed = parseStudentCsv("nome,matricula\nCarla,77");

    expect(parsed.ok && parsed.rows[0]).toMatchObject({
      name: "Carla",
      registrationNumber: "77",
      email: null,
    });
  });

  it("reports what is wrong on each line before anything is saved", () => {
    const parsed = parseStudentCsv(
      [
        "nome,matricula,email",
        ",10,sem-nome@example.invalid",
        "Duda,,duda@example.invalid",
        "Eva,11,email-invalido",
        "Fabi,11,fabi@example.invalid",
        "Gabi,12,duda@example.invalid",
        "",
      ].join("\n"),
    );

    expect(parsed.ok).toBe(true);
    const errors = parsed.ok ? parsed.rows.map((row) => row.errors) : [];
    expect(errors).toEqual([
      ["Falta o nome."],
      ["Falta a matrícula."],
      ["E-mail inválido."],
      ["Matrícula repetida na linha 4."],
      ["E-mail repetido na linha 3."],
    ]);
  });

  it("refuses a sheet without the required columns or rows", () => {
    expect(parseStudentCsv("nome,email\nAna,ana@example.invalid")).toEqual({
      ok: false,
      error:
        "A primeira linha precisa ter as colunas nome e matricula (email é opcional).",
    });
    expect(parseStudentCsv("nome,matricula\n\n")).toEqual({
      ok: false,
      error: "A planilha não tem alunos.",
    });
    expect(parseStudentCsv("")).toEqual({
      ok: false,
      error: "A planilha está vazia.",
    });
    const tooMany = [
      "nome,matricula",
      ...Array.from(
        { length: STUDENT_IMPORT_MAX_ROWS + 1 },
        (_, index) => `Aluno ${index},${index}`,
      ),
    ].join("\n");
    expect(parseStudentCsv(tooMany)).toMatchObject({ ok: false });
  });
});
