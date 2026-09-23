/**
 * Agent engine.
 *
 * Owns sessions, context and tool execution. The *driver* only decides what to
 * say and which tool to run, so swapping the deterministic simulator for a
 * Vertex/Gemini driver means implementing plan/planAction/narrate against the
 * same Turn shape - nothing else here changes.
 *
 * The driver is chosen per turn by AI_MODE (see provider.js): the simulator by
 * default, or the Vertex/Gemini driver when AI_MODE=vertex. Both run the same
 * tools below and share the same confirmation rules.
 */
import { getLocation } from "../glpi.js";
import {
  applyInventoryTag,
  fieldCorrectionFor,
  getAssetOwner,
  resolveDevice,
  summarize,
  validateAssetTag,
} from "../services/assets.js";
import { escalateToTicket } from "../services/tickets.js";
import { lookupDevice } from "../services/workspaceone.mock.js";
import { connectivityDiagnostic } from "../services/carrier.mock.js";
import { resetDeviceAndRecord } from "../services/reset.js";
import { appendHistory, createSession, getSession, setDevice } from "./session.js";
import * as simulator from "./simulator.js";
import { activeDriver, aiMode, vertexConfig } from "./provider.js";

/** Tools the driver may name. Each maps to an already-implemented service. */
const TOOLS = {
  lookupDevice: (args) => lookupDevice(args),
  connectivityDiagnostic: (args) => connectivityDiagnostic(args),
  // Validation is read-only. The matched asset is enriched with its owner so
  // the answer can show who holds the equipment, and flagged when the CMDB has
  // a genuinely empty inventory field the user could fill.
  validateAssetTag: async (args, session) => {
    const result = await validateAssetTag(args.submitted);
    const target = result.match ?? result.proposed?.device ?? null;
    if (target) {
      const owner = await getAssetOwner(target.userId);
      if (owner) target.ownerName = owner.name;
      result.fieldCorrection = fieldCorrectionFor(result.submitted, target);
    }
    // An exact match needs no confirmation, so it becomes the working asset
    // straight away and is recorded. A suggestion waits for confirm-tag.
    if (result.verdict === "valid" && result.match) {
      const device = await resolveDevice({ deviceId: result.match.id, itemType: result.match.itemType });
      if (device) {
        device.ownerName = result.match.ownerName ?? null;
        session.device = device;
      }
      session.audit.push({
        at: new Date().toISOString(),
        action: "inventory-identifier-validated",
        submitted: result.submitted,
        resolvedTo: { id: result.match.id, name: result.match.name, itemType: result.match.itemType },
        cmdbModified: false,
      });
    }
    return result;
  },

  /**
   * Confirmation step. Adopts the matched asset as the session's device for the
   * rest of the workflow and records the decision. No GLPI write happens here -
   * this corrects what the user typed, not the asset record.
   */
  adoptAsset: async (_args, session) => {
    const candidate = session.slots.candidate;
    if (!candidate) return { device: null, submitted: session.slots.submittedIdentifier ?? null };
    const device = await resolveDevice({ deviceId: candidate.id, itemType: candidate.itemType });
    if (device) {
      const owner = await getAssetOwner(device.userId);
      if (owner) device.ownerName = owner.name;
      session.device = device;
    }
    const chosen = device ?? candidate;
    session.audit.push({
      at: new Date().toISOString(),
      action: "inventory-identifier-corrected",
      submitted: session.slots.submittedIdentifier ?? null,
      resolvedTo: { id: chosen.id, name: chosen.name, itemType: chosen.itemType, assetTag: chosen.assetTag ?? null },
      cmdbModified: false,
    });
    return {
      device: { ...summarize(chosen), ownerName: chosen.ownerName ?? null },
      submitted: session.slots.submittedIdentifier ?? null,
      fieldCorrection: session.slots.needsFieldCorrection ?? null,
      cmdbModified: false,
    };
  },

  /** The only asset-field write, and only after an explicit second confirmation. */
  applyInventoryTag: async (_args, session) => {
    const fc = session.slots.needsFieldCorrection;
    const device = session.device ?? session.slots.candidate;
    if (!fc || !device) return { applied: false, reason: "There is no pending inventory-number correction." };
    const out = await applyInventoryTag({ deviceId: device.id, itemType: device.itemType, tag: fc.value });
    session.audit.push({
      at: new Date().toISOString(),
      action: "inventory-field-written",
      field: fc.field,
      value: fc.value,
      cmdbModified: out.applied,
    });
    if (out.applied && out.device) session.device = { ...device, assetTag: out.value };
    session.slots.needsFieldCorrection = null;
    return out;
  },
  resetDevice: (args, session) => resetDeviceAndRecord({ ...args, userId: session.user.id }),
  escalate: (args, session) => escalateToTicket(escalationPayload(args, session)),
};

const TICKET_TOOLS = new Set(["resetDevice", "escalate"]);

function escalationPayload(args, session) {
  const d = session.device;
  const intent = session.intent ?? "general";
  const titles = {
    lost: `Lost or misplaced ${d?.name ?? "equipment"}`,
    connectivity: `Connectivity issue on ${d?.name ?? "equipment"}`,
    inventory: `Inventory identifier issue${session.slots.submittedIdentifier ? ` - ${session.slots.submittedIdentifier}` : ""}`,
    general: `Service request - ${d?.name ?? "FDNY equipment"}`,
  };
  const said = session.history
    .filter((h) => h.role === "user")
    .map((h) => h.text)
    .join("\n");

  return {
    userId: session.user.id,
    deviceId: args.deviceId ?? d?.id ?? null,
    assetTag: args.assetTag ?? d?.assetTag ?? null,
    deviceName: args.name ?? d?.name ?? null,
    itemType: args.itemType ?? d?.itemType ?? null,
    title: titles[intent] ?? titles.general,
    text:
      (session.slots.description || said || "Reported through the FDNY service assistant.") +
      `\n\nRaised through the FDNY service assistant (simulated agent, no AI provider called).` +
      (session.slots.submittedIdentifier
        ? `\nIdentifier submitted by the member: ${session.slots.submittedIdentifier}`
        : "") +
      (session.slots.suggestedTag
        ? `\nClosest catalog match: ${session.slots.suggestedTag}`
        : session.slots.submittedIdentifier
          ? "\nNo asset in the catalog matches that identifier."
          : ""),
    category: { lost: "Lost or Stolen", connectivity: "Connectivity", inventory: "Asset Management", general: "Hardware" }[intent],
    urgency: intent === "lost" ? 4 : 3,
    locationId: d?.locationId ?? null,
    failedAction: session.lastAction ?? null,
  };
}

/** Shape every endpoint returns, so the frontend has one contract. */
function envelope(session, { message, details = [], actions = [], tool = null, result = null, ticket = null, map = null, agent = null }) {
  return {
    sessionId: session.id,
    message,
    intent: session.intent,
    context: {
      user: { id: session.user.id, name: session.user.displayName ?? session.user.name, employeeId: session.user.employeeId ?? null },
      device: session.device ? summarize(session.device) : null,
      location: session.location,
    },
    details,
    actions,
    /** Map marker at the asset's real GLPI coordinates, when it has any. */
    map,
    tool,
    result,
    ticket,
    /** What the conversation has decided, and whether GLPI was actually changed. */
    audit: session.audit,
    simulated: true,
    agent: {
      driver: activeDriver().DRIVER_NAME,
      vertex: aiMode() === "vertex",
      model: aiMode() === "vertex" ? vertexConfig().model : null,
      /** True when the Vertex driver failed and the simulator answered instead. */
      fallback: Boolean(agent?.fallback),
    },
  };
}

export async function startSession({ user, deviceId, itemType }) {
  const device = deviceId ? await resolveDevice({ deviceId, itemType }) : null;
  let location = null;
  if (device?.locationId) {
    const l = await getLocation(device.locationId).catch(() => null);
    if (l) {
      location = {
        id: l.id,
        name: l.name,
        address: l.address ?? null,
        town: l.town ?? null,
        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
      };
    }
  }

  const session = createSession({ user, device, location });
  const turn = activeDriver().greeting(session);
  appendHistory(session, "assistant", turn.message);
  return envelope(session, turn);
}

/** Runs one driver turn: optional tool call, then narration. */
async function runTurn(session, turn) {
  if (turn.intent !== undefined) session.intent = turn.intent;
  if (turn.slots) Object.assign(session.slots, turn.slots);

  const agent = { fallback: Boolean(turn._agent?.fallback) };
  let message = turn.message;
  let details = [];
  let actions = turn.actions ?? [];
  let result = null;
  let ticket = null;
  let map = null;

  if (turn.tool) {
    const fn = TOOLS[turn.tool.name];
    if (!fn) throw new Error(`Unknown agent tool: ${turn.tool.name}`);
    result = await fn(turn.tool.args ?? {}, session);

    const narration = await activeDriver().narrate(turn.tool.name, result, session);
    if (narration._agent?.fallback) agent.fallback = true;
    if (narration.message) message = `${message} ${narration.message}`.trim();
    details = narration.details ?? [];
    map = narration.map ?? null;
    if (narration.actions) actions = narration.actions;
    if (narration.slots) Object.assign(session.slots, narration.slots);

    if (TICKET_TOOLS.has(turn.tool.name) && result?.ticketId) {
      ticket = {
        ticketId: result.ticketId,
        rawTicketId: result.rawTicketId,
        status: result.ticketStatus ?? result.status ?? "NEW",
        assetLinked: Boolean(result.assetLinked),
        assetItemType: result.assetItemType ?? null,
      };
      session.tickets.push(ticket);
    }

    // A failed automated action should lead the user to escalation.
    if (result && result.escalationRecommended && !actions.some((a) => a.id === "escalate")) {
      actions = [...actions, simulator.ACTIONS.escalate];
    }
  }

  appendHistory(session, "assistant", message, { details, tool: turn.tool?.name ?? null });
  return envelope(session, { message, details, actions, tool: turn.tool?.name ?? null, result, ticket, map, agent });
}

/*
 * Repeat protection, for both drivers. A double-click, a re-sent request or a
 * second tab must never run a turn twice: that would repeat a model call, or a
 * write such as a reset or a ticket. While a turn is running for a session,
 * another request is answered with a short "still working" reply; the same
 * message or action repeated within REPEAT_WINDOW_MS gets the first answer back.
 */
const REPEAT_WINDOW_MS = 2500;

function repeatOf(session, key) {
  const last = session.lastRequest;
  return last && last.key === key && Date.now() - last.at < REPEAT_WINDOW_MS ? last.response : null;
}

async function once(session, key, run) {
  if (session.busy) {
    return { ...envelope(session, { message: "I'm still working on your last message - one moment." }), busy: true };
  }
  const repeat = repeatOf(session, key);
  if (repeat) return { ...repeat, duplicate: true };
  session.busy = true;
  try {
    const response = await run();
    session.lastRequest = { key, at: Date.now(), response };
    return response;
  } finally {
    session.busy = false;
  }
}

export async function handleMessage({ sessionId, text, deviceId, itemType }) {
  const session = getSession(sessionId);
  if (!session) return null;

  return once(session, `message:${String(text ?? "").trim().toLowerCase()}:${deviceId ?? ""}`, async () => {
    // The UI may switch the selected device mid-conversation.
    if (deviceId && (!session.device || Number(session.device.id) !== Number(deviceId) || session.device.itemType !== itemType)) {
      const device = await resolveDevice({ deviceId, itemType });
      if (device) setDevice(session, device);
    }

    appendHistory(session, "user", String(text ?? ""));
    return runTurn(session, await activeDriver().plan({ session, text }));
  });
}

export async function handleAction({ sessionId, action, payload = {}, deviceId, itemType }) {
  const session = getSession(sessionId);
  if (!session) return null;

  return once(session, `action:${action}:${deviceId ?? ""}`, async () => {
    // The UI may have switched device since the last message.
    if (deviceId && (!session.device || Number(session.device.id) !== Number(deviceId) || session.device.itemType !== itemType)) {
      const device = await resolveDevice({ deviceId, itemType });
      if (device) setDevice(session, device);
    }

    session.lastAction = action;
    appendHistory(session, "user", `[action] ${action}`);
    return runTurn(session, await activeDriver().planAction({ session, action, payload }));
  });
}

export { getSession };
