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

  it("reuses a marked course before attempting creation", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        courses: [
          {
            id: "course-existing",
            name: "Matemática",
            description: "Turma\n\n[EDUCAI-CLASS:class-local]",
          },
        ],
      }),
    );
    const adapter = new ProductionClassroomAdapter(
      config,
      fetcher,
      vi.fn().mockResolvedValue({ token: "access-token", credential: {} }),
    );

    await expect(
      adapter.ensureCourse(credential, {
        localClassId: "class-local",
        name: "Matemática",
        description: "Turma",
      }),
    ).resolves.toMatchObject({ googleClassroomId: "course-existing" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("creates and activates a course when no marker is found", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ courses: [] }))
      .mockResolvedValueOnce(Response.json({ id: "course-new" }))
      .mockResolvedValueOnce(Response.json({ id: "course-new" }));
    const adapter = new ProductionClassroomAdapter(
      config,
      fetcher,
      vi.fn().mockResolvedValue({ token: "access-token", credential: {} }),
    );

    await expect(
      adapter.ensureCourse(credential, {
        localClassId: "class-local",
        name: "Matemática",
        description: null,
      }),
    ).resolves.toMatchObject({ googleClassroomId: "course-new" });
    expect(fetcher.mock.calls[1]![1]).toMatchObject({ method: "POST" });
    expect(fetcher.mock.calls[2]![1]).toMatchObject({ method: "PATCH" });
  });

  it("paginates and normalizes the student roster", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("pageToken=next"))
        return Response.json({
          students: [
            {
              userId: "student-2",
              profile: {
                name: { fullName: "Aluno Dois" },
                emailAddress: "dois@example.invalid",
              },
            },
          ],
        });
      return Response.json({
        students: [
          {
            userId: "student-1",
            profile: {
              name: { fullName: "Aluno Um" },
              emailAddress: "um@example.invalid",
            },
          },
          { userId: "invalid", profile: { name: {} } },
        ],
        nextPageToken: "next",
      });
    });
    const adapter = new ProductionClassroomAdapter(
      config,
      fetcher as typeof fetch,
      vi.fn().mockResolvedValue({ token: "access-token", credential: {} }),
    );

    await expect(adapter.listStudents(credential, "course-1")).resolves.toEqual(
      {
        students: [
          {
            googleSubject: "student-1",
            name: "Aluno Um",
            email: "um@example.invalid",
          },
          {
            googleSubject: "student-2",
            name: "Aluno Dois",
            email: "dois@example.invalid",
          },
        ],
        credential: {},
      },
    );
  });
});
