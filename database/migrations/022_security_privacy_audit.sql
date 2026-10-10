CREATE TYPE privacy_request_type AS ENUM ('export', 'deletion');
CREATE TYPE privacy_request_status AS ENUM ('completed', 'failed');

CREATE TABLE privacy_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professor_id uuid REFERENCES professor(id) ON DELETE SET NULL,
  type privacy_request_type NOT NULL,
  status privacy_request_status NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code varchar(120),
  CONSTRAINT privacy_request_result CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE TABLE audit_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  professor_id uuid REFERENCES professor(id) ON DELETE SET NULL,
  request_id varchar(100) NOT NULL,
  method varchar(10) NOT NULL,
  route text NOT NULL,
  status_code smallint NOT NULL,
  resource_type varchar(80) NOT NULL,
  action varchar(80) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_event_status_valid CHECK (status_code BETWEEN 100 AND 599),
  CONSTRAINT audit_event_method_not_blank CHECK (btrim(method) <> ''),
  CONSTRAINT audit_event_route_not_blank CHECK (btrim(route) <> '')
);

CREATE INDEX audit_event_professor_created_idx
  ON audit_event (professor_id, created_at DESC);
CREATE INDEX audit_event_resource_created_idx
  ON audit_event (resource_type, created_at DESC);
CREATE INDEX privacy_request_professor_idx
  ON privacy_request (professor_id, requested_at DESC);

CREATE FUNCTION protect_audit_event()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit event is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_immutable
BEFORE UPDATE OR DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION protect_audit_event();

CREATE FUNCTION protect_privacy_request()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'privacy request is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER privacy_request_immutable
BEFORE UPDATE OR DELETE ON privacy_request
FOR EACH ROW EXECUTE FUNCTION protect_privacy_request();
