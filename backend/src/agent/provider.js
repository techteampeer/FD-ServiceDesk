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
 *   GCP_PROJECT    required in vertex mode (e.g. itservicedesk-502618)
 *   GCP_LOCATION   default us-central1
 *   GEMINI_MODEL   default gemini-2.5-flash
 *   AI_TIMEOUT_MS  per model request, default 15000
 */
import * as simulator from "./simulator.js";
import { createVertexDriver } from "./vertex.js";

export const aiMode = () => (String(process.env.AI_MODE ?? "").trim().toLowerCase() === "vertex" ? "vertex" : "simulated");

export function vertexConfig() {
  return {
    project: (process.env.GCP_PROJECT ?? "").trim() || null,
    location: (process.env.GCP_LOCATION ?? "").trim() || "us-central1",
    model: (process.env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-flash",
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 15000,
  };
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
        ? `[agent] AI_MODE=vertex - Gemini ${cfg.model} on Vertex AI (${cfg.project ?? "GCP_PROJECT not set"}, ${cfg.location}); simulator fallback on any error`
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
