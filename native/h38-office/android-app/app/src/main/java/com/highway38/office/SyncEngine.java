package com.highway38.office;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Talks to the same Supabase project the Office web app uses, with the
 * session the web app pushed through the bridge. Three jobs:
 *
 *   1. keep the session fresh (GoTrue refresh-token exchange);
 *   2. deliver queued trips as business_records upserts — the exact write
 *      the web sync engine performs (collection 'mileageTrips', record_key
 *      = Trip ID, on-conflict merge), so delivery is idempotent;
 *   3. refresh the server-readable gate inputs when the WebView is dead:
 *      the open timeEntries record (employee clock-in) and the tenant
 *      mileage pilot row (business_module_settings);
 *   4. report the owner phone's latest position ("Find my phone") into
 *      the crewPositions store — owners only, one row per phone.
 *
 * All calls are bounded, member-scoped (the member's own JWT + RLS), and
 * read-only except the trip upsert.
 */
public final class SyncEngine {

    private static final int TIMEOUT_MS = 20_000;

    private SyncEngine() {}

    // ------------------------------------------------------------------ http

    private static final class HttpResult {
        final int code;
        final String body;
        HttpResult(int code, String body) { this.code = code; this.body = body; }
        boolean ok() { return code >= 200 && code < 300; }
    }

    private static HttpResult http(String method, String url, String apikey, String bearer,
                                   String prefer, String jsonBody) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(TIMEOUT_MS);
        c.setReadTimeout(TIMEOUT_MS);
        if (apikey != null) c.setRequestProperty("apikey", apikey);
        if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
        if (prefer != null) c.setRequestProperty("Prefer", prefer);
        if (jsonBody != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream os = c.getOutputStream()) {
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            }
        }
        int code = c.getResponseCode();
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        StringBuilder sb = new StringBuilder();
        if (in != null) {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
            }
        }
        c.disconnect();
        return new HttpResult(code, sb.toString());
    }

    private static String enc(String v) throws Exception {
        return URLEncoder.encode(v, "UTF-8");
    }

    // --------------------------------------------------------------- session

    /** Refreshes the access token when it is expired or about to expire. */
    public static PolicyStore.Session ensureFreshSession(Context ctx) {
        PolicyStore.Session s = PolicyStore.loadSession(ctx);
        if (!s.present()) return s;
        if (!s.accessToken.isEmpty() && s.expiresAtMs > System.currentTimeMillis() + 60_000) return s;
        try {
            JSONObject body = new JSONObject();
            body.put("refresh_token", s.refreshToken);
            HttpResult r = http("POST",
                    s.supabaseUrl + "/auth/v1/token?grant_type=refresh_token",
                    s.publishableKey, s.publishableKey, null, body.toString());
            if (r.ok()) {
                JSONObject j = new JSONObject(r.body);
                s.accessToken = j.optString("access_token", s.accessToken);
                s.refreshToken = j.optString("refresh_token", s.refreshToken);
                long in = j.optLong("expires_in", 3600);
                s.expiresAtMs = System.currentTimeMillis() + in * 1000L;
                PolicyStore.saveSession(ctx, s);
            }
        } catch (Exception ignored) {
            // Offline or rejected: callers see the old session and fail
            // honestly; the queue keeps the trips until a sync works.
        }
        return s;
    }

    // ----------------------------------------------------------------- trips

    /** Upserts every queued trip. Returns how many were confirmed delivered. */
    public static int syncPendingTrips(Context ctx) {
        PolicyStore.Session s = ensureFreshSession(ctx);
        if (!s.present() || s.accessToken.isEmpty()) return 0;
        TripStore store = new TripStore(ctx);
        List<TripStore.Pending> pending = store.all();
        int delivered = 0;
        for (TripStore.Pending p : pending) {
            try {
                JSONObject row = new JSONObject();
                row.put("business_id", s.businessId);
                row.put("collection", "mileageTrips");
                row.put("record_key", p.tripId);
                row.put("payload", p.payload);
                row.put("record_status", "active");
                String actor = !s.authUserId.isEmpty() ? s.authUserId : s.userId;
                row.put("created_by", actor);
                row.put("updated_by", actor);
                HttpResult r = http("POST",
                        s.supabaseUrl + "/rest/v1/business_records?on_conflict=business_id,collection,record_key",
                        s.publishableKey, s.accessToken,
                        "resolution=merge-duplicates,return=minimal",
                        row.toString());
                if (r.ok()) {
                    store.remove(p.tripId);
                    delivered++;
                } else {
                    store.markAttempt(p.tripId, "HTTP " + r.code);
                }
            } catch (Exception e) {
                store.markAttempt(p.tripId, String.valueOf(e.getMessage()));
            }
        }
        return delivered;
    }

    // ------------------------------------------------------- owner position

    /**
     * "Find my phone": while an owner's tracking is on, the runner reports
     * the phone's latest fix into the crewPositions store (one row per
     * owner phone, upserted in place — the same write shape as trips).
     * The caller (TrackingService) reports owners only and only while the
     * gate is RECORDING. Best effort: returns false on any failure and the
     * next heartbeat retries.
     */
    public static boolean reportOwnerPosition(Context ctx, double lat, double lng,
                                              double accuracyM, long fixMs) {
        PolicyStore.Session s = ensureFreshSession(ctx);
        if (!s.present() || s.accessToken.isEmpty() || s.userId.isEmpty()) return false;
        try {
            Map<String, Object> payload = PositionPayload.build(
                    s.businessId, s.userId, s.userName, lat, lng, accuracyM,
                    fixMs, System.currentTimeMillis());
            JSONObject row = new JSONObject();
            row.put("business_id", s.businessId);
            row.put("collection", "crewPositions");
            row.put("record_key", PositionPayload.recordKey(s.userId));
            row.put("payload", toJson(payload));
            row.put("record_status", "active");
            String actor = !s.authUserId.isEmpty() ? s.authUserId : s.userId;
            row.put("created_by", actor);
            row.put("updated_by", actor);
            HttpResult r = http("POST",
                    s.supabaseUrl + "/rest/v1/business_records?on_conflict=business_id,collection,record_key",
                    s.publishableKey, s.accessToken,
                    "resolution=merge-duplicates,return=minimal",
                    row.toString());
            return r.ok();
        } catch (Exception e) {
            return false;
        }
    }

    // ------------------------------------------------------------ gate inputs

    /**
     * Reads the server-side gate inputs. Returns {clockedIn, pilotEnabled} or
     * null when either read failed (callers keep the last known state).
     */
    public static boolean[] readGateInputs(Context ctx) {
        PolicyStore.Session s = ensureFreshSession(ctx);
        if (!s.present() || s.accessToken.isEmpty() || s.userId.isEmpty()) return null;
        try {
            // Pilot: business_module_settings row for this tenant.
            HttpResult pilot = http("GET",
                    s.supabaseUrl + "/rest/v1/business_module_settings"
                            + "?business_id=eq." + enc(s.businessId)
                            + "&module_key=eq.mileage_tracking&select=enabled&limit=1",
                    s.publishableKey, s.accessToken, null, null);
            if (!pilot.ok()) return null;
            JSONArray pa = new JSONArray(pilot.body);
            boolean pilotOn = pa.length() > 0 && pa.getJSONObject(0).optBoolean("enabled", false);

            // Clock-in: the member's newest time entries; an open one
            // ('End Time' empty) for this user means clocked in.
            HttpResult entries = http("GET",
                    s.supabaseUrl + "/rest/v1/business_records"
                            + "?business_id=eq." + enc(s.businessId)
                            + "&collection=eq.timeEntries&record_status=eq.active"
                            + "&select=payload&order=created_at.desc&limit=50",
                    s.publishableKey, s.accessToken, null, null);
            if (!entries.ok()) return null;
            JSONArray rows = new JSONArray(entries.body);
            boolean clockedIn = false;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject payload = rows.getJSONObject(i).optJSONObject("payload");
                if (payload == null) continue;
                if (!s.userId.equals(payload.optString("User ID"))) continue;
                String end = payload.optString("End Time", "");
                if (end == null || end.trim().isEmpty()) { clockedIn = true; break; }
                // The user's newest entry decides; older opens are stale.
                // Rows arrive newest first, so stop at the first own entry.
                break;
            }
            return new boolean[]{clockedIn, pilotOn};
        } catch (Exception e) {
            return null;
        }
    }

    /** Converts the pure payload map into the JSONObject the store/sync use. */
    public static JSONObject toJson(Map<String, Object> map) {
        JSONObject j = new JSONObject();
        for (Map.Entry<String, Object> e : map.entrySet()) {
            try { j.put(e.getKey(), e.getValue()); } catch (Exception ignored) {}
        }
        return j;
    }
}
