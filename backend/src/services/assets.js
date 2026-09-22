/**
 * Asset service - live GLPI Phone assets for the FDNY fleet.
 *
 * These are plain async functions on purpose: the routes are thin wrappers and
 * the Gemini agent will call the same functions as tools. Nothing here writes
 * to GLPI.
 */
import {
  ASSET_ITEMTYPE,
  ASSET_ITEMTYPES,
  dropdownName,
  enrichAsset,
  getEntityId,
  glpiGet,
  normalizeItemType,
  primeDropdowns,
} from "../glpi.js";

export const BTDS_TAG_RE = /^BTDS(\d{4})(\d{6})$/;

const rows = (r) => (Array.isArray(r) ? r : r ? [r] : []);
const inEntity = (r) => String(r.entities_id) === getEntityId();
const alive = (r) => !Number(r.is_deleted);

/**
 * The whole FDNY fleet across BOTH itemtypes: Computer (tablets) and Phone
 * (cellphones). Every row keeps its real itemType - nothing is converted.
 *
 * `taggedOnly` narrows to assets carrying a BTDSYYYY###### inventory number.
 * Most of the current fleet has no tag, so the default returns everything.
 * `itemType` narrows to a single itemtype.
 */
export async function listFleet({ limit = 200, taggedOnly = false, itemType } = {}) {
  await primeDropdowns();
  const only = normalizeItemType(itemType);
  const types = only ? [only] : ASSET_ITEMTYPES;

  const out = [];
  for (const kind of types) {
    let all = rows(await glpiGet(`/${kind}`, { range: `0-${Math.max(0, limit - 1)}` }).catch(() => []))
      .filter(inEntity)
      .filter(alive);
    if (taggedOnly) all = all.filter((a) => BTDS_TAG_RE.test(String(a.otherserial ?? "").trim()));
    // Sequential on purpose: fanning out per-asset requests makes GLPI throttle
    // and the enriched names come back empty. The caches make this cheap.
    for (const asset of all) out.push(await enrichAsset(asset, kind));
  }
  return out;
}

/**
 * Fetch one asset. Ids are per-table, so an itemType should be supplied; without
 * one both tables are tried in order and the first live hit wins.
 */
export async function getDeviceById(id, itemType) {
  const hint = normalizeItemType(itemType);
  const types = hint ? [hint, ...ASSET_ITEMTYPES.filter((t) => t !== hint)] : ASSET_ITEMTYPES;
  for (const kind of types) {
    const asset = await glpiGet(`/${kind}/${id}`).catch(() => null);
    if (asset && alive(asset) && inEntity(asset)) return enrichAsset(asset, kind);
  }
  return null;
}

/** Looks an asset up by BTDS inventory number (otherserial), across both itemtypes. */
export async function getDeviceByTag(tag) {
  const wanted = String(tag ?? "").trim();
  if (!wanted) return null;
  for (const kind of ASSET_ITEMTYPES) {
    const hit = rows(await glpiGet(`/${kind}`, { [`searchText[otherserial]`]: wanted, range: "0-99" }).catch(() => []))
      .filter(inEntity)
      .filter(alive)
      .find((a) => String(a.otherserial ?? "").trim() === wanted);
    if (hit) return enrichAsset(hit, kind);
  }
  return null;
}

/**
 * Looks an asset up by exact device name, across both itemtypes. This is the
 * only identifier the current FDNY-TAB-* / FDNY-CEL-* fleet carries.
 */
export async function getDeviceByName(name) {
  const wanted = String(name ?? "").trim();
  if (!wanted) return null;
  for (const kind of ASSET_ITEMTYPES) {
    const hit = rows(await glpiGet(`/${kind}`, { [`searchText[name]`]: wanted, range: "0-99" }).catch(() => []))
      .filter(inEntity)
      .filter(alive)
      .find((a) => String(a.name ?? "").trim().toLowerCase() === wanted.toLowerCase());
    if (hit) return enrichAsset(hit, kind);
  }
  return null;
}

/**
 * Resolves a device from whatever the caller has: GLPI id (+ optional itemType),
 * BTDS tag, then exact device name. Name is last because it is the weakest
 * identifier, but it is supported because most of the fleet has nothing else.
 */
export async function resolveDevice({ deviceId, assetTag, name, itemType } = {}) {
  const numeric = Number(deviceId);
  if (Number.isFinite(numeric) && numeric > 0) {
    const byId = await getDeviceById(numeric, itemType);
    if (byId) return byId;
  }
  if (assetTag) {
    const byTag = await getDeviceByTag(assetTag);
    if (byTag) return byTag;
  }
  if (name) {
    const byName = await getDeviceByName(name);
    if (byName) return byName;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* SIM / carrier relationship (seeded: Item_DeviceSimcard -> Line -> LineOperator) */
/* ------------------------------------------------------------------ */
/**
 * Reads the real SIM/eSIM and carrier records seeded against a Phone asset.
 * Returns null when the asset has no SIM record.
 */
export async function getDeviceSim(deviceId, itemType = ASSET_ITEMTYPE) {
  const kind = normalizeItemType(itemType) ?? ASSET_ITEMTYPE;
  const links = rows(await glpiGet(`/${kind}/${deviceId}/Item_DeviceSimcard`).catch(() => [])).filter(alive);
  const link = links[0];
  if (!link) return null;

  const [simModel, line] = await Promise.all([
    link.devicesimcards_id ? glpiGet(`/DeviceSimcard/${link.devicesimcards_id}`) : null,
    link.lines_id ? glpiGet(`/Line/${link.lines_id}`) : null,
  ]);
  const [simType, operator] = await Promise.all([
    simModel?.devicesimcardtypes_id
      ? dropdownName("DeviceSimcardType", simModel.devicesimcardtypes_id)
      : null,
    line?.lineoperators_id ? glpiGet(`/LineOperator/${line.lineoperators_id}`) : null,
  ]);

  const typeName = simType ?? null;
  return {
    /** This SIM/line really exists in GLPI, as opposed to demo telemetry. */
    source: "glpi",
    iccid: link.serial ?? null,
    simModel: simModel?.designation ?? null,
    simType: typeName,
    isEsim: /esim/i.test(String(typeName ?? "")),
    line: line?.name ?? null,
    msisdn: line?.caller_num ?? null,
    carrier: operator?.name ?? null,
    mcc: operator?.mcc ?? null,
    mnc: operator?.mnc ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Inventory validation                                                */
/* ------------------------------------------------------------------ */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Validates a submitted inventory tag against live GLPI Phone assets.
 *
 * Exact match wins. Otherwise near matches are proposed, ranked by how likely
 * the submission is a typo of a real tag. Nothing is written: the caller (agent
 * or user) confirms a correction separately.
 *
 * Verdicts: "valid" | "correction_suggested" | "invalid_format" | "unknown"
 */
/** Every identifier an asset can be recognised by, strongest first. */
function identifiersOf(device) {
  const out = [];
  if (device.assetTag) out.push({ value: String(device.assetTag).toUpperCase(), kind: "assetTag" });
  if (device.serial) out.push({ value: String(device.serial).toUpperCase(), kind: "serial" });
  if (device.name) out.push({ value: String(device.name).toUpperCase(), kind: "name" });
  return out;
}

const canon = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

export async function validateAssetTag(submittedRaw) {
  const raw = canon(submittedRaw);
  // BTDS tags are compared with separators stripped; names such as FDNY-TAB-1001
  // keep their hyphens, so both forms are tried.
  const submitted = raw.replace(/-/g, "");
  const fleet = await listFleet();

  if (!raw) {
    return { submitted: "", verdict: "invalid_format", reason: "No identifier supplied.", match: null, suggestions: [] };
  }

  for (const d of fleet) {
    for (const ident of identifiersOf(d)) {
      if (ident.value === raw || ident.value.replace(/-/g, "") === submitted) {
        return {
          submitted: raw,
          verdict: "valid",
          matchedOn: ident.kind,
          reason: `Identifier matches a registered FDNY asset on ${ident.kind}.`,
          match: summarize(d),
          suggestions: [],
        };
      }
    }
  }

  const formatOk = BTDS_TAG_RE.test(submitted);
  const parts = BTDS_TAG_RE.exec(submitted);

  const scored = fleet
    .flatMap((d) => identifiersOf(d).map((ident) => ({ d, ident })))
    .map(({ d, ident }) => {
      const tag = ident.value;
      const bare = tag.replace(/-/g, "");
      const cand = BTDS_TAG_RE.exec(bare);
      const distance = Math.min(levenshtein(raw, tag), levenshtein(submitted, bare));

      // Same 6-digit unique identifier but a different label year is the most
      // common real error (a superseded sticker left on the device).
      const sameUnique = Boolean(parts && cand && parts[2] === cand[2]);
      const sameYear = Boolean(parts && cand && parts[1] === cand[1]);

      let confidence = 0;
      if (sameUnique && !sameYear) confidence = 96;
      else if (distance === 1) confidence = 90;
      else if (distance === 2) confidence = 72;
      else if (distance === 3) confidence = 45;
      // A name match is a weaker identifier than an inventory tag.
      if (ident.kind === "name") confidence = Math.max(0, confidence - 8);

      return { device: d, tag, kind: ident.kind, distance, sameUnique, confidence };
    })
    .filter((c) => c.confidence >= 45)
    .sort((a, b) => b.confidence - a.confidence || a.distance - b.distance)
    .filter((c, i, arr) => arr.findIndex((x) => x.device.id === c.device.id && x.device.itemType === c.device.itemType) === i)
    .slice(0, 3);

  if (scored.length) {
    return {
      submitted: raw,
      verdict: "correction_suggested",
      reason: scored[0].sameUnique
        ? "Unique identifier matches a registered asset but the label year differs."
        : `Close match to a registered asset on ${scored[0].kind} (edit distance ${scored[0].distance}).`,
      /** Proposed corrected asset - awaiting agent/user confirmation. Never auto-applied. */
      match: null,
      proposed: {
        identifier: scored[0].tag,
        matchedOn: scored[0].kind,
        confidence: scored[0].confidence,
        device: summarize(scored[0].device),
      },
      suggestions: scored.map((c) => ({
        identifier: c.tag,
        matchedOn: c.kind,
        confidence: c.confidence,
        distance: c.distance,
        device: summarize(c.device),
      })),
      applied: false,
    };
  }

  return {
    submitted: raw,
    verdict: "unknown",
    reason: formatOk
      ? "Identifier is a well-formed BTDS tag but no FDNY asset carries it."
      : "No FDNY asset matches that identifier by inventory tag, serial or device name.",
    knownFormats: ["BTDSYYYY######", "device name, e.g. FDNY-TAB-1001"],
    match: null,
    suggestions: [],
    applied: false,
  };
}

/** Compact device projection used inside action and validation responses. */
export function summarize(device) {
  if (!device) return null;
  return {
    id: device.id,
    name: device.name,
    assetTag: device.assetTag,
    itemType: device.itemType ?? ASSET_ITEMTYPE,
    type: device.type,
    model: device.model,
    status: device.status,
    userId: device.userId,
    locationId: device.locationId,
    locationName: device.locationName,
    latitude: device.latitude,
    longitude: device.longitude,
  };
}

/* ------------------------------------------------------------------ */
/* Inventory confirmation                                              */
/* ------------------------------------------------------------------ */
const ownerCache = new Map();

/** Resolves the display name of an asset's assigned user. Read-only, cached. */
export async function getAssetOwner(userId) {
  if (!userId || Number(userId) <= 0) return null;
  const key = String(userId);
  if (ownerCache.has(key)) return ownerCache.get(key);
  try {
    const u = await glpiGet(`/User/${userId}`);
    const brief = u
      ? {
          id: u.id,
          login: u.name,
          name: [u.firstname, u.realname].filter(Boolean).join(" ").trim() || u.name,
          employeeId: u.registration_number || null,
        }
      : null;
    if (brief) ownerCache.set(key, brief);
    return brief;
  } catch {
    return null;
  }
}

/**
 * Decides whether a confirmed match implies a genuine CMDB gap.
 *
 * The only case that does: the user supplied a well-formed BTDS inventory
 * number and the matched asset carries none. Everything else - a mistyped name,
 * a tag that already matches - is a correction of the USER'S INPUT, not of the
 * asset record, and must not touch GLPI.
 */
export function fieldCorrectionFor(submitted, device) {
  const value = String(submitted ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  if (!device || !BTDS_TAG_RE.test(value)) return null;
  if (String(device.assetTag ?? "").trim()) return null; // already has one
  return { field: "otherserial", label: "Inventory number", value };
}

/**
 * The ONE GLPI asset write in this flow: fills an empty inventory number after
 * the user explicitly confirms it. Refuses to overwrite an existing tag, and
 * never touches the asset name.
 */
export async function applyInventoryTag({ deviceId, itemType, tag }) {
  const { updateItem } = await import("../glpi.js");
  const device = await getDeviceById(deviceId, itemType);
  if (!device) return { applied: false, reason: "Asset not found." };

  const correction = fieldCorrectionFor(tag, device);
  if (!correction) {
    return {
      applied: false,
      reason: String(device.assetTag ?? "").trim()
        ? "The asset already carries an inventory number; nothing was changed."
        : "That value is not a valid BTDSYYYY###### inventory number; nothing was changed.",
    };
  }

  await updateItem(device.itemType, device.id, { [correction.field]: correction.value });
  return {
    applied: true,
    field: correction.field,
    fieldLabel: correction.label,
    value: correction.value,
    device: summarize({ ...device, assetTag: correction.value }),
    reason: `Inventory number ${correction.value} written to ${device.name} (${device.itemType}).`,
  };
}
