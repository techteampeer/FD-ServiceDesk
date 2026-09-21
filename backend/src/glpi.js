import fetch from "node-fetch";

const API_URL = process.env.GLPI_BASE_URL || "https://glpi.peer-consulting.com/apirest.php";
const APP_TOKEN = process.env.GLPI_APP_TOKEN;
const USER_TOKEN = process.env.GLPI_USER_TOKEN;
const ENTITY_ID = process.env.GLPI_ENTITY_ID || "1";

/**
 * Initializes a session in GLPI and retrieves the active session token.
 */
async function getSessionToken() {
  const res = await fetch(`${API_URL}/initSession`, {
    headers: {
      "App-Token": APP_TOKEN,
      "Authorization": `user_token ${USER_TOKEN}`
    }
  });
  if (!res.ok) throw new Error("Failed to authenticate with GLPI API");
  const data = await res.json();
  return data.session_token;
}

/**
 * Builds standard headers including the Active-Entity header for tenant isolation.
 */
async function getHeaders() {
  const sessionToken = await getSessionToken();
  return {
    "App-Token": APP_TOKEN,
    "Session-Token": sessionToken,
    "Content-Type": "application/json",
    "Active-Entity": ENTITY_ID
  };
}

/**
 * Identifies a user by Badge/Login and retrieves their full record and internal GLPI ID.
 */
export async function identifyUser(identifier) {
  const headers = await getHeaders();
  const searchUrl = `${API_URL}/search/User?criteria[0][field]=1&criteria[0][searchtype]=equals&criteria[0][value]=${identifier}&forcedisplay[0]=2`;
  
  const res = await fetch(searchUrl, { headers });
  const data = await res.json();

  if (!data.data || data.data.length === 0) return null;

  const userId = data.data[0]["2"];
  const userDetailRes = await fetch(`${API_URL}/User/${userId}`, { headers });
  return await userDetailRes.json();
}

/**
 * Fetches assigned Computers (Tablets) and Phones for a given user.
 */
export async function getUserDevices(userId) {
  const headers = await getHeaders();
  const devices = [];

  // Search for Computers where users_id == userId (field 70)
  const compUrl = `${API_URL}/search/Computer?criteria[0][field]=70&criteria[0][searchtype]=equals&criteria[0][value]=${userId}&forcedisplay[0]=2`;
  const compRes = await fetch(compUrl, { headers });
  const compData = await compRes.json();

  if (compData.data) {
    for (const item of compData.data) {
      const detail = await fetch(`${API_URL}/Computer/${item["2"]}`, { headers }).then(r => r.json());
      devices.push({ ...detail, itemType: "Computer" });
    }
  }

  // Search for Phones where users_id == userId
  const phoneUrl = `${API_URL}/search/Phone?criteria[0][field]=70&criteria[0][searchtype]=equals&criteria[0][value]=${userId}&forcedisplay[0]=2`;
  const phoneRes = await fetch(phoneUrl, { headers });
  const phoneData = await phoneRes.json();

  if (phoneData.data) {
    for (const item of phoneData.data) {
      const detail = await fetch(`${API_URL}/Phone/${item["2"]}`, { headers }).then(r => r.json());
      devices.push({ ...detail, itemType: "Phone" });
    }
  }

  return devices;
}

/**
 * Gets details for a location ID.
 */
export async function getLocation(locationId) {
  const headers = await getHeaders();
  const res = await fetch(`${API_URL}/Location/${locationId}`, { headers });
  if (!res.ok) throw new Error("Location not found");
  return await res.json();
}

/**
 * Searches for an ITIL Category by name or creates it dynamically under FDNY entity.
 */
export async function getOrCreateCategory(categoryName) {
  const headers = await getHeaders();
  const safeName = encodeURIComponent(categoryName);
  
  const searchUrl = `${API_URL}/search/ITILCategory?criteria[0][field]=14&criteria[0][searchtype]=equals&criteria[0][value]=${safeName}&forcedisplay[0]=2`;
  const res = await fetch(searchUrl, { headers });
  const data = await res.json();

  if (data.data && data.data.length > 0) {
    return data.data[0]["2"];
  }

  const createRes = await fetch(`${API_URL}/ITILCategory`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: {
        name: categoryName,
        entities_id: ENTITY_ID
      }
    })
  });

  const categoryData = await createRes.json();
  return categoryData.id;
}

/**
 * Creates a new Ticket in GLPI scoped to the target entity.
 */
export async function createTicket(payload) {
  const headers = await getHeaders();
  const ticketPayload = {
    input: {
      ...payload,
      entities_id: ENTITY_ID
    }
  };

  const res = await fetch(`${API_URL}/Ticket`, {
    method: "POST",
    headers,
    body: JSON.stringify(ticketPayload)
  });
  
  if (!res.ok) throw new Error("Failed to create ticket in GLPI");
  return await res.json();
}

/**
 * Links an asset (Computer or Phone) to a Ticket via Item_Ticket.
 */
export async function linkAssetToTicket(ticketId, itemType, itemId) {
  const headers = await getHeaders();
  const payload = {
    input: {
      tickets_id: ticketId,
      itemtype: itemType, // "Computer" or "Phone"
      items_id: itemId
    }
  };

  const res = await fetch(`${API_URL}/Item_Ticket`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  return await res.json();
}