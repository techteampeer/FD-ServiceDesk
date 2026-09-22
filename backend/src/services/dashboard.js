/**
 * Dashboard aggregates - deliberately simple counts over live GLPI data.
 * No analytics engine, no time-series: just what the existing staff dashboard
 * needs to render real numbers instead of mock ones.
 */
import { listFleet } from "./assets.js";
import { listTickets } from "./tickets.js";

/** Tickets our simulated automation created carry these title prefixes. */
const AUTOMATED_PREFIXES = ["Device reset completed", "Device reset failed"];
const isAutomated = (t) => AUTOMATED_PREFIXES.some((p) => String(t.name ?? "").startsWith(p));
const isClosed = (t) => t.status === 5 || t.status === 6;

export async function getDashboard({ ticketLimit = 200 } = {}) {
  const [tickets, fleet] = await Promise.all([
    listTickets({ limit: ticketLimit }),
    listFleet({ limit: 500 }),
  ]);

  const byCategory = {};
  const byStatus = {};
  const byPriority = {};
  const byLocation = {};
  for (const t of tickets) {
    const cat = t.category ?? "Uncategorised";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    byStatus[t.statusLabel] = (byStatus[t.statusLabel] ?? 0) + 1;
    byPriority[t.urgencyLabel ?? "Unset"] = (byPriority[t.urgencyLabel ?? "Unset"] ?? 0) + 1;
    // The ticket itself carries only a location id; the linked asset resolves
    // the station name, which is what the service desk recognises.
    const station = t.locationName ?? t.asset?.locationName ?? null;
    if (station) byLocation[station] = (byLocation[station] ?? 0) + 1;
  }

  const devicesByType = {};
  const devicesByGlpiType = {};
  for (const d of fleet) {
    devicesByType[d.itemType] = (devicesByType[d.itemType] ?? 0) + 1;
    // GLPI's own type name ("Tablet", "Smartphone", "ePCR Tablet", "Cellphone").
    const type = d.type ?? d.itemType;
    devicesByGlpiType[type] = (devicesByGlpiType[type] ?? 0) + 1;
  }

  const automated = tickets.filter(isAutomated);
  const automatedResolved = automated.filter(isClosed);

  return {
    tickets: {
      total: tickets.length,
      open: tickets.filter((t) => !isClosed(t)).length,
      closed: tickets.filter(isClosed).length,
      byStatus,
      byCategory: Object.entries(byCategory)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      withAsset: tickets.filter((t) => t.asset).length,
      byPriority: Object.entries(byPriority)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      byLocation: Object.entries(byLocation)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    },
    devices: {
      total: fleet.length,
      byType: Object.entries(devicesByType).map(([itemType, count]) => ({ itemType, count })),
      byGlpiType: Object.entries(devicesByGlpiType)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      withLocation: fleet.filter((d) => d.locationName).length,
      withGps: fleet.filter((d) => d.latitude && d.longitude).length,
      tagged: fleet.filter((d) => d.assetTag).length,
    },
    /** Tickets opened by the simulated reset flow. Simulated, and labelled as such. */
    automation: {
      simulated: true,
      totalRuns: automated.length,
      autoResolved: automatedResolved.length,
      escalated: automated.length - automatedResolved.length,
      deflectionRate: tickets.length ? Math.round((automatedResolved.length / tickets.length) * 100) : 0,
    },
    generatedAt: new Date().toISOString(),
  };
}
