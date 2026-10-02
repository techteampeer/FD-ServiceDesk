export type Priority = "Critical" | "High" | "Medium" | "Low";
export type CaseStatus = "Open" | "Investigating" | "Waiting for User" | "Resolved" | "Escalated";

export interface ServiceCase {
  id: string;
  issue: string;
  requester: string;
  requesterTitle: string;
  requesterContact: string;
  asset: string;
  assetModel: string;
  location: string;
  category: string;
  priority: Priority;
  status: CaseStatus;
  assignedTo: string;
  created: string;
  description: string;
  aiSummary: string;
  notes: { author: string; at: string; text: string }[];
  timeline: { at: string; label: string }[];
  attachments: string[];
}

export const currentUser = {
  name: "Capt. M. Delgado",
  employeeId: "FD-48219",
  email: "m.delgado@firedept.example",
  unit: "Engine Company 23 — Manhattan",
  initials: "MD",
};

export const staffUser = {
  name: "Alex Johnson",
  role: "Tier 2 Service Desk",
  initials: "AJ",
};

export const serviceCases: ServiceCase[] = [
  {
    id: "FD-IT-10482",
    issue: "Missing ePCR Tablet",
    requester: "Engine Company 23",
    requesterTitle: "Capt. M. Delgado",
    requesterContact: "m.delgado@firedept.example · (212) 555-0123",
    asset: "Tablet-EPCR-2391",
    assetModel: "Panasonic Toughbook FZ-A3",
    location: "Manhattan — Bellevue Hospital",
    category: "Device Recovery",
    priority: "High",
    status: "Investigating",
    assignedTo: "Alex Johnson",
    created: "Sep 18, 2026 · 07:42",
    description:
      "ePCR tablet left in the Bellevue ED triage bay after a patient transfer at approximately 06:50.",
    aiSummary:
      "Workspace ONE lookup confirms device enrolled and online. Last check-in 06:58 at 462 1st Ave (Bellevue ED). Sound ping available. No wipe recommended — device is within known facility.",
    notes: [
      { author: "AI Assistant", at: "07:43", text: "Sound ping queued, awaiting hospital escort." },
      {
        author: "Alex Johnson",
        at: "08:10",
        text: "Contacted Bellevue security, sweep in progress.",
      },
    ],
    timeline: [
      { at: "07:42", label: "Case created via AI Service Assistant" },
      { at: "07:43", label: "Workspace ONE device lookup completed" },
      { at: "07:51", label: "Sound ping triggered (1st attempt)" },
      { at: "08:10", label: "Assigned to Alex Johnson" },
    ],
    attachments: ["last-known-location.png", "device-enrollment.pdf"],
  },
  {
    id: "FD-IT-10479",
    issue: "FirstNet connection drop on MDT",
    requester: "Ladder Company 9",
    requesterTitle: "Lt. R. Okafor",
    requesterContact: "r.okafor@firedept.example",
    asset: "MDT-L9-0771",
    assetModel: "Getac F110 · FirstNet eSIM",
    location: "Manhattan — Great Jones St",
    category: "Connectivity",
    priority: "Critical",
    status: "Escalated",
    assignedTo: "Priya Raman",
    created: "Sep 18, 2026 · 06:15",
    description: "No cellular data for 40+ minutes while responding; CAD updates not syncing.",
    aiSummary:
      "Carrier telemetry shows eSIM profile in suspended state after tower maintenance. Automated refresh attempted twice, second attempt failed with carrier error 4402. Escalation to carrier liaison recommended.",
    notes: [
      { author: "Priya Raman", at: "06:50", text: "Opened carrier escalation ticket VZ-99213." },
    ],
    timeline: [
      { at: "06:15", label: "Case created" },
      { at: "06:19", label: "eSIM refresh triggered (failed)" },
      { at: "06:33", label: "eSIM refresh retried (failed — 4402)" },
      { at: "06:50", label: "Escalated to carrier liaison" },
    ],
    attachments: ["carrier-diagnostics.json"],
  },
  {
    id: "FD-IT-10475",
    issue: "Invalid equipment tag on inventory submission",
    requester: "Rescue 1",
    requesterTitle: "FF J. Nakamura",
    requesterContact: "j.nakamura@firedept.example",
    asset: "RSC-1-THRM-114",
    assetModel: "FLIR K55 Thermal Camera",
    location: "Manhattan — Rescue 1 Quarters",
    category: "Inventory",
    priority: "Low",
    status: "Waiting for User",
    assignedTo: "Dana Whitfield",
    created: "Sep 17, 2026 · 16:04",
    description: "Submitted tag RSC1THRM114 was rejected by the inventory form.",
    aiSummary:
      "CMDB fuzzy match returned RSC-1-THRM-114 with 96% confidence. Awaiting requester confirmation before writing correction back to the asset record.",
    notes: [
      { author: "AI Assistant", at: "16:05", text: "Suggested corrected tag RSC-1-THRM-114." },
    ],
    timeline: [
      { at: "16:04", label: "Case created" },
      { at: "16:05", label: "CMDB validation run — 1 candidate match" },
      { at: "16:06", label: "Correction proposed to requester" },
    ],
    attachments: [],
  },
  {
    id: "FD-IT-10471",
    issue: "Station printer offline",
    requester: "Engine Company 54",
    requesterTitle: "FF A. Boateng",
    requesterContact: "a.boateng@firedept.example",
    asset: "PRN-E54-002",
    assetModel: "HP LaserJet M507",
    location: "Manhattan — W 48th St",
    category: "Hardware",
    priority: "Low",
    status: "Open",
    assignedTo: "Unassigned",
    created: "Sep 17, 2026 · 13:28",
    description: "Printer does not appear on station network after overnight power cycle.",
    aiSummary:
      "Static lease expired on station VLAN. Suggested remediation: re-register DHCP reservation.",
    notes: [],
    timeline: [{ at: "13:28", label: "Case created" }],
    attachments: [],
  },
  {
    id: "FD-IT-10468",
    issue: "ePCR app crashes on chart submission",
    requester: "EMS Station 7",
    requesterTitle: "Paramedic L. Ortiz",
    requesterContact: "l.ortiz@firedept.example",
    asset: "Tablet-EPCR-1180",
    assetModel: "Panasonic Toughbook FZ-A3",
    location: "Bronx — Station 7",
    category: "Software",
    priority: "High",
    status: "Investigating",
    assignedTo: "Marcus Lee",
    created: "Sep 17, 2026 · 09:11",
    description: "Application closes when attaching signature to a completed patient chart.",
    aiSummary:
      "Crash signature matches known defect EPCR-2291 in build 7.4.2. Patch 7.4.3 staged in Workspace ONE.",
    notes: [{ author: "Marcus Lee", at: "09:40", text: "Pushed 7.4.3 to pilot ring for EMS 7." }],
    timeline: [
      { at: "09:11", label: "Case created" },
      { at: "09:22", label: "Crash logs collected" },
      { at: "09:40", label: "Patch deployment scheduled" },
    ],
    attachments: ["crash-log-0917.txt"],
  },
  {
    id: "FD-IT-10462",
    issue: "Misplaced tablet recovered at hospital",
    requester: "Engine Company 33",
    requesterTitle: "Lt. S. Byrne",
    requesterContact: "s.byrne@firedept.example",
    asset: "Tablet-EPCR-2044",
    assetModel: "Panasonic Toughbook FZ-A3",
    location: "Brooklyn — Methodist Hospital",
    category: "Device Recovery",
    priority: "Medium",
    status: "Resolved",
    assignedTo: "Alex Johnson",
    created: "Sep 16, 2026 · 21:02",
    description: "Tablet left on an ED gurney; located with sound ping.",
    aiSummary:
      "Sound ping succeeded on first attempt. Device retrieved by crew within 12 minutes. No dispatch required.",
    notes: [{ author: "Alex Johnson", at: "21:20", text: "Device recovered, case closed." }],
    timeline: [
      { at: "21:02", label: "Case created" },
      { at: "21:06", label: "Sound ping succeeded" },
      { at: "21:20", label: "Case resolved" },
    ],
    attachments: [],
  },
  {
    id: "FD-IT-10459",
    issue: "Verizon eSIM refresh required after SIM swap",
    requester: "Battalion 12",
    requesterTitle: "BC T. Alvarez",
    requesterContact: "t.alvarez@firedept.example",
    asset: "MDT-B12-0310",
    assetModel: "Getac F110 · Verizon eSIM",
    location: "Queens — Battalion 12",
    category: "Connectivity",
    priority: "Medium",
    status: "Open",
    assignedTo: "Priya Raman",
    created: "Sep 16, 2026 · 15:47",
    description: "Data service intermittent since device board replacement.",
    aiSummary:
      "New IMEI detected; carrier profile still bound to prior hardware. Automated eSIM re-provision is eligible.",
    notes: [],
    timeline: [{ at: "15:47", label: "Case created" }],
    attachments: [],
  },
  {
    id: "FD-IT-10455",
    issue: "Body-worn camera dock not charging",
    requester: "Squad 41",
    requesterTitle: "FF D. Kim",
    requesterContact: "d.kim@firedept.example",
    asset: "DOCK-SQ41-06",
    assetModel: "Axon Dock 2",
    location: "Bronx — Squad 41 Quarters",
    category: "Hardware",
    priority: "Medium",
    status: "Waiting for User",
    assignedTo: "Dana Whitfield",
    created: "Sep 16, 2026 · 11:20",
    description: "Two of eight bays show amber fault light.",
    aiSummary:
      "Firmware mismatch on dock bays 3 and 6. Remote firmware push queued; requires station power cycle.",
    notes: [
      { author: "Dana Whitfield", at: "11:55", text: "Awaiting crew confirmation of power cycle." },
    ],
    timeline: [
      { at: "11:20", label: "Case created" },
      { at: "11:55", label: "Firmware push queued" },
    ],
    attachments: [],
  },
  {
    id: "FD-IT-10450",
    issue: "Station Wi-Fi degraded in apparatus bay",
    requester: "Engine Company 71",
    requesterTitle: "Lt. P. Moreau",
    requesterContact: "p.moreau@firedept.example",
    asset: "AP-E71-BAY-2",
    assetModel: "Cisco 9120AX",
    location: "Staten Island — Engine 71",
    category: "Connectivity",
    priority: "High",
    status: "Investigating",
    assignedTo: "Marcus Lee",
    created: "Sep 15, 2026 · 19:05",
    description: "Tablets drop Wi-Fi when apparatus doors are open.",
    aiSummary:
      "Access point radio utilization above 85% with high co-channel interference. Channel plan change recommended.",
    notes: [],
    timeline: [
      { at: "19:05", label: "Case created" },
      { at: "19:44", label: "RF survey scheduled" },
    ],
    attachments: ["rf-survey-request.pdf"],
  },
  {
    id: "FD-IT-10446",
    issue: "Duplicate asset tag detected in CMDB",
    requester: "Logistics — Fort Totten",
    requesterTitle: "Spec. H. Duarte",
    requesterContact: "h.duarte@firedept.example",
    asset: "LOG-SCBA-8890",
    assetModel: "Scott X3 Pro SCBA",
    location: "Queens — Fort Totten",
    category: "Inventory",
    priority: "Low",
    status: "Resolved",
    assignedTo: "Dana Whitfield",
    created: "Sep 15, 2026 · 10:12",
    description: "Two records share the same equipment tag after a bulk import.",
    aiSummary: "Duplicate merged; surviving record retains service history from the older entry.",
    notes: [
      { author: "Dana Whitfield", at: "10:58", text: "Records merged and audit note added." },
    ],
    timeline: [
      { at: "10:12", label: "Case created" },
      { at: "10:58", label: "Duplicate merged — case resolved" },
    ],
    attachments: [],
  },
  {
    id: "FD-IT-10441",
    issue: "MDT will not boot after update",
    requester: "Ladder Company 132",
    requesterTitle: "FF C. Rivera",
    requesterContact: "c.rivera@firedept.example",
    asset: "MDT-L132-0448",
    assetModel: "Getac F110",
    location: "Brooklyn — Ladder 132",
    category: "Hardware",
    priority: "Critical",
    status: "Escalated",
    assignedTo: "Priya Raman",
    created: "Sep 15, 2026 · 05:33",
    description: "Unit stuck on recovery screen following overnight OS update.",
    aiSummary:
      "Update ring 4 rollout shows 3 similar failures. Rollback image staged; field swap unit reserved.",
    notes: [
      { author: "Priya Raman", at: "06:02", text: "Spare unit dispatched from Fort Totten depot." },
    ],
    timeline: [
      { at: "05:33", label: "Case created" },
      { at: "05:48", label: "Escalated to platform engineering" },
      { at: "06:02", label: "Spare device dispatched" },
    ],
    attachments: [],
  },
  {
    id: "FD-IT-10437",
    issue: "Account lockout after password reset",
    requester: "EMS Station 18",
    requesterTitle: "EMT R. Santos",
    requesterContact: "r.santos@firedept.example",
    asset: "N/A",
    assetModel: "Identity account",
    location: "Bronx — Station 18",
    category: "Access",
    priority: "Medium",
    status: "Resolved",
    assignedTo: "Alex Johnson",
    created: "Sep 14, 2026 · 22:47",
    description: "Repeated lockouts on shared station workstation.",
    aiSummary:
      "Cached credential on station kiosk caused repeated failed logons. Cache cleared, account unlocked.",
    notes: [],
    timeline: [
      { at: "22:47", label: "Case created" },
      { at: "23:05", label: "Account unlocked — case resolved" },
    ],
    attachments: [],
  },
];

export const kpis = [
  {
    label: "Open Cases",
    value: 42,
    trend: "+8%",
    direction: "up" as const,
    hint: "vs. last 7 days",
  },
  {
    label: "Critical Cases",
    value: 6,
    trend: "-12%",
    direction: "down" as const,
    hint: "vs. last 7 days",
  },
  {
    label: "Connectivity Issues",
    value: 11,
    trend: "Stable",
    direction: "flat" as const,
    hint: "FirstNet + Verizon",
  },
  {
    label: "Device Recovery Requests",
    value: 8,
    trend: "+3",
    direction: "up" as const,
    hint: "active this shift",
  },
  {
    label: "Avg. Resolution Time",
    value: "2h 18m",
    trend: "-9%",
    direction: "down" as const,
    hint: "rolling 30 days",
  },
];

export const automationPanels = [
  {
    key: "workspace-one",
    title: "Workspace ONE",
    subtitle: "GPS & sound ping recovery",
    health: "Operational",
    metrics: [
      { label: "Devices monitored", value: "4,318" },
      { label: "Missing devices", value: "8" },
      { label: "Successful sound pings", value: "37" },
      { label: "Recovery rate", value: "92%", progress: 92 },
    ],
  },
  {
    key: "esim",
    title: "eSIM Refresh",
    subtitle: "FirstNet & Verizon recovery",
    health: "Degraded",
    metrics: [
      { label: "Connectivity incidents", value: "11" },
      { label: "Refreshes triggered", value: "26" },
      { label: "Successful recoveries", value: "23" },
      { label: "Failed refreshes", value: "3", progress: 88 },
    ],
  },
  {
    key: "inventory",
    title: "Smart Inventory",
    subtitle: "CMDB tag validation",
    health: "Operational",
    metrics: [
      { label: "Tags validated", value: "1,942" },
      { label: "Invalid tags detected", value: "118" },
      { label: "Corrections suggested", value: "109" },
      { label: "Corrections accepted", value: "96", progress: 88 },
    ],
  },
];

export const casesByCategory = [
  { name: "Device Recovery", value: 14 },
  { name: "Connectivity", value: 11 },
  { name: "Hardware", value: 8 },
  { name: "Software", value: 6 },
  { name: "Inventory", value: 5 },
  { name: "Access", value: 4 },
];

export const casesByPriority = [
  { name: "Critical", value: 6 },
  { name: "High", value: 13 },
  { name: "Medium", value: 15 },
  { name: "Low", value: 8 },
];

export const casesByLocation = [
  { name: "Manhattan", value: 15 },
  { name: "Brooklyn", value: 11 },
  { name: "Bronx", value: 8 },
  { name: "Queens", value: 6 },
  { name: "Staten Island", value: 2 },
];

export const resolutionTrend = [
  { day: "Mon", hours: 3.1 },
  { day: "Tue", hours: 2.8 },
  { day: "Wed", hours: 2.9 },
  { day: "Thu", hours: 2.4 },
  { day: "Fri", hours: 2.3 },
  { day: "Sat", hours: 2.0 },
  { day: "Sun", hours: 2.3 },
];

export const deviceIssueFrequency = [
  { name: "ePCR Tablet", value: 21 },
  { name: "MDT", value: 17 },
  { name: "Handheld Radio", value: 9 },
  { name: "Station AP", value: 7 },
  { name: "Printer", value: 4 },
];

export const cmdbAssets = [
  { tag: "RSC-1-THRM-114", model: "FLIR K55 Thermal Camera", unit: "Rescue 1" },
  { tag: "Tablet-EPCR-2391", model: "Panasonic Toughbook FZ-A3", unit: "Engine 23" },
  { tag: "MDT-L9-0771", model: "Getac F110", unit: "Ladder 9" },
];

export const conversationHistory = [
  {
    id: "c1",
    title: "Tablet Missing",
    preview: "ePCR tablet left at Bellevue ED",
    at: "Today · 07:42",
  },
  {
    id: "c2",
    title: "Connectivity Issue",
    preview: "FirstNet data dropped on MDT",
    at: "Yesterday · 18:10",
  },
  {
    id: "c3",
    title: "Equipment Tag Issue",
    preview: "Tag RSC1THRM114 rejected",
    at: "Sep 17 · 16:04",
  },
  { id: "c4", title: "New Conversation", preview: "No messages yet", at: "—" },
];
