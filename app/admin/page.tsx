"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EventCard,
  CreateEventForm,
  AdminLogin,
  Notification,
  Header,
  type UIEvent,
  type NotificationState,
} from "@/app/components/ui";

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [events, setEvents] = useState<UIEvent[]>([]);
  const [creating, setCreating] = useState(false);
  const [notification, setNotification] = useState<NotificationState>(null);

  const notify = (type: "success" | "info" | "error", message: string) => setNotification({ type, message });

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/events", { cache: "no-store" });
    const data = await res.json();
    setEvents(data.events || []);
  }, []);

  const checkAuth = useCallback(async () => {
    const res = await fetch("/api/admin/me");
    const data = await res.json();
    return !!data.admin;
  }, []);

  useEffect(() => {
    (async () => {
      const ok = await checkAuth();
      setAuthed(ok);
      if (ok) await loadEvents();
    })();
  }, [checkAuth, loadEvents]);

  const onUpdate = async (eventId: string, patch: Record<string, unknown>) => {
    const res = await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      notify("info", "Event updated");
      loadEvents();
    } else {
      notify("error", "Update failed");
    }
  };

  const onDelete = async (eventId: string) => {
    const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    if (res.ok) {
      notify("info", "Event deleted");
      loadEvents();
    } else {
      notify("error", "Delete failed");
    }
  };

  const onSettle = async (eventId: string) => {
    notify("info", "Settling — charging cards…");
    const res = await fetch(`/api/events/${eventId}/settle`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      notify("success", `Settled — ${data.charged} charged${data.failed ? `, ${data.failed} failed` : ""}`);
      loadEvents();
    } else {
      notify("error", data.error || "Settle failed");
    }
  };

  const onRemove = async (participantId: string) => {
    const res = await fetch("/api/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId }),
    });
    if (res.ok) {
      notify("info", "Participant removed");
      loadEvents();
    } else {
      notify("error", "Remove failed");
    }
  };

  const onCreate = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      notify("success", "Event created!");
      setCreating(false);
      loadEvents();
    } else {
      notify("error", data.error || "Create failed");
    }
  };

  const onLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setEvents([]);
  };

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)" }}>
      <Notification notification={notification} onClear={() => setNotification(null)} />
      <Header active="admin" isAdmin={!!authed} onLogout={onLogout} />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px" }}>{children}</div>
    </div>
  );

  if (authed === null) {
    return wrap(<div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading…</div>);
  }

  if (!authed) {
    return wrap(
      <AdminLogin
        onSuccess={async () => {
          setAuthed(true);
          await loadEvents();
        }}
      />
    );
  }

  return wrap(
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "#64748b" }}>Manage all events</div>
        <button
          onClick={() => setCreating((c) => !c)}
          style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #06b6d4, #0d9488)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          {creating ? "Close" : "+ Create Event"}
        </button>
      </div>

      {creating && <CreateEventForm onCreate={onCreate} />}

      {events.length === 0 && !creating && (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>No events yet — create one.</div>
      )}

      {events.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          isAdmin
          onRemove={onRemove}
          onUpdate={onUpdate}
          onSettle={onSettle}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
