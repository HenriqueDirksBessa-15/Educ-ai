import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import type {
  BulletinActivitySnapshot,
  BulletinFeedbackSnapshot,
  BulletinPeriodType,
} from "@educai/contracts";

export type BulletinPdfSnapshot = {
  title: string;
  professorName: string;
  className: string;
  studentName: string;
  studentEmail: string;
  periodType: BulletinPeriodType;
  periodStart: string;
  periodEnd: string;
  average: number;
  teacherComment: string | null;
  activities: BulletinActivitySnapshot[];
  feedbacks: BulletinFeedbackSnapshot[];
  generatedAt: string;
};

export async function generateBulletinPdf(
  snapshot: BulletinPdfSnapshot,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(snapshot.title);
  document.setAuthor("EDUC.AI");
  document.setSubject(`Boletim de ${snapshot.studentName}`);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595.28, 841.89]);
  let y = 795;

  const write = (
    text: string,
    options: { bold?: boolean; size?: number; gap?: number } = {},
  ) => {
    const font = options.bold ? bold : regular;
    const size = options.size ?? 10;
    for (const line of wrapText(sanitizeForFont(text, font), font, size, 505)) {
      if (y < 55) {
        page = document.addPage([595.28, 841.89]);
        y = 795;
      }
      page.drawText(line, {
        x: 45,
        y,
        size,
        font,
        color: rgb(0.12, 0.2, 0.22),
      });
      y -= size + 4;
    }
    y -= options.gap ?? 4;
  };

  write("EDUC.AI", { bold: true, size: 18, gap: 8 });
  write(snapshot.title, { bold: true, size: 15, gap: 10 });
  write(`Aluno: ${snapshot.studentName} (${snapshot.studentEmail})`);
  write(`Turma: ${snapshot.className}`);
  write(`Professor: ${snapshot.professorName}`);
  write(
    `Periodo: ${formatDate(snapshot.periodStart)} a ${formatDate(snapshot.periodEnd)} - ${periodLabel(snapshot.periodType)}`,
    { gap: 12 },
  );
  write(`Media final: ${snapshot.average.toFixed(2)}/10`, {
    bold: true,
    size: 13,
    gap: 12,
  });
  write("Atividades", { bold: true, size: 12 });
  snapshot.activities.forEach((activity) => {
    write(
      `- ${activity.title} | prazo ${new Date(activity.dueAt).toLocaleDateString("pt-BR")} | nota ${activity.grade.toFixed(2)}/10`,
    );
  });
  if (snapshot.feedbacks.length > 0) {
    y -= 4;
    write("Feedbacks enviados", { bold: true, size: 12 });
    snapshot.feedbacks.forEach((feedback) => {
      write(`- ${feedback.title}: ${feedback.content}`);
    });
  }
  if (snapshot.teacherComment) {
    y -= 4;
    write("Comentario do professor", { bold: true, size: 12 });
    write(snapshot.teacherComment);
  }
  y -= 8;
  write(`Gerado em ${new Date(snapshot.generatedAt).toLocaleString("pt-BR")}`, {
    size: 8,
  });

  return document.save();
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const paragraphs = text.replaceAll("\r", "").split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth)
        current = candidate;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    lines.push(current || " ");
  }
  return lines;
}

function sanitizeForFont(text: string, font: PDFFont): string {
  return Array.from(text, (character) => {
    try {
      font.encodeText(character);
      return character;
    } catch {
      return "?";
    }
  }).join("");
}

function periodLabel(period: BulletinPeriodType): string {
  return {
    monthly: "mensal",
    bimonthly: "bimestral",
    quarterly: "trimestral",
    annual: "anual",
    custom: "personalizado",
  }[period];
}

function formatDate(value: string): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("pt-BR");
}
