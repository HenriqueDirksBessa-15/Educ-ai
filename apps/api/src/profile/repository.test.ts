import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../database.js";
import { ProfileRepository } from "./repository.js";

const professorId = "5d73ea1d-9ab8-4384-960e-3a6f00e6328a";

describe("profile repository", () => {
  it("returns a profile with an empty class list", async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: professorId,
              display_name: "Professora Teste",
              email: "professora@example.invalid",
              profile_image_url: null,
              notification_preference: "visual",
              created_at: new Date("2026-10-09T12:00:00Z"),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const result = await new ProfileRepository(
      database as unknown as DatabaseClient,
    ).getProfile(professorId);

    expect(result?.profile.email).toBe("professora@example.invalid");
    expect(result?.classes).toEqual([]);
  });

  it("updates only editable profile fields", async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    await new ProfileRepository(
      database as unknown as DatabaseClient,
    ).updateProfile(professorId, { displayName: "Novo nome" });

    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("email");
    expect(values).toEqual([professorId, "Novo nome", null]);
  });
});
