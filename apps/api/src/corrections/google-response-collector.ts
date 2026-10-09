import { OAuth2Client } from "google-auth-library";

import type { AppConfig } from "../config.js";
import type { GoogleCredential } from "../auth/types.js";
import { GooglePublishingError } from "../activities/google-publisher.js";

export type GoogleCollectedAnswer = {
  externalQuestionId: string;
  questionPosition: number | null;
  answerText: string | null;
};

export type GoogleCollectedSubmission = {
  externalResponseId: string;
  respondentEmail: string | null;
  submittedAt: string;
  answers: GoogleCollectedAnswer[];
  rawPayload: unknown;
};

export type GoogleCollectionResult = {
  submissions: GoogleCollectedSubmission[];
  credential: Partial<GoogleCredential>;
};

export interface GoogleResponseCollector {
  readonly isFixture: boolean;
  collect(
    credential: GoogleCredential,
    formId: string,
  ): Promise<GoogleCollectionResult>;
}

type AccessTokenProvider = (credential: GoogleCredential) => Promise<{
  token: string;
  credential: Partial<GoogleCredential>;
}>;

type GoogleForm = {
  items?: Array<{
    questionItem?: { question?: { questionId?: string } };
  }>;
};

type GoogleFormResponse = {
  responseId?: string;
  respondentEmail?: string;
  createTime?: string;
  lastSubmittedTime?: string;
  answers?: Record<
    string,
    { textAnswers?: { answers?: Array<{ value?: string }> } }
  >;
};

export class ProductionGoogleResponseCollector
  implements GoogleResponseCollector
{
  readonly isFixture = false;

  constructor(
    private readonly config: AppConfig["google"],
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly accessTokenProvider: AccessTokenProvider = (credential) =>
      this.refreshAccessToken(credential),
  ) {}

  async collect(
    credential: GoogleCredential,
    formId: string,
  ): Promise<GoogleCollectionResult> {
    const authorization = await this.accessTokenProvider(credential);
    const form = await this.requestJson<GoogleForm>(
      `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`,
      authorization.token,
    );
    const positions = new Map<string, number>();
    form.items?.forEach((item, position) => {
      const questionId = item.questionItem?.question?.questionId;
      if (questionId) positions.set(questionId, position);
    });

    const responses: GoogleFormResponse[] = [];
    let pageToken: string | undefined;
    do {
      const suffix = pageToken
        ? `?pageToken=${encodeURIComponent(pageToken)}`
        : "";
      const page = await this.requestJson<{
        responses?: GoogleFormResponse[];
        nextPageToken?: string;
      }>(
        `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}/responses${suffix}`,
        authorization.token,
      );
      responses.push(...(page.responses ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);

    return {
      credential: authorization.credential,
      submissions: responses.map((response) =>
        normalizeResponse(response, positions),
      ),
    };
  }

  private async refreshAccessToken(credential: GoogleCredential) {
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

  private async requestJson<T>(url: string, token: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new GooglePublishingError("GOOGLE_SERVICE_UNAVAILABLE");
    }
    if (!response.ok)
      throw new GooglePublishingError(normalizeGoogleStatus(response.status));
    return (await response.json()) as T;
  }
}

export class FixtureGoogleResponseCollector implements GoogleResponseCollector {
  readonly isFixture = true;

  async collect(
    credential: GoogleCredential,
    _formId: string,
  ): Promise<GoogleCollectionResult> {
    return { submissions: [], credential };
  }
}

function normalizeResponse(
  response: GoogleFormResponse,
  positions: Map<string, number>,
): GoogleCollectedSubmission {
  if (
    !response.responseId ||
    !(response.lastSubmittedTime ?? response.createTime)
  )
    throw new GooglePublishingError("GOOGLE_RESPONSE_INVALID");
  return {
    externalResponseId: response.responseId,
    respondentEmail: response.respondentEmail?.trim().toLowerCase() || null,
    submittedAt: response.lastSubmittedTime ?? response.createTime!,
    answers: Object.entries(response.answers ?? {}).map(
      ([questionId, answer]) => ({
        externalQuestionId: questionId,
        questionPosition: positions.get(questionId) ?? null,
        answerText:
          answer.textAnswers?.answers
            ?.map((entry) => entry.value ?? "")
            .join("\n") ?? null,
      }),
    ),
    rawPayload: response,
  };
}

function normalizeGoogleStatus(status: number): string {
  if (status === 401) return "GOOGLE_CREDENTIAL_INVALID";
  if (status === 403) return "GOOGLE_PERMISSION_DENIED";
  if (status === 404) return "GOOGLE_RESOURCE_NOT_FOUND";
  if (status === 429) return "GOOGLE_RATE_LIMITED";
  return status >= 500
    ? "GOOGLE_SERVICE_UNAVAILABLE"
    : "GOOGLE_INVALID_REQUEST";
}
