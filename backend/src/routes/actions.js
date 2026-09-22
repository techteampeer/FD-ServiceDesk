import express from "express";
import { lookupDevice } from "../services/workspaceone.mock.js";
import { connectivityDiagnostic, esimRefresh } from "../services/carrier.mock.js";
import { escalateToTicket } from "../services/tickets.js";
import { toolManifest } from "../services/index.js";

const router = express.Router();

// Every handler here is a thin wrapper: the same service function is what the
// Gemini agent will call as a tool.
const wrap = (fn, name) => async (req, res) => {
  try {
    res.json(await fn({ ...req.body, ...req.query }));
  } catch (error) {
    console.error(`Error in /api/actions/${name}:`, error);
    res.status(500).json({ error: error.message });
  }
};

router.get("/", (req, res) => res.json({ tools: toolManifest() }));

router.post("/lookup-device", wrap(lookupDevice, "lookup-device"));
router.post("/connectivity-diagnostic", wrap(connectivityDiagnostic, "connectivity-diagnostic"));
router.post("/esim-refresh", wrap(esimRefresh, "esim-refresh"));

// Escalation writes to GLPI, so it validates before calling the service.
router.post("/escalate", async (req, res) => {
  try {
    const { userId, text } = req.body ?? {};
    if (!userId || !text) {
      return res.status(400).json({ error: "User ID and interaction text are required." });
    }
    res.json({ success: true, ...(await escalateToTicket(req.body)) });
  } catch (error) {
    console.error("Error in /api/actions/escalate:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
