package io.misar.post

import com.sun.net.httpserver.HttpServer
import kotlinx.coroutines.test.runTest
import java.net.InetSocketAddress
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MisarPostClientTest {
    private lateinit var server: HttpServer
    private val replies = ArrayDeque<Triple<Int, String, Map<String, String>>>()
    private val seen = mutableListOf<List<String?>>() // method, uri, auth, body

    private val offer = """{"feature":"ai_text_actions","headline":"limit","current_plan":{"slug":"free"},""" +
        """"urls":{"pricing":"https://post.misar.io/pricing"},"cta":"Upgrade to continue."}"""

    @BeforeTest
    fun start() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { ex ->
            val body = ex.requestBody.readBytes().decodeToString()
            seen += listOf(ex.requestMethod, ex.requestURI.toString(), ex.requestHeaders.getFirst("Authorization"), body)
            val (status, payload, headers) = if (replies.size > 1) replies.removeFirst() else replies.first()
            headers.forEach { (k, v) -> ex.responseHeaders.add(k, v) }
            val bytes = payload.toByteArray()
            ex.sendResponseHeaders(status, bytes.size.toLong())
            ex.responseBody.use { it.write(bytes) }
        }
        server.start()
    }

    @AfterTest
    fun stop() = server.stop(0)

    private fun client() = MisarPostClient("mpk_test", baseUrl = "http://127.0.0.1:${server.address.port}")

    @Test
    fun requiresApiKey() {
        assertFailsWith<IllegalArgumentException> { MisarPostClient("") }
    }

    @Test
    fun sendsBearerAndQuery() = runTest {
        replies += Triple(200, """{"posts":[]}""", emptyMap())
        client().posts.list(mapOf("status" to "queued"))
        assertEquals(listOf("GET", "/posts?status=queued", "Bearer mpk_test"), seen[0].take(3))
    }

    @Test
    fun encodesPathAndSendsBody() = runTest {
        replies += Triple(200, """{"post":{}}""", emptyMap())
        client().posts.update("a/b", mapOf("contentText" to "hi"))
        assertEquals("PATCH", seen[0][0])
        assertEquals("/posts/a%2Fb", seen[0][1])
        assertEquals("""{"contentText":"hi"}""", seen[0][3])
    }

    @Test
    fun requiredQueryIsPositional() = runTest {
        replies += Triple(200, """{"ok":true}""", emptyMap())
        client().workspaces.removeMember("ws1", "m1")
        assertEquals("/workspaces/ws1/members?memberId=m1", seen[0][1])
    }

    @Test
    fun retriesThenSucceeds() = runTest {
        replies += Triple(503, """{"error":"busy"}""", mapOf("Retry-After" to "0"))
        replies += Triple(429, """{"error":"slow"}""", mapOf("Retry-After" to "0"))
        replies += Triple(200, """{"ok":true}""", emptyMap())
        assertEquals(true, client().analytics.stats()["ok"])
        assertEquals(3, seen.size)
    }

    @Test
    fun planLimitIsTypedAndNotRetried() = runTest {
        replies += Triple(402, """{"error":"limit","code":"plan_limit_exceeded","upgrade":$offer}""",
            mapOf("Retry-After" to "3600", "x-misar-plan" to "free"))
        val e = assertFailsWith<PlanLimitException> { client().generate.enhance(mapOf("content" to "x")) }
        assertEquals("ai_text_actions", e.feature)
        assertEquals("free", e.plan)
        assertEquals("https://post.misar.io/pricing", e.upgradeUrl)
        assertEquals(3600, e.retryAfter)
        assertEquals(1, seen.size)
    }

    @Test
    fun planLimitDetectedOn429() = runTest {
        replies += Triple(429, """{"error":"quota","code":"plan_limit_exceeded","upgrade":$offer}""", emptyMap())
        assertFailsWith<PlanLimitException> { client().generate.create(mapOf("prompt" to "x")) }
        assertEquals(1, seen.size)
    }

    @Test
    fun scopeRefusalCarriesCode() = runTest {
        replies += Triple(403, """{"error":"lacks scope","code":"insufficient_scope"}""", emptyMap())
        val e = assertFailsWith<MisarPostException> { client().webhooks.listOutbound() }
        assertEquals(403, e.status)
        assertEquals("insufficient_scope", e.code)
    }

    @Test
    fun paginates() = runTest {
        val pages = paginate { p -> mapOf("posts" to listOf(p), "totalPages" to 3) }
        assertEquals(3, pages.size)
    }

    @Test
    fun verifiesWebhookSignatures() {
        val body = """{"event":"post.published"}""".toByteArray()
        val sig = Webhooks.computeSignature("mpwh_secret", body)
        assertTrue(Webhooks.verifyWebhookSignature("mpwh_secret", body, sig))
        assertFalse(Webhooks.verifyWebhookSignature("mpwh_secret", """{"event":"tampered"}""".toByteArray(), sig))
    }
}
