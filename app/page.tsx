"use client";

import { useCallback, useEffect, useState } from "react";
import { EventCard, Notification, Header, type UIEvent, type NotificationState } from "@/app/components/ui";

// Hide an event from registrants once its date has passed (Melbourne time).
function isEventOver(date: string | null): boolean {
  if (!date) return false;
  const todayMel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return date < todayMel; // YYYY-MM-DD string comparison
}

export default function UserPage() {
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<NotificationState>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/events", { cache: "no-store" });
      const data = await res.json();
      // Always respect visibility (even if an admin is logged in this browser),
      // and drop events whose date has already passed.
      setEvents((data.events || []).filter((e: UIEvent) => e.visible && !isEventOver(e.date)));
    } catch {
      setNotification({ type: "error", message: "Could not load events" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("cancelled")) {
      setNotification({ type: "info", message: "Registration cancelled — you were not charged." });
    }
    // Re-fetch when the tab regains focus, so hidden/updated events refresh.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const onRegister = async (eventId: string, name: string, email: string): Promise<string | null> => {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, name, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return data.error || "Registration failed";
    if (data.url) {
      window.location.href = data.url; // off to Stripe Checkout
      return null;
    }
    return "No checkout URL returned";
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)" }}>
      <Notification notification={notification} onClear={() => setNotification(null)} />
      <Header active="user" />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 24 }}>
          Register for events below. Your card is saved securely on Stripe — never on this site.
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>No open events right now</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {events.map((e) => (
              <EventCard key={e.id} event={e} isAdmin={false} onRegister={onRegister} />
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: "center", padding: "32px 16px 24px", fontSize: 12, color: "#94a3b8" }}>
        Bball Court Fee — payments secured by Stripe
      </div>
    </div>
  );
}
