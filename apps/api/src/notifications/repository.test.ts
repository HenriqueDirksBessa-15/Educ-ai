import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../database.js";
import { NotificationRepository } from "./repository.js";

describe("notification delivery repository", () => {
  it("materializes email and Classroom recipients idempotently", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = new NotificationRepository(
      database as unknown as DatabaseClient,
    );

    await repository.prepareDeliveries();

    expect(database.query).toHaveBeenCalledTimes(3);
    const emailSql = String(database.query.mock.calls[0]![0]);
    expect(emailSql).toContain(
      "ON CONFLICT (notification_id, revision, channel, recipient_key)",
    );
    expect(emailSql.match(/'email'::notification_channel/g)).toHaveLength(2);
    expect(String(database.query.mock.calls[1]![0])).toContain(
      "google_classroom_id",
    );
    expect(String(database.query.mock.calls[2]![0])).toContain(
      "NOTIFICATION_RECIPIENT_MISSING",
    );
  });

  it("expires stale notifications that could still be sent", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ expired: 2 }] }),
    };
    const repository = new NotificationRepository(
      database as unknown as DatabaseClient,
    );

    await expect(repository.expireStale(7, 5)).resolves.toBe(2);
    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("error_code = 'EXPIRED'");
    expect(sql).toContain("created_at < now() - ($1 * interval '1 day')");
    expect(sql).toContain("delivery.attempt_count < $2");
    expect(sql).toContain("last_error_code = 'EXPIRED'");
    expect(values).toEqual([7, 5]);
  });

  it("never requeues expired or cancelled notifications", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = new NotificationRepository(
      database as unknown as DatabaseClient,
    );

    await repository.prepareDeliveries();
    await repository.claimNext(5, 300);
    const statements = database.query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toHaveLength(4);
    for (const sql of statements)
      expect(sql).toContain("NOT IN ('EXPIRED', 'CANCELLED_BEFORE_DEPLOY')");
  });

  it("claims due work with a lease and bounded attempts", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = new NotificationRepository(
      database as unknown as DatabaseClient,
    );

    await expect(repository.claimNext(5, 300)).resolves.toBeNull();
    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("FOR UPDATE OF delivery SKIP LOCKED");
    expect(sql).toContain("lease_expires_at");
    expect(sql).toContain(
      "NOT (delivery.channel = ANY($3::notification_channel[]))",
    );
    expect(values).toEqual([5, 300, []]);
  });

  it("returns a delivery of a disabled channel to the queue without spending an attempt", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = new NotificationRepository(
      database as unknown as DatabaseClient,
    );

    await repository.skip(
      "delivery-1",
      "notification-1",
      2,
      "EMAIL_PROVIDER_NOT_CONFIGURED",
    );
    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("attempt_count = greatest(attempt_count - 1, 0)");
    expect(values).toEqual([
      "delivery-1",
      "notification-1",
      2,
      "EMAIL_PROVIDER_NOT_CONFIGURED",
    ]);
  });

  it("switches a failed global Classroom intent to email fallback", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = new NotificationRepository(
      database as unknown as DatabaseClient,
    );

    await repository.fallbackToEmail("notification-1", 2, "GOOGLE_FAILED");
    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("channel = 'email'");
    expect(values).toEqual(["notification-1", 2, "GOOGLE_FAILED"]);
  });
});
