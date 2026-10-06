import fetch from "node-fetch";

/**
 * Runtime GLPI client for the kiosk API routes.
 *
 * Config is read LAZILY on every call. Reading process.env at module scope broke
 * authentication: server.js imports the route modules (and therefore this file)
 * before it calls dotenv.config(), so the tokens were captured as undefined.
 * Nothing here is ever hardcoded - credentials come from backend/.env only.
 *
 * FDNY assets are modelled in GLPI as Phone (both ePCR tablets and cellphones);
 * Computer is legacy and is normalized away. See config/fdny-glpi-catalog.json.
 */
function cfg() {
  const raw = (process.env.GLPI_BASE_URL || "https://glpi.peer-consulting.com/apirest.php").trim().replace(/\/+$/, "");
  return {
    apiUrl: /apirest\.php$/i.test(raw) ? raw : `${raw}/apirest.php`,
    appToken: (process.env.GLPI_APP_TOKEN || "").trim(),
    userToken: (process.env.GLPI_USER_TOKEN || "").trim(),
    entityId: process.env.GLPI_ENTITY_ID || "1",
  };
}

/**
 * FDNY equipment lives in two GLPI itemtypes: tablets are Computer and
 * cellphones are Phone. Both are first-class - nothing is converted.
 */
export const ASSET_ITEMTYPES = ["Computer", "Phone"];
/** Kept for callers that only need a default when creating Phone-only records. */
export const ASSET_ITEMTYPE = "Phone";

/** Entity all FDNY data lives in (GLPI_ENTITY_ID, default 1). */
export const getEntityId = () => String(cfg().entityId);

/** Dropdown field names differ per itemtype. */
export const ASSET_FIELDS = {
  Computer: { type: "computertypes_id", model: "computermodels_id" },
  Phone: { type: "phonetypes_id", model: "phonemodels_id" },
};
const TYPE_DROPDOWN = { Computer: "ComputerType", Phone: "PhoneType" };
const MODEL_DROPDOWN = { Computer: "ComputerModel", Phone: "PhoneModel" };

/**
 * Canonicalizes an itemType to "Computer" or "Phone". Returns null when the
 * caller did not supply a usable one - callers then resolve it by lookup rather
 * than assuming. Nothing is force-converted to Phone any more.
 */
export function normalizeItemType(itemType) {
  const v = String(itemType || "").trim().toLowerCase();
  if (v === "computer") return "Computer";
  if (v === "phone") return "Phone";
  return null;
}

/* ---------------- session ---------------- */
// One session is reused across calls; a single request can touch GLPI many times
// and opening a session per call is both slow and hard on the server.
const SESSION_TTL_MS = 10 * 60 * 1000;
let session = { token: null, expiresAt: 0 };
/** In-flight initSession, shared by concurrent callers. */
let sessionInFlight = null;

async function openSession() {
  const { apiUrl, appToken, userToken } = cfg();
  const res = await fetch(`${apiUrl}/initSession`, {
    headers: { "App-Token": appToken, Authorization: `user_token ${userToken}` },
  });
  if (!res.ok) throw new Error(`Failed to authenticate with GLPI API (HTTP ${res.status})`);
  const data = await res.json();
  if (!data.session_token) throw new Error("GLPI initSession returned no session_token");
  session = { token: data.session_token, expiresAt: Date.now() + SESSION_TTL_MS };
  return session.token;
}

/**
 * Returns a session token, opening one only when needed.
 *
 * Concurrent callers share a single in-flight initSession. Without this, a
 * burst of parallel reads on a cold process each opened their own GLPI session
 * - dozens of extra round trips, and the throttling that produced HTML error
 * pages. The in-flight promise is cleared on failure, so failures are not cached.
 */
async function getSessionToken(force = false) {
  const { appToken, userToken } = cfg();
  if (!appToken || !userToken) {
    throw new Error("GLPI credentials are not configured: set GLPI_APP_TOKEN and GLPI_USER_TOKEN in backend/.env");
  }
  if (!force && session.token && Date.now() < session.expiresAt) return session.token;
  if (force) {
    session = { token: null, expiresAt: 0 };
    sessionInFlight = null;
  }
  if (!sessionInFlight) {
    sessionInFlight = openSession().finally(() => {
      sessionInFlight = null;
    });
  }
  return sessionInFlight;
}

/**
 * Builds standard headers including the Active-Entity header for tenant isolation.
 */
export async function getHeaders(force = false) {
  const { appToken, entityId } = cfg();
  return {
    "App-Token": appToken,
    "Session-Token": await getSessionToken(force),
    "Content-Type": "application/json",
    "Active-Entity": entityId,
  };
}

// GET helper. Retries once on 401 in case a cached session expired server-side.
export async function glpiGet(path, params = {}) {
  const { apiUrl } = cfg();
  const url = new URL(apiUrl + path);
  url.searchParams.set("expand_dropdowns", "0");
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));

  // One retry covers an expired session (401) and the HTML error page GLPI
  // returns when it throttles a burst of requests - res.json() would otherwise
  // throw a bare SyntaxError on "<!DOCTYPE...".
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: await getHeaders(attempt > 0) });
    if (res.status === 404) return null;
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) throw new Error(`GLPI GET ${path} failed (HTTP ${res.status})`);

    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      throw new Error(`GLPI GET ${path} returned a non-JSON response (likely throttled)`);
    }
  }
  return null;
}

const eq = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const rows = (r) => (Array.isArray(r) ? r : r ? [r] : []);

/* ---------------- dropdown + location caches ---------------- */
// Failures are NOT cached: a transient error must not permanently blank a name.
const dropdownCache = new Map();
const primed = new Set();

export async function dropdownName(itemtype, id) {
  if (!id || Number(id) <= 0) return null;
  const key = `${itemtype}:${id}`;
  if (dropdownCache.has(key)) return dropdownCache.get(key);
  try {
    const row = await glpiGet(`/${itemtype}/${id}`);
    const name = row?.name ?? null;
    if (name !== null) dropdownCache.set(key, name);
    return name;
  } catch {
    return null;
  }
}

/**
 * Loads whole dropdown tables in one request each and fills the cache.
 *
 * Enriching a fleet of N assets otherwise fans out to ~5N concurrent GLPI
 * requests, which the server throttles - names then come back null. Priming
 * turns that into one request per table.
 */
export async function primeDropdowns(
  itemtypes = ["PhoneType", "PhoneModel", "ComputerType", "ComputerModel", "Manufacturer", "State"],
) {
  await Promise.all(
    itemtypes.map(async (itemtype) => {
      if (primed.has(itemtype)) return;
      try {
        const list = await glpiGet(`/${itemtype}`, { range: "0-999" });
        for (const row of Array.isArray(list) ? list : []) {
          if (row?.id && row?.name) dropdownCache.set(`${itemtype}:${row.id}`, row.name);
        }
        primed.add(itemtype);
      } catch {
        /* leave unprimed; per-id lookups still work */
      }
    }),
  );
}

/**
 * Warms the caches for data that does not change during a demo (dropdown tables
 * and locations). GLPI serialises requests inside one session, so the only way
 * to be fast is to make fewer calls per request - this moves ~8 round trips off
 * the first user request. Failures leave the caches unprimed; lookups still work.
 */
export function warmCaches() {
  return Promise.all([
    primeDropdowns(["PhoneType", "PhoneModel", "ComputerType", "ComputerModel", "Manufacturer", "State", "ITILCategory"]),
    primeLocations(),
  ]);
}

const locationCache = new Map();
let locationsPrimed = false;

/**
 * Loads every Location in one request and fills the cache, so enriching a fleet
 * or a ticket list needs no per-location round trips. Failures are not cached:
 * the flag only flips on success, and per-id lookups still work.
 */
export async function primeLocations() {
  if (locationsPrimed) return;
  try {
    const list = await glpiGet("/Location", { range: "0-999" });
    for (const row of Array.isArray(list) ? list : []) {
      if (row?.id) locationCache.set(String(row.id), row);
    }
    locationsPrimed = true;
  } catch {
    /* leave unprimed; getLocationCached falls back to a direct fetch */
  }
}

export async function getLocationCached(id) {
  if (!id || Number(id) <= 0) return null;
  const key = String(id);
  if (locationCache.has(key)) return locationCache.get(key);
  try {
    const loc = await glpiGet(`/Location/${id}`);
    if (loc) locationCache.set(key, loc);
    return loc ?? null;
  } catch {
    return null;
  }
}

/* ---------------- users ---------------- */
/**
 * Identifies a user from live GLPI by login, employee/badge number
 * (User.registration_number) or e-mail address, in that order. No static CSV or
 * search-option ids are involved: lookups use real column names so they stay
 * valid across GLPI configurations.
 */
export async function identifyUser(identifier) {
  const id = String(identifier ?? "").trim();
  if (!id) return null;

  for (const field of ["name", "registration_number"]) {
    const found = rows(await glpiGet("/User", { [`searchText[${field}]`]: id, range: "0-99" }))
      .find((u) => eq(u[field], id));
    if (found) {
      const user = (await glpiGet(`/User/${found.id}`)) || found;
      return decorateUser(user, await defaultEmail(user.id));
    }
  }

  const mail = rows(await glpiGet("/UserEmail", { "searchText[email]": id, range: "0-99" }))
    .find((e) => eq(e.email, id));
  if (mail?.users_id) {
    const user = await glpiGet(`/User/${mail.users_id}`);
    if (user) return decorateUser(user, mail.email);
  }
  return null;
}

// GLPI keeps addresses in UserEmail, so User.email is usually empty.
async function defaultEmail(userId) {
  const list = rows(await glpiGet(`/User/${userId}/UserEmail`));
  return (list.find((e) => Number(e.is_default)) || list[0])?.email || null;
}

// Additive only: every original GLPI field is preserved for existing callers.
function decorateUser(user, knownEmail) {
  if (!user) return user;
  const displayName = [user.firstname, user.realname].filter(Boolean).join(" ").trim() || user.name;
  return {
    ...user,
    displayName,
    employeeId: user.registration_number || null,
    email: knownEmail || user.email || null,
  };
}

/* ---------------- assets ---------------- */
/**
 * Every asset assigned to a user, across BOTH itemtypes: Computer (tablets) and
 * Phone (cellphones). Search option 70 is the assigned user on both itemtypes;
 * the equals searchtype keeps it exact.
 */
export async function getUserDevices(userId) {
  await primeDropdowns();
  const devices = [];

  for (const itemtype of ASSET_ITEMTYPES) {
    let ids = [];
    try {
      const search = await glpiGet(`/search/${itemtype}`, {
        "criteria[0][field]": 70,
        "criteria[0][searchtype]": "equals",
        "criteria[0][value]": userId,
        "forcedisplay[0]": 2,
        range: "0-199",
      });
      ids = (search?.data || []).map((r) => r["2"]).filter(Boolean);
    } catch (e) {
      console.error(`getUserDevices: ${itemtype} search failed:`, e.message);
      continue;
    }
    for (const id of ids) {
      const detail = await glpiGet(`/${itemtype}/${id}`).catch(() => null);
      if (detail && !Number(detail.is_deleted)) devices.push(await enrichAsset(detail, itemtype));
    }
  }
  return devices;
}

export async function enrichAsset(asset, itemtype = ASSET_ITEMTYPE) {
  const kind = normalizeItemType(itemtype) ?? ASSET_ITEMTYPE;
  const fields = ASSET_FIELDS[kind];
  const [type, model, manufacturer, status] = await Promise.all([
    dropdownName(TYPE_DROPDOWN[kind], asset[fields.type]),
    dropdownName(MODEL_DROPDOWN[kind], asset[fields.model]),
    dropdownName("Manufacturer", asset.manufacturers_id),
    dropdownName("State", asset.states_id),
  ]);
  const location = asset.locations_id ? await getLocationCached(asset.locations_id) : null;

  return {
    ...asset, // keep every raw GLPI field existing callers may already read
    id: asset.id,
    name: asset.name,
    itemType: kind, // real GLPI itemtype: "Computer" or "Phone"
    assetTag: asset.otherserial || null, // BTDS inventory number when present
    type, // "ePCR Tablet" | "Cellphone"
    deviceType: type,
    serial: asset.serial || null,
    manufacturer,
    model,
    status,
    userId: asset.users_id ?? null,
    locationId: asset.locations_id ?? null,
    locationName: location?.name ?? null,
    unit: location?.name ?? "No location assigned", // field the current kiosk UI reads
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
  };
}

/**
 * Resolves the canonical GLPI asset reference for ticket linking.
 *
 * Resolution order:
 *   1. GLPI id + itemType. Ids are per-table, so Computer#50 and Phone#50 are
 *      different assets - the itemType is verified against GLPI, and a wrong
 *      hint (e.g. a caller that still hardcodes "Phone") falls back to the
 *      other itemtype instead of mislinking.
 *   2. BTDS inventory tag, searched across both itemtypes.
 *   3. Exact device name, across both itemtypes. This is last and is only
 *      reached for assets that carry no tag and no serial - which is the case
 *      for the current FDNY-TAB-* / FDNY-CEL-* fleet.
 */
export async function resolveAssetRef({ deviceId, assetTag, deviceTag, name, itemType } = {}) {
  const hint = normalizeItemType(itemType);
  const order = hint ? [hint, ...ASSET_ITEMTYPES.filter((t) => t !== hint)] : ASSET_ITEMTYPES;

  const numeric = Number(deviceId);
  if (Number.isFinite(numeric) && numeric > 0) {
    for (const itemtype of order) {
      const row = await glpiGet(`/${itemtype}/${numeric}`).catch(() => null);
      if (row && !Number(row.is_deleted)) {
        return {
          itemtype,
          items_id: numeric,
          resolvedBy: "glpiId",
          itemTypeCorrected: Boolean(hint && hint !== itemtype),
        };
      }
    }
  }

  for (const candidate of [assetTag, deviceTag]) {
    const tag = String(candidate ?? "").trim();
    if (!tag || !/^BTDS\d{10}$/.test(tag)) continue;
    for (const itemtype of order) {
      const hit = rows(await glpiGet(`/${itemtype}`, { "searchText[otherserial]": tag, range: "0-99" }).catch(() => []))
        .find((a) => eq(a.otherserial, tag) && !Number(a.is_deleted));
      if (hit) return { itemtype, items_id: Number(hit.id), resolvedBy: "assetTag" };
    }
  }

  // Name is the only identifier Claudio's current fleet carries.
  for (const candidate of [name, deviceTag]) {
    const wanted = String(candidate ?? "").trim();
    if (!wanted) continue;
    for (const itemtype of order) {
      const hit = rows(await glpiGet(`/${itemtype}`, { "searchText[name]": wanted, range: "0-99" }).catch(() => []))
        .find((a) => eq(a.name, wanted) && !Number(a.is_deleted));
      if (hit) return { itemtype, items_id: Number(hit.id), resolvedBy: "name" };
    }
  }
  return null;
}

/**
 * Gets details for a location ID.
 */
export async function getLocation(locationId) {
  const location = await glpiGet(`/Location/${locationId}`);
  if (!location) throw new Error("Location not found");
  return location;
}

/* ---------------- tickets ---------------- */
/**
 * Searches for an ITIL Category by name or creates it dynamically under FDNY entity.
 */
export async function getOrCreateCategory(categoryName) {
  const name = String(categoryName ?? "").trim();
  if (!name) return null;

  const hit = rows(await glpiGet("/ITILCategory", { "searchText[name]": name, range: "0-99" }))
    .find((c) => eq(c.name, name));
  if (hit) return hit.id;

  const { apiUrl, entityId } = cfg();
  const res = await fetch(`${apiUrl}/ITILCategory`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify({ input: { name, entities_id: entityId } }),
  });
  if (!res.ok) throw new Error(`Failed to create ITIL category (HTTP ${res.status})`);
  const created = await res.json();
  return Array.isArray(created) ? created[0]?.id : created?.id;
}

/**
 * Creates a new Ticket in GLPI scoped to the target entity.
 */
export async function createTicket(payload) {
  const { apiUrl, entityId } = cfg();
  const res = await fetch(`${apiUrl}/Ticket`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify({ input: { ...payload, entities_id: entityId } }),
  });
  if (!res.ok) throw new Error(`Failed to create ticket in GLPI (HTTP ${res.status})`);
  const created = await res.json();
  return Array.isArray(created) ? created[0] : created;
}

/** Updates an existing item (used to close a ticket after its asset is linked). */
export async function updateItem(itemtype, id, input) {
  const { apiUrl } = cfg();
  const res = await fetch(`${apiUrl}/${itemtype}/${id}`, {
    method: "PUT",
    headers: await getHeaders(),
    body: JSON.stringify({ input: { id, ...input } }),
  });
  if (!res.ok) throw new Error(`Failed to update ${itemtype} ${id} (HTTP ${res.status})`);
  return res.json();
}

/**
 * Links an asset to a Ticket via Item_Ticket, preserving the real itemtype:
 * Computers link as Computer, Phones as Phone. An unrecognized itemtype is
 * rejected rather than silently rewritten.
 */
export async function linkAssetToTicket(ticketId, itemType, itemId) {
  const itemtype = normalizeItemType(itemType);
  if (!itemtype) {
    throw new Error(`linkAssetToTicket: unsupported itemtype "${itemType}" (expected Computer or Phone)`);
  }
  const { apiUrl } = cfg();
  const res = await fetch(`${apiUrl}/Item_Ticket`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify({
      input: { tickets_id: ticketId, itemtype, items_id: Number(itemId) },
    }),
  });
  if (!res.ok) throw new Error(`Failed to link asset to ticket (HTTP ${res.status})`);
  return res.json();
}
