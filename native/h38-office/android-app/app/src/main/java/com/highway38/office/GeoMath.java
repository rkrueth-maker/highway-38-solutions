package com.highway38.office;

/** Pure spherical-distance helpers. No Android APIs — JVM unit-testable. */
public final class GeoMath {
    private static final double EARTH_RADIUS_M = 6_371_000.0;
    public static final double METERS_PER_MILE = 1609.344;

    private GeoMath() {}

    public static double haversineM(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    /**
     * Parked-watcher movement trigger. The TripDetector only accepts fixes
     * with accuracy &le; 65 m, but the low-power parked location profile
     * routinely delivers fixes far coarser than that away from Wi-Fi — so
     * the detector alone can never see a drive begin. This coarse trigger
     * is the escape hatch: any fix (accuracy up to 500 m; negative =
     * unknown, which passes) landing more than 250 m from the parked
     * anchor means "the phone is really moving — switch to high-accuracy
     * and let the detector judge." Never used to measure distance itself.
     */
    public static final double CONFIRM_ACCURACY_M = 500.0;
    public static final double CONFIRM_DISPLACEMENT_M = 250.0;

    public static boolean shouldConfirmDrive(double anchorLat, double anchorLng,
                                             double lat, double lng, double accuracyM) {
        if (accuracyM > CONFIRM_ACCURACY_M) return false;
        return haversineM(anchorLat, anchorLng, lat, lng) > CONFIRM_DISPLACEMENT_M;
    }

    /** Destination point after travelling {@code distanceM} metres at {@code bearingDeg} (0 = north). */
    public static double[] destination(double lat, double lng, double bearingDeg, double distanceM) {
        double d = distanceM / EARTH_RADIUS_M;
        double br = Math.toRadians(bearingDeg);
        double la1 = Math.toRadians(lat);
        double lo1 = Math.toRadians(lng);
        double la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
        double lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1),
                Math.cos(d) - Math.sin(la1) * Math.sin(la2));
        return new double[]{Math.toDegrees(la2), Math.toDegrees(lo2)};
    }
}
