import express from "express";
import { getDashboard } from "../services/dashboard.js";
import { requireStaff } from "../services/roles.js";

const router = express.Router();

// GET /api/dashboard - real counts for the staff dashboard.
router.get("/", requireStaff, async (req, res) => {
  try {
    res.json(await getDashboard({ ticketLimit: Math.min(Number(req.query.limit) || 200, 500) }));
  } catch (error) {
    console.error("Error in /api/dashboard:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
