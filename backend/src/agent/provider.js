/**
 * Which conversation driver the FDNY agent uses.
 *
 *   AI_MODE=simulated   (default) the deterministic simulator. No model is ever
 *                       initialised or called, and the Google SDK is not loaded.
 *   AI_MODE=vertex      Gemini on Vertex AI reasons over the conversation and the
 *                       member's GLPI context, and calls the SAME FDNY tools the
 *                       simulator uses. Any failure falls back to the simulator.
 *
 * Anything other than exactly "vertex" - including a missing AI_MODE - is the
 * simulator, so a typo can never switch on a paid model.
 *
 * Vertex configuration follows the pattern proven by the ITServiceDesk-ENG
 * service: @google/genai with `vertexai: true`, authenticated through
 * Application Default Credentials (the Cloud Run service identity in
 * production; `gcloud auth application-default login` locally). No key file is
 * read and none should be added.
 *
 * Configuration (Claudio's variable names are canonical):
 *   GOOGLE_CLOUD_PROJECT  required in vertex mode (itservicedesk-502618)
 *   VERTEX_LOCATION       default us-central1
 *   VERTEX_MODEL          required in vertex mode - there is deliberately no
 *                         built-in default, so no model is ever chosen silently
 *   AI_TIMEOUT_MS         per model request, default 15000
 * The earlier names GCP_PROJECT / GCP_LOCATION / GEMINI_MODEL are read only as
 * a fallback when Claudio's name is not set.
 *
 * A retired model (the Gemini 1.x families) is refused before any request: the
 * simulator keeps answering and the log says which variable to change. It is
 * never swapped for another model automatically.
 */
import * as simulator from "./simulator.js";
import { createVertexDriver } from "./vertex.js";

export const aiMode = () => (String(process.env.AI_MODE ?? "").trim().toLowerCase() === "vertex" ? "vertex" : "simulated");

/** Claudio's name first; the earlier name only as a fallback. */
const env = (name, legacy) => (process.env[name] ?? "").trim() || (process.env[legacy] ?? "").trim() || null;

/**
 * Gemini 1.x models are retired on Vertex AI. Returns the reason, or null.
 * Deliberately narrow: only families known to be gone are refused.
 */
export function retiredModelReason(model) {
  const m = String(model ?? "").trim().replace(/^publishers\/google\/models\//i, "");
  return /^gemini-1\.\d/i.test(m)
    ? `VERTEX_MODEL=${m} is a retired Gemini 1.x model that Vertex AI no longer serves. Confirm a supported model with Claudio and set VERTEX_MODEL before enabling AI_MODE=vertex.`
    : null;
}

export function vertexConfig() {
  const model = env("VERTEX_MODEL", "GEMINI_MODEL");
  return {
    project: env("GOOGLE_CLOUD_PROJECT", "GCP_PROJECT"),
    location: env("VERTEX_LOCATION", "GCP_LOCATION") ?? "us-central1",
    model,
    retired: retiredModelReason(model),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 15000,
  };
}

// Said once at startup, whatever the mode: the configured model cannot be used.
{
  const retired = retiredModelReason(env("VERTEX_MODEL", "GEMINI_MODEL"));
  if (retired) console.warn(`[agent] ${retired} (AI_MODE=${aiMode()}; no model is called)`);
}

let vertexDriver = null;
let announced = null;

/** The driver for this turn. The Vertex driver is built on first use only. */
export function activeDriver() {
  const mode = aiMode();
  if (announced !== mode) {
    announced = mode;
    const cfg = vertexConfig();
    console.log(
      mode === "vertex"
        ? `[agent] AI_MODE=vertex - ${cfg.model ?? "VERTEX_MODEL not set"} on Vertex AI (${cfg.project ?? "GOOGLE_CLOUD_PROJECT not set"}, ${cfg.location}); simulator fallback on any error${cfg.retired ? " - model refused: retired" : ""}`
        : "[agent] AI_MODE=simulated - deterministic simulator; Vertex AI is not initialised",
    );
  }
  if (mode !== "vertex") return simulator;
  if (!vertexDriver) vertexDriver = createVertexDriver({ config: vertexConfig() });
  return vertexDriver;
}

/** Test hook: install a driver built with a mocked model. */
export function setVertexDriverForTests(driver) {
  vertexDriver = driver;
}
