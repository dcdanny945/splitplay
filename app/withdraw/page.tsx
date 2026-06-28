"use client";

import { useEffect, useState } from "react";
import { Header } from "@/app/components/ui";

type Info = {
  ok: boolean;
  name?: string;
  eventName?: string;
  eventDate?: string | null;
  settlementLabel?: string | null;
  canWithdraw?: boolean;
  error?: string;
};

function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

const backBtn: React.CSSProperties = {
  display: "inline-block",
  marginTop: 20,
  padding: "12px 28px",
  borderRadius: 12,
  background: "linear-gradient(135deg, #06b6d4, #0d9488)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
};

export default function WithdrawPage() {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    if (!t) {
      setInfo({ ok: false, error: "This withdraw link is missing its token." });
      setLoading(false);
      return;
    }
    fetch(`/api/withdraw?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => setInfo(d))
      .catch(() => setInfo({ ok: false, error: "Could not load your registration." }))
      .finally(() => setLoading(false));
  }, []);

  const confirm = async () => {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setDone(true);
    else setErr(d.error || "Failed to withdraw");
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)" }}>
      <Header active="user" />
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 32, border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
          {loading ? (
            <div style={{ textAlign: "center", color: "#94a3b8" }}>Loading…</div>
          ) : done ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }}>You&apos;ve withdrawn</div>
              <p style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>
                You won&apos;t be charged{info?.eventName ? ` for ${info.eventName}` : ""}. Thanks for letting us know!
              </p>
              <a href="/" style={backBtn}>Back to events</a>
            </div>
          ) : !info?.ok ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44 }}>⚠️</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{info?.error || "Invalid link"}</div>
              <a href="/" style={backBtn}>Back to events</a>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>Withdraw from this event?</div>
              <div style={{ marginTop: 16, padding: 16, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{info.eventName}</div>
                {info.eventDate && <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>Date: {fmtDate(info.eventDate)}</div>}
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Registered as: {info.name}</div>
                {info.settlementLabel && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Charge time: {info.settlementLabel}</div>}
              </div>

              {info.canWithdraw ? (
                <>
                  <p style={{ fontSize: 13, color: "#64748b", marginTop: 16 }}>
                    You won&apos;t be charged. If there&apos;s a waitlist, your spot may go to the next person.
                  </p>
                  <button
                    onClick={confirm}
                    disabled={busy}
                    style={{ width: "100%", marginTop: 8, padding: 14, borderRadius: 12, border: "none", background: busy ? "#94a3b8" : "#ef4444", color: "#fff", fontSize: 15, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}
                  >
                    {busy ? "…" : "Confirm withdrawal"}
                  </button>
                  {err && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8, textAlign: "center" }}>{err}</div>}
                </>
              ) : (
                <p style={{ fontSize: 13, color: "#991b1b", marginTop: 16, fontWeight: 600 }}>
                  Withdrawals have closed for this event — the settlement time has passed.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
