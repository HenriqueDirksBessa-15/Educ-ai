import type { Identity, IntegrationService } from "@educai/contracts";

import type { DatabaseClient } from "../database.js";
import { createOpaqueToken, hashToken } from "./crypto.js";
import type { TokenCipher } from "./crypto.js";
import type {
  GoogleCredential,
  GoogleProfile,
  IntegrationStatusRecord,
} from "./types.js";

type QueryResult<Row> = { rows: Row[]; rowCount: number | null };

type ProfessorRow = {
  id: string;
  email: string;
  display_name: string;
};

type CredentialRow = {
  professor_id: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  expiry_date: Date | null;
  scopes: string[];
  token_type: string | null;
};

export class AuthRepository {
  constructor(
    private readonly database: DatabaseClient,
    private readonly cipher: TokenCipher,
    private readonly sessionTtlSeconds: number,
  ) {}

  async createAuthorizationState(): Promise<{
    state: string;
    codeVerifier: string;
  }> {
    const state = createOpaqueToken();
    const codeVerifier = createOpaqueToken(48);
    await this.database.query(
      `INSERT INTO oauth_authorization_state (state_hash, code_verifier, expires_at)
       VALUES ($1, $2, now() + interval '10 minutes')`,
      [hashToken(state), codeVerifier],
    );
    return { state, codeVerifier };
  }

  async consumeAuthorizationState(state: string): Promise<string | null> {
    const result = (await this.database.query(
      `UPDATE oauth_authorization_state
       SET consumed_at = now()
       WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > now()
       RETURNING code_verifier`,
      [hashToken(state)],
    )) as QueryResult<{ code_verifier: string }>;
    return result.rows[0]?.code_verifier ?? null;
  }

  async upsertProfessor(profile: GoogleProfile): Promise<Identity> {
    const existing = (await this.database.query(
      `SELECT id, email::text, display_name
       FROM professor WHERE google_subject = $1`,
      [profile.subject],
    )) as QueryResult<ProfessorRow>;

    const result = existing.rows[0]
      ? ((await this.database.query(
          `UPDATE professor
           SET email = $2, display_name = $3, profile_image_url = $4
           WHERE id = $1
           RETURNING id, email::text, display_name`,
          [
            existing.rows[0].id,
            profile.email,
            profile.displayName,
            profile.profileImageUrl ?? null,
          ],
        )) as QueryResult<ProfessorRow>)
      : ((await this.database.query(
          `INSERT INTO professor (
             google_subject, email, display_name, profile_image_url
           ) VALUES ($1, $2, $3, $4)
           ON CONFLICT (email) DO UPDATE SET
             google_subject = EXCLUDED.google_subject,
             display_name = EXCLUDED.display_name,
             profile_image_url = EXCLUDED.profile_image_url
           RETURNING id, email::text, display_name`,
          [
            profile.subject,
            profile.email,
            profile.displayName,
            profile.profileImageUrl ?? null,
          ],
        )) as QueryResult<ProfessorRow>);

    const professor = result.rows[0];
    if (!professor) throw new Error("Falha ao persistir professor Google.");
    return {
      professorId: professor.id,
      email: professor.email,
      displayName: professor.display_name,
      provider: "google",
    };
  }

  async saveCredential(
    professorId: string,
    credential: Partial<GoogleCredential>,
  ): Promise<void> {
    const accessToken = credential.accessToken
      ? this.cipher.encrypt(credential.accessToken)
      : null;
    const refreshToken = credential.refreshToken
      ? this.cipher.encrypt(credential.refreshToken)
      : null;
    await this.database.query(
      `INSERT INTO google_oauth_credential (
         professor_id, access_token_ciphertext, refresh_token_ciphertext,
         expiry_date, scopes, token_type
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (professor_id) DO UPDATE SET
         access_token_ciphertext = COALESCE(EXCLUDED.access_token_ciphertext, google_oauth_credential.access_token_ciphertext),
         refresh_token_ciphertext = COALESCE(EXCLUDED.refresh_token_ciphertext, google_oauth_credential.refresh_token_ciphertext),
         expiry_date = COALESCE(EXCLUDED.expiry_date, google_oauth_credential.expiry_date),
         scopes = CASE WHEN cardinality(EXCLUDED.scopes) > 0 THEN EXCLUDED.scopes ELSE google_oauth_credential.scopes END,
         token_type = COALESCE(EXCLUDED.token_type, google_oauth_credential.token_type),
         revoked_at = NULL`,
      [
        professorId,
        accessToken,
        refreshToken,
        credential.expiryDate ?? null,
        credential.scopes ?? [],
        credential.tokenType ?? null,
      ],
    );
  }

  async getCredential(professorId: string): Promise<GoogleCredential | null> {
    const result = (await this.database.query(
      `SELECT professor_id, access_token_ciphertext, refresh_token_ciphertext,
              expiry_date, scopes, token_type
       FROM google_oauth_credential
       WHERE professor_id = $1 AND revoked_at IS NULL`,
      [professorId],
    )) as QueryResult<CredentialRow>;
    return result.rows[0] ? this.mapCredential(result.rows[0]) : null;
  }

  async getLatestCredential(): Promise<{
    professorId: string;
    credential: GoogleCredential;
  } | null> {
    const result = (await this.database.query(
      `SELECT professor_id, access_token_ciphertext, refresh_token_ciphertext,
              expiry_date, scopes, token_type
       FROM google_oauth_credential
       WHERE revoked_at IS NULL
       ORDER BY updated_at DESC LIMIT 1`,
    )) as QueryResult<CredentialRow>;
    const row = result.rows[0];
    return row
      ? { professorId: row.professor_id, credential: this.mapCredential(row) }
      : null;
  }

  async createSession(identity: Identity): Promise<{
    token: string;
    expiresAt: Date;
  }> {
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.sessionTtlSeconds * 1_000);
    await this.database.query(
      `INSERT INTO auth_session (professor_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [identity.professorId, hashToken(token), expiresAt],
    );
    return { token, expiresAt };
  }

  async resolveSession(token: string): Promise<Identity | null> {
    const result = (await this.database.query(
      `UPDATE auth_session session
       SET last_seen_at = now()
       FROM professor
       WHERE session.token_hash = $1
         AND session.professor_id = professor.id
         AND session.revoked_at IS NULL
         AND session.expires_at > now()
       RETURNING professor.id, professor.email::text, professor.display_name`,
      [hashToken(token)],
    )) as QueryResult<ProfessorRow>;
    const professor = result.rows[0];
    return professor
      ? {
          professorId: professor.id,
          email: professor.email,
          displayName: professor.display_name,
          provider: "google",
        }
      : null;
  }

  async revokeSession(token: string): Promise<void> {
    await this.database.query(
      `UPDATE auth_session SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(token)],
    );
  }

  async revokeProfessorAccess(professorId: string): Promise<void> {
    await this.database.query(
      `UPDATE auth_session SET revoked_at = now()
       WHERE professor_id = $1 AND revoked_at IS NULL`,
      [professorId],
    );
    await this.database.query(
      `UPDATE google_oauth_credential SET revoked_at = now()
       WHERE professor_id = $1 AND revoked_at IS NULL`,
      [professorId],
    );
  }

  async recordIntegrationStatus(input: {
    service: IntegrationService;
    status: "active" | "inactive";
    professorId: string | null;
    attemptNumber: number;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO integration_status (
         service, status, professor_id, attempt_number, error_code, error_message
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.service,
        input.status,
        input.professorId,
        input.attemptNumber,
        input.errorCode ?? null,
        input.errorMessage ?? null,
      ],
    );
  }

  async latestIntegrationStatuses(): Promise<IntegrationStatusRecord[]> {
    const result = (await this.database.query(
      `SELECT DISTINCT ON (service)
         service, status, checked_at, error_code, professor_id, attempt_number
       FROM integration_status
       WHERE service IN ('google_oauth', 'google_classroom', 'google_forms', 'openai')
       ORDER BY service, checked_at DESC, id DESC`,
    )) as QueryResult<{
      service: IntegrationStatusRecord["service"];
      status: IntegrationStatusRecord["status"];
      checked_at: Date;
      error_code: string | null;
      professor_id: string | null;
      attempt_number: number;
    }>;
    return result.rows.map((row) => ({
      service: row.service,
      status: row.status,
      checkedAt: row.checked_at.toISOString(),
      errorCode: row.error_code,
      professorId: row.professor_id,
      attemptNumber: row.attempt_number,
    }));
  }

  private mapCredential(row: CredentialRow): GoogleCredential {
    return {
      accessToken: row.access_token_ciphertext
        ? this.cipher.decrypt(row.access_token_ciphertext)
        : undefined,
      refreshToken: row.refresh_token_ciphertext
        ? this.cipher.decrypt(row.refresh_token_ciphertext)
        : undefined,
      expiryDate: row.expiry_date ?? undefined,
      scopes: row.scopes,
      tokenType: row.token_type ?? undefined,
    };
  }
}
