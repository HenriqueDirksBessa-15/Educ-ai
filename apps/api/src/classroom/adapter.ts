import { OAuth2Client } from "google-auth-library";

import type { AppConfig } from "../config.js";
import type { GoogleCredential } from "../auth/types.js";

export type ClassroomCourse = {
  googleClassroomId: string;
  name: string;
  description: string | null;
  schoolYear: string;
};

export type ClassroomCourseListResult = {
  courses: ClassroomCourse[];
  credential: Partial<GoogleCredential>;
};

export interface ClassroomAdapter {
  readonly isFixture: boolean;
  listCourses(credential: GoogleCredential): Promise<ClassroomCourseListResult>;
}

export class FixtureClassroomAdapter implements ClassroomAdapter {
  readonly isFixture = true;

  constructor(private readonly courses: ClassroomCourse[] = []) {}

  async listCourses(
    credential: GoogleCredential,
  ): Promise<ClassroomCourseListResult> {
    return { courses: this.courses, credential };
  }
}

export class ClassroomAdapterError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ClassroomAdapterError";
  }
}

type AccessTokenProvider = (credential: GoogleCredential) => Promise<{
  token: string;
  credential: Partial<GoogleCredential>;
}>;

type GoogleCourse = {
  id?: string;
  name?: string;
  description?: string;
};

export class ProductionClassroomAdapter implements ClassroomAdapter {
  readonly isFixture = false;

  constructor(
    private readonly config: AppConfig["google"],
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly accessTokenProvider: AccessTokenProvider = (credential) =>
      this.refreshAccessToken(credential),
  ) {}

  async listCourses(
    credential: GoogleCredential,
  ): Promise<ClassroomCourseListResult> {
    const authorization = await this.accessTokenProvider(credential);
    const courses: ClassroomCourse[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://classroom.googleapis.com/v1/courses");
      url.searchParams.set("teacherId", "me");
      url.searchParams.set("pageSize", "100");
      url.searchParams.append("courseStates", "ACTIVE");
      url.searchParams.append("courseStates", "PROVISIONED");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await this.requestJson<{
        courses?: GoogleCourse[];
        nextPageToken?: string;
      }>(url, authorization.token);
      courses.push(
        ...(page.courses ?? [])
          .filter(
            (course): course is GoogleCourse & { id: string; name: string } =>
              Boolean(course.id?.trim() && course.name?.trim()),
          )
          .map((course) => ({
            googleClassroomId: course.id,
            name: course.name,
            description: course.description?.trim() || null,
            schoolYear: "A definir",
          })),
      );
      pageToken = page.nextPageToken;
    } while (pageToken);
    return { courses, credential: authorization.credential };
  }

  private async refreshAccessToken(credential: GoogleCredential): Promise<{
    token: string;
    credential: Partial<GoogleCredential>;
  }> {
    if (!this.config.clientId || !this.config.clientSecret)
      throw new ClassroomAdapterError("GOOGLE_NOT_CONFIGURED");
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
      throw new ClassroomAdapterError("GOOGLE_CREDENTIAL_INVALID");
    }
  }

  private async requestJson<T>(url: URL, token: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ClassroomAdapterError("GOOGLE_SERVICE_UNAVAILABLE");
    }
    if (!response.ok)
      throw new ClassroomAdapterError(normalizeGoogleStatus(response.status));
    return (await response.json()) as T;
  }
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
