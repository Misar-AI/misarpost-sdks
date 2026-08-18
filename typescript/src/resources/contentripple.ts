import type { BaseClient } from "../client.js";

export interface ContentVariant {
  id: string;
  platform: string;
  content: string;
  hashtags: string[];
  tone: string;
  status: "generated" | "edited" | "queued" | "posted";
  source: string;
  created_at: string;
}

export interface ContentSource {
  id: string;
  source_type: string;
  source_url: string | null;
  title: string | null;
  core_message: string | null;
  created_at: string;
}

export interface RepurposeParams {
  sourceType: "url" | "text" | "docforge" | "github_release";
  sourceUrl?: string;
  rawContent?: string;
  platforms?: string[];
  tone?: string;
}

export class ContentRippleResource {
  constructor(private readonly client: BaseClient) {}

  /**
   * GET /contentripple — get current month's repurpose usage and limit.
   */
  usage(): Promise<{ count: number; limit: number | null; tier: string }> {
    return this.client.request("GET", "/contentripple");
  }

  /**
   * POST /contentripple — repurpose a URL or text into platform-native content variants.
   */
  repurpose(
    params: RepurposeParams,
  ): Promise<{ source: ContentSource; variants: ContentVariant[] }> {
    return this.client.request("POST", "/contentripple", params);
  }

  /**
   * PATCH /contentripple/variants — edit a generated content variant.
   */
  updateVariant(params: {
    variantId: string;
    content?: string;
    status?: "generated" | "edited" | "queued" | "posted";
  }): Promise<{ variant: ContentVariant }> {
    return this.client.request("PATCH", "/contentripple/variants", params);
  }

  /**
   * POST /contentripple/schedule — schedule a variant to a connected account.
   */
  schedule(params: {
    variantId: string;
    connectedAccountId: string;
    scheduledAt: string;
  }): Promise<{ post: Record<string, unknown> }> {
    return this.client.request("POST", "/contentripple/schedule", params);
  }
}
