/**
 * Vertex AI (Gemini) conversation driver for the FDNY agent.
 *
 * Same interface as simulator.js - greeting / plan / planAction / narrate - so
 * the engine, its tools, GLPI and the confirmation rules do not change. Gemini
 * is the reasoning and wording layer only:
 *
 *   member message -> plan(): Gemini reads the conversation plus the member's
 *   GLPI context and either answers, asks a follow-up, runs ONE read tool, or
 *   offers buttons.  -> the engine runs the tool (existing FDNY services, GLPI)
 *   -> narrate(): Gemini words the result; the facts shown with it (details,
 *   map, buttons) come from the deterministic narrator, never from the model.
 *
 * Safety rules enforced here, not left to the prompt:
 *   - Only READ tools are callable by the model: lookupDevice,
 *     connectivityDiagnostic, validateAssetTag. Any other name - including
 *     every write tool and any invented one - is rejected and never executed.
 *   - Device tools take no device argument. They always act on the member's
 *     currently selected GLPI asset, so the model cannot target another device
 *     or another member.
 *   - Writes (device reset, ticket) are only ever OFFERED as buttons. The member
 *     taps; the tap goes through the simulator's deterministic, confirmation-gated
 *     action path (planAction), exactly as in simulated mode.
 *   - Results of write tools keep the deterministic narration, so a ticket
 *     number or a reset outcome is never paraphrased or invented by the model.
 *   - Any model error, timeout or empty answer falls back to the simulator for
 *     that turn. The conversation never breaks because the model did.
 *
 * Cost controls:
 *   - The model is called ONLY while answering a member's chat message: at most
 *     two calls per message (1: reasoning / tool choice, 2: wording a read-tool
 *     result). Greetings, button taps, page loads and every other endpoint use
 *     no model at all. The budget is enforced per message, so no loop can
 *     exceed it.
 *   - No retries: the SDK retries up to 5 times by default, so every request
 *     sets retryOptions.attempts = 1. A timeout aborts the request and the
 *     simulator answers; nothing is regenerated.
 *   - Flash models run with thinking disabled (thinkingBudget 0), so the short
 *     output limit is spent on the reply rather than on internal reasoning.
 *
 * The Google SDK is imported lazily, on the first real model request. Nothing
 * here runs, loads or connects in AI_MODE=simulated.
 */
import * as simulator from "./simulator.js";
import { formatGuidance, retrieveGuidance } from "./knowledge.js";

export const DRIVER_NAME = "vertex-gemini";

const ACT = simulator.ACTIONS;

/** Tools the model may run on its own. All read-only. */
const READ_TOOLS = {
  lookupDevice: {
    intent: "lost",
    usesDevice: true,
    description:
      "Where the member's selected device is assigned: its GLPI station, address, coordinates and GLPI status, plus SIMULATED check-in details. Use for missing, lost or 'where is my device' questions. Acts on the selected device only.",
    parameters: { type: "OBJECT", properties: {} },
  },
  connectivityDiagnostic: {
    intent: "connectivity",
    usesDevice: true,
    description:
      "SIMULATED carrier diagnostic of the member's selected device (healthy / degraded / failure). Uses the GLPI SIM/line record when one exists. Use for signal, data, FirstNet, Verizon, SIM or eSIM problems. Acts on the selected device only.",
    parameters: { type: "OBJECT", properties: {} },
  },
  validateAssetTag: {
    intent: "inventory",
    usesDevice: false,
    description:
      "Check an equipment identifier the member typed (for example a BTDS inventory tag) against the GLPI asset catalog. Read-only: never changes a record.",
    parameters: {
      type: "OBJECT",
      properties: { submitted: { type: "STRING", description: "The identifier exactly as the member typed it." } },
      required: ["submitted"],
    },
  },
};

/** Buttons the model may offer. Writes appear here only as buttons. */
const OFFERABLE = ["diagnose", "reset-device", "escalate", "resolved", "still-broken", "not-there", "retry-tag", "confirm-tag", "reject-tag"];

/** A write the model tried to call directly becomes the matching button, never an action. */
const WRITE_AS_OFFER = {
  resetDevice: "reset-device",
  "reset-device": "reset-device",
  esimRefresh: "reset-device",
  escalate: "escalate",
  escalateToTicket: "escalate",
  createTicket: "escalate",
  reportTicket: "escalate",
};

const SUGGEST = {
  name: "suggest_actions",
  description:
    "Offer buttons the member can tap. Anything that changes something (a device reset, creating a service ticket) is only ever offered here - the member confirms by tapping.",
  parameters: {
    type: "OBJECT",
    properties: {
      actions: {
        type: "ARRAY",
        items: { type: "STRING", enum: OFFERABLE },
        description:
          "diagnose = run the connectivity check; reset-device = simulated reset (the member confirms); escalate = create a service ticket (the member confirms); resolved = the member says it is fixed/found; still-broken = the member says it is still not working; not-there = the device is not at its GLPI location; retry-tag = type the identifier again; confirm-tag / reject-tag = accept or reject a suggested identifier.",
      },
    },
    required: ["actions"],
  },
};

const DECLARATIONS = [
  ...Object.entries(READ_TOOLS).map(([name, t]) => ({ name, description: t.description, parameters: t.parameters })),
  SUGGEST,
];

/** Hard cap: reasoning + one narration. Never more, for any message. */
export const MAX_CALLS_PER_MESSAGE = 2;

/**
 * Generation settings, checked against the installed @google/genai types:
 *   thinkingConfig.thinkingLevel (MINIMAL | LOW | MEDIUM | HIGH) - the control
 *     for Gemini 3.x models. Flash gets MINIMAL, the lowest level. The budget
 *     control is not sent to them, so the two are never mixed.
 *   thinkingConfig.thinkingBudget - "0 is DISABLED"; kept for Gemini 2.x Flash.
 *   httpOptions.retryOptions.attempts - "If 0 or 1, it means no retries. If not
 *     specified, default to 5."
 *   httpOptions.timeout - milliseconds.
 * Flash models keep the 400-token output limit; other models get 1024.
 * Temperature: Gemini 3.x runs at its documented default (1.0), so none is
 * sent; earlier models keep 0.3.
 * The level is passed as its string value so the SDK is not loaded here.
 */
export function generationSettings(model, timeoutMs) {
  const name = String(model ?? "").trim().toLowerCase().replace(/^publishers\/google\/models\//, "");
  const flash = /flash/.test(name);
  const major = Number((name.match(/^gemini-(\d+)/) ?? [])[1] ?? 0);
  const thinkingConfig = major >= 3 ? { thinkingLevel: flash ? "MINIMAL" : "LOW" } : flash ? { thinkingBudget: 0 } : null;
  return {
    ...(major >= 3 ? {} : { temperature: 0.3 }),
    maxOutputTokens: flash ? 400 : 1024,
    ...(thinkingConfig ? { thinkingConfig } : {}),
    httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
  };
}

/**
 * The model turn to send back with a tool result, and one functionResponse for
 * every function call in it. When the model's own content is available it is
 * replayed verbatim: Gemini 3.x signs its function-call parts (thoughtSignature)
 * and rejects a replayed call without the signature. Otherwise the calls are
 * rebuilt from what the model requested, with their ids.
 */
function replayFor(replay, toolName, result) {
  const original = replay?.content?.parts?.some((p) => p?.functionCall) ? replay.content : null;
  let calls = original ? original.parts.filter((p) => p?.functionCall).map((p) => p.functionCall) : replay?.calls ?? [];
  if (!calls.length) calls = [{ name: toolName, args: {} }];
  const modelTurn = original
    ? { role: "model", parts: original.parts }
    : { role: "model", parts: calls.map((fc) => ({ functionCall: { name: fc.name, args: fc.args ?? {}, ...(fc.id ? { id: fc.id } : {}) } })) };
  const responses = calls.map((fc) => ({
    functionResponse: {
      name: fc.name,
      ...(fc.id ? { id: fc.id } : {}),
      response:
        fc.name === toolName
          ? toolView(toolName, result)
          : fc.name === SUGGEST.name
            ? { shown: true }
            : { error: "This tool is not available to the assistant." },
    },
  }));
  return { modelTurn, responses };
}

class BudgetError extends Error {}

/** Tools whose results are narrated deterministically - they changed something. */
const WRITE_RESULTS = new Set(["resetDevice", "escalate", "applyInventoryTag", "adoptAsset"]);

const STAGE_WORDS = {
  located: "the device's GLPI location was shown; waiting to hear whether it is there",
  searching: "the member is looking for the device",
  diagnosed: "a connectivity diagnostic was run",
  "reset-ok": "a simulated reset completed; waiting to hear whether service is back",
  "reset-failed": "a simulated reset could not reach the device; it is logged with the service desk",
  "still-broken": "the member says the problem is still there after troubleshooting",
  resolved: "the member said the problem is fixed",
  ticketed: "a service ticket was opened",
};

export function systemPrompt(context, guidance = "") {
  return `You are the FDNY IT Service Assistant. You work like an active IT support technician helping an FDNY member with their department equipment, in a mobile chat.

HOW TO HELP
- Acknowledge what the member is experiencing, then say briefly what you are checking.
- Keep replies short: one to three sentences in plain words. Use a short list only for steps.
- Ask one short, useful follow-up question when you need information.
- After any check or action, ask what the member sees now. If the problem remains, suggest the next troubleshooting step.
- Offer a service ticket naturally when troubleshooting has not solved it, or when the member asks. Never push a ticket just to end the conversation.
- The member decides when the conversation is finished. Do not close with generic sign-offs such as "Is there anything else I can help you with?" or "Let me know if you need anything else." When they say it is fixed, acknowledge it briefly and stop.

FACTS - NEVER INVENT
- The FDNY CONTEXT below comes from GLPI, the source of truth for the member, their devices, locations, tickets and SIM/carrier records. Use only those facts.
- Never invent device state, locations, coordinates, GLPI records, ticket numbers, reset results or carrier telemetry. If you do not have a fact, say so, or run the matching tool.
- Tool results marked simulated (check-in, battery, accuracy, carrier diagnostics, resets) are demo simulations, not live telemetry. Say so when you use them, and keep GLPI facts and simulated figures clearly apart.
- The FDNY KNOWLEDGE BASE, when present, is guidance on what to check and suggest. It is never live state and never overrides the FDNY CONTEXT or a tool result.

TOOLS
- lookupDevice, connectivityDiagnostic and validateAssetTag read information. They always act on the member's currently selected device; you cannot choose a different device or member.
- suggest_actions offers buttons. A device reset ("reset-device") and a service ticket ("escalate") are ONLY ever offered as buttons - the member confirms by tapping. Never say a reset ran or a ticket was created unless a tool result in this conversation says so.
- There is no sound ping or sound trigger. Do not offer one.

FDNY CONTEXT (from GLPI)
${context}${guidance ? `

${guidance}` : ""}`;
}

function contextOf(session) {
  const u = session.user ?? {};
  const d = session.device;
  const lines = [`Member: ${u.displayName ?? u.name ?? "unknown"}${u.employeeId ? ` (employee ${u.employeeId})` : ""}`];
  if (d) {
    lines.push(
      `Selected device: ${d.name} - ${d.type ?? "type not recorded"} (GLPI itemtype ${d.itemType})${d.assetTag ? `, inventory tag ${d.assetTag}` : ", no inventory tag on record"}, GLPI status ${d.status ?? "not recorded"}`,
    );
    lines.push(
      `Assigned station: ${d.locationName ?? "not recorded"}${d.latitude && d.longitude ? ` (GLPI coordinates ${d.latitude}, ${d.longitude})` : ""}`,
    );
  } else {
    lines.push("Selected device: none - ask the member to pick one of their assigned devices on the left.");
  }
  const stage = session.slots?.stage && STAGE_WORDS[session.slots.stage];
  if (stage) lines.push(`Troubleshooting so far: ${stage}.`);
  const tickets = (session.tickets ?? []).map((t) => `${t.ticketId} (${t.status})`);
  if (tickets.length) lines.push(`Tickets created in this conversation: ${tickets.join(", ")}`);
  return lines.join("\n");
}

/** Recent conversation as Gemini contents: user/model turns, merged, starting with the member. */
function historyContents(session) {
  const out = [];
  for (const h of (session.history ?? []).slice(-14)) {
    const role = h.role === "assistant" ? "model" : "user";
    const raw = String(h.text ?? "");
    const text = (raw.startsWith("[action] ") ? `(tapped the "${raw.slice(9)}" button)` : raw).slice(0, 1200);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push({ text });
    else out.push({ role, parts: [{ text }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

const SIGN_OFF = /\s*(is there anything else (i can help you with|you need)[^.?!]*[.?!]?|let me know if you need anything else[.?!]?|have a (good|great) day[.?!]?)\s*$/i;

function cleanText(text) {
  return String(text ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*/g, "")
    .replace(SIGN_OFF, "")
    .trim()
    .slice(0, 800);
}

function deviceArgs(d) {
  return d ? { deviceId: d.id, itemType: d.itemType, assetTag: d.assetTag ?? null, name: d.name } : {};
}

/** Compact, model-facing view of a read tool's result. */
function toolView(name, r) {
  if (!r) return { error: "no result" };
  if (name === "lookupDevice") {
    return {
      found: Boolean(r.found),
      device: r.device ? { name: r.device.name, type: r.device.type, itemType: r.device.itemType, glpiStatus: r.device.status } : null,
      glpiLocation: r.location ? { station: r.location.name, address: [r.location.address, r.location.town].filter(Boolean).join(", "), latitude: r.location.latitude, longitude: r.location.longitude } : null,
      simulatedTelemetry: r.telemetry
        ? { lastCheckIn: r.telemetry.lastSeenLabel, batteryPercent: r.telemetry.batteryPercent, accuracyMetres: r.telemetry.locationAccuracyMetres, enrollment: r.telemetry.enrollment }
        : null,
    };
  }
  if (name === "connectivityDiagnostic") {
    return {
      simulated: true,
      state: r.state,
      detail: r.reason?.detail ?? null,
      carrier: r.sim ? `${r.sim.carrier ?? "on file"} ${r.sim.simType ?? ""}`.trim() : null,
      carrierDataSource: r.carrierDataSource === "glpi" ? "GLPI SIM/line record" : "simulated demo telemetry (GLPI holds no SIM record)",
    };
  }
  if (name === "validateAssetTag") {
    return {
      verdict: r.verdict,
      submitted: r.submitted,
      match: r.match ? { name: r.match.name, type: r.match.type, station: r.match.locationName, glpiStatus: r.match.status } : null,
      suggestion: r.proposed ? { identifier: r.proposed.identifier, confidence: r.proposed.confidence } : null,
    };
  }
  return { note: "result not shared with the model" };
}

function offersFrom(ids, session, intent) {
  const out = [];
  const add = (a) => a && !out.some((x) => x.label === a.label) && out.push(a);
  for (const id of ids) {
    if (!OFFERABLE.includes(id)) continue;
    if ((id === "diagnose" || id === "reset-device") && !session.device) continue;
    if ((id === "confirm-tag" || id === "reject-tag") && !session.slots?.suggestedTag) continue;
    add(
      {
        diagnose: ACT.diagnose,
        "reset-device": ACT.reset,
        escalate: ACT.escalate,
        resolved: intent === "lost" ? ACT.foundIt : ACT.resolved,
        "still-broken": ACT.stillBroken,
        "not-there": ACT.notThere,
        "retry-tag": ACT.retryTag,
        "confirm-tag": ACT.confirmTag,
        "reject-tag": ACT.rejectTag,
      }[id],
    );
  }
  return out.slice(0, 3);
}

export class VertexConfigError extends Error {}

/**
 * Builds the driver. `generate(request)` performs one model call and returns
 * { text, functionCalls }. Tests pass a mock; the default makes the real call.
 */
export function createVertexDriver({ config = {}, generate = null, log = console } = {}) {
  const stats = { modelRequests: 0, liveRequests: 0, sdkLoads: 0, fallbacks: 0, rejectedTools: [], messages: 0 };
  let client = null;
  // No default: the model is whatever VERTEX_MODEL names, never a silent choice.
  const model = config.model ?? null;
  const timeoutMs = config.timeoutMs ?? 15000;

  async function liveGenerate(request) {
    // Every check happens before the SDK is even loaded.
    if (!config.project) throw new VertexConfigError("AI_MODE=vertex but GOOGLE_CLOUD_PROJECT is not set");
    if (!config.model) throw new VertexConfigError("AI_MODE=vertex but VERTEX_MODEL is not set");
    if (config.retired) throw new VertexConfigError(config.retired);
    const { GoogleGenAI } = await import("@google/genai");
    stats.sdkLoads += 1;
    // Same initialisation as the ITServiceDesk-ENG service: Vertex AI through
    // Application Default Credentials. No key file.
    client ??= new GoogleGenAI({
      vertexai: true,
      project: config.project,
      location: config.location ?? "us-central1",
      // Client-wide as well as per request: never let the SDK retry on its own.
      httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
    });
    stats.liveRequests += 1;
    const r = await client.models.generateContent(request);
    return {
      text: r.text,
      functionCalls: r.functionCalls ?? [],
      usage: r.usageMetadata ?? null,
      // The model's exact turn, kept so the narration call can replay it.
      content: r.candidates?.[0]?.content ?? null,
    };
  }
  const call = generate ?? liveGenerate;

  /**
   * One model call, charged to the current chat message. Refuses when there is
   * no chat message (a greeting or a button tap) or the budget is spent, so a
   * third call is impossible. Makes exactly one attempt: no retry, no
   * regeneration after a timeout.
   */
  async function ask(session, contents, withTools, guidance = "") {
    const turn = session.vertexTurn;
    if (!turn) throw new BudgetError("no chat message in progress");
    if (turn.calls >= MAX_CALLS_PER_MESSAGE) throw new BudgetError(`budget of ${MAX_CALLS_PER_MESSAGE} calls reached`);
    turn.calls += 1;
    stats.modelRequests += 1;

    const controller = new AbortController();
    const request = {
      model,
      contents,
      config: {
        systemInstruction: systemPrompt(contextOf(session), guidance),
        ...generationSettings(model, timeoutMs),
        abortSignal: controller.signal,
        ...(withTools ? { tools: [{ functionDeclarations: DECLARATIONS }], toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
      },
    };
    const started = Date.now();
    let timer;
    try {
      const res = await Promise.race([
        Promise.resolve().then(() => call(request)),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`timeout after ${timeoutMs} ms`));
          }, timeoutMs);
        }),
      ]);
      return { ...res, ms: Date.now() - started, call: turn.calls };
    } catch (error) {
      error.ms = Date.now() - started;
      error.call = turn.calls;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One line per model call: model, call number, latency, tool, token counts,
   * fallback. Never the member's text, the reply, credentials, auth tokens or
   * request headers.
   */
  function usageLog(turn, { call, ms, tool = null, usage = null, fallback = false, reason = null, kind }) {
    const tokens = usage
      ? ` tokens in=${usage.promptTokenCount ?? "?"} out=${usage.candidatesTokenCount ?? "?"} thinking=${usage.thoughtsTokenCount ?? 0}`
      : "";
    const line = `[vertex] message#${turn?.id ?? "-"} call ${call ?? "-"}/${MAX_CALLS_PER_MESSAGE} ${kind} model=${model} ${ms ?? "-"}ms tool=${tool ?? "none"}${tokens} fallback=${fallback ? `yes (${reason})` : "no"}`;
    (fallback ? log.warn : log.info)?.call(log, line);
  }

  function fallback(turnOut, error, kind, turn = null) {
    stats.fallbacks += 1;
    // The reason only - never the member's message or model output.
    usageLog(turn, { call: error?.call, ms: error?.ms, fallback: true, reason: error?.message ?? String(error), kind });
    return { ...turnOut, _agent: { fallback: true } };
  }

  async function plan({ session, text }) {
    // A new chat message opens a new budget of MAX_CALLS_PER_MESSAGE calls.
    stats.messages += 1;
    session.vertexTurn = { id: stats.messages, calls: 0 };

    // Only the knowledge-base entries relevant to this message go in the prompt.
    const topic = session.intent ?? simulator.classify(text);
    const guidance = formatGuidance(retrieveGuidance({ text, intent: topic }));
    let res;
    try {
      res = await ask(session, historyContents(session), true, guidance);
    } catch (e) {
      e.call ??= session.vertexTurn.calls;
      const turn = session.vertexTurn;
      // After a failure the whole message stays on the simulator: close the
      // budget so its narration cannot make a second, repeated attempt.
      session.vertexTurn = null;
      return fallback(simulator.plan({ session, text }), e, "reasoning", turn);
    }

    let toolCall = null;
    const offerIds = [];
    for (const fc of res?.functionCalls ?? []) {
      const name = String(fc?.name ?? "");
      if (name === SUGGEST.name) {
        offerIds.push(...(Array.isArray(fc.args?.actions) ? fc.args.actions.map(String) : []));
      } else if (READ_TOOLS[name]) {
        if (!toolCall) toolCall = { name, args: fc.args ?? {} };
      } else {
        stats.rejectedTools.push(name);
        log.warn?.(`[agent] rejected tool "${name}" - not an FDNY read tool${WRITE_AS_OFFER[name] ? "; offered as a button instead" : ""}`);
        if (WRITE_AS_OFFER[name]) offerIds.push(WRITE_AS_OFFER[name]);
      }
    }

    let message = cleanText(res?.text);
    let tool;
    let intent = session.intent ?? "general";

    if (toolCall) {
      const spec = READ_TOOLS[toolCall.name];
      if (spec.usesDevice && !session.device) {
        message = message || "Select one of your assigned devices on the left first, so I check the right one.";
      } else if (toolCall.name === "validateAssetTag") {
        const submitted = String(toolCall.args?.submitted ?? "").trim().slice(0, 64);
        if (submitted) {
          tool = { name: "validateAssetTag", args: { submitted } };
          intent = spec.intent;
        }
      } else {
        // The model never chooses the device: always the member's selected asset.
        tool = { name: toolCall.name, args: deviceArgs(session.device) };
        intent = spec.intent;
      }
    }

    // Kept for the narration call, which must return this exact model turn.
    if (tool) session.vertexTurn.replay = { content: res.content ?? null, calls: res.functionCalls ?? [] };

    const actions = offersFrom(offerIds, session, intent);

    // The model tried to act directly. Whatever it said ("opening a ticket...")
    // did not happen, so its words are replaced by a plain confirmation prompt.
    const attemptedWrite = (res?.functionCalls ?? []).some((fc) => WRITE_AS_OFFER[String(fc?.name ?? "")]);
    if (attemptedWrite) {
      const labels = actions.filter((a) => a.id === "escalate" || a.id === "reset-device").map((a) => `"${a.label}"`);
      message = labels.length ? `Tap ${labels.join(" or ")} below to confirm and I'll go ahead.` : message;
    }

    if (!message && !tool) {
      const empty = Object.assign(new Error("empty model reply"), { call: res.call, ms: res.ms });
      const turn = session.vertexTurn;
      session.vertexTurn = null;
      return fallback(simulator.plan({ session, text }), empty, "reasoning", turn);
    }

    usageLog(session.vertexTurn, { call: res.call, ms: res.ms, tool: tool?.name, usage: res.usage, kind: "reasoning" });
    return { intent, message, ...(tool ? { tool } : {}), actions, _agent: { fallback: false } };
  }

  /**
   * A member's button tap: deterministic and confirmation-gated, as in
   * simulated mode. It closes any chat-message budget, so the tap - including
   * a read such as "Run connectivity diagnostic" - costs no model call.
   */
  function planAction(args) {
    if (args?.session) args.session.vertexTurn = null;
    return simulator.planAction(args);
  }

  async function narrate(toolName, result, session) {
    const facts = simulator.narrate(toolName, result, session);
    if (WRITE_RESULTS.has(toolName) || !READ_TOOLS[toolName]) return facts;
    // Taps and greetings have no chat-message budget: deterministic wording.
    const turn = session.vertexTurn;
    if (!turn || turn.calls >= MAX_CALLS_PER_MESSAGE) return facts;
    const lastUser = [...(session.history ?? [])].reverse().find((h) => h.role === "user")?.text ?? "";
    const guidance = formatGuidance(retrieveGuidance({ text: lastUser, intent: READ_TOOLS[toolName].intent }));
    const { modelTurn, responses } = replayFor(turn.replay, toolName, result);
    try {
      const res = await ask(session, [...historyContents(session), modelTurn, { role: "user", parts: responses }], false, guidance);
      const message = cleanText(res?.text);
      usageLog(turn, { call: res.call, ms: res.ms, tool: toolName, usage: res.usage, kind: "narration", fallback: !message, reason: message ? null : "empty model reply" });
      return { ...facts, message: message || facts.message, ...(message ? {} : { _agent: { fallback: true } }) };
    } catch (e) {
      fallback({}, e, "narration", turn);
      return { ...facts, _agent: { fallback: true } };
    }
  }

  return { DRIVER_NAME, greeting: simulator.greeting, plan, planAction, narrate, stats };
}
