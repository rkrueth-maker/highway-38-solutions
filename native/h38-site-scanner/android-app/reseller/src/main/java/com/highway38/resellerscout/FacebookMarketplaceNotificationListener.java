package com.highway38.resellerscout;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class FacebookMarketplaceNotificationListener extends NotificationListenerService {
    private static final String PREFS = "h38_reseller_facebook_notifications_v1";
    private static final String ROWS = "rows";
    private static final int MAX_ROWS = 120;
    private static final Pattern PRICE = Pattern.compile("\\$\\s*([0-9]{1,6}(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?)");
    private static final Map<String, PendingIntent> OPEN_INTENTS = new ConcurrentHashMap<>();

    @Override public void onListenerConnected() {
        super.onListenerConnected();
        StatusBarNotification[] active = getActiveNotifications();
        if (active != null) for (StatusBarNotification sbn : active) capture(sbn);
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        capture(sbn);
    }

    private static boolean facebookPackage(String p) {
        if (p == null) return false;
        return p.equals("com.facebook.katana") || p.equals("com.facebook.lite");
    }

    private static String cs(Bundle b, String key) {
        CharSequence v = b == null ? null : b.getCharSequence(key);
        return v == null ? "" : v.toString().trim();
    }

    private static String combinedText(Notification n) {
        Bundle e = n == null ? null : n.extras;
        String title = cs(e, Notification.EXTRA_TITLE);
        String big = cs(e, Notification.EXTRA_BIG_TEXT);
        String text = cs(e, Notification.EXTRA_TEXT);
        String sub = cs(e, Notification.EXTRA_SUB_TEXT);
        StringBuilder out = new StringBuilder();
        for (String s : new String[]{title, big, text, sub}) {
            if (s == null || s.isBlank()) continue;
            if (out.indexOf(s) >= 0) continue;
            if (out.length() > 0) out.append(" · ");
            out.append(s);
        }
        return out.toString().trim();
    }

    private static boolean marketplaceLike(String raw) {
        String s = raw == null ? "" : raw.toLowerCase(Locale.US);
        if (s.contains("marketplace")) return true;
        if (s.contains("new listing") || s.contains("new listings") || s.contains("price drop") || s.contains("price dropped")) return true;
        if (s.contains("saved search") || s.contains("recently listed") || s.contains("items you may like") || s.contains("item you may like")) return true;
        if (s.contains("for sale") && PRICE.matcher(raw).find()) return true;
        return PRICE.matcher(raw).find() && (s.contains("listed") || s.contains("available near") || s.contains("near you"));
    }

    private static Double price(String raw) {
        Matcher m = PRICE.matcher(raw == null ? "" : raw);
        if (!m.find()) return null;
        try { return Double.parseDouble(m.group(1).replace(",", "")); }
        catch (Exception ignored) { return null; }
    }

    private void capture(StatusBarNotification sbn) {
        if (sbn == null || !facebookPackage(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        String raw = combinedText(n);
        if (raw.isBlank() || !marketplaceLike(raw)) return;

        String id = Integer.toHexString((sbn.getKey() + "|" + sbn.getPostTime()).hashCode());
        if (n != null && n.contentIntent != null) OPEN_INTENTS.put(id, n.contentIntent);

        Bundle e = n == null ? null : n.extras;
        String title = cs(e, Notification.EXTRA_TITLE);
        if (title.isBlank()) title = raw;
        Double p = price(raw);

        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray old = new JSONArray(prefs.getString(ROWS, "[]"));
            List<JSONObject> rows = new ArrayList<>();
            JSONObject row = new JSONObject();
            row.put("id", id);
            row.put("source", "Facebook Marketplace");
            row.put("title", title);
            row.put("text", raw);
            if (p != null) row.put("price", p);
            else row.put("price", JSONObject.NULL);
            row.put("posted_at", sbn.getPostTime());
            row.put("notification", true);
            row.put("can_open", n != null && n.contentIntent != null);
            rows.add(row);

            for (int i = 0; i < old.length(); i++) {
                JSONObject x = old.optJSONObject(i);
                if (x == null || id.equals(x.optString("id"))) continue;
                rows.add(x);
            }
            rows.sort(Comparator.comparingLong((JSONObject x) -> x.optLong("posted_at", 0L)).reversed());
            JSONArray save = new JSONArray();
            for (int i = 0; i < Math.min(MAX_ROWS, rows.size()); i++) save.put(rows.get(i));
            prefs.edit().putString(ROWS, save.toString()).apply();
        } catch (Exception ignored) {}
    }

    public static String rowsJson(Context context) {
        try {
            return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ROWS, "[]");
        } catch (Exception ignored) { return "[]"; }
    }

    public static boolean open(String id) {
        PendingIntent p = OPEN_INTENTS.get(id);
        if (p == null) return false;
        try { p.send(); return true; }
        catch (PendingIntent.CanceledException ignored) { return false; }
    }
}
