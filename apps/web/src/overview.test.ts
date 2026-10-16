import { afterEach, describe, expect, it, vi } from "vitest";

import { loadOverview } from "./overview.js";

afterEach(() => vi.unstubAllGlobals());

const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) });

function mockApi(routes: Record<string, unknown>, failing: string[] = []) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = url.replace(/^\/api/, "");
    if (failing.includes(path)) return { ok: false, json: async () => null };
    return ok(path in routes ? routes[path] : []);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const requested = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map(([url]) => String(url));

const activity = (id: string, status: string, responseCount: number) => ({
  id,
  title: id,
  status,
  responseCount,
});

describe("home overview loader", () => {
  it("fetches corrections only for sent or finished activities with answers", async () => {
    const fetchMock = mockApi({
      "/activities": [
        activity("sent", "published", 3),
        activity("closed", "finished", 1),
        activity("empty", "published", 0),
        activity("draft", "draft", 5),
      ],
      "/activities/sent/collection": { activityId: "sent", submissions: [] },
      "/activities/closed/collection": null,
    });

    const overview = await loadOverview();

    const collectionCalls = requested(fetchMock).filter((url) =>
      url.endsWith("/collection"),
    );
    expect(collectionCalls).toEqual([
      "/api/activities/sent/collection",
      "/api/activities/closed/collection",
    ]);
    expect(overview.collections.map((item) => item.activityId)).toEqual([
      "sent",
    ]);
  });

  it("marks classes with and without a defined subject", async () => {
    mockApi({
      "/classes": [
        { id: "a", name: "7º B" },
        { id: "b", name: "8º A" },
        { id: "c", name: "9º C" },
      ],
      "/classes/a": { curriculum: { curricularComponents: ["Matemática"] } },
      "/classes/b": { curriculum: null },
      "/classes/c": { curriculum: { curricularComponents: [] } },
    });

    const overview = await loadOverview();

    expect(overview.classes).toEqual([
      { id: "a", name: "7º B", hasSubject: true },
      { id: "b", name: "8º A", hasSubject: false },
      { id: "c", name: "9º C", hasSubject: false },
    ]);
  });

  it("limits the extra requests per visit", async () => {
    const fetchMock = mockApi({
      "/activities": Array.from({ length: 25 }, (_, index) =>
        activity(`a${index}`, "published", 1),
      ),
      "/classes": Array.from({ length: 35 }, (_, index) => ({
        id: `c${index}`,
        name: `Turma ${index}`,
      })),
    });

    const overview = await loadOverview();

    const urls = requested(fetchMock);
    expect(urls.filter((url) => url.endsWith("/collection"))).toHaveLength(20);
    expect(urls.filter((url) => /\/classes\/c\d+$/.test(url))).toHaveLength(30);
    expect(overview.classes).toHaveLength(30);
  });

  it("rejects instead of returning partial data when a request fails", async () => {
    mockApi({ "/activities": [activity("sent", "published", 1)] }, [
      "/activities/sent/collection",
    ]);
    await expect(loadOverview()).rejects.toThrow();

    mockApi({}, ["/bulletins"]);
    await expect(loadOverview()).rejects.toThrow();
  });

  it("sends only credentials, never a professor identifier", async () => {
    const fetchMock = mockApi({});
    await loadOverview();
    for (const [, init] of fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >)
      expect(init).toEqual({ credentials: "include" });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("professorId");
  });
});
