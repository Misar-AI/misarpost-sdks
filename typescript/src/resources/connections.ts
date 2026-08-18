import type { BaseClient } from "../client.js";
import type { ConnectedAccount, DashboardStats } from "../types.js";

export class ConnectionsResource {
  constructor(private readonly client: BaseClient) {}

  /** List all active connected social accounts */
  list(): Promise<{ accounts: ConnectedAccount[] }> {
    return this.client.request("GET", "/connections");
  }

  /** Get dashboard overview stats */
  stats(): Promise<DashboardStats> {
    return this.client.request("GET", "/stats");
  }
}
