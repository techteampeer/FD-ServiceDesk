// ============================================================
// src/glpi-seed.js - GLPI 10.0.18 REST client (apirest.php)
//
// Credentials come ONLY from environment variables:
//   GLPI_BASE_URL   - e.g. https://glpi.example.org  (or .../apirest.php)
//   GLPI_APP_TOKEN  - API client App-Token
//   GLPI_USER_TOKEN - personal API token of the seeding account
//
// Nothing is hardcoded and no token is ever printed. This module talks to the
// REST API only; the GLPI MySQL schema is never touched.
// ============================================================

const RAW_BASE = (process.env.GLPI_BASE_URL || "").trim();
const APP_TOKEN = (process.env.GLPI_APP_TOKEN || "").trim();
const USER_TOKEN = (process.env.GLPI_USER_TOKEN || "").trim();

const TIMEOUT_MS = Number(process.env.GLPI_TIMEOUT_MS || 20000);
const THROTTLE_MS = Number(process.env.GLPI_THROTTLE_MS || 150);
const MAX_RETRY = Number(process.env.GLPI_MAX_RETRY || 4);
const PAGE_SIZE = 100;

// ---------- configuration ----------
export function apiBase() {
  if (!RAW_BASE) throw new Error("GLPI_BASE_URL is not set");
  const b = RAW_BASE.replace(/\/+$/, "");
  return /apirest\.php$/i.test(b) ? b : `${b}/apirest.php`;
}

export function missingCredentials() {
  const missing = [];
  if (!RAW_BASE) missing.push("GLPI_BASE_URL");
  if (!APP_TOKEN) missing.push("GLPI_APP_TOKEN");
  if (!USER_TOKEN) missing.push("GLPI_USER_TOKEN");
  return missing;
}

export function assertCredentials() {
  const missing = missingCredentials();
  if (missing.length) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}. ` +
        `Copy backend/.env.example to backend/.env and fill them in.`
    );
  }
}

// Presence/length only - never the value itself.
export function credentialStatus() {
  return {
    baseUrl: RAW_BASE ? apiBase() : "(missing)",
    appToken: APP_TOKEN ? `set, ${APP_TOKEN.length} chars` : "(missing)",
    userToken: USER_TOKEN ? `set, ${USER_TOKEN.length} chars` : "(missing)",
  };
}

// ---------- session ----------
let SESSION_TOKEN = null;
export const hasSession = () => Boolean(SESSION_TOKEN);

function baseHeaders() {
  const h = { "App-Token": APP_TOKEN, Accept: "application/json" };
  if (SESSION_TOKEN) h["Session-Token"] = SESSION_TOKEN;
  return h;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GLPI errors come back as ["ERROR_CODE", "human message"].
function describeError(status, bodyText) {
  let detail = String(bodyText || "").slice(0, 400);
  try {
    const j = JSON.parse(bodyText);
    if (Array.isArray(j)) detail = j.filter(Boolean).join(" - ");
    else if (j && typeof j === "object") detail = JSON.stringify(j).slice(0, 400);
  } catch {
    /* leave as raw text */
  }
  return `GLPI ${status}: ${detail}`;
}

export class GlpiError extends Error {
  constructor(status, bodyText, method, path) {
    super(`${describeError(status, bodyText)}  [${method} ${path}]`);
    this.name = "GlpiError";
    this.status = status;
    this.raw = bodyText;
  }
}

const RETRIABLE = new Set([429, 500, 502, 503, 504]);

async function request(method, path, { body, query } = {}) {
  const url = new URL(apiBase() + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const headers = baseHeaders();
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const r = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
      const text = await r.text();

      if (RETRIABLE.has(r.status) && attempt < MAX_RETRY) {
        lastErr = new GlpiError(r.status, text, method, path);
        await sleep(1000 * attempt * attempt);
        continue;
      }
      if (!r.ok && r.status !== 206) throw new GlpiError(r.status, text, method, path);

      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return { status: r.status, data, contentRange: r.headers.get("content-range") };
    } catch (e) {
      if (e instanceof GlpiError) throw e;
      lastErr = e;
      if (attempt < MAX_RETRY) {
        await sleep(1000 * attempt * attempt);
        continue;
      }
      throw new Error(`GLPI request failed [${method} ${path}]: ${String(e.message || e)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error(`GLPI request failed [${method} ${path}]`);
}

export async function initSession() {
  assertCredentials();
  if (SESSION_TOKEN) return SESSION_TOKEN;
  const url = new URL(apiBase() + "/initSession");
  const r = await fetch(url, {
    headers: {
      "App-Token": APP_TOKEN,
      Authorization: `user_token ${USER_TOKEN}`,
      Accept: "application/json",
    },
  });
  const text = await r.text();
  if (!r.ok) throw new GlpiError(r.status, text, "GET", "/initSession");
  const j = JSON.parse(text);
  if (!j.session_token) throw new Error("GLPI initSession returned no session_token");
  SESSION_TOKEN = j.session_token;
  return SESSION_TOKEN;
}

export async function killSession() {
  if (!SESSION_TOKEN) return;
  try {
    await request("GET", "/killSession");
  } catch {
    /* best effort on teardown */
  }
  SESSION_TOKEN = null;
}

export async function getFullSession() {
  const { data } = await request("GET", "/getFullSession");
  return data?.session || data;
}

// Scope every following write to one entity.
export async function changeActiveEntities(entities_id, is_recursive = true) {
  await request("POST", "/changeActiveEntities", { body: { entities_id, is_recursive } });
  return true;
}

// ---------- reads ----------
export async function getItems(itemtype, query = {}) {
  const { data } = await request("GET", `/${itemtype}`, {
    query: { expand_dropdowns: 0, get_hateoas: 0, ...query },
  });
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getItem(itemtype, id, query = {}) {
  const { data } = await request("GET", `/${itemtype}/${id}`, {
    query: { expand_dropdowns: 0, get_hateoas: 0, ...query },
  });
  return data;
}

// Sub-resource listing: GET /Ticket/12/Ticket_User, GET /Computer/9/Item_DeviceSimcard, ...
// This is how link rows are looked up - scoped and cheap, no full-table scans.
export async function getSubItems(itemtype, id, subtype, query = {}) {
  const { data } = await request("GET", `/${itemtype}/${id}/${subtype}`, {
    query: { expand_dropdowns: 0, get_hateoas: 0, ...query },
  });
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function listAll(itemtype, query = {}, cap = 2000) {
  const out = [];
  let start = 0;
  while (out.length < cap) {
    const page = await getItems(itemtype, { ...query, range: `${start}-${start + PAGE_SIZE - 1}` });
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }
  return out.slice(0, cap);
}

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

// Exact-match lookup used for idempotency. `match` is an object of field -> value;
// the first entry drives GLPI's searchText pre-filter, all entries are then
// compared exactly client-side so a "contains" hit never passes for an exact one.
export async function findOne(itemtype, match, { searchField, query = {}, cap = 2000 } = {}) {
  const fields = Object.keys(match);
  if (!fields.length) throw new Error(`findOne(${itemtype}) needs at least one match field`);
  const probe = searchField || fields[0];

  let candidates = [];
  try {
    candidates = await getItems(itemtype, {
      ...query,
      [`searchText[${probe}]`]: String(match[probe]),
      range: `0-${PAGE_SIZE - 1}`,
    });
  } catch (e) {
    if (e instanceof GlpiError && e.status === 400) candidates = [];
    else throw e;
  }

  let hit = candidates.find((row) => fields.every((f) => norm(row[f]) === norm(match[f])));
  if (hit) return hit;

  // searchText does not cover every field on every itemtype; fall back to a
  // bounded full listing before concluding the record does not exist.
  const all = await listAll(itemtype, query, cap);
  hit = all.find((row) => fields.every((f) => norm(row[f]) === norm(match[f])));
  return hit || null;
}

export async function itemtypeSupported(itemtype) {
  try {
    await getItems(itemtype, { range: "0-0" });
    return true;
  } catch (e) {
    if (e instanceof GlpiError && [400, 401, 404, 405].includes(e.status)) return false;
    throw e;
  }
}

// ---------- writes ----------
export async function createItem(itemtype, input) {
  const { data } = await request("POST", `/${itemtype}`, { body: { input } });
  const row = Array.isArray(data) ? data[0] : data;
  const id = row?.id;
  if (!id) throw new Error(`GLPI create ${itemtype} returned no id: ${JSON.stringify(data).slice(0, 200)}`);
  if (THROTTLE_MS) await sleep(THROTTLE_MS);
  return Number(id);
}

export async function updateItem(itemtype, id, input) {
  await request("PUT", `/${itemtype}/${id}`, { body: { input: { id, ...input } } });
  if (THROTTLE_MS) await sleep(THROTTLE_MS);
  return Number(id);
}

// purge=false sends the item to the GLPI trash, where it can still be restored.
// Link rows (Item_Ticket, Item_DeviceSimcard) have no trash, so they are purged.
export async function deleteItem(itemtype, id, { purge = false } = {}) {
  await request("DELETE", `/${itemtype}/${id}`, { query: purge ? { force_purge: 1 } : {} });
  if (THROTTLE_MS) await sleep(THROTTLE_MS);
  return Number(id);
}
