package com.highway38.resellerscout;

import android.app.Activity;
import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Owns the transport boundary for the four hosted H38 HTML documents.
 *
 * Supabase hosted Edge Function URLs intentionally rewrite HTML responses to
 * text/plain and inject a sandbox CSP. The product UIs still live on the web,
 * but Android validates those four document bodies and supplies the correct
 * browser document contract locally. JSON/API traffic and third-party
 * subresources are never intercepted.
 */
final class HostedHtmlWebViewClient extends WebViewClient {
    static final String TRANSPORT_MARKER = "H38_HOSTED_HTML_TRANSPORT_V311";
    static final String RAW_SOURCE_GUARD = "H38_RAW_SOURCE_GUARD_V311";
    static final String CSP_REPAIR_MARKER = "H38_HOSTED_CSP_REPAIR_V311";

    interface Navigator {
        boolean route(String url);
    }

    private static final String TAG = "H38HostedHtml";
    private static final String HOST = "jqukmwtsgcsaruucnqja.supabase.co";
    private static final String H38_CSP =
            "default-src 'self' https: data: blob:; " +
            "script-src 'self' https: 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' https: 'unsafe-inline'; " +
            "img-src 'self' https: data: blob:; " +
            "connect-src https:; " +
            "font-src 'self' https: data:; " +
            "media-src 'self' https: data: blob:; " +
            "frame-src https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
    private static final Set<String> HTML_PATHS = new HashSet<>();

    static {
        HTML_PATHS.add("/functions/v1/h38-deals-shell");
        HTML_PATHS.add("/functions/v1/h38-penny-web");
        HTML_PATHS.add("/functions/v1/h38-resale-web");
        HTML_PATHS.add("/functions/v1/h38-coupon-web");
    }

    private final Activity activity;
    private final Navigator navigator;
    private final Set<String> recoveryAttempted = new HashSet<>();

    HostedHtmlWebViewClient(Activity activity, Navigator navigator) {
        this.activity = activity;
        this.navigator = navigator;
    }

    @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return navigator.route(url);
    }

    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return navigator.route(request == null || request.getUrl() == null ? null : request.getUrl().toString());
    }

    @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        if (request == null || request.getUrl() == null || !request.isForMainFrame()) return null;
        String url = request.getUrl().toString();
        if (!isHostedHtmlPage(url)) return null;
        if (!"GET".equalsIgnoreCase(request.getMethod())) return htmlError("Unsupported page request.");
        return fetchHtml(url, request.getRequestHeaders());
    }

    @Override public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (!isHostedHtmlPage(url)) return;
        view.evaluateJavascript(
                "(function(){var t=(document.body&&document.body.innerText||'').trim().toLowerCase();" +
                        "var hasUi=!!document.querySelector('main,section,.wrap,.card');" +
                        "return document.contentType==='text/html'&&hasUi&&!t.startsWith('<!doctype html')&&!t.startsWith('<html');})()",
                value -> {
                    boolean ok = "true".equalsIgnoreCase(String.valueOf(value));
                    if (ok) {
                        synchronized (recoveryAttempted) { recoveryAttempted.remove(url); }
                        Log.i(TAG, "H38_HTML_RENDER_PASS " + url);
                        return;
                    }
                    Log.e(TAG, RAW_SOURCE_GUARD + " detected invalid hosted render: " + url);
                    boolean first;
                    synchronized (recoveryAttempted) { first = recoveryAttempted.add(url); }
                    if (first) {
                        activity.runOnUiThread(view::reload);
                    } else {
                        activity.runOnUiThread(() -> view.loadDataWithBaseURL(
                                url,
                                errorDocument("Hosted page could not be rendered safely. Tap Retry."),
                                "text/html",
                                "UTF-8",
                                url));
                    }
                });
    }

    static boolean isHostedHtmlPage(String value) {
        if (value == null || value.isBlank()) return false;
        try {
            Uri uri = Uri.parse(value);
            if (!"https".equalsIgnoreCase(uri.getScheme())) return false;
            if (!HOST.equalsIgnoreCase(uri.getHost())) return false;
            return HTML_PATHS.contains(uri.getPath());
        } catch (Exception ignored) {
            return false;
        }
    }

    private WebResourceResponse fetchHtml(String value, Map<String, String> requestHeaders) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(value).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(25000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1");
            connection.setRequestProperty("Accept-Encoding", "identity");
            String userAgent = requestHeaders == null ? null : requestHeaders.get("User-Agent");
            if (userAgent != null && !userAgent.isBlank()) connection.setRequestProperty("User-Agent", userAgent);

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                String message = "Hosted page returned HTTP " + status + ".";
                closeQuietly(connection.getErrorStream());
                connection.disconnect();
                return htmlError(message);
            }

            byte[] bytes = readFully(connection.getInputStream());
            String probe = new String(bytes, StandardCharsets.UTF_8).trim().toLowerCase(Locale.US);
            if (!(probe.startsWith("<!doctype html") || probe.startsWith("<html"))) {
                connection.disconnect();
                return htmlError("Hosted page returned non-HTML content.");
            }

            // Do not propagate Supabase's platform-injected text/plain/sandbox
            // response contract into the WebView. We intentionally construct the
            // four known H38 documents as HTML and give them the policy they need.
            Map<String, String> responseHeaders = documentHeaders();
            connection.disconnect();

            WebResourceResponse response = new WebResourceResponse(
                    "text/html",
                    "UTF-8",
                    new ByteArrayInputStream(bytes));
            response.setStatusCodeAndReasonPhrase(200, "OK");
            response.setResponseHeaders(responseHeaders);
            return response;
        } catch (Exception e) {
            if (connection != null) connection.disconnect();
            Log.e(TAG, "Hosted HTML transport failed for " + value, e);
            return htmlError("Could not load H38 Deals. Check your connection and tap Retry.");
        }
    }

    private static Map<String, String> documentHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "text/html; charset=utf-8");
        headers.put("Cache-Control", "no-store");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Content-Security-Policy", H38_CSP);
        headers.put("Referrer-Policy", "no-referrer");
        headers.put("X-H38-Hosted-Transport", TRANSPORT_MARKER);
        headers.put("X-H38-CSP-Repair", CSP_REPAIR_MARKER);
        return headers;
    }

    private static byte[] readFully(InputStream input) throws Exception {
        try (InputStream in = input; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) >= 0) {
                if (count > 0) out.write(buffer, 0, count);
            }
            return out.toByteArray();
        }
    }

    private static void closeQuietly(InputStream input) {
        if (input == null) return;
        try { input.close(); } catch (Exception ignored) {}
    }

    private static WebResourceResponse htmlError(String message) {
        byte[] bytes = errorDocument(message).getBytes(StandardCharsets.UTF_8);
        WebResourceResponse response = new WebResourceResponse(
                "text/html",
                "UTF-8",
                new ByteArrayInputStream(bytes));
        response.setStatusCodeAndReasonPhrase(200, "OK");
        response.setResponseHeaders(documentHeaders());
        return response;
    }

    private static String errorDocument(String message) {
        String clean = message == null ? "Unable to load H38 Deals." : message
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
        return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                "<title>H38 Deals</title><style>body{font-family:system-ui;background:#f3f6f8;color:#102331;margin:0;padding:28px}" +
                ".box{max-width:520px;margin:auto;background:white;border:1px solid #dbe3e8;border-radius:18px;padding:20px}" +
                "button{border:0;border-radius:12px;background:#0b2438;color:white;padding:12px 16px;font-weight:700}</style></head>" +
                "<body><main class='box'><h1>H38 Deals</h1><p>" + clean + "</p>" +
                "<button onclick=\"window.AndroidH38Deals&&AndroidH38Deals.reload()\">Retry</button></main></body></html>";
    }
}
