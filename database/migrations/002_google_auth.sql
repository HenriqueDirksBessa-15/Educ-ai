CREATE TABLE google_oauth_credential (
  professor_id uuid PRIMARY KEY REFERENCES professor(id) ON DELETE CASCADE,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  expiry_date timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  token_type varchar(30),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_oauth_credential_has_token CHECK (
    access_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL
  )
);

CREATE TABLE auth_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid NOT NULL REFERENCES professor(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_session_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE TABLE oauth_authorization_state (
  state_hash bytea PRIMARY KEY,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_state_verifier_not_blank CHECK (btrim(code_verifier) <> ''),
  CONSTRAINT oauth_state_expiry_after_creation CHECK (expires_at > created_at)
);

ALTER TABLE integration_status
  ADD COLUMN professor_id uuid REFERENCES professor(id) ON DELETE SET NULL,
  ADD COLUMN attempt_number smallint NOT NULL DEFAULT 1,
  ADD CONSTRAINT integration_status_attempt_range
    CHECK (attempt_number BETWEEN 1 AND 4);

CREATE INDEX auth_session_active_lookup_idx
  ON auth_session (token_hash, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_session_professor_idx ON auth_session (professor_id, expires_at DESC);
CREATE INDEX oauth_authorization_state_expiry_idx
  ON oauth_authorization_state (expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX integration_status_professor_latest_idx
  ON integration_status (professor_id, service, checked_at DESC, id DESC);

CREATE TRIGGER google_oauth_credential_set_updated_at
BEFORE UPDATE ON google_oauth_credential
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
