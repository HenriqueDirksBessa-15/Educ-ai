import type { AuthRepository } from "../auth/repository.js";
import { GooglePublishingError } from "../activities/google-publisher.js";
import type { ClassroomGradeReturner } from "./classroom-return.js";
import type { DiscursiveCorrectionsRepository } from "./discursive-repository.js";

export type ReleaseResult =
  | { status: "released"; classroomStatus: "returned" | "not_available" }
  | { status: "not_found" | "approval_required" | "already_released" }
  | { status: "failed"; errorCode: string };

export class SubmissionReleaseService {
  constructor(
    private readonly repository: DiscursiveCorrectionsRepository,
    private readonly auth: AuthRepository,
    private readonly classroom: ClassroomGradeReturner,
  ) {}

  async release(
    professorId: string,
    submissionId: string,
  ): Promise<ReleaseResult> {
    const context = await this.repository.getReleaseContext(
      professorId,
      submissionId,
    );
    if (!context) return { status: "not_found" };
    if (context.correctionStatus === "released")
      return { status: "already_released" };
    if (context.correctionStatus !== "approved")
      return { status: "approval_required" };
    if (
      !context.googleCourseId ||
      !context.googleCourseWorkId ||
      !context.googleUserId ||
      this.classroom.isFixture
    ) {
      await this.repository.markReleased(
        professorId,
        submissionId,
        "not_available",
      );
      return { status: "released", classroomStatus: "not_available" };
    }
    const credential = await this.auth.getCredential(professorId);
    if (!credential) {
      await this.repository.markReleaseFailure(
        professorId,
        submissionId,
        "GOOGLE_CREDENTIAL_MISSING",
      );
      return { status: "failed", errorCode: "GOOGLE_CREDENTIAL_MISSING" };
    }
    try {
      const returned = await this.classroom.returnGrade(credential, {
        courseId: context.googleCourseId,
        courseWorkId: context.googleCourseWorkId,
        userId: context.googleUserId,
        gradePoints: context.gradePoints,
      });
      await this.auth.saveCredential(professorId, returned.credential);
      await this.repository.markReleased(
        professorId,
        submissionId,
        returned.returned ? "returned" : "not_available",
      );
      return {
        status: "released",
        classroomStatus: returned.returned ? "returned" : "not_available",
      };
    } catch (error) {
      const errorCode =
        error instanceof GooglePublishingError
          ? error.code
          : "CLASSROOM_RETURN_FAILED";
      await this.repository.markReleaseFailure(
        professorId,
        submissionId,
        errorCode,
      );
      return { status: "failed", errorCode };
    }
  }
}
