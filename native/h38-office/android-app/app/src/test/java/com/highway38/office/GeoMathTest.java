package com.highway38.office;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The parked watcher's coarse movement trigger (1.0.4). It exists because
 * the TripDetector's 65 m accuracy gate can never be satisfied by the
 * balanced-power parked profile away from Wi-Fi — the trigger is what
 * buys the detector a high-accuracy window when the phone really moves.
 */
public class GeoMathTest {

    // Rick's home area; destinations are computed, not hand-typed.
    private static final double HOME_LAT = 47.3051;
    private static final double HOME_LNG = -93.5551;

    @Test
    public void stationaryPhoneDoesNotTrigger() {
        double[] near = GeoMath.destination(HOME_LAT, HOME_LNG, 90, 30);
        assertFalse(GeoMath.shouldConfirmDrive(
                HOME_LAT, HOME_LNG, near[0], near[1], 25));
    }

    @Test
    public void coarseButFarFixTriggers() {
        // A cell-grade fix 800 m away with a 300 m accuracy radius is far
        // too coarse for the TripDetector — and exactly what the trigger
        // is for: something is moving, go look properly.
        double[] away = GeoMath.destination(HOME_LAT, HOME_LNG, 180, 800);
        assertTrue(GeoMath.shouldConfirmDrive(
                HOME_LAT, HOME_LNG, away[0], away[1], 300));
    }

    @Test
    public void unusableFixDoesNotTrigger() {
        // A fix whose accuracy radius swallows the displacement proves
        // nothing; the window stays closed.
        double[] away = GeoMath.destination(HOME_LAT, HOME_LNG, 180, 800);
        assertFalse(GeoMath.shouldConfirmDrive(
                HOME_LAT, HOME_LNG, away[0], away[1], 900));
    }

    @Test
    public void unknownAccuracyPassesToDisplacement() {
        // Negative accuracy = unknown (the web detector's convention too);
        // the displacement alone decides.
        double[] away = GeoMath.destination(HOME_LAT, HOME_LNG, 0, 400);
        assertTrue(GeoMath.shouldConfirmDrive(
                HOME_LAT, HOME_LNG, away[0], away[1], -1));
        double[] near = GeoMath.destination(HOME_LAT, HOME_LNG, 0, 100);
        assertFalse(GeoMath.shouldConfirmDrive(
                HOME_LAT, HOME_LNG, near[0], near[1], -1));
    }
}
