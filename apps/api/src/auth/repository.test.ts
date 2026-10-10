import { describe, expect, it, vi } from "vitest";

import type { DatabaseClient } from "../database.js";
import { TokenCipher } from "./crypto.js";
import { AuthRepository } from "./repository.js";

describe("authentication repository isolation", () => {
  it("returns Google status for the professor and global OpenAI status", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const repository = new AuthRepository(
      database as unknown as DatabaseClient,
      new TokenCipher("11".repeat(32)),
      3_600,
    );

    await repository.latestIntegrationStatuses(
      "5d73ea1d-9ab8-4384-960e-3a6f00e6328a",
    );

    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("professor_id = $1"),
      ["5d73ea1d-9ab8-4384-960e-3a6f00e6328a"],
    );
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("service = 'openai' AND professor_id IS NULL"),
      expect.any(Array),
    );
  });
});
