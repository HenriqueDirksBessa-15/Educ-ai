import { OAuth2Client } from "google-auth-library";

import type { AppConfig } from "../config.js";
import type { GoogleCredential } from "../auth/types.js";

export type ClassroomAnnouncementInput = {
  deliveryId: string;
  courseId: string;
  title: string;
  content: string;
  links: Array<{ label: string; url: string }>;
};

export type ClassroomAnnouncementResult = {
  announcementId: string;
  credential: Partial<GoogleCredential>;
};

export interface ClassroomAnnouncementSender {
  readonly isFixture: boolean;
  ensureAnnouncement(
    credential: GoogleCredential,
    input: ClassroomAnnouncementInput,
  ): Promise<ClassroomAnnouncementResult>;
}

export class FixtureClassroomAnnouncementSender
  implements ClassroomAnnouncementSender
{
  readonly isFixture = true;

  async ensureAnnouncement(
    credential: GoogleCredential,
    input: ClassroomAnnouncementInput,
  ): Promise<ClassroomAnnouncementResult> {
    return {
      announcementId: `fixture-announcement-${input.deliveryId}`,
      credential,
    };
  }
}

export class ClassroomAnnouncementError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ClassroomAnnouncementError";
  }
}

type AccessTokenProvider = (credential: GoogleCredential) => Promise<{
  token: string;
  credential: Partial<GoogleCredential>;
}>;

export class ProductionClassroomAnnouncementSender
  implements ClassroomAnnouncementSender
{
  readonly isFixture = false;

  constructor(
    private readonly config: AppConfig["google"],
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly accessTokenProvider: AccessTokenProvider = (credential) =>
      this.refreshAccessToken(credential),
  ) {}

  async ensureAnnouncement(
    credential: GoogleCredential,
    input: ClassroomAnnouncementInput,
  ): Promise<ClassroomAnnouncementResult> {
    const authorization = await this.accessTokenProvider(credential);
    const marker = `[EDUCAI-NOTIFICATION:${input.deliveryId}]`;
    const existing = await this.findByMarker(
      authorization.token,
      input.courseId,
      marker,
    );
    if (existing)
      return {
        announcementId: existing,
        credential: authorization.credential,
      };
    const created = await this.requestJson<{ id?: string }>(
      `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(input.courseId)}/announcements`,
      authorization.token,
      {
        method: "POST",
        body: JSON.stringify({
          text: `${input.title}\n\n${input.content}\n\n${marker}`,
          state: "PUBLISHED",
          materials: input.links.slice(0, 20).map((link) => ({
            link: { url: link.url, title: link.label },
          })),
        }),
      },
    );
    if (!created.id)
      throw new ClassroomAnnouncementError("GOOGLE_RESPONSE_INVALID");
    return {
      announcementId: created.id,
      credential: authorization.credential,
    };
  }

  private async findByMarker(
    token: string,
    courseId: string,
    marker: string,
  ): Promise<string | null> {
    let pageToken: string | undefined;
    do {
      const url = new URL(
        `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/announcements`,
      );
      url.searchParams.set("announcementStates", "PUBLISHED");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await this.requestJson<{
        announcements?: Array<{ id?: string; text?: string }>;
        nextPageToken?: string;
      }>(url.toString(), token);
      const match = page.announcements?.find((item) =>
        item.text?.includes(marker),
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
      throw new ClassroomAnnouncementError("GOOGLE_NOT_CONFIGURED");
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
      throw new ClassroomAnnouncementError("GOOGLE_CREDENTIAL_INVALID");
    }
  }

  private async requestJson<T>(
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
          ...init.headers,
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new ClassroomAnnouncementError("GOOGLE_SERVICE_UNAVAILABLE");
    }
    if (!response.ok)
      throw new ClassroomAnnouncementError(normalizeStatus(response.status));
    return (await response.json()) as T;
  }
}

function normalizeStatus(status: number): string {
  if (status === 401) return "GOOGLE_CREDENTIAL_INVALID";
  if (status === 403) return "GOOGLE_PERMISSION_DENIED";
  if (status === 404) return "GOOGLE_RESOURCE_NOT_FOUND";
  if (status === 429) return "GOOGLE_RATE_LIMITED";
  return status >= 500
    ? "GOOGLE_SERVICE_UNAVAILABLE"
    : "GOOGLE_INVALID_REQUEST";
}
