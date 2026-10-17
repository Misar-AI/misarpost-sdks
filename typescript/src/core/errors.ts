/**
 * Typed errors for the MisarPost SDK.
 *
 * Detection order matters and is the same in every MisarPost SDK: a response
 * body carrying `code: "plan_limit_exceeded"` (or an `upgrade` object) is a
 * plan refusal REGARDLESS of its HTTP status, and is checked before the status
 * is looked at. A quota refusal must never be mistaken for an ordinary
 * throttle and blind-retried — that is how an SDK swallows every upgrade offer.
 */

/** The upgrade offer a plan refusal carries (the `@misar/upsell` contract). */
export interface UpgradeOffer {
  product: string;
  product_name: string;
  reason: "quota_exhausted" | "feature_locked" | "overage_capped" | "credits_exhausted" | string;
  feature: string;
  feature_label: string;
  headline: string;
  usage: {
    used: number | null;
    limit: number | null;
    remaining: number | null;
    period: string | null;
    resets_at: string | null;
  } | null;
  current_plan: { slug: string; name: string };
  recommended_plan: string | null;
  plans: Array<{
    slug: string;
    name: string;
    price: string;
    price_note: string | null;
    recommended: boolean;
    current: boolean;
    unlocks: string | null;
    benefits: string[];
    url: string;
  }>;
  urls: { pricing: string; billing: string; docs: string; compare: string };
  cta: string;
  [key: string]: unknown;
}

export class MisarPostError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Machine code from the body (`code`), e.g. "insufficient_scope". */
    readonly code: string = "api_error",
    /** The decoded error body. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "MisarPostError";
  }

  /** The key was rejected outright — missing, revoked, expired, or wrong product. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** The key is valid but lacks the scope this endpoint requires. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Worth retrying as-is: a transient server condition or a throttle. */
  get isRetryable(): boolean {
    return this.status === 429 || (this.status >= 500 && this.status < 600);
  }
}

export class MisarPostNetworkError extends MisarPostError {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(0, message, "network_error");
    this.name = "MisarPostNetworkError";
  }
}

/**
 * Thrown when the plan attached to the API key blocks the call — a monthly
 * allowance is spent, or the feature is not on the plan. The API answers 402
 * with `code: "plan_limit_exceeded"` and an upgrade offer.
 *
 * Never retried: retrying cannot help until the allowance resets or the plan
 * changes. Show {@link offer}'s `headline`/`cta` and send the user to
 * {@link upgradeUrl}.
 */
export class MisarPostPlanLimitError extends MisarPostError {
  constructor(
    status: number,
    message: string,
    /** The structured upgrade offer — all copy comes from the server. */
    readonly offer: UpgradeOffer | null,
    /** The account's current plan slug. */
    readonly plan?: string,
    /** Pricing page to send the user to. */
    readonly upgradeUrl?: string,
    /** Seconds until a monthly allowance resets, when the API supplies it. */
    readonly retryAfter?: number,
    body?: unknown,
  ) {
    super(status, message, "plan_limit_exceeded", body);
    this.name = "MisarPostPlanLimitError";
  }

  /** The feature whose allowance was exhausted, e.g. "ai_text_actions". */
  get feature(): string | undefined {
    return this.offer?.feature;
  }
}

/** True when an error body carries the API's plan-refusal marker. */
export function isPlanLimitBody(data: unknown): data is { code?: string; upgrade?: UpgradeOffer; error?: string } {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return d.code === "plan_limit_exceeded" || (typeof d.upgrade === "object" && d.upgrade !== null);
}
