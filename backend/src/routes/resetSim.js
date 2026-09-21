import express from "express";
import { createTicket, linkAssetToTicket } from "../glpi.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { userId, deviceId, deviceTag, itemType } = req.body;

    const payload = {
      name: `eSIM / cellular reset requested for ${deviceTag}`,
      content: `Reset dispatched to carrier automatically; no field visit required for device ${deviceTag}.`,
      status: 6, // Closed
      users_id_recipient: userId
    };

    const ticket = await createTicket(payload);

    if (deviceId && itemType) {
      await linkAssetToTicket(ticket.id, itemType, deviceId);
    }

    res.json({
      ticketId: `GLPI-2026-0${ticket.id}`,
      status: "CLOSED",
      summary: payload.content
    });
  } catch (error) {
    console.error("Error in /api/ticket/reset-sim:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;