import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const NITRO_PORT = process.env.NITRO_PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Spawn Nitro SSR Server with explicit logging listeners and 0.0.0.0 binding
const nitroDir = path.join(__dirname, "frontend", ".output", "server");

console.log(`Starting Nitro SSR process from: ${nitroDir}`);

const nitroProcess = spawn("node", ["index.mjs"], {
  cwd: nitroDir,
  env: {
    ...process.env,
    PORT: NITRO_PORT.toString(),
    NITRO_PORT: NITRO_PORT.toString(),
    HOST: "0.0.0.0",
    NITRO_HOST: "0.0.0.0",
    NODE_ENV: "production"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

nitroProcess.stdout.on("data", (data) => {
  console.log(`[Nitro STDOUT]: ${data.toString().trim()}`);
});

nitroProcess.stderr.on("data", (data) => {
  console.error(`[Nitro STDERR]: ${data.toString().trim()}`);
});

nitroProcess.on("exit", (code, signal) => {
  console.error(`Nitro SSR process exited with code ${code} and signal ${signal}`);
});

// Import Backend API Routes
import identifyRoute from "./src/routes/identify.js";
import devicesRoute from "./src/routes/devices.js";
import locationRoute from "./src/routes/location.js";
import resetSimRoute from "./src/routes/resetSim.js";
import reportRoute from "./src/routes/report.js";

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

// 3. Serve Static Assets directly via Express
const publicPath = path.join(__dirname, "frontend", ".output", "public");
app.use(express.static(publicPath));

// 4. Reverse Proxy UI Requests to Nitro SSR
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
    res.status(502).send("SSR Proxy Error - Nitro process unreachable.");
  }
});

// 5. Delay Express port binding until Nitro is active
async function waitForNitro(url, maxRetries = 20, intervalMs = 500) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      await fetch(url, { method: "HEAD" });
      console.log("Nitro SSR process is ready on port 3000.");
      return true;
    } catch (e) {
      console.log(`Waiting for Nitro process on port 3000 (attempt ${i}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  console.warn("Nitro readiness check timed out. Starting Express server anyway.");
  return false;
}

async function startServer() {
  await waitForNitro(`http://127.0.0.1:${NITRO_PORT}`);
  app.listen(PORT, () => {
    console.log(`FDNY Kiosk Express Server running on http://localhost:${PORT}`);
  });
}

startServer();