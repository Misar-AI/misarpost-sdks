/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  MisarPostClient,
  MisarPostError,
  MisarPostPlanLimitError,
  computeWebhookSignature,
  paginate,
  verifyWebhookSignature,
} from "../src/index.js";

type Call = { url: string; init: RequestInit };

function mockFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json", ...r.headers },
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const offer = {
  product: "post",
  product_name: "MisarPost",
  reason: "quota_exhausted",
  feature: "ai_text_actions",
  feature_label: "AI text actions",
  headline: "You've reached your Free plan's ai text actions limit (30/30 this month).",
  usage: { used: 30, limit: 30, remaining: 0, period: "month", resets_at: "2026-11-01T00:00:00.000Z" },
  current_plan: { slug: "free", name: "Free" },
  recommended_plan: "pro",
  plans: [],
  urls: { pricing: "https://post.misar.io/pricing", billing: "", docs: "", compare: "" },
  cta: "Upgrade to continue.",
};

describe("MisarPostClient", () => {
  it("requires an API key", () => {
    expect(() => new MisarPostClient("")).toThrow(/API key is required/);
  });

  it("sends the key as a bearer token to the canonical base URL", async () => {
    const { fn, calls } = mockFetch([{ status: 200, body: { posts: [], totalPages: 0 } }]);
    const post = new MisarPostClient("mpk_test", { fetch: fn });
    await post.posts.list({ status: "queued", page: 2 });
    expect(calls[0].url).toBe("https://api.misar.io/post/posts?status=queued&page=2");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer mpk_test");
    expect(calls[0].init.method).toBe("GET");
  });

  it("encodes path parameters and sends JSON bodies", async () => {
    const { fn, calls } = mockFetch([{ status: 200, body: { post: { id: "a/b" } } }]);
    const post = new MisarPostClient("mpk_test", { fetch: fn, baseURL: "https://post.misar.io/api/" });
    await post.posts.update("a/b", { contentText: "hi" });
    expect(calls[0].url).toBe("https://post.misar.io/api/posts/a%2Fb");
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].init.body).toBe(JSON.stringify({ contentText: "hi" }));
  });

  it("retries 5xx and throttles, then succeeds", async () => {
    const { fn, calls } = mockFetch([
      { status: 503, body: { error: "busy" }, headers: { "retry-after": "0" } },
      { status: 429, body: { error: "Too many requests" }, headers: { "retry-after": "0" } },
      { status: 200, body: { ok: true } },
    ]);
    const post = new MisarPostClient("mpk_test", { fetch: fn });
    await expect(post.analytics.stats()).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(3);
  });

  it("throws a typed plan-limit error with the offer and never retries it", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 402,
        body: { error: "limit", code: "plan_limit_exceeded", upgrade: offer },
        headers: { "retry-after": "3600", "x-misar-plan": "free", "x-misar-upgrade-url": "https://post.misar.io/pricing" },
      },
    ]);
    const post = new MisarPostClient("mpk_test", { fetch: fn });
    const err: any = await post.generate.enhance({ content: "x" }).catch((e: unknown) => e as any);
    expect(err).toBeInstanceOf(MisarPostPlanLimitError);
    expect(err.offer.feature).toBe("ai_text_actions");
    expect(err.plan).toBe("free");
    expect(err.upgradeUrl).toBe("https://post.misar.io/pricing");
    expect(err.retryAfter).toBe(3600);
    expect(calls).toHaveLength(1);
  });

  it("detects a plan refusal by code even when it arrives as a 429", async () => {
    const { fn, calls } = mockFetch([{ status: 429, body: { error: "quota", code: "plan_limit_exceeded", upgrade: offer } }]);
    const post = new MisarPostClient("mpk_test", { fetch: fn });
    await expect(post.generate.create({ prompt: "x" })).rejects.toBeInstanceOf(MisarPostPlanLimitError);
    expect(calls).toHaveLength(1);
  });

  it("surfaces scope refusals as MisarPostError with the server code", async () => {
    const { fn } = mockFetch([{ status: 403, body: { error: "lacks scope", code: "insufficient_scope" } }]);
    const post = new MisarPostClient("mpk_test", { fetch: fn });
    const err: any = await post.webhooks.listOutbound().catch((e: unknown) => e as any);
    expect(err).toBeInstanceOf(MisarPostError);
    expect(err.status).toBe(403);
    expect(err.code).toBe("insufficient_scope");
  });

  it("wraps non-object JSON as { data }", async () => {
    const { fn } = mockFetch([{ status: 200, body: [1, 2] }]);
    const post = new MisarPostClient("mpk_test", { fetch: fn });
    await expect(post.postTags.list()).resolves.toEqual({ data: [1, 2] });
  });
});

describe("paginate", () => {
  it("walks pages until totalPages", async () => {
    const seen: number[] = [];
    for await (const page of paginate(async (n) => ({ posts: [n], totalPages: 3, page: n }))) seen.push(page.page);
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("webhooks", () => {
  it("verifies X-MisarPost-Signature", async () => {
    const sig = await computeWebhookSignature("mpwh_secret", '{"event":"post.published"}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    await expect(verifyWebhookSignature("mpwh_secret", '{"event":"post.published"}', sig)).resolves.toBe(true);
    await expect(verifyWebhookSignature("mpwh_secret", '{"event":"tampered"}', sig)).resolves.toBe(false);
  });
});
