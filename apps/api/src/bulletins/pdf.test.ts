import { describe, expect, it } from "vitest";

import { generateBulletinPdf } from "./pdf.js";

describe("bulletin PDF", () => {
  it("generates a real PDF from the immutable snapshot", async () => {
    const bytes = await generateBulletinPdf({
      title: "Boletim de Matemática",
      professorName: "Professora Ana",
      className: "5º ano",
      studentName: "Aluna Teste",
      studentEmail: "aluna@example.test",
      periodType: "monthly",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      average: 8,
      teacherComment: "Bom progresso 😀.",
      activities: [
        {
          activityId: "11111111-1111-4111-8111-111111111111",
          title: "Frações",
          dueAt: "2026-10-20T18:00:00.000Z",
          grade: 8,
        },
      ],
      feedbacks: [],
      generatedAt: "2026-10-31T12:00:00.000Z",
    });

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(500);
  });
});
