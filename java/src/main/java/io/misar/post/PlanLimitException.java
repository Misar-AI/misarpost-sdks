package io.misar.post;

import java.util.Map;

/**
 * The plan behind the API key blocks this call: HTTP 402 with
 * {@code code: "plan_limit_exceeded"} and an upgrade offer. Detected by code
 * before the status and never retried — retrying cannot help until the
 * allowance resets or the plan changes. All copy comes from the server.
 */
public class PlanLimitException extends MisarPostException {
    private final Map<String, Object> offer;
    private final String plan;
    private final String upgradeUrl;
    private final Integer retryAfter;
    private final String feature;

    public PlanLimitException(int status, String message, Object body, Map<String, Object> offer,
                              String plan, String upgradeUrl, Integer retryAfter, String feature) {
        super(status, message, "plan_limit_exceeded", body);
        this.offer = offer;
        this.plan = plan;
        this.upgradeUrl = upgradeUrl;
        this.retryAfter = retryAfter;
        this.feature = feature;
    }

    /** The server's upgrade offer (headline, plans, cta, urls…). */
    public Map<String, Object> getOffer() { return offer; }

    /** The account's current plan slug. */
    public String getPlan() { return plan; }

    /** Pricing page to send the user to. */
    public String getUpgradeUrl() { return upgradeUrl; }

    /** Seconds until a monthly allowance resets, when supplied; otherwise null. */
    public Integer getRetryAfter() { return retryAfter; }

    /** The feature whose allowance was exhausted. */
    public String getFeature() { return feature; }
}
