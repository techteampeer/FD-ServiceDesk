/**
 * FDNY knowledge base for the Vertex driver.
 *
 * Same approach as the ITServiceDesk-ENG corpus (data/corpus_*.json +
 * retrieval.js): a flat JSON list, loaded once, ranked by keyword overlap
 * within the conversation's topic, and only the top few entries are placed in
 * the prompt - never the whole file.
 *
 * The entries are GUIDANCE on what the portal supports. They are not live data
 * and never override GLPI or tool results; the prompt says so explicitly.
 *
 * Loaded lazily on first use, so AI_MODE=simulated never reads it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const KB_PATH = path.join(__dirname, "..", "..", "data", "fdny-knowledge-base.json");

const STOP = new Set(
  "the a an of in on to for and or is are was were with at from by it this that not no does can we you they be been has have had my me our your its isn doesn don won didn can't cant just got get".split(
    " ",
  ),
);
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const tokens = (s) => norm(s).split(" ").filter((t) => t.length > 2 && !STOP.has(t));

let cache = null;

/** Parses and validates the knowledge base. Returns [] (and warns once) if it is missing or malformed. */
export function loadKnowledgeBase({ file = KB_PATH, log = console } = {}) {
  if (cache && cache.file === file) return cache.entries;
  let entries = [];
  try {
    const doc = JSON.parse(fs.readFileSync(file, "utf-8"));
    const list = Array.isArray(doc?.entries) ? doc.entries : [];
    const ids = new Set();
    for (const e of list) {
      if (!e?.id || !e?.title || !e?.guidance || ids.has(e.id)) throw new Error(`invalid or duplicate entry ${e?.id ?? "(no id)"}`);
      ids.add(e.id);
      entries.push({
        id: String(e.id),
        title: String(e.title),
        guidance: String(e.guidance),
        topics: Array.isArray(e.topics) ? e.topics.map(String) : [],
        always: Boolean(e.always),
        // Pre-computed for ranking: phrases for exact matches, tokens for overlap.
        phrases: (Array.isArray(e.keywords) ? e.keywords : []).map(norm).filter(Boolean),
        vocab: new Set(tokens(`${e.title} ${(e.keywords ?? []).join(" ")}`)),
      });
    }
  } catch (error) {
    log.warn?.(`[agent] knowledge base not loaded (${error.message}); Vertex runs without guidance`);
    entries = [];
  }
  cache = { file, entries };
  return entries;
}

/**
 * The guidance relevant to this turn: every `always` entry plus the top `n`
 * others, scored by keyword phrases (x2), token overlap, and a topic boost for
 * the conversation's current intent. Entries scoring 0 are not sent.
 */
export function retrieveGuidance({ text = "", intent = null, n = 3, entries = loadKnowledgeBase() } = {}) {
  const q = norm(text);
  const qTokens = new Set(tokens(text));
  const scored = entries
    .filter((e) => !e.always)
    .map((e, order) => {
      let score = 0;
      for (const p of e.phrases) if (p && q.includes(p)) score += 2;
      for (const t of qTokens) if (e.vocab.has(t)) score += 1;
      if (intent && e.topics.includes(intent)) score += 3;
      return { e, score, order };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, n)
    .map((x) => x.e);
  return [...entries.filter((e) => e.always), ...scored];
}

/** The prompt block. Guidance is framed as guidance, below the live GLPI context. */
export function formatGuidance(list) {
  if (!list?.length) return "";
  return [
    "FDNY KNOWLEDGE BASE - guidance only, NOT live data",
    "Use it to decide what to check and what to suggest. It never replaces the FDNY CONTEXT or tool results: the member, their devices, locations, tickets and SIM/carrier details come only from GLPI and the tools. If guidance and a tool result disagree, the tool result is right. If a question is covered by neither, say you don't have that information.",
    ...list.map((e) => `[${e.id}] ${e.title}: ${e.guidance}`),
  ].join("\n");
}

/** Test hook: forget the cached file. */
export function resetKnowledgeBaseCache() {
  cache = null;
}
