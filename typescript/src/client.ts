import { MisarPostError, MisarPostNetworkError } from "./errors.js";
import { ConnectionsResource } from "./resources/connections.js";
import { PostsResource } from "./resources/posts.js";
import { DraftsResource } from "./resources/drafts.js";
import { GenerateResource } from "./resources/generate.js";
import { AnalyticsResource } from "./resources/analytics.js";
import { ContentRippleResource } from "./resources/contentripple.js";

const DEFAULT_BASE_URL = "https://api.misar.io/social";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface MisarPostClientOptions {
  baseURL?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface BaseClient {
  request<T>(method: string, path: string, body?: unknown): Promise<T>;
}

export class MisarPostClient implements BaseClient {
  readonly connections: ConnectionsResource;
  readonly posts: PostsResource;
  readonly drafts: DraftsResource;
  readonly generate: GenerateResource;
  readonly analytics: AnalyticsResource;
  readonly contentripple: ContentRippleResource;

  private readonly baseURL: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly apiKey: string,
    options: MisarPostClientOptions = {},
  ) {
    this.baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.connections = new ConnectionsResource(this);
    this.posts = new PostsResource(this);
    this.drafts = new DraftsResource(this);
    this.generate = new GenerateResource(this);
    this.analytics = new AnalyticsResource(this);
    this.contentripple = new ContentRippleResource(this);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = this.baseURL + path;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const resp = await fetch(url, init);
        const status = resp.status;

        if (RETRYABLE_STATUS.has(status) && attempt < this.maxRetries - 1) {
          await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        if (!resp.ok) {
          const data = (await resp.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          throw new MisarPostError(status, String(data.error ?? resp.statusText));
        }
        return resp.json() as Promise<T>;
      } catch (err) {
        if (err instanceof MisarPostError) throw err;
        if (attempt < this.maxRetries - 1) {
          await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        throw new MisarPostNetworkError(
          err instanceof Error ? err.message : String(err),
          err,
        );
      }
    }
    throw new MisarPostNetworkError("max retries exceeded");
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
