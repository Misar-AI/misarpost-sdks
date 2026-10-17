package io.misar.post;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class MisarPostClientTest {
    private HttpServer server;
    private final Deque<String[]> replies = new LinkedList<>(); // {status, body, retryAfter}
    private final List<String[]> seen = new ArrayList<>();      // {method, uri, auth, body}

    private static final String OFFER = "{\"feature\":\"ai_text_actions\",\"headline\":\"limit\",\"current_plan\":{\"slug\":\"free\"},"
        + "\"urls\":{\"pricing\":\"https://post.misar.io/pricing\"},\"cta\":\"Upgrade to continue.\"}";

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            seen.add(new String[] {ex.getRequestMethod(), ex.getRequestURI().toString(),
                ex.getRequestHeaders().getFirst("Authorization"), body});
            String[] r = replies.size() > 1 ? replies.poll() : replies.peek();
            if (r[2] != null) ex.getResponseHeaders().add("Retry-After", r[2]);
            if (r.length > 3 && r[3] != null) ex.getResponseHeaders().add("x-misar-plan", r[3]);
            byte[] out = r[1].getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(Integer.parseInt(r[0]), out.length);
            try (OutputStream os = ex.getResponseBody()) { os.write(out); }
        });
        server.start();
    }

    @AfterEach
    void stop() { server.stop(0); }

    private MisarPostClient client() {
        return MisarPostClient.builder("mpk_test").baseUrl("http://127.0.0.1:" + server.getAddress().getPort()).build();
    }

    @Test
    void requiresApiKey() {
        assertThrows(IllegalArgumentException.class, () -> new MisarPostClient(""));
    }

    @Test
    void sendsBearerAndQuery() {
        replies.add(new String[] {"200", "{\"posts\":[]}", null});
        client().posts.list(Map.of("status", "queued"));
        assertEquals("GET", seen.get(0)[0]);
        assertEquals("/posts?status=queued", seen.get(0)[1]);
        assertEquals("Bearer mpk_test", seen.get(0)[2]);
    }

    @Test
    void encodesPathAndSendsBody() {
        replies.add(new String[] {"200", "{\"post\":{}}", null});
        client().posts.update("a/b", Map.of("contentText", "hi"));
        assertEquals("PATCH", seen.get(0)[0]);
        assertEquals("/posts/a%2Fb", seen.get(0)[1]);
        assertEquals("{\"contentText\":\"hi\"}", seen.get(0)[3]);
    }

    @Test
    void requiredQueryIsPositional() {
        replies.add(new String[] {"200", "{\"ok\":true}", null});
        client().workspaces.removeMember("ws1", "m1");
        assertEquals("/workspaces/ws1/members?memberId=m1", seen.get(0)[1]);
    }

    @Test
    void retriesThenSucceeds() {
        replies.add(new String[] {"503", "{\"error\":\"busy\"}", "0"});
        replies.add(new String[] {"429", "{\"error\":\"slow\"}", "0"});
        replies.add(new String[] {"200", "{\"ok\":true}", null});
        assertEquals(true, client().analytics.stats().get("ok"));
        assertEquals(3, seen.size());
    }

    @Test
    void planLimitIsTypedAndNotRetried() {
        replies.add(new String[] {"402", "{\"error\":\"limit\",\"code\":\"plan_limit_exceeded\",\"upgrade\":" + OFFER + "}", "3600", "free"});
        PlanLimitException e = assertThrows(PlanLimitException.class, () -> client().generate.enhance(Map.of("content", "x")));
        assertEquals("ai_text_actions", e.getFeature());
        assertEquals("free", e.getPlan());
        assertEquals("https://post.misar.io/pricing", e.getUpgradeUrl());
        assertEquals(3600, e.getRetryAfter());
        assertEquals("Upgrade to continue.", e.getOffer().get("cta"));
        assertEquals(1, seen.size());
    }

    @Test
    void planLimitDetectedOn429() {
        replies.add(new String[] {"429", "{\"error\":\"quota\",\"code\":\"plan_limit_exceeded\",\"upgrade\":" + OFFER + "}", null});
        assertThrows(PlanLimitException.class, () -> client().generate.create(Map.of("prompt", "x")));
        assertEquals(1, seen.size());
    }

    @Test
    void scopeRefusalCarriesCode() {
        replies.add(new String[] {"403", "{\"error\":\"lacks scope\",\"code\":\"insufficient_scope\"}", null});
        MisarPostException e = assertThrows(MisarPostException.class, () -> client().webhooks.listOutbound());
        assertEquals(403, e.getStatus());
        assertEquals("insufficient_scope", e.getCode());
    }

    @Test
    void wrapsNonObjectJson() {
        replies.add(new String[] {"200", "[1,2]", null});
        assertEquals(List.of(1, 2), client().postTags.list().get("data"));
    }

    @Test
    void paginates() {
        List<Map<String, Object>> pages = Pagination.paginate(p -> Map.of("posts", List.of(p), "totalPages", 3), 0);
        assertEquals(3, pages.size());
    }

    @Test
    void verifiesWebhookSignatures() {
        byte[] body = "{\"event\":\"post.published\"}".getBytes(StandardCharsets.UTF_8);
        String sig = Webhooks.computeSignature("mpwh_secret", body);
        assertTrue(sig.startsWith("sha256="));
        assertTrue(Webhooks.verifyWebhookSignature("mpwh_secret", body, sig));
        assertFalse(Webhooks.verifyWebhookSignature("mpwh_secret", "{\"event\":\"tampered\"}".getBytes(StandardCharsets.UTF_8), sig));
    }
}
