import { useEffect, useState } from "react";

/**
 * Tiny cross-screen signal for "a GLPI ticket was just created".
 *
 * My Cases loaded once on mount, so a ticket raised in the assistant did not
 * appear until a hard refresh. Every flow that receives a real ticket back from
 * GLPI bumps this counter, and any list watching it refetches.
 */
let version = 0;
const listeners = new Set<() => void>();

export function bumpTickets() {
  version += 1;
  for (const fn of listeners) fn();
}

/** Re-renders the caller whenever a ticket is created, and on window focus. */
export function useTicketVersion() {
  const [v, setV] = useState(version);

  useEffect(() => {
    const sync = () => setV(version);
    listeners.add(sync);
    // Returning to the tab should also pick up anything raised elsewhere.
    window.addEventListener("focus", sync);
    return () => {
      listeners.delete(sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  return v;
}
