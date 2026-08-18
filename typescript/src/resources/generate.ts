import type { BaseClient } from "../client.js";
import type { GeneratePostsParams, PlatformVariants, Tone } from "../types.js";

export interface EnhanceTopicParams {
  rawTopic: string;
  goal?: "awareness" | "engagement" | "conversion" | "viral";
  audience?: string;
  platforms: string[];
}

export interface EnhancedTopicResponse {
  enhancedTopic: string;
  suggestedTone: Tone;
  contentAngles: { angle: string; description: string }[];
  keyMessages: string[];
}

export interface ContentPlanResponse {
  hooks: string[];
  bestTimeSlots: Record<string, string>;
  trendingHashtags: string[];
  suggestedImageStyle: string | null;
}

export interface OptimizationInsightsResponse {
  bestTimeOfDay: { hour: number; label: string } | null;
  bestTone: string | null;
  topHashtags: string[];
  promptSuggestions: string[];
  platformInsights: Record<string, string>;
}

export interface HashtagResearchParams {
  keyword: string;
  niche?: string;
  platforms: string[];
  goal?: "awareness" | "engagement" | "conversion" | "viral";
}

export class GenerateResource {
  constructor(private readonly client: BaseClient) {}

  /** POST /generate — generate AI post variants for one or more platforms */
  posts(params: GeneratePostsParams): Promise<{ variants: PlatformVariants[] }> {
    return this.client.request("POST", "/generate", params);
  }

  /** POST /generate/enhance — rewrite a raw topic into a structured content brief */
  enhance(params: EnhanceTopicParams): Promise<EnhancedTopicResponse> {
    return this.client.request("POST", "/generate/enhance", params);
  }

  /** POST /generate/plan — generate hooks, best time slots, and trending hashtags */
  plan(params: {
    enhancedTopic: string;
    platforms: string[];
  }): Promise<ContentPlanResponse> {
    return this.client.request("POST", "/generate/plan", params);
  }

  /** GET /generate/optimize — AI-powered optimization insights from last 30 days of post metrics */
  optimize(params?: { platform?: string }): Promise<OptimizationInsightsResponse> {
    const qs = params?.platform
      ? `?platform=${encodeURIComponent(params.platform)}`
      : "";
    return this.client.request("GET", `/generate/optimize${qs}`);
  }

  /** POST /generate/hashtags — tiered hashtag strategy for a keyword across platforms */
  hashtags(params: HashtagResearchParams): Promise<Record<string, unknown>> {
    return this.client.request("POST", "/generate/hashtags", params);
  }
}
