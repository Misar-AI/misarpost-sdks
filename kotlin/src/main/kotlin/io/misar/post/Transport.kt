package io.misar.post

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import kotlinx.coroutines.delay
import kotlinx.coroutines.future.await
import java.io.IOException
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import java.time.Duration

/**
 * HTTP transport the generated resource layer is written against. One credential,
 * one path in: the account API key (`mpk_…`) sent as `Authorization: Bearer`.
 * Retries throttles, 5xx and network failures with exponential backoff from
 * 200 ms honouring `Retry-After` — never a plan refusal.
 */
class Transport internal constructor(
    private val apiKey: String,
    baseUrl: String = DEFAULT_BASE_URL,
    private val maxRetries: Int = 3,
    private val timeout: Duration = Duration.ofSeconds(30),
    httpClient: HttpClient? = null,
) {
    val baseUrl: String = baseUrl.trimEnd('/')
    private val http: HttpClient = httpClient ?: HttpClient.newBuilder().connectTimeout(timeout).build()

    init {
        require(apiKey.isNotEmpty()) {
            "A MisarPost API key is required. Create one at https://post.misar.io/dashboard/api-keys (it starts with mpk_)."
        }
    }

    /** Send one API request; generated resources call this. */
    suspend fun request(method: String, path: String, query: Map<String, Any?>?, body: Map<String, Any?>?): Map<String, Any?> {
        val payload = body?.let { JSON.writeValueAsString(it) }
        val uri = URI.create(baseUrl + path + queryString(query))
        var attempt = 0
        while (true) {
            val builder = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("Authorization", "Bearer $apiKey")
                .header("Accept", "application/json")
                .header("User-Agent", "misarpost-kotlin/$VERSION")
            if (payload != null) {
                builder.header("Content-Type", "application/json").method(method, HttpRequest.BodyPublishers.ofString(payload))
            } else {
                builder.method(method, HttpRequest.BodyPublishers.noBody())
            }

            val resp: HttpResponse<String> = try {
                http.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString()).await()
            } catch (e: IOException) {
                if (attempt + 1 < maxRetries) { delay(backoff(attempt, null)); attempt++; continue }
                throw MisarPostException(0, e.message ?: "network error", "network_error", null, e)
            }

            val data = decode(resp.body())
            val status = resp.statusCode()
            if (status in 200..299) return normalize(data)

            // Plan refusals first, by code — never retried.
            if (isPlanLimitBody(data)) throw planLimit(resp, data)

            if (status in RETRYABLE && attempt + 1 < maxRetries) {
                delay(backoff(attempt, resp.headers().firstValue("retry-after").orElse(null)))
                attempt++
                continue
            }
            val m = data as? Map<*, *> ?: emptyMap<String, Any?>()
            val message = (m["error"] ?: m["message"])?.toString() ?: "HTTP $status"
            throw MisarPostException(status, message, m["code"]?.toString() ?: "api_error", data)
        }
    }

    companion object {
        const val VERSION = "1.0.0"
        const val DEFAULT_BASE_URL = "https://api.misar.io/post"
        private val RETRYABLE = setOf(429, 500, 502, 503, 504)
        private val JSON = jacksonObjectMapper()

        /** Encode one path parameter. */
        fun enc(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20")

        internal fun queryString(query: Map<String, Any?>?): String {
            val pairs = query.orEmpty().filterValues { it != null }.map { (k, v) -> "${enc(k)}=${enc(v.toString())}" }
            return if (pairs.isEmpty()) "" else "?" + pairs.joinToString("&")
        }

        internal fun isPlanLimitBody(data: Any?): Boolean {
            val m = data as? Map<*, *> ?: return false
            return m["code"] == "plan_limit_exceeded" || m["upgrade"] is Map<*, *>
        }

        private fun backoff(attempt: Int, retryAfter: String?): Long {
            retryAfter?.trim()?.toDoubleOrNull()?.let { return (minOf(it, 60.0) * 1000).toLong() }
            return 200L shl attempt
        }

        private fun decode(raw: String?): Any? {
            if (raw.isNullOrBlank()) return null
            return try { JSON.readValue<Any?>(raw) } catch (e: IOException) { raw }
        }

        @Suppress("UNCHECKED_CAST")
        private fun normalize(data: Any?): Map<String, Any?> = when (data) {
            null -> emptyMap()
            is Map<*, *> -> data as Map<String, Any?>
            else -> mapOf("data" to data)
        }

        @Suppress("UNCHECKED_CAST")
        private fun planLimit(resp: HttpResponse<String>, data: Any?): PlanLimitException {
            val body = data as Map<String, Any?>
            val offer = body["upgrade"] as? Map<String, Any?>
            fun str(vararg path: String): String? {
                var cur: Any? = offer
                for (k in path) cur = (cur as? Map<*, *>)?.get(k)
                return cur as? String
            }
            val headers = resp.headers()
            return PlanLimitException(
                status = resp.statusCode(),
                message = body["error"]?.toString() ?: str("headline") ?: "Plan limit exceeded",
                body = data,
                offer = offer,
                plan = headers.firstValue("x-misar-plan").orElse(null) ?: str("current_plan", "slug"),
                upgradeUrl = headers.firstValue("x-misar-upgrade-url").orElse(null) ?: str("urls", "pricing"),
                retryAfter = headers.firstValue("retry-after").orElse(null)?.toIntOrNull(),
                feature = str("feature"),
            )
        }
    }
}
