import express from "express";
import { resetDeviceAndRecord } from "../services/reset.js";

const router = express.Router();

/**
 * POST /api/ticket/reset-sim
 * Thin wrapper: the agent calls resetDeviceAndRecord() directly.
 */
router.post("/", async (req, res) => {
  try {
    const { userId, deviceId, deviceTag, deviceName, assetTag, itemType, simulate } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: "User ID is required." });

    const result = await resetDeviceAndRecord({
      userId,
      deviceId,
      assetTag,
      name: deviceName ?? deviceTag,
      itemType,
      simulate,
    });
    if (!result.device) return res.status(404).json({ error: "No FDNY asset matches that reference.", ...result });
    res.json(result);
  } catch (error) {
    console.error("Error in /api/ticket/reset-sim:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
