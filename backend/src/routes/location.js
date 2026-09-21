import express from "express";
import { getLocation } from "../glpi.js";

const router = express.Router();

router.get("/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;
    const location = await getLocation(locationId);
    res.json(location);
  } catch (error) {
    console.error("Error in /api/location:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;