"use client";

import { useCallback, useEffect, useState } from "react";
import { EventCard, Notification, Header, MobileEventSummary, type UIEvent, type NotificationState } from "@/app/components/ui";

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
      // Always respect visibility + cancellation (even if an admin is logged in
      // this browser), and drop events whose date has already passed.
      setEvents(
        (data.events || []).filter(
          (e: UIEvent) => e.visible && e.status !== "cancelled" && !isEventOver(e.date)
        )
      );
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

  // Which event the pinned phone summary describes: whichever card owns the top
  // of the viewport, so scrolling through several events keeps the numbers in
  // sync with the card you're looking at.
  const [activeId, setActiveId] = useState<string | null>(null);
  // Folded away while the card's own price panel is on screen — the strip would
  // just be repeating the numbers the reader is already looking at.
  const [summaryHidden, setSummaryHidden] = useState(false);
  useEffect(() => {
    if (events.length === 0) return;
    // Runs straight off the scroll event: a handful of getBoundingClientRect
    // reads is cheap, and rAF throttling (background tab, paused painting) can
    // strand a pending frame and freeze the strip on a stale event.
    const pick = () => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-event-id]"));
      if (cards.length === 0) return;
      // Measure just below the header + summary strip, not the very top edge.
      const line = 104;
      const current = cards.find((c) => c.getBoundingClientRect().bottom > line) ?? cards[cards.length - 1];
      const id = current.dataset.eventId ?? null;
      setActiveId((prev) => (prev === id ? prev : id));

      // Not "the panel has appeared" — the panel merely poking in at the bottom
      // of a tall phone screen is still a long scroll away from being read.
      // The strip folds once the panel crosses the middle of the viewport, and
      // comes back as soon as it has scrolled up past the header.
      const panel = current.querySelector<HTMLElement>("[data-cost-panel]");
      const rect = panel?.getBoundingClientRect();
      const panelInFocus = !!rect && rect.bottom > line && rect.top < window.innerHeight / 2;
      setSummaryHidden((prev) => (prev === panelInFocus ? prev : panelInFocus));
    };
    const timer = setTimeout(pick, 0);
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, [events]);

  const activeEvent = events.find((e) => e.id === activeId) ?? events[0] ?? null;

  const onRegister = async (eventId: string, name: string, email: string, referredBy: string): Promise<string | null> => {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, name, email, referredBy }),
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
      {activeEvent && <MobileEventSummary event={activeEvent} showName={events.length > 1} hidden={summaryHidden} />}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 24 }}>
          Register for events below. Your card is saved securely on Stripe — never on this site.
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 20, padding: "44px 28px", border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.04)", textAlign: "center" }}>
            <div style={{ fontSize: 40, lineHeight: 1, letterSpacing: 4 }}>🏀⛹️💦</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#0f172a", marginTop: 14 }}>
              We&apos;re looking for the next available time
            </div>
            <div style={{ fontSize: 14, color: "#64748b", marginTop: 10, lineHeight: 1.6 }}>
              🗓️ No sessions are open right now — we&apos;re hunting for a court.<br />
              🔔 Check back soon, the next one goes up as soon as it&apos;s booked!
            </div>
            <div style={{ display: "inline-block", marginTop: 18, padding: "8px 16px", borderRadius: 99, background: "#ecfeff", color: "#0e7490", fontSize: 12, fontWeight: 700 }}>
              ✅ Payment is split among the number of participants
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {events.map((e) => (
              <div key={e.id} data-event-id={e.id}>
                <EventCard event={e} isAdmin={false} onRegister={onRegister} />
              </div>
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
