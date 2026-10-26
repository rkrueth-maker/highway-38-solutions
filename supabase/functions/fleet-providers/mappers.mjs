/* ============================================================================
 * H38 Fleet Providers — shared pure core (registry + payload mappers).
 *
 * One provider layer over the fleet foundation tables
 * (fleet_provider_connections / fleet_provider_secrets / fleet_vehicles /
 * fleet_trips, migration 20260912090000). A provider is registry config plus
 * the mapper functions below — never a hardcoded branch in the sync engine.
 *
 * This file is pure (no Deno, no DOM, no fetch): the edge function
 * (index.ts) imports it for live syncs, and
 * scripts/test-fleet-provider-mappers.mjs runs the fixture pack in
 * supabase/functions/fleet-providers/fixtures/ against it.
 *
 * Normalized output = fleet_vehicles / fleet_trips row shapes, identical to
 * the rows the Bouncie mapper in nl-bouncie-fleet writes, plus mirror
 * payload builders for the business_records collections the dispatch map
 * and recorded-stops view read (crewPositions / crewLocationStamps).
 * ========================================================================== */

/* ------------------------------ registry ------------------------------ */
/* authModel:
 *   oauth2           — provider OAuth in its own edge function (Bouncie:
 *                      nl-bouncie-fleet; this layer delegates to it).
 *   api-token        — one bearer token the owner pastes (Samsara).
 *   server-user-pass — server + database + user + password (Geotab).
 *   host-token       — per-account API host + bearer token (Linxup).
 * credentialFields drive the Fleet connect form. `secret: true` fields are
 * encrypted into fleet_provider_secrets and never stored in settings. */
export const PROVIDERS = [
  {
    id: "bouncie",
    name: "Bouncie",
    authModel: "oauth2",
    delegatedFunction: "nl-bouncie-fleet",
    provisional: false,
    blurb: "Plug-in OBD trackers. Connect with your Bouncie account sign-in.",
    credentialFields: [],
  },
  {
    id: "samsara",
    name: "Samsara",
    authModel: "api-token",
    delegatedFunction: null,
    provisional: false,
    blurb: "Samsara fleet platform. Paste an API token that can read vehicles.",
    credentialFields: [
      {
        key: "apiToken",
        label: "Samsara API token",
        secret: true,
        help: "In Samsara: Settings \u2192 API Tokens \u2192 create a token with Read Vehicles access, then paste it here.",
      },
    ],
  },
  {
    id: "geotab",
    name: "Geotab",
    authModel: "server-user-pass",
    delegatedFunction: null,
    provisional: false,
    blurb: "Geotab GO devices. Uses your MyGeotab server, database, and a user login.",
    credentialFields: [
      {
        key: "server",
        label: "Geotab server",
        secret: false,
        placeholder: "my.geotab.com",
        help: "The server in your MyGeotab web address, for example my.geotab.com.",
      },
      { key: "database", label: "Database name", secret: false },
      { key: "userName", label: "User name (email)", secret: false },
      {
        key: "password",
        label: "Password",
        secret: true,
        help: "A dedicated MyGeotab API user is best. The password is stored encrypted and never shown again.",
      },
    ],
  },
  {
    id: "linxup",
    name: "Linxup",
    authModel: "host-token",
    delegatedFunction: null,
    provisional: true,
    blurb: "Linxup GPS trackers. Paste your account API host link and a V2 API key.",
    credentialFields: [
      {
        key: "host",
        label: "API host link",
        secret: false,
        help: "In the Linxup portal: Setup \u2192 API/Developers \u2192 your API host link (it is specific to your account).",
      },
      { key: "apiToken", label: "V2 API key", secret: true },
    ],
  },
];

export function providerById(id) {
  return PROVIDERS.find((p) => p.id === String(id || "")) || null;
}

/* ------------------------------ helpers ------------------------------- */
export function field(o, ...keys) {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) {
    const parts = k.split(".");
    let v = o;
    for (const p of parts) v = v && typeof v === "object" ? v[p] : undefined;
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function str(v, max = 300) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}
export function timeIso(v) {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export const KM_TO_MILES = 0.621371192;
export const METERS_TO_MILES = 0.000621371192;
export function kmhToMph(v) {
  const n = num(v);
  return n === null ? null : Math.round(n * KM_TO_MILES * 10) / 10;
}
/* Geotab durations arrive as seconds (number) or TimeSpan strings
 * ("01:02:03", "1.01:02:03") or ISO-8601 ("PT1H2M3S"). */
export function durationSeconds(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.round(n);
  const s = String(v).trim();
  const iso = s.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/i);
  if (iso) {
    return Math.round(
      Number(iso[1] || 0) * 86400 + Number(iso[2] || 0) * 3600 +
        Number(iso[3] || 0) * 60 + Number(iso[4] || 0),
    );
  }
  const ts = s.match(/^(?:(\d+)\.)?(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (ts) {
    return Math.round(
      Number(ts[1] || 0) * 86400 + Number(ts[2] || 0) * 3600 +
        Number(ts[3] || 0) * 60 + Number(ts[4] || 0),
    );
  }
  return null;
}

/* ------------------------- normalized row base ------------------------ */
function vehicleRow(businessId, provider, v) {
  return {
    business_id: businessId,
    provider,
    provider_device_id: v.deviceId,
    provider_imei: v.imei || null,
    asset_id: null,
    nickname: v.nickname || null,
    vin: v.vin || null,
    year: v.year ?? null,
    make: v.make || null,
    model: v.model || null,
    active: true,
    connection_status: v.connectionStatus || "unknown",
    last_known_at: v.lastKnownAt || null,
    latitude: v.lat ?? null,
    longitude: v.lng ?? null,
    speed_mph: v.speedMph ?? null,
    heading_degrees: v.headingDegrees ?? null,
    odometer_miles: v.odometerMiles ?? null,
    battery_status: v.batteryStatus || null,
    mil_status: v.milStatus || null,
    provider_payload: v.payload || {},
    updated_at: new Date().toISOString(),
  };
}

/* ------------------------------ Samsara ------------------------------- */
/* Confirmed against developers.samsara.com examples:
 *   GET /fleet/vehicles -> { data: [{ id, name, vin, serial, make, model,
 *     year, externalIds }] , pagination }
 *   GET /fleet/vehicles/stats?types=gps,obdOdometerMeters ->
 *     { data: [{ id, name, externalIds: { "samsara.serial", "samsara.vin" },
 *        gps: { time, latitude, longitude, headingDegrees,
 *               speedMilesPerHour, reverseGeo: { formattedLocation } },
 *        obdOdometerMeters: { time, value } }], pagination } */
export function mapSamsaraVehicles(businessId, vehiclesPayload, statsPayload) {
  const vehicles = Array.isArray(vehiclesPayload?.data) ? vehiclesPayload.data : [];
  const stats = Array.isArray(statsPayload?.data) ? statsPayload.data : [];
  const statById = new Map();
  for (const s of stats) if (s && s.id) statById.set(String(s.id), s);
  const out = [];
  for (const v of vehicles) {
    if (!v || !v.id) continue;
    const s = statById.get(String(v.id)) || {};
    const gps = s.gps && typeof s.gps === "object" ? s.gps : null;
    const odoMeters = num(s.obdOdometerMeters?.value);
    out.push(vehicleRow(businessId, "samsara", {
      deviceId: String(v.id),
      imei: str(field(v, "serial") || field(s, "externalIds.samsara.serial"), 180),
      nickname: str(field(v, "name"), 240),
      vin: str(field(v, "vin") || field(s, "externalIds.samsara.vin"), 80),
      year: num(field(v, "year")),
      make: str(field(v, "make"), 120),
      model: str(field(v, "model"), 120),
      connectionStatus: gps ? "connected" : "unknown",
      lastKnownAt: timeIso(gps?.time) || timeIso(s.obdOdometerMeters?.time),
      lat: gps ? num(gps.latitude) : null,
      lng: gps ? num(gps.longitude) : null,
      speedMph: gps ? num(gps.speedMilesPerHour) : null,
      headingDegrees: gps ? num(gps.headingDegrees) : null,
      odometerMiles: odoMeters === null ? null : Math.round(odoMeters * METERS_TO_MILES * 10) / 10,
      payload: { vehicle: v, stats: s },
    }));
  }
  return out;
}

/* ------------------------------- Geotab ------------------------------- */
/* Confirmed against developers.geotab.com MyGeotab API reference:
 *   Authenticate(database, userName, password) -> { result: { userId,
 *     sessionId, path } }; then JSON-RPC Get with credentials.
 *   Device: { id, name, vehicleIdentificationNumber, serialNumber, ... }
 *   DeviceStatusInfo: { device: { id }, latitude, longitude, speed (km/h),
 *     bearing, dateTime, isDriving, isDeviceCommunicating }
 *   Trip: { id, device: { id }, start, stop, distance (km),
 *     drivingDuration / duration (TimeSpan), ... } */
export function mapGeotabVehicles(businessId, devicesPayload, statusPayload) {
  const devices = Array.isArray(devicesPayload) ? devicesPayload : [];
  const statuses = Array.isArray(statusPayload) ? statusPayload : [];
  const statusByDevice = new Map();
  for (const s of statuses) {
    const id = s?.device?.id;
    if (id) statusByDevice.set(String(id), s);
  }
  const out = [];
  for (const d of devices) {
    if (!d || !d.id) continue;
    const s = statusByDevice.get(String(d.id)) || null;
    out.push(vehicleRow(businessId, "geotab", {
      deviceId: String(d.id),
      imei: str(field(d, "serialNumber"), 180),
      nickname: str(field(d, "name"), 240),
      vin: str(field(d, "vehicleIdentificationNumber"), 80),
      connectionStatus: s ? (s.isDeviceCommunicating ? "connected" : "disconnected") : "unknown",
      lastKnownAt: s ? timeIso(s.dateTime) : null,
      lat: s ? num(s.latitude) : null,
      lng: s ? num(s.longitude) : null,
      speedMph: s ? kmhToMph(s.speed) : null,
      headingDegrees: s ? num(s.bearing) : null,
      payload: { device: d, status: s },
    }));
  }
  return out;
}

export function mapGeotabTrips(businessId, tripsPayload, vehicleIdByDevice) {
  const trips = Array.isArray(tripsPayload) ? tripsPayload : [];
  const out = [];
  for (const t of trips) {
    if (!t || !t.id) continue;
    const deviceId = t.device?.id ? String(t.device.id) : "";
    const distKm = num(field(t, "distance"));
    out.push({
      business_id: businessId,
      vehicle_id: vehicleIdByDevice?.[deviceId] || null,
      provider: "geotab",
      provider_trip_id: String(t.id),
      provider_device_id: deviceId || null,
      started_at: timeIso(field(t, "start")),
      ended_at: timeIso(field(t, "stop")),
      distance_miles: distKm === null ? null : Math.round(distKm * KM_TO_MILES * 100) / 100,
      duration_seconds: durationSeconds(field(t, "drivingDuration", "duration")),
      start_latitude: null,
      start_longitude: null,
      end_latitude: null,
      end_longitude: null,
      route: [],
      customer_id: null,
      job_id: null,
      on_site_seconds: durationSeconds(field(t, "stopDuration")) || 0,
      linkage_confidence: null,
      linkage_reason: null,
      provider_payload: t,
      updated_at: new Date().toISOString(),
    });
  }
  return out;
}

/* ------------------------------- Linxup ------------------------------- */
/* PROVISIONAL — Linxup's V2 "pull API" payload nesting is not published in
 * a public spec we could verify (auth model IS confirmed from Linxup's own
 * help center: per-account API host link + V2 API key as a bearer token).
 * The mapper therefore picks fields defensively (the same multi-key style
 * the Bouncie mapper uses). First live account: capture one real response,
 * adjust the fixture, and drop the provisional flag. */
export function mapLinxupVehicles(businessId, payload) {
  const list = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.devices) ? payload.devices
      : Array.isArray(payload?.data) ? payload.data : []);
  const out = [];
  for (const d of list) {
    if (!d || typeof d !== "object") continue;
    const deviceId = str(field(d, "id", "deviceId", "device_id", "imei"), 180);
    if (!deviceId) continue;
    const loc = (field(d, "location", "lastLocation", "gps") || {}) ;
    const lat = num(field(loc, "lat", "latitude") ?? field(d, "latitude", "lat"));
    const lng = num(field(loc, "lon", "lng", "longitude") ?? field(d, "longitude", "lon", "lng"));
    out.push(vehicleRow(businessId, "linxup", {
      deviceId,
      imei: str(field(d, "imei", "serialNumber", "serial"), 180),
      nickname: str(field(d, "name", "label", "nickname"), 240),
      vin: str(field(d, "vin"), 80),
      year: num(field(d, "year")),
      make: str(field(d, "make"), 120),
      model: str(field(d, "model"), 120),
      connectionStatus: lat !== null && lng !== null ? "connected" : "unknown",
      lastKnownAt: timeIso(field(d, "lastUpdated", "updatedAt", "timestamp") || field(loc, "time", "timestamp")),
      lat,
      lng,
      speedMph: num(field(d, "speed", "speedMph") ?? field(loc, "speed")),
      headingDegrees: num(field(d, "heading", "bearing") ?? field(loc, "heading", "bearing")),
      odometerMiles: num(field(d, "odometer", "odometerMiles")),
      payload: d,
    }));
  }
  return out;
}

/* --------------------- business_records mirrors ----------------------- */
/* The dispatch map (gps-dispatch.js + route-planner.js) reads
 * business_records crewPositions (latest per 'User ID', label from
 * 'User Name') and the recorded-stops view reads crewLocationStamps
 * ('Location Status' must be 'gps'). Tracker vehicles mirror into both so
 * a connected tracker shows up on the same surfaces as phone crews. */
export function trackerUserId(provider, deviceId) {
  return `tracker-${provider}-${deviceId}`;
}
export function vehicleLabel(row) {
  return row.nickname ||
    [row.year, row.make, row.model].filter(Boolean).join(" ") ||
    row.vin || row.provider_device_id || "Vehicle";
}
export function mirrorPositionPayload(row, nowIsoStr) {
  const providerName = (providerById(row.provider)?.name) || row.provider;
  const id = `TRACKERPOS-${row.provider}-${row.provider_device_id}`;
  return {
    recordKey: id,
    payload: {
      "Crew Position ID": id,
      "Business ID": row.business_id,
      "User ID": trackerUserId(row.provider, row.provider_device_id),
      "User Name": `${vehicleLabel(row)} (${providerName})`,
      "Lat": row.latitude,
      "Lng": row.longitude,
      "Accuracy": "",
      "Timestamp": row.last_known_at || nowIsoStr,
      "Created Time": nowIsoStr,
      "Record Version": 1,
      "Source": `Vehicle tracker \u2014 ${providerName}`,
    },
  };
}
export function mirrorStampId(row) {
  const t = String(row.last_known_at || "").replace(/[^0-9]/g, "").slice(0, 14);
  return `TRACKERSTAMP-${row.provider}-${row.provider_device_id}-${t || "unknown"}`;
}
export function mirrorStampPayload(row, nowIsoStr) {
  const providerName = (providerById(row.provider)?.name) || row.provider;
  const id = mirrorStampId(row);
  return {
    recordKey: id,
    payload: {
      "Stamp ID": id,
      "Business ID": row.business_id,
      "Job ID": "",
      "Schedule Event ID": "",
      "Task ID": "",
      "User ID": trackerUserId(row.provider, row.provider_device_id),
      "User Name": `${vehicleLabel(row)} (${providerName})`,
      "Stamp Type": "tracker",
      "Timestamp": row.last_known_at || nowIsoStr,
      "Lat": row.latitude,
      "Lng": row.longitude,
      "Accuracy": "",
      "Location Status": "gps",
      "Manual": false,
      "Location Message": "",
      "Created Time": nowIsoStr,
      "Updated Time": nowIsoStr,
      "Record Version": 1,
    },
  };
}
