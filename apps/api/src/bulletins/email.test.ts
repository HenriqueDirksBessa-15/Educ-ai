import { describe, expect, it, vi } from "vitest";

import { ResendEmailSender } from "./email.js";
import type { BulletinEmailError } from "./email.js";

describe("Resend email sender", () => {
  it("sends an idempotent message with a PDF attachment", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "email-1" }, { status: 200 }));
    const sender = new ResendEmailSender(
      "resend-secret",
      "EDUC.AI <boletins@example.test>",
      fetcher,
    );

    await sender.send({
      to: "aluno@example.test",
      subject: "Boletim",
      text: "Segue o boletim.",
      idempotencyKey: "bulletin/delivery-1",
      attachments: [
        {
          fileName: "boletim.pdf",
          contentType: "application/pdf",
          content: new Uint8Array([37, 80, 68, 70]),
        },
      ],
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetcher.mock.calls[0]![1] as RequestInit;
    expect(request.headers).toMatchObject({
      authorization: "Bearer resend-secret",
      "idempotency-key": "bulletin/delivery-1",
    });
    expect(JSON.parse(String(request.body))).toMatchObject({
      from: "EDUC.AI <boletins@example.test>",
      to: ["aluno@example.test"],
      attachments: [
        {
          filename: "boletim.pdf",
          content_type: "application/pdf",
          content: Buffer.from([37, 80, 68, 70]).toString("base64"),
        },
      ],
    });
  });

  it("normalizes authentication and availability failures", async () => {
    const rejected = new ResendEmailSender(
      "invalid",
      "EDUC.AI <boletins@example.test>",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(
      rejected.send({
        to: "aluno@example.test",
        subject: "Boletim",
        text: "Texto",
        idempotencyKey: "bulletin/delivery-1",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BulletinEmailError>>({
        code: "EMAIL_CREDENTIAL_INVALID",
      }),
    );

    const unavailable = new ResendEmailSender(
      "secret",
      "EDUC.AI <boletins@example.test>",
      vi.fn().mockRejectedValue(new Error("network")),
    );
    await expect(
      unavailable.send({
        to: "aluno@example.test",
        subject: "Boletim",
        text: "Texto",
        idempotencyKey: "bulletin/delivery-2",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<BulletinEmailError>>({
        code: "EMAIL_PROVIDER_UNAVAILABLE",
      }),
    );
  });
});
