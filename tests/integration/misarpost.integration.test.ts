/**
 * Live integration tests for the TypeScript SDK against the real API.
 * Skipped unless INTEGRATION=1 and INTEGRATION_API_KEY=mpk_… are set; never run
 * in CI by default. Read-only except where noted, so they are safe against a
 * production key.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { MisarPostClient, MisarPostError } from "../../typescript/src/index.js";

const SKIP = !process.env.INTEGRATION;

describe.skipIf(SKIP)("MisarPost integration", () => {
  let client: MisarPostClient;

  beforeAll(() => {
    const key = process.env.INTEGRATION_API_KEY;
    if (!key) throw new Error("INTEGRATION_API_KEY required");
    client = new MisarPostClient(key, { baseURL: process.env.INTEGRATION_BASE_URL });
  });

  it("an invalid key returns 401 invalid_api_key", async () => {
    const bad = new MisarPostClient("mpk_invalid_invalid_invalid");
    await expect(bad.posts.list()).rejects.toMatchObject({ status: 401 });
  });

  it("lists connected accounts", async () => {
    const res = await client.connections.list<{ accounts?: unknown[] }>();
    expect(res).toBeTypeOf("object");
  });

  it("lists posts with pagination fields", async () => {
    const res = await client.posts.list<{ posts: unknown[]; totalPages: number }>({ page: 1 });
    expect(Array.isArray(res.posts)).toBe(true);
    expect(typeof res.totalPages).toBe("number");
  });

  it("reads stats and drafts", async () => {
    await expect(client.analytics.stats()).resolves.toBeTypeOf("object");
    await expect(client.drafts.list()).resolves.toBeTypeOf("object");
  });

  it("a scope the key lacks answers 403 insufficient_scope (narrow keys only)", async () => {
    if (!process.env.INTEGRATION_NARROW_KEY) return;
    const narrow = new MisarPostClient(process.env.INTEGRATION_NARROW_KEY);
    const err = await narrow.webhooks.listOutbound().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MisarPostError);
    expect((err as MisarPostError).code).toBe("insufficient_scope");
  });
});
