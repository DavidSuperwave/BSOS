"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type PostgresEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

interface RealtimeOptions<T> {
  /** The table to subscribe to (must be enabled in supabase_realtime publication) */
  table: string;
  /** Postgres schema (default: "public") */
  schema?: string;
  /** Event types to listen for */
  event?: PostgresEvent;
  /** Column filter, e.g. { column: "company_id", value: "uuid" } */
  filter?: { column: string; value: string };
  /** Called when a new row is inserted */
  onInsert?: (record: T) => void;
  /** Called when a row is updated */
  onUpdate?: (record: T, old: Partial<T>) => void;
  /** Called when a row is deleted */
  onDelete?: (old: Partial<T>) => void;
  /** Whether the subscription is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Generic Supabase Realtime subscription hook.
 *
 * Subscribes to INSERT/UPDATE/DELETE events on a table with optional
 * column-level filtering (e.g., filter by company_id).
 *
 * Tables must be added to the supabase_realtime publication to work:
 *   events, inbox_messages, chat_messages
 *
 * @example
 * ```tsx
 * useRealtimeSubscription<InboxMessage>({
 *   table: "inbox_messages",
 *   filter: { column: "company_id", value: companyId },
 *   onInsert: (msg) => {
 *     mutate(); // Revalidate SWR cache
 *     toast({ title: `New reply from ${msg.from_email}` });
 *   },
 * });
 * ```
 */
export function useRealtimeSubscription<T = Record<string, unknown>>(
  options: RealtimeOptions<T>
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const {
    table,
    schema = "public",
    event = "*",
    filter,
    onInsert,
    onUpdate,
    onDelete,
    enabled = true,
  } = options;

  // Store callbacks in refs to avoid re-subscribing on every render
  const callbacksRef = useRef({ onInsert, onUpdate, onDelete });
  callbacksRef.current = { onInsert, onUpdate, onDelete };

  useEffect(() => {
    if (!enabled || !supabaseUrl || !supabaseAnonKey) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

    const channelName = `realtime:${table}:${filter?.value || "all"}`;

    // Build the filter string for Supabase Realtime
    const filterStr = filter
      ? `${filter.column}=eq.${filter.value}`
      : undefined;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as any,
        {
          event,
          schema,
          table,
          filter: filterStr,
        },
        (payload: any) => {
          const eventType = payload.eventType;
          const newRecord = payload.new as T;
          const oldRecord = payload.old as Partial<T>;

          switch (eventType) {
            case "INSERT":
              callbacksRef.current.onInsert?.(newRecord);
              break;
            case "UPDATE":
              callbacksRef.current.onUpdate?.(newRecord, oldRecord);
              break;
            case "DELETE":
              callbacksRef.current.onDelete?.(oldRecord);
              break;
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [table, schema, event, filter?.column, filter?.value, enabled]);
}
