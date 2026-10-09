import {
  CodeChallengeMethod,
  OAuth2Client,
  type Credentials,
} from "google-auth-library";

import type { AppConfig } from "../config.js";
import type { GoogleCredential, GoogleGateway } from "./types.js";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.students",
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

export const GOOGLE_PUBLISHING_SCOPES = GOOGLE_SCOPES.slice(3);

export class GoogleGatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleGatewayError";
  }
}

export class ProductionGoogleGateway implements GoogleGateway {
  readonly configured: boolean;

  constructor(private readonly config: AppConfig["google"]) {
    this.configured = Boolean(config.clientId && config.clientSecret);
  }

  createAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
  }): string {
    const client = this.createClient();
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
  }

  async exchangeCode(code: string, codeVerifier: string) {
    const client = this.createClient();
    const { tokens } = await client.getToken({ code, codeVerifier });
    if (!tokens.id_token) {
      throw new GoogleGatewayError(
        "GOOGLE_ID_TOKEN_MISSING",
        "O Google não retornou a identidade esperada.",
      );
    }
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.clientId,
    });
    const payload = ticket.getPayload();
    if (
      !payload?.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      !payload.name
    ) {
      throw new GoogleGatewayError(
        "GOOGLE_PROFILE_INVALID",
        "A conta Google precisa fornecer nome e e-mail verificado.",
      );
    }
    return {
      profile: {
        subject: payload.sub,
        email: payload.email,
        displayName: payload.name,
        profileImageUrl: payload.picture,
      },
      credential: mapCredentials(tokens),
    };
  }

  async probe(
    service: "google_oauth" | "google_classroom" | "google_forms",
    credential: GoogleCredential,
  ): Promise<Partial<GoogleCredential>> {
    const client = this.createClient();
    client.setCredentials({
      access_token: credential.accessToken,
      refresh_token: credential.refreshToken,
      expiry_date: credential.expiryDate?.getTime(),
      scope: credential.scopes.join(" "),
      token_type: credential.tokenType,
    });
    let refreshed: Credentials = {};
    client.on("tokens", (tokens) => {
      refreshed = { ...refreshed, ...tokens };
    });

    const url = this.probeUrl(service);
    await client.request({ url, method: "GET" });
    return mapCredentials(refreshed);
  }

  async revoke(token: string): Promise<void> {
    await this.createClient().revokeToken(token);
  }

  private createClient(): OAuth2Client {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new GoogleGatewayError(
        "GOOGLE_CREDENTIALS_MISSING",
        "Credenciais Google não configuradas.",
      );
    }
    return new OAuth2Client({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: this.config.redirectUri,
    });
  }

  private probeUrl(
    service: "google_oauth" | "google_classroom" | "google_forms",
  ): string {
    if (service === "google_oauth") {
      return "https://openidconnect.googleapis.com/v1/userinfo";
    }
    if (service === "google_classroom") {
      return "https://classroom.googleapis.com/v1/courses?pageSize=1";
    }
    if (!this.config.formsTestFormId) {
      throw new GoogleGatewayError(
        "GOOGLE_FORMS_TEST_FORM_MISSING",
        "Formulário de teste não configurado.",
      );
    }
    return `https://forms.googleapis.com/v1/forms/${encodeURIComponent(this.config.formsTestFormId)}`;
  }
}

function mapCredentials(credentials: Credentials): GoogleCredential {
  return {
    accessToken: credentials.access_token ?? undefined,
    refreshToken: credentials.refresh_token ?? undefined,
    expiryDate: credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : undefined,
    scopes: credentials.scope?.split(" ").filter(Boolean) ?? [],
    tokenType: credentials.token_type ?? undefined,
  };
}
