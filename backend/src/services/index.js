/**
 * Tool registry for the FDNY service desk.
 *
 * Single place where every callable action is described. The HTTP routes are
 * thin wrappers over these same functions, and the Gemini agent will consume
 * this registry to build its function declarations - so a tool is added once.
 *
 * `simulated: true` means the action fabricates its result locally. Asset,
 * location and ticket data is always live GLPI.
 */
import {
  getDeviceById,
  getDeviceByTag,
  getDeviceSim,
  listFleet,
  resolveDevice,
  validateAssetTag,
} from "./assets.js";
import { escalateToTicket, getTicket, listTickets } from "./tickets.js";
import { lookupDevice } from "./workspaceone.mock.js";
import { connectivityDiagnostic, esimRefresh } from "./carrier.mock.js";

export {
  getDeviceById,
  getDeviceByTag,
  getDeviceSim,
  listFleet,
  resolveDevice,
  validateAssetTag,
  escalateToTicket,
  getTicket,
  listTickets,
  lookupDevice,
  connectivityDiagnostic,
  esimRefresh,
};

export const TOOLS = [
  {
    name: "listFleet",
    description: "List every FDNY asset - Computer tablets and Phone handsets - with owner, location, status and BTDS inventory tag.",
    simulated: false,
    parameters: { limit: "number (optional)" },
    fn: listFleet,
  },
  {
    name: "resolveDevice",
    description: "Find one FDNY asset (Computer or Phone) by GLPI id, BTDS tag, or display name (in that order of trust).",
    simulated: false,
    parameters: { deviceId: "number", assetTag: "string", name: "string" },
    fn: resolveDevice,
  },
  {
    name: "getDeviceSim",
    description: "Read the SIM/eSIM, line, MSISDN, ICCID and carrier (FirstNet / Verizon Frontline) recorded against an asset, when GLPI holds one.",
    simulated: false,
    parameters: { deviceId: "number (required)" },
    fn: getDeviceSim,
  },
  {
    name: "lookupDevice",
    description: "Locate a device and its station, including seeded GPS. Asset and location are live; the last-seen framing is simulated.",
    simulated: true,
    parameters: { deviceId: "number", assetTag: "string", name: "string", simulate: "success|failure" },
    fn: lookupDevice,
  },
  {
    name: "connectivityDiagnostic",
    description: "SIMULATED carrier diagnostic over the real seeded SIM/carrier link. Returns healthy | degraded | failure.",
    simulated: true,
    parameters: { deviceId: "number", assetTag: "string", simulate: "healthy|degraded|failure" },
    fn: connectivityDiagnostic,
  },
  {
    name: "esimRefresh",
    description: "SIMULATED eSIM re-provisioning. Fails on physical-SIM assets, which have no downloadable profile.",
    simulated: true,
    parameters: { deviceId: "number", assetTag: "string", simulate: "healthy|degraded|failure" },
    fn: esimRefresh,
  },
  {
    name: "validateAssetTag",
    description: "Validate a submitted BTDSYYYY###### tag against live GLPI assets. Exact match first, then typo suggestions. Never writes.",
    simulated: false,
    parameters: { submitted: "string (required)" },
    fn: validateAssetTag,
  },
  {
    name: "listTickets",
    description: "List FDNY tickets with status, category, requester, assigned technician and linked asset. Optionally filter by requester.",
    simulated: false,
    parameters: { userId: "number (optional)", status: "number (optional)", limit: "number (optional)" },
    fn: listTickets,
  },
  {
    name: "getTicket",
    description: "Fetch one FDNY ticket by its real GLPI id.",
    simulated: false,
    parameters: { id: "number (required)" },
    fn: getTicket,
  },
  {
    name: "escalateToTicket",
    description: "Create a GLPI ticket for the requester, linked to the asset using its real itemtype, when an automated action could not resolve the issue.",
    simulated: false,
    writes: true,
    parameters: {
      userId: "number (required)",
      text: "string (required)",
      title: "string",
      category: "string",
      urgency: "1-5",
      deviceId: "number",
      assetTag: "string",
      failedAction: "string",
    },
    fn: escalateToTicket,
  },
];

export const toolByName = (name) => TOOLS.find((t) => t.name === name) ?? null;

/** Manifest for the agent / for GET /api/tools. Functions are stripped. */
export const toolManifest = () =>
  TOOLS.map(({ fn, ...rest }) => rest); // eslint-disable-line no-unused-vars
