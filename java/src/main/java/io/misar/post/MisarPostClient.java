package io.misar.post;

import io.misar.post.generated.Resources;

import java.net.http.HttpClient;
import java.time.Duration;

/**
 * MisarPost API client. Every resource ({@code client.posts}, {@code client.generate}, …)
 * is generated from the API's own route tree (sdks/manifest.json).
 *
 * <pre>{@code
 * MisarPostClient post = new MisarPostClient(System.getenv("MISARPOST_API_KEY"));
 * Map<String, Object> queued = post.posts.list(Map.of("status", "queued"));
 * }</pre>
 */
public class MisarPostClient extends Resources {
    private final Transport transport;

    public MisarPostClient(String apiKey) {
        this(builder(apiKey).transport());
    }

    private MisarPostClient(Transport transport) {
        super(transport);
        this.transport = transport;
    }

    public String getBaseUrl() { return transport.getBaseUrl(); }

    public Transport getTransport() { return transport; }

    public static Builder builder(String apiKey) { return new Builder(apiKey); }

    /** Configures base URL, retries, timeout and the HttpClient. */
    public static final class Builder {
        private final String apiKey;
        private String baseUrl = Transport.DEFAULT_BASE_URL;
        private int maxRetries = 3;
        private Duration timeout = Duration.ofSeconds(30);
        private HttpClient httpClient;

        private Builder(String apiKey) { this.apiKey = apiKey; }

        public Builder baseUrl(String v) { this.baseUrl = v; return this; }
        public Builder maxRetries(int v) { this.maxRetries = v; return this; }
        public Builder timeout(Duration v) { this.timeout = v; return this; }
        public Builder httpClient(HttpClient v) { this.httpClient = v; return this; }

        Transport transport() { return new Transport(apiKey, baseUrl, maxRetries, timeout, httpClient); }

        public MisarPostClient build() { return new MisarPostClient(transport()); }
    }
}
