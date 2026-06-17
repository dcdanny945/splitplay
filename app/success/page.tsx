"use client";

import { useEffect, useState } from "react";
import { Header } from "@/app/components/ui";

function formatDate(iso: string): string {
  // "2026-06-21" -> "21/06/2026"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function SuccessPage() {
  const [hasSession, setHasSession] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHasSession(!!params.get("session_id"));
    setEventName(params.get("evt") || "");
    setEventDate(params.get("date") || "");
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)" }}>
      <Header active="user" />
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 36, border: "1px solid #e2e8f0", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 12 }}>You&apos;re registered!</div>

          {eventName && (
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0d9488", marginTop: 10 }}>{eventName}</div>
          )}
          {eventDate && (
            <div style={{ fontSize: 14, color: "#475569", marginTop: 4 }}>📅 {formatDate(eventDate)}</div>
          )}

          <p style={{ fontSize: 14, color: "#64748b", marginTop: 16, lineHeight: 1.6 }}>
            {hasSession
              ? "A confirmation email with your payment details has been sent to the address you used. Can't see it? Check your spam folder."
              : "Your registration is being processed — your confirmation email will arrive shortly."}
          </p>

          <a
            href="/"
            style={{ display: "inline-block", marginTop: 24, padding: "12px 28px", borderRadius: 12, background: "linear-gradient(135deg, #06b6d4, #0d9488)", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none" }}
          >
            Back to events
          </a>
        </div>
      </div>
    </div>
  );
}
