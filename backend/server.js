import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 1. Backend API Routes
// ==========================================
import identifyRoute from "./src/routes/identify.js";
import devicesRoute from "./src/routes/devices.js";
import locationRoute from "./src/routes/location.js";
import resetSimRoute from "./src/routes/resetSim.js";
import reportRoute from "./src/routes/report.js";

app.use("/api/identify", identifyRoute);
app.use("/api/devices", devicesRoute);
app.use("/api/location", locationRoute);
app.use("/api/ticket/reset-sim", resetSimRoute);
app.use("/api/ticket/report", reportRoute);

app.get("/api/config", (req, res) => {
  res.json({
    lang: process.env.APP_LANG || "en",
    environment: "DEMO",
    entityId: process.env.GLPI_ENTITY_ID || "1"
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "FDNY API is running" });
});

// ==========================================
// 2. Serve Static Frontend (TanStack Public Assets)
// ==========================================
const publicPath = path.join(__dirname, "frontend", ".output", "public");

// Diagnostic: Check if public frontend directory exists
if (!fs.existsSync(publicPath)) {
  console.warn(`[WARNING]: Frontend public directory not found at: ${publicPath}`);
} else {
  console.log(`[INFO]: Serving static frontend from: ${publicPath}`);
}

// Serve all static files (CSS, JS, images, etc.)
app.use(express.static(publicPath));

// ==========================================
// 3. Catch-all Route for Client-Side Routing
// ==========================================
// Any request that is NOT an API request should return index.html.
// TanStack Router will handle the routing dynamically in the browser.
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found" });
  }
  
  res.sendFile(path.join(publicPath, "index.html"));
});

// ==========================================
// 4. Start the Server
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FDNY Kiosk Express Server running on http://0.0.0.0:${PORT}`);
});