package io.misar.post;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * HTTP transport the generated resource layer is written against. One
 * credential, one path in: the account API key ({@code mpk_…}) sent as
 * {@code Authorization: Bearer}. Retries throttles, 5xx and network failures
 * with exponential backoff from 200 ms honouring {@code Retry-After} — never a
 * plan refusal.
 */
public final class Transport {
    public static final String VERSION = "1.0.0";
    public static final String DEFAULT_BASE_URL = "https://api.misar.io/post";
    private static final Set<Integer> RETRYABLE = Set.of(429, 500, 502, 503, 504);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String apiKey;
    private final String baseUrl;
    private final int maxRetries;
    private final Duration timeout;
    private final HttpClient http;

    Transport(String apiKey, String baseUrl, int maxRetries, Duration timeout, HttpClient http) {
        if (apiKey == null || apiKey.isEmpty()) {
            throw new IllegalArgumentException(
                "A MisarPost API key is required. Create one at https://post.misar.io/dashboard/api-keys (it starts with mpk_).");
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.maxRetries = Math.max(1, maxRetries);
        this.timeout = timeout;
        this.http = http != null ? http : HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    public String getBaseUrl() { return baseUrl; }

    /** Encode one path parameter. */
    public static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    static String query(Map<String, Object> query) {
        if (query == null || query.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Object> e : query.entrySet()) {
            if (e.getValue() == null) continue;
            sb.append(sb.length() == 0 ? '?' : '&')
              .append(enc(e.getKey())).append('=').append(enc(String.valueOf(e.getValue())));
        }
        return sb.toString();
    }

    /** Send one API request; generated resources call this. */
    public Map<String, Object> request(String method, String path, Map<String, Object> query, Map<String, Object> body) {
        String payload = null;
        if (body != null) {
            try {
                payload = JSON.writeValueAsString(body);
            } catch (IOException e) {
                throw new MisarPostException(0, "Could not encode request body: " + e.getMessage(), "encode_error", null, e);
            }
        }
        URI uri = URI.create(baseUrl + path + query(query));
        for (int attempt = 0; ; attempt++) {
            HttpRequest.Builder rb = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json")
                .header("User-Agent", "misarpost-java/" + VERSION);
            if (payload != null) {
                rb.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(payload));
            } else {
                rb.method(method, HttpRequest.BodyPublishers.noBody());
            }

            HttpResponse<String> resp;
            try {
                resp = http.send(rb.build(), HttpResponse.BodyHandlers.ofString());
            } catch (IOException e) {
                if (attempt + 1 < maxRetries) { sleep(backoff(attempt, null)); continue; }
                throw new MisarPostException(0, e.getMessage(), "network_error", null, e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new MisarPostException(0, "interrupted", "network_error", null, e);
            }

            Object data = decode(resp.body());
            int status = resp.statusCode();
            if (status >= 200 && status < 300) return normalize(data);

            // Plan refusals first, by code — never retried.
            if (isPlanLimitBody(data)) throw planLimit(resp, data);

            if (RETRYABLE.contains(status) && attempt + 1 < maxRetries) {
                sleep(backoff(attempt, resp.headers().firstValue("retry-after").orElse(null)));
                continue;
            }

            Map<?, ?> m = data instanceof Map ? (Map<?, ?>) data : Map.of();
            Object msg = m.get("error") != null ? m.get("error") : m.get("message");
            Object code = m.get("code");
            throw new MisarPostException(status, msg != null ? msg.toString() : "HTTP " + status,
                code != null ? code.toString() : "api_error", data);
        }
    }

    static boolean isPlanLimitBody(Object data) {
        if (!(data instanceof Map)) return false;
        Map<?, ?> m = (Map<?, ?>) data;
        return "plan_limit_exceeded".equals(m.get("code")) || m.get("upgrade") instanceof Map;
    }

    @SuppressWarnings("unchecked")
    private static PlanLimitException planLimit(HttpResponse<String> resp, Object data) {
        Map<String, Object> body = (Map<String, Object>) data;
        Map<String, Object> offer = body.get("upgrade") instanceof Map ? (Map<String, Object>) body.get("upgrade") : null;
        String plan = resp.headers().firstValue("x-misar-plan").orElse(str(offer, "current_plan", "slug"));
        String upgradeUrl = resp.headers().firstValue("x-misar-upgrade-url").orElse(str(offer, "urls", "pricing"));
        Integer retryAfter = null;
        String ra = resp.headers().firstValue("retry-after").orElse(null);
        if (ra != null && ra.matches("\\d+")) retryAfter = Integer.valueOf(ra);
        Object err = body.get("error");
        String message = err != null ? err.toString() : (str(offer, "headline") != null ? str(offer, "headline") : "Plan limit exceeded");
        return new PlanLimitException(resp.statusCode(), message, data, offer, plan, upgradeUrl, retryAfter, str(offer, "feature"));
    }

    private static String str(Map<String, Object> m, String... path) {
        Object cur = m;
        for (String k : path) {
            if (!(cur instanceof Map)) return null;
            cur = ((Map<?, ?>) cur).get(k);
        }
        return cur instanceof String ? (String) cur : null;
    }

    private static long backoff(int attempt, String retryAfter) {
        if (retryAfter != null) {
            try {
                return (long) (Math.min(Double.parseDouble(retryAfter.trim()), 60.0) * 1000);
            } catch (NumberFormatException ignored) {
                // fall through to exponential backoff
            }
        }
        return 200L << attempt;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static Object decode(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return JSON.readValue(raw, new TypeReference<Object>() { });
        } catch (IOException e) {
            return raw;
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> normalize(Object data) {
        if (data == null) return new LinkedHashMap<>();
        if (data instanceof Map) return (Map<String, Object>) data;
        Map<String, Object> wrapped = new LinkedHashMap<>();
        wrapped.put("data", data);
        return wrapped;
    }
}
