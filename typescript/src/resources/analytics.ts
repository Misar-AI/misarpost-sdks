import type { BaseClient } from "../client.js";

export interface CalendarEntry {
  id: string;
  platform: string;
  content_text: string;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  platform_post_url: string | null;
  media_urls: string[] | null;
  connected_accounts?: { display_name: string; avatar_url: string | null } | null;
}

export interface TrendSnapshot {
  id: string;
  hashtag: string;
  niche: string;
  source: string;
  score: number;
  growth_pct: number | null;
  volume: number | null;
  lifecycle: string | null;
  sampled_at: string;
}

export class AnalyticsResource {
  constructor(private readonly client: BaseClient) {}

  /**
   * GET /calendar — get scheduled posts in a date range for the calendar view.
   * Defaults to 7 days ago → 30 days from now.
   */
  calendar(params?: {
    from?: string;
    to?: string;
  }): Promise<{ posts: CalendarEntry[] }> {
    const qs = params
      ? "?" +
        new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)]),
        ).toString()
      : "";
    return this.client.request("GET", `/calendar${qs}`);
  }

  /**
   * GET /trendpulse — fetch latest trending hashtags for the user's configured niches.
   * Returns cached results (< 2 hours old) or triggers a live refresh.
   */
  trends(): Promise<{ trends: TrendSnapshot[]; source: "cache" | "live" }> {
    return this.client.request("GET", "/trendpulse");
  }

  /**
   * POST /trendpulse — queue draft posts from trend snapshots into the EchoForge pipeline.
   */
  queueTrendDrafts(params: {
    snapshotIds: string[];
  }): Promise<{ queued: string[] }> {
    return this.client.request("POST", "/trendpulse", params);
  }
}
