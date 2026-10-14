package com.highway38.resellerscout;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native push (FCM) registration for Scout deal alerts, added in v3.2.0.
 *
 * The Deals shell's WebView has no PushManager/Notification API, so Web Push
 * can never buzz this phone. Instead the shell's Deal alerts card calls the
 * AndroidH38Deals bridge (pushSupported / pushState / pushRegister); this
 * class fetches the FCM device token and registers it with the
 * h38-scout-push edge function (action register_device) using the signed-in
 * user's Supabase session token, which binds the device to that user and
 * household server-side. The backend then sends the same plain-count penny /
 * resale alerts through FCM (see H38DealsMessagingService for display).
 *
 * Everything here is failure-tolerant: any exception is recorded in prefs
 * and reported to the shell as an error result — native push setup must
 * never crash or block app startup.
 */
public final class PushRegistrar {
    public static final String NATIVE_PUSH_REGISTRAR_V320 = "NATIVE_PUSH_REGISTRAR_V320";

    private static final String PREFS = "h38_deals_push";
    private static final String PUSH_URL =
            "https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-scout-push";
    // Browser-safe publishable key (already embedded in the public shell page;
    // it identifies the project, it is not a secret).
    private static final String PUBLISHABLE_KEY =
            "sb_publishable_CU5YZApPOiiCGC4S7TBzAg_WhbC__nM";

    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    public interface ResultListener {
        void onPushResult(JSONObject state);
    }

    private PushRegistrar() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String storedToken(Context ctx) {
        return prefs(ctx).getString("fcm_token", "");
    }

    public static String storedJwt(Context ctx) {
        return prefs(ctx).getString("jwt", "");
    }

    /** JSON state the shell reads via the bridge: {permission, registered, token}. */
    public static JSONObject stateJson(Context ctx) {
        JSONObject state = new JSONObject();
        try {
            boolean granted = notificationsGranted(ctx);
            boolean asked = prefs(ctx).getBoolean("permission_asked", false);
            String permission = granted ? "granted" : (asked ? "denied" : "default");
            state.put("permission", permission);
            state.put("registered", prefs(ctx).getBoolean("registered", false));
            state.put("token", storedToken(ctx));
            String err = prefs(ctx).getString("last_error", "");
            if (!err.isEmpty()) state.put("error", err);
        } catch (Exception ignored) {}
        return state;
    }

    public static boolean notificationsGranted(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(ctx, "android.permission.POST_NOTIFICATIONS")
                    == PackageManager.PERMISSION_GRANTED;
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    public static void markPermissionAsked(Context ctx) {
        prefs(ctx).edit().putBoolean("permission_asked", true).apply();
    }

    /** Records a freshly rotated FCM token (from the messaging service). */
    public static void onNewToken(Context ctx, String token) {
        if (token == null || token.isEmpty()) return;
        boolean changed = !token.equals(storedToken(ctx));
        prefs(ctx).edit().putString("fcm_token", token)
                .putBoolean("registered", !changed && prefs(ctx).getBoolean("registered", false))
                .apply();
        String jwt = storedJwt(ctx);
        if (changed && !jwt.isEmpty()) {
            register(ctx, token, jwt, null);
        }
    }

    /**
     * Bridge entry point: fetch the FCM token and register it with the
     * backend under this session. Reports back through the listener exactly
     * once, always.
     */
    public static void fetchTokenAndRegister(Context ctx, String jwt, ResultListener listener) {
        if (jwt != null && !jwt.isEmpty()) {
            prefs(ctx).edit().putString("jwt", jwt).apply();
        }
        try {
            FirebaseMessaging.getInstance().getToken()
                    .addOnCompleteListener(task -> {
                        if (!task.isSuccessful() || task.getResult() == null) {
                            recordError(ctx, "Could not get this phone's notification token from Google Play services.");
                            deliver(ctx, listener);
                            return;
                        }
                        String token = task.getResult();
                        prefs(ctx).edit().putString("fcm_token", token).apply();
                        register(ctx, token, jwt == null ? "" : jwt, listener);
                    });
        } catch (Throwable t) {
            recordError(ctx, "Native push is unavailable on this phone: " + t.getMessage());
            deliver(ctx, listener);
        }
    }

    private static void register(Context ctx, String token, String jwt, ResultListener listener) {
        IO.execute(() -> {
            try {
                if (jwt == null || jwt.isEmpty()) throw new Exception("Not signed in");
                JSONObject body = new JSONObject();
                body.put("action", "register_device");
                body.put("fcm_token", token);
                body.put("platform", "android");
                body.put("app_version", BuildConfig.VERSION_NAME);
                HttpURLConnection conn = (HttpURLConnection) new URL(PUSH_URL).openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("apikey", PUBLISHABLE_KEY);
                conn.setRequestProperty("Authorization", "Bearer " + jwt);
                byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream out = conn.getOutputStream()) { out.write(payload); }
                int status = conn.getResponseCode();
                StringBuilder sb = new StringBuilder();
                try (java.io.InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream()) {
                    if (in != null) {
                        byte[] buf = new byte[1024];
                        int n;
                        while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                    }
                }
                JSONObject res = new JSONObject(sb.toString());
                if (status >= 200 && status < 300 && res.optBoolean("ok", false)) {
                    prefs(ctx).edit().putBoolean("registered", true).remove("last_error").apply();
                } else {
                    recordError(ctx, "Deal-alert signup failed (HTTP " + status + ").");
                }
            } catch (Exception e) {
                recordError(ctx, "Deal-alert signup failed: " + e.getMessage());
            }
            deliver(ctx, listener);
        });
    }

    private static void recordError(Context ctx, String message) {
        try {
            prefs(ctx).edit().putString("last_error", message == null ? "unknown error" : message)
                    .putBoolean("registered", false).apply();
        } catch (Exception ignored) {}
    }

    private static void deliver(Context ctx, ResultListener listener) {
        if (listener != null) listener.onPushResult(stateJson(ctx));
    }
}
