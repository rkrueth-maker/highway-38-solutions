package com.highway38.office;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import org.json.JSONObject;

/**
 * On-device state for the native tracker.
 *
 * Two stores, on purpose:
 *   - "h38_office_state" (plain): the policy snapshot + identity + wizard
 *     flags. Not secret; the web app pushed it and can re-push it any time.
 *   - "h38_office_session" (EncryptedSharedPreferences, Android Keystore):
 *     the Supabase session tokens. Never written anywhere in plain text,
 *     never logged.
 */
public final class PolicyStore {

    private static final String STATE_PREFS = "h38_office_state";
    private static final String SESSION_PREFS = "h38_office_session";

    private PolicyStore() {}

    // ---------------------------------------------------------------- session

    public static final class Session {
        public String supabaseUrl = "";
        public String publishableKey = "";
        public String accessToken = "";
        public String refreshToken = "";
        public long expiresAtMs = 0;
        /** Supabase auth user UUID — used for created_by/updated_by (RLS identity). */
        public String authUserId = "";
        /** Office user id from the web snapshot — the payload 'User ID' identity. */
        public String userId = "";
        public String userName = "";
        public String businessId = "";
        public String businessKey = "";

        public boolean present() {
            return !refreshToken.isEmpty() && !supabaseUrl.isEmpty() && !businessId.isEmpty();
        }
    }

    private static SharedPreferences sessionPrefs(Context ctx) throws Exception {
        MasterKey key = new MasterKey.Builder(ctx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(ctx, SESSION_PREFS, key,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    public static void saveSession(Context ctx, Session s) {
        try {
            sessionPrefs(ctx).edit()
                    .putString("url", s.supabaseUrl)
                    .putString("key", s.publishableKey)
                    .putString("access", s.accessToken)
                    .putString("refresh", s.refreshToken)
                    .putLong("expires", s.expiresAtMs)
                    .putString("auth_user_id", s.authUserId)
                    .putString("user_id", s.userId)
                    .putString("user_name", s.userName)
                    .putString("business_id", s.businessId)
                    .putString("business_key", s.businessKey)
                    .apply();
        } catch (Exception ignored) {
            // If the encrypted store is unavailable the session simply is not
            // persisted; the web app will push it again on next open.
        }
    }

    public static Session loadSession(Context ctx) {
        Session s = new Session();
        try {
            SharedPreferences p = sessionPrefs(ctx);
            s.supabaseUrl = p.getString("url", "");
            s.publishableKey = p.getString("key", "");
            s.accessToken = p.getString("access", "");
            s.refreshToken = p.getString("refresh", "");
            s.expiresAtMs = p.getLong("expires", 0);
            s.authUserId = p.getString("auth_user_id", "");
            s.userId = p.getString("user_id", "");
            s.userName = p.getString("user_name", "");
            s.businessId = p.getString("business_id", "");
            s.businessKey = p.getString("business_key", "");
        } catch (Exception ignored) {}
        return s;
    }

    public static void clearSession(Context ctx) {
        // Owner grace (1.0.4): the web layer fires its auth-cleared event
        // for far more than a deliberate sign-out — an update heal wiping
        // the WebView session, a tenant-scope change, a refresh-token
        // rotation landing badly. On 1.0.0–1.0.3 every one of those wiped
        // the native session + policy too, so background tracking died
        // with the WebView's sign-in and only ever lived in the shadow of
        // a recently-opened app — exactly the observed "output only at
        // app opens" pattern. For an OWNER's own phone the recording
        // switches are the stop control, not the WebView's auth state:
        // keep the snapshot (marked cleared-at for honesty) and let the
        // next real push supersede it. Employees keep the strict wipe —
        // their consent state must never outlive a sign-out.
        GateEvaluator.Policy p = null;
        try { p = loadPolicy(ctx); } catch (Exception ignored) {}
        if (p != null && p.ownerAdmin) {
            state(ctx).edit().putLong("p_cleared_at", System.currentTimeMillis()).apply();
            return;
        }
        try { sessionPrefs(ctx).edit().clear().apply(); } catch (Exception ignored) {}
        state(ctx).edit().clear().apply();
    }

    // ----------------------------------------------------------------- policy

    private static SharedPreferences state(Context ctx) {
        return ctx.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE);
    }

    public static void savePolicy(Context ctx, GateEvaluator.Policy p) {
        state(ctx).edit()
                .putBoolean("p_signed_in", p.signedIn)
                .putBoolean("p_pilot", p.pilotEnabled)
                .putBoolean("p_feature", p.featureOn)
                .putBoolean("p_recording", p.recordingOn)
                .putBoolean("p_off_duty", p.offDuty)
                .putBoolean("p_owner", p.ownerAdmin)
                .putBoolean("p_clocked_in", p.clockedIn)
                .putLong("p_pushed_at", p.pushedAtMs)
                .apply();
    }

    public static GateEvaluator.Policy loadPolicy(Context ctx) {
        SharedPreferences p = state(ctx);
        if (!p.contains("p_signed_in")) return null;
        return new GateEvaluator.Policy(
                p.getBoolean("p_signed_in", false),
                p.getBoolean("p_pilot", false),
                p.getBoolean("p_feature", false),
                p.getBoolean("p_recording", false),
                p.getBoolean("p_off_duty", false),
                p.getBoolean("p_owner", false),
                p.getBoolean("p_clocked_in", false),
                p.getLong("p_pushed_at", 0));
    }

    /** Applies a bridge policy push (JSON from the web app). */
    public static GateEvaluator.Policy applyBridgePush(Context ctx, JSONObject j) {
        Session s = loadSession(ctx);
        s.supabaseUrl = j.optString("supabaseUrl", s.supabaseUrl);
        s.publishableKey = j.optString("publishableKey", s.publishableKey);
        s.accessToken = j.optString("accessToken", s.accessToken);
        s.refreshToken = j.optString("refreshToken", s.refreshToken);
        s.expiresAtMs = j.optLong("expiresAtMs", s.expiresAtMs);
        s.authUserId = j.optString("authUserId", s.authUserId);
        s.userId = j.optString("userId", s.userId);
        s.userName = j.optString("userName", s.userName);
        s.businessId = j.optString("businessId", s.businessId);
        s.businessKey = j.optString("businessKey", s.businessKey);
        saveSession(ctx, s);
        // A live push supersedes any owner-grace snapshot kept by
        // clearSession — fresh sign-in state wins.
        state(ctx).edit().remove("p_cleared_at").apply();

        GateEvaluator.Policy p = new GateEvaluator.Policy(
                j.optBoolean("signedIn", false),
                j.optBoolean("pilotEnabled", false),
                j.optBoolean("featureOn", false),
                j.optBoolean("recordingOn", false),
                j.optBoolean("offDuty", false),
                j.optBoolean("ownerAdmin", false),
                j.optBoolean("clockedIn", false),
                System.currentTimeMillis());
        savePolicy(ctx, p);
        return p;
    }

    /** Native gate-input refresh: same switches, fresh clock/pilot, fresh stamp. */
    public static void refreshGateInputs(Context ctx, boolean clockedIn, boolean pilotEnabled) {
        GateEvaluator.Policy old = loadPolicy(ctx);
        if (old == null) return;
        savePolicy(ctx, new GateEvaluator.Policy(
                old.signedIn, pilotEnabled, old.featureOn, old.recordingOn,
                old.offDuty, old.ownerAdmin, clockedIn, System.currentTimeMillis()));
    }

    // ------------------------------------------------------------------ wizard

    public static boolean setupComplete(Context ctx) {
        return state(ctx).getBoolean("setup_complete", false);
    }

    public static void setSetupComplete(Context ctx, boolean done) {
        state(ctx).edit().putBoolean("setup_complete", done).apply();
    }
}
