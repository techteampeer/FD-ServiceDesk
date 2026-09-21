/**
 * Maps live GLPI tickets onto the shapes Chitransh's existing components
 * already render, so the staff screens show real data without being redesigned.
 */
import type { GlpiTicket } from "./api";
import type { CaseStatus, Priority, ServiceCase } from "./mock-data";

/** GLPI urgency 1-5 -> the portal's four priority labels. */
export function priorityOf(urgency: number): Priority {
  if (urgency >= 5) return "Critical";
  if (urgency === 4) return "High";
  if (urgency === 3) return "Medium";
  return "Low";
}

/** GLPI ITIL status -> the portal's case statuses. */
export function statusOf(status: number): CaseStatus {
  switch (status) {
    case 1:
      return "Open";
    case 2:
    case 3:
      return "Investigating";
    case 4:
      return "Waiting for User";
    case 5:
    case 6:
      return "Resolved";
    default:
      return "Open";
  }
}

/** Tickets our simulated automation opened carry these title prefixes. */
const AUTOMATED_PREFIXES = ["Device reset completed", "Device reset failed"];

/**
 * Where a ticket came from, when that is already knowable from its content.
 * Nothing is inferred beyond markers the backend itself wrote.
 */
export function originOf(t: GlpiTicket): { label: string; simulated: boolean } | null {
  const name = String(t.name ?? "");
  if (AUTOMATED_PREFIXES.some((p) => name.startsWith(p))) {
    return { label: "Simulated automated reset", simulated: true };
  }
  const content = String((t as { content?: string }).content ?? "");
  if (content.includes("FDNY service assistant")) {
    return { label: "Raised by the service assistant (simulated)", simulated: true };
  }
  if (content.includes("did not resolve the issue; escalated")) {
    return { label: "Escalated after a simulated action", simulated: true };
  }
  return null;
}

/**
 * GLPI returns ticket content with its markup entity-encoded (&#60;p&#62;), so
 * entities are decoded before tags are stripped - otherwise the raw entities
 * end up on screen.
 */
const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const stripHtml = (html: string) =>
  decodeEntities(html)
    .replace(/<\/(p|ul|li|div)>/g, "\n")
    .replace(/<li>/g, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Projects a GLPI ticket into the ServiceCase shape the CaseDrawer and the
 * staff tables consume. Fields GLPI does not provide stay empty rather than
 * being invented - the drawer already handles empty lists.
 */
export function ticketToServiceCase(t: GlpiTicket): ServiceCase {
  const origin = originOf(t);
  const asset = t.asset;
  const content = String((t as { content?: string }).content ?? "");

  return {
    id: t.reference ?? `GLPI-${t.id}`,
    issue: t.name,
    requester: t.requester?.name ?? "Unknown requester",
    requesterTitle: t.requester?.login ? `Login ${t.requester.login}` : "FDNY member",
    requesterContact: (t.requester as { employeeId?: string | null })?.employeeId
      ? `Employee ID ${(t.requester as { employeeId?: string | null }).employeeId}`
      : "—",
    asset: asset?.name ?? (asset?.assetTag ?? "No linked equipment"),
    // The real GLPI model, with the GLPI type name; the itemtype alone is not
    // a model and reads as "Computer" to the service desk.
    assetModel:
      [asset?.model, asset?.type ?? asset?.itemType, asset?.assetTag]
        .filter(Boolean)
        .join(" · ") || "—",
    // The ticket carries only a location id; the linked asset already resolves
    // its station name, so that is used rather than leaving the field empty.
    location: t.locationName ?? asset?.locationName ?? "—",
    category: t.category ?? "Uncategorised",
    priority: priorityOf(Number(t.urgency)),
    status: statusOf(Number(t.status)),
    assignedTo: t.assignedTo?.name ?? "Unassigned",
    created: t.date ?? "—",
    description: content ? stripHtml(content) : t.name,
    aiSummary: origin
      ? `${origin.label}. Simulated for the demo - no carrier, MDM or AI provider was contacted.`
      : "No automated action ran on this ticket.",
    notes: [],
    timeline: [
      ...(t.date ? [{ at: t.date, label: "Ticket created in GLPI" }] : []),
      { at: "", label: `Current status: ${t.statusLabel}` },
    ].filter((x) => x.label),
    attachments: [],
  };
}
