import type { BaseClient } from "../client.js";
import type {
  ListPostsParams,
  ListPostsResponse,
  ScheduledPost,
  SchedulePostParams,
} from "../types.js";

export class PostsResource {
  constructor(private readonly client: BaseClient) {}

  /** List posts with optional status filter and pagination */
  list(params: ListPostsParams = {}): Promise<ListPostsResponse> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.page) qs.set("page", String(params.page));
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.client.request("GET", `/posts${suffix}`);
  }

  /** Update a pending/queued post */
  update(
    id: string,
    body: {
      contentText?: string;
      scheduledAt?: string;
      firstComment?: string | null;
    }
  ): Promise<{ post: ScheduledPost }> {
    return this.client.request("PATCH", `/posts/${id}`, body);
  }

  /** Cancel a pending or queued post */
  cancel(id: string): Promise<{ ok: boolean }> {
    return this.client.request("DELETE", `/posts/${id}`);
  }

  /** Schedule a new post */
  schedule(params: SchedulePostParams): Promise<{ post: ScheduledPost }> {
    return this.client.request("POST", "/schedule", params);
  }
}
