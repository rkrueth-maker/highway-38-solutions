package com.highway38.office;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Builds the owner-phone position payload for the crewPositions store —
 * the same record shape the web app writes (commercial-app/mileage.js
 * reportOwnerPosition), one row per owner phone, upserted in place by
 * record key, so the Office "Find my phone" view reads web-reported and
 * natively-reported positions alike.
 *
 * Only owner/admin phones are ever reported: the caller checks the
 * pushed policy's ownerAdmin flag. Employee phones are never reported
 * by the background runner.
 *
 * Pure Java so the shape is JVM-unit-tested against the web contract.
 */
public final class PositionPayload {

    private PositionPayload() {}

    /** Stable per-phone record key: one crewPositions row per owner phone. */
    public static String recordKey(String userId) {
        return "OWNERPOS-" + userId;
    }

    public static Map<String, Object> build(String businessId, String userId, String userName,
                                            double lat, double lng, double accuracyM,
                                            long fixMs, long nowMs) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("Crew Position ID", recordKey(userId));
        r.put("Business ID", businessId);
        r.put("User ID", userId);
        r.put("User Name", userName);
        r.put("Lat", lat);
        r.put("Lng", lng);
        r.put("Accuracy", Math.max(0L, Math.round(accuracyM)));
        r.put("Timestamp", TripPayload.iso(fixMs));
        r.put("Created Time", TripPayload.iso(nowMs));
        r.put("Record Version", 1);
        r.put("Owner Phone", Boolean.TRUE);
        r.put("Source", "owner-phone-app");
        return r;
    }
}
