/**
 * Workspace ONE / MDM telemetry - SIMULATED, but deterministic.
 *
 * GLPI owns the asset, its owner, its location and its status. This file adds
 * ONLY the operational facts GLPI genuinely does not hold: battery, last
 * check-in, location accuracy, enrollment and connectivity state.
 *
 * Values are derived from the asset's own identity and its real GLPI status, so
 * the same device always reports the same telemetry - refreshing a screen never
 * shuffles the numbers. Nothing here contacts an MDM.
 */
export const SIMULATED_BY = "workspace-one-mock";

/** Stable 32-bit hash, so a given asset always seeds the same values. */
function seedOf(itemType, id) {
  const key = `${itemType}:${id}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pick = (seed, offset, min, max) => min + ((seed >> offset) % (max - min + 1));

/**
 * Telemetry for one GLPI asset. `status` is the real GLPI State name, which
 * decides the operational story so the simulation agrees with the catalog.
 */
export function deviceTelemetry(device) {
  if (!device) return null;
  const seed = seedOf(device.itemType, device.id);
  const status = String(device.status ?? "").toLowerCase();

  const lost = status.includes("lost") || status.includes("stolen");
  const repair = status.includes("repair");
  const stock = status.includes("stock");

  // Enrollment/connectivity follow the GLPI status rather than contradicting it.
  const enrollment = lost ? "Enrolled - unmanaged since last check-in" : repair ? "Enrolled - device offline" : "Enrolled - managed";
  const connectivity = lost ? "No check-in" : repair ? "Offline" : stock ? "Wi-Fi (depot)" : "Online";

  // Minutes since the last check-in: recent when in service, stale when not.
  const staleMinutes = lost ? pick(seed, 3, 180, 900) : repair ? pick(seed, 5, 90, 480) : pick(seed, 7, 2, 55);
  const battery = lost ? pick(seed, 9, 4, 28) : repair ? pick(seed, 11, 15, 60) : stock ? pick(seed, 13, 80, 100) : pick(seed, 15, 42, 96);
  const accuracyM = lost ? pick(seed, 17, 120, 600) : stock ? pick(seed, 19, 5, 25) : pick(seed, 21, 8, 60);

  return {
    simulated: true,
    simulatedBy: SIMULATED_BY,
    /** Every field below is generated; none of it came from GLPI. */
    source: "generated",
    device: { id: device.id, itemType: device.itemType, name: device.name },
    enrollment,
    connectivity,
    batteryPercent: battery,
    lastSeenMinutesAgo: staleMinutes,
    lastSeenLabel: staleMinutes < 60 ? `${staleMinutes} min ago` : `${Math.round(staleMinutes / 60)} h ago`,
    /** Accuracy of the position GLPI holds, not a different position. */
    locationAccuracyMetres: accuracyM,
    positionSource: "GLPI assigned location",
    /** Why the device may not be reporting a fresh position. */
    positionStaleReason: lost
      ? "Asset is flagged Lost or stolen in GLPI and has not checked in."
      : repair
        ? "Asset is in repair and is powered down."
        : null,
  };
}
