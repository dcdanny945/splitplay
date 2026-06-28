import nodemailer from "nodemailer";
import type { PaymentMode } from "./pricing";

// Sends confirmation emails through Gmail (SMTP) using an App Password, so it can
// email any recipient. Set GMAIL_USER + GMAIL_APP_PASSWORD in the environment.
// App passwords are 16 chars; spaces (if any) are stripped automatically.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

const transporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      })
    : null;

export type ConfirmationEmail = {
  to: string;
  name: string;
  eventName: string;
  amount: number; // AUD charged
  date?: string | null;
  location?: string | null;
  mode: PaymentMode;
};

/**
 * Sends the "payment successful" confirmation. No-ops (with a warning) if Gmail
 * credentials are not configured, so the payment flow never fails on email.
 */
export async function sendConfirmationEmail(opts: ConfirmationEmail): Promise<boolean> {
  if (!transporter) {
    console.warn(`[email] GMAIL_USER/GMAIL_APP_PASSWORD not set — skipping confirmation to ${opts.to}`);
    return false;
  }
  const from = process.env.EMAIL_FROM || `Bball Court Fee <${GMAIL_USER}>`;
  const amount = `$${opts.amount.toFixed(2)} AUD`;
  const when = opts.mode === "fixed" ? "Your payment is complete." : "Settlement is done and your card has been charged.";

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="font-size:20px;font-weight:800;color:#0d9488">Bball Court Fee</div>
    <h1 style="font-size:18px;margin:16px 0 4px">Payment confirmed ✅</h1>
    <p style="color:#475569;font-size:14px;margin:0 0 20px">Hi ${escapeHtml(opts.name)}, ${when}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8">Event</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${escapeHtml(opts.eventName)}</div>
      ${opts.date ? `<div style="font-size:13px;color:#64748b;margin-top:8px">Date: ${escapeHtml(opts.date)}</div>` : ""}
      ${opts.location ? `<div style="font-size:13px;color:#64748b;margin-top:2px">Location: ${escapeHtml(opts.location)}</div>` : ""}
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;color:#64748b">Amount charged</span>
        <span style="font-size:22px;font-weight:800;color:#0d9488">${amount}</span>
      </div>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">This amount includes the Stripe processing fee. Thanks for playing!</p>
  </div>`;

  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: `Payment confirmed — ${opts.eventName}`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}

export type RegistrationEmail = {
  to: string;
  name: string;
  eventName: string;
  date?: string | null;
  location?: string | null;
  settlementLabel: string; // e.g. "Thu, 18 Jun, 8:00 pm AEST"
  withdrawUrl: string;
};

/**
 * Sent right after a card is saved (split mode). Tells the registrant they're in,
 * when they'll be charged, and gives them a personal link to withdraw beforehand.
 */
export async function sendRegistrationEmail(opts: RegistrationEmail): Promise<boolean> {
  if (!transporter) {
    console.warn(`[email] credentials not set — skipping registration email to ${opts.to}`);
    return false;
  }
  const from = process.env.EMAIL_FROM || `Bball Court Fee <${GMAIL_USER}>`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="font-size:20px;font-weight:800;color:#0d9488">Bball Court Fee</div>
    <h1 style="font-size:18px;margin:16px 0 4px">You're registered ✅</h1>
    <p style="color:#475569;font-size:14px;margin:0 0 16px">Hi ${escapeHtml(opts.name)}, your spot is saved. Your card is stored securely on Stripe — you won't be charged until settlement.</p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;margin:0 0 20px">
      <p style="color:#92400e;font-size:14px;font-weight:700;margin:0">⚠️ Please ensure you have sufficient balance before settlement in order to secure your spot.</p>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:18px">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8">Event</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${escapeHtml(opts.eventName)}</div>
      ${opts.date ? `<div style="font-size:13px;color:#64748b;margin-top:8px">Date: ${escapeHtml(opts.date)}</div>` : ""}
      ${opts.location ? `<div style="font-size:13px;color:#64748b;margin-top:2px">Location: ${escapeHtml(opts.location)}</div>` : ""}
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0">
        <div style="font-size:13px;color:#64748b">You'll be charged your share at:</div>
        <div style="font-size:15px;font-weight:700;color:#0d9488;margin-top:2px">${escapeHtml(opts.settlementLabel)}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px">The total cost is split evenly among everyone still registered at that time.</div>
      </div>
    </div>
    <div style="margin-top:20px;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:14px">
      <div style="font-size:13px;color:#991b1b;font-weight:600">Can't make it?</div>
      <div style="font-size:13px;color:#7f1d1d;margin:6px 0 12px">Withdraw before settlement and you won't be charged.</div>
      <a href="${opts.withdrawUrl}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:10px">Withdraw my registration</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;margin-top:20px">Keep this email — it's your personal withdraw link.</p>
  </div>`;

  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: `You're registered — ${opts.eventName}`,
      html,
    });
    return true;
  } catch (err) {
    console.error("[email] registration send failed:", err);
    return false;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
  );
}
