import { describe, expect, it, vi } from "vitest";

import type { BulletinsRepository } from "./repository.js";
import { BulletinEmailError, type BulletinEmailSender } from "./email.js";
import { BulletinService } from "./service.js";

describe("bulletin delivery", () => {
  it("preserves the PDF and records a recoverable failure", async () => {
    const repository = {
      startDelivery: vi.fn().mockResolvedValue({
        deliveryId: "delivery-1",
        recipientEmail: "aluno@example.test",
        studentName: "Aluno Teste",
        title: "Boletim",
        pdf: new Uint8Array([37, 80, 68, 70]),
      }),
      completeDelivery: vi.fn(),
      failDelivery: vi.fn(),
    };
    const email = {
      isFixture: false,
      send: vi
        .fn()
        .mockRejectedValue(
          new BulletinEmailError("EMAIL_PROVIDER_UNAVAILABLE"),
        ),
    } satisfies BulletinEmailSender;
    const service = new BulletinService(
      repository as unknown as BulletinsRepository,
      email,
    );

    await expect(service.send("professor-1", "bulletin-1")).resolves.toEqual({
      status: "failed",
      errorCode: "EMAIL_PROVIDER_UNAVAILABLE",
    });
    expect(repository.failDelivery).toHaveBeenCalledWith(
      "professor-1",
      "bulletin-1",
      "delivery-1",
      "EMAIL_PROVIDER_UNAVAILABLE",
    );
    expect(repository.completeDelivery).not.toHaveBeenCalled();
  });
});
