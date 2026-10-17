// Transport: the account API key (mpk_…) as a bearer token, retries for 429,
// 5xx and network failures with backoff honouring Retry-After — except plan
// refusals, which are detected by `code: "plan_limit_exceeded"` before the
// status is consulted and never retried.
export const VERSION = "1.0.0";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class ApiError extends Error {
  constructor(status, message, code = "api_error", body = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export class PlanLimitError extends ApiError {
  constructor(status, message, offer, headers, body) {
    super(status, message, "plan_limit_exceeded", body);
    this.offer = offer ?? null;
    this.plan = headers.get("x-misar-plan") ?? offer?.current_plan?.slug;
    this.upgradeUrl = headers.get("x-misar-upgrade-url") ?? offer?.urls?.pricing;
    const ra = headers.get("retry-after");
    this.retryAfter = ra && /^\d+$/.test(ra) ? Number(ra) : undefined;
  }
}

export function isPlanLimitBody(data) {
  return Boolean(data && typeof data === "object" && (data.code === "plan_limit_exceeded" || (data.upgrade && typeof data.upgrade === "object")));
}

function backoffMs(attempt, res) {
  const ra = res?.headers.get("retry-after");
  if (ra && /^\d+(\.\d+)?$/.test(ra)) return Math.min(Number(ra) * 1000, 60_000);
  return 200 * 2 ** attempt;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function request({ apiKey, baseUrl, method, path, query, body, maxRetries = 3, fetchImpl = globalThis.fetch }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) qs.append(k, String(v));
  const url = `${baseUrl}${path}${qs.toString() ? `?${qs}` : ""}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "User-Agent": `misarpost-cli/${VERSION}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (err) {
      if (attempt + 1 < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new ApiError(0, err instanceof Error ? err.message : String(err), "network_error");
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }
    if (res.ok) return data;
    if (isPlanLimitBody(data)) throw new PlanLimitError(res.status, String(data.error ?? data.upgrade?.headline ?? "Plan limit exceeded"), data.upgrade, res.headers, data);
    if (RETRYABLE.has(res.status) && attempt + 1 < maxRetries) {
      await sleep(backoffMs(attempt, res));
      continue;
    }
    const message = (data && typeof data === "object" && (data.error ?? data.message)) || (typeof data === "string" && data) || `HTTP ${res.status}`;
    throw new ApiError(res.status, String(message), (data && typeof data === "object" && data.code) || "api_error", data);
  }
}

/** Walk ?page= until page >= totalPages, or until a page has an empty array. */
export async function paginate(fetchPage, maxPages = 0) {
  const pages = [];
  for (let page = 1; maxPages <= 0 || pages.length < maxPages; page++) {
    const result = await fetchPage(page);
    pages.push(result);
    if (typeof result?.totalPages === "number") {
      if (page >= result.totalPages) break;
      continue;
    }
    const items = Object.values(result ?? {}).find(Array.isArray);
    if (!items || items.length === 0) break;
  }
  return pages;
}
