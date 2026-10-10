import { describe, expect, it, vi } from "vitest";

import { ProductionClassroomGradeReturner } from "./classroom-return.js";

describe("Classroom grade return", () => {
  it("assigns the grade and returns the matching student submission", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("?userId="))
        return json({ studentSubmissions: [{ id: "submission-1" }] });
      expect(init?.method).toMatch(/PATCH|POST/);
      return json({ id: "submission-1" });
    });
    const returner = new ProductionClassroomGradeReturner(
      { clientId: "id", clientSecret: "secret", redirectUri: "http://test" },
      fetcher as typeof fetch,
      vi.fn().mockResolvedValue({ token: "token", credential: {} }),
    );

    await expect(
      returner.returnGrade(
        { scopes: [] },
        {
          courseId: "course-1",
          courseWorkId: "work-1",
          userId: "student-1",
          gradePoints: 7.5,
        },
      ),
    ).resolves.toMatchObject({ returned: true });
    const patch = fetcher.mock.calls.find(
      ([, init]) => init?.method === "PATCH",
    );
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      draftGrade: 7.5,
      assignedGrade: 7.5,
    });
    expect(fetcher.mock.calls.some(([url]) => url.endsWith(":return"))).toBe(
      true,
    );
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
