package com.highway38.office;

/**
 * Pure decision helper for the native session's auth failures (1.0.6).
 *
 * The native background half holds a copy of the user's Supabase refresh
 * token and rotates it on its own schedule. When the shared chain is
 * revoked server-side (refresh-token reuse detection, an admin action, a
 * password change), every refresh attempt fails the same definitive way
 * forever. Before 1.0.6 the sync engine swallowed that failure and kept
 * the dead pair, so the phone looked armed ("Mileage tracking is on")
 * while every background position write 401'd in silence — Rick's phone,
 * 2026-10-27 18:10 CDT to 2026-10-29 23:04 CDT.
 *
 * This classifier separates that definitive rejection from transient
 * trouble (no network, a 5xx, a captive portal). Only a definitive
 * rejection may clear the stored tokens: clearing on a transient error
 * would sign the background half out every time the phone drove through
 * a dead zone.
 */
public final class SessionAuth {

    private SessionAuth() {}

    /**
     * True only when the auth endpoint has rejected the refresh token
     * itself: an HTTP 400/401 whose body names the refresh token, the
     * grant, or the token's revocation/expiry. A bare 401 with no body
     * counts (some proxies strip bodies); a 400 with an unrelated
     * validation message does not.
     */
    public static boolean isDefinitiveRejection(int statusCode, String body) {
        if (statusCode != 400 && statusCode != 401) return false;
        if (body == null || body.trim().isEmpty()) return statusCode == 401;
        String b = body.toLowerCase(java.util.Locale.US);
        return b.contains("refresh_token")
                || b.contains("refresh token")
                || b.contains("invalid_grant")
                || b.contains("invalid grant")
                || b.contains("already used")
                || b.contains("revoked")
                || b.contains("token is expired")
                || b.contains("token has expired")
                || b.contains("token expired");
    }
}
