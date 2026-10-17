import com.vanniktech.maven.publish.SonatypeHost

plugins {
    kotlin("jvm") version "2.1.20"
    `java-library`
    // NOT `maven-publish` + `signing`. Those upload by PUTting each file to the
    // repository URL, but https://central.sonatype.com/api/v1/publisher/upload is
    // a bundle POST API, not a Maven repo — every PUT 404s and nothing is ever
    // published. This plugin speaks the Central Portal protocol.
    id("com.vanniktech.maven.publish") version "0.30.0"
}

group = "io.misar"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    // java.net.http (JDK 11+) for transport, Jackson for JSON, coroutines for
    // suspend calls. `api` for coroutines: every public method is `suspend`.
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.18.2")
    testImplementation(kotlin("test"))
    // Gradle 9 no longer puts the JUnit Platform launcher on the test runtime
    // classpath implicitly. Without it `gradle test` dies with "Failed to load
    // JUnit Platform" before running a single test.
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}

kotlin {
    jvmToolchain(17)
}

tasks.test {
    useJUnitPlatform()
}

// The sources and javadoc jars Central requires are produced by the publishing
// plugin, so declaring them here too would build two artifacts per classifier.

mavenPublishing {
    publishToMavenCentral(SonatypeHost.CENTRAL_PORTAL, automaticRelease = true)
    signAllPublications()
    coordinates("io.misar", "misarpost-kotlin", version.toString())

    pom {
        name.set("MisarPost Kotlin SDK")
        description.set(
            "MisarPost social publishing API for Kotlin: schedule and publish posts " +
                "across every connected channel, generate and repurpose content with AI, " +
                "research trends, run PersonaForge and read analytics — coroutines, " +
                "retries and typed plan-limit errors with upgrade offers."
        )
        url.set("https://www.misarpost.com")
        inceptionYear.set("2026")
        organization {
            name.set("Misar.AI")
            url.set("https://misar.io")
        }
        licenses {
            license {
                name.set("MIT License")
                url.set("https://opensource.org/licenses/MIT")
                distribution.set("repo")
            }
        }
        developers {
            developer {
                id.set("misar-ai")
                name.set("Misar.AI")
                email.set("hello@misar.io")
                organization.set("Misar.AI")
                organizationUrl.set("https://misar.io")
            }
        }
        scm {
            connection.set("scm:git:git://github.com/Misar-AI/misarpost-sdks.git")
            developerConnection.set("scm:git:ssh://github.com/Misar-AI/misarpost-sdks.git")
            url.set("https://github.com/Misar-AI/misarpost-sdks/tree/main/kotlin")
        }
        issueManagement {
            system.set("GitHub Issues")
            url.set("https://github.com/Misar-AI/misarpost-sdks/issues")
        }
        // A Maven POM has no "documentation" element. The product docs
        // live at https://docs.misar.io/post and are linked from the
        // README shipped alongside the sources jar.
    }
}
