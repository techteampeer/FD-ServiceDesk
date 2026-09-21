import express from "express";
import dotenv from "dotenv";
import cors from "cors";

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

// Register API Routes
app.use("/api/identify", identifyRoute);
app.use("/api/devices", devicesRoute);
app.use("/api/location", locationRoute);
app.use("/api/ticket/reset-sim", resetSimRoute);
app.use("/api/ticket/report", reportRoute);

app.listen(PORT, () => {
  console.log(`Backend Server running on http://localhost:${PORT}`);
});