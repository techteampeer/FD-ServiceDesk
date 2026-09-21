const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Helper to process HTTP responses and handle API errors gracefully.
 */
const handleResponse = async (response) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
  }
  return response.json();
};

/* ==========================================
 * 1. GLPI Production Endpoints
 * ========================================== */

// Identify User by Badge / ID
export const identifyUser = async (identifier) => {
  const response = await fetch(`${BASE_URL}/api/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier })
  });
  return handleResponse(response);
};

// Get Assigned Devices
export const getUserDevices = async (userId) => {
  const response = await fetch(`${BASE_URL}/api/devices/${userId}`);
  return handleResponse(response);
};

// Get Station Location Details
export const getLocation = async (locationId) => {
  const response = await fetch(`${BASE_URL}/api/location/${locationId}`);
  return handleResponse(response);
};

// Dispatch Automated eSIM / Cellular Reset
export const resetSim = async (payload) => {
  const response = await fetch(`${BASE_URL}/api/ticket/reset-sim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
};

// Report Incident / Agent Assisted Ticket
export const reportTicket = async (payload) => {
  const response = await fetch(`${BASE_URL}/api/ticket/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
};

/* ==========================================
 * 2. Stubs for Secondary / Legacy Components
 * (Satisfies Vite imports for TechConsole, Dashboard, etc.)
 * ========================================== */
export const intake = async (messages) => ({ status: "ok" });
export const getCase = async (key) => ({ id: key, title: "Sample Ticket", status: "Open" });
export const askCase = async (key, question) => ({ reply: "Agent processed query." });
export const resolveCase = async (key, decision, note) => ({ status: "Resolved" });
export const getQueue = async () => [];
export const getDashboard = async () => ({ total: 0, pending: 0 });
export const getInsight = async () => ({ insight: "GLPI integration active." });
