import type { BaseClient } from "../client.js";
import type { PostVariant } from "../types.js";

export class DraftsResource {
  constructor(private readonly client: BaseClient) {}

  /** List draft and pending-review post variants */
  list(): Promise<{ drafts: PostVariant[] }> {
    return this.client.request("GET", "/drafts");
  }

  /** Approve or reject multiple draft variants */
  bulkAction(
    action: "approve" | "reject",
    ids: string[]
  ): Promise<{ updated: number }> {
    return this.client.request("POST", "/drafts", { action, ids });
  }
}
