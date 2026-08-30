package com.highway38.resellerscout;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Source-specific Facebook intake that never receives Facebook credentials, cookies, or sessions.
 * Shared Marketplace links and local Facebook notification signals are always location-unproven
 * until a separate source proves distance or city/state.
 */
final class FacebookMarketplaceSourceInbox {
    private static final String PREFS = "h38_reseller_facebook_source_inbox_v1";
    private static final String SHARED_ROWS = "shared_rows";
    private static final int MAX_SHARED = 120;
    private static final int MAX_MERGED = 260;
    private static final Pattern ITEM_URL = Pattern.compile(
            "https?://(?:[a-z0-9-]+\\.)*facebook\\.com/marketplace/item/(\\d{6,})(?:[^\\s<]*)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SHARE_URL = Pattern.compile(
            "https?://(?:www\\.|m\\.)?facebook\\.com/share/(?:[a-z]/)?([A-Za-z0-9_-]{5,})(?:[^\\s<]*)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PRICE = Pattern.compile("\\$\\s*([0-9]{1,6}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)");

    private FacebookMarketplaceSourceInbox() {}

    static int captureSharedText(Context context, String rawText) {
        String raw = rawText == null ? "" : rawText.trim();
        if (raw.isBlank()) return 0;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(prefs.getString(SHARED_ROWS, "[]"));
            Map<String, JSONObject> merged = new LinkedHashMap<>();
            for (int i = 0; i < old.length(); i++) {
                JSONObject row = old.optJSONObject(i);
                if (row == null) continue;
                String id = row.optString("id", "");
                if (!id.isBlank()) merged.put(id, row);
            }

            int matched = 0;
            String title = sharedTitle(raw);
            Double price = sharedPrice(raw);
            Matcher itemMatcher = ITEM_URL.matcher(raw);
            while (itemMatcher.find()) {
                String id = itemMatcher.group(1);
                if (id == null || id.isBlank()) continue;
                matched++;
                String canonical = "https://www.facebook.com/marketplace/item/" + id + "/";
                JSONObject row = sharedRow(id, title, price, canonical, raw, true);
                merged.put(id, row);
            }

            if (matched == 0) {
                Matcher shareMatcher = SHARE_URL.matcher(raw);
                while (shareMatcher.find()) {
                    String token = shareMatcher.group(1);
                    String rawUrl = shareMatcher.group(0);
                    if (token == null || token.isBlank() || rawUrl == null || rawUrl.isBlank()) continue;
                    matched++;
                    String id = "facebook_share_" + Integer.toUnsignedString(rawUrl.toLowerCase(Locale.US).hashCode(), 36);
                    JSONObject row = sharedRow(id, title, price, rawUrl, raw, false);
                    row.put("source", "Facebook shared lead");
                    row.put("marketplace_url_proven", false);
                    row.put("location_evidence", "facebook_share_link_unproven");
                    merged.put(id, row);
                }
            }
            if (matched == 0) return 0;

            JSONArray save = new JSONArray();
            int skip = Math.max(0, merged.size() - MAX_SHARED);
            int index = 0;
            for (JSONObject row : merged.values()) {
                if (index++ < skip) continue;
                save.put(row);
            }
            prefs.edit().putString(SHARED_ROWS, save.toString()).apply();
            return matched;
        } catch (Exception ignored) {
            return 0;
        }
    }

    private static JSONObject sharedRow(String id, String title, Double price, String url, String raw, boolean marketplaceProven) throws Exception {
        JSONObject row = new JSONObject();
        row.put("id", id);
        if (marketplaceProven) row.put("marketplace_listing_id", id);
        row.put("source", marketplaceProven ? "Facebook Marketplace" : "Facebook shared lead");
        row.put("title", title);
        if (price == null) row.put("price", JSONObject.NULL); else row.put("price", price);
        row.put("url", url);
        row.put("provider", "facebook_android_share");
        row.put("capture_method", "ANDROID_SHARE");
        row.put("user_shared", true);
        row.put("public_only", false);
        row.put("browser_session", false);
        row.put("source_search_bound", false);
        row.put("marketplace_url_proven", marketplaceProven);
        row.put("location_verified", false);
        row.put("location_status", "LOCATION_UNPROVEN");
        row.put("location_evidence", marketplaceProven ? "shared_link_unproven" : "facebook_share_link_unproven");
        row.put("freshness_unproven", true);
        row.put("captured_at", System.currentTimeMillis());
        row.put("shared_text", raw.length() > 1200 ? raw.substring(0, 1200) : raw);
        return row;
    }

    static String mergedRowsJson(Context context, String browserJson, String notificationJson) {
        try {
            JSONArray browser = new JSONArray(browserJson == null ? "[]" : browserJson);
            JSONArray shared = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SHARED_ROWS, "[]"));
            JSONArray alerts = new JSONArray(notificationJson == null ? "[]" : notificationJson);
            Map<String, JSONObject> merged = new LinkedHashMap<>();
            int systemIndex = 0;

            for (int i = 0; i < browser.length(); i++) {
                JSONObject row = browser.optJSONObject(i);
                if (row == null) continue;
                if (row.optBoolean("h38_system", false)) {
                    merged.put("__system_" + systemIndex++, row);
                    continue;
                }
                put(merged, row);
            }
            for (int i = 0; i < shared.length(); i++) {
                JSONObject row = shared.optJSONObject(i);
                if (row != null) put(merged, row);
            }
            for (int i = 0; i < alerts.length(); i++) {
                JSONObject source = alerts.optJSONObject(i);
                if (source == null) continue;
                JSONObject row = new JSONObject(source.toString());
                String nativeId = row.optString("id", "");
                row.put("id", nativeId.isBlank() ? "facebook_notification_" + i : "facebook_notification_" + nativeId);
                row.put("source", "Facebook Marketplace alert");
                if (row.optString("title", "").isBlank()) row.put("title", "Facebook Marketplace alert");
                row.put("provider", "facebook_notification");
                row.put("capture_method", "FACEBOOK_NOTIFICATION");
                row.put("device_signal", true);
                row.put("public_only", false);
                row.put("browser_session", false);
                row.put("source_search_bound", false);
                row.put("marketplace_url_proven", false);
                row.put("location_verified", false);
                row.put("location_status", "LOCATION_UNPROVEN");
                row.put("location_evidence", "notification_unproven");
                row.put("freshness_unproven", true);
                if (!row.has("captured_at")) row.put("captured_at", row.optLong("posted_at", System.currentTimeMillis()));
                put(merged, row);
            }

            JSONArray out = new JSONArray();
            int count = 0;
            for (JSONObject row : merged.values()) {
                if (count++ >= MAX_MERGED) break;
                out.put(row);
            }
            return out.toString();
        } catch (Exception ignored) {
            return browserJson == null ? "[]" : browserJson;
        }
    }

    private static void put(Map<String, JSONObject> merged, JSONObject row) {
        String id = row.optString("marketplace_listing_id", row.optString("listing_id", row.optString("id", "")));
        String url = row.optString("url", "");
        String key = !id.isBlank() ? "id:" + id : !url.isBlank() ? "url:" + url : "row:" + row.toString().hashCode();
        merged.put(key, row);
    }

    private static Double sharedPrice(String raw) {
        Matcher m = PRICE.matcher(raw == null ? "" : raw);
        if (!m.find()) return null;
        try { return Double.parseDouble(m.group(1).replace(",", "")); }
        catch (Exception ignored) { return null; }
    }

    private static String sharedTitle(String raw) {
        String value = raw == null ? "" : ITEM_URL.matcher(raw).replaceAll(" ");
        value = SHARE_URL.matcher(value).replaceAll(" ");
        value = value.replaceAll("\\s+", " ").trim();
        String low = value.toLowerCase(Locale.US);
        if (value.length() < 4 || value.length() > 180 || low.equals("facebook") || low.equals("facebook marketplace")) {
            return "Shared Facebook lead";
        }
        return value;
    }
}
