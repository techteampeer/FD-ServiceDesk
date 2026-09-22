/**
 * Role resolution for the demo portal.
 *
 * Two distinct experiences: an FDNY member sees only their own equipment and
 * tickets; service-desk staff see the fleet and the whole queue.
 *
 * Order of truth:
 *   1. Real GLPI profiles (Profile_User -> Profile). If the user holds any
 *      privileged profile, they are staff.
 *   2. config/demo-roles.json allow-list, because every demo user currently
 *      holds only Self-Service and the live data therefore carries no signal.
 *
 * Privilege is never inferred from a person's name. When GLPI profiles are set
 * up properly, clear the allow-lists in the config and step 1 takes over.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { glpiGet } from "../glpi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "config", "demo-roles.json"), "utf-8"),
);

const rows = (r) => (Array.isArray(r) ? r : r ? [r] : []);
const lc = (v) => String(v ?? "").trim().toLowerCase();

let profileNames = null;
async function profileNameById() {
  if (profileNames) return profileNames;
  const list = rows(await glpiGet("/Profile", { range: "0-99" }).catch(() => []));
  profileNames = Object.fromEntries(list.map((p) => [String(p.id), p.name]));
  return profileNames;
}

/** Profile names actually held by a user in GLPI. */
async function profilesOf(userId) {
  const [names, links] = await Promise.all([
    profileNameById(),
    glpiGet(`/User/${userId}/Profile_User`).then(rows).catch(() => []),
  ]);
  return [...new Set(links.map((l) => names[String(l.profiles_id)]).filter(Boolean))];
}

/**
 * Resolves a user's role. Returns { role, isStaff, source, label, profiles }.
 * `source` says which rule decided, so the demo mapping is always visible.
 */
export async function resolveRole(user) {
  if (!user?.id) return { role: "user", isStaff: false, source: "none", label: CONFIG.roleLabels.user, profiles: [] };

  const profiles = await profilesOf(user.id);
  const staffProfile = profiles.find((p) => CONFIG.staffProfiles.some((s) => lc(s) === lc(p)));
  if (staffProfile) {
    return {
      role: "staff",
      isStaff: true,
      source: "glpi-profile",
      label: staffProfile,
      profiles,
    };
  }

  const byLogin = CONFIG.staffLogins.some((l) => lc(l) === lc(user.name));
  const byBadge = CONFIG.staffBadges.some((b) => lc(b) === lc(user.registration_number ?? user.employeeId));
  if (byLogin || byBadge) {
    return {
      role: "staff",
      isStaff: true,
      source: "demo-config",
      label: CONFIG.roleLabels.staff,
      profiles,
    };
  }

  return { role: "user", isStaff: false, source: "glpi-profile", label: CONFIG.roleLabels.user, profiles };
}

/** Resolves the role of the caller identified by the X-FDNY-User-Id header. */
export async function resolveCaller(req) {
  const id = Number(req.get("X-FDNY-User-Id") ?? req.query.asUser ?? 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  const user = await glpiGet(`/User/${id}`).catch(() => null);
  if (!user?.id) return null;
  const role = await resolveRole(user);
  return { id: Number(user.id), login: user.name, ...role };
}

/**
 * Express guard for service-desk-only endpoints. Demo-grade: identity comes
 * from a header rather than a signed token, but the ROLE is always resolved
 * server-side so a caller cannot simply declare itself staff.
 */
export async function requireStaff(req, res, next) {
  try {
    const caller = await resolveCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Identify first: this endpoint needs an X-FDNY-User-Id header." });
    }
    if (!caller.isStaff) {
      return res.status(403).json({ error: "Service-desk access is required for this view." });
    }
    req.caller = caller;
    next();
  } catch (error) {
    console.error("requireStaff failed:", error);
    res.status(500).json({ error: error.message });
  }
}

/** Guard for per-user data: you may read your own, staff may read anyone's. */
/**
 * Same rule for endpoints that name the subject in the request BODY - ticket
 * creation, above all. Without this an end user could post someone else's
 * users_id and raise a ticket in their name; reporting on behalf of another
 * member is a service-desk action only.
 */
export function requireSelfOrStaffBody(field = "userId") {
  return async (req, res, next) => {
    try {
      const caller = await resolveCaller(req);
      if (!caller) {
        return res.status(401).json({ error: "Identify first: this endpoint needs an X-FDNY-User-Id header." });
      }
      const target = String(req.body?.[field] ?? "");
      if (!caller.isStaff && target && String(caller.id) !== target) {
        return res
          .status(403)
          .json({ error: "Only the service desk can raise a ticket on behalf of another member." });
      }
      req.caller = caller;
      next();
    } catch (error) {
      console.error("requireSelfOrStaffBody failed:", error);
      res.status(500).json({ error: error.message });
    }
  };
}

export function requireSelfOrStaff(paramName = "userId") {
  return async (req, res, next) => {
    try {
      const caller = await resolveCaller(req);
      const target = String(req.params[paramName] ?? req.query[paramName] ?? "");
      if (!caller) {
        return res.status(401).json({ error: "Identify first: this endpoint needs an X-FDNY-User-Id header." });
      }
      if (!caller.isStaff && target && String(caller.id) !== target) {
        return res.status(403).json({ error: "You can only view your own equipment and tickets." });
      }
      req.caller = caller;
      next();
    } catch (error) {
      console.error("requireSelfOrStaff failed:", error);
      res.status(500).json({ error: error.message });
    }
  };
}
