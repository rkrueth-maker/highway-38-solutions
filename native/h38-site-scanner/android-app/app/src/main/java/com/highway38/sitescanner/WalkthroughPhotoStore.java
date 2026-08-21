package com.highway38.sitescanner;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import android.view.Surface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;

final class WalkthroughPhotoStore {
    private static final String PREFS = "h38-walkthrough-capture";
    private static final String PHOTO_KEY = "pending_walkthrough_photos";
    static final int MAX_PHOTOS = 12;

    private WalkthroughPhotoStore() {}

    static synchronized int count(Context context) {
        return validEntries(context, true).length();
    }

    private static int rotationCorrectionDegrees(Context context) {
        if (!(context instanceof Activity)) return 0;
        try {
            int rotation = ((Activity) context).getWindowManager().getDefaultDisplay().getRotation();
            if (rotation == Surface.ROTATION_90) return 270;
            if (rotation == Surface.ROTATION_180) return 180;
            if (rotation == Surface.ROTATION_270) return 90;
        } catch (Throwable ignored) {
        }
        return 0;
    }

    static synchronized int add(Context context, File file) {
        if (file == null || !file.exists() || file.length() < 1L) return count(context);
        JSONArray rows = validEntries(context, true);
        if (rows.length() >= MAX_PHOTOS) return rows.length();
        JSONObject row = new JSONObject();
        try {
            row.put("path", file.getAbsolutePath());
            row.put("name", file.getName());
            row.put("mime", "image/jpeg");
            row.put("size", file.length());
            row.put("capturedAt", System.currentTimeMillis());
            row.put("rotationDegrees", rotationCorrectionDegrees(context));
            rows.put(row);
            save(context, rows);
        } catch (Exception ignored) {
        }
        return rows.length();
    }

    static synchronized String info(Context context) {
        JSONObject result = new JSONObject();
        JSONArray rows = validEntries(context, true);
        JSONArray photos = new JSONArray();
        try {
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                File file = new File(row.optString("path", ""));
                if (!file.exists() || file.length() < 1L) continue;
                JSONObject item = new JSONObject();
                item.put("index", i);
                item.put("name", row.optString("name", file.getName()));
                item.put("mime", row.optString("mime", "image/jpeg"));
                item.put("size", file.length());
                item.put("capturedAt", row.optLong("capturedAt", 0L));
                item.put("rotationDegrees", row.optInt("rotationDegrees", 0));
                photos.put(item);
            }
            result.put("ready", photos.length() > 0);
            result.put("count", photos.length());
            result.put("max", MAX_PHOTOS);
            result.put("photos", photos);
        } catch (Exception ignored) {
        }
        return result.toString();
    }

    static synchronized String readChunk(Context context, int index, long offset, int requestedBytes) {
        if (index < 0 || offset < 0L) return "";
        int wanted = Math.max(1, Math.min(requestedBytes, 256 * 1024));
        JSONArray rows = validEntries(context, true);
        JSONObject row = rows.optJSONObject(index);
        if (row == null) return "";
        File file = new File(row.optString("path", ""));
        if (!file.exists() || file.length() < 1L) return "";
        try (InputStream stream = new FileInputStream(file)) {
            long remainingSkip = offset;
            while (remainingSkip > 0L) {
                long skipped = stream.skip(remainingSkip);
                if (skipped > 0L) {
                    remainingSkip -= skipped;
                    continue;
                }
                if (stream.read() < 0) return "";
                remainingSkip--;
            }
            byte[] buffer = new byte[wanted];
            int total = 0;
            while (total < wanted) {
                int read = stream.read(buffer, total, wanted - total);
                if (read < 0) break;
                total += read;
            }
            if (total < 1) return "";
            return Base64.encodeToString(buffer, 0, total, Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        }
    }

    static synchronized void clear(Context context, boolean deleteFiles) {
        JSONArray rows = validEntries(context, false);
        if (deleteFiles) {
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                String path = row.optString("path", "");
                if (path.trim().isEmpty()) continue;
                File file = new File(path);
                if (file.exists()) {
                    try { file.delete(); } catch (Exception ignored) {}
                }
            }
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(PHOTO_KEY)
                .apply();
    }

    private static JSONArray validEntries(Context context, boolean persistPruned) {
        JSONArray source = load(context);
        JSONArray valid = new JSONArray();
        for (int i = 0; i < source.length(); i++) {
            JSONObject row = source.optJSONObject(i);
            if (row == null) continue;
            String path = row.optString("path", "");
            if (path.trim().isEmpty()) continue;
            File file = new File(path);
            if (!file.exists() || file.length() < 1L) continue;
            valid.put(row);
        }
        if (persistPruned && valid.length() != source.length()) save(context, valid);
        return valid;
    }

    private static JSONArray load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PHOTO_KEY, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (Exception ignored) {
            return new JSONArray();
        }
    }

    private static void save(Context context, JSONArray rows) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(PHOTO_KEY, rows == null ? "[]" : rows.toString())
                .apply();
    }
}
