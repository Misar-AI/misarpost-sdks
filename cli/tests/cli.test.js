import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";
import { computeWebhookSignature } from "../src/webhooks.js";

let server;
let base;
let replies;
let seen;

const offer = {
  feature: "ai_text_actions",
  headline: "You've reached your Free plan's ai text actions limit (30/30 this month).",
  usage: { used: 30, limit: 30, remaining: 0, period: "month", resets_at: "2026-11-01T00:00:00.000Z" },
  current_plan: { slug: "free", name: "Free" },
  plans: [{ slug: "pro", name: "Creator Stack", price: "$9/month", recommended: true, unlocks: "More ai text actions" }],
  urls: { pricing: "https://post.misar.io/pricing" },
  cta: "Upgrade to continue.",
};

function sink() {
  let data = "";
  return { write: (s) => { data += s; return true; }, get text() { return data; } };
}

async function run(args, env = {}) {
  const stdout = sink();
  const stderr = sink();
  const home = mkdtempSync(join(tmpdir(), "misarpost-cli-"));
  const code = await main(args, { env: { HOME: home, ...env }, stdout, stderr });
  return { code, out: stdout.text, err: stderr.text, home };
}

beforeEach(async () => {
  replies = [];
  seen = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      const [status, payload, headers = {}] = replies.length > 1 ? replies.shift() : replies[0];
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => new Promise((r) => server.close(r)));

test("calls an endpoint with the bearer key, query and kebab-case names", async () => {
  replies = [[200, { posts: [] }]];
  const r = await run(["posts", "list", "--query", "status=queued", "--api-key", "mpk_test", "--base-url", base]);
  assert.equal(r.code, 0);
  assert.equal(seen[0].url, "/posts?status=queued");
  assert.equal(seen[0].auth, "Bearer mpk_test");
  replies = [[200, { history: [] }]];
  assert.equal((await run(["contentripple", "history", "--api-key", "mpk_test", "--base-url", base])).code, 0);
  assert.equal(seen[1].url, "/contentripple/history");
});

test("encodes path params and sends the JSON body", async () => {
  replies = [[200, { post: {} }]];
  const r = await run(["posts", "update", "a/b", "--body", '{"contentText":"hi"}', "--api-key", "mpk_test", "--base-url", base]);
  assert.equal(r.code, 0);
  assert.equal(seen[0].method, "PATCH");
  assert.equal(seen[0].url, "/posts/a%2Fb");
  assert.deepEqual(JSON.parse(seen[0].body), { contentText: "hi" });
});

test("required query params are positional", async () => {
  replies = [[200, { ok: true }]];
  await run(["workspaces", "remove-member", "ws1", "m1", "--api-key", "mpk_test", "--base-url", base]);
  assert.equal(seen[0].url, "/workspaces/ws1/members?memberId=m1");
});

test("retries throttles and 5xx", async () => {
  replies = [[503, { error: "busy" }, { "retry-after": "0" }], [429, { error: "slow" }, { "retry-after": "0" }], [200, { ok: true }]];
  const r = await run(["analytics", "stats", "--api-key", "mpk_test", "--base-url", base]);
  assert.equal(r.code, 0);
  assert.equal(seen.length, 3);
});

test("a plan refusal prints the upgrade card, exits 2 and is not retried", async () => {
  replies = [[402, { error: "limit", code: "plan_limit_exceeded", upgrade: offer }, { "retry-after": "3600" }]];
  const r = await run(["generate", "enhance", "--body", '{"content":"x"}', "--api-key", "mpk_test", "--base-url", base]);
  assert.equal(r.code, 2);
  assert.match(r.err, /ai text actions limit/);
  assert.match(r.err, /Creator Stack — \$9\/month/);
  assert.match(r.err, /https:\/\/post\.misar\.io\/pricing/);
  assert.equal(seen.length, 1);
});

test("a plan refusal on 429 is detected by code", async () => {
  replies = [[429, { error: "quota", code: "plan_limit_exceeded", upgrade: offer }]];
  const r = await run(["generate", "create", "--body", "{}", "--api-key", "mpk_test", "--base-url", base]);
  assert.equal(r.code, 2);
  assert.equal(seen.length, 1);
});

test("scope refusals exit 1 with the server code", async () => {
  replies = [[403, { error: "lacks scope", code: "insufficient_scope" }]];
  const r = await run(["webhooks", "list-outbound", "--api-key", "mpk_test", "--base-url", base]);
  assert.equal(r.code, 1);
  assert.match(r.err, /403, insufficient_scope/);
});

test("login stores the key (0600) and env/flags take precedence over it", async () => {
  const login = await run(["login", "--key", "mpk_stored"]);
  assert.equal(login.code, 0);
  const cfg = join(login.home, ".misarpost", "config.json");
  assert.equal(JSON.parse(readFileSync(cfg, "utf8")).api_key, "mpk_stored");
  assert.equal(statSync(cfg).mode & 0o777, 0o600);

  replies = [[200, {}]];
  const stdout = sink();
  await main(["analytics", "stats", "--base-url", base], { env: { HOME: login.home }, stdout, stderr: sink() });
  assert.equal(seen.at(-1).auth, "Bearer mpk_stored");
  await main(["analytics", "stats", "--base-url", base], { env: { HOME: login.home, MISARPOST_API_KEY: "mpk_env" }, stdout, stderr: sink() });
  assert.equal(seen.at(-1).auth, "Bearer mpk_env");
  await main(["analytics", "stats", "--base-url", base, "--api-key", "mpk_flag"], { env: { HOME: login.home, MISARPOST_API_KEY: "mpk_env" }, stdout, stderr: sink() });
  assert.equal(seen.at(-1).auth, "Bearer mpk_flag");
});

test("missing key and unknown commands are reported", async () => {
  assert.equal((await run(["posts", "list"])).code, 1);
  assert.equal((await run(["posts", "explode"])).code, 64);
});

test("--all-pages walks ?page= until totalPages", async () => {
  replies = [[200, { posts: [1], totalPages: 2 }], [200, { posts: [2], totalPages: 2 }]];
  const r = await run(["posts", "list", "--all-pages", "--api-key", "mpk_test", "--base-url", base]);
  assert.equal(r.code, 0);
  assert.deepEqual(seen.map((s) => s.url), ["/posts?page=1", "/posts?page=2"]);
  assert.equal(JSON.parse(r.out).length, 2);
});

test("webhooks verify checks X-MisarPost-Signature", async () => {
  const dir = mkdtempSync(join(tmpdir(), "misarpost-wh-"));
  const file = join(dir, "body.json");
  writeFileSync(file, '{"event":"post.published"}');
  const sig = computeWebhookSignature("mpwh_secret", '{"event":"post.published"}');
  assert.equal((await run(["webhooks", "verify", "--secret", "mpwh_secret", "--signature", sig, "--file", file])).code, 0);
  assert.equal((await run(["webhooks", "verify", "--secret", "mpwh_secret", "--signature", "sha256=00", "--file", file])).code, 1);
});

test("help lists every command", async () => {
  const r = await run(["help"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /posts\n/);
  assert.match(r.out, /scope schedule:write/);
});
