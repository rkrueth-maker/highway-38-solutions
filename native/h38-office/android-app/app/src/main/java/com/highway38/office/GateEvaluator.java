package com.highway38.office;

/**
 * The per-person recording policy, exactly as the shipped web mileage engine
 * defines it (commercial-app/mileage.js):
 *
 *   - the tenant pilot (business_module_settings: mileage_tracking) is on, AND
 *   - the Owner Controls feature toggle is on for the business, AND
 *   - this phone's Recording switch is on, AND
 *   - the Off-Duty switch is off, AND
 *   - owners/admins record whenever their switches are on;
 *     employees record only while clocked in.
 *
 * The web app is the source of truth: it pushes this snapshot through the
 * bridge whenever it runs, and the native layer persists the last push. When
 * the WebView is dead the native layer refreshes the server-readable inputs
 * itself (open time entry + pilot row) with the stored session.
 *
 * Documented native choice: if an EMPLOYEE's snapshot is older than 24 hours
 * we pause detection until the app is opened again (privacy first — never
 * record an employee on stale consent state). Owners are exempt: their trips
 * are their own data and their own switches.
 */
public final class GateEvaluator {

    public static final long STALE_AFTER_MS = 24L * 60L * 60L * 1000L;

    public enum Gate {
        /** Do not run the tracking service at all. */
        OFF,
        /** Policy is stale for an employee: paused until the app is opened. */
        PAUSED_STALE,
        /** Armed for an employee who is not clocked in: service waits, no location is read. */
        WAITING_CLOCKIN,
        /** Record drives now. */
        RECORDING
    }

    /** Immutable policy snapshot. */
    public static final class Policy {
        public final boolean signedIn;
        public final boolean pilotEnabled;
        public final boolean featureOn;
        public final boolean recordingOn;
        public final boolean offDuty;
        public final boolean ownerAdmin;
        public final boolean clockedIn;
        public final long pushedAtMs;

        public Policy(boolean signedIn, boolean pilotEnabled, boolean featureOn,
                      boolean recordingOn, boolean offDuty, boolean ownerAdmin,
                      boolean clockedIn, long pushedAtMs) {
            this.signedIn = signedIn;
            this.pilotEnabled = pilotEnabled;
            this.featureOn = featureOn;
            this.recordingOn = recordingOn;
            this.offDuty = offDuty;
            this.ownerAdmin = ownerAdmin;
            this.clockedIn = clockedIn;
            this.pushedAtMs = pushedAtMs;
        }
    }

    private GateEvaluator() {}

    public static Gate evaluate(Policy p, long nowMs) {
        if (p == null || !p.signedIn) return Gate.OFF;
        if (!p.pilotEnabled || !p.featureOn || !p.recordingOn || p.offDuty) return Gate.OFF;
        boolean stale = p.pushedAtMs <= 0 || (nowMs - p.pushedAtMs) > STALE_AFTER_MS;
        if (stale && !p.ownerAdmin) return Gate.PAUSED_STALE;
        if (!p.ownerAdmin && !p.clockedIn) return Gate.WAITING_CLOCKIN;
        return Gate.RECORDING;
    }
}
