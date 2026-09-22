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
  resolved: { id: "resolved", label: "It is resolved" },
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

/** First turn of a conversation. */
export function greeting(session) {
  const d = session.device;
  return {
    intent: null,
    message: d
      ? `Hi ${session.user.displayName ?? session.user.name}. I have your ${kindWord(d)} ${deviceLabel(d)} at ${d.locationName ?? "its assigned station"}. Tell me what is happening and I will try to fix it without a technician visit.`
      : `Hi ${session.user.displayName ?? session.user.name}. Pick one of your assigned devices on the left, then tell me what is happening.`,
    actions: [],
  };
}

export function plan({ session, text }) {
  const intent = classify(text);
  const d = session.device;

  if (intent === "smalltalk") {
    return { intent: session.intent ?? "general", message: "Happy to help. What is going on with your equipment?", actions: [] };
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
      message: `Let me locate ${deviceLabel(d)}.`,
      tool: { name: "lookupDevice", args: deviceArgs(d) },
      actions: [ACT.escalate],
    };
  }

  if (intent === "connectivity") {
    return {
      intent,
      message: `Checking connectivity for ${deviceLabel(d)}.`,
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
      message: "Understood. Describe what is happening in one or two sentences and I will open a ticket for the service desk.",
      slots: { description: String(text).trim() },
      actions: [ACT.escalate],
    };
  }
  return {
    intent,
    message: "Thanks. I have enough to open a ticket for the service desk.",
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
        message: `Running a simulated reset on ${deviceLabel(d)}.`,
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
      return { intent: session.intent, message: "Good - I will leave it there. Anything else?", actions: [] };

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
      message: `${deviceLabel(d)} is assigned to ${loc?.name ?? "an unknown station"}. The position is its GLPI location; the check-in figures beside it are simulated, since there is no MDM feed in this demo. If it is not there, I can open a recovery ticket for the service desk.`,
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
          ? `The line looks healthy. ${result.reason.detail} Simulated diagnostic - no carrier was contacted.`
          : result.state === "unknown"
            ? `${result.reason.detail} Simulated diagnostic - no carrier was contacted. I can still run a device reset, or open a ticket.`
            : `${result.reason.detail} Simulated diagnostic - no carrier was contacted. I can run a reset, or open a ticket.`,
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
    return {
      message: `${result.reason.detail} ${result.note}${result.ticketId ? ` Recorded as ${result.ticketId} (${result.ticketStatus}).` : ""}`,
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
      message: `Ticket ${result.ticketId} is open with the service desk${result.assetLinked ? ` and linked to ${namedKind(d)}` : ""}.`,
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
