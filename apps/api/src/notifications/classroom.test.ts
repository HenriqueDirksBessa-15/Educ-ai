import { describe, expect, it, vi } from "vitest";

import { ProductionClassroomAnnouncementSender } from "./classroom.js";

const credential = { accessToken: "old", scopes: [] };
const input = {
  deliveryId: "11111111-1111-4111-8111-111111111111",
  courseId: "course-1",
  title: "Aviso",
  content: "Revisem o conteúdo.",
  links: [{ label: "Apoio", url: "https://example.test/apoio" }],
};

describe("Classroom announcement sender", () => {
  it("reuses an announcement carrying the deterministic marker", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        announcements: [
          {
            id: "announcement-existing",
            text: `[EDUCAI-NOTIFICATION:${input.deliveryId}]`,
          },
        ],
      }),
    );
    const sender = new ProductionClassroomAnnouncementSender(
      { redirectUri: "http://localhost/callback" },
      fetcher,
      vi.fn().mockResolvedValue({
        token: "token",
        credential: { accessToken: "token" },
      }),
    );

    await expect(sender.ensureAnnouncement(credential, input)).resolves.toEqual(
      {
        announcementId: "announcement-existing",
        credential: { accessToken: "token" },
      },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("publishes one global announcement with external links", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ announcements: [] }))
      .mockResolvedValueOnce(Response.json({ id: "announcement-new" }));
    const sender = new ProductionClassroomAnnouncementSender(
      { redirectUri: "http://localhost/callback" },
      fetcher,
      vi.fn().mockResolvedValue({ token: "token", credential: {} }),
    );

    await expect(sender.ensureAnnouncement(credential, input)).resolves.toEqual(
      { announcementId: "announcement-new", credential: {} },
    );
    const request = fetcher.mock.calls[1]![1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      state: "PUBLISHED",
      materials: [
        { link: { title: "Apoio", url: "https://example.test/apoio" } },
      ],
    });
    expect(body.text).toContain(`[EDUCAI-NOTIFICATION:${input.deliveryId}]`);
  });
});
