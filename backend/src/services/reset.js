/**
 * Device reset - SIMULATED.
 *
 * Claudio's demo flow: the member picks one of their assigned devices and asks
 * for a reset. Nothing contacts a carrier or an MDM. The asset, its location and
 * the resulting ticket are real GLPI records; the reset itself is fabricated.
 *
 * Works for both itemtypes. Most of the current fleet has no SIM/Line record, so
 * a missing SIM is NOT a failure: the result degrades to a generic device reset
 * and says so. Carrier details are included only when GLPI actually has them.
 */
import { getDeviceSim, resolveDevice, summarize } from "./assets.js";

export const SIMULATED_BY = "device-reset-mock";

const mark = (payload) => ({ simulated: true, simulatedBy: SIMULATED_BY, ...payload });

/**
 * Runs the simulated reset and returns what happened. No GLPI write occurs here;
 * the route creates the ticket so there is one place that writes.
 */
export async function simulateDeviceReset({ deviceId, assetTag, name, itemType, simulate } = {}) {
  const device = await resolveDevice({ deviceId, assetTag, name, itemType });
  if (!device) {
    return mark({
      action: "device-reset",
      success: false,
      outcome: "not_found",
      reason: { code: "device_not_found", detail: "No FDNY asset matches that reference." },
      device: null,
      sim: null,
    });
  }

  const sim = await getDeviceSim(device.id, device.itemType).catch(() => null);
  const status = String(device.status ?? "").toLowerCase();
  const unreachable = status.includes("lost") || status.includes("stolen");

  // Deterministic: only an asset GLPI flags as lost/stolen fails. Everything
  // else resets, with or without carrier data.
  const forcedFailure = simulate === "failure";
  const success = !forcedFailure && !unreachable;

  const kind = sim ? (sim.isEsim ? "esim_profile_refresh" : "sim_reprovision") : "device_network_reset";

  return mark({
    action: "device-reset",
    resetType: kind,
    success,
    outcome: success ? "completed" : "failed",
    device: summarize(device),
    /** Present only when GLPI holds a SIM/Line record for this asset. */
    sim: sim
      ? {
          carrier: sim.carrier,
          simType: sim.simType,
          isEsim: sim.isEsim,
          iccid: sim.iccid,
          msisdn: sim.msisdn,
          line: sim.line,
        }
      : null,
    carrierDataAvailable: Boolean(sim),
    reason: success
      ? {
          code: "reset_completed",
          detail: sim
            ? `Simulated ${sim.isEsim ? "eSIM profile refresh" : "SIM re-provision"} for ${sim.carrier ?? "the carrier"} on line ${sim.msisdn ?? sim.line ?? "on record"}.`
            : "Simulated network reset applied on the device. No SIM or carrier record exists for this asset in GLPI, so no line-level action was simulated.",
        }
      : {
          code: unreachable ? "device_unreachable" : "reset_failed",
          detail: unreachable
            ? "Asset is flagged Lost or stolen, so the reset could not be delivered."
            : "The simulated reset did not complete.",
        },
    note: "Simulated for the demo. No carrier, MDM or Workspace ONE system was contacted.",
    durationSeconds: success ? 110 : 0,
    escalationRecommended: !success,
  });
}

/**
 * Runs the simulated reset AND records it in GLPI: ticket created as New, asset
 * linked with its real itemtype, then closed. GLPI refuses Item_Ticket on an
 * already-closed ticket, hence the ordering.
 *
 * Shared by POST /api/ticket/reset-sim and the agent, so there is one
 * implementation of "reset and write it down".
 */
export async function resetDeviceAndRecord({ userId, deviceId, assetTag, name, itemType, simulate }) {
  const { createTicket, linkAssetToTicket, resolveAssetRef, updateItem } = await import("../glpi.js");

  const reset = await simulateDeviceReset({ deviceId, assetTag, name, itemType, simulate });
  if (!reset.device) return { ...reset, ticketId: null, rawTicketId: null, assetLinked: false };

  const label = reset.device.assetTag || reset.device.name;
  const ticket = await createTicket({
    name: `${reset.success ? "Device reset completed" : "Device reset failed"} - ${label}`,
    content:
      `<p><strong>${reset.reason.detail}</strong></p><ul>` +
      `<li><strong>Device:</strong> ${reset.device.name} (${reset.device.type ?? reset.device.itemType})</li>` +
      `<li><strong>Inventory tag:</strong> ${reset.device.assetTag ?? "not assigned"}</li>` +
      `<li><strong>Location:</strong> ${reset.device.locationName ?? "unknown"}</li>` +
      `<li><strong>Reset type:</strong> ${reset.resetType}</li>` +
      `<li><strong>Carrier record:</strong> ${reset.carrierDataAvailable ? `${reset.sim?.carrier ?? "on file"} / ${reset.sim?.msisdn ?? "line on file"}` : "none in GLPI"}</li>` +
      `</ul><p><em>${reset.note}</em></p>`,
    status: 1,
    urgency: reset.success ? 2 : 4,
    _users_id_requester: userId,
    users_id_recipient: userId,
    ...(reset.device.locationId ? { locations_id: reset.device.locationId } : {}),
  });

  const ref = await resolveAssetRef({
    deviceId: reset.device.id,
    assetTag: reset.device.assetTag,
    name: reset.device.name,
    itemType: reset.device.itemType,
  });

  let assetLinked = false;
  if (ref && ticket?.id) {
    try {
      await linkAssetToTicket(ticket.id, ref.itemtype, ref.items_id);
      assetLinked = true;
    } catch (e) {
      console.error(`resetDeviceAndRecord: link failed on ticket ${ticket.id}:`, e);
    }
  }

  // A successful automated reset needs no technician, so it closes immediately.
  let ticketClosed = false;
  if (reset.success && ticket?.id) {
    try {
      await updateItem("Ticket", ticket.id, { status: 6 });
      ticketClosed = true;
    } catch (e) {
      console.error(`resetDeviceAndRecord: close failed on ticket ${ticket.id}:`, e);
    }
  }

  return {
    ...reset,
    ticketId: `${ticket.id}`,
    rawTicketId: ticket.id,
    ticketStatus: ticketClosed ? "CLOSED" : "NEW",
    assetLinked,
    assetItemType: ref?.itemtype ?? null,
    assetResolvedBy: ref?.resolvedBy ?? null,
    summary: reset.reason.detail,
  };
}
