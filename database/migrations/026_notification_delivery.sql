ALTER TABLE notification_outbox
  ADD COLUMN revision integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT notification_outbox_revision_positive CHECK (revision > 0);

-- Individual pedagogical feedback must never become a course-wide announcement.
UPDATE notification_outbox
SET channel = 'email'
WHERE recipient_kind = 'student' AND channel = 'google_classroom';

CREATE TABLE notification_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notification_outbox(id) ON DELETE RESTRICT,
  revision integer NOT NULL,
  channel notification_channel NOT NULL,
  recipient_key text NOT NULL,
  recipient_email citext,
  google_classroom_id text,
  status notification_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  last_error_code varchar(120),
  external_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_revision_positive CHECK (revision > 0),
  CONSTRAINT notification_delivery_attempt_nonnegative CHECK (attempt_count >= 0),
  CONSTRAINT notification_delivery_recipient_not_blank CHECK (btrim(recipient_key) <> ''),
  CONSTRAINT notification_delivery_target_shape CHECK (
    (channel = 'email' AND recipient_email IS NOT NULL AND google_classroom_id IS NULL)
    OR
    (channel = 'google_classroom' AND recipient_email IS NULL AND google_classroom_id IS NOT NULL)
  ),
  CONSTRAINT notification_delivery_unique
    UNIQUE (notification_id, revision, channel, recipient_key)
);

CREATE INDEX notification_delivery_claim_idx
  ON notification_delivery (status, available_at, lease_expires_at, created_at);

CREATE TRIGGER notification_delivery_set_updated_at
BEFORE UPDATE ON notification_delivery
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION protect_sent_notification_delivery()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'sent' THEN
    RAISE EXCEPTION 'sent notification delivery is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_delivery_sent_immutable
BEFORE UPDATE OR DELETE ON notification_delivery
FOR EACH ROW EXECUTE FUNCTION protect_sent_notification_delivery();
