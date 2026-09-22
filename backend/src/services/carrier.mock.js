/**
 * Carrier actions (FirstNet / Verizon Frontline) - SIMULATED.
 *
 * The carrier relationship is real: it is read from the seeded GLPI chain
 * Phone -> Item_DeviceSimcard -> Line -> LineOperator, so the ICCID, MSISDN,
 * SIM type and carrier name all come from live data. The diagnostics and the
 * eSIM refresh themselves are fabricated locally - no carrier API is called.
 * Every response carries simulated:true and simulatedBy.
 *
 * Outcomes are deterministic from the seeded data:
 *   no SIM record            -> failure    (no_sim_record)
 *   Lost or stolen           -> failure    (device_unreachable)
 *   In repair                -> degraded   (hardware_fault)
 *   eSIM                     -> degraded   (profile_not_activated)  [eSIM pilot]
 *   physical SIM, in service -> healthy
 * Pass `simulate: "healthy" | "degraded" | "failure"` to force a state.
 */
import { getDeviceSim, resolveDevice, summarize } from "./assets.js";

/**
 * Deterministic demo carrier telemetry for assets GLPI has no SIM record for.
 *
 * This is generated, and says so: `source: "generated"` versus `source: "glpi"`
 * for the seeded FirstNet/Verizon records. It exists so a demo device shows a
 * realistic carrier story instead of looking broken, and it never claims GLPI
 * held data it does not.
 */
function generatedCarrier(device) {
  const key = `${device.itemType}:${device.id}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = Math.abs(h);
  const pick = (off, min, max) => min + ((h >> off) % (max - min + 1));
  const carriers = ["FirstNet", "Verizon Frontline"];
  const status = String(device.status ?? "").toLowerCase();
  const offline = status.includes("lost") || status.includes("stolen") || status.includes("repair");

  return {
    source: "generated",
    carrier: carriers[h % carriers.length],
    plmn: null,
    simType: device.itemType === "Phone" ? "eSIM (demo profile)" : "Embedded SIM (demo profile)",
    isEsim: true,
    iccid: null,
    msisdn: `+1212555${String(pick(3, 100, 199))}`,
    line: `${device.name}-LINE`,
    registration: offline ? "Not registered" : "Registered (home network)",
    signalBars: offline ? 0 : pick(5, 2, 5),
    networkType: offline ? "—" : ["LTE", "LTE Band 14", "5G"][h % 3],
    lastHandshakeMinutesAgo: offline ? pick(7, 120, 900) : pick(9, 1, 45),
  };
}

export const SIMULATED_BY = "carrier-mock";

const mark = (payload) => ({ simulated: true, simulatedBy: SIMULATED_BY, ...payload });
const FORCED = new Set(["healthy", "degraded", "failure"]);

function stateFor(device, sim, override) {
  if (FORCED.has(override)) return override;
  const status = String(device.status ?? "").toLowerCase();
  if (status.includes("lost") || status.includes("stolen")) return "failure";
  if (status.includes("repair")) return "degraded";
  // The stuck-eSIM story belongs to the real seeded pilot profile. Generated
  // demo telemetry must not make a healthy in-service asset look degraded.
  if (sim.isEsim && sim.source === "glpi") return "degraded";
  return "healthy";
}

function reasonFor(state, device, sim) {
  const status = String(device.status ?? "").toLowerCase();
  if (state === "failure" && (status.includes("lost") || status.includes("stolen"))) {
    return { code: "device_unreachable", detail: "Asset is flagged Lost or stolen; the line does not respond." };
  }
  if (state === "degraded" && status.includes("repair")) {
    return { code: "hardware_fault", detail: "Asset is in repair; the radio is not reporting reliably." };
  }
  if (state === "degraded" && sim.isEsim && sim.source === "glpi") {
    return {
      code: "profile_not_activated",
      detail: "eSIM profile is provisioned on the carrier account but has not activated on the device.",
    };
  }
  if (state === "healthy") {
    return {
      code: "ok",
      detail:
        sim.source === "generated"
          ? `Line is registered and passing data. GLPI holds no SIM record for this asset, so the carrier figures shown are simulated demo telemetry.`
          : "Line is registered and passing data.",
    };
  }
  return { code: "unknown", detail: "Carrier state could not be determined." };
}

function simBlock(sim) {
  if (!sim) return null;
  return {
    source: "glpi",
    carrier: sim.carrier,
    plmn: sim.mcc && sim.mnc ? `${sim.mcc}/${sim.mnc}` : null,
    simType: sim.simType,
    isEsim: sim.isEsim,
    iccid: sim.iccid,
    msisdn: sim.msisdn,
    line: sim.line,
  };
}

/** Connectivity diagnostic. Simulated result over a real seeded SIM/carrier link. */
export async function connectivityDiagnostic({ deviceId, assetTag, name, itemType, simulate } = {}) {
  const device = await resolveDevice({ deviceId, assetTag, name, itemType });
  if (!device) {
    return mark({
      action: "connectivity-diagnostic",
      state: "not_found",
      success: false,
      reason: { code: "device_not_found", detail: "No FDNY Phone asset matches that reference." },
      device: null,
      escalationRecommended: false,
    });
  }

  const glpiSim = await getDeviceSim(device.id, device.itemType).catch(() => null);
  // GLPI data wins; otherwise deterministic demo telemetry, flagged as generated.
  const sim = glpiSim ?? generatedCarrier(device);
  const state = stateFor(device, sim, simulate);
  const reason = reasonFor(state, device, sim);

  return mark({
    action: "connectivity-diagnostic",
    state, // healthy | degraded | failure
    success: state === "healthy",
    device: summarize(device),
    sim: glpiSim ? simBlock(glpiSim) : sim,
    carrierDataSource: glpiSim ? "glpi" : "generated",
    reason,
    remediation:
      state === "healthy"
        ? null
        : sim?.isEsim
          ? "esim-refresh"
          : sim
            ? "reseat-sim-then-escalate"
            // No carrier record, but a device-level reset is still offered, so
            // do not contradict the message by recommending escalation here.
            : "device-reset",
    escalationRecommended: state === "failure",
  });
}

/** eSIM refresh. Simulated - no carrier provisioning call is made. */
export async function esimRefresh({ deviceId, assetTag, name, itemType, simulate } = {}) {
  const device = await resolveDevice({ deviceId, assetTag, name, itemType });
  if (!device) {
    return mark({
      action: "esim-refresh",
      state: "not_found",
      success: false,
      reason: { code: "device_not_found", detail: "No FDNY Phone asset matches that reference." },
      device: null,
      escalationRecommended: false,
    });
  }

  const sim = await getDeviceSim(device.id, device.itemType).catch(() => null);

  if (!sim) {
    return mark({
      action: "esim-refresh",
      state: "failure",
      success: false,
      device: summarize(device),
      sim: null,
      reason: { code: "no_sim_record", detail: "No SIM or eSIM record is attached to this asset in GLPI." },
      escalationRecommended: true,
    });
  }

  // A physical SIM has no downloadable profile to refresh.
  if (!sim.isEsim && !FORCED.has(simulate)) {
    return mark({
      action: "esim-refresh",
      state: "failure",
      success: false,
      device: summarize(device),
      sim: simBlock(sim),
      reason: {
        code: "no_esim_profile",
        detail: `This asset carries a ${sim.simType ?? "physical SIM"}, so there is no eSIM profile to refresh. Reprovision the line onto a replacement SIM instead.`,
      },
      escalationRecommended: true,
    });
  }

  const status = String(device.status ?? "").toLowerCase();
  const forced = FORCED.has(simulate) ? simulate : null;
  const state =
    forced ?? (status.includes("lost") || status.includes("stolen") ? "failure" : "healthy");
  const success = state === "healthy";

  return mark({
    action: "esim-refresh",
    state,
    success,
    device: summarize(device),
    sim: simBlock(sim),
    reason: success
      ? { code: "profile_reprovisioned", detail: `eSIM profile re-downloaded and registered on ${sim.carrier ?? "the carrier"}.` }
      : status.includes("lost") || status.includes("stolen")
        ? { code: "device_unreachable", detail: "Asset is flagged Lost or stolen; the profile push was not delivered." }
        : { code: "refresh_failed", detail: "The profile did not activate after re-provisioning." },
    durationSeconds: success ? 115 : 0,
    escalationRecommended: !success,
    nextStep: success
      ? "Monitor for 10 minutes; if data drops again, escalate to the carrier liaison."
      : "Open a connectivity ticket for the carrier liaison.",
  });
}
