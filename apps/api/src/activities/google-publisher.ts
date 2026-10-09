import { OAuth2Client } from "google-auth-library";

import type { Activity } from "@educai/contracts";

import type { AppConfig } from "../config.js";
import type { GoogleCredential } from "../auth/types.js";

export type GoogleFormReference = {
  formId: string;
  responderUri: string;
  credential: Partial<GoogleCredential>;
};

export type ClassroomWorkReference = {
  courseWorkId: string;
  alternateLink: string;
  credential: Partial<GoogleCredential>;
};

export type ClassroomWorkInput = {
  activity: Activity;
  courseId: string;
  responderUri: string;
};

export interface GoogleActivityPublisher {
  readonly isFixture: boolean;
  ensureForm(
    credential: GoogleCredential,
    activity: Activity,
  ): Promise<GoogleFormReference>;
  ensureCourseWork(
    credential: GoogleCredential,
    input: ClassroomWorkInput,
  ): Promise<ClassroomWorkReference>;
  getForm(
    credential: GoogleCredential,
    formId: string,
  ): Promise<GoogleFormReference>;
}

export class GooglePublishingError extends Error {
  constructor(
    readonly code: string,
    readonly reconciliationRequired = false,
  ) {
    super(code);
    this.name = "GooglePublishingError";
  }
}

type AccessTokenProvider = (credential: GoogleCredential) => Promise<{
  token: string;
  credential: Partial<GoogleCredential>;
}>;

export class ProductionGoogleActivityPublisher
  implements GoogleActivityPublisher
{
  readonly isFixture = false;

  constructor(
    private readonly config: AppConfig["google"],
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly accessTokenProvider: AccessTokenProvider = (credential) =>
      this.refreshAccessToken(credential),
  ) {}

  async ensureForm(
    credential: GoogleCredential,
    activity: Activity,
  ): Promise<GoogleFormReference> {
    assertIntegerPoints(activity);
    const authorization = await this.accessTokenProvider(credential);
    const existing = await this.findForm(
      authorization.token,
      activity,
      authorization.credential,
    );
    let formId = existing?.formId;
    if (!formId) {
      const created = await this.requestJson<{ formId: string }>(
        "https://forms.googleapis.com/v1/forms",
        authorization.token,
        {
          method: "POST",
          body: JSON.stringify({
            info: {
              title: activity.title,
              documentTitle: documentTitle(activity),
            },
          }),
        },
        true,
      );
      formId = created.formId;
    }

    await this.configureForm(authorization.token, formId, activity);
    await this.requestJson(
      `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}:setPublishSettings`,
      authorization.token,
      {
        method: "POST",
        body: JSON.stringify({
          publishSettings: {
            publishState: { isPublished: true, isAcceptingResponses: true },
          },
          updateMask: "publishState",
        }),
      },
      true,
    );
    await this.requestJson(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(formId)}?fields=id`,
      authorization.token,
      {
        method: "PATCH",
        body: JSON.stringify({
          appProperties: { educaiActivityId: activity.id },
        }),
      },
      true,
    );
    return this.getFormWithToken(
      authorization.token,
      formId,
      authorization.credential,
    );
  }

  async ensureCourseWork(
    credential: GoogleCredential,
    input: ClassroomWorkInput,
  ): Promise<ClassroomWorkReference> {
    assertIntegerPoints(input.activity);
    const authorization = await this.accessTokenProvider(credential);
    const existing = await this.findCourseWork(
      authorization.token,
      input.courseId,
      input.activity.id,
    );
    if (existing) return { ...existing, credential: authorization.credential };

    const due = new Date(input.activity.dueAt);
    const marker = activityMarker(input.activity.id);
    const created = await this.requestJson<{
      id: string;
      alternateLink: string;
    }>(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(input.courseId)}/courseWork`,
      authorization.token,
      {
        method: "POST",
        body: JSON.stringify({
          title: input.activity.title,
          description: `${input.activity.description}\n\n${marker}`,
          materials: [{ link: { url: input.responderUri } }],
          state: "PUBLISHED",
          workType: "ASSIGNMENT",
          maxPoints: input.activity.totalPoints,
          dueDate: {
            year: due.getUTCFullYear(),
            month: due.getUTCMonth() + 1,
            day: due.getUTCDate(),
          },
          dueTime: {
            hours: due.getUTCHours(),
            minutes: due.getUTCMinutes(),
          },
        }),
      },
      true,
    );
    return {
      courseWorkId: created.id,
      alternateLink: created.alternateLink,
      credential: authorization.credential,
    };
  }

  async getForm(
    credential: GoogleCredential,
    formId: string,
  ): Promise<GoogleFormReference> {
    const authorization = await this.accessTokenProvider(credential);
    return this.getFormWithToken(
      authorization.token,
      formId,
      authorization.credential,
    );
  }

  private async configureForm(
    token: string,
    formId: string,
    activity: Activity,
  ): Promise<void> {
    const current = await this.requestJson<{ items?: unknown[] }>(
      `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`,
      token,
    );
    if ((current.items?.length ?? 0) > 0) return;
    const requests = [
      {
        updateFormInfo: {
          info: { description: activity.description },
          updateMask: "description",
        },
      },
      {
        updateSettings: {
          settings: { quizSettings: { isQuiz: true } },
          updateMask: "quizSettings.isQuiz",
        },
      },
      ...activity.questions.map((question, index) => ({
        createItem: {
          location: { index },
          item: {
            title: question.prompt,
            questionItem: {
              question:
                question.kind === "objective"
                  ? {
                      required: true,
                      grading: {
                        pointValue: question.points,
                        correctAnswers: {
                          answers: [
                            {
                              value:
                                question.alternatives[
                                  question.correctAlternativeIndex
                                ],
                            },
                          ],
                        },
                      },
                      choiceQuestion: {
                        type: "RADIO",
                        options: question.alternatives.map((value) => ({
                          value,
                        })),
                      },
                    }
                  : {
                      required: true,
                      grading: {
                        pointValue: question.points,
                        correctAnswers: {
                          answers: [{ value: question.targetAnswer }],
                        },
                      },
                      textQuestion: { paragraph: true },
                    },
            },
          },
        },
      })),
    ];
    await this.requestJson(
      `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}:batchUpdate`,
      token,
      { method: "POST", body: JSON.stringify({ requests }) },
      true,
    );
  }

  private async findForm(
    token: string,
    activity: Activity,
    credential: Partial<GoogleCredential>,
  ): Promise<GoogleFormReference | null> {
    const escapedTitle = documentTitle(activity).replaceAll("'", "\\'");
    const query = [
      "mimeType = 'application/vnd.google-apps.form'",
      `name = '${escapedTitle}'`,
      "trashed = false",
    ].join(" and ");
    const result = await this.requestJson<{
      files?: Array<{ id: string }>;
    }>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)&pageSize=10`,
      token,
    );
    const formId = result.files?.[0]?.id;
    return formId ? this.getFormWithToken(token, formId, credential) : null;
  }

  private async findCourseWork(
    token: string,
    courseId: string,
    activityId: string,
  ): Promise<{ courseWorkId: string; alternateLink: string } | null> {
    let pageToken: string | undefined;
    do {
      const suffix = pageToken
        ? `&pageToken=${encodeURIComponent(pageToken)}`
        : "";
      const result = await this.requestJson<{
        courseWork?: Array<{
          id: string;
          alternateLink: string;
          description?: string;
        }>;
        nextPageToken?: string;
      }>(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/courseWork?pageSize=100${suffix}`,
        token,
      );
      const match = result.courseWork?.find((work) =>
        work.description?.includes(activityMarker(activityId)),
      );
      if (match)
        return { courseWorkId: match.id, alternateLink: match.alternateLink };
      pageToken = result.nextPageToken;
    } while (pageToken);
    return null;
  }

  private async getFormWithToken(
    token: string,
    formId: string,
    credential: Partial<GoogleCredential>,
  ): Promise<GoogleFormReference> {
    const form = await this.requestJson<{
      formId: string;
      responderUri: string;
    }>(
      `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`,
      token,
    );
    return { formId: form.formId, responderUri: form.responderUri, credential };
  }

  private async refreshAccessToken(credential: GoogleCredential): Promise<{
    token: string;
    credential: Partial<GoogleCredential>;
  }> {
    if (!this.config.clientId || !this.config.clientSecret)
      throw new GooglePublishingError("GOOGLE_NOT_CONFIGURED");
    const client = new OAuth2Client({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri,
    });
    client.setCredentials({
      access_token: credential.accessToken,
      refresh_token: credential.refreshToken,
      expiry_date: credential.expiryDate?.getTime(),
      scope: credential.scopes.join(" "),
      token_type: credential.tokenType,
    });
    try {
      const response = await client.getAccessToken();
      if (!response.token) throw new Error("missing token");
      return {
        token: response.token,
        credential: {
          accessToken: response.token,
          refreshToken: client.credentials.refresh_token ?? undefined,
          expiryDate: client.credentials.expiry_date
            ? new Date(client.credentials.expiry_date)
            : undefined,
          scopes: client.credentials.scope?.split(" ").filter(Boolean) ?? [],
          tokenType: client.credentials.token_type ?? undefined,
        },
      };
    } catch {
      throw new GooglePublishingError("GOOGLE_CREDENTIAL_INVALID");
    }
  }

  private async requestJson<T = unknown>(
    url: string,
    token: string,
    init: RequestInit = {},
    ambiguousOnFailure = false,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new GooglePublishingError(
        "GOOGLE_SERVICE_UNAVAILABLE",
        ambiguousOnFailure,
      );
    }
    if (!response.ok)
      throw new GooglePublishingError(
        normalizeGoogleStatus(response.status),
        ambiguousOnFailure && response.status >= 500,
      );
    return (await response.json()) as T;
  }
}

export class FixtureGoogleActivityPublisher implements GoogleActivityPublisher {
  readonly isFixture = true;

  async ensureForm(
    credential: GoogleCredential,
    activity: Activity,
  ): Promise<GoogleFormReference> {
    return {
      formId: `fixture-form-${activity.id}`,
      responderUri: `https://docs.google.com/forms/d/${activity.id}/viewform`,
      credential,
    };
  }

  async ensureCourseWork(
    credential: GoogleCredential,
    input: ClassroomWorkInput,
  ): Promise<ClassroomWorkReference> {
    return {
      courseWorkId: `fixture-work-${input.activity.id}-${input.courseId}`,
      alternateLink: `https://classroom.google.com/c/${input.courseId}`,
      credential,
    };
  }

  async getForm(
    credential: GoogleCredential,
    formId: string,
  ): Promise<GoogleFormReference> {
    return {
      formId,
      responderUri: `https://docs.google.com/forms/d/${formId}/viewform`,
      credential,
    };
  }
}

function documentTitle(activity: Activity): string {
  return `${activityMarker(activity.id)} ${activity.title}`.slice(0, 255);
}

function activityMarker(activityId: string): string {
  return `[EDUCAI:${activityId}]`;
}

function normalizeGoogleStatus(status: number): string {
  if (status === 401) return "GOOGLE_CREDENTIAL_INVALID";
  if (status === 403) return "GOOGLE_PERMISSION_DENIED";
  if (status === 404) return "GOOGLE_RESOURCE_NOT_FOUND";
  if (status === 409) return "GOOGLE_CONFLICT";
  if (status === 429) return "GOOGLE_RATE_LIMITED";
  if (status >= 400 && status < 500) return "GOOGLE_INVALID_REQUEST";
  return "GOOGLE_SERVICE_UNAVAILABLE";
}

function assertIntegerPoints(activity: Activity): void {
  if (
    !Number.isInteger(activity.totalPoints) ||
    activity.questions.some((question) => !Number.isInteger(question.points))
  )
    throw new GooglePublishingError("GOOGLE_POINTS_MUST_BE_INTEGER");
}
