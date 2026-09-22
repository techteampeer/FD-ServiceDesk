/**
 * Workspace ONE / MDM actions - SIMULATED.
 *
 * FDNY has no MDM integration in this repo. Device and location facts come from
 * live GLPI (the seeded Phone assets and their Locations), but every *action*
 * below is fabricated locally. Each response carries simulated:true and a
 * simulatedBy marker so no caller, UI or agent can mistake it for real
 * telemetry.
 *
 * Outcomes are deterministic functions of the seeded GLPI State, so the same
 * device always produces the same result:
 *   Lost or stolen -> failure (device unreachable)
 *   In repair      -> failure (device powered down at the depot)
 *   anything else  -> success
 * Pass `simulate: "success" | "failure"` to force an outcome in tests.
 */
import { getLocation } from "../glpi.js";
import { getDeviceSim, resolveDevice, summarize } from "./assets.js";
import { deviceTelemetry } from "./telemetry.mock.js";

export const SIMULATED_BY = "workspace-one-mock";

const mark = (payload) => ({ simulated: true, simulatedBy: SIMULATED_BY, ...payload });

function outcomeFor(device, override) {
  if (override === "success" || override === "failure") return override;
  const status = String(device.status ?? "").toLowerCase();
  if (status.includes("lost") || status.includes("stolen")) return "failure";
  if (status.includes("repair")) return "failure";
  return "success";
}

/**
 * Device + location lookup for the agent: real GLPI asset and seeded GPS, with
 * the "last seen" framing marked as simulated because nothing reports check-ins.
 */
export async function lookupDevice({ deviceId, assetTag, name, itemType, simulate } = {}) {
  const device = await resolveDevice({ deviceId, assetTag, name, itemType });
  if (!device) {
    return mark({ found: false, reason: "No FDNY Phone asset matches that reference.", device: null });
  }

  const [sim, location] = await Promise.all([
    getDeviceSim(device.id, device.itemType).catch(() => null),
    device.locationId ? getLocation(device.locationId).catch(() => null) : null,
  ]);

  return mark({
    found: true,
    outcome: outcomeFor(device, simulate),
    device: summarize(device),
    sim,
    location: location
      ? {
          id: location.id,
          name: location.name,
          address: location.address ?? null,
          town: location.town ?? null,
          latitude: location.latitude ?? null,
          longitude: location.longitude ?? null,
        }
      : null,
    /**
     * Operational telemetry GLPI does not hold, generated deterministically for
     * this exact asset. The POSITION is always the GLPI location - the mock
     * never invents different coordinates, only an accuracy for them.
     */
    telemetry: deviceTelemetry(device),
  });
}

