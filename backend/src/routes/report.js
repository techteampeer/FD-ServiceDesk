import express from "express";
import { createTicket, linkAssetToTicket, getOrCreateCategory } from "../glpi.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { 
      title,         // Inferred by AI during conversation
      text,          // Conversation transcript or summary created by AI
      category,      // ITIL Category inferred by AI
      urgency,       // Urgency level (1 to 5) determined by AI
      userId,        // Identified user ID
      locationId,    // Identified station/unit ID
      deviceId,      // Selected asset ID
      deviceTag,     // Asset tag (e.g., "FDNY-TAB-1001")
      itemType       // "Computer" or "Phone"
    } = req.body;

    if (!text || !userId) {
      return res.status(400).json({ 
        error: "User ID and interaction text are required." 
      });
    }

    let categoryId = null;
    if (category) {
      categoryId = await getOrCreateCategory(category);
    }

    const ticketPayload = {
      name: title || `[${deviceTag || "Kiosk"}] AI Agent Assisted Issue`,
      content: text,
      status: 1,                          // Status: New
      urgency: urgency || 3,              // Default Urgency: 3 (Normal)
      _users_id_requester: userId,
      users_id_recipient: userId
    };

    if (categoryId) {
      ticketPayload.itilcategories_id = categoryId;
    }

    if (locationId) {
      ticketPayload.locations_id = locationId;
    }

    const ticketResult = await createTicket(ticketPayload);

    if (!ticketResult || !ticketResult.id) {
      throw new Error("Failed to create ticket in GLPI.");
    }

    const createdTicketId = ticketResult.id;

    let assetLinked = false;
    if (deviceId && itemType) {
      try {
        await linkAssetToTicket(createdTicketId, itemType, deviceId);
        assetLinked = true;
      } catch (linkError) {
        console.error(`Failed to link asset ${deviceId} to ticket:`, linkError);
      }
    }

    res.json({
      success: true,
      ticketId: `GLPI-2026-0${createdTicketId}`,
      rawTicketId: createdTicketId,
      status: "NEW",
      assetLinked,
      summary: text
    });

  } catch (error) {
    console.error("Error in /api/ticket/report:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;