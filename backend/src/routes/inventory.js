import express from "express";
import { validateAssetTag } from "../services/assets.js";

const router = express.Router();

// POST /api/inventory/validate { submitted: "BTDS2025012307" }
// Read-only: proposes a corrected asset but never modifies GLPI.
router.post("/validate", async (req, res) => {
  try {
    const submitted = req.body?.submitted ?? req.body?.tag ?? req.query?.submitted;
    if (!submitted) return res.status(400).json({ error: "A 'submitted' tag is required." });
    res.json(await validateAssetTag(submitted));
  } catch (error) {
    console.error("Error in /api/inventory/validate:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
