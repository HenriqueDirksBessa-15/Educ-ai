import type {
  Identity,
  IntegrationService,
  IntegrationStatus,
} from "@educai/contracts";

export type GoogleProfile = {
  subject: string;
  email: string;
  displayName: string;
  profileImageUrl?: string;
};

export type GoogleCredential = {
  accessToken?: string;
  refreshToken?: string;
  expiryDate?: Date;
  scopes: string[];
  tokenType?: string;
};

export type GoogleAuthorizationResult = {
  profile: GoogleProfile;
  credential: GoogleCredential;
};

export interface GoogleGateway {
  readonly configured: boolean;
  createAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
  }): string;
  exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleAuthorizationResult>;
  probe(
    service: IntegrationService,
    credential: GoogleCredential,
  ): Promise<Partial<GoogleCredential>>;
  revoke(token: string): Promise<void>;
}

export type AuthenticatedSession = {
  token: string;
  identity: Identity;
  expiresAt: Date;
};

export type IntegrationStatusRecord = IntegrationStatus & {
  professorId: string | null;
  attemptNumber: number;
};
