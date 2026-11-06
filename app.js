import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import Subscriber from "./models/Subscriber.js";
import { startDailyDigest } from "./services/dailyDigest.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN || "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean)
);

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "16kb" }));

const signupLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Too many signup attempts. Please wait and try again.",
  },
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? "connected" : "unavailable",
  });
});

app.post("/api/waitlist", signupLimit, async (request, response) => {
  if (mongoose.connection.readyState !== 1) {
    response.status(503).json({
      ok: false,
      error: "Waitlist storage is temporarily unavailable.",
    });
    return;
  }

  const email =
    typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";
  const consent = request.body?.consent === true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    response.status(400).json({ ok: false, error: "Enter a valid email address." });
    return;
  }

  if (!consent) {
    response.status(400).json({ ok: false, error: "Email consent is required." });
    return;
  }

  try {
    await Subscriber.create({
      email,
      consent: true,
      consentAt: new Date(),
      source: "oddkin-site",
    });
    response.status(201).json({ ok: true, alreadySubscribed: false });
  } catch (error) {
    if (error?.code === 11000) {
      response.status(200).json({ ok: true, alreadySubscribed: true });
      return;
    }

    console.error("Waitlist signup could not be saved:", error);
    response.status(500).json({
      ok: false,
      error: "We could not save this signup. Please try again later.",
    });
  }
});

app.use((error, _request, response, _next) => {
  if (error?.message === "Origin not allowed.") {
    response.status(403).json({ ok: false, error: "This website origin is not allowed." });
    return;
  }

  if (error?.type === "entity.parse.failed") {
    response.status(400).json({ ok: false, error: "Invalid JSON request." });
    return;
  }

  console.error("API request failed:", error);
  response.status(500).json({ ok: false, error: "Unexpected server error." });
});

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("MONGODB_URI is not set; waitlist writes are disabled.");
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    await Subscriber.init();
    console.info("Connected to MongoDB; waitlist storage is ready.");
    startDailyDigest();
  } catch (error) {
    console.error("MongoDB connection failed; waitlist writes are disabled:", error.message);
  }
}

mongoose.connection.on("error", error => {
  console.error("MongoDB connection error:", error.message);
});

const server = app.listen(port, "0.0.0.0", () => {
  console.info(`Oddkin API listening on port ${port}.`);
  void connectDatabase();
});

function shutDown() {
  server.close(() => {
    void mongoose.disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
