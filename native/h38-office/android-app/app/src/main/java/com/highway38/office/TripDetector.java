package com.highway38.office;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Drive-detection state machine — a faithful native port of the shipped web
 * detector in commercial-app/mileage.js (same thresholds, same semantics), so
 * a drive means the same thing on both engines:
 *
 *   good fix        accuracy &le; 65 m (unknown accuracy passes, as on the web)
 *   drive starts    &gt; 120 m from the parked anchor with speed &ge; 3.2 m/s
 *                   (unknown speed passes, as on the web), CONFIRMED by the
 *                   next fix also being out and plausibly reached — one
 *                   deliberate hardening over the web engine: background fixes
 *                   arrive sparser and noisier, and a single teleport spike
 *                   must not be able to invent a drive. Cost: one fix of
 *                   latency; the trip still starts at the anchor, so no
 *                   distance is lost.
 *   parked anchor   only moves on settled fixes (speed &lt; 0.6 m/s, or within
 *                   25 m) — a creeping start can never chase its own anchor
 *   distance        segments &ge; 8 m with implied speed &le; 55 m/s
 *   drive ends      sustained stillness (speed &lt; 0.6 m/s, or &lt; 25 m wander
 *                   when speed is unknown) for 150 s — the trip ends at the
 *                   moment stillness began
 *   discard         trips under 0.2 miles
 *
 * Path recording (Rick, 2026-10-29: "we want to record the paths people
 * drive in case they have detours") — SUPERSEDES the original endpoints-
 * only rule. The trip now keeps the driven path: exactly the fixes whose
 * segments make up the mileage (the start anchor plus every fix accepted
 * by accumulateSegment), accuracy-gated by the same GOOD_ACCURACY_M rule
 * as detection itself. Miles are the sum over the path's segments by
 * construction — never an endpoint-to-endpoint straight line — so a
 * detour counts in full. Parked jitter never enters: the path only grows
 * while driving, on segments of at least SEGMENT_MIN_M, and a closing
 * stillness truncates the path back to where movement (and mileage)
 * stopped. The list is capped (MAX_PATH_POINTS, decimated) so a payload
 * stays sane on very long drives.
 *
 * Pure Java (no Android APIs) so the JVM tests can drive it with synthetic
 * GPS traces.
 */
public final class TripDetector {

    public static final double GOOD_ACCURACY_M = 65.0;
    public static final double START_DISPLACEMENT_M = 120.0;
    public static final double START_SPEED_MPS = 3.2;
    public static final double SEGMENT_MIN_M = 8.0;
    public static final double SEGMENT_MAX_SPEED_MPS = 55.0;
    public static final double STILL_RADIUS_M = 25.0;
    public static final double STILL_SPEED_MPS = 0.6;
    public static final long STILL_REQUIRED_MS = 150_000L;
    public static final double MIN_TRIP_MILES = 0.2;
    public static final long GAP_CLOSE_MS = 600_000L;
    /** Path size cap; past it the stored path is decimated (see class doc). */
    public static final int MAX_PATH_POINTS = 2000;

    public static final class Fix {
        public final double lat;
        public final double lng;
        /** Metres; negative = unknown (passes the accuracy gate, web parity). */
        public final double accuracyM;
        /** Metres/second; null = unknown. */
        public final Double speedMps;
        public final long timeMs;

        public Fix(double lat, double lng, double accuracyM, Double speedMps, long timeMs) {
            this.lat = lat;
            this.lng = lng;
            this.accuracyM = accuracyM;
            this.speedMps = speedMps;
            this.timeMs = timeMs;
        }
    }

    public static final class CompletedTrip {
        public final long startedAtMs;
        public final long endedAtMs;
        public final double miles;
        public final double startLat;
        public final double startLng;
        public final double endLat;
        public final double endLng;
        /** The driven path: the accepted fixes whose segments sum to miles. */
        public final List<Fix> path;

        CompletedTrip(long startedAtMs, long endedAtMs, double milesMeters,
                      double startLat, double startLng, double endLat, double endLng,
                      List<Fix> path) {
            this.startedAtMs = startedAtMs;
            this.endedAtMs = endedAtMs;
            this.miles = milesMeters / GeoMath.METERS_PER_MILE;
            this.startLat = startLat;
            this.startLng = startLng;
            this.endLat = endLat;
            this.endLng = endLng;
            this.path = Collections.unmodifiableList(new ArrayList<>(path));
        }
    }

    public interface Listener {
        void onTripCompleted(CompletedTrip trip);
        void onDrivingChanged(boolean driving);
    }

    private final Listener listener;

    private Fix anchor;            // parked reference: freshest settled fix while parked
    private Fix candidate;         // first fix seen > 120 m out, awaiting confirmation
    private boolean driving;
    private Fix tripStartFix;      // the anchor fix the drive started from
    private Fix lastFix;           // last accepted fix while driving
    private double accumulatedM;   // running distance total over tripPath's segments
    private final List<Fix> tripPath = new ArrayList<>(); // the driven path (Rick 2026-10-29)
    private int pathCountAtStillStart; // tripPath size when the closing stillness began
    private Fix stillCenter;
    private long stillSinceMs;
    private double milesAtStillStartM;
    private Fix endCandidateFix;

    public TripDetector(Listener listener) {
        this.listener = listener;
    }

    public synchronized boolean isDriving() {
        return driving;
    }

    public synchronized void onFix(Fix f) {
        if (f == null) return;
        if (f.accuracyM > GOOD_ACCURACY_M) return; // poor fix: ignore entirely

        if (!driving) {
            if (anchor == null) { anchor = f; return; }
            double away = GeoMath.haversineM(anchor.lat, anchor.lng, f.lat, f.lng);
            boolean speedOk = f.speedMps == null || f.speedMps >= START_SPEED_MPS;
            boolean settled = (f.speedMps != null && f.speedMps < STILL_SPEED_MPS)
                    || away <= STILL_RADIUS_M;

            if (candidate != null) {
                double fromCandidate = GeoMath.haversineM(candidate.lat, candidate.lng, f.lat, f.lng);
                long dtMs = f.timeMs - candidate.timeMs;
                boolean plausible = dtMs <= 0
                        ? fromCandidate <= STILL_RADIUS_M
                        : fromCandidate / (dtMs / 1000.0) <= SEGMENT_MAX_SPEED_MPS;
                if (plausible && away > START_DISPLACEMENT_M && speedOk) {
                    // Confirmed: the drive really started at the anchor.
                    // The path starts as anchor -> candidate -> this fix,
                    // and the mileage is exactly those two segments.
                    driving = true;
                    tripStartFix = anchor;
                    tripPath.clear();
                    tripPath.add(anchor);
                    tripPath.add(candidate);
                    tripPath.add(f);
                    accumulatedM = GeoMath.haversineM(anchor.lat, anchor.lng, candidate.lat, candidate.lng)
                            + fromCandidate;
                    lastFix = f;
                    candidate = null;
                    stillSinceMs = 0;
                    stillCenter = null;
                    if (listener != null) listener.onDrivingChanged(true);
                    return;
                }
                // Not confirmed. A different far-out fix becomes the new
                // candidate; anything else clears it (it was a spike).
                candidate = (!plausible && away > START_DISPLACEMENT_M && speedOk) ? f : null;
                if (candidate == null && settled) anchor = f;
                return;
            }

            if (away > START_DISPLACEMENT_M && speedOk) {
                candidate = f; // first far-out fix: needs one confirmation
                return;
            }
            if (settled) anchor = f; // the anchor only moves on settled fixes
            return;
        }

        // Driving.
        if (lastFix != null && f.timeMs - lastFix.timeMs > GAP_CLOSE_MS) {
            // A long silence (phone off / no signal) ends the trip at the last
            // fix we actually saw, then this fix becomes the new anchor.
            closeTrip(lastFix.timeMs, lastFix, accumulatedM, tripPath);
            resetToParked(f);
            return;
        }
        if (lastFix != null) {
            double seg = GeoMath.haversineM(lastFix.lat, lastFix.lng, f.lat, f.lng);
            long dtMs = f.timeMs - lastFix.timeMs;
            if (dtMs > 0 && seg / (dtMs / 1000.0) > SEGMENT_MAX_SPEED_MPS) {
                return; // teleport spike: drop the fix entirely
            }
        }

        boolean stillNow = isStill(f);
        if (stillNow) {
            if (stillSinceMs == 0) {
                stillSinceMs = f.timeMs;
                stillCenter = f;
                milesAtStillStartM = accumulatedM;
                pathCountAtStillStart = tripPath.size();
                endCandidateFix = lastFix != null ? lastFix : f;
            } else if (GeoMath.haversineM(stillCenter.lat, stillCenter.lng, f.lat, f.lng) > STILL_RADIUS_M) {
                stillSinceMs = 0;
                stillCenter = null;
            }
            if (stillSinceMs > 0 && f.timeMs - stillSinceMs >= STILL_REQUIRED_MS) {
                // The trip ends where movement stopped: mileage AND path
                // both roll back to the stillness snapshot.
                closeTrip(stillSinceMs, endCandidateFix, milesAtStillStartM,
                        tripPath.subList(0, Math.min(pathCountAtStillStart, tripPath.size())));
                resetToParked(f);
                return;
            }
        } else {
            stillSinceMs = 0;
            stillCenter = null;
        }

        accumulateSegment(f);
        lastFix = f;
    }

    private boolean isStill(Fix f) {
        if (f.speedMps != null) return f.speedMps < STILL_SPEED_MPS;
        return lastFix != null
                && GeoMath.haversineM(lastFix.lat, lastFix.lng, f.lat, f.lng) < STILL_RADIUS_M;
    }

    private void accumulateSegment(Fix f) {
        if (lastFix == null) return;
        double seg = GeoMath.haversineM(lastFix.lat, lastFix.lng, f.lat, f.lng);
        if (seg < SEGMENT_MIN_M) return;
        long dtMs = f.timeMs - lastFix.timeMs;
        if (dtMs > 0 && seg / (dtMs / 1000.0) > SEGMENT_MAX_SPEED_MPS) return;
        accumulatedM += seg;
        appendPath(f);
    }

    private void appendPath(Fix f) {
        if (tripPath.size() >= MAX_PATH_POINTS) {
            // Very long drive: thin the stored path to every second point
            // (first point kept) so the payload stays sane. Mileage is
            // unaffected — it was already accumulated segment by segment.
            List<Fix> thinned = new ArrayList<>(tripPath.size() / 2 + 1);
            for (int i = 0; i < tripPath.size(); i += 2) thinned.add(tripPath.get(i));
            tripPath.clear();
            tripPath.addAll(thinned);
        }
        tripPath.add(f);
    }

    private void closeTrip(long endedAtMs, Fix endFix, double milesM, List<Fix> path) {
        double miles = milesM / GeoMath.METERS_PER_MILE;
        if (listener != null && miles >= MIN_TRIP_MILES && tripStartFix != null && endFix != null) {
            listener.onTripCompleted(new CompletedTrip(
                    tripStartFix.timeMs, endedAtMs, milesM,
                    tripStartFix.lat, tripStartFix.lng, endFix.lat, endFix.lng, path));
        }
    }

    private void resetToParked(Fix f) {
        boolean wasDriving = driving;
        driving = false;
        anchor = f;
        candidate = null;
        lastFix = null;
        tripStartFix = null;
        accumulatedM = 0;
        tripPath.clear();
        stillSinceMs = 0;
        stillCenter = null;
        if (wasDriving && listener != null) listener.onDrivingChanged(false);
    }

    /** Forget everything (sign-out, Off-Duty, policy off). No trip is emitted. */
    public synchronized void reset() {
        boolean wasDriving = driving;
        driving = false;
        anchor = null;
        candidate = null;
        lastFix = null;
        tripStartFix = null;
        accumulatedM = 0;
        tripPath.clear();
        stillSinceMs = 0;
        stillCenter = null;
        if (wasDriving && listener != null) listener.onDrivingChanged(false);
    }
}
