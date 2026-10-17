package io.misar.post

import io.misar.post.generated.Resources
import java.net.http.HttpClient
import java.time.Duration

/**
 * MisarPost API client. Every resource (`client.posts`, `client.generate`, …) is
 * generated from the API's own route tree (sdks/manifest.json); every method is
 * `suspend`.
 *
 * ```
 * val post = MisarPostClient(System.getenv("MISARPOST_API_KEY"))
 * val queued = post.posts.list(mapOf("status" to "queued"))
 * ```
 */
class MisarPostClient private constructor(val transport: Transport) : Resources(transport) {
    constructor(
        apiKey: String,
        baseUrl: String = Transport.DEFAULT_BASE_URL,
        maxRetries: Int = 3,
        timeout: Duration = Duration.ofSeconds(30),
        httpClient: HttpClient? = null,
    ) : this(Transport(apiKey, baseUrl, maxRetries, timeout, httpClient))

    val baseUrl: String get() = transport.baseUrl
}
