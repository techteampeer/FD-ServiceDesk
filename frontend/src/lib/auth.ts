import { ApiError, loginUser, type GlpiUser } from "./api";

const KEY = "fdny-session";

export interface Session {
  identifier: string;
  at: number;
  /** The real GLPI user returned by /api/identify. */
  user: GlpiUser;
}

/**
 * Signs in against live GLPI. The backend identifies a member by login,
 * employee/badge number or e-mail.
 *
 * NOTE: /api/identify only *identifies* - it does not verify the password. The
 * field is still collected and validated by the form, but no credential check
 * happens server-side yet. Do not treat this as authentication.
 */
/**
 * Signs in through GLPI.
 *
 * The password is passed straight to the backend, which hands it to GLPI's
 * initSession and drops it. It is never written to localStorage and is not part
 * of the stored session. `passwordVerified` reports whether GLPI actually
 * checked it - this instance has credential login disabled, so the portal says
 * so rather than implying a check happened.
 */
export async function signIn(
  identifier: string,
  password: string,
): Promise<{ ok: boolean; error?: string; user?: GlpiUser; passwordVerified?: boolean }> {
  try {
    const { user, auth } = await loginUser(identifier.trim(), password);
    if (!user?.id) {
      return { ok: false, error: "That ID was not found in the Fire Department directory." };
    }
    if (typeof window !== "undefined") {
      const session: Session = { identifier: identifier.trim(), at: Date.now(), user };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(session));
      } catch {
        /* private mode / storage disabled - stay signed in for this page only */
      }
    }
    return { ok: true, user, passwordVerified: Boolean(auth?.passwordVerified) };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        return { ok: false, error: "GLPI rejected that login and password." };
      }
      if (error.status === 404) {
        return {
          ok: false,
          error: "We could not find that Employee ID, login or email. Check it and try again.",
        };
      }
      if (error.status === 0) {
        return { ok: false, error: "Cannot reach the service desk right now. Try again shortly." };
      }
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Sign in failed. Try again." };
  }
}

/** Retained for screens that still demo a signed-in state without a backend. */
export function signInMock(
  identifier: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (password.toLowerCase() === "wrong") {
        resolve({ ok: false, error: "Invalid credentials. Check your Employee ID and password." });
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, JSON.stringify({ identifier, at: Date.now() }));
      }
      resolve({ ok: true });
    }, 1400);
  });
}

export function signOutMock() {
  if (typeof window !== "undefined") window.localStorage.removeItem(KEY);
}

export function isSignedIn() {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(KEY));
}

/** Reads the stored session. Returns null on the server and when nothing is stored. */
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed?.user?.id) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export function getSessionUser(): GlpiUser | null {
  return getSession()?.user ?? null;
}

/** True only when the backend resolved this member as service-desk staff. */
export function sessionIsStaff(): boolean {
  return getSessionUser()?.role === "staff";
}

/** Display helpers so screens can show the real member without extra plumbing. */
export function displayNameOf(user: GlpiUser | null): string {
  if (!user) return "";
  const full = [user.firstname, user.realname].filter(Boolean).join(" ").trim();
  return (user.displayName as string) || full || user.name;
}

export function initialsOf(user: GlpiUser | null): string {
  const name = displayNameOf(user);
  if (!name) return "";
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}
