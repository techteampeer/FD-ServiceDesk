/**
 * In-memory agent sessions.
 *
 * Demo-scale only: sessions live in this process and are lost on restart. The
 * shape is deliberately serialisable so it can move to Redis or a table later
 * without touching the engine.
 */
const SESSIONS = new Map();
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_HISTORY = 40;

let counter = 0;
const newId = () => `ag_${Date.now().toString(36)}_${(++counter).toString(36)}`;

function prune() {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, s] of SESSIONS) if (s.updatedAt < cutoff) SESSIONS.delete(id);
}

export function createSession({ user, device = null, location = null }) {
  prune();
  const now = Date.now();
  const session = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    /** Identified GLPI user - never re-asked during the conversation. */
    user,
    /** Selected asset, with its REAL itemType preserved. */
    device,
    location,
    intent: null,
    /** Free-form per-intent working state (pending confirmations, drafts). */
    slots: {},
    history: [],
    lastAction: null,
    tickets: [],
    /** Decisions worth recording: what was corrected, and whether GLPI changed. */
    audit: [],
  };
  SESSIONS.set(session.id, session);
  return session;
}

export function getSession(id) {
  const s = SESSIONS.get(String(id ?? ""));
  if (!s) return null;
  s.updatedAt = Date.now();
  return s;
}

export function appendHistory(session, role, text, meta = null) {
  session.history.push({ role, text, at: new Date().toISOString(), ...(meta ? { meta } : {}) });
  if (session.history.length > MAX_HISTORY) session.history.splice(0, session.history.length - MAX_HISTORY);
  session.updatedAt = Date.now();
  return session;
}

export function setDevice(session, device) {
  if (device) session.device = device;
  session.updatedAt = Date.now();
  return session;
}

export const sessionCount = () => SESSIONS.size;
