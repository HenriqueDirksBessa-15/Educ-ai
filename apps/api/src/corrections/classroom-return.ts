import { OAuth2Client } from "google-auth-library";

import type { GoogleCredential } from "../auth/types.js";
import type { AppConfig } from "../config.js";
import { GooglePublishingError } from "../activities/google-publisher.js";

export type ClassroomGradeInput = {
  courseId: string;
  courseWorkId: string;
  userId: string;
  gradePoints: number;
};

export interface ClassroomGradeReturner {
  readonly isFixture: boolean;
  returnGrade(
    credential: GoogleCredential,
    input: ClassroomGradeInput,
  ): Promise<{ returned: boolean; credential: Partial<GoogleCredential> }>;
}

type AccessTokenProvider = (credential: GoogleCredential) => Promise<{
  token: string;
  credential: Partial<GoogleCredential>;
}>;

export class ProductionClassroomGradeReturner
  implements ClassroomGradeReturner
{
  readonly isFixture = false;

  constructor(
    private readonly config: AppConfig["google"],
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly accessTokenProvider: AccessTokenProvider = (credential) =>
      this.refreshAccessToken(credential),
  ) {}

  async returnGrade(credential: GoogleCredential, input: ClassroomGradeInput) {
    const authorization = await this.accessTokenProvider(credential);
    const base = `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(input.courseId)}/courseWork/${encodeURIComponent(input.courseWorkId)}/studentSubmissions`;
    const listed = await this.requestJson<{
      studentSubmissions?: Array<{ id: string }>;
    }>(
      `${base}?userId=${encodeURIComponent(input.userId)}&pageSize=2`,
      authorization.token,
    );
    if (listed.studentSubmissions?.length !== 1)
      throw new GooglePublishingError("CLASSROOM_SUBMISSION_NOT_FOUND");
    const submissionId = listed.studentSubmissions[0]!.id;
    const submissionUrl = `${base}/${encodeURIComponent(submissionId)}`;
    await this.requestJson(
      `${submissionUrl}?updateMask=draftGrade,assignedGrade`,
      authorization.token,
      {
        method: "PATCH",
        body: JSON.stringify({
          draftGrade: input.gradePoints,
          assignedGrade: input.gradePoints,
        }),
      },
    );
    await this.requestJson(`${submissionUrl}:return`, authorization.token, {
      method: "POST",
      body: "{}",
    });
    return { returned: true, credential: authorization.credential };
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

  private async requestJson<T = unknown>(
    url: string,
    token: string,
    init: RequestInit = {},
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new GooglePublishingError("GOOGLE_SERVICE_UNAVAILABLE");
    }
    if (!response.ok)
      throw new GooglePublishingError(normalizeStatus(response.status));
    return (await response.json()) as T;
  }
}

export class FixtureClassroomGradeReturner implements ClassroomGradeReturner {
  readonly isFixture = true;
  async returnGrade(credential: GoogleCredential) {
    return { returned: false, credential };
  }
}

function normalizeStatus(status: number): string {
  if (status === 401) return "GOOGLE_CREDENTIAL_INVALID";
  if (status === 403) return "GOOGLE_PERMISSION_DENIED";
  if (status === 404) return "CLASSROOM_SUBMISSION_NOT_FOUND";
  if (status === 429) return "GOOGLE_RATE_LIMITED";
  return status >= 500
    ? "GOOGLE_SERVICE_UNAVAILABLE"
    : "GOOGLE_INVALID_REQUEST";
}
