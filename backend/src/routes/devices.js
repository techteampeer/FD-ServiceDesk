import express from "express";
import { getUserDevices } from "../glpi.js";
import { listFleet } from "../services/assets.js";
import { requireSelfOrStaff, requireStaff } from "../services/roles.js";

const router = express.Router();

// GET /api/devices - the whole FDNY Phone fleet, same normalized shape as
// GET /api/devices/:userId. Both are thin wrappers over the asset service.
router.get("/", requireStaff, async (req, res) => {
  try {
    const devices = await listFleet({
      limit: req.query.limit ? Math.min(Number(req.query.limit) || 200, 500) : 200,
      // ?taggedOnly=1 restricts the result to BTDS-tagged assets.
      taggedOnly: ["1", "true", "yes"].includes(String(req.query.taggedOnly ?? "").toLowerCase()),
    });
    res.json({ devices, count: devices.length });
  } catch (error) {
    console.error("Error in /api/devices:", error);
    res.status(500).json({ error: error.message });
  }
});

// Devices are returned already enriched (assetTag, type, manufacturer/model,
// status, location id + name, itemType "Phone"). `unit` is kept for the kiosk UI.
router.get("/:userId", requireSelfOrStaff("userId"), async (req, res) => {
  try {
    res.json({ devices: await getUserDevices(req.params.userId) });
  } catch (error) {
    console.error("Error in /api/devices/:userId:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
