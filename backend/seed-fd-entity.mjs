#!/usr/bin/env node
// ============================================================
// seed-fd-entity.mjs - seeds the generic "Fire Department" demo entity in GLPI
// from config/fd-glpi-catalog.json, using the REST client in src/glpi-seed.js.
//
//   node seed-fd-entity.mjs            dry run: read-only, reports what it would create
//   node seed-fd-entity.mjs --apply    creates the missing records
//
// Credentials come only from GLPI_BASE_URL / GLPI_APP_TOKEN / GLPI_USER_TOKEN.
//
// Safety:
//   - Create-only. Existing records are never updated or deleted; a record that
//     already exists in the target entity is reused, so reruns add nothing new.
//   - Every write is scoped to the "Fire Department" entity. Records owned by
//     any other entity (e.g. "Fire Department New York City") are never matched
//     or reused, except shared dropdowns (SHARED_TYPES), which GLPI keeps unique
//     across entities and which are only referenced by id, never modified.
//   - Aborts if the target entity resolves to the FDNY entity or sits below it.
// ============================================================

import { readFileSync } from "node:fs";
import * as G from "./src/glpi-seed.js";

const APPLY = process.argv.includes("--apply");
const CATALOG = JSON.parse(readFileSync(new URL("./config/fd-glpi-catalog.json", import.meta.url), "utf8"));
const FDNY_ENTITY_NAME = "Fire Department New York City";
const SELF_SERVICE_PROFILE = "Self-Service";
const MARK = (key) => `[SEED:${CATALOG.meta.seed_id}#${key}]`;

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const same = (row, match) => Object.entries(match).every(([f, v]) => norm(row[f]) === norm(v));
const stats = { exists: 0, created: 0, planned: 0 };
let ENT = null;

// Shared dropdowns are unique across ALL entities in GLPI (e.g. State names, LineOperator mcc/mnc),
// so they are listed while every entity is visible and reused wherever they live - referenced by id,
// never modified. Everything else is listed inside the target entity only.
const SHARED_TYPES = ["Manufacturer", "PhoneType", "PhoneModel", "State", "DeviceSimcardType", "LineOperator", "DeviceSimcard", "UserTitle"];
const sharedCache = new Map();

// One listing per itemtype per run; created rows are appended so later lookups see them.
const cache = new Map();
async function all(itemtype) {
  const c = SHARED_TYPES.includes(itemtype) ? sharedCache : cache;
  if (!c.has(itemtype)) c.set(itemtype, await G.listAll(itemtype));
  return c.get(itemtype);
}

// Records this entity owns must live in it; shared dropdowns match by name in any entity.
const owned = (row) => Number(row.entities_id) === ENT;
const sharedOk = () => true;

/** Returns the id of a matching record, or creates one (only with --apply). */
async function ensure(itemtype, label, match, input, { scope = owned } = {}) {
  const hit = (await all(itemtype)).find((row) => scope(row) && same(row, match));
  if (hit) {
    stats.exists++;
    console.log(`  [exists]  ${itemtype} ${label} (#${hit.id})`);
    return Number(hit.id);
  }
  if (!APPLY) {
    stats.planned++;
    console.log(`  [plan]    ${itemtype} ${label}`);
    return null;
  }
  const full = { ...input, entities_id: ENT };
  const id = await G.createItem(itemtype, full);
  (await all(itemtype)).push({ id, ...full });
  stats.created++;
  console.log(`  [created] ${itemtype} ${label} (#${id})`);
  return id;
}

/** Same, for link rows listed under a parent (GET /Parent/id/Sub). */
async function ensureSub(parentType, parentId, subtype, label, match, input) {
  const rows = parentId ? await G.getSubItems(parentType, parentId, subtype) : [];
  const hit = rows.find((row) => same(row, match));
  if (hit) {
    stats.exists++;
    console.log(`  [exists]  ${subtype} ${label} (#${hit.id})`);
    return Number(hit.id);
  }
  if (!APPLY) {
    stats.planned++;
    console.log(`  [plan]    ${subtype} ${label}`);
    return null;
  }
  const id = await G.createItem(subtype, input);
  stats.created++;
  console.log(`  [created] ${subtype} ${label} (#${id})`);
  return id;
}

const glpiDate = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 19).replace("T", " ");

function ticketContent(t) {
  return (
    `<p>${t.symptom}</p>` +
    `<ul>${t.detail.map((d) => `<li>${d}</li>`).join("")}</ul>` +
    `<p><strong>Carrier:</strong> ${t.carrier_note}</p>` +
    `<p><strong>Next step:</strong> ${t.next_step}</p>` +
    `<p>${MARK(t.key)}</p>`
  );
}

async function resolveEntity() {
  await G.changeActiveEntities("all", true);
  const entities = await G.listAll("Entity");
  const fdny = entities.find((e) => norm(e.name) === norm(FDNY_ENTITY_NAME));
  let target = entities.find((e) => norm(e.name) === norm(CATALOG.entity.name));

  if (target) {
    if (fdny && Number(target.id) === Number(fdny.id)) throw new Error("Target entity resolves to the FDNY entity - aborting.");
    if (norm(target.completename).includes(norm(FDNY_ENTITY_NAME))) {
      throw new Error(`Target entity "${target.completename}" sits below the FDNY entity - aborting.`);
    }
    console.log(`Entity "${target.completename ?? target.name}" exists (#${target.id}).`);
    return Number(target.id);
  }
  if (!APPLY) {
    stats.planned++;
    console.log(`  [plan]    Entity "${CATALOG.entity.name}" under Root - nothing else can be checked until it exists.`);
    return null;
  }
  const id = await G.createItem("Entity", { name: CATALOG.entity.name, entities_id: 0, comment: CATALOG.entity.comment });
  stats.created++;
  console.log(`  [created] Entity "${CATALOG.entity.name}" under Root (#${id})`);
  return id;
}

async function main() {
  console.log(`${APPLY ? "APPLY" : "DRY RUN (read-only)"} - seeding "${CATALOG.entity.name}" from config/fd-glpi-catalog.json`);
  console.log(`GLPI: ${G.credentialStatus().baseUrl}`);
  await G.initSession();

  ENT = await resolveEntity();
  if (ENT === null) return;
  // resolveEntity() left every entity active: list the shared dropdowns now, before narrowing.
  for (const itemtype of SHARED_TYPES) await all(itemtype);
  // Non-recursive: reads and writes below see only this entity plus shared Root records.
  await G.changeActiveEntities(ENT, false);

  const profiles = await G.getItems("Profile", { range: "0-199" });
  const selfService = profiles.find((p) => norm(p.name) === norm(SELF_SERVICE_PROFILE));
  if (!selfService) throw new Error(`GLPI profile "${SELF_SERVICE_PROFILE}" not found.`);

  const ids = { loc: {}, user: {}, mfr: {}, ptype: {}, pmodel: {}, state: {}, simtype: {}, op: {}, simmodel: {}, cat: {}, dev: {} };
  const shared = { scope: sharedOk };

  console.log("\nLocations");
  for (const l of CATALOG.locations) {
    const { key, ...input } = l;
    ids.loc[key] = await ensure("Location", `"${l.name}"`, { name: l.name }, input);
  }

  console.log("\nDropdowns");
  for (const m of CATALOG.manufacturers) ids.mfr[m.key] = await ensure("Manufacturer", `"${m.name}"`, { name: m.name }, { name: m.name }, shared);
  for (const t of CATALOG.phone_types) ids.ptype[t.key] = await ensure("PhoneType", `"${t.name}"`, { name: t.name }, { name: t.name }, shared);
  for (const m of CATALOG.phone_models) ids.pmodel[m.key] = await ensure("PhoneModel", `"${m.name}"`, { name: m.name }, { name: m.name }, shared);
  for (const s of CATALOG.states) ids.state[s.key] = await ensure("State", `"${s.name}"`, { name: s.name }, { name: s.name }, shared);
  for (const t of CATALOG.simcard_types) ids.simtype[t.key] = await ensure("DeviceSimcardType", `"${t.name}"`, { name: t.name }, { name: t.name }, shared);
  for (const o of CATALOG.line_operators) {
    const { key, ...input } = o;
    ids.op[key] = await ensure("LineOperator", `"${o.name}"`, { name: o.name }, input, shared);
  }
  for (const s of CATALOG.simcard_models) {
    ids.simmodel[s.key] = await ensure("DeviceSimcard", `"${s.designation}"`, { designation: s.designation }, {
      designation: s.designation,
      devicesimcardtypes_id: ids.simtype[s.simcard_type] ?? 0,
      manufacturers_id: ids.mfr[s.manufacturer] ?? 0,
      comment: s.comment,
    }, shared);
  }
  for (const c of CATALOG.itil_categories) {
    const parent = c.parent ? ids.cat[c.parent] ?? 0 : 0;
    ids.cat[c.key] = await ensure("ITILCategory", `"${c.name}"`, { name: c.name, itilcategories_id: parent }, { name: c.name, itilcategories_id: parent });
  }

  console.log("\nUsers");
  const titles = {};
  for (const u of CATALOG.users) {
    if (u.title && !(u.title in titles)) titles[u.title] = await ensure("UserTitle", `"${u.title}"`, { name: u.title }, { name: u.title }, shared);
    // Logins are global in GLPI: if this login already belongs to another entity, the create fails and the run stops.
    const uid = await ensure("User", `${u.login} (${u.firstname} ${u.realname}, ${u.employee_id})`, { name: u.login }, {
      name: u.login,
      firstname: u.firstname,
      realname: u.realname,
      registration_number: u.employee_id,
      usertitles_id: titles[u.title] ?? 0,
      locations_id: ids.loc[u.location] ?? 0,
      is_active: 1,
      // GLPI adds the Profile_User row together with the user, so it is never left without access to this entity.
      _profiles_id: selfService.id,
      _entities_id: ENT,
      _is_recursive: 1,
    }, { scope: () => true });
    ids.user[u.key] = uid;
    await ensureSub("User", uid, "UserEmail", `${u.email}`, { email: u.email }, { users_id: uid, email: u.email, is_default: 1 });
    await ensureSub("User", uid, "Profile_User", `${SELF_SERVICE_PROFILE} @ entity #${ENT} for ${u.login}`,
      { profiles_id: selfService.id, entities_id: ENT },
      { users_id: uid, profiles_id: selfService.id, entities_id: ENT, is_recursive: 1 });
  }

  console.log("\nDevices and SIM / carrier lines");
  for (const d of CATALOG.devices) {
    const model = CATALOG.phone_models.find((m) => m.key === d.model);
    const devId = await ensure("Phone", `${d.name} (${d.asset_tag})`, { name: d.name }, {
      name: d.name,
      otherserial: d.asset_tag,
      serial: d.serial,
      phonetypes_id: ids.ptype[d.phone_type] ?? 0,
      phonemodels_id: ids.pmodel[d.model] ?? 0,
      manufacturers_id: ids.mfr[model?.manufacturer] ?? 0,
      locations_id: ids.loc[d.location] ?? 0,
      users_id: ids.user[d.user] ?? 0,
      states_id: ids.state[d.state] ?? 0,
      comment: d.comment,
    });
    ids.dev[d.key] = devId;

    for (const s of CATALOG.sims.filter((x) => x.device === d.key)) {
      const lineId = await ensure("Line", `${s.msisdn} for ${d.name}`, { caller_num: s.msisdn }, {
        name: `${d.name} line`,
        caller_num: s.msisdn,
        lineoperators_id: ids.op[s.operator] ?? 0,
        users_id: ids.user[d.user] ?? 0,
        locations_id: ids.loc[d.location] ?? 0,
      });
      await ensureSub("Phone", devId, "Item_DeviceSimcard", `ICCID ${s.iccid} on ${d.name}`, { serial: s.iccid }, {
        itemtype: "Phone",
        items_id: devId,
        devicesimcards_id: ids.simmodel[s.simcard_model] ?? 0,
        serial: s.iccid,
        lines_id: lineId ?? 0,
        entities_id: ENT,
      });
    }
  }

  console.log("\nTickets");
  for (const t of CATALOG.tickets) {
    const devId = ids.dev[t.device];
    const existing = (await all("Ticket")).find((row) => owned(row) && String(row.content ?? "").includes(MARK(t.key)));
    let ticketId = existing ? Number(existing.id) : null;
    if (existing) {
      stats.exists++;
      console.log(`  [exists]  Ticket "${t.name}" (#${ticketId})`);
    } else if (!APPLY) {
      stats.planned++;
      console.log(`  [plan]    Ticket "${t.name}" (requester ${t.requester}, assignee ${t.assignee})`);
    } else {
      ticketId = await G.createItem("Ticket", {
        name: t.name,
        content: ticketContent(t),
        entities_id: ENT,
        type: t.type,
        urgency: t.urgency,
        impact: t.impact,
        itilcategories_id: ids.cat[t.category] ?? 0,
        date: glpiDate(t.days_ago),
        _users_id_requester: ids.user[t.requester],
        _users_id_assign: ids.user[t.assignee],
        _disablenotif: true,
      });
      // GLPI derives the status from the assignment on create; set the catalog's status on our own new ticket.
      await G.updateItem("Ticket", ticketId, { status: t.status });
      (await all("Ticket")).push({ id: ticketId, entities_id: ENT, content: ticketContent(t) });
      stats.created++;
      console.log(`  [created] Ticket "${t.name}" (#${ticketId})`);
    }
    await ensureSub("Ticket", ticketId, "Item_Ticket", `${t.device} on ticket ${t.key}`, { itemtype: "Phone", items_id: devId }, {
      itemtype: "Phone",
      items_id: devId,
      tickets_id: ticketId,
    });
  }
}

try {
  await main();
  console.log(`\nDone. exists=${stats.exists} ${APPLY ? `created=${stats.created}` : `would create=${stats.planned}`}`);
} catch (e) {
  console.error(`\nFAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await G.killSession();
}
