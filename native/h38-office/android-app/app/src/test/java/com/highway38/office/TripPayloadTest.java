package com.highway38.office;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Map;

/** The native trip payload must match the web engine's record shape. */
public class TripPayloadTest {

    @Test
    public void payloadMatchesWebCloseTripShape() {
        TripDetector.CompletedTrip trip = new TripDetector.CompletedTrip(
                1_700_000_000_000L, 1_700_001_200_000L, 4828.0,
                47.2370, -93.5300, 47.2370, -93.4660, java.util.Collections.emptyList());
        Map<String, Object> r = TripPayload.build(trip, "TRIP-TEST1",
                "biz-1", "user-1", "Rick Krueth", 1_700_001_300_000L);

        assertEquals("TRIP-TEST1", r.get("Trip ID"));
        assertEquals("biz-1", r.get("Business ID"));
        assertEquals("user-1", r.get("User ID"));
        assertEquals("auto", r.get("Source"));
        assertEquals("Unreviewed", r.get("Status"));
        assertEquals("", r.get("Classification"));
        assertEquals(3.0, (Double) r.get("Miles"), 0.001);
        assertEquals("2023-11-14T22:13:20.000Z", r.get("Started At"));
        assertEquals("2023-11-14T22:33:20.000Z", r.get("Ended At"));
        assertEquals(47.2370, (Double) r.get("Start Lat"), 0.0001);
        assertEquals(-93.4660, (Double) r.get("End Lng"), 0.0001);
        assertEquals("", r.get("Suggested Classification"));
        assertEquals(0, r.get("Suggestion Score"));
        assertEquals(Boolean.TRUE, r.get("Native Delivered"));
        assertTrue(String.valueOf(r.get("Detection Note")).contains("H38 Office phone app"));
        assertEquals(1, r.get("Record Version"));
        // No path captured -> no Path field; endpoints + total are the record.
        assertTrue(!r.containsKey("Path"));
    }

    @Test
    @SuppressWarnings("unchecked")
    public void payloadCarriesTheDrivenPath() {
        java.util.List<TripDetector.Fix> path = java.util.Arrays.asList(
                new TripDetector.Fix(47.2370, -93.5300, 8, 0.0, 1_700_000_000_000L),
                new TripDetector.Fix(47.2370, -93.5200, 8, 13.4, 1_700_000_060_000L),
                new TripDetector.Fix(47.2460, -93.5200, 8, 13.4, 1_700_000_120_000L));
        TripDetector.CompletedTrip trip = new TripDetector.CompletedTrip(
                1_700_000_000_000L, 1_700_001_200_000L, 4828.0,
                47.2370, -93.5300, 47.2460, -93.5200, path);
        Map<String, Object> r = TripPayload.build(trip, "TRIP-TEST2",
                "biz-1", "user-1", "Rick Krueth", 1_700_001_300_000L);

        java.util.List<Object> stored = (java.util.List<Object>) r.get("Path");
        assertEquals(3, stored.size());
        Map<String, Object> first = (Map<String, Object>) stored.get(0);
        assertEquals(47.2370, (Double) first.get("Lat"), 0.0001);
        assertEquals(-93.5300, (Double) first.get("Lng"), 0.0001);
        assertEquals("2023-11-14T22:13:20.000Z", first.get("Timestamp"));
        Map<String, Object> last = (Map<String, Object>) stored.get(2);
        assertEquals(47.2460, (Double) last.get("Lat"), 0.0001);
    }

    @Test
    public void milesRoundToOneDecimalLikeTheWeb() {
        assertEquals(2.3, TripPayload.roundMiles(2.26), 0.001);
        assertEquals(2.2, TripPayload.roundMiles(2.24), 0.001);
        assertEquals(0.2, TripPayload.roundMiles(0.15), 0.001);
    }

    @Test
    public void tripIdsAreUniqueAndPrefixed() {
        String a = TripPayload.newTripId();
        String b = TripPayload.newTripId();
        assertTrue(a.startsWith("TRIP-"));
        assertTrue(!a.equals(b));
    }
}
