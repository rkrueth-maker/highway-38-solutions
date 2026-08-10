package com.highway38.sitescanner;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewFeature;

import java.io.InputStream;

/**
 * Installs the native walkthrough recovery interceptor before the Business Office WebView starts.
 *
 * The Business Office is controlled by a service worker. Requests made by that worker do not
 * reliably pass through MainActivity.WebViewClient.shouldInterceptRequest(), which left a
 * successfully recorded private CameraX video waiting forever after Android recreated the
 * WebView. ServiceWorkerClientCompat is the correct Android boundary for that request path.
 */
public final class WalkthroughRecoveryProvider extends ContentProvider {
    private static final String CAPTURE_PREFS = "h38-walkthrough-capture";
    private static final String CAPTURE_URI_KEY = "pending_uri";
    private static final String CAPTURE_READY_KEY = "ready";
    private static final String RECOVERY_URL =
            "https://highway38solutions.com/commercial-app/__native_walkthrough_recovery";

    @Override
    public boolean onCreate() {
        Context context = getContext();
        if (context == null) return false;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
            return true;
        }
        try {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(
                    new ServiceWorkerClientCompat() {
                        @Nullable
                        @Override
                        public WebResourceResponse shouldInterceptRequest(
                                @NonNull WebResourceRequest request
                        ) {
                            Uri requestUri = request.getUrl();
                            if (requestUri == null || !RECOVERY_URL.equals(requestUri.toString())) {
                                return null;
                            }
                            return openRecoveredVideo(context.getApplicationContext());
                        }
                    }
            );
        } catch (Throwable ignored) {
            // MainActivity still retains its normal WebViewClient recovery interceptor.
        }
        return true;
    }

    @Nullable
    private static WebResourceResponse openRecoveredVideo(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(CAPTURE_PREFS, Context.MODE_PRIVATE);
            if (!prefs.getBoolean(CAPTURE_READY_KEY, false)) return null;
            String value = prefs.getString(CAPTURE_URI_KEY, "");
            if (value == null || value.trim().isEmpty()) return null;
            Uri videoUri = Uri.parse(value);
            InputStream stream = context.getContentResolver().openInputStream(videoUri);
            if (stream == null) return null;
            String mime = context.getContentResolver().getType(videoUri);
            if (mime == null || mime.trim().isEmpty()) mime = "video/mp4";
            return new WebResourceResponse(mime, null, stream);
        } catch (Throwable ignored) {
            return null;
        }
    }

    @Nullable @Override public Cursor query(@NonNull Uri uri, @Nullable String[] projection, @Nullable String selection, @Nullable String[] selectionArgs, @Nullable String sortOrder) { return null; }
    @Nullable @Override public String getType(@NonNull Uri uri) { return null; }
    @Nullable @Override public Uri insert(@NonNull Uri uri, @Nullable ContentValues values) { return null; }
    @Override public int delete(@NonNull Uri uri, @Nullable String selection, @Nullable String[] selectionArgs) { return 0; }
    @Override public int update(@NonNull Uri uri, @Nullable ContentValues values, @Nullable String selection, @Nullable String[] selectionArgs) { return 0; }
}
