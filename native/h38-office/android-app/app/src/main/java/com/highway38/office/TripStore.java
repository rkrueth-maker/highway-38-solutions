package com.highway38.office;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The on-device delivery queue for detected trips. A trip lives here from the
 * moment the detector closes it until the server upsert is confirmed — across
 * process death, reboots, and offline stretches. Delivery is idempotent (the
 * Trip ID is the business_records record_key), so a retry can never create a
 * duplicate trip in the Office.
 *
 * Only trip records are stored. Location fixes are never persisted.
 */
public final class TripStore extends SQLiteOpenHelper {

    private static final String DB_NAME = "h38_office_trips.db";
    private static final int DB_VERSION = 1;
    private static final String TABLE = "pending_trips";

    public static final class Pending {
        public final String tripId;
        public final JSONObject payload;
        public final int attempts;

        Pending(String tripId, JSONObject payload, int attempts) {
            this.tripId = tripId;
            this.payload = payload;
            this.attempts = attempts;
        }
    }

    public TripStore(Context ctx) {
        super(ctx.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE " + TABLE + " ("
                + "trip_id TEXT PRIMARY KEY, "
                + "payload TEXT NOT NULL, "
                + "created_ms INTEGER NOT NULL, "
                + "attempts INTEGER NOT NULL DEFAULT 0, "
                + "last_error TEXT)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldV, int newV) {
        // v1: no migrations yet. Never drop the queue — undelivered trips are data.
    }

    public synchronized void add(JSONObject payload) {
        ContentValues v = new ContentValues();
        v.put("trip_id", payload.optString("Trip ID"));
        v.put("payload", payload.toString());
        v.put("created_ms", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict(TABLE, null, v, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public synchronized List<Pending> all() {
        List<Pending> out = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query(TABLE,
                new String[]{"trip_id", "payload", "attempts"}, null, null, null, null, "created_ms ASC")) {
            while (c.moveToNext()) {
                try {
                    out.add(new Pending(c.getString(0), new JSONObject(c.getString(1)), c.getInt(2)));
                } catch (Exception ignored) {}
            }
        }
        return out;
    }

    public synchronized int count() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM " + TABLE, null)) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    public synchronized void remove(String tripId) {
        getWritableDatabase().delete(TABLE, "trip_id = ?", new String[]{tripId});
    }

    public synchronized void markAttempt(String tripId, String error) {
        getWritableDatabase().execSQL(
                "UPDATE " + TABLE + " SET attempts = attempts + 1, last_error = ? WHERE trip_id = ?",
                new Object[]{error, tripId});
    }
}
