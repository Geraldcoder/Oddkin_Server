import cron from "node-cron";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import Subscriber from "../models/Subscriber.js";

const DIGEST_STATE_ID = "oddkin-waitlist-daily-digest";
const digestStateSchema = new mongoose.Schema(
  {
    _id: { type: String },
    lastSentAt: { type: Date, default: () => new Date(0) },
  },
  { versionKey: false, collection: "digeststate" }
);
const DigestState =
  mongoose.models.DigestState || mongoose.model("DigestState", digestStateSchema);

const csvField = value => {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
};
const toCsv = subscribers =>
  [
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

function smtpSettings() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) return null;

  return {
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    from: SMTP_FROM,
  };
}

export async function sendDailyDigest() {
  const settings = smtpSettings();
  if (!settings) {
    console.warn("Daily waitlist digest skipped: SMTP settings are incomplete.");
    return { sent: false, reason: "smtp-not-configured" };
  }

  if (mongoose.connection.readyState !== 1) {
    console.warn("Daily waitlist digest skipped: MongoDB is not connected.");
    return { sent: false, reason: "database-unavailable" };
  }

  const state = await DigestState.findById(DIGEST_STATE_ID).lean();
  const lastSentAt = state?.lastSentAt || new Date(0);
  const cutoff = new Date();
  const signups = await Subscriber.find({
    consent: true,
    createdAt: { $gt: lastSentAt, $lte: cutoff },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (signups.length === 0) {
    await DigestState.updateOne(
      { _id: DIGEST_STATE_ID },
      { $set: { lastSentAt: cutoff } },
      { upsert: true }
    );
    return { sent: false, reason: "no-new-signups" };
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.auth,
  });

  try {
    await transporter.sendMail({
      from: settings.from,
      to: process.env.ADMIN_NOTIFICATION_EMAIL || "geradug99@gmail.com",
      subject: `Oddkin waitlist: ${signups.length} new signup${signups.length === 1 ? "" : "s"}`,
      text: `There ${signups.length === 1 ? "is" : "are"} ${signups.length} new consented Oddkin waitlist signup${signups.length === 1 ? "" : "s"}. The addresses and consent timestamps are attached as a CSV.`,
      attachments: [
        {
          filename: `oddkin-waitlist-${cutoff.toISOString().slice(0, 10)}.csv`,
          content: toCsv(signups),
          contentType: "text/csv; charset=utf-8",
        },
      ],
    });

    await DigestState.updateOne(
      { _id: DIGEST_STATE_ID },
      { $set: { lastSentAt: cutoff } },
      { upsert: true }
    );

    console.info(`Sent daily Oddkin waitlist digest with ${signups.length} signup(s).`);
    return { sent: true, count: signups.length };
  } finally {
    transporter.close();
  }
}

export function startDailyDigest() {
  const expression = process.env.DIGEST_CRON || "0 8 * * *";
  const timezone = process.env.DIGEST_TIMEZONE || "UTC";

  try {
    cron.schedule(
      expression,
      () => {
        void sendDailyDigest().catch(error => {
          console.error("Daily waitlist digest failed; it will retry at the next run:", error);
        });
      },
      { timezone }
    );
    console.info(`Daily waitlist digest scheduled (${expression}, ${timezone}).`);
  } catch (error) {
    console.error("Daily waitlist digest schedule is invalid:", error.message);
  }
}
