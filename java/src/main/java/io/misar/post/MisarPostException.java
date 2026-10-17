package io.misar.post;

/** Any non-2xx answer from the MisarPost API, or a transport failure (status 0). */
public class MisarPostException extends RuntimeException {
    private final int status;
    private final String code;
    private final Object body;

    public MisarPostException(int status, String message, String code, Object body, Throwable cause) {
        super("misarpost: API error " + status + " (" + code + "): " + message, cause);
        this.status = status;
        this.code = code;
        this.body = body;
    }

    public MisarPostException(int status, String message, String code, Object body) {
        this(status, message, code, body, null);
    }

    /** HTTP status; 0 for a network failure. */
    public int getStatus() { return status; }

    /** Machine code from the body's {@code code}, e.g. {@code insufficient_scope}. */
    public String getCode() { return code; }

    /** The decoded error body. */
    public Object getBody() { return body; }

    /** The key was rejected outright: missing, revoked, expired, or another product's. */
    public boolean isUnauthorized() { return status == 401; }

    /** The key is valid but lacks the scope this endpoint requires. */
    public boolean isForbidden() { return status == 403; }
}
