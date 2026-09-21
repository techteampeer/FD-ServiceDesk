import React, { useState } from "react";
import { identifyUser, getUserDevices, resetSim, reportTicket } from "../api.js";

export default function UserIntake() {
  // Step state: 'IDENTIFY' | 'SELECT_DEVICE' | 'ACTION' | 'SUCCESS'
  const [step, setStep] = useState("IDENTIFY");
  const [badgeId, setBadgeId] = useState("");
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  
  // Interaction & Report States
  const [issueTitle, setIssueTitle] = useState("");
  const [issueText, setIssueText] = useState("");
  const [category, setCategory] = useState("Hardware");
  const [urgency, setUrgency] = useState(3);
  
  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ticketResult, setTicketResult] = useState(null);

  // 1. Step 1: Identify Firefighter
  const handleIdentify = async (e) => {
    e.preventDefault();
    if (!badgeId.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const userData = await identifyUser(badgeId.trim());
      setUser(userData.user);

      // Fetch user's assigned devices
      const userDevices = await getUserDevices(userData.user.id);
      setDevices(userDevices.devices || []);
      setStep("SELECT_DEVICE");
    } catch (err) {
      setError(err.message || "Failed to identify user. Please check the Badge ID.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Step 2: Handle Automated eSIM Reset
  const handleResetSim = async (device) => {
    setLoading(true);
    setError(null);

    try {
      const result = await resetSim({
        userId: user.id,
        deviceId: device.id,
        deviceTag: device.name || "FDNY-DEVICE",
        itemType: device.itemType // "Computer" or "Phone"
      });

      setTicketResult(result);
      setStep("SUCCESS");
    } catch (err) {
      setError(err.message || "Failed to trigger eSIM reset.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Step 3: Handle Dynamic Agent-Assisted Issue Report
  const handleReportIssue = async (e) => {
    e.preventDefault();
    if (!issueText.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await reportTicket({
        title: issueTitle || `[${selectedDevice?.name || "General"}] Kiosk Issue Report`,
        text: issueText,
        category: category,
        urgency: parseInt(urgency, 10),
        userId: user.id,
        locationId: selectedDevice?.locations_id || null,
        deviceId: selectedDevice?.id || null,
        deviceTag: selectedDevice?.name || "FDNY-DEVICE",
        itemType: selectedDevice?.itemType || "Computer"
      });

      setTicketResult(result);
      setStep("SUCCESS");
    } catch (err) {
      setError(err.message || "Failed to submit ticket report.");
    } finally {
      setLoading(false);
    }
  };

  // Reset Kiosk Flow
  const handleResetFlow = () => {
    setStep("IDENTIFY");
    setBadgeId("");
    setUser(null);
    setDevices([]);
    setSelectedDevice(null);
    setIssueTitle("");
    setIssueText("");
    setTicketResult(null);
    setError(null);
  };

  return (
    <div className="kiosk-container" style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h2>FDNY Kiosk Self-Service Portal</h2>

      {error && (
        <div style={{ padding: "10px", backgroundColor: "#ffdddd", color: "#a00", marginBottom: "15px" }}>
          {error}
        </div>
      )}

      {/* STEP 1: IDENTIFY USER */}
      {step === "IDENTIFY" && (
        <form onSubmit={handleIdentify}>
          <h3>Scan Badge or Enter Identifier</h3>
          <input
            type="text"
            placeholder="Enter Badge ID (e.g., 10101)"
            value={badgeId}
            onChange={(e) => setBadgeId(e.target.value)}
            disabled={loading}
            style={{ padding: "10px", width: "100%", fontSize: "16px", marginBottom: "10px" }}
          />
          <button type="submit" disabled={loading} style={{ padding: "10px 20px" }}>
            {loading ? "Authenticating..." : "Identify"}
          </button>
        </form>
      )}

      {/* STEP 2: SELECT DEVICE AND ACTION */}
      {step === "SELECT_DEVICE" && user && (
        <div>
          <h3>Welcome, {user.realname || user.name}</h3>
          <p>Assigned Station/Unit: {user.phone2 || "FDNY Unit"}</p>
          <h4>Select Equipment:</h4>

          {devices.length === 0 ? (
            <p>No assigned devices found.</p>
          ) : (
            <div style={{ display: "grid", gap: "15px", marginBottom: "20px" }}>
              {devices.map((dev) => (
                <div key={`${dev.itemType}-${dev.id}`} style={{ border: "1px solid #ccc", padding: "15px" }}>
                  <strong>{dev.name}</strong> ({dev.itemType}) - {dev.unit}
                  <div style={{ marginTop: "10px" }}>
                    <button
                      onClick={() => handleResetSim(dev)}
                      disabled={loading}
                      style={{ marginRight: "10px", backgroundColor: "#ff9800", color: "#fff", padding: "8px" }}
                    >
                      Quick Reset eSIM
                    </button>
                    <button
                      onClick={() => {
                        setSelectedDevice(dev);
                        setStep("ACTION");
                      }}
                      disabled={loading}
                      style={{ padding: "8px" }}
                    >
                      Report Issue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={handleResetFlow}>Cancel / Exit</button>
        </div>
      )}

      {/* STEP 3: DYNAMIC REPORT FORM / AGENT INTERACTION */}
      {step === "ACTION" && selectedDevice && (
        <form onSubmit={handleReportIssue}>
          <h3>Report Issue for {selectedDevice.name}</h3>

          <div style={{ marginBottom: "10px" }}>
            <label>Title / Subject:</label>
            <input
              type="text"
              placeholder="e.g., Touchscreen Unresponsive"
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "10px" }}>
            <label>Category (Inferred by Interaction):</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <div style={{ marginBottom: "10px" }}>
            <label>Issue Description / Agent Transcript:</label>
            <textarea
              rows={4}
              placeholder="Describe the issue..."
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
              required
              style={{ width: "100%", padding: "8px" }}
            />
          </div>

          <button type="submit" disabled={loading} style={{ padding: "10px 20px" }}>
            {loading ? "Submitting..." : "Submit Ticket"}
          </button>
          <button type="button" onClick={() => setStep("SELECT_DEVICE")} style={{ marginLeft: "10px" }}>
            Back
          </button>
        </form>
      )}

      {/* STEP 4: SUCCESS CONFIRMATION */}
      {step === "SUCCESS" && ticketResult && (
        <div style={{ border: "2px solid green", padding: "20px", borderRadius: "5px" }}>
          <h3 style={{ color: "green" }}>Ticket Created Successfully!</h3>
          <p><strong>Ticket ID:</strong> {ticketResult.ticketId}</p>
          <p><strong>Status:</strong> {ticketResult.status}</p>
          <p><strong>Summary:</strong> {ticketResult.summary}</p>
          <button onClick={handleResetFlow} style={{ padding: "10px 20px", marginTop: "15px" }}>
            Done / Next Firefighter
          </button>
        </div>
      )}
    </div>
  );
}
