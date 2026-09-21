/**
 * Session-derived identity and role helpers.
 *
 * Every screen reads the signed-in member from here. Nothing falls back to the
 * sample "Capt. M. Delgado" record any more - if there is no session the caller
 * gets null and decides what to render.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import type { GlpiUser } from "./api";
import { displayNameOf, getSessionUser, initialsOf } from "./auth";

export type PortalRole = "user" | "staff";

export const roleOf = (user: GlpiUser | null): PortalRole =>
  (user?.role as PortalRole) === "staff" ? "staff" : "user";

export const isStaffUser = (user: GlpiUser | null) => roleOf(user) === "staff";

/** Navbar `user` prop built from the real session. */
export function navUserFor(user: GlpiUser | null): { name: string; initials: string; role?: string } | null {
  if (!user) return null;
  const subtitle =
    (user.label as string) ||
    (user.employeeId ? `Employee ID ${user.employeeId}` : String(user.name));
  return { name: displayNameOf(user), initials: initialsOf(user), role: subtitle };
}

/**
 * The signed-in member, read on the client only (the session lives in
 * localStorage, so there is nothing to read during SSR).
 */
export function useSessionUser() {
  const [user, setUser] = useState<GlpiUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getSessionUser());
    setReady(true);
  }, []);

  return { user, ready, isStaff: isStaffUser(user), navUser: navUserFor(user) };
}

/**
 * Guards the service-desk routes. Hiding the navigation is not enough - a
 * member who types /staff directly is sent back to the member portal.
 */
export function useRequireStaff() {
  const navigate = useNavigate();
  const { user, ready, isStaff } = useSessionUser();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (!isStaff) navigate({ to: "/", replace: true });
  }, [ready, user, isStaff, navigate]);

  return { allowed: ready && Boolean(user) && isStaff, ready, user, navUser: navUserFor(user) };
}

/** Guards member screens that need an identified user. */
export function useRequireSession() {
  const navigate = useNavigate();
  const { user, ready, isStaff, navUser } = useSessionUser();

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login", replace: true });
  }, [ready, user, navigate]);

  return { user, ready, isStaff, navUser };
}
