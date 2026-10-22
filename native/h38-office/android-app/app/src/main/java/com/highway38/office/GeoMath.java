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
