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

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
  );
}
