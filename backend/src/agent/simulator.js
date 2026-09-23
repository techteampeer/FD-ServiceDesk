/**
 * Deterministic agent driver - SIMULATED. No Vertex, Gemini or any paid API.
 *
 * This is the ONLY piece a Gemini/Vertex driver replaces. It implements the
 * driver contract below; the engine owns sessions, context and tool execution,
 * so a model-backed driver just has to decide "what to say and which tool to
 * run next" from the same inputs.
 *
 *   plan({ session, text })                  -> Turn
 *   planAction({ session, action, payload }) -> Turn
 *
 *   Turn = {
 *     message: string,             // assistant text
 *     intent: string,              // lost | connectivity | inventory | general | smalltalk
 *     tool?: { name, args },       // one tool for the engine to run, optional
 *     actions?: [{ id, label }],   // buttons offered to the user
 *     slots?: object,              // merged into session.slots
 *   }
 *
 * Intent detection is keyword-based on purpose: it must behave identically on
 * every run so the demo is reproducible.
 */
export const DRIVER_NAME = "deterministic-simulator";

const ACT = {
  diagnose: { id: "diagnose", label: "Run connectivity diagnostic" },
  reset: { id: "reset-device", label: "Reset this device" },
  escalate: { id: "escalate", label: "Create service ticket" },
  resolved: { id: "resolved", label: "It's working now" },
  foundIt: { id: "resolved", label: "Found it" },
  stillBroken: { id: "still-broken", label: "Still not working" },
  notThere: { id: "not-there", label: "It's not there" },
  confirmTag: { id: "confirm-tag", label: "Yes, that is my equipment" },
  rejectTag: { id: "reject-tag", label: "No, that is not my equipment" },
  applyTag: { id: "apply-tag", label: "Write this inventory number to the asset" },
  retryTag: { id: "retry-tag", label: "Enter the identifier again" },
};

export function classify(text) {
  const t = String(text ?? "").toLowerCase();
  if (/(lost|missing|misplace|can'?t find|cannot find|left (it|the)|stolen|locate|where is)/.test(t)) return "lost";
  // \bconnect keeps "disconnecting" (a hardware complaint) out of this bucket.
  if (/(signal|\bconnect|cellular|\bdata\b|network|firstnet|verizon|\bsim\b|esim|offline|no bars)/.test(t))
    return "connectivity";
  if (/(tag|asset number|inventory|identifier|barcode|serial|btds|wrong number|label)/.test(t)) return "inventory";
  if (/^(hi|hello|hey|thanks|thank you|ok|okay)\b/.test(t.trim())) return "smalltalk";
  return "general";
}

const deviceLabel = (d) => (d ? `${d.name}${d.assetTag ? ` (${d.assetTag})` : ""}` : "your device");
/** "FDNY-TAB-1001 (Tablet)" - GLPI's type name, falling back to the itemtype. */
const namedKind = (d) => `${d?.name}${d ? ` (${d.type ?? d.itemType})` : ""}`;
/**
 * Human word for a device. GLPI's own type name is authoritative: our ePCR
 * tablets are stored as `Phone` with the type "ePCR Tablet", so the itemtype
 * alone would call them cellphones.
 */
const kindWord = (d) => {
  const type = String(d?.type ?? "").toLowerCase();
  if (type.includes("tablet")) return "tablet";
  if (type.includes("phone")) return "cellphone";
  return d?.itemType === "Computer" ? "tablet" : d?.itemType === "Phone" ? "cellphone" : "device";
};

/*
 * Conversation stage. The assistant should behave like a technician who stays
 * with the member until the problem is actually solved: after every check or
 * action it asks what the member is seeing, and it only wraps up when the
 * member says it is fixed. The stage records where that troubleshooting is,
 * and is tied to the device it was recorded on - switching device starts over,
 * so a follow-up can never be applied to the wrong asset.
 */
const deviceKey = (d) => (d ? `${d.itemType}:${d.id}` : null);
const stageOf = (session) =>
  session.slots.stageDevice && session.slots.stageDevice === deviceKey(session.device) ? session.slots.stage : null;
const atStage = (session, stage) => ({ stage, stageDevice: deviceKey(session.device) });
const lastTicket = (session) => session.tickets?.[session.tickets.length - 1]?.ticketId ?? null;

// Checked before the topic classifier, and only once troubleshooting is under
// way, so an opening message such as "my tablet is not working" is still a new
// issue rather than a follow-up.
const STILL_BROKEN =
  /(still (not|no|can'?t|isn'?t|doesn'?t|won'?t|down|broken|failing|dead|offline|nothing)|not fixed|did ?n[o']?t (work|help|fix)|does ?n[o']?t work|same (problem|issue)|no change|no luck|(not|isn'?t) working|no (service|signal|bars|data))/;
const RESOLVED =
  /(fixed|(it'?s|is) working|works now|working now|resolved|sorted|all good|that did it|back (online|up)|got (it|service|signal)|found it|problem solved|good now)/;
const NOT_THERE = /(not there|isn'?t there|wasn'?t there|not at (the )?(station|quarters))/;
const AFFIRM = /^(yes|yeah|yep|yup|it does|that'?s right|correct|makes sense)\b/;

/** The member says the problem is still there: take the next step for where we are. */
function stillBroken(session) {
  const d = session.device;
  const stage = stageOf(session);
  if (stage === "located" || stage === "searching") {
    return {
      intent: "lost",
      message:
        "Understood - time to get the service desk involved. I can open a recovery ticket with what you've told me so they can track it down.",
      actions: [ACT.escalate, ACT.foundIt],
      slots: atStage(session, "searching"),
    };
  }
  if (stage === "reset-ok") {
    return {
      intent: "connectivity",
      message:
        "Thanks for checking. Try switching airplane mode on and off, and see whether anyone else at the station has signal - that tells us if it's the device or the area. If it's still down after that, a technician should take a look.",
      actions: [ACT.diagnose, ACT.resolved, ACT.escalate],
      slots: atStage(session, "still-broken"),
    };
  }
  if (stage === "reset-failed") {
    const ref = lastTicket(session);
    return {
      intent: "connectivity",
      message: `Understood. The reset couldn't reach ${deviceLabel(d)}, and that's already logged with the service desk${ref ? ` as ${ref}` : ""}, so a technician will pick it up. If anything changes on the device, tell me here.`,
      actions: [ACT.resolved],
      slots: atStage(session, "still-broken"),
    };
  }
  if (stage === "diagnosed") {
    return {
      intent: "connectivity",
      message: `Let's try a reset on ${deviceLabel(d)} next - it often brings service back.`,
      actions: [ACT.reset, ACT.escalate],
      slots: atStage(session, "diagnosed"),
    };
  }
  if (stage === "still-broken") {
    return {
      intent: session.intent ?? "connectivity",
      message:
        "Sorry it's still giving you trouble. A technician is the right next step now - I can open a service ticket with everything we've tried.",
      actions: [ACT.escalate, ACT.resolved],
    };
  }
  return {
    intent: session.intent ?? "general",
    message: "Sorry it's still giving you trouble. What is it doing right now?",
    actions: [],
    slots: { stage: null, stageDevice: null },
  };
}

/** The member says it is fixed: acknowledge and stop - no generic sign-off. */
function resolvedTurn(session) {
  const intent = session.intent;
  return {
    intent,
    message:
      intent === "lost"
        ? "Great - glad it turned up."
        : intent === "connectivity"
          ? "Great - glad it's back online. If the signal drops again, just tell me here."
          : "Good to hear it's sorted.",
    actions: [],
    slots: atStage(session, "resolved"),
  };
}

function notThere(session) {
  return {
    intent: "lost",
    message: "Let's narrow it down. Where did you last have it - on the apparatus, at a hospital, or back at quarters?",
    actions: [ACT.foundIt, ACT.escalate],
    slots: atStage(session, "searching"),
  };
}

function locationConfirmed(session) {
  const where = session.device?.locationName ?? "its station";
  return {
    intent: "lost",
    message: `Then it's most likely still at ${where}. Check the apparatus and the charging area there first, and tell me if it turns up. If it doesn't, I can open a recovery ticket.`,
    actions: [ACT.foundIt, ACT.escalate],
    slots: atStage(session, "searching"),
  };
}

/** Where the member thinks they left it - kept so a recovery ticket carries it. */
function searchingReply(session, text) {
  const said = String(text).trim();
  return {
    intent: "lost",
    message:
      "Thanks - check there first; devices are often left in the rig or with the receiving hospital. If it doesn't turn up, I'll open a recovery ticket with that detail.",
    actions: [ACT.foundIt, ACT.escalate],
    slots: {
      description: session.slots.description ? `${session.slots.description}\n${said}` : said,
      ...atStage(session, "searching"),
    },
  };
}

/** GLPI's own status, stated when it changes what "missing" means. */
function statusNote(device) {
  const s = String(device?.status ?? "").toLowerCase();
  if (s.includes("lost") || s.includes("stolen")) return "GLPI already has it flagged Lost or stolen, so the service desk knows it's missing. ";
  if (s.includes("repair")) return "GLPI shows it as In repair, so it may be with the depot rather than lost. ";
  return "";
}

/** First turn of a conversation. */
export function greeting(session) {
  const d = session.device;
  return {
    intent: null,
    message: d
      ? `Hi ${session.user.displayName ?? session.user.name}. I can see your ${kindWord(d)} ${deviceLabel(d)} at ${d.locationName ?? "its assigned station"}. What's going on with it? I'll try to sort it out here, without a technician visit.`
      : `Hi ${session.user.displayName ?? session.user.name}. Pick one of your assigned devices on the left, then tell me what is happening.`,
    actions: [],
  };
}

export function plan({ session, text }) {
  const t = String(text ?? "").toLowerCase().trim();
  const stage = stageOf(session);
  const intent = classify(text);
  const d = session.device;

  // Follow-ups on the device already being worked on come first, so "still not
  // working" continues the troubleshooting instead of starting a new topic.
  // They apply only while troubleshooting is open and the member is still on
  // the same topic: once something is resolved or ticketed, or the member names
  // a different problem ("my FirstNet connection isn't working"), it is a new
  // issue even though it is phrased like a follow-up.
  const active = Boolean(stage) && stage !== "resolved" && stage !== "ticketed";
  const newTopic = ["lost", "connectivity", "inventory"].includes(intent) && intent !== session.intent;
  if (active && !newTopic && STILL_BROKEN.test(t)) return stillBroken(session);
  if ((active || session.intent) && !newTopic && RESOLVED.test(t)) return resolvedTurn(session);
  if (stage === "located") {
    if (NOT_THERE.test(t) || /^no\b/.test(t)) return notThere(session);
    if (AFFIRM.test(t)) return locationConfirmed(session);
  }
  // While searching, a free-text answer is where they last had it - unless
  // the member has moved on to a different topic.
  if (stage === "searching" && (intent === "general" || intent === "lost")) return searchingReply(session, text);

  if (intent === "smalltalk") {
    if (stage === "resolved") return { intent: session.intent, message: "You're welcome.", actions: [] };
    return {
      intent: session.intent ?? "general",
      message: session.intent ? "Happy to help. Where do things stand with it now?" : "Happy to help. What's going on with your equipment?",
      actions: [],
    };
  }

  if (!d && intent !== "inventory") {
    return {
      intent,
      message: "Select one of your assigned devices on the left first, so I act on the right asset.",
      actions: [],
    };
  }

  if (intent === "lost") {
    return {
      intent,
      message: "Let me check where it is.",
      tool: { name: "lookupDevice", args: deviceArgs(d) },
      actions: [ACT.foundIt, ACT.notThere, ACT.escalate],
    };
  }

  if (intent === "connectivity") {
    return {
      intent,
      message: `Checking the connection on ${deviceLabel(d)}.`,
      tool: { name: "connectivityDiagnostic", args: deviceArgs(d) },
      actions: [ACT.reset, ACT.escalate],
    };
  }

  if (intent === "inventory") {
    // An identifier in the message is validated straight away; otherwise ask.
    // An identifier must contain a digit, otherwise ordinary words such as
    // "asset" would be treated as a tag.
    const token = (String(text).match(/\b(?=[A-Za-z0-9-]*\d)[A-Za-z0-9][A-Za-z0-9-]{4,}\b/) ?? [])[0];
    if (token) {
      return {
        intent,
        message: `Checking ${token} against the asset catalog.`,
        tool: { name: "validateAssetTag", args: { submitted: token } },
        actions: [],
      };
    }
    return { intent, message: "What identifier is printed on the equipment? Type it exactly as it appears.", actions: [] };
  }

  // general: collect one description, then summarise and open a ticket.
  if (!session.slots.description) {
    return {
      intent,
      message:
        "Sorry you're dealing with that. What's happening, and when did it start? If it's about signal or a missing device, I can check that directly - or open a service ticket now if you'd rather.",
      slots: { description: String(text).trim() },
      actions: [ACT.escalate],
    };
  }
  return {
    intent,
    message:
      "Thanks, that helps. I can't fix this one remotely, so the next step is a technician. Tap Create service ticket when you're ready and I'll pass these details to the service desk.",
    slots: { description: `${session.slots.description}\n${String(text).trim()}` },
    actions: [ACT.escalate],
  };
}

export function planAction({ session, action, payload = {} }) {
  const d = session.device;

  switch (action) {
    case "diagnose":
      return {
        intent: "connectivity",
        message: `Running a connectivity diagnostic on ${deviceLabel(d)}.`,
        tool: { name: "connectivityDiagnostic", args: { ...deviceArgs(d), simulate: payload.simulate } },
        actions: [ACT.reset, ACT.escalate],
      };

    case "reset-device":
      return {
        intent: "connectivity",
        // The reset result itself states that it was simulated.
        message: `Resetting ${deviceLabel(d)}.`,
        tool: { name: "resetDevice", args: { ...deviceArgs(d), simulate: payload.simulate } },
        actions: [ACT.resolved, ACT.escalate],
      };

    case "confirm-tag":
      // Association only. The CMDB is not touched here.
      return {
        intent: "inventory",
        message: "",
        tool: { name: "adoptAsset", args: {} },
        slots: { confirmedSuggestion: payload.assetTag ?? session.slots.suggestedTag ?? null },
      };

    case "apply-tag":
      // The one path that genuinely writes an asset field, after explicit confirmation.
      return {
        intent: "inventory",
        message: "",
        tool: { name: "applyInventoryTag", args: {} },
        actions: [],
      };

    case "reject-tag":
      return {
        intent: "inventory",
        message:
          "Understood, I will not use that asset. Type the identifier again exactly as printed, or I can open an Asset Management ticket so the depot checks the label in person.",
        actions: [ACT.retryTag, ACT.escalate],
        slots: { confirmedSuggestion: null, candidate: null, suggestedTag: null },
      };

    case "retry-tag":
      return {
        intent: "inventory",
        message: "Go ahead - type the identifier exactly as it appears on the equipment.",
        actions: [],
        slots: { candidate: null, suggestedTag: null, submittedIdentifier: null },
      };

    case "resolved":
      return resolvedTurn(session);

    case "still-broken":
      return stillBroken(session);

    case "not-there":
      return notThere(session);

    case "escalate":
      return {
        intent: session.intent ?? "general",
        message: "Opening a ticket for the service desk.",
        tool: { name: "escalate", args: { ...deviceArgs(d) } },
        actions: [],
      };

    default:
      return { intent: session.intent, message: "I cannot run that action.", actions: [] };
  }
}

/**
 * Narrates a tool result. Kept next to the planner so the simulated voice lives
 * in one file; a Gemini driver would generate this text instead.
 */
export function narrate(toolName, result, session) {
  const d = session.device;

  if (toolName === "lookupDevice") {
    if (!result?.found) return { message: "I could not find that asset in the catalog.", details: [] };
    const loc = result.location;
    const t = result.telemetry;
    return {
      message: `Your ${kindWord(d)} ${deviceLabel(d)} is showing at ${loc?.name ?? "an unknown station"} - that's its GLPI location; the check-in details below are simulated. ${statusNote(result.device)}Does that match where you last used it? If not, I can help you narrow it down or open a recovery ticket.`,
      actions: [ACT.foundIt, ACT.notThere, ACT.escalate],
      slots: atStage(session, "located"),
      details: [
        { label: "Device", value: namedKind(result.device) },
        { label: "Station", value: loc?.name ?? "unknown" },
        { label: "Address", value: [loc?.address, loc?.town].filter(Boolean).join(", ") || "not recorded" },
        { label: "Coordinates (GLPI)", value: loc?.latitude && loc?.longitude ? `${loc.latitude}, ${loc.longitude}` : "not recorded" },
        { label: "Status (GLPI)", value: result.device.status ?? "unknown" },
        ...(t
          ? [
              { label: "Last check-in (simulated)", value: t.lastSeenLabel },
              { label: "Battery (simulated)", value: `${t.batteryPercent}%` },
              { label: "Accuracy (simulated)", value: `±${t.locationAccuracyMetres} m` },
              { label: "Enrollment (simulated)", value: t.enrollment },
            ]
          : []),
      ],
      /** Rendered as a map marker at the GLPI coordinates - never a different point. */
      map:
        loc?.latitude && loc?.longitude
          ? {
              latitude: String(loc.latitude),
              longitude: String(loc.longitude),
              label: namedKind(result.device),
              locationName: loc.name ?? null,
              address: [loc.address, loc.town].filter(Boolean).join(", ") || null,
              accuracyMetres: t?.locationAccuracyMetres ?? null,
            }
          : null,
    };
  }

  if (toolName === "connectivityDiagnostic") {
    const sim = result.sim;
    return {
      message:
        result.state === "healthy"
          ? `The line looks healthy. ${result.reason.detail} Simulated diagnostic - no carrier was contacted. If the device still shows no service, a reset usually clears it. Want me to run one?`
          : result.state === "unknown"
            ? `${result.reason.detail} Simulated diagnostic - no carrier was contacted. A device reset is the usual next step. Want me to run one?`
            : `${result.reason.detail} Simulated diagnostic - no carrier was contacted. A reset is the next step and often brings service back. Want me to run it?`,
      actions:
        result.state === "healthy" ? [ACT.reset, ACT.resolved, ACT.escalate] : [ACT.reset, ACT.escalate],
      slots: atStage(session, "diagnosed"),
      details: [
        { label: "Cellular state", value: result.state === "unknown" ? "not assessable (no carrier record)" : result.state },
        { label: "Device", value: namedKind(result.device) },
        { label: "Carrier", value: sim ? `${sim.carrier ?? "on file"} · ${sim.simType ?? ""}`.trim() : "no SIM record in GLPI" },
        {
          label: "Carrier data",
          value:
            result.carrierDataSource === "glpi"
              ? "from the GLPI SIM/line record"
              : "simulated demo telemetry (GLPI holds no SIM record)",
        },
        ...(sim?.msisdn ? [{ label: "Line", value: sim.msisdn }] : []),
      ],
    };
  }

  if (toolName === "resetDevice") {
    const recorded = result.ticketId ? ` Recorded as ${result.ticketId} (${result.ticketStatus}).` : "";
    return {
      message: result.success
        ? `${result.reason.detail} ${result.note}${recorded} Give it a minute to reconnect - are you seeing service now? If not, I can take the next step or open a ticket.`
        : `${result.reason.detail} ${result.note}${result.ticketId ? ` It's logged as ${result.ticketId} (${result.ticketStatus}), so the service desk can already see it.` : ""} Tell me what the device is doing now and we'll keep working on it.`,
      actions: result.success ? [ACT.resolved, ACT.stillBroken, ACT.escalate] : [ACT.resolved, ACT.stillBroken],
      slots: atStage(session, result.success ? "reset-ok" : "reset-failed"),
      details: [
        { label: "Reset type", value: result.resetType },
        { label: "Carrier record", value: result.carrierDataAvailable ? `${result.sim?.carrier ?? "on file"} · ${result.sim?.msisdn ?? "line on file"}` : "none in GLPI" },
        ...(result.ticketId ? [{ label: "Ticket", value: `${result.ticketId} · ${result.ticketStatus}` }] : []),
      ],
    };
  }

  if (toolName === "validateAssetTag") {
    if (result.verdict === "valid") {
      return {
        message: `${result.submitted} is a valid identifier. It matches ${namedKind(result.match)} at ${result.match.locationName ?? "an unknown station"}. I will use that asset for the rest of this request.`,
        details: assetFacts(result.match, [
          { label: "Submitted", value: result.submitted },
          { label: "Matched on", value: result.matchedOn },
        ]),
        slots: { submittedIdentifier: result.submitted, candidate: result.match, needsFieldCorrection: null },
        actions: [],
      };
    }
    if (result.verdict === "correction_suggested") {
      const p = result.proposed;
      return {
        message: `I could not find ${result.submitted} in the asset catalog, but ${p.identifier} looks like the same equipment (${p.confidence}% confidence). Is this yours? Confirming only corrects what you typed - it does not change the asset record.`,
        details: assetFacts(p.device, [
          { label: "Submitted", value: result.submitted },
          { label: "Suggested", value: `${p.identifier} (matched on ${p.matchedOn})` },
          { label: "Confidence", value: `${p.confidence}% - ${result.reason}` },
        ]),
        slots: {
          suggestedTag: p.identifier,
          submittedIdentifier: result.submitted,
          candidate: p.device,
          needsFieldCorrection: result.fieldCorrection ?? null,
        },
        actions: [ACT.confirmTag, ACT.rejectTag],
      };
    }
    return {
      message: `${result.reason} Nothing in the catalog matches "${result.submitted}". You can type it again, or I can open an Asset Management ticket with what you entered so the depot can check the physical label.`,
      details: [
        { label: "Submitted", value: result.submitted },
        { label: "Result", value: "No matching asset" },
      ],
      slots: { submittedIdentifier: result.submitted, candidate: null, suggestedTag: null },
      actions: [ACT.retryTag, ACT.escalate],
    };
  }

  if (toolName === "adoptAsset") {
    const extra = result.fieldCorrection
      ? ` The asset record has no inventory number on file. If ${result.fieldCorrection.value} is the number printed on it, I can write it to the record - that is an actual CMDB change, so it needs your confirmation.`
      : "";
    return {
      message: `Noted - I will use ${namedKind(result.device)} for the rest of this request. This corrected what you typed; the asset record in GLPI is unchanged.${extra}`,
      details: assetFacts(result.device, [
        { label: "You entered", value: result.submitted ?? "-" },
        { label: "Using asset", value: namedKind(result.device) },
        { label: "CMDB changed", value: "No - input correction only" },
      ]),
      actions: result.fieldCorrection ? [ACT.applyTag, ACT.escalate] : [],
    };
  }

  if (toolName === "applyInventoryTag") {
    return {
      message: result.applied
        ? `Done - ${result.reason} That is a real change to the asset record in GLPI.`
        : `No change made. ${result.reason}`,
      details: [
        { label: "CMDB changed", value: result.applied ? `Yes - ${result.fieldLabel} set` : "No" },
        ...(result.applied ? [{ label: "New value", value: result.value }] : []),
      ],
      actions: [],
    };
  }

  if (toolName === "escalate") {
    return {
      message: `Ticket ${result.ticketId} is open with the service desk${result.assetLinked ? ` and linked to ${namedKind(d)}` : ""}. You can follow it in My Cases.`,
      slots: atStage(session, "ticketed"),
      details: [
        { label: "Ticket", value: result.ticketId },
        { label: "Status", value: result.status },
        { label: "Linked asset", value: result.assetLinked ? namedKind(d) : "none" },
      ],
    };
  }

  return { message: "", details: [] };
}

/** Real asset facts shown with every inventory answer. */
function assetFacts(device, lead = []) {
  if (!device) return lead;
  return [
    ...lead,
    { label: "Type", value: [device.itemType, device.type].filter(Boolean).join(" / ") || "-" },
    { label: "Model", value: device.model ?? "-" },
    { label: "Assigned to", value: device.ownerName ?? (device.userId ? `user ${device.userId}` : "Unassigned") },
    { label: "Location", value: device.locationName ?? "-" },
    { label: "Inventory number", value: device.assetTag ?? "none on record" },
    { label: "Status", value: device.status ?? "-" },
  ];
}

function deviceArgs(d) {
  if (!d) return {};
  return { deviceId: d.id, itemType: d.itemType, assetTag: d.assetTag ?? null, name: d.name };
}

export { ACT as ACTIONS };
