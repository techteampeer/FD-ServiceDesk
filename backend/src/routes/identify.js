import express from "express";
import { identifyUser } from "../glpi.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: "The 'identifier' parameter is required." });
    }

    const user = await identifyUser(identifier);
    if (!user) {
      return res.status(404).json({ error: "User not found in FDNY entity." });
    }

    res.json({ user });
  } catch (error) {
    console.error("Error in /api/identify:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;