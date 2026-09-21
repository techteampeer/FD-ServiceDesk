/**
 * Every navigable route in the portal, plus the two navigation sets the
 * Navbar renders. Keeping these in one place means a new page only has to be
 * added here to appear in the right menu.
 */
export type AppRoute =
  | "/"
  | "/login"
  | "/report-ticket"
  | "/services"
  | "/my-cases"
  | "/knowledge-base"
  | "/help"
  | "/profile"
  | "/settings"
  | "/staff"
  | "/staff/cases"
  | "/staff/devices"
  | "/staff/inventory"
  | "/staff/reports"
  | "/staff/settings";

export interface NavItem {
  label: string;
  to: AppRoute;
}

/** Navigation for firehouse / field members. */
// Services, Knowledge Base and Help are still mock-backed, so they are not
// linked during the demo. The routes remain available by URL.
export const memberNav: NavItem[] = [
  { label: "Home", to: "/" },
  { label: "Report an Issue", to: "/report-ticket" },
  { label: "My Cases", to: "/my-cases" },
];

/** Navigation for IT service-desk staff. */
// Reports, Settings and Knowledge Base are still mock-backed and unlinked.
export const staffNav: NavItem[] = [
  { label: "Dashboard", to: "/staff" },
  { label: "Open Cases", to: "/staff/cases" },
  { label: "Devices", to: "/staff/devices" },
  { label: "Inventory", to: "/staff/inventory" },
];
