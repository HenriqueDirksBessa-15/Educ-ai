import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config.js";
import type { GoogleCredential } from "../auth/types.js";
import { GOOGLE_CLASSROOM_SYNC_SCOPES } from "../auth/google-gateway.js";
import type { ClassroomAdapterError } from "./adapter.js";
import { ProductionClassroomAdapter } from "./adapter.js";

const config: AppConfig["google"] = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://example.test/api/auth/google/callback",
};
const credential: GoogleCredential = {
  refreshToken: "refresh-token",
  scopes: [],
};

describe("Google Classroom adapter", () => {
  it("requests only the scopes needed to synchronize courses and rosters", () => {
    expect(GOOGLE_CLASSROOM_SYNC_SCOPES).toEqual([
      "https://www.googleapis.com/auth/classroom.courses",
      "https://www.googleapis.com/auth/classroom.rosters.readonly",
      "https://www.googleapis.com/auth/classroom.profile.emails",
    ]);
  });

  it("paginates courses taught by the authenticated professor", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("pageToken=next-page"))
        return Response.json({
          courses: [
            { id: "course-2", name: "Ciências", courseState: "PROVISIONED" },
            { id: "", name: "inválido", courseState: "ACTIVE" },
          ],
        });
      return Response.json({
        courses: [
          {
            id: "course-1",
            name: "Matemática",
            description: "Turma de homologação",
            courseState: "ACTIVE",
          },
        ],
        nextPageToken: "next-page",
      });
    });
    const adapter = new ProductionClassroomAdapter(
      config,
      fetcher as typeof fetch,
      vi.fn().mockResolvedValue({
        token: "access-token",
        credential: { accessToken: "renewed-token" },
      }),
    );

    await expect(adapter.listCourses(credential)).resolves.toEqual({
      courses: [
        {
          googleClassroomId: "course-1",
          name: "Matemática",
          description: "Turma de homologação",
          schoolYear: "A definir",
        },
        {
          googleClassroomId: "course-2",
          name: "Ciências",
          description: null,
          schoolYear: "A definir",
        },
      ],
      credential: { accessToken: "renewed-token" },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]![0])).toContain("teacherId=me");
  });

  it("normalizes permission failures without exposing the response", async () => {
    const adapter = new ProductionClassroomAdapter(
      config,
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
      vi.fn().mockResolvedValue({ token: "access-token", credential: {} }),
    );

    await expect(adapter.listCourses(credential)).rejects.toMatchObject({
      name: "ClassroomAdapterError",
      code: "GOOGLE_PERMISSION_DENIED",
    } satisfies Partial<ClassroomAdapterError>);
  });
});
