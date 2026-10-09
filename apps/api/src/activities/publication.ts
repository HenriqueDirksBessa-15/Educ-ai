import {
  activityInputSchema,
  type ActivityPublication,
} from "@educai/contracts";

import type { AuthRepository } from "../auth/repository.js";
import { GOOGLE_PUBLISHING_SCOPES } from "../auth/google-gateway.js";
import {
  GooglePublishingError,
  type GoogleActivityPublisher,
} from "./google-publisher.js";
import type { ActivitiesRepository } from "./repository.js";

export class ActivityPublicationService {
  constructor(
    private readonly activities: ActivitiesRepository,
    private readonly auth: AuthRepository,
    private readonly google: GoogleActivityPublisher,
  ) {}

  async publish(
    professorId: string,
    activityId: string,
  ): Promise<
    | { status: "not_found" | "locked" }
    | { status: "publication"; publication: ActivityPublication }
  > {
    const activity = await this.activities.get(professorId, activityId);
    if (!activity) return { status: "not_found" };
    if (activity.status === "published") {
      const existing = await this.activities.getPublication(
        professorId,
        activityId,
      );
      if (existing?.status === "published")
        return { status: "publication", publication: existing };
    }
    if (
      activity.status !== "draft" ||
      activity.archivedAt ||
      activity.questions.length === 0 ||
      !activityInputSchema.safeParse(activity).success
    )
      return { status: "locked" };
    const prepared = await this.activities.preparePublication(
      professorId,
      activityId,
    );
    if (prepared !== "ready") return { status: prepared };

    let publication = await this.activities.getPublication(
      professorId,
      activityId,
    );
    if (!publication) return { status: "locked" };
    if (publication.status === "published")
      return { status: "publication", publication };

    let credential = await this.auth.getCredential(professorId);
    if (!credential) {
      await this.activities.markPublicationFailure(
        professorId,
        activityId,
        "GOOGLE_CREDENTIAL_MISSING",
      );
      return this.current(professorId, activityId);
    }
    if (
      !this.google.isFixture &&
      !GOOGLE_PUBLISHING_SCOPES.every((scope) =>
        credential!.scopes.includes(scope),
      )
    ) {
      await this.activities.markPublicationFailure(
        professorId,
        activityId,
        "GOOGLE_RECONSENT_REQUIRED",
      );
      return this.current(professorId, activityId);
    }

    if (!publication.googleFormId || !publication.responderUri) {
      const acquired = await this.activities.markPublicationAttempt(
        professorId,
        activityId,
        "creating_form",
      );
      if (!acquired) return this.current(professorId, activityId);
      try {
        const form = await this.google.ensureForm(credential, activity);
        await this.auth.saveCredential(professorId, form.credential);
        credential = { ...credential, ...form.credential };
        await this.activities.savePublishedForm(
          professorId,
          activityId,
          form.formId,
          form.responderUri,
        );
      } catch (error) {
        const normalized = normalizePublishingError(error);
        await this.activities.markPublicationFailure(
          professorId,
          activityId,
          normalized.code,
          normalized.reconciliationRequired,
        );
        return this.current(professorId, activityId);
      }
    }

    publication = await this.activities.getPublication(professorId, activityId);
    if (!publication?.responderUri) return { status: "locked" };
    const acquired = await this.activities.markPublicationAttempt(
      professorId,
      activityId,
      "distributing",
    );
    if (!acquired) return this.current(professorId, activityId);
    let failed = false;
    for (const distribution of publication.distributions) {
      if (distribution.status === "published") continue;
      if (!distribution.googleClassroomId) {
        failed = true;
        await this.activities.markDistributionFailure(
          professorId,
          activityId,
          distribution.classId,
          "GOOGLE_CLASSROOM_ID_MISSING",
        );
        continue;
      }
      try {
        const work = await this.google.ensureCourseWork(credential, {
          activity,
          courseId: distribution.googleClassroomId,
          responderUri: publication.responderUri,
        });
        await this.auth.saveCredential(professorId, work.credential);
        credential = { ...credential, ...work.credential };
        await this.activities.saveDistribution(
          professorId,
          activityId,
          distribution.classId,
          work.courseWorkId,
          work.alternateLink,
        );
      } catch (error) {
        failed = true;
        const normalized = normalizePublishingError(error);
        await this.activities.markDistributionFailure(
          professorId,
          activityId,
          distribution.classId,
          normalized.code,
        );
      }
    }
    if (failed) {
      await this.activities.markPublicationFailure(
        professorId,
        activityId,
        "GOOGLE_DISTRIBUTION_INCOMPLETE",
      );
    } else {
      await this.activities.completeExternalPublication(
        professorId,
        activityId,
      );
    }
    return this.current(professorId, activityId);
  }

  private async current(
    professorId: string,
    activityId: string,
  ): Promise<{ status: "publication"; publication: ActivityPublication }> {
    const publication = await this.activities.getPublication(
      professorId,
      activityId,
    );
    if (!publication) throw new Error("ACTIVITY_PUBLICATION_NOT_FOUND");
    return { status: "publication", publication };
  }
}

function normalizePublishingError(error: unknown): GooglePublishingError {
  return error instanceof GooglePublishingError
    ? error
    : new GooglePublishingError("GOOGLE_PUBLICATION_FAILED");
}
