package com.highway38.office;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** The recording-policy gate: owners always, employees clocked-in only. */
public class GateEvaluatorTest {

    private static final long NOW = 1_700_000_000_000L;
    private static final long FRESH = NOW - 60_000L;
    private static final long STALE = NOW - 25L * 60L * 60L * 1000L;

    private static GateEvaluator.Policy policy(boolean owner, boolean clockedIn, long pushedAt) {
        return new GateEvaluator.Policy(true, true, true, true, false, owner, clockedIn, pushedAt);
    }

    @Test
    public void ownerRecordsWithoutClockIn() {
        assertEquals(GateEvaluator.Gate.RECORDING,
                GateEvaluator.evaluate(policy(true, false, FRESH), NOW));
    }

    @Test
    public void employeeRecordsWhileClockedIn() {
        assertEquals(GateEvaluator.Gate.RECORDING,
                GateEvaluator.evaluate(policy(false, true, FRESH), NOW));
    }

    @Test
    public void employeeWaitsWhileClockedOut() {
        assertEquals(GateEvaluator.Gate.WAITING_CLOCKIN,
                GateEvaluator.evaluate(policy(false, false, FRESH), NOW));
    }

    @Test
    public void employeeWithStalePolicyPauses() {
        assertEquals(GateEvaluator.Gate.PAUSED_STALE,
                GateEvaluator.evaluate(policy(false, true, STALE), NOW));
    }

    @Test
    public void ownerWithStalePolicyStillRecords() {
        assertEquals(GateEvaluator.Gate.RECORDING,
                GateEvaluator.evaluate(policy(true, false, STALE), NOW));
    }

    @Test
    public void offDutyStopsEverything() {
        GateEvaluator.Policy p = new GateEvaluator.Policy(
                true, true, true, true, true, true, true, FRESH);
        assertEquals(GateEvaluator.Gate.OFF, GateEvaluator.evaluate(p, NOW));
    }

    @Test
    public void recordingSwitchOffStopsEverything() {
        GateEvaluator.Policy p = new GateEvaluator.Policy(
                true, true, true, false, false, true, true, FRESH);
        assertEquals(GateEvaluator.Gate.OFF, GateEvaluator.evaluate(p, NOW));
    }

    @Test
    public void signedOutIsOff() {
        GateEvaluator.Policy p = new GateEvaluator.Policy(
                false, true, true, true, false, true, true, FRESH);
        assertEquals(GateEvaluator.Gate.OFF, GateEvaluator.evaluate(p, NOW));
    }

    @Test
    public void pilotOffIsOff() {
        GateEvaluator.Policy p = new GateEvaluator.Policy(
                true, false, true, true, false, true, true, FRESH);
        assertEquals(GateEvaluator.Gate.OFF, GateEvaluator.evaluate(p, NOW));
    }
}
