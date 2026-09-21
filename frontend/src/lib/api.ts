/**
 * Thin client for the FDNY backend (backend/src/routes/*).
 *
 * Base URL: relative "/api" by default, so the portal works behind the same
 * origin or a proxy with no configuration. Set VITE_API_BASE_URL to point at a
 * backend on another origin (e.g. http://localhost:8787 during development).
 *
 * Only endpoints that exist today are wrapped here. Features without a backend
 * (Workspace ONE sound ping, full eSIM automation, dashboard analytics, AI)
 * remain mocked in the UI and are deliberately absent from this file.
 */
const RAW_BASE = String(import.meta.env?.["VITE_API_BASE_URL"] ?? "").trim();
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Identifies the caller so the backend can resolve their ROLE server-side and
 * scope the response. Demo-grade: it is a user id, not a signed token, but the
 * privilege decision is never taken from the client.
 */
function callerHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem("fdny-session");
    const id = raw ? JSON.parse(raw)?.user?.id : null;
    return id ? { "X-FDNY-User-Id": String(id) } : {};
  } catch {
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...callerHeaders(), ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Cannot reach the service desk backend.", 0);
  }

  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : `Request failed (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

/* ---------------- types ---------------- */
/** GLPI User, as returned by POST /api/identify. Extra GLPI columns are preserved. */
export interface GlpiUser {
  id: number;
  name: string;
  displayName?: string;
  employeeId?: string | null;
  email?: string | null;
  firstname?: string | null;
  realname?: string | null;
  /** Resolved server-side: "user" (FDNY member) or "staff" (service desk). */
  role?: "user" | "staff";
  isStaff?: boolean;
  /** Which rule decided the role: glpi-profile | demo-config. */
  source?: string;
  /** Human label for the role, e.g. "Service Desk" or "FDNY Member". */
  label?: string;
  [key: string]: unknown;
}

/** FDNY stores tablets as GLPI Computer and cellphones as GLPI Phone. */
export type GlpiItemType = "Computer" | "Phone";

/**
 * GLPI asset from GET /api/devices/:userId. Both itemtypes are returned and the
 * real itemType is preserved - never assume Phone.
 */
export interface GlpiDevice {
  id: number;
  name: string;
  /** BTDSYYYY###### inventory number when the asset has one; most do not. */
  assetTag: string | null;
  itemType: GlpiItemType;
  /** "ePCR Tablet" | "Cellphone" */
  type: string | null;
  serial: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string | null;
  userId: number | null;
  locationId: number | null;
  locationName: string | null;
  unit: string;
  latitude: string | null;
  longitude: string | null;
  [key: string]: unknown;
}

export interface GlpiLocation {
  id: number;
  name: string;
  latitude?: string | null;
  longitude?: string | null;
  [key: string]: unknown;
}

export interface ReportTicketResult {
  success: boolean;
  ticketId: string;
  rawTicketId: number;
  status: string;
  assetLinked: boolean;
  assetItemType: GlpiItemType | null;
  assetResolvedBy: string | null;
  summary: string;
}

/** Result of the SIMULATED device reset (POST /api/ticket/reset-sim). */
export interface ResetResult {
  simulated: true;
  simulatedBy: string;
  action: "device-reset";
  resetType: string;
  success: boolean;
  outcome: string;
  device: Partial<GlpiDevice> | null;
  sim: {
    carrier: string | null;
    simType: string | null;
    isEsim: boolean;
    iccid: string | null;
    msisdn: string | null;
    line: string | null;
  } | null;
  carrierDataAvailable: boolean;
  reason: { code: string; detail: string };
  note: string;
  ticketId: string;
  rawTicketId: number;
  ticketStatus: string;
  assetLinked: boolean;
  assetItemType: GlpiItemType | null;
  summary: string;
}

/** Ticket as returned by /api/tickets. */
export interface GlpiTicket {
  id: number;
  reference: string;
  name: string;
  status: number;
  statusLabel: string;
  urgency: number;
  urgencyLabel: string;
  category: string | null;
  date: string | null;
  requester: { id: number; login: string; name: string } | null;
  assignedTo: { id: number; login: string; name: string } | null;
  /** The linked GLPI asset, as `summarize()` returns it on the backend. */
  asset: {
    id?: number;
    name?: string;
    assetTag?: string | null;
    itemType?: string;
    /** GLPI's own type name: "Tablet" | "Smartphone" | "ePCR Tablet" | ... */
    type?: string | null;
    model?: string | null;
    status?: string | null;
    locationName?: string | null;
  } | null;
  locationName?: string | null;
}

/* ---------------- endpoints ---------------- */
/** Identifies a member by login, employee/badge number or e-mail. */
export function identifyUser(identifier: string): Promise<{ user: GlpiUser }> {
  return request<{ user: GlpiUser }>("/api/identify", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export async function getUserDevices(userId: number | string): Promise<GlpiDevice[]> {
  const { devices } = await request<{ devices: GlpiDevice[] }>(
    `/api/devices/${encodeURIComponent(String(userId))}`,
  );
  return Array.isArray(devices) ? devices : [];
}

export function getLocation(locationId: number | string): Promise<GlpiLocation> {
  return request<GlpiLocation>(`/api/location/${encodeURIComponent(String(locationId))}`);
}

/**
 * Opens a service-desk ticket. Asset identity is the GLPI id plus the BTDS tag;
 * the backend resolves in that order and ignores display names entirely.
 */
export function reportTicket(input: {
  title?: string;
  text: string;
  category?: string;
  urgency?: number;
  userId: number;
  locationId?: number | null;
  device?: GlpiDevice | null;
}): Promise<ReportTicketResult> {
  const { device, ...rest } = input;
  return request<ReportTicketResult>("/api/ticket/report", {
    method: "POST",
    body: JSON.stringify({
      ...rest,
      locationId: input.locationId ?? device?.locationId ?? null,
      deviceId: device?.id ?? null,
      assetTag: device?.assetTag ?? null,
      deviceName: device?.name ?? null,
      // The asset's REAL itemtype, so a tablet links as Computer.
      itemType: device?.itemType ?? null,
    }),
  });
}

/**
 * Runs the SIMULATED device reset and records it in GLPI. Works for Computer
 * tablets and Phone cellphones, with or without a SIM record on file.
 */
export function resetDevice(input: {
  userId: number;
  device: GlpiDevice;
  simulate?: "failure";
}): Promise<ResetResult> {
  return request<ResetResult>("/api/ticket/reset-sim", {
    method: "POST",
    body: JSON.stringify({
      userId: input.userId,
      deviceId: input.device.id,
      assetTag: input.device.assetTag,
      deviceName: input.device.name,
      itemType: input.device.itemType,
      ...(input.simulate ? { simulate: input.simulate } : {}),
    }),
  });
}

/** Aggregate counts for the staff dashboard (GET /api/dashboard). */
export interface DashboardSummary {
  tickets: {
    total: number;
    open: number;
    closed: number;
    byStatus: Record<string, number>;
    byCategory: { name: string; count: number }[];
    byPriority: { name: string; count: number }[];
    /** GLPI station names, from the ticket or its linked asset. */
    byLocation: { name: string; count: number }[];
    withAsset: number;
  };
  devices: {
    total: number;
    byType: { itemType: string; count: number }[];
    /** GLPI's own type names: Tablet, Smartphone, ePCR Tablet, Cellphone. */
    byGlpiType: { name: string; count: number }[];
    withLocation: number;
    withGps: number;
    tagged: number;
  };
  automation: {
    simulated: boolean;
    totalRuns: number;
    autoResolved: number;
    escalated: number;
    deflectionRate: number;
  };
  generatedAt: string;
}

export function getDashboard(): Promise<DashboardSummary> {
  return request<DashboardSummary>("/api/dashboard");
}

/** All FDNY assets, both itemtypes. */
export async function getFleet(): Promise<GlpiDevice[]> {
  const { devices } = await request<{ devices: GlpiDevice[] }>("/api/devices");
  return Array.isArray(devices) ? devices : [];
}

/** Every ticket in the FDNY entity, newest first. */
export async function getTickets(limit = 100): Promise<GlpiTicket[]> {
  const { tickets } = await request<{ tickets: GlpiTicket[] }>(`/api/tickets?limit=${limit}`);
  return Array.isArray(tickets) ? tickets : [];
}

export async function getTicket(id: number | string): Promise<GlpiTicket> {
  const { ticket } = await request<{ ticket: GlpiTicket }>(`/api/tickets/${id}`);
  return ticket;
}

/* ---------------- agent (simulated; no Vertex/Gemini) ---------------- */
export interface AgentAction {
  id: string;
  label: string;
}

export interface AgentTurn {
  sessionId: string;
  message: string;
  intent: string | null;
  context: {
    user: { id: number; name: string; employeeId: string | null };
    device: Partial<GlpiDevice> | null;
    location: {
      id: number;
      name: string;
      address: string | null;
      town: string | null;
      latitude: string | null;
      longitude: string | null;
    } | null;
  };
  details: { label: string; value: string }[];
  /** Marker at the asset's real GLPI coordinates, when it has any. */
  map: {
    latitude: string;
    longitude: string;
    label: string;
    locationName: string | null;
    address: string | null;
    accuracyMetres: number | null;
  } | null;
  actions: AgentAction[];
  tool: string | null;
  ticket: {
    ticketId: string;
    rawTicketId: number;
    status: string;
    assetLinked: boolean;
    assetItemType: GlpiItemType | null;
  } | null;
  simulated: boolean;
  agent: { driver: string; vertex: boolean; model: string | null };
}

/** Opens an agent session seeded with the identified user and selected device. */
export function startAgentSession(input: {
  userId: number;
  /** Full GLPI user so the agent can greet by name without another lookup. */
  user?: GlpiUser | null;
  deviceId?: number | null;
  itemType?: GlpiItemType | null;
}): Promise<AgentTurn> {
  return request<AgentTurn>("/api/agent/session", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendAgentMessage(input: {
  sessionId: string;
  text: string;
  deviceId?: number | null;
  itemType?: GlpiItemType | null;
}): Promise<AgentTurn> {
  return request<AgentTurn>("/api/agent/message", { method: "POST", body: JSON.stringify(input) });
}

export function runAgentAction(input: {
  sessionId: string;
  action: string;
  payload?: Record<string, unknown>;
  /** The device currently selected in the UI, so actions follow a switch. */
  deviceId?: number | null;
  itemType?: GlpiItemType | null;
}): Promise<AgentTurn> {
  return request<AgentTurn>("/api/agent/action", { method: "POST", body: JSON.stringify(input) });
}

/** Tickets where the given GLPI user is the requester. */
export async function getMyTickets(userId: number | string, limit = 50): Promise<GlpiTicket[]> {
  // no-store: a ticket created seconds ago must never be missed from this list.
  const { tickets } = await request<{ tickets: GlpiTicket[] }>(
    `/api/tickets?userId=${encodeURIComponent(String(userId))}&limit=${limit}`,
    { cache: "no-store" },
  );
  return Array.isArray(tickets) ? tickets : [];
}
