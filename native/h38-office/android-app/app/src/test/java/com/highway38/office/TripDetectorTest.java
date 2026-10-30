package com.highway38.office;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Drives the pure detection state machine with synthetic GPS traces.
 * The behaviour contract mirrors the shipped web detector in
 * commercial-app/mileage.js.
 */
public class TripDetectorTest {

    private static final double HOME_LAT = 47.2370;   // Grand Rapids, MN area
    private static final double HOME_LNG = -93.5300;
    private static final long T0 = 1_700_000_000_000L;

    private static final class Collector implements TripDetector.Listener {
        final List<TripDetector.CompletedTrip> trips = new ArrayList<>();
        @Override public void onTripCompleted(TripDetector.CompletedTrip t) { trips.add(t); }
        @Override public void onDrivingChanged(boolean driving) {}
    }

    private static TripDetector.Fix fix(double lat, double lng, double acc, Double speed, long t) {
        return new TripDetector.Fix(lat, lng, acc, speed, t);
    }

    /** Feeds parked fixes (speed 0) at one point. Returns the next timestamp. */
    private static long park(TripDetector d, double lat, double lng, long fromMs, long durationMs, long stepMs) {
        long t = fromMs;
        while (t <= fromMs + durationMs) {
            d.onFix(fix(lat, lng, 8, 0.0, t));
            t += stepMs;
        }
        return t;
    }

    /**
     * Feeds a straight drive: {@code meters} at {@code speedMps}, one fix every
     * {@code stepMs}, starting at (lat,lng) heading {@code bearingDeg}.
     * Returns {endLat, endLng, nextTimestamp}.
     */
    private static double[] drive(TripDetector d, double lat, double lng, double bearingDeg,
                                  double meters, double speedMps, long fromMs, long stepMs) {
        double stepM = speedMps * (stepMs / 1000.0);
        int steps = (int) Math.floor(meters / stepM);
        double[] pos = {lat, lng};
        long t = fromMs;
        for (int i = 0; i < steps; i++) {
            pos = GeoMath.destination(pos[0], pos[1], bearingDeg, stepM);
            t += stepMs;
            d.onFix(fix(pos[0], pos[1], 8, speedMps, t));
        }
        return new double[]{pos[0], pos[1], t};
    }

    @Test
    public void parkedJitterProducesNoTrip() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = T0;
        // 10 minutes of GPS wander within ~30 m of home, device reporting still.
        for (int i = 0; i < 120; i++) {
            double[] p = GeoMath.destination(HOME_LAT, HOME_LNG, (i * 37) % 360, 12 + (i % 5) * 4);
            d.onFix(fix(p[0], p[1], 12, 0.0, t));
            t += 5_000;
        }
        assertEquals(0, c.trips.size());
    }

    @Test
    public void simpleDriveLandsWithinTolerance() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 60_000, 10_000);
        double[] end = drive(d, HOME_LAT, HOME_LNG, 90, 4828, 13.4, t, 5_000); // 3.00 mi east
        park(d, end[0], end[1], (long) end[2], 240_000, 10_000);
        assertEquals(1, c.trips.size());
        TripDetector.CompletedTrip trip = c.trips.get(0);
        assertTrue("miles=" + trip.miles, trip.miles > 2.8 && trip.miles < 3.2);
        assertTrue(GeoMath.haversineM(trip.startLat, trip.startLng, HOME_LAT, HOME_LNG) < 60);
        assertTrue(GeoMath.haversineM(trip.endLat, trip.endLng, end[0], end[1]) < 120);
        assertTrue(trip.endedAtMs > trip.startedAtMs);
    }

    @Test
    public void shortPauseDoesNotSplitTheDrive() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 30_000, 10_000);
        double[] mid = drive(d, HOME_LAT, HOME_LNG, 0, 1931, 13.4, t, 5_000);      // 1.20 mi north
        long t2 = park(d, mid[0], mid[1], (long) mid[2], 60_000, 10_000);          // 60 s stop (< 150 s)
        double[] end = drive(d, mid[0], mid[1], 0, 1609, 13.4, t2, 5_000);         // 1.00 mi more
        park(d, end[0], end[1], (long) end[2], 240_000, 10_000);
        assertEquals(1, c.trips.size());
        assertTrue("miles=" + c.trips.get(0).miles,
                c.trips.get(0).miles > 2.0 && c.trips.get(0).miles < 2.4);
    }

    @Test
    public void longParkSplitsIntoTwoDrives() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 30_000, 10_000);
        double[] mid = drive(d, HOME_LAT, HOME_LNG, 90, 1609, 13.4, t, 5_000);     // 1.00 mi
        long t2 = park(d, mid[0], mid[1], (long) mid[2], 720_000, 15_000);         // 12 min parked
        double[] end = drive(d, mid[0], mid[1], 90, 2414, 13.4, t2, 5_000);        // 1.50 mi
        park(d, end[0], end[1], (long) end[2], 240_000, 10_000);
        assertEquals(2, c.trips.size());
        assertTrue(c.trips.get(0).miles > 0.85 && c.trips.get(0).miles < 1.15);
        assertTrue(c.trips.get(1).miles > 1.35 && c.trips.get(1).miles < 1.65);
    }

    @Test
    public void walkingDoesNotStartATrip() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 20_000, 10_000);
        double[] end = drive(d, HOME_LAT, HOME_LNG, 45, 600, 1.2, t, 5_000);       // on foot
        park(d, end[0], end[1], (long) end[2], 240_000, 10_000);
        assertEquals(0, c.trips.size());
    }

    @Test
    public void teleportSpikeIsRejected() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 30_000, 10_000);
        double[] pos = {HOME_LAT, HOME_LNG};
        long tt = t;
        // 2 miles east at 30 mph, with one wild 5 km spike in the middle.
        for (int i = 0; i < 48; i++) {
            pos = GeoMath.destination(pos[0], pos[1], 90, 67);
            tt += 5_000;
            if (i == 24) {
                d.onFix(fix(pos[0] + 0.045, pos[1], 8, 13.4, tt)); // ~5 km north spike
                tt += 5_000;
            }
            d.onFix(fix(pos[0], pos[1], 8, 13.4, tt));
        }
        park(d, pos[0], pos[1], tt, 240_000, 10_000);
        assertEquals(1, c.trips.size());
        assertTrue("miles=" + c.trips.get(0).miles,
                c.trips.get(0).miles > 1.8 && c.trips.get(0).miles < 2.2);
    }

    @Test
    public void shortHopIsDiscarded() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 30_000, 10_000);
        double[] end = drive(d, HOME_LAT, HOME_LNG, 90, 241, 8.9, t, 5_000);       // 0.15 mi
        park(d, end[0], end[1], (long) end[2], 240_000, 10_000);
        assertEquals(0, c.trips.size());
    }

    @Test
    public void poorAccuracyFixesAreIgnored() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = T0;
        // Wild fixes with terrible accuracy must never start or extend a trip.
        for (int i = 0; i < 40; i++) {
            double[] p = GeoMath.destination(HOME_LAT, HOME_LNG, 90, i * 300.0);
            d.onFix(fix(p[0], p[1], 400, 20.0, t));
            t += 5_000;
        }
        assertEquals(0, c.trips.size());
    }

    /** Sum of consecutive haversine segments over a stored path, in miles. */
    private static double pathMiles(List<TripDetector.Fix> path) {
        double m = 0;
        for (int i = 1; i < path.size(); i++) {
            TripDetector.Fix a = path.get(i - 1), b = path.get(i);
            m += GeoMath.haversineM(a.lat, a.lng, b.lat, b.lng);
        }
        return m / GeoMath.METERS_PER_MILE;
    }

    @Test
    public void detourPathIsRecordedAndMilesComeFromThePath() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 60_000, 10_000);
        double[] mid = drive(d, HOME_LAT, HOME_LNG, 90, 1609, 13.4, t, 5_000);      // 1.00 mi east
        double[] end = drive(d, mid[0], mid[1], 0, 1609, 13.4, (long) mid[2], 5_000); // 1.00 mi north (the detour)
        park(d, end[0], end[1], (long) end[2], 240_000, 10_000);
        assertEquals(1, c.trips.size());
        TripDetector.CompletedTrip trip = c.trips.get(0);
        // The driven path is stored: starts at home, ends at the destination,
        // and carries the drive's fixes, not just the endpoints.
        assertTrue("path size=" + trip.path.size(), trip.path.size() > 30);
        TripDetector.Fix first = trip.path.get(0);
        TripDetector.Fix last = trip.path.get(trip.path.size() - 1);
        assertTrue(GeoMath.haversineM(first.lat, first.lng, HOME_LAT, HOME_LNG) < 60);
        assertTrue(GeoMath.haversineM(last.lat, last.lng, end[0], end[1]) < 120);
        // Miles are the path's miles: the L-shaped drive is ~2.0 mi while the
        // straight line home->end is only ~1.41 mi. The detour counts.
        double straight = GeoMath.haversineM(HOME_LAT, HOME_LNG, end[0], end[1]) / GeoMath.METERS_PER_MILE;
        assertTrue("miles=" + trip.miles + " straight=" + straight,
                trip.miles > straight * 1.25);
        assertEquals(trip.miles, pathMiles(trip.path), 0.03);
    }

    @Test
    public void pathStopsWhereMovementStops() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 60_000, 10_000);
        double[] end = drive(d, HOME_LAT, HOME_LNG, 90, 2414, 13.4, t, 5_000); // 1.50 mi east
        // Arrive, then 4 minutes of parked GPS jitter (8-12 m wander,
        // inside the detector's 25 m still radius).
        long tt = (long) end[2];
        for (int i = 0; i < 24; i++) {
            double[] p = GeoMath.destination(end[0], end[1], (i * 53) % 360, 8 + (i % 3) * 2);
            tt += 10_000;
            d.onFix(fix(p[0], p[1], 10, 0.0, tt));
        }
        assertEquals(1, c.trips.size());
        TripDetector.CompletedTrip trip = c.trips.get(0);
        // The parked jitter is not in the path: it ends at the arrival point,
        // and the path still sums to the recorded miles.
        TripDetector.Fix last = trip.path.get(trip.path.size() - 1);
        assertTrue("last path point drifted " + GeoMath.haversineM(last.lat, last.lng, end[0], end[1]) + " m",
                GeoMath.haversineM(last.lat, last.lng, end[0], end[1]) < 40);
        assertEquals(trip.miles, pathMiles(trip.path), 0.03);
        assertTrue("miles=" + trip.miles, trip.miles > 1.35 && trip.miles < 1.65);
    }

    @Test
    public void midDriveStopAddsNoPathPoints() {
        Collector c = new Collector();
        TripDetector d = new TripDetector(c);
        long t = park(d, HOME_LAT, HOME_LNG, T0, 60_000, 10_000);
        double[] mid = drive(d, HOME_LAT, HOME_LNG, 90, 1609, 13.4, t, 5_000);   // 1.00 mi east
        // A 60 s mid-drive stop (under the 150 s close): GPS wander at speed 0.
        long tt = (long) mid[2];
        for (int i = 0; i < 6; i++) {
            double[] p = GeoMath.destination(mid[0], mid[1], (i * 71) % 360, 9 + (i % 3) * 2);
            tt += 10_000;
            d.onFix(fix(p[0], p[1], 10, 0.0, tt));
        }
        double[] end = drive(d, mid[0], mid[1], 90, 1609, 13.4, tt, 5_000);       // 1.00 mi more
        park(d, end[0], end[1], (long) end[2], 240_000, 10_000);
        assertEquals(1, c.trips.size());
        TripDetector.CompletedTrip trip = c.trips.get(0);
        // Rick's rule: path points only while moving. The stop's wander
        // fixes (9-13 m from the stop point) are not in the path: at most
        // the arrival and departure points sit near the stop point.
        int nearStop = 0;
        for (TripDetector.Fix p : trip.path) {
            if (GeoMath.haversineM(p.lat, p.lng, mid[0], mid[1]) <= 20) nearStop++;
        }
        assertTrue("points near the mid-drive stop=" + nearStop + " of " + trip.path.size(),
                nearStop <= 3);
        assertTrue("miles=" + trip.miles, trip.miles > 1.8 && trip.miles < 2.3);
    }
}
