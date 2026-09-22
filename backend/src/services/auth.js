/**
 * GLPI credential authentication.
 *
 * GLPI's supported mechanism for verifying a username/password is
 * `POST /initSession` with an HTTP Basic `Authorization` header. GLPI performs
 * the check itself against whatever backend that user is bound to (internal
 * hash, LDAP, ...), so nothing here needs - or is allowed to have - access to
 * the stored password hash. There is deliberately no DB path and no attempt to
 * "decrypt" a GLPI password: GLPI stores a one-way password_hash() digest.
 *
 * The password exists only as an argument on the call stack for the duration of
 * one request. It is never persisted, never logged, never echoed back to the
 * client and never sent anywhere except GLPI's own initSession endpoint.
 *
 * Credential login is a per-instance GLPI setting (Setup > General > API >
 * "Enable login with credentials"). When it is off, GLPI answers
 * ERROR_LOGIN_WITH_CREDENTIALS_DISABLED and no password can be verified through
 * the API at all - that is reported as its own reason so the portal can say so
 * plainly instead of pretending the password was checked.
 */

function apiConfig() {
  const raw = (process.env.GLPI_BASE_URL || "https://glpi.peer-consulting.com/apirest.php")
    .trim()
    .replace(/\/+$/, "");
  return {
    apiUrl: /apirest\.php$/i.test(raw) ? raw : `${raw}/apirest.php`,
    appToken: (process.env.GLPI_APP_TOKEN || "").trim(),
  };
}

/** Reasons a verification attempt did not produce a confirmed identity. */
export const AUTH_REASON = {
  INVALID: "invalid_credentials",
  DISABLED: "credentials_login_disabled",
  MISSING: "missing_credentials",
  UNAVAILABLE: "glpi_unavailable",
};

/** True once GLPI has told us credential login is turned off on this instance. */
let credentialLoginDisabled = null;

/**
 * Asks GLPI whether credential login is available, without sending a real
 * password: a deliberately invalid probe distinguishes "disabled" (400
 * ERROR_LOGIN_WITH_CREDENTIALS_DISABLED) from "enabled but wrong password"
 * (401). The answer is cached because it is an instance setting.
 */
export async function credentialLoginAvailable() {
  if (credentialLoginDisabled !== null) return !credentialLoginDisabled;
  const probe = await callInitSession("__fdny_probe__", "__fdny_probe__");
  credentialLoginDisabled = probe.reason === AUTH_REASON.DISABLED;
  return !credentialLoginDisabled;
}

/** One initSession attempt. Returns the session token on success. */
async function callInitSession(login, password) {
  const { apiUrl, appToken } = apiConfig();
  const basic = Buffer.from(`${login}:${password}`).toString("base64");

  let res;
  let body = "";
  try {
    res = await fetch(`${apiUrl}/initSession`, {
      headers: { "App-Token": appToken, Authorization: `Basic ${basic}` },
    });
    body = await res.text();
  } catch {
    // Never include the request headers in an error: they carry the password.
    return { ok: false, reason: AUTH_REASON.UNAVAILABLE };
  }

  if (res.ok) {
    let token = null;
    try {
      token = JSON.parse(body)?.session_token ?? null;
    } catch {
      token = null;
    }
    return token ? { ok: true, token } : { ok: false, reason: AUTH_REASON.UNAVAILABLE };
  }

  if (body.includes("ERROR_LOGIN_WITH_CREDENTIALS_DISABLED")) {
    return { ok: false, reason: AUTH_REASON.DISABLED };
  }
  if (res.status === 401 || body.includes("ERROR_GLPI_LOGIN")) {
    return { ok: false, reason: AUTH_REASON.INVALID };
  }
  return { ok: false, reason: AUTH_REASON.UNAVAILABLE };
}

/** Closes the session opened purely to prove the credentials were good. */
async function killSession(token) {
  const { apiUrl, appToken } = apiConfig();
  try {
    await fetch(`${apiUrl}/killSession`, {
      headers: { "App-Token": appToken, "Session-Token": token },
    });
  } catch {
    /* the session expires on its own */
  }
}

/**
 * Verifies a login/password pair against GLPI.
 *
 * Returns `{ verified: true, login }` when GLPI accepted the credentials, or
 * `{ verified: false, reason }` otherwise. The password is not part of either
 * result, and the caller must not log the argument it passed in.
 */
export async function verifyCredentials({ login, password } = {}) {
  if (!login || !password) return { verified: false, reason: AUTH_REASON.MISSING };

  const attempt = await callInitSession(login, password);
  if (attempt.reason === AUTH_REASON.DISABLED) credentialLoginDisabled = true;
  if (!attempt.ok) return { verified: false, reason: attempt.reason };

  credentialLoginDisabled = false;
  // The session was only ever needed as proof; the portal's own GLPI calls run
  // under the service account.
  await killSession(attempt.token);
  return { verified: true, login: String(login) };
}
