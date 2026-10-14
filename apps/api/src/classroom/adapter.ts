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

export type ClassroomStudent = {
  googleSubject: string;
  name: string;
  email: string;
};

export type ClassroomStudentListResult = {
  students: ClassroomStudent[];
  credential: Partial<GoogleCredential>;
};

export type ClassroomCourseInput = {
  localClassId: string;
  name: string;
  description: string | null;
};

export type ClassroomCourseReference = {
  googleClassroomId: string;
  credential: Partial<GoogleCredential>;
};

export interface ClassroomAdapter {
  readonly isFixture: boolean;
  listCourses(credential: GoogleCredential): Promise<ClassroomCourseListResult>;
  ensureCourse(
    credential: GoogleCredential,
    input: ClassroomCourseInput,
  ): Promise<ClassroomCourseReference>;
  listStudents(
    credential: GoogleCredential,
    courseId: string,
  ): Promise<ClassroomStudentListResult>;
}

export class FixtureClassroomAdapter implements ClassroomAdapter {
  readonly isFixture = true;

  constructor(private readonly courses: ClassroomCourse[] = []) {}

  async listCourses(
    credential: GoogleCredential,
  ): Promise<ClassroomCourseListResult> {
    return { courses: this.courses, credential };
  }

  async ensureCourse(
    credential: GoogleCredential,
    input: ClassroomCourseInput,
  ): Promise<ClassroomCourseReference> {
    return {
      googleClassroomId: `fixture-course-${input.localClassId}`,
      credential,
    };
  }

  async listStudents(
    credential: GoogleCredential,
    _courseId: string,
  ): Promise<ClassroomStudentListResult> {
    return { students: [], credential };
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

type GoogleStudent = {
  userId?: string;
  profile?: {
    name?: { fullName?: string };
    emailAddress?: string;
  };
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
            description: sanitizeCourseDescription(course.description),
            schoolYear: "A definir",
          })),
      );
      pageToken = page.nextPageToken;
    } while (pageToken);
    return { courses, credential: authorization.credential };
  }

  async ensureCourse(
    credential: GoogleCredential,
    input: ClassroomCourseInput,
  ): Promise<ClassroomCourseReference> {
    const authorization = await this.accessTokenProvider(credential);
    const marker = classMarker(input.localClassId);
    const existing = await this.findCourseByMarker(authorization.token, marker);
    if (existing)
      return {
        googleClassroomId: existing,
        credential: authorization.credential,
      };
    const created = await this.requestJson<{ id?: string }>(
      new URL("https://classroom.googleapis.com/v1/courses"),
      authorization.token,
      {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          description: [input.description?.trim(), marker]
            .filter(Boolean)
            .join("\n\n"),
          ownerId: "me",
          courseState: "PROVISIONED",
        }),
      },
    );
    if (!created.id) throw new ClassroomAdapterError("GOOGLE_RESPONSE_INVALID");
    await this.requestJson(
      new URL(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(created.id)}?updateMask=courseState`,
      ),
      authorization.token,
      { method: "PATCH", body: JSON.stringify({ courseState: "ACTIVE" }) },
    );
    return {
      googleClassroomId: created.id,
      credential: authorization.credential,
    };
  }

  async listStudents(
    credential: GoogleCredential,
    courseId: string,
  ): Promise<ClassroomStudentListResult> {
    const authorization = await this.accessTokenProvider(credential);
    const students: ClassroomStudent[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/students`,
      );
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await this.requestJson<{
        students?: GoogleStudent[];
        nextPageToken?: string;
      }>(url, authorization.token);
      students.push(
        ...(page.students ?? [])
          .map((student) => ({
            googleSubject: student.userId?.trim() ?? "",
            name: student.profile?.name?.fullName?.trim() ?? "",
            email: student.profile?.emailAddress?.trim().toLowerCase() ?? "",
          }))
          .filter((student) =>
            Boolean(student.googleSubject && student.name && student.email),
          ),
      );
      pageToken = page.nextPageToken;
    } while (pageToken);
    return { students, credential: authorization.credential };
  }

  private async findCourseByMarker(
    token: string,
    marker: string,
  ): Promise<string | null> {
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
      }>(url, token);
      const match = page.courses?.find((course) =>
        course.description?.includes(marker),
      );
      if (match?.id) return match.id;
      pageToken = page.nextPageToken;
    } while (pageToken);
    return null;
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

  private async requestJson<T>(
    url: URL,
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
          ...init.headers,
        },
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

function classMarker(localClassId: string): string {
  return `[EDUCAI-CLASS:${localClassId}]`;
}

function sanitizeCourseDescription(value?: string): string | null {
  const sanitized = value
    ?.replace(/\s*\[EDUCAI-CLASS:[^\]]+\]\s*/g, " ")
    .trim();
  return sanitized || null;
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
