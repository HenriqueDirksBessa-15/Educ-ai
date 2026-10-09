import type { ActivityCollectionSummary } from "@educai/contracts";

import type { AuthRepository } from "../auth/repository.js";
import { GooglePublishingError } from "../activities/google-publisher.js";
import type { ActivitiesRepository } from "../activities/repository.js";
import type { GoogleResponseCollector } from "./google-response-collector.js";
import { gradeObjectiveAnswers } from "./objective-grader.js";
import type { CorrectionsRepository } from "./repository.js";

export type CollectionResult =
  | { status: "not_found" | "not_due" | "busy" | "credential_missing" }
  | { status: "collected"; summary: ActivityCollectionSummary }
  | { status: "failed"; errorCode: string; summary: ActivityCollectionSummary };

export class ActivityCollectionService {
  constructor(
    private readonly activities: ActivitiesRepository,
    private readonly corrections: CorrectionsRepository,
    private readonly auth: AuthRepository,
    private readonly collector: GoogleResponseCollector,
  ) {}

  async collect(
    professorId: string,
    activityId: string,
  ): Promise<CollectionResult> {
    const activity = await this.activities.get(professorId, activityId);
    if (!activity) return { status: "not_found" };
    const lease = await this.corrections.startCollection(
      professorId,
      activityId,
    );
    if (typeof lease === "string") return { status: lease };
    const credential = await this.auth.getCredential(professorId);
    if (!credential) {
      await this.corrections.failCollection(
        professorId,
        activityId,
        lease.runId,
        "GOOGLE_CREDENTIAL_MISSING",
      );
      return { status: "credential_missing" };
    }
    try {
      const collected = await this.collector.collect(
        credential,
        lease.googleFormId,
      );
      await this.auth.saveCredential(professorId, collected.credential);
      let created = 0;
      let updated = 0;
      let manualReview = 0;
      for (const submission of collected.submissions) {
        const student = await this.corrections.reconcileStudent(
          professorId,
          activityId,
          submission.respondentEmail,
        );
        const grading = gradeObjectiveAnswers(activity, submission.answers);
        const persisted = await this.corrections.persistSubmission(
          professorId,
          activityId,
          submission,
          student,
          grading,
        );
        if (persisted.created) created += 1;
        else updated += 1;
        if (persisted.manualReview) manualReview += 1;
      }
      await this.corrections.completeCollection(
        professorId,
        activityId,
        lease.runId,
        {
          received: collected.submissions.length,
          created,
          updated,
          manualReview,
        },
      );
      const summary = await this.corrections.getSummary(
        professorId,
        activityId,
      );
      if (!summary) throw new Error("COLLECTION_SUMMARY_MISSING");
      return { status: "collected", summary };
    } catch (error) {
      const errorCode =
        error instanceof GooglePublishingError
          ? error.code
          : "COLLECTION_PROCESSING_FAILED";
      await this.corrections.failCollection(
        professorId,
        activityId,
        lease.runId,
        errorCode,
      );
      const summary = await this.corrections.getSummary(
        professorId,
        activityId,
      );
      if (!summary) throw error;
      return { status: "failed", errorCode, summary };
    }
  }
}
