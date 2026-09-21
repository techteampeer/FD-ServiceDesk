import { currentUser } from "./mock-data";

/* ------------------------------------------------------------------ */
/* Service catalog                                                     */
/* ------------------------------------------------------------------ */

export type ServiceCategory =
  "Field Devices" | "Connectivity" | "Applications" | "Access & Identity" | "Inventory";

export interface ServiceOffering {
  slug: string;
  name: string;
  category: ServiceCategory;
  summary: string;
  sla: string;
  fulfillment: string;
  requestVia: "AI Assistant" | "Service Desk" | "Self-service";
}

export const serviceCatalog: ServiceOffering[] = [
  {
    slug: "device-recovery",
    name: "Field Device Recovery",
    category: "Field Devices",
    summary:
      "Locate, sound-ping, or lock an enrolled ePCR tablet or MDT that has been misplaced on a run.",
    sla: "15 minutes to first action",
    fulfillment: "Workspace ONE automation",
    requestVia: "AI Assistant",
  },
  {
    slug: "device-replacement",
    name: "Device Replacement & Swap",
    category: "Field Devices",
    summary:
      "Request a spare tablet, MDT, or dock from the Fort Totten depot when hardware fails in service.",
    sla: "4 hours (Critical) · next business day (Standard)",
    fulfillment: "Depot dispatch",
    requestVia: "Service Desk",
  },
  {
    slug: "esim-refresh",
    name: "Carrier eSIM Refresh",
    category: "Connectivity",
    summary:
      "Re-provision a FirstNet or Verizon eSIM profile remotely to restore cellular data on a field device.",
    sla: "10 minutes automated",
    fulfillment: "Carrier API automation",
    requestVia: "Self-service",
  },
  {
    slug: "station-network",
    name: "Station Network & Wi-Fi",
    category: "Connectivity",
    summary: "Report degraded apparatus-bay coverage, access-point faults, or station VLAN issues.",
    sla: "1 business day triage",
    fulfillment: "Network engineering",
    requestVia: "Service Desk",
  },
  {
    slug: "epcr-support",
    name: "ePCR Application Support",
    category: "Applications",
    summary:
      "Crashes, sync failures, or chart-submission errors in the electronic patient care record app.",
    sla: "2 hours (High)",
    fulfillment: "Application support team",
    requestVia: "AI Assistant",
  },
  {
    slug: "cad-support",
    name: "CAD & Dispatch Integration",
    category: "Applications",
    summary: "Missing or delayed CAD updates on mobile data terminals during active response.",
    sla: "30 minutes (Critical)",
    fulfillment: "Platform engineering",
    requestVia: "Service Desk",
  },
  {
    slug: "account-access",
    name: "Account Unlock & Password Reset",
    category: "Access & Identity",
    summary:
      "Unlock a department account, reset a password, or clear cached credentials on a station kiosk.",
    sla: "15 minutes",
    fulfillment: "Identity automation",
    requestVia: "Self-service",
  },
  {
    slug: "role-access",
    name: "Application Access Request",
    category: "Access & Identity",
    summary:
      "Request or remove role-based access to department applications for a member of your unit.",
    sla: "2 business days (approval required)",
    fulfillment: "Access governance",
    requestVia: "Service Desk",
  },
  {
    slug: "tag-validation",
    name: "Equipment Tag Validation",
    category: "Inventory",
    summary:
      "Validate an equipment tag against the CMDB catalog and correct mismatched or duplicate records.",
    sla: "Immediate",
    fulfillment: "Smart inventory automation",
    requestVia: "Self-service",
  },
  {
    slug: "inventory-audit",
    name: "Unit Inventory Audit",
    category: "Inventory",
    summary:
      "Schedule a reconciliation of the technology assets recorded against your company or battalion.",
    sla: "Scheduled quarterly",
    fulfillment: "Logistics — Fort Totten",
    requestVia: "Service Desk",
  },
];

/* ------------------------------------------------------------------ */
/* Knowledge base                                                      */
/* ------------------------------------------------------------------ */

export interface KbArticle {
  slug: string;
  title: string;
  category: ServiceCategory;
  summary: string;
  readTime: string;
  updated: string;
  views: number;
  steps: string[];
}

export const kbArticles: KbArticle[] = [
  {
    slug: "locate-missing-tablet",
    title: "Locate a missing ePCR tablet with a sound ping",
    category: "Field Devices",
    summary:
      "Use the AI assistant to check the last Workspace ONE check-in and play an audible tone on the device.",
    readTime: "3 min",
    updated: "Sep 16, 2026",
    views: 1284,
    steps: [
      "Open the AI Service Assistant and describe the missing device.",
      "Confirm the device the assistant pulls from your unit's enrolled list.",
      "Review the last known location and check-in time.",
      "Trigger the sound ping and listen for the tone within about 30 metres.",
      "If the device is not recovered in 15 minutes, create a device-recovery ticket.",
    ],
  },
  {
    slug: "firstnet-no-data",
    title: "FirstNet device shows no data connection",
    category: "Connectivity",
    summary:
      "First-line checks before requesting an automated eSIM refresh on a FirstNet-provisioned MDT.",
    readTime: "4 min",
    updated: "Sep 14, 2026",
    views: 962,
    steps: [
      "Confirm the device shows a carrier name in the status bar.",
      "Toggle airplane mode on for 10 seconds, then off.",
      "Restart the device and wait two minutes for re-attachment.",
      "If data is still down, request a carrier eSIM refresh from the assistant.",
      "Report a carrier error code to the service desk if the refresh fails twice.",
    ],
  },
  {
    slug: "esim-refresh-how-to",
    title: "How the automated eSIM refresh works",
    category: "Connectivity",
    summary:
      "What happens on the carrier side when an eSIM profile is re-provisioned, and how long it takes.",
    readTime: "5 min",
    updated: "Sep 12, 2026",
    views: 734,
    steps: [
      "The portal reads the device IMEI and current carrier profile state.",
      "A re-provision request is sent to the FirstNet or Verizon API.",
      "The device is instructed to re-download its profile at next check-in.",
      "Service typically restores within 10 minutes without a technician visit.",
      "Failures return a carrier error code that routes to the carrier liaison.",
    ],
  },
  {
    slug: "epcr-crash-signature",
    title: "ePCR app closes when attaching a signature",
    category: "Applications",
    summary: "Known defect EPCR-2291 in build 7.4.2 and the staged 7.4.3 patch.",
    readTime: "2 min",
    updated: "Sep 17, 2026",
    views: 611,
    steps: [
      "Check the app version under Settings then About.",
      "If the version is 7.4.2, the crash is the known defect.",
      "Save the chart as a draft before attaching a signature.",
      "Accept the 7.4.3 update when Workspace ONE offers it.",
      "Report any crash on 7.4.3 to the service desk with the crash log.",
    ],
  },
  {
    slug: "equipment-tag-format",
    title: "Reading and entering equipment tags correctly",
    category: "Inventory",
    summary: "Tag formats used across apparatus, thermal imaging, SCBA, and mobile data equipment.",
    readTime: "3 min",
    updated: "Sep 10, 2026",
    views: 508,
    steps: [
      "Tags are grouped as UNIT-TYPE-NUMBER, for example RSC-1-THRM-114.",
      "Always include the hyphens — the CMDB rejects unseparated tags.",
      "Type codes: THRM (thermal), SCBA, MDT, EPCR, PRN (printer), DOCK.",
      "If a tag is rejected, accept the suggested CMDB match when confidence is high.",
      "Report a tag that matches nothing as a possible unregistered asset.",
    ],
  },
  {
    slug: "account-lockout",
    title: "Repeated account lockouts on a station kiosk",
    category: "Access & Identity",
    summary:
      "Cached credentials on shared workstations are the most common cause of repeat lockouts.",
    readTime: "3 min",
    updated: "Sep 09, 2026",
    views: 455,
    steps: [
      "Sign out of every session on the shared workstation.",
      "Open Credential Manager and remove saved department credentials.",
      "Request an account unlock from the portal.",
      "Sign in once on the kiosk and decline any save-password prompt.",
      "Escalate to identity support if lockouts continue past two cycles.",
    ],
  },
  {
    slug: "station-wifi-degraded",
    title: "Wi-Fi drops in the apparatus bay",
    category: "Connectivity",
    summary:
      "Interference and radio utilisation issues that affect tablets when bay doors are open.",
    readTime: "4 min",
    updated: "Sep 08, 2026",
    views: 388,
    steps: [
      "Note whether drops correlate with bay doors opening.",
      "Record which access point the tablet is associated with.",
      "Report the pattern so an RF survey can be scheduled.",
      "Use cellular fallback for CAD updates while the survey is pending.",
      "Confirm improvement after the channel plan is changed.",
    ],
  },
  {
    slug: "device-enrollment",
    title: "Enrolling a replacement device in Workspace ONE",
    category: "Field Devices",
    summary: "Steps a company officer follows when a depot swap unit arrives at quarters.",
    readTime: "6 min",
    updated: "Sep 05, 2026",
    views: 341,
    steps: [
      "Confirm the asset tag on the swap unit matches the dispatch note.",
      "Power on and connect to station Wi-Fi.",
      "Sign in with the unit service account when prompted for enrolment.",
      "Wait for the baseline application set to install (about 20 minutes).",
      "Confirm the retired device is marked for return in the same ticket.",
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Devices                                                             */
/* ------------------------------------------------------------------ */

export type DeviceHealth = "Online" | "Offline" | "Needs Attention";

export interface FieldDevice {
  tag: string;
  model: string;
  type: "ePCR Tablet" | "MDT" | "Printer" | "Access Point" | "Camera Dock";
  unit: string;
  borough: string;
  carrier: string;
  health: DeviceHealth;
  battery: number;
  lastCheckIn: string;
  osVersion: string;
}

export const fieldDevices: FieldDevice[] = [
  {
    tag: "Tablet-EPCR-2391",
    model: "Panasonic Toughbook FZ-A3",
    type: "ePCR Tablet",
    unit: "Engine 23",
    borough: "Manhattan",
    carrier: "FirstNet",
    health: "Needs Attention",
    battery: 62,
    lastCheckIn: "Sep 18 · 06:58",
    osVersion: "Android 13",
  },
  {
    tag: "MDT-L9-0771",
    model: "Getac F110",
    type: "MDT",
    unit: "Ladder 9",
    borough: "Manhattan",
    carrier: "FirstNet",
    health: "Offline",
    battery: 88,
    lastCheckIn: "Sep 18 · 05:31",
    osVersion: "Windows 11 22H2",
  },
  {
    tag: "MDT-B12-0310",
    model: "Getac F110",
    type: "MDT",
    unit: "Battalion 12",
    borough: "Queens",
    carrier: "Verizon",
    health: "Needs Attention",
    battery: 74,
    lastCheckIn: "Sep 18 · 07:44",
    osVersion: "Windows 11 22H2",
  },
  {
    tag: "Tablet-EPCR-1180",
    model: "Panasonic Toughbook FZ-A3",
    type: "ePCR Tablet",
    unit: "EMS Station 7",
    borough: "Bronx",
    carrier: "FirstNet",
    health: "Online",
    battery: 41,
    lastCheckIn: "Sep 18 · 08:12",
    osVersion: "Android 13",
  },
  {
    tag: "Tablet-EPCR-2044",
    model: "Panasonic Toughbook FZ-A3",
    type: "ePCR Tablet",
    unit: "Engine 33",
    borough: "Brooklyn",
    carrier: "FirstNet",
    health: "Online",
    battery: 97,
    lastCheckIn: "Sep 18 · 08:20",
    osVersion: "Android 13",
  },
  {
    tag: "PRN-E54-002",
    model: "HP LaserJet M507",
    type: "Printer",
    unit: "Engine 54",
    borough: "Manhattan",
    carrier: "Station LAN",
    health: "Offline",
    battery: 100,
    lastCheckIn: "Sep 17 · 13:10",
    osVersion: "Firmware 5.2",
  },
  {
    tag: "AP-E71-BAY-2",
    model: "Cisco 9120AX",
    type: "Access Point",
    unit: "Engine 71",
    borough: "Staten Island",
    carrier: "Station LAN",
    health: "Needs Attention",
    battery: 100,
    lastCheckIn: "Sep 18 · 08:22",
    osVersion: "IOS-XE 17.9",
  },
  {
    tag: "DOCK-SQ41-06",
    model: "Axon Dock 2",
    type: "Camera Dock",
    unit: "Squad 41",
    borough: "Bronx",
    carrier: "Station LAN",
    health: "Needs Attention",
    battery: 100,
    lastCheckIn: "Sep 18 · 07:05",
    osVersion: "Firmware 3.1",
  },
  {
    tag: "MDT-L132-0448",
    model: "Getac F110",
    type: "MDT",
    unit: "Ladder 132",
    borough: "Brooklyn",
    carrier: "Verizon",
    health: "Offline",
    battery: 12,
    lastCheckIn: "Sep 15 · 05:30",
    osVersion: "Windows 11 22H2",
  },
  {
    tag: "Tablet-EPCR-1902",
    model: "Panasonic Toughbook FZ-A3",
    type: "ePCR Tablet",
    unit: "EMS Station 18",
    borough: "Bronx",
    carrier: "FirstNet",
    health: "Online",
    battery: 83,
    lastCheckIn: "Sep 18 · 08:19",
    osVersion: "Android 13",
  },
  {
    tag: "MDT-E71-0922",
    model: "Getac F110",
    type: "MDT",
    unit: "Engine 71",
    borough: "Staten Island",
    carrier: "FirstNet",
    health: "Online",
    battery: 66,
    lastCheckIn: "Sep 18 · 08:15",
    osVersion: "Windows 11 22H2",
  },
  {
    tag: "AP-E23-BAY-1",
    model: "Cisco 9120AX",
    type: "Access Point",
    unit: "Engine 23",
    borough: "Manhattan",
    carrier: "Station LAN",
    health: "Online",
    battery: 100,
    lastCheckIn: "Sep 18 · 08:23",
    osVersion: "IOS-XE 17.9",
  },
];

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export type InventoryState = "Validated" | "Mismatch" | "Duplicate" | "Unregistered";

export interface InventoryRecord {
  submitted: string;
  suggested: string;
  model: string;
  unit: string;
  state: InventoryState;
  confidence: number;
  submittedAt: string;
}

export const inventoryRecords: InventoryRecord[] = [
  {
    submitted: "RSC1THRM114",
    suggested: "RSC-1-THRM-114",
    model: "FLIR K55 Thermal Camera",
    unit: "Rescue 1",
    state: "Mismatch",
    confidence: 96,
    submittedAt: "Sep 17 · 16:04",
  },
  {
    submitted: "LOG-SCBA-8890",
    suggested: "LOG-SCBA-8890",
    model: "Scott X3 Pro SCBA",
    unit: "Logistics",
    state: "Duplicate",
    confidence: 100,
    submittedAt: "Sep 15 · 10:12",
  },
  {
    submitted: "Tablet-EPCR-2391",
    suggested: "Tablet-EPCR-2391",
    model: "Panasonic Toughbook FZ-A3",
    unit: "Engine 23",
    state: "Validated",
    confidence: 100,
    submittedAt: "Sep 18 · 07:42",
  },
  {
    submitted: "MDT-L9-771",
    suggested: "MDT-L9-0771",
    model: "Getac F110",
    unit: "Ladder 9",
    state: "Mismatch",
    confidence: 91,
    submittedAt: "Sep 18 · 06:15",
  },
  {
    submitted: "E54PRN2",
    suggested: "PRN-E54-002",
    model: "HP LaserJet M507",
    unit: "Engine 54",
    state: "Mismatch",
    confidence: 88,
    submittedAt: "Sep 17 · 13:28",
  },
  {
    submitted: "SQ41-DOCK-06",
    suggested: "DOCK-SQ41-06",
    model: "Axon Dock 2",
    unit: "Squad 41",
    state: "Mismatch",
    confidence: 94,
    submittedAt: "Sep 16 · 11:20",
  },
  {
    submitted: "HT-RADIO-0451",
    suggested: "—",
    model: "Unknown handheld radio",
    unit: "Engine 33",
    state: "Unregistered",
    confidence: 0,
    submittedAt: "Sep 16 · 09:40",
  },
  {
    submitted: "AP-E71-BAY-2",
    suggested: "AP-E71-BAY-2",
    model: "Cisco 9120AX",
    unit: "Engine 71",
    state: "Validated",
    confidence: 100,
    submittedAt: "Sep 15 · 19:05",
  },
  {
    submitted: "B12MDT310",
    suggested: "MDT-B12-0310",
    model: "Getac F110",
    unit: "Battalion 12",
    state: "Mismatch",
    confidence: 93,
    submittedAt: "Sep 16 · 15:47",
  },
  {
    submitted: "LOG-SCBA-8891",
    suggested: "LOG-SCBA-8891",
    model: "Scott X3 Pro SCBA",
    unit: "Logistics",
    state: "Validated",
    confidence: 100,
    submittedAt: "Sep 15 · 10:09",
  },
];

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

export const volumeTrend = [
  { week: "Aug 11", created: 58, resolved: 54 },
  { week: "Aug 18", created: 64, resolved: 61 },
  { week: "Aug 25", created: 71, resolved: 66 },
  { week: "Sep 01", created: 66, resolved: 70 },
  { week: "Sep 08", created: 74, resolved: 72 },
  { week: "Sep 15", created: 69, resolved: 75 },
];

export const automationSavings = [
  { month: "Apr", dispatchesAvoided: 22, hoursSaved: 61 },
  { month: "May", dispatchesAvoided: 31, hoursSaved: 88 },
  { month: "Jun", dispatchesAvoided: 38, hoursSaved: 104 },
  { month: "Jul", dispatchesAvoided: 47, hoursSaved: 129 },
  { month: "Aug", dispatchesAvoided: 52, hoursSaved: 148 },
  { month: "Sep", dispatchesAvoided: 44, hoursSaved: 121 },
];

export const slaByPriority = [
  { name: "Critical", met: 91, target: 95 },
  { name: "High", met: 94, target: 90 },
  { name: "Medium", met: 97, target: 85 },
  { name: "Low", met: 99, target: 80 },
];

export const savedReports = [
  {
    name: "Weekly Service Desk Summary",
    owner: "Alex Johnson",
    schedule: "Mondays · 06:00",
    format: "PDF",
  },
  {
    name: "Device Recovery Outcomes",
    owner: "Dana Whitfield",
    schedule: "Monthly · 1st",
    format: "XLSX",
  },
  {
    name: "Connectivity Incident Detail",
    owner: "Priya Raman",
    schedule: "Daily · 07:00",
    format: "CSV",
  },
  {
    name: "CMDB Data Quality",
    owner: "Dana Whitfield",
    schedule: "Fridays · 17:00",
    format: "PDF",
  },
  {
    name: "SLA Attainment by Borough",
    owner: "Marcus Lee",
    schedule: "Monthly · 1st",
    format: "PDF",
  },
];

/* ------------------------------------------------------------------ */
/* Help & support                                                      */
/* ------------------------------------------------------------------ */

export const faqs = [
  {
    q: "When should I call the service desk instead of using the portal?",
    a: "Call immediately for anything affecting an active response — CAD not updating on an MDT, radio interoperability failures, or a device lost outside a known facility. Everything else is faster through the portal.",
  },
  {
    q: "How long does an automated eSIM refresh take?",
    a: "Roughly ten minutes from request to restored service, assuming the device checks in with the carrier. Two failed attempts route the case to the carrier liaison automatically.",
  },
  {
    q: "Can I track a device that is switched off?",
    a: "No. Workspace ONE reports the last successful check-in location and time. If the device is off, that check-in is the most recent position available.",
  },
  {
    q: "Who approves application access requests?",
    a: "Your company officer approves first, then access governance reviews the role. Expect two business days end to end.",
  },
  {
    q: "What happens to a ticket after it is resolved?",
    a: "It stays visible under My Cases for 90 days, then moves to the archive. The asset history on the device record is kept permanently.",
  },
  {
    q: "Is any of the data in this portal real?",
    a: "No. This is an independent design concept and every case, device, and member shown is fictional.",
  },
];

export const supportChannels = [
  {
    name: "IT Service Desk — 24/7",
    detail: "(718) 555-0199",
    note: "Priority line for in-service incidents",
  },
  {
    name: "Email",
    detail: "servicedesk@fdny.org",
    note: "Non-urgent requests · 4-hour response",
  },
  {
    name: "Field Technology Depot",
    detail: "Fort Totten, Queens",
    note: "Swap units · Mon–Fri 07:00–19:00",
  },
  {
    name: "Carrier Liaison",
    detail: "carrier-liaison@fdny.org",
    note: "FirstNet and Verizon escalations",
  },
];

/* ------------------------------------------------------------------ */
/* Profile & settings                                                  */
/* ------------------------------------------------------------------ */

export const userProfile = {
  ...currentUser,
  rank: "Captain",
  phone: "(212) 555-0123",
  battalion: "Battalion 9",
  station: "Engine Company 23 — 517 E 47th St, Manhattan",
  shift: "Group 2 · Days",
  joined: "Mar 2011",
  assignedDevices: ["Tablet-EPCR-2391", "AP-E23-BAY-1"],
};

export const activityLog = [
  { at: "Sep 18, 2026 · 07:42", label: "Opened case FDNY-IT-10482 via AI Service Assistant" },
  { at: "Sep 18, 2026 · 07:41", label: "Signed in from station kiosk — Engine 23" },
  { at: "Sep 17, 2026 · 18:22", label: "Confirmed equipment tag correction RSC-1-THRM-114" },
  { at: "Sep 16, 2026 · 21:20", label: "Case FDNY-IT-10462 resolved — device recovered" },
  { at: "Sep 15, 2026 · 08:03", label: "Completed quarterly inventory attestation" },
];

/* Cases belonging to the signed-in member's unit. */
export const myCaseIds = [
  "FDNY-IT-10482",
  "FDNY-IT-10475",
  "FDNY-IT-10462",
  "FDNY-IT-10471",
  "FDNY-IT-10437",
];
