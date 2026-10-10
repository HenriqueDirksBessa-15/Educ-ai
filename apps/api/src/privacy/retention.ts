import type { DatabaseClient } from "../database.js";

export class RetentionService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly retentionDays: number,
  ) {}

  async run(): Promise<{
    sessions: number;
    oauthStates: number;
    credentials: number;
    integrationStatuses: number;
  }> {
    const result = (await this.database.query(
      `WITH sessions AS (
         DELETE FROM auth_session
         WHERE expires_at < now() OR revoked_at < now() - ($1 * interval '1 day')
         RETURNING id
       ), states AS (
         DELETE FROM oauth_authorization_state
         WHERE expires_at < now() - interval '1 day' OR consumed_at < now() - interval '1 day'
         RETURNING state_hash
       ), credentials AS (
         DELETE FROM google_oauth_credential
         WHERE revoked_at < now() - ($1 * interval '1 day')
         RETURNING professor_id
       ), statuses AS (
         DELETE FROM integration_status
         WHERE checked_at < now() - ($1 * interval '1 day')
         RETURNING id
       )
       SELECT (SELECT count(*)::int FROM sessions) AS sessions,
              (SELECT count(*)::int FROM states) AS oauth_states,
              (SELECT count(*)::int FROM credentials) AS credentials,
              (SELECT count(*)::int FROM statuses) AS integration_statuses`,
      [this.retentionDays],
    )) as {
      rows: Array<{
        sessions: number;
        oauth_states: number;
        credentials: number;
        integration_statuses: number;
      }>;
    };
    const row = result.rows[0]!;
    return {
      sessions: row.sessions,
      oauthStates: row.oauth_states,
      credentials: row.credentials,
      integrationStatuses: row.integration_statuses,
    };
  }
}
