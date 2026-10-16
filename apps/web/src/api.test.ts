import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, json, request } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

describe("API helper", () => {
  it("sends the session cookie and returns the data envelope", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: { id: "a1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/activities/a1")).resolves.toEqual({ id: "a1" });
    expect(fetchMock).toHaveBeenCalledWith("/api/activities/a1", {
      credentials: "include",
    });
  });

  it("turns API errors into teacher-facing messages and keeps the code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code: "GOOGLE_RATE_LIMITED", message: "raw" } },
          { status: 503 },
        ),
      ),
    );

    const error = await request("/x").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("GOOGLE_RATE_LIMITED");
    expect((error as ApiError).message).toMatch(/O Google está ocupado/);
    expect((error as ApiError).message).not.toContain("raw");
  });

  it("uses a generic message when the response has no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oops", { status: 500 })),
    );
    await expect(request("/x")).rejects.toThrow(/Algo deu errado/);
  });

  it("builds JSON requests", () => {
    expect(json("PATCH", { title: "A" })).toEqual({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: '{"title":"A"}',
    });
  });
});
