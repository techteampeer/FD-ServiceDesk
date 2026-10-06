import express from "express";
import { createTicket, linkAssetToTicket, getOrCreateCategory, resolveAssetRef } from "../glpi.js";
import { requireSelfOrStaffBody } from "../services/roles.js";

const router = express.Router();

// The requester is named in the body, so the caller may only name themselves
// unless they are service desk. Without this an end user could raise a ticket
// against another member.
router.post("/", requireSelfOrStaffBody("userId"), async (req, res) => {
  try {
    const { 
      title,         // Inferred by AI during conversation
      text,          // Conversation transcript or summary created by AI
      category,      // ITIL Category inferred by AI
      urgency,       // Urgency level (1 to 5) determined by AI
      userId,        // Identified user ID
      locationId,    // Identified station/unit ID
      deviceId,      // Selected asset ID
      deviceTag,     // Display name or BTDS tag sent by the kiosk
      assetTag,      // BTDSYYYY###### inventory number, when the caller has it
      itemType       // Normalized to "Phone"; legacy "Computer" is accepted
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

    // When the service desk raises this for someone else, the operator is
    // recorded in the ticket body: GLPI keeps the member as the requester, and
    // the desk still needs to know who took the call.
    const operator = req.caller;
    const onBehalf = operator && String(operator.id) !== String(userId);
    const content = onBehalf
      ? `${text}

Raised by the service desk on behalf of the member. Operator: ${operator.login} (GLPI user ${operator.id}).`
      : text;

    const ticketPayload = {
      name: title || `[${deviceTag || "Kiosk"}] AI Agent Assisted Issue`,
      content,
      status: 1,                          // Status: New
      urgency: urgency || 3,              // Default Urgency: 3 (Normal)
      // The member stays the requester even when the desk files it for them.
      _users_id_requester: userId,
      users_id_recipient: operator?.id ?? userId
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

    // Canonical identity is the GLPI id or the BTDS tag, never the display name.
    // itemType is a hint only: resolveAssetRef verifies it against GLPI and
    // falls back to the other itemtype, so a Computer is never linked as Phone.
    const ref = await resolveAssetRef({ deviceId, assetTag, deviceTag, name: deviceTag, itemType });
    let assetLinked = false;
    if (ref) {
      try {
        await linkAssetToTicket(createdTicketId, ref.itemtype, ref.items_id);
        assetLinked = true;
      } catch (linkError) {
        console.error(`Failed to link ${ref.itemtype}#${ref.items_id} to ticket:`, linkError);
      }
    }

    res.json({
      success: true,
      ticketId: `${createdTicketId}`,
      rawTicketId: createdTicketId,
      status: "NEW",
      assetLinked,
      assetItemType: ref?.itemtype || null,
      assetResolvedBy: ref?.resolvedBy || null,
      summary: text
    });

  } catch (error) {
    console.error("Error in /api/ticket/report:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;