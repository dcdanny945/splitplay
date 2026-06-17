"use client";

import { useEffect, useRef, useState } from "react";
import { calcCharge } from "@/lib/pricing";

// ---------- Shared types (mirror serializeEvent in lib/db.ts) ----------
export type UIParticipant = {
  id: string;
  name: string;
  joinedAt: string;
  paid: boolean;
  email?: string;
  chargeStatus?: "pending" | "charged" | "failed";
  amountCharged?: number;
};

export type UIEvent = {
  id: string;
  name: string;
  date: string | null;
  timeLabel: string | null;
  location: string | null;
  description: string | null;
  totalCost: number;
  maxParticipants: number;
  paymentMode: "split" | "fixed";
  cutoffTime: string | null;
  status: "open" | "settled" | "cancelled";
  visible: boolean;
  participants: UIParticipant[];
  waitlist: UIParticipant[];
};

export type NotificationState = { type: "success" | "info" | "error"; message: string } | null;

// ---------- Helpers ----------
function priceStrings(total: number, divisor: number) {
  const r = calcCharge(total, divisor);
  return { base: r.base.toFixed(2), fee: r.fee.toFixed(2), charge: r.charge.toFixed(2) };
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Settlement complete";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

const KNOWN_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "yahoo.com.au", "yahoo.co.uk", "yahoo.co.jp",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "mail.com", "zoho.com", "ymail.com", "gmx.com", "gmx.net",
  "fastmail.com", "tutanota.com", "protonmail.com", "proton.me",
  "qq.com", "163.com", "126.com", "googlemail.com",
  "deakin.edu.au", "unimelb.edu.au", "monash.edu", "rmit.edu.au",
  "swinburne.edu.au", "latrobe.edu.au", "vu.edu.au",
  "bigpond.com", "optusnet.com.au", "internode.on.net",
]);

function isValidEmail(email: string): { valid: boolean; reason: string } {
  const basic = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  if (!basic) return { valid: false, reason: "Invalid email format" };
  const domain = email.split("@")[1].toLowerCase();
  if (KNOWN_DOMAINS.has(domain)) return { valid: true, reason: "" };
  return { valid: false, reason: "Please use a recognized email provider (e.g. Gmail, Outlook, Yahoo)" };
}

// ---------- Notification ----------
export function Notification({ notification, onClear }: { notification: NotificationState; onClear: () => void }) {
  useEffect(() => {
    if (notification) {
      const t = setTimeout(onClear, 3500);
      return () => clearTimeout(t);
    }
  }, [notification, onClear]);
  if (!notification) return null;
  const bg = notification.type === "success" ? "#0d9488" : notification.type === "info" ? "#6366f1" : "#ef4444";
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "#fff", padding: "12px 24px", borderRadius: 12,
      fontSize: 14, fontWeight: 600, zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      animation: "slideDown 0.3s ease-out", maxWidth: "90vw", textAlign: "center",
    }}>
      {notification.message}
    </div>
  );
}

// ---------- Countdown (display only; settlement runs server-side) ----------
function CountdownTimer({ cutoffTime }: { cutoffTime: string }) {
  const [remaining, setRemaining] = useState(() => new Date(cutoffTime).getTime() - Date.now());
  useEffect(() => {
    const iv = setInterval(() => setRemaining(new Date(cutoffTime).getTime() - Date.now()), 1000);
    return () => clearInterval(iv);
  }, [cutoffTime]);

  const isUrgent = remaining > 0 && remaining < 3600000;
  return (
    <div style={{
      padding: "14px 18px", borderRadius: 14, marginTop: 16,
      background: remaining <= 0 ? "linear-gradient(135deg, #d1fae5, #ecfdf5)" : isUrgent ? "linear-gradient(135deg, #fef2f2, #fff1f2)" : "linear-gradient(135deg, #eff6ff, #f0f9ff)",
      border: `1px solid ${remaining <= 0 ? "#86efac" : isUrgent ? "#fca5a5" : "#93c5fd"}`,
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: remaining <= 0 ? "#065f46" : isUrgent ? "#991b1b" : "#1e40af" }}>
          {remaining <= 0 ? "Settling…" : "Settlement in"}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Sans', monospace", color: remaining <= 0 ? "#059669" : isUrgent ? "#dc2626" : "#1d4ed8", marginTop: 2 }}>
          {formatCountdown(remaining)}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", textAlign: "right" }}>
        {new Date(cutoffTime).toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" })}<br />
        {new Date(cutoffTime).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Melbourne" })} AEST
      </div>
    </div>
  );
}

// ---------- Cost display ----------
function CostDisplay({ total, count, mode, maxParticipants }: { total: number; count: number; mode: string; maxParticipants: number }) {
  const isFixed = mode === "fixed";
  const divisor = isFixed ? maxParticipants : count;
  const { base, fee, charge } = priceStrings(total, divisor);
  return (
    <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", borderRadius: 16, padding: "20px 24px", color: "#fff", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#94a3b8", marginBottom: 4 }}>
            {isFixed ? "Pay now" : "You pay"}
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#34d399" }}>${charge}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#94a3b8", marginBottom: 4 }}>
            {isFixed ? "Total / Max spots" : "Total / Participants"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>${total} / {isFixed ? maxParticipants : count || "?"} ppl</div>
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8" }}>
        <span>Activity cost: ${base}</span>
        <span>Stripe fee: +${fee}</span>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>
        {isFixed ? "Fixed price — charged immediately at registration" : "Split price — drops as more people join, charged at settlement"}
      </div>
    </div>
  );
}

// ---------- Progress bar ----------
function ProgressBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min((current / max) * 100, 100);
  const isFull = current >= max;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
        <span>{current} / {max} spots</span>
        <span style={{ color: isFull ? "#ef4444" : "#059669", fontWeight: 600 }}>{isFull ? "Full" : "Open"}</span>
      </div>
      <div style={{ height: 8, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: isFull ? "linear-gradient(90deg, #ef4444, #f97316)" : "linear-gradient(90deg, #06b6d4, #34d399)", transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ---------- Participant list ----------
function ParticipantList({ participants, label, color, onRemove, isAdmin, isSettled }: {
  participants: UIParticipant[]; label: string; color: string;
  onRemove: (id: string) => void; isAdmin: boolean; isSettled: boolean;
}) {
  if (participants.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
        {label} ({participants.length})
      </div>
      {participants.map((p, i) => {
        const canRemove = !isSettled && isAdmin;
        return (
          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: i % 2 === 0 ? "#f8fafc" : "#fff", borderRadius: 10, marginBottom: 4, fontSize: 14, border: "1px solid transparent" }}>
            <div style={{ minWidth: 0, overflow: "hidden", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{i + 1}. {p.name}</span>
              {p.paid && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#065f46", background: "#d1fae5", padding: "2px 8px", borderRadius: 99 }}>PAID</span>}
              {isAdmin && p.chargeStatus === "failed" && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#991b1b", background: "#fee2e2", padding: "2px 8px", borderRadius: 99 }}>FAILED</span>}
              {isAdmin && p.chargeStatus === "pending" && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#92400e", background: "#fef3c7", padding: "2px 8px", borderRadius: 99 }}>PENDING</span>}
              {isAdmin && p.email && <span style={{ color: "#94a3b8", marginLeft: 8, fontSize: 12 }}>{p.email}</span>}
            </div>
            {canRemove && (
              <button onClick={() => onRemove(p.id)} style={{ background: "none", border: "1px solid #fecaca", color: "#ef4444", borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                Remove
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Registration form ----------
function RegistrationForm({ event, onRegister }: { event: UIEvent; onRegister: (name: string, email: string) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [touched, setTouched] = useState<{ name?: boolean; email?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const e: { name?: string; email?: string } = {};
    if (!name.trim()) e.name = "Name is required";
    if (!email.trim()) e.email = "Email is required";
    else {
      const check = isValidEmail(email.trim());
      if (!check.valid) e.email = check.reason;
    }
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    setTouched({ name: true, email: true });
    if (Object.keys(e).length > 0) return;
    setSubmitting(true);
    const err = await onRegister(name.trim(), email.trim());
    if (err) {
      setSubmitting(false);
      setErrors({ email: err });
    }
    // On success the page redirects to Stripe Checkout — keep the button disabled.
  };

  const inputBase: React.CSSProperties = { padding: "12px 16px", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const errStyle: React.CSSProperties = { fontSize: 11, color: "#ef4444", marginTop: 3 };
  const isFull = event.participants.length >= event.maxParticipants;
  const isFixed = event.paymentMode === "fixed";
  const payNowAmount = priceStrings(event.totalCost, event.maxParticipants).charge;

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: "1px solid #e2e8f0", marginTop: 16 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 16 }}>
        {isFull ? "Join Waitlist" : isFixed ? "Register & Pay" : "Register"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <input type="text" placeholder="Your name" value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched({ ...touched, name: true })}
            style={{ ...inputBase, border: `2px solid ${touched.name && errors.name ? "#ef4444" : "#e2e8f0"}` }} />
          {touched.name && errors.name && <div style={errStyle}>{errors.name}</div>}
        </div>
        <div>
          <input type="email" placeholder="Email (e.g. name@gmail.com)" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => { setTouched({ ...touched, email: true }); setErrors(validate()); }}
            style={{ ...inputBase, border: `2px solid ${touched.email && errors.email ? "#ef4444" : "#e2e8f0"}` }} />
          {touched.email && errors.email && <div style={errStyle}>{errors.email}</div>}
        </div>

        <button onClick={handleSubmit} disabled={submitting}
          style={{
            padding: "14px", borderRadius: 12, border: "none",
            background: submitting ? "#94a3b8" : isFull ? "linear-gradient(135deg, #f59e0b, #d97706)" : isFixed ? "linear-gradient(135deg, #7c3aed, #6366f1)" : "linear-gradient(135deg, #06b6d4, #0d9488)",
            color: "#fff", fontSize: 15, fontWeight: 700, cursor: submitting ? "default" : "pointer", fontFamily: "inherit",
          }}>
          {submitting ? "Redirecting to Stripe…" : isFull ? "Join Waitlist (save card)" : isFixed ? `Pay $${payNowAmount} & Register` : "Register & save card"}
        </button>

        <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
          {isFull
            ? "Waitlist saves your card; you're only charged if a spot opens."
            : isFixed
              ? "You'll be charged now on Stripe's secure page. A confirmation email follows."
              : "Your card is saved securely on Stripe and charged automatically at settlement."}
        </div>
      </div>
    </div>
  );
}

// ---------- Admin inline editors ----------
function MaxParticipantsEditor({ event, onUpdate }: { event: UIEvent; onUpdate: (patch: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<number | string>(event.maxParticipants);
  const save = () => { onUpdate({ max_participants: Math.max(1, Math.min(500, Number(val) || event.maxParticipants)) }); setEditing(false); };
  if (!editing) {
    return <button onClick={() => { setVal(event.maxParticipants); setEditing(true); }} style={dashBtn}>Max: {event.maxParticipants} (edit)</button>;
  }
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <input type="number" value={val} min={1} max={500} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} style={miniInput} autoFocus />
      <button onClick={save} style={saveBtn}>Save</button>
      <button onClick={() => setEditing(false)} style={cancelBtn}>Cancel</button>
    </div>
  );
}

function TotalCostEditor({ event, onUpdate }: { event: UIEvent; onUpdate: (patch: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<number | string>(event.totalCost);
  const save = () => { onUpdate({ total_cost: Math.max(0, Number(val) || event.totalCost) }); setEditing(false); };
  if (!editing) {
    return <button onClick={() => { setVal(event.totalCost); setEditing(true); }} style={dashBtn}>Total: ${event.totalCost} (edit)</button>;
  }
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>$</span>
      <input type="number" value={val} min={0} step="0.01" onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} style={miniInput} autoFocus />
      <button onClick={save} style={saveBtn}>Save</button>
      <button onClick={() => setEditing(false)} style={cancelBtn}>Cancel</button>
    </div>
  );
}

function PaymentModeToggle({ event, onUpdate }: { event: UIEvent; onUpdate: (patch: Record<string, unknown>) => void }) {
  const isFixed = event.paymentMode === "fixed";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
      <button onClick={() => onUpdate({ payment_mode: "split" })} style={{ padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: !isFixed ? "#0e7490" : "transparent", color: !isFixed ? "#fff" : "#64748b" }}>Split</button>
      <button onClick={() => onUpdate({ payment_mode: "fixed" })} style={{ padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: isFixed ? "#6d28d9" : "transparent", color: isFixed ? "#fff" : "#64748b" }}>Pay now</button>
    </div>
  );
}

const dashBtn: React.CSSProperties = { background: "none", border: "1px dashed #94a3b8", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "#64748b", cursor: "pointer", fontFamily: "inherit" };
const miniInput: React.CSSProperties = { width: 70, padding: "4px 8px", borderRadius: 8, border: "2px solid #06b6d4", fontSize: 13, textAlign: "center", outline: "none", fontFamily: "inherit" };
const saveBtn: React.CSSProperties = { background: "#06b6d4", color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" };
const cancelBtn: React.CSSProperties = { background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, fontFamily: "inherit" };

// ---------- Admin: edit name / date / location / note ----------
function EventDetailsEditor({ event, onUpdate, onClose }: {
  event: UIEvent; onUpdate: (patch: Record<string, unknown>) => void; onClose: () => void;
}) {
  const [name, setName] = useState(event.name);
  const [date, setDate] = useState(event.date || "");
  const [timeLabel, setTimeLabel] = useState(event.timeLabel || "");
  const [location, setLocation] = useState(event.location || "");

  const inp: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, display: "block" };

  const save = () => {
    onUpdate({
      name: name.trim() || event.name,
      event_date: date || null,
      time_label: timeLabel.trim() || null,
      location: location || null,
    });
    onClose();
  };

  return (
    <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <label style={lbl}>Event name</label>
        <input style={inp} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={lbl}>Date</label>
          <input type="date" style={inp} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Time</label>
          <input style={inp} value={timeLabel} onChange={(e) => setTimeLabel(e.target.value)} placeholder="9:00am-11:00am" />
        </div>
      </div>
      <div>
        <label style={lbl}>Location</label>
        <input style={inp} value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} style={{ ...saveBtn, padding: "8px 16px" }}>Save</button>
        <button onClick={onClose} style={cancelBtn}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- Admin: rich-text note shown right under the date ----------
// Click to edit; toolbar gives bold / italic / underline / font size. The HTML
// is sanitized on the server before it's stored (see lib/sanitize.ts).
function RichNote({ event, onUpdate }: { event: UIEvent; onUpdate: (patch: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = event.description || "";

  const cmd = (command: string) => {
    document.execCommand(command, false);
    ref.current?.focus();
  };

  const setSize = (level: string) => {
    if (!level) return;
    // Built-in command: normalizes the selection's font size (replaces any
    // existing size) instead of nesting spans, so Large -> Normal works.
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontSize", false, level);
    ref.current?.focus();
  };

  const save = () => {
    const html = (ref.current?.innerHTML || "").trim();
    onUpdate({ description: html || null });
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        style={{ marginTop: 8, cursor: "pointer", fontSize: 13, lineHeight: 1.5 }}
      >
        {initial ? (
          <span style={{ color: "#475569" }} dangerouslySetInnerHTML={{ __html: initial }} />
        ) : (
          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>+ Add a note for registrants</span>
        )}
        <span style={{ color: "#06b6d4", marginLeft: 6, fontSize: 11, fontWeight: 600 }}>(edit)</span>
      </div>
    );
  }

  const tbtn: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "3px 10px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 };
  const tsel: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "3px 8px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); cmd("bold"); }} style={tbtn}><b>B</b></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); cmd("italic"); }} style={tbtn}><i>I</i></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); cmd("underline"); }} style={tbtn}><u>U</u></button>
        <select
          value=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { setSize(e.target.value); }}
          style={tsel}
        >
          <option value="" disabled>Size</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="5">Large</option>
          <option value="6">Huge</option>
        </select>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>select text, then format</span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: initial }}
        data-placeholder="Bring a white & a dark shirt. Court 3, enter via Gate B."
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "2px solid #06b6d4", fontSize: 13, outline: "none", minHeight: 60, lineHeight: 1.5, color: "#475569" }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button onClick={save} style={{ ...saveBtn, padding: "6px 14px" }}>Save</button>
        <button onClick={() => setEditing(false)} style={cancelBtn}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- Event card ----------
export function EventCard({ event, isAdmin, onRegister, onRemove, onUpdate, onSettle, onDelete }: {
  event: UIEvent;
  isAdmin: boolean;
  onRegister?: (eventId: string, name: string, email: string) => Promise<string | null>;
  onRemove?: (participantId: string) => void;
  onUpdate?: (eventId: string, patch: Record<string, unknown>) => void;
  onSettle?: (eventId: string) => void;
  onDelete?: (eventId: string) => void;
}) {
  const isSettled = event.status === "settled";
  const isFixed = event.paymentMode === "fixed";
  const divisor = isFixed ? event.maxParticipants : event.participants.length;
  const pricing = priceStrings(event.totalCost, divisor);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);

  const update = (patch: Record<string, unknown>) => onUpdate?.(event.id, patch);

  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: 28, border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{event.name}</div>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, color: "#64748b", flexWrap: "wrap" }}>
            {event.date && <span>Date: {event.date}</span>}
            {event.timeLabel && <span>Time: {event.timeLabel}</span>}
            {event.location && <span>Location: {event.location}</span>}
          </div>
          {isAdmin && !isSettled ? (
            <RichNote event={event} onUpdate={update} />
          ) : (
            event.description && (
              <div
                style={{ marginTop: 8, fontSize: 13, color: "#475569", lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: event.description }}
              />
            )
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ padding: "6px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700, background: isSettled ? "#fef3c7" : "#d1fae5", color: isSettled ? "#92400e" : "#065f46" }}>
            {isSettled ? "Settled" : "Open"}
          </div>
          <div style={{ padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: isFixed ? "#ede9fe" : "#cffafe", color: isFixed ? "#6d28d9" : "#0e7490" }}>
            {isFixed ? "Pay at registration" : "Auto-charge at settlement"}
          </div>
          {isAdmin && !isSettled && (
            <button
              onClick={() => update({ visible: !event.visible })}
              title={event.visible ? "Visible to registrants — click to hide" : "Hidden from registrants — click to show"}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 8,
                cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700,
                border: `1px solid ${event.visible ? "#86efac" : "#fca5a5"}`,
                background: event.visible ? "#f0fdf4" : "#fef2f2",
                color: event.visible ? "#065f46" : "#991b1b",
              }}
            >
              {event.visible ? "👁 Visible" : "🙈 Hidden"}
            </button>
          )}
          {isAdmin && !isSettled && <PaymentModeToggle event={event} onUpdate={update} />}
          {isAdmin && !isSettled && <MaxParticipantsEditor event={event} onUpdate={update} />}
          {isAdmin && !isSettled && <TotalCostEditor event={event} onUpdate={update} />}
          {isAdmin && !isSettled && (
            <button onClick={() => setEditingDetails((v) => !v)} style={dashBtn}>
              {editingDetails ? "Close details" : "✏️ Edit details"}
            </button>
          )}
        </div>
      </div>

      {isAdmin && !isSettled && editingDetails && (
        <EventDetailsEditor event={event} onUpdate={update} onClose={() => setEditingDetails(false)} />
      )}

      <div style={{ marginTop: 20 }}>
        <CostDisplay total={event.totalCost} count={event.participants.length} mode={event.paymentMode} maxParticipants={event.maxParticipants} />
      </div>

      <ProgressBar current={event.participants.length} max={event.maxParticipants} />

      {!isSettled && !isFixed && event.cutoffTime && <CountdownTimer cutoffTime={event.cutoffTime} />}

      <ParticipantList participants={event.participants} label="Confirmed" color="#0d9488" onRemove={(id) => onRemove?.(id)} isAdmin={isAdmin} isSettled={isSettled} />
      <ParticipantList participants={event.waitlist} label="Waitlist" color="#f59e0b" onRemove={(id) => onRemove?.(id)} isAdmin={isAdmin} isSettled={isSettled} />

      {!isAdmin && !isSettled && onRegister && (
        <RegistrationForm event={event} onRegister={(name, email) => onRegister(event.id, name, email)} />
      )}

      {isAdmin && !isSettled && !isFixed && (
        <div style={{ marginTop: 20 }}>
          <button onClick={() => onSettle?.(event.id)} style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #7c3aed, #6366f1)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Force Settle Now — ${pricing.charge} each
          </button>
          <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>
            Auto-settles at the cutoff via cron. Use this for manual override only.
          </div>
        </div>
      )}

      {isAdmin && !isSettled && isFixed && (
        <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: "#faf5ff", border: "1px solid #e9d5ff", fontSize: 12, color: "#6d28d9", textAlign: "center" }}>
          Pay-at-registration mode: each person is charged ${pricing.charge} when they register. No settlement needed.
        </div>
      )}

      {isSettled && (
        <div style={{ marginTop: 20, padding: 20, borderRadius: 14, background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)", border: "1px solid #86efac", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#065f46", fontWeight: 600 }}>Settlement Complete</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#059669", marginTop: 8 }}>${pricing.charge} each</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            {event.participants.length} people × ${pricing.charge} (incl. ${pricing.fee} Stripe fee)
          </div>
          <div style={{ fontSize: 12, color: "#059669", marginTop: 4, fontWeight: 600 }}>Organiser receives: ${event.totalCost}</div>
        </div>
      )}

      {isAdmin && (
        <div style={{ marginTop: 16, borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #fecaca", background: "#fff", color: "#ef4444", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Delete Event
            </button>
          ) : (
            <div style={{ background: "#fef2f2", borderRadius: 12, padding: 16, border: "1px solid #fecaca", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#991b1b", fontWeight: 600, marginBottom: 12 }}>Are you sure? This removes the event and all registrations.</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => onDelete?.(event.id)} style={{ padding: "8px 24px", borderRadius: 10, border: "none", background: "#ef4444", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Yes, Delete</button>
                <button onClick={() => setConfirmDelete(false)} style={{ padding: "8px 24px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Create event form (admin) ----------
export function CreateEventForm({ onCreate }: { onCreate: (payload: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    name: "", eventDate: "", timeLabel: "", location: "", description: "", totalCost: 60, maxParticipants: 12,
    settlementDay: "thursday", settlementHour: "00", settlementMinute: "00",
    paymentMode: "split",
  });
  const update = (k: string, v: string | number) => setForm({ ...form, [k]: v });

  const getSettlementDate = () => {
    if (!form.eventDate) return null;
    const evtDate = new Date(form.eventDate + "T00:00:00");
    const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const targetDay = dayMap[form.settlementDay];
    const evtDay = evtDate.getDay();
    let diff = targetDay - evtDay;
    if (diff <= 0) diff += 7; // settlement on/after the event's following target weekday
    const settlDate = new Date(evtDate);
    settlDate.setDate(evtDate.getDate() + diff);
    return settlDate;
  };

  const getSettlementLabel = () => {
    const d = getSettlementDate();
    if (!d) return "";
    const h = form.settlementHour.padStart(2, "0");
    const m = form.settlementMinute.padStart(2, "0");
    const hNum = Number(h);
    const period = hNum === 0 && m === "00" ? "12:00 AM (midnight)" : `${h}:${m} ${hNum < 12 ? "AM" : "PM"}`;
    return `${d.toLocaleDateString("en-AU", { weekday: "long", month: "short", day: "numeric" })} at ${period} AEST`;
  };

  const handleCreate = () => {
    if (!form.name) return;
    let settlement_time: string | null = null;
    if (form.paymentMode === "split") {
      const settlDate = getSettlementDate();
      if (!settlDate) return;
      const pad = (n: number) => String(n).padStart(2, "0");
      const h = Number(form.settlementHour);
      const m = Number(form.settlementMinute);
      // Melbourne is UTC+11 (AEDT) / +10 (AEST). +11 is a safe approximation here.
      const isoStr = `${settlDate.getFullYear()}-${pad(settlDate.getMonth() + 1)}-${pad(settlDate.getDate())}T${pad(h)}:${pad(m)}:00+11:00`;
      settlement_time = new Date(isoStr).toISOString();
    }
    onCreate({
      name: form.name,
      event_date: form.eventDate || null,
      time_label: form.timeLabel || null,
      location: form.location || null,
      description: form.description || null,
      total_cost: Number(form.totalCost),
      max_participants: Number(form.maxParticipants),
      payment_mode: form.paymentMode,
      settlement_time,
    });
    setForm({ ...form, name: "", eventDate: "", timeLabel: "", location: "", description: "" });
  };

  const iStyle: React.CSSProperties = { padding: "12px 16px", borderRadius: 10, border: "2px solid #e2e8f0", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
  const selStyle: React.CSSProperties = { ...iStyle, appearance: "none", background: "#fff", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4, display: "block" };

  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: 28, border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 24 }}>Create Event</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Event Name</label>
          <input style={iStyle} placeholder="e.g. Weekly Basketball" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Event Date</label>
            <input style={iStyle} type="date" value={form.eventDate} onChange={(e) => update("eventDate", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Location</label>
            <input style={iStyle} placeholder="Venue name" value={form.location} onChange={(e) => update("location", e.target.value)} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Time (optional)</label>
          <input style={iStyle} placeholder="e.g. 9:00am-11:00am" value={form.timeLabel} onChange={(e) => update("timeLabel", e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Note for registrants (optional)</label>
          <textarea style={{ ...iStyle, minHeight: 60, resize: "vertical" }} placeholder="e.g. Bring a white & a dark shirt. Court 3." value={form.description} onChange={(e) => update("description", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Total Cost ($)</label>
            <input style={iStyle} type="number" value={form.totalCost} onChange={(e) => update("totalCost", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Max Participants</label>
            <input style={iStyle} type="number" value={form.maxParticipants} onChange={(e) => update("maxParticipants", e.target.value)} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Payment Mode</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <button onClick={() => update("paymentMode", "split")} style={{ padding: "12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", border: form.paymentMode === "split" ? "2px solid #0e7490" : "2px solid #e2e8f0", background: form.paymentMode === "split" ? "#ecfeff" : "#fff", textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: form.paymentMode === "split" ? "#0e7490" : "#475569" }}>Split / Auto-charge</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Cost ÷ people. Charged automatically at settlement.</div>
            </button>
            <button onClick={() => update("paymentMode", "fixed")} style={{ padding: "12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", border: form.paymentMode === "fixed" ? "2px solid #6d28d9" : "2px solid #e2e8f0", background: form.paymentMode === "fixed" ? "#faf5ff" : "#fff", textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: form.paymentMode === "fixed" ? "#6d28d9" : "#475569" }}>Pay at registration</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Cost ÷ max spots. Paid immediately when registering.</div>
            </button>
          </div>
        </div>

        {form.paymentMode === "split" && (
          <div style={{ background: "#f8fafc", borderRadius: 14, padding: 16, marginTop: 4, border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>
              Settlement Cutoff<span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>— when payment is collected (AEST)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ ...labelStyle, fontSize: 11, color: "#94a3b8" }}>Day</label>
                <select style={selStyle} value={form.settlementDay} onChange={(e) => update("settlementDay", e.target.value)}>
                  {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => (
                    <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 11, color: "#94a3b8" }}>Hour</label>
                <select style={selStyle} value={form.settlementHour} onChange={(e) => update("settlementHour", e.target.value)}>
                  {Array.from({ length: 24 }, (_, i) => {
                    const label = i === 0 ? "12 AM" : i < 12 ? `${i} AM` : i === 12 ? "12 PM" : `${i - 12} PM`;
                    return <option key={i} value={String(i).padStart(2, "0")}>{label}</option>;
                  })}
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 11, color: "#94a3b8" }}>Min</label>
                <select style={selStyle} value={form.settlementMinute} onChange={(e) => update("settlementMinute", e.target.value)}>
                  {["00", "15", "30", "45"].map((m) => <option key={m} value={m}>:{m}</option>)}
                </select>
              </div>
            </div>
            {form.eventDate ? (
              <div style={{ fontSize: 12, color: "#0d9488", marginTop: 10, fontWeight: 600 }}>Settlement: {getSettlementLabel()}</div>
            ) : (
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>Select an event date to see the settlement time</div>
            )}
          </div>
        )}

        <button onClick={handleCreate} disabled={!form.name || (form.paymentMode === "split" && !form.eventDate)}
          style={{ marginTop: 8, padding: 16, borderRadius: 14, border: "none", background: !form.name || (form.paymentMode === "split" && !form.eventDate) ? "#cbd5e1" : "linear-gradient(135deg, #7c3aed, #6366f1)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Create Event
        </button>
      </div>
    </div>
  );
}

// ---------- Admin login ----------
export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: val }) });
    setBusy(false);
    if (res.ok) onSuccess();
    else setErr(true);
  };
  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: 32, border: "1px solid #e2e8f0", maxWidth: 360, margin: "40px auto", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Admin Login</div>
      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>Enter the admin password</div>
      <input type="password" placeholder="Enter password" value={val}
        onChange={(e) => { setVal(e.target.value); setErr(false); }}
        onKeyDown={(e) => e.key === "Enter" && go()}
        style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: `2px solid ${err ? "#ef4444" : "#e2e8f0"}`, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
      {err && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>Incorrect password</div>}
      <button onClick={go} disabled={busy} style={{ width: "100%", marginTop: 12, padding: 14, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #7c3aed, #6366f1)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        {busy ? "…" : "Log In"}
      </button>
    </div>
  );
}

// ---------- Header ----------
export function Header({ active, isAdmin, onLogout }: { active: "user" | "admin"; isAdmin?: boolean; onLogout?: () => void }) {
  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 24px", position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", height: 56 }}>
        <a href="/" style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", textDecoration: "none" }}>SplitPlay</a>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <a href="/" style={navLink(active === "user")}>Register</a>
          <a href="/admin" style={navLink(active === "admin")}>Admin</a>
          {isAdmin && onLogout && (
            <button onClick={onLogout} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #fecaca", background: "transparent", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Logout</button>
          )}
        </div>
      </div>
    </div>
  );
}

function navLink(activeState: boolean): React.CSSProperties {
  return { padding: "8px 16px", borderRadius: 10, textDecoration: "none", background: activeState ? "#0f172a" : "transparent", color: activeState ? "#fff" : "#64748b", fontSize: 13, fontWeight: 600 };
}
