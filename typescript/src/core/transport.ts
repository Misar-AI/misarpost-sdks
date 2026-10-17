/**
 * HTTP transport the generated resource layer is written against.
 *
 * One credential, one path in: the account API key (`mpk_…`), sent as
 * `Authorization: Bearer`. What a key may do, and how much of it, is decided
 * server-side from its scopes and the plan behind it; the SDK carries the key
 * and surfaces the answer rather than deciding locally.
 */

import {
  MisarPostError,
  MisarPostNetworkError,
  MisarPostPlanLimitError,
  isPlanLimitBody,
  type UpgradeOffer,
} from "./errors.js";

export const SDK_VERSION = "1.0.0";
export const DEFAULT_BASE_URL = "https://api.misar.io/post";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;
export type QueryParams = Record<string, QueryValue>;
export type JsonObject = Record<string, unknown>;

export interface RequestOptions {
  /** Abort the request (and any pending retry). */
  signal?: AbortSignal;
  /** Extra headers for this call only. */
  headers?: Record<string, string>;
}

export interface MisarPostClientOptions {
  /** Defaults to https://api.misar.io/post (dual-served at https://post.misar.io/api). */
  baseURL?: string;
  /** Total attempts for retryable failures (429 throttles, 5xx, network). Default 3. */
  maxRetries?: number;
  /** Per-attempt timeout in milliseconds. Default 30 000. */
  timeoutMs?: number;
  /** Custom fetch (tests, proxies, edge runtimes). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

function buildQuery(query?: QueryParams): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) for (const v of value) params.append(key, String(v));
    else params.append(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function pick(obj: unknown, ...path: string[]): string | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : undefined;
}

function backoffMs(attempt: number, res?: Response): number {
  const header = res?.headers.get("retry-after");
  if (header && /^\d+(\.\d+)?$/.test(header)) return Math.min(Number(header) * 1000, 60_000);
  return 200 * 2 ** attempt;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

/** Wrap non-object JSON as `{ data }` so every method returns an object. */
function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  return { data: value };
}

export class Transport {
  readonly baseURL: string;
  private readonly apiKey: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, options: MisarPostClientOptions = {}) {
    if (!apiKey) {
      throw new Error(
        "A MisarPost API key is required. Create one at https://post.misar.io/dashboard/api-keys (it starts with mpk_).",
      );
    }
    this.apiKey = apiKey;
    this.baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.maxRetries = Math.max(1, options.maxRetries ?? 3);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    const f = options.fetch ?? globalThis.fetch;
    if (!f) throw new Error("No fetch implementation available — pass options.fetch (Node 18+ has one built in).");
    this.fetchImpl = f.bind(globalThis);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    init: { query?: QueryParams; body?: unknown; options?: RequestOptions } = {},
  ): Promise<T> {
    const url = `${this.baseURL}${path}${buildQuery(init.query)}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": `misarpost-typescript/${SDK_VERSION}`,
      ...init.options?.headers,
    };
    const hasBody = init.body !== undefined && method !== "GET";
    if (hasBody) headers["Content-Type"] = "application/json";

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("timeout")), this.timeoutMs);
      const onAbort = () => controller.abort(init.options?.signal?.reason);
      init.options?.signal?.addEventListener("abort", onAbort);

      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: hasBody ? JSON.stringify(init.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        if (init.options?.signal?.aborted) throw err;
        if (attempt + 1 < this.maxRetries) {
          await sleep(backoffMs(attempt), init.options?.signal);
          continue;
        }
        throw new MisarPostNetworkError(err instanceof Error ? err.message : String(err), err);
      } finally {
        clearTimeout(timer);
        init.options?.signal?.removeEventListener("abort", onAbort);
      }

      const text = await res.text();
      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (res.ok) return normalize(data) as T;

      // Plan refusals FIRST, before the status is consulted — a quota block may
      // share a status with an ordinary throttle and must never be retried.
      if (isPlanLimitBody(data)) {
        const offer = (data.upgrade ?? null) as UpgradeOffer | null;
        const retry = res.headers.get("retry-after");
        throw new MisarPostPlanLimitError(
          res.status,
          String(data.error ?? offer?.headline ?? "Plan limit exceeded"),
          offer,
          res.headers.get("x-misar-plan") ?? pick(offer, "current_plan", "slug"),
          res.headers.get("x-misar-upgrade-url") ?? pick(offer, "urls", "pricing"),
          retry && /^\d+$/.test(retry) ? Number(retry) : undefined,
          data,
        );
      }

      if (RETRYABLE.has(res.status) && attempt + 1 < this.maxRetries) {
        await sleep(backoffMs(attempt, res), init.options?.signal);
        continue;
      }

      const body = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
      const message =
        typeof body.error === "string"
          ? body.error
          : typeof body.message === "string"
            ? body.message
            : typeof data === "string" && data
              ? data
              : `HTTP ${res.status}`;
      throw new MisarPostError(res.status, message, typeof body.code === "string" ? body.code : "api_error", data);
    }
  }
}

/** Encode one path parameter. */
export const enc = (value: string | number): string => encodeURIComponent(String(value));
