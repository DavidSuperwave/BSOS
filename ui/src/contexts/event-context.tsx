"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCompany } from "./company-context";

export interface AppEvent {
  id: string;
  company_id: string;
  session_id?: string;
  event_type:
    | "action_item"
    | "insight"
    | "alert"
    | "status_update"
    | "cron_result"
    | "reply_received"
    | "lead_qualified"
    | "campaign_paused"
    | "email_reply"
    | "meeting_booked"
    | "opportunity_created";
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "urgent";
  actions?: any[];
  status: "unread" | "read" | "acted" | "dismissed";
  created_at: string;
  updated_at: string;
}

interface EventContextValue {
  events: AppEvent[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  markAsActed: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const EventContext = createContext<EventContextValue | null>(null);

export function EventProvider({ children }: { children: ReactNode }) {
  const { selectedCompany } = useCompany();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchEvents = useCallback(async () => {
    if (!selectedCompany?.id) {
      setEvents([]);
      setUnreadCount(0);
      return;
    }
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/events?companyId=${selectedCompany.id}&limit=50`
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // Keep previous state
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [selectedCompany?.id]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Poll for new events every 30s
  useEffect(() => {
    if (!selectedCompany?.id) return;
    const interval = setInterval(() => { fetchEvents(); }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id]);

  const updateEventStatus = async (id: string, status: string) => {
    if (!selectedCompany?.id) return;
    try {
      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, companyId: selectedCompany.id }),
      });
      if (res.ok) {
        setEvents((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status: status as any } : e))
        );
        if (status !== "unread") {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
      }
    } catch {
      // Non-blocking
    }
  };

  const markAsRead = (id: string) => updateEventStatus(id, "read");
  const dismiss = (id: string) => updateEventStatus(id, "dismissed");
  const markAsActed = (id: string) => updateEventStatus(id, "acted");

  const contextValue = useMemo(
    () => ({
      events,
      unreadCount,
      isLoading,
      markAsRead,
      dismiss,
      markAsActed,
      refresh: fetchEvents,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, unreadCount, isLoading, fetchEvents]
  );

  return (
    <EventContext.Provider value={contextValue}>
      {children}
    </EventContext.Provider>
  );
}

export function useEvents() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEvents must be used within EventProvider");
  return ctx;
}
