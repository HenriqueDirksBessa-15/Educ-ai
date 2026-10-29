import type { DatabaseClient } from "../database.js";

type QueryResult<Row> = { rows: Row[]; rowCount?: number | null };

export type NotificationDeliveryLease = {
  deliveryId: string;
  notificationId: string;
  revision: number;
  attemptCount: number;
  professorId: string;
  feedbackId: string;
  channel: "email" | "google_classroom";
  recipientEmail: string | null;
  googleClassroomId: string | null;
  title: string;
  content: string;
  links: Array<{ label: string; url: string }>;
  materialLinks: Array<{ title: string; url: string }>;
};

export class NotificationRepository {
  constructor(private readonly database: DatabaseClient) {}

  async prepareDeliveries(): Promise<void> {
    await this.database.query(
      `INSERT INTO notification_delivery
         (notification_id, revision, channel, recipient_key, recipient_email)
       SELECT notification.id, notification.revision,
              'email'::notification_channel,
              lower(student.email::text), student.email
       FROM notification_outbox notification
       JOIN student ON student.id = notification.student_id
       WHERE notification.recipient_kind = 'student'
         AND notification.channel = 'email'
         AND notification.status IN ('pending', 'failed')
         AND NOT EXISTS (
           SELECT 1 FROM notification_delivery existing
           WHERE existing.notification_id = notification.id
             AND existing.revision = notification.revision
             AND existing.channel = 'email'
         )
       UNION ALL
       SELECT notification.id, notification.revision,
              'email'::notification_channel,
              lower(student.email::text), student.email
       FROM notification_outbox notification
       JOIN enrollment ON enrollment.class_group_id = notification.class_group_id
         AND enrollment.status = 'active'
       JOIN student ON student.id = enrollment.student_id
       WHERE notification.recipient_kind = 'class_group'
         AND notification.channel = 'email'
         AND notification.status IN ('pending', 'failed')
         AND NOT EXISTS (
           SELECT 1 FROM notification_delivery existing
           WHERE existing.notification_id = notification.id
             AND existing.revision = notification.revision
             AND existing.channel = 'email'
         )
       ON CONFLICT (notification_id, revision, channel, recipient_key) DO NOTHING`,
    );
    await this.database.query(
      `INSERT INTO notification_delivery
         (notification_id, revision, channel, recipient_key, google_classroom_id)
       SELECT notification.id, notification.revision, 'google_classroom',
              class_group.google_classroom_id, class_group.google_classroom_id
       FROM notification_outbox notification
       JOIN class_group ON class_group.id = notification.class_group_id
       WHERE notification.recipient_kind = 'class_group'
         AND notification.channel = 'google_classroom'
         AND notification.status IN ('pending', 'failed')
         AND class_group.google_classroom_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM notification_delivery existing
           WHERE existing.notification_id = notification.id
             AND existing.revision = notification.revision
             AND existing.channel = 'google_classroom'
         )
       ON CONFLICT (notification_id, revision, channel, recipient_key) DO NOTHING`,
    );
    await this.database.query(
      `UPDATE notification_outbox notification
       SET status = 'failed', error_code = 'NOTIFICATION_RECIPIENT_MISSING'
       WHERE notification.status IN ('pending', 'failed')
         AND NOT EXISTS (
           SELECT 1 FROM notification_delivery delivery
           WHERE delivery.notification_id = notification.id
             AND delivery.revision = notification.revision
             AND delivery.channel = notification.channel
         )`,
    );
  }

  async claimNext(
    maxAttempts: number,
    leaseSeconds: number,
    disabledChannels: NotificationDeliveryLease["channel"][] = [],
  ): Promise<NotificationDeliveryLease | null> {
    const result = (await this.database.query(
      `WITH candidate AS (
         SELECT delivery.id FROM notification_delivery delivery
         JOIN notification_outbox notification
           ON notification.id = delivery.notification_id
          AND notification.revision = delivery.revision
          AND notification.channel = delivery.channel
         WHERE delivery.attempt_count < $1 AND delivery.available_at <= now()
           AND NOT (delivery.channel = ANY($3::notification_channel[]))
           AND (delivery.status = 'failed' OR
             (delivery.status = 'pending' AND
              (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at < now())))
         ORDER BY delivery.available_at, delivery.created_at, delivery.id
         FOR UPDATE OF delivery SKIP LOCKED LIMIT 1
       ), claimed AS (
         UPDATE notification_delivery delivery
         SET status = 'pending', attempt_count = attempt_count + 1,
             lease_expires_at = now() + ($2 * interval '1 second'),
             last_error_code = NULL
         FROM candidate WHERE delivery.id = candidate.id RETURNING delivery.*
       )
       SELECT claimed.id AS delivery_id, claimed.notification_id,
              claimed.revision, claimed.attempt_count, claimed.channel,
              claimed.recipient_email::text, claimed.google_classroom_id,
              feedback.professor_id, feedback.id AS feedback_id,
              feedback.title, feedback.content,
              coalesce((SELECT jsonb_agg(jsonb_build_object(
                'label', link.label, 'url', link.url) ORDER BY link.position)
                FROM feedback_link link WHERE link.feedback_id = feedback.id),
                '[]'::jsonb) AS links,
              coalesce((SELECT jsonb_agg(jsonb_build_object(
                'title', material.title, 'url', material.url)
                ORDER BY material.title)
                FROM feedback_attachment attachment
                JOIN material ON material.id = attachment.material_id
                WHERE attachment.feedback_id = feedback.id
                  AND material.url IS NOT NULL), '[]'::jsonb) AS material_links
       FROM claimed
       JOIN notification_outbox notification ON notification.id = claimed.notification_id
       JOIN feedback ON feedback.id = notification.feedback_id`,
      [maxAttempts, leaseSeconds, disabledChannels],
    )) as QueryResult<Record<string, unknown>>;
    const row = result.rows[0];
    return row
      ? {
          deliveryId: String(row.delivery_id),
          notificationId: String(row.notification_id),
          revision: Number(row.revision),
          attemptCount: Number(row.attempt_count),
          professorId: String(row.professor_id),
          feedbackId: String(row.feedback_id),
          channel: row.channel as NotificationDeliveryLease["channel"],
          recipientEmail: row.recipient_email
            ? String(row.recipient_email)
            : null,
          googleClassroomId: row.google_classroom_id
            ? String(row.google_classroom_id)
            : null,
          title: String(row.title),
          content: String(row.content),
          links: row.links as NotificationDeliveryLease["links"],
          materialLinks:
            row.material_links as NotificationDeliveryLease["materialLinks"],
        }
      : null;
  }

  async complete(
    deliveryId: string,
    notificationId: string,
    revision: number,
    externalMessageId: string | null,
  ): Promise<void> {
    await this.database.query(
      `WITH completed AS (
         UPDATE notification_delivery SET status = 'sent', sent_at = now(),
           lease_expires_at = NULL, last_error_code = NULL, external_message_id = $4
         WHERE id = $1 AND notification_id = $2 AND revision = $3
           AND status = 'pending' RETURNING notification_id, revision
       )
       UPDATE notification_outbox notification
       SET status = 'sent', sent_at = now(), error_code = NULL
       FROM completed WHERE notification.id = completed.notification_id
         AND notification.revision = completed.revision
         AND NOT EXISTS (
           -- O CTE e esta subconsulta leem o mesmo snapshot: a entrega recém-concluída
           -- ainda aparece como 'pending' aqui, por isso fica fora da verificação.
           SELECT 1 FROM notification_delivery delivery
           WHERE delivery.notification_id = notification.id
             AND delivery.revision = notification.revision
             AND delivery.channel = notification.channel
             AND delivery.id <> $1
             AND delivery.status <> 'sent'
         )`,
      [deliveryId, notificationId, revision, externalMessageId],
    );
  }

  async fail(
    deliveryId: string,
    notificationId: string,
    revision: number,
    errorCode: string,
    retrySeconds: number,
    terminal: boolean,
  ): Promise<void> {
    await this.database.query(
      `WITH failed AS (
         UPDATE notification_delivery SET status = 'failed', lease_expires_at = NULL,
           last_error_code = $4, available_at = CASE WHEN $6 THEN available_at
             ELSE now() + ($5 * interval '1 second') END
         WHERE id = $1 AND notification_id = $2 AND revision = $3
           AND status = 'pending' RETURNING notification_id, revision
       )
       UPDATE notification_outbox notification
       SET status = 'failed', error_code = $4, sent_at = NULL
       FROM failed WHERE notification.id = failed.notification_id
         AND notification.revision = failed.revision`,
      [deliveryId, notificationId, revision, errorCode, retrySeconds, terminal],
    );
  }

  // Devolve a entrega à fila sem gastar tentativa: o canal está desativado,
  // não falhou. Ela segue pendente até o canal ser configurado.
  async skip(
    deliveryId: string,
    notificationId: string,
    revision: number,
    reasonCode: string,
  ): Promise<void> {
    await this.database.query(
      `WITH skipped AS (
         UPDATE notification_delivery SET status = 'pending', lease_expires_at = NULL,
           attempt_count = greatest(attempt_count - 1, 0), last_error_code = $4
         WHERE id = $1 AND notification_id = $2 AND revision = $3
           AND status = 'pending' RETURNING notification_id, revision
       )
       UPDATE notification_outbox notification SET error_code = $4
       FROM skipped WHERE notification.id = skipped.notification_id
         AND notification.revision = skipped.revision`,
      [deliveryId, notificationId, revision, reasonCode],
    );
  }

  async fallbackToEmail(
    notificationId: string,
    revision: number,
    errorCode: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE notification_outbox SET channel = 'email', status = 'pending',
         error_code = $3, sent_at = NULL
       WHERE id = $1 AND revision = $2 AND recipient_kind = 'class_group'
         AND channel = 'google_classroom'`,
      [notificationId, revision, errorCode],
    );
  }
}
