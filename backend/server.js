import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const NITRO_PORT = process.env.NITRO_PORT || 3000;

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
// 2. Client Static Assets (JS, CSS, Images)
// ==========================================
let publicPath = path.join(__dirname, "frontend", ".output", "public");
if (!fs.existsSync(publicPath)) {
  publicPath = path.join(__dirname, "..", "frontend", ".output", "public");
}

if (fs.existsSync(publicPath)) {
  console.log(`[INFO]: Serving client static assets from: ${publicPath}`);
  app.use(express.static(publicPath));
}

// ==========================================
// 3. Launch Nitro Node Server Process
// ==========================================
let nitroPath = path.join(__dirname, "frontend", ".output", "server", "index.mjs");
if (!fs.existsSync(nitroPath)) {
  nitroPath = path.join(__dirname, "..", "frontend", ".output", "server", "index.mjs");
}

if (fs.existsSync(nitroPath)) {
  const nitroDir = path.dirname(nitroPath);
  console.log(`[INFO]: Launching Nitro Node server on port ${NITRO_PORT}...`);

  const nitroProcess = spawn("node", ["index.mjs"], {
    cwd: nitroDir,
    env: {
      ...process.env,
      PORT: NITRO_PORT.toString(),
      NITRO_PORT: NITRO_PORT.toString(),
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1"
    },
    stdio: "inherit"
  });

  nitroProcess.on("error", (err) => {
    console.error("[ERROR]: Failed to start Nitro server process:", err);
  });

  nitroProcess.on("exit", (code, signal) => {
    console.warn(`[WARN]: Nitro server process exited with code ${code} and signal ${signal}`);
  });
} else {
  console.warn(`[WARNING]: Nitro server entry not found at: ${nitroPath}`);
}

// ==========================================
// 4. Reverse Proxy Web UI Requests to Nitro SSR
// ==========================================
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api")) return next();

  const targetUrl = `http://127.0.0.1:${NITRO_PORT}${req.originalUrl || req.url}`;

  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else headers.set(key, value);
      }
    }

    const init = {
      method: req.method,
      headers,
      redirect: "manual"
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const proxyRes = await fetch(targetUrl, init);

    res.status(proxyRes.status);
    proxyRes.headers.forEach((val, key) => {
      if (key.toLowerCase() !== "content-encoding") {
        res.setHeader(key, val);
      }
    });

    if (proxyRes.body) {
      const reader = proxyRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).send(`
      <h2>FDNY Kiosk SSR Connection Pending</h2>
      <p>Express is running on port ${PORT}, waiting for Nitro SSR on port ${NITRO_PORT}...</p>
      <p>Details: ${err.message}</p>
    `);
  }
});

// ==========================================
// 5. Start Express Server
// ==========================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`FDNY Kiosk Express Server running on http://0.0.0.0:${PORT}`);
});