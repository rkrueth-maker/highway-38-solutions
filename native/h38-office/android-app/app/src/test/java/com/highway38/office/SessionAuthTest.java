package com.highway38.office;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The 1.0.6 dead-pair detector: only a definitive rejection of the
 * refresh token itself may clear the native session. Anything transient
 * (5xx, unrelated validation errors, network-shaped failures) must keep
 * the stored pair — clearing on those would sign the background half out
 * every time the phone lost signal.
 */
public class SessionAuthTest {

    @Test
    public void gotrueRevokedRefreshTokenIsDefinitive() {
        // The shape GoTrue returns once a refresh chain is revoked
        // (refresh-token reuse detection) — Rick's Oct 27 chain death.
        assertTrue(SessionAuth.isDefinitiveRejection(400,
                "{\"code\":400,\"error_code\":\"refresh_token_not_found\","
                        + "\"msg\":\"Invalid Refresh Token: Not Found\"}"));
        assertTrue(SessionAuth.isDefinitiveRejection(401,
                "{\"error\":\"invalid_grant\",\"error_description\":"
                        + "\"Refresh Token Already Used\"}"));
        assertTrue(SessionAuth.isDefinitiveRejection(400,
                "{\"error\":\"invalid_grant\",\"error_description\":"
                        + "\"refresh token has been revoked\"}"));
    }

    @Test
    public void bareUnauthorizedCountsAsDefinitive() {
        // Some proxies strip error bodies; a 401 from the token endpoint
        // with no body still means the presented credential was rejected.
        assertTrue(SessionAuth.isDefinitiveRejection(401, null));
        assertTrue(SessionAuth.isDefinitiveRejection(401, ""));
    }

    @Test
    public void unrelatedBadRequestIsNotDefinitive() {
        assertFalse(SessionAuth.isDefinitiveRejection(400,
                "{\"error\":\"validation_failed\",\"error_description\":"
                        + "\"grant_type is required\"}"));
        assertFalse(SessionAuth.isDefinitiveRejection(400, null));
    }

    @Test
    public void serverAndNetworkFailuresAreNeverDefinitive() {
        assertFalse(SessionAuth.isDefinitiveRejection(500,
                "{\"msg\":\"Invalid Refresh Token: Not Found\"}"));
        assertFalse(SessionAuth.isDefinitiveRejection(502, "Bad Gateway"));
        assertFalse(SessionAuth.isDefinitiveRejection(403,
                "{\"msg\":\"refresh token revoked\"}"));
        assertFalse(SessionAuth.isDefinitiveRejection(0, null));
        assertFalse(SessionAuth.isDefinitiveRejection(200,
                "{\"msg\":\"refresh token\"}"));
    }
}
