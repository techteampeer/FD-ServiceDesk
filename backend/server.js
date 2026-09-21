import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

import identifyRoute from "./src/routes/identify.js";
import devicesRoute from "./src/routes/devices.js";
import locationRoute from "./src/routes/location.js";
import resetSimRoute from "./src/routes/resetSim.js";
import reportRoute from "./src/routes/report.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const NITRO_PORT = process.env.NITRO_PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Spawn Nitro SSR Server on internal port 3000
const nitroPath = path.join(__dirname, "frontend", ".output", "server", "index.mjs");

const nitroProcess = spawn("node", [nitroPath], {
  env: {
    ...process.env,
    PORT: NITRO_PORT.toString(),
    HOST: "127.0.0.1",
    NODE_ENV: "production"
  },
  stdio: "inherit"
});

nitroProcess.on("error", (err) => {
  console.error("Failed to start Nitro SSR process:", err);
});

// 2. Backend API Routes
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

// 3. Proxy non-API UI requests to Nitro SSR on 127.0.0.1:3000
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api")) return next();

  try {
    const targetUrl = `http://127.0.0.1:${NITRO_PORT}${req.originalUrl || req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else headers.set(key, value);
      }
    }

    const fetchInit = {
      method: req.method,
      headers,
      redirect: "manual"
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      fetchInit.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const proxyRes = await fetch(targetUrl, fetchInit);

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
    console.error("Proxy error to Nitro SSR:", err);
    res.status(502).send("SSR Proxy Error - Nitro process starting up...");
  }
});

app.listen(PORT, () => {
  console.log(`FDNY Kiosk Express Server running on http://localhost:${PORT}`);
});