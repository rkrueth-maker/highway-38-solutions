package com.highway38.office;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.Map;

/** The native owner-position payload must match the web record shape. */
public class PositionPayloadTest {

    @Test
    public void recordKeyIsStablePerUser() {
        assertEquals("OWNERPOS-user-1", PositionPayload.recordKey("user-1"));
        assertEquals(PositionPayload.recordKey("user-1"), PositionPayload.recordKey("user-1"));
    }

    @Test
    public void payloadMatchesWebCrewPositionShape() {
        Map<String, Object> r = PositionPayload.build("biz-1", "user-1", "Rick Krueth",
                47.2370, -93.5300, 12.4, 1_700_000_000_000L, 1_700_000_060_000L);

        assertEquals("OWNERPOS-user-1", r.get("Crew Position ID"));
        assertEquals("biz-1", r.get("Business ID"));
        assertEquals("user-1", r.get("User ID"));
        assertEquals("Rick Krueth", r.get("User Name"));
        assertEquals(47.2370, (Double) r.get("Lat"), 0.0001);
        assertEquals(-93.5300, (Double) r.get("Lng"), 0.0001);
        assertEquals(12L, r.get("Accuracy"));
        assertEquals("2023-11-14T22:13:20.000Z", r.get("Timestamp"));
        assertEquals(Boolean.TRUE, r.get("Owner Phone"));
        assertEquals("owner-phone-app", r.get("Source"));
        assertEquals(1, r.get("Record Version"));
    }

    @Test
    public void negativeAccuracyClampsToZero() {
        Map<String, Object> r = PositionPayload.build("biz-1", "user-1", "Rick Krueth",
                47.0, -93.0, -1, 1_700_000_000_000L, 1_700_000_000_000L);
        assertEquals(0L, r.get("Accuracy"));
        assertTrue(((String) r.get("Timestamp")).endsWith("Z"));
    }

    @Test
    public void historyRecordKeyIsPerReport() {
        assertEquals("POSHIST-user-1-1700000060000",
                PositionPayload.historyRecordKey("user-1", 1_700_000_060_000L));
        assertEquals(PositionPayload.historyRecordKey("user-1", 1_700_000_060_000L),
                PositionPayload.historyRecordKey("user-1", 1_700_000_060_000L));
    }

    @Test
    public void historyPayloadCarriesThePositionShapePlusItsOwnId() {
        Map<String, Object> pos = PositionPayload.build("biz-1", "user-1", "Rick Krueth",
                47.2370, -93.5300, 12.4, 1_700_000_000_000L, 1_700_000_060_000L);
        Map<String, Object> hist = PositionPayload.historyBuild("biz-1", "user-1", "Rick Krueth",
                47.2370, -93.5300, 12.4, 1_700_000_000_000L, 1_700_000_060_000L);

        // Every field the OWNERPOS payload carries, with the same values...
        for (Map.Entry<String, Object> e : pos.entrySet()) {
            assertEquals("field " + e.getKey(), e.getValue(), hist.get(e.getKey()));
        }
        // ...plus the history row's own identity, keyed by report time.
        assertEquals("POSHIST-user-1-1700000060000", hist.get("Crew Position History ID"));
        assertEquals(pos.size() + 1, hist.size());
        assertEquals("crewPositionHistory", PositionPayload.HISTORY_COLLECTION);
    }

    @Test
    public void sameFixReportedTwiceStaysTwoCheckIns() {
        // A parked phone re-reports the same cached fix on consecutive
        // heartbeats. Each report is a check-in and must stay its own
        // history row — keys differ because they key on report time.
        String first = PositionPayload.historyRecordKey("user-1", 1_700_000_060_000L);
        String second = PositionPayload.historyRecordKey("user-1", 1_700_000_960_000L);
        assertTrue(!first.equals(second));
    }
}
