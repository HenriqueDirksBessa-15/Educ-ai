import { describe, expect, it, vi } from "vitest";

import type { AuthRepository } from "../auth/repository.js";
import type { ClassroomGradeReturner } from "./classroom-return.js";
import type { DiscursiveCorrectionsRepository } from "./discursive-repository.js";
import { SubmissionReleaseService } from "./release.js";

describe("submission release", () => {
  it("releases locally when Classroom identifiers are unavailable", async () => {
    const repository = {
      getReleaseContext: vi.fn().mockResolvedValue({
        submissionId: "submission-1",
        correctionStatus: "approved",
        googleCourseId: null,
        googleCourseWorkId: null,
        googleUserId: null,
        gradePoints: 8,
      }),
      markReleased: vi.fn().mockResolvedValue(true),
    };
    const service = new SubmissionReleaseService(
      repository as unknown as DiscursiveCorrectionsRepository,
      {} as AuthRepository,
      { isFixture: false } as ClassroomGradeReturner,
    );

    await expect(
      service.release("professor-1", "submission-1"),
    ).resolves.toEqual({
      status: "released",
      classroomStatus: "not_available",
    });
    expect(repository.markReleased).toHaveBeenCalledWith(
      "professor-1",
      "submission-1",
      "not_available",
    );
  });
});
