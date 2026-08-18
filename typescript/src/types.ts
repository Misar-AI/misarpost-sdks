export type Platform =
  | "twitter"
  | "linkedin"
  | "instagram"
  | "threads"
  | "tiktok"
  | "bluesky"
  | "youtube";

export type PostStatus =
  | "pending"
  | "queued"
  | "publishing"
  | "published"
  | "failed"
  | "rejected"
  | "cancelled";

export type DraftStatus = "draft" | "pending_review" | "approved" | "rejected";

export type Tone = "professional" | "casual" | "technical" | "inspirational";

export interface ConnectedAccount {
  id: string;
  platform: Platform;
  display_name: string;
  avatar_url: string | null;
  status: "active" | "expired" | "revoked";
}

export interface ScheduledPost {
  id: string;
  platform: Platform;
  content_text: string;
  status: PostStatus;
  scheduled_at: string;
  published_at: string | null;
  source: string;
  platform_post_url: string | null;
  media_urls: string[] | null;
  created_at: string;
  error_message: string | null;
  connected_accounts?: { display_name: string; avatar_url: string | null } | null;
}

export interface PostVariant {
  id: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
  tone: Tone;
  status: DraftStatus;
  source: string;
  source_ref: string | null;
  created_at: string;
}

export interface GeneratedVariant {
  caption?: string;
  hashtags?: string[];
}

export interface PlatformVariants {
  platform: Platform;
  variants: GeneratedVariant[];
}

export interface DashboardStats {
  connectedAccounts: number;
  queuedPosts: number;
  publishedThisWeek: number;
  publishedThisMonth: number;
  drafts: number;
  lastPost: {
    platform: Platform;
    content_text: string;
    published_at: string;
    platform_post_url: string | null;
  } | null;
  topPerformingPost: {
    platform: Platform;
    likes: number;
    comments: number;
    reposts: number;
    impressions: number;
    contentSnippet: string;
    publishedAt: string | null;
  } | null;
  avgEngagementRate: number | null;
}

export interface ListPostsParams {
  status?: PostStatus;
  page?: number;
}

export interface ListPostsResponse {
  posts: ScheduledPost[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SchedulePostParams {
  connectedAccountId: string;
  platform: Platform;
  contentText: string;
  scheduledAt: string;
  mediaUrls?: string[];
  firstComment?: string;
}

export interface GeneratePostsParams {
  topic: string;
  platforms: Platform[];
  tone?: Tone;
  count?: number;
}
