import express from "express";
import { glpiGet, getEntityId } from "../glpi.js";
import { requireStaff } from "../services/roles.js";
import { resolveRole } from "../services/roles.js";

const router = express.Router();

const rows = (r) => (Array.isArray(r) ? r : []);
const inEntity = (u) => String(u?.entities_id ?? "") === getEntityId();
const alive = (u) => !Number(u?.is_deleted) && Number(u?.is_active ?? 1) === 1;

/**
 * GET /api/users/search?q=... - service desk only.
 *
 * Finds real GLPI users so the desk can file a ticket for the member who
 * called. Matching is on the three identifiers GLPI actually holds: the login
 * name, the registration number (employee/badge) and any UserEmail address.
 * Nothing is invented - a member with no email simply has none.
 */
router.get("/search", requireStaff, async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ users: [], query: q });

    const limit = Math.min(Number(req.query.limit) || 10, 25);
    const found = new Map();

    const add = (user, matchedOn) => {
      if (!user?.id || !inEntity(user) || !alive(user)) return;
      if (!found.has(Number(user.id))) found.set(Number(user.id), { user, matchedOn });
    };

    // Login and badge come straight off the User record.
    for (const field of ["name", "realname", "firstname", "registration_number"]) {
      for (const u of rows(await glpiGet("/User", { [`searchText[${field}]`]: q, range: "0-49" }))) {
        add(u, field === "registration_number" ? "employee number" : field === "name" ? "login" : "name");
      }
      if (found.size >= limit) break;
    }

    // Email lives in UserEmail, so it needs its own lookup.
    if (found.size < limit) {
      for (const e of rows(await glpiGet("/UserEmail", { "searchText[email]": q, range: "0-49" }))) {
        if (!e?.users_id) continue;
        const u = await glpiGet(`/User/${e.users_id}`).catch(() => null);
        if (u) add(u, "email");
      }
    }

    const users = [];
    for (const { user, matchedOn } of [...found.values()].slice(0, limit)) {
      const emails = rows(await glpiGet(`/User/${user.id}/UserEmail`).catch(() => []));
      const email = (emails.find((e) => Number(e.is_default)) || emails[0])?.email ?? null;
      const role = await resolveRole(user);
      users.push({
        id: Number(user.id),
        login: user.name,
        displayName: [user.firstname, user.realname].filter(Boolean).join(" ") || user.name,
        employeeId: user.registration_number || null,
        email,
        locationId: Number(user.locations_id) || null,
        matchedOn,
        role: role.role,
        label: role.label,
      });
    }

    res.json({ users, query: q });
  } catch (error) {
    console.error("Error in /api/users/search:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
