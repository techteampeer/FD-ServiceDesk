import express from "express";
import { credentialLoginAvailable } from "../services/auth.js";

const router = express.Router();

/**
 * GET /api/auth/capabilities - what this GLPI instance actually supports, so
 * the sign-in screen can tell the operator the truth rather than implying a
 * password was checked when it could not be.
 */
router.get("/capabilities", async (_req, res) => {
  try {
    const credentialLogin = await credentialLoginAvailable();
    res.json({
      credentialLogin,
      mechanism: "glpi-initsession-basic",
      note: credentialLogin
        ? "Passwords are verified by GLPI through initSession."
        : "GLPI has credential login disabled (Setup > General > API), so no password can be verified through the API. Enable it there to switch this portal to verified sign-in.",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
