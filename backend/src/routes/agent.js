import express from "express";
import { handleAction, handleMessage, startSession } from "../agent/index.js";
import { identifyUser } from "../glpi.js";

const router = express.Router();

const notFound = (res) => res.status(404).json({ error: "Agent session not found or expired." });

/**
 * POST /api/agent/session
 * Body: { userId | identifier, deviceId?, itemType? }
 * Seeds the session with the identified user and selected asset so the
 * conversation never re-asks for them.
 */
router.post("/session", async (req, res) => {
  try {
    const { userId, identifier, deviceId, itemType, user: passedUser } = req.body ?? {};
    let user = passedUser ?? null;

    if (!user && identifier) {
      user = await identifyUser(identifier);
      if (!user) return res.status(404).json({ error: "User not found." });
    }
    if (!user && userId) user = { id: Number(userId), name: String(userId) };
    if (!user?.id) return res.status(400).json({ error: "A userId or identifier is required." });

    res.json(await startSession({ user, deviceId, itemType }));
  } catch (error) {
    console.error("Error in /api/agent/session:", error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/agent/message { sessionId, text, deviceId?, itemType? } */
router.post("/message", async (req, res) => {
  try {
    const { sessionId, text } = req.body ?? {};
    if (!sessionId || !String(text ?? "").trim()) {
      return res.status(400).json({ error: "sessionId and text are required." });
    }
    const out = await handleMessage(req.body);
    return out ? res.json(out) : notFound(res);
  } catch (error) {
    console.error("Error in /api/agent/message:", error);
    res.status(500).json({ error: error.message });
  }
});

/** POST /api/agent/action { sessionId, action, payload? } */
router.post("/action", async (req, res) => {
  try {
    const { sessionId, action } = req.body ?? {};
    if (!sessionId || !action) return res.status(400).json({ error: "sessionId and action are required." });
    const out = await handleAction(req.body);
    return out ? res.json(out) : notFound(res);
  } catch (error) {
    console.error("Error in /api/agent/action:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
