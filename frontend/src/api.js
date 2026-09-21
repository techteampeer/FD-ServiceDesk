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

/**
 * 1. Identify User by Badge / ID
 * POST /api/identify
 */
export const identifyUser = async (identifier) => {
  const response = await fetch(`${BASE_URL}/api/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier })
  });
  return handleResponse(response);
};

/**
 * 2. Get Assigned Devices (Computers & Phones)
 * GET /api/devices/:userId
 */
export const getUserDevices = async (userId) => {
  const response = await fetch(`${BASE_URL}/api/devices/${userId}`);
  return handleResponse(response);
};

/**
 * 3. Get Station Coordinates & Location Details
 * GET /api/location/:locationId
 */
export const getLocation = async (locationId) => {
  const response = await fetch(`${BASE_URL}/api/location/${locationId}`);
  return handleResponse(response);
};

/**
 * 4. Dispatch Automated eSIM / Cellular Reset
 * POST /api/ticket/reset-sim
 */
export const resetSim = async (payload) => {
  // Payload structure: { userId, deviceId, deviceTag, itemType }
  const response = await fetch(`${BASE_URL}/api/ticket/reset-sim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
};

/**
 * 5. Report Incident / AI Agent Assisted Issue
 * POST /api/ticket/report
 */
export const reportTicket = async (payload) => {
  // Payload structure: { title, text, category, urgency, userId, locationId, deviceId, deviceTag, itemType }
  const response = await fetch(`${BASE_URL}/api/ticket/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse(response);
};