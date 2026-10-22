package com.highway38.office;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Builds the mileage-trip payload EXACTLY as the shipped web engine's
 * closeTrip() does (commercial-app/mileage.js), so a native-detected drive
 * lands in the same mileageTrips collection, in the same shape, and the web
 * classification engine treats it like any other auto-detected trip.
 *
 * Native additions, both inert to the web engine until it processes the trip:
 *   'Native Delivered': true  — marks the row for the engine's incoming pass
 *   'Detection Note'          — says plainly where the trip came from
 *
 * Pure Java (java.time only) so the shape is JVM-unit-tested against the
 * web contract.
 */
public final class TripPayload {

    public static final String DETECTION_NOTE =
            "Detected by the H38 Office phone app (background tracking).";

    private static final DateTimeFormatter ISO =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private TripPayload() {}

    public static String newTripId() {
        return "TRIP-" + UUID.randomUUID().toString().replace("-", "").substring(0, 20).toUpperCase();
    }

    public static String iso(long epochMs) {
        return ISO.format(Instant.ofEpochMilli(epochMs));
    }

    public static double roundMiles(double miles) {
        return Math.round(miles * 10.0) / 10.0;
    }

    /** The full record payload for one completed trip, web closeTrip() shape. */
    public static Map<String, Object> build(TripDetector.CompletedTrip trip, String tripId,
                                            String businessId, String userId, String userName,
                                            long nowMs) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("Trip ID", tripId);
        r.put("Business ID", businessId);
        r.put("User ID", userId);
        r.put("User Name", userName);
        r.put("Source", "auto");
        r.put("Status", "Unreviewed");
        r.put("Classification", ""); // web closeTrip(): '' until filed
        r.put("Job ID", "");
        r.put("Customer ID", "");
        r.put("Purpose", "");
        r.put("Started At", iso(trip.startedAtMs));
        r.put("Ended At", iso(trip.endedAtMs));
        r.put("Miles", roundMiles(trip.miles));
        r.put("Start Lat", trip.startLat);
        r.put("Start Lng", trip.startLng);
        r.put("End Lat", trip.endLat);
        r.put("End Lng", trip.endLng);
        r.put("Start Label", "");
        r.put("End Label", "");
        r.put("Suggested Classification", "");
        r.put("Suggested Job ID", "");
        r.put("Suggestion Reason", "");
        r.put("Suggestion Score", 0);
        r.put("Filed Place ID", "");
        r.put("Detection Note", DETECTION_NOTE);
        r.put("Native Delivered", Boolean.TRUE);
        r.put("Created Time", iso(nowMs));
        r.put("Updated Time", iso(nowMs));
        r.put("Record Version", 1);
        return r;
    }
}
