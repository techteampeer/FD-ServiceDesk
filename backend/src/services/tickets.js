/**
 * Ticket service - live GLPI tickets plus the escalation path shared by every
 * automated action. Routes and the Gemini agent both call these functions.
 */
import {
  ASSET_ITEMTYPES,
  createTicket,
  dropdownName,
  enrichAsset,
  getEntityId,
  getOrCreateCategory,
  glpiGet,
  linkAssetToTicket,
  primeDropdowns,
  primeLocations,
  resolveAssetRef,
} from "../glpi.js";
import { getDeviceById, summarize } from "./assets.js";

const rows = (r) => (Array.isArray(r) ? r : r ? [r] : []);
const inEntity = (r) => String(r.entities_id) === getEntityId();
const alive = (r) => !Number(r.is_deleted);

/** GLPI ITIL status and actor codes. */
export const TICKET_STATUS = {
  1: "New",
  2: "Processing (assigned)",
  3: "Processing (planned)",
  4: "Pending",
  5: "Solved",
  6: "Closed",
};
const ACTOR = { 1: "requester", 2: "assigned", 3: "observer" };
const URGENCY = { 1: "Very low", 2: "Low", 3: "Medium", 4: "High", 5: "Very high" };

const userCache = new Map();
async function userBrief(id) {
  if (!id) return null;
  const key = String(id);
  if (userCache.has(key)) return userCache.get(key);
  const u = await glpiGet(`/User/${id}`);
  const brief = u
    ? {
        id: u.id,
        login: u.name,
        name: [u.firstname, u.realname].filter(Boolean).join(" ").trim() || u.name,
        employeeId: u.registration_number || null,
      }
    : null;
  userCache.set(key, brief);
  return brief;
}

/**
 * Bulk context for a ticket list.
 *
 * Expanding N tickets one by one costs ~6 GLPI calls each (actors, items,
 * category, requester, assignee, asset + its dropdowns) - an N+1 fan-out that
 * GLPI throttles, sometimes returning an HTML error page. This loads each
 * dimension once and hands expandTicket lookup maps instead.
 *
 * A map is left null when its bulk read fails, and expandTicket then falls back
 * to the per-item call for that dimension - failures are never cached.
 */
/**
 * Short-lived cache for the tables that barely change during a demo (the user
 * directory and the asset catalog). GLPI serialises calls within a session, so
 * every avoided round trip is ~0.4s off the request.
 *
 * Deliberately NOT applied to /Ticket, /Ticket_User or /Item_Ticket: a ticket
 * the agent just created, and its links, must show up immediately.
 * Only successful reads are stored, so failures are never cached.
 */
const STABLE_TTL_MS = 30 * 1000;
const stableCache = new Map();

async function stable(key, loader) {
  const hit = stableCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.value;
  const value = await loader().catch(() => null);
  if (value !== null) stableCache.set(key, { value, expiresAt: Date.now() + STABLE_TTL_MS });
  return value;
}

/** Primes the stable tables off the request path (called at boot). */
export async function warmTicketCaches() {
  await Promise.all([
    stable("users", () => glpiGet("/User", { range: "0-999" })),
    ...ASSET_ITEMTYPES.map((t) => stable(`assets:${t}`, () => glpiGet(`/${t}`, { range: "0-999" }))),
  ]);
}

async function buildTicketContext() {
  const byParent = (list, key) => {
    const m = new Map();
    for (const row of Array.isArray(list) ? list : []) {
      const k = String(row?.[key] ?? "");
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(row);
    }
    return m;
  };

  // Dropdown and location caches make enrichAsset a pure cache read.
  const [, , users, actors, items, ...assetLists] = await Promise.all([
    primeDropdowns(["PhoneType", "PhoneModel", "ComputerType", "ComputerModel", "Manufacturer", "State", "ITILCategory"]),
    primeLocations(),
    stable("users", () => glpiGet("/User", { range: "0-999" })),
    glpiGet("/Ticket_User", { range: "0-1999" }).catch(() => null),
    glpiGet("/Item_Ticket", { range: "0-1999" }).catch(() => null),
    ...ASSET_ITEMTYPES.map((t) => stable(`assets:${t}`, () => glpiGet(`/${t}`, { range: "0-999" }))),
  ]);

  const userMap = users
    ? new Map(
        (Array.isArray(users) ? users : []).map((u) => [
          String(u.id),
          {
            id: u.id,
            login: u.name,
            name: [u.firstname, u.realname].filter(Boolean).join(" ").trim() || u.name,
            employeeId: u.registration_number || null,
          },
        ]),
      )
    : null;

  // Assets are entity-scoped here, exactly as getDeviceById does.
  const assetMap = assetLists.every((l) => l === null) ? null : new Map();
  if (assetMap) {
    ASSET_ITEMTYPES.forEach((itemtype, i) => {
      for (const row of Array.isArray(assetLists[i]) ? assetLists[i] : []) {
        if (row?.id && inEntity(row) && alive(row)) assetMap.set(`${itemtype}:${row.id}`, { row, itemtype });
      }
    });
  }

  return {
    users: userMap,
    actors: actors ? byParent(actors, "tickets_id") : null,
    items: items ? byParent(items, "tickets_id") : null,
    assets: assetMap,
  };
}

/** Expands a raw GLPI ticket row with its actors, category and linked asset. */
export async function expandTicket(ticket, ctx = null) {
  if (!ticket) return null;

  const [actorRows, itemRows, category] = await Promise.all([
    ctx?.actors
      ? (ctx.actors.get(String(ticket.id)) ?? [])
      : glpiGet(`/Ticket/${ticket.id}/Ticket_User`).then(rows).catch(() => []),
    ctx?.items
      ? (ctx.items.get(String(ticket.id)) ?? [])
      : glpiGet(`/Ticket/${ticket.id}/Item_Ticket`).then(rows).catch(() => []),
    ticket.itilcategories_id ? dropdownName("ITILCategory", ticket.itilcategories_id) : null,
  ]);

  const actors = { requester: null, assigned: null, observers: [] };
  for (const a of actorRows) {
    const brief = ctx?.users ? (ctx.users.get(String(a.users_id)) ?? null) : await userBrief(a.users_id);
    if (!brief) continue;
    const role = ACTOR[Number(a.type)];
    if (role === "requester" && !actors.requester) actors.requester = brief;
    else if (role === "assigned" && !actors.assigned) actors.assigned = brief;
    else if (role === "observer") actors.observers.push(brief);
  }

  // FDNY assets are Computer (tablets) or Phone (cellphones); both are expanded.
  const assetLink = itemRows.find((l) => ASSET_ITEMTYPES.includes(l.itemtype)) ?? itemRows[0] ?? null;
  let asset = null;
  if (assetLink && ASSET_ITEMTYPES.includes(assetLink.itemtype)) {
    const cached = ctx?.assets?.get(`${assetLink.itemtype}:${assetLink.items_id}`);
    if (cached) {
      // enrichAsset only reads the primed dropdown/location caches, so this
      // resolves without another round trip.
      asset = summarize(await enrichAsset(cached.row, cached.itemtype));
    } else if (ctx?.assets) {
      // The bulk map is authoritative for live, in-entity assets, so a miss
      // means the link points at a retired record. getDeviceById returned null
      // for those too, so keep that exact result and skip the round trip.
      asset = null;
    } else {
      asset = summarize(await getDeviceById(assetLink.items_id, assetLink.itemtype));
    }
  } else if (assetLink) {
    asset = { itemType: assetLink.itemtype, id: Number(assetLink.items_id), unknownItemtype: true };
  }

  return {
    id: ticket.id,
    glpiId: ticket.id,
    reference: `${ticket.id}`,
    name: ticket.name,
    content: ticket.content ?? null,
    status: Number(ticket.status),
    statusLabel: TICKET_STATUS[Number(ticket.status)] ?? String(ticket.status),
    type: Number(ticket.type),
    urgency: Number(ticket.urgency),
    urgencyLabel: URGENCY[Number(ticket.urgency)] ?? String(ticket.urgency),
    category: category ?? null,
    categoryId: ticket.itilcategories_id ?? null,
    locationId: ticket.locations_id ?? null,
    date: ticket.date ?? null,
    dateMod: ticket.date_mod ?? null,
    requester: actors.requester,
    assignedTo: actors.assigned,
    observers: actors.observers,
    asset,
  };
}

/**
 * Lists FDNY tickets, newest id first.
 * `userId` filters by requester via Ticket_User, which avoids depending on
 * GLPI search-option numbers.
 */
export async function listTickets({ userId, status, limit = 25 } = {}) {
  let candidates;

  if (userId) {
    const links = rows(await glpiGet("/Ticket_User", { [`searchText[users_id]`]: String(userId), range: "0-499" }))
      .filter((l) => String(l.users_id) === String(userId) && Number(l.type) === 1);
    const ids = [...new Set(links.map((l) => Number(l.tickets_id)))];
    const fetched = await Promise.all(ids.map((id) => glpiGet(`/Ticket/${id}`).catch(() => null)));
    candidates = fetched.filter(Boolean);
  } else {
    // Bounded range: a wide range makes GLPI return (and serialise) a large
    // payload. GLPI's natural order is id ASC, so an unsorted range returns the
    // OLDEST rows - the newest tickets then fall outside the window and never
    // reach the staff queue. Sorting by id DESC makes the window the newest rows.
    const span = Math.max(49, Math.min(limit * 4, 199));
    candidates = rows(
      await glpiGet("/Ticket", { range: `0-${span}`, sort: "id", order: "DESC" }),
    );
  }

  const filtered = candidates
    .filter(Boolean)
    .filter(inEntity)
    .filter(alive)
    .filter((t) => status === undefined || Number(t.status) === Number(status))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, limit);

  if (!filtered.length) return [];

  // One bulk context for the whole page, then expand sequentially: fanning out
  // per-ticket requests is what made GLPI throttle.
  const ctx = await buildTicketContext();
  const out = [];
  for (const t of filtered) out.push(await expandTicket(t, ctx));
  return out;
}

export async function getTicket(id) {
  const ticket = await glpiGet(`/Ticket/${id}`);
  if (!ticket || !inEntity(ticket) || !alive(ticket)) return null;
  return expandTicket(ticket);
}

/**
 * Escalation: turns a failed automated action into a real GLPI ticket linked to
 * the correct Phone asset and requester. Reuses the same createTicket /
 * linkAssetToTicket path the /api/ticket/report route uses, so there is one
 * place where tickets are created.
 */
export async function escalateToTicket({
  userId,
  device = null,
  deviceId = null,
  assetTag = null,
  deviceName = null,
  itemType = null,
  title,
  text,
  category = null,
  urgency = 3,
  locationId = null,
  failedAction = null,
}) {
  if (!userId) throw new Error("escalateToTicket requires userId");
  if (!text) throw new Error("escalateToTicket requires text");

  const categoryId = category ? await getOrCreateCategory(category) : null;
  const body = failedAction
    ? `${text}\n\nAutomated action "${failedAction}" did not resolve the issue; escalated to the service desk.`
    : text;

  const payload = {
    name: title || "FDNY field technology issue",
    content: body,
    status: 1,
    urgency,
    _users_id_requester: userId,
    users_id_recipient: userId,
  };
  if (categoryId) payload.itilcategories_id = categoryId;
  const loc = locationId ?? device?.locationId ?? null;
  if (loc) payload.locations_id = loc;

  const created = await createTicket(payload);
  if (!created?.id) throw new Error("GLPI did not return a ticket id");

  // Canonical asset identity: GLPI id, then BTDS tag. Never the display name.
  const ref = await resolveAssetRef({
    deviceId: deviceId ?? device?.id ?? null,
    assetTag: assetTag ?? device?.assetTag ?? null,
    name: deviceName ?? device?.name ?? null,
    itemType: itemType ?? device?.itemType ?? null,
  });

  let assetLinked = false;
  if (ref) {
    try {
      await linkAssetToTicket(created.id, ref.itemtype, ref.items_id);
      assetLinked = true;
    } catch (e) {
      console.error(`escalateToTicket: failed to link asset to ticket ${created.id}:`, e);
    }
  }

  return {
    ticketId: `GLPI-2026-0${created.id}`,
    rawTicketId: created.id,
    status: "NEW",
    assetLinked,
    assetItemType: ref?.itemtype ?? null,
    assetResolvedBy: ref?.resolvedBy ?? null,
  };
}
