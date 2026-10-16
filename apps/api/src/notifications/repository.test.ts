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
    expect(String(database.query.mock.calls[0]![0])).toContain(
      "ON CONFLICT (notification_id, revision, channel, recipient_key)",
    );
    expect(String(database.query.mock.calls[1]![0])).toContain(
      "google_classroom_id",
    );
    expect(String(database.query.mock.calls[2]![0])).toContain(
      "NOTIFICATION_RECIPIENT_MISSING",
    );
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
    expect(values).toEqual([5, 300]);
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
