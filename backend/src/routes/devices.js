import express from "express";
import { getUserDevices, getLocation } from "../glpi.js";

const router = express.Router();

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const devices = await getUserDevices(userId);

    const enrichedDevices = await Promise.all(
      devices.map(async (device) => {
        let locationName = "No location assigned";
        if (device.locations_id) {
          try {
            const loc = await getLocation(device.locations_id);
            locationName = loc.name || locationName;
          } catch (err) {
            console.error(`Failed to resolve location ID ${device.locations_id}`, err);
          }
        }
        return { ...device, unit: locationName };
      })
    );

    res.json({ devices: enrichedDevices });
  } catch (error) {
    console.error("Error in /api/devices:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;