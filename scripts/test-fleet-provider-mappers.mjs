#!/usr/bin/env node
/* Fixture tests for the fleet provider layer
 * (supabase/functions/fleet-providers/mappers.mjs).
 *
 * Same standard as the Bouncie sample pack: synthetic provider payloads in,
 * normalized fleet_vehicles / fleet_trips rows + business_records mirror
 * payloads out, asserted against fixtures/expected.json. No network, no
 * credentials. Run: node scripts/test-fleet-provider-mappers.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fx = join(here, "..", "supabase", "functions", "fleet-providers", "fixtures");
const core = await import(
  join(here, "..", "supabase", "functions", "fleet-providers", "mappers.mjs")
);
const load = (name) => JSON.parse(readFileSync(join(fx, name), "utf8"));
const expected = load("expected.json");
const BIZ = expected.businessId;

let pass = 0, fail = 0;
function check(label, actual, want) {
  const a = JSON.stringify(actual), w = JSON.stringify(want);
  if (a === w) { pass++; }
  else { fail++; console.error(`FAIL ${label}\n  got:  ${a}\n  want: ${w}`); }
}
function subset(label, row, want) {
  for (const [k, v] of Object.entries(want)) check(`${label}.${k}`, row?.[k], v);
}

/* Registry sanity */
check("registry.ids", core.PROVIDERS.map((p) => p.id), ["bouncie", "samsara", "geotab", "linxup"]);
check("registry.linxup.provisional", core.providerById("linxup").provisional, expected.linxup.provisional);
check("registry.bouncie.delegated", core.providerById("bouncie").delegatedFunction, "nl-bouncie-fleet");
check("registry.no-secret-in-settings-fields",
  core.PROVIDERS.every((p) => p.credentialFields.every((f) => typeof f.secret === "boolean")), true);

/* Samsara */
const sam = core.mapSamsaraVehicles(BIZ, load("samsara-vehicles.json"), load("samsara-stats.json"));
check("samsara.count", sam.length, expected.samsara.vehicles);
subset("samsara[0]", sam[0], expected.samsara.first);
subset("samsara[1]", sam[1], expected.samsara.second);
check("samsara.business", sam.every((r) => r.business_id === BIZ && r.provider === "samsara"), true);

/* Geotab */
const geo = core.mapGeotabVehicles(BIZ, load("geotab-devices.json"), load("geotab-status.json"));
check("geotab.count", geo.length, expected.geotab.vehicles);
subset("geotab[0]", geo[0], expected.geotab.first);
subset("geotab[1]", geo[1], expected.geotab.second);
const trips = core.mapGeotabTrips(BIZ, load("geotab-trips.json"), { b1: "veh-uuid-1" });
check("geotab.trips.count", trips.length, expected.geotab.trips);
subset("geotab.trip[0]", trips[0], expected.geotab.trip);
check("geotab.trip.vehicle_id", trips[0].vehicle_id, "veh-uuid-1");

/* Linxup (provisional shape) */
const lx = core.mapLinxupVehicles(BIZ, load("linxup-devices.json"));
check("linxup.count", lx.length, expected.linxup.vehicles);
subset("linxup[0]", lx[0], expected.linxup.first);

/* Mirrors (crewPositions / crewLocationStamps payloads) */
const now = "2026-10-26T15:31:00.000Z";
const pos = core.mirrorPositionPayload(sam[0], now);
check("mirror.position.recordKey", pos.recordKey, expected.mirror.positionRecordKey);
check("mirror.position.userId", pos.payload["User ID"], expected.mirror.userId);
check("mirror.position.userName", pos.payload["User Name"], expected.mirror.userName);
check("mirror.position.latlng", [pos.payload["Lat"], pos.payload["Lng"]], [47.24, -93.52]);
const stamp = core.mirrorStampPayload(sam[0], now);
check("mirror.stamp.recordKey", stamp.recordKey, expected.mirror.stampRecordKey);
check("mirror.stamp.status", stamp.payload["Location Status"], expected.mirror.locationStatus);
check("mirror.stamp.idempotent",
  core.mirrorStampPayload(sam[0], "2026-10-26T16:00:00.000Z").recordKey, stamp.recordKey);

/* Duration parser edges */
check("duration.timespan", core.durationSeconds("1.01:02:03"), 90123);
check("duration.iso", core.durationSeconds("PT1H2M3S"), 3723);
check("duration.number", core.durationSeconds(95.4), 95);
check("duration.junk", core.durationSeconds("abc"), null);

console.log(`fleet-provider mapper fixtures: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
