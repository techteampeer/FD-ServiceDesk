import express from "express";
import { identifyUser } from "../glpi.js";
import { resolveRole } from "../services/roles.js";
import { AUTH_REASON, credentialLoginAvailable, verifyCredentials } from "../services/auth.js";

const router = express.Router();

/**
 * POST /api/identify - { identifier, password }
 *
 * Identification AND password validation, in that order:
 *
 *   A. the identifier (GLPI login, employee/registration number or email) is
 *      resolved to the canonical GLPI user through the trusted service-account
 *      connection;
 *   B. the password is verified by GLPI itself, via initSession with an HTTP
 *      Basic header. GLPI is the only thing that ever judges a password here -
 *      no MySQL access, no hash handling, no custom credential store, and no
 *      path that returns an identity on a bad password.
 *
 * The password exists only as a local argument for the duration of this
 * request. It is never logged, never stored, never returned, and the frontend
 * never puts it in browser storage. The temporary GLPI session opened to prove
 * the credentials is closed immediately and never leaves the backend.
 */
router.post("/", async (req, res) => {
  try {
    const identifier = req.body?.identifier;
    const password = req.body?.password;

    if (!identifier) {
      return res.status(400).json({ error: "The 'identifier' parameter is required." });
    }

    // A. Resolve the identifier to a real GLPI user.
    const candidate = await identifyUser(identifier);
    if (!candidate) {
      return res.status(404).json({ error: "User not found in FDNY entity." });
    }

    // B. Validate the password against GLPI.
    const canVerify = await credentialLoginAvailable();
    if (canVerify) {
      if (!password) {
        return res
          .status(400)
          .json({ error: "A password is required.", reason: AUTH_REASON.MISSING });
      }
      // GLPI authenticates against the login name, so the resolved account's
      // login is used rather than whatever form the member typed.
      const check = await verifyCredentials({ login: candidate.name, password });
      if (!check.verified) {
        if (check.reason === AUTH_REASON.INVALID) {
          return res
            .status(401)
            .json({ error: "That login and password were rejected by GLPI.", reason: check.reason });
        }
        return res
          .status(502)
          .json({ error: "GLPI could not be reached to verify the password.", reason: check.reason });
      }
    }

    // The role decides which portal the member lands in and which endpoints
    // they may call. Resolved server-side, never taken from the client.
    const role = await resolveRole(candidate);

    res.json({
      user: { ...candidate, ...role },
      auth: {
        // "glpi-verified" means GLPI checked the password on this request.
        mode: canVerify ? "glpi-verified" : "unverified-identifier",
        passwordVerified: canVerify,
        // Set when the instance cannot verify, so the UI states the fact
        // instead of implying a password was accepted.
        reason: canVerify ? null : AUTH_REASON.DISABLED,
      },
    });
  } catch (error) {
    // error.message only - a stack here could carry request context.
    console.error("Error in /api/identify:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
