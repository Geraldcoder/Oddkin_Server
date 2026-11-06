import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import Subscriber from "../models/Subscriber.js";

const csvField = value => {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};

async function exportSubscribers() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Set MONGODB_URI in server/.env before exporting subscribers.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  await Subscriber.init();
  const subscribers = await Subscriber.find({ consent: true })
    .sort({ createdAt: 1 })
    .lean();
  const csv = [
    ["email", "signedUpAt", "consentAt", "source"].map(csvField).join(","),
    ...subscribers.map(subscriber =>
      [
        subscriber.email,
        subscriber.createdAt?.toISOString(),
        subscriber.consentAt?.toISOString(),
        subscriber.source,
      ]
        .map(csvField)
        .join(",")
    ),
  ].join("\r\n");

  const outputDirectory = path.join(process.cwd(), "exports");
  const filename = `oddkin-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, filename);
  await writeFile(outputPath, `${csv}\r\n`, "utf8");
  console.info(`Exported ${subscribers.length} subscriber(s) to ${outputPath}`);
  await mongoose.disconnect();
}

exportSubscribers().catch(async error => {
  console.error("Subscriber export failed:", error.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
