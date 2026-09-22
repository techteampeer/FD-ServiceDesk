import express from "express";
import { getTicket, listTickets } from "../services/tickets.js";
import { requireSelfOrStaff, requireStaff } from "../services/roles.js";

const router = express.Router();

// GET /api/tickets?userId=7&status=1&limit=25  (userId filters by requester)
// A member may list their own tickets with ?userId=<their id>; the unfiltered
// queue is service-desk only.
router.get("/", requireSelfOrStaff("userId"), async (req, res) => {
  try {
    const { userId, status, limit } = req.query;
    // A member is always scoped to their own tickets, even if they omit or
    // change userId. Only the service desk may list the whole queue.
    const scopedUserId = req.caller?.isStaff
      ? userId
        ? Number(userId)
        : undefined
      : Number(req.caller?.id);
    const tickets = await listTickets({
      userId: scopedUserId,
      status: status !== undefined && status !== "" ? Number(status) : undefined,
      limit: limit ? Math.min(Number(limit) || 25, 200) : 25,
    });
    res.json({ tickets, count: tickets.length });
  } catch (error) {
    console.error("Error in /api/tickets:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", requireStaff, async (req, res) => {
  try {
    const ticket = await getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found in the FDNY entity." });
    res.json({ ticket });
  } catch (error) {
    console.error("Error in /api/tickets/:id:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
