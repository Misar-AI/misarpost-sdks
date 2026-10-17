import { Transport, type MisarPostClientOptions } from "./core/transport.js";
import { GeneratedResources } from "./generated/resources.js";

/**
 * MisarPost API client.
 *
 *   const post = new MisarPostClient(process.env.MISARPOST_API_KEY!);
 *   const { posts } = await post.posts.list({ status: "queued" });
 *
 * Every resource and method is generated from the API's own route tree
 * (sdks/manifest.json), so the client always matches the server surface.
 */
export class MisarPostClient extends GeneratedResources {
  readonly transport: Transport;

  constructor(apiKey: string, options: MisarPostClientOptions = {}) {
    const transport = new Transport(apiKey, options);
    super(transport);
    this.transport = transport;
  }

  /** The base URL requests go to. */
  get baseURL(): string {
    return this.transport.baseURL;
  }
}
