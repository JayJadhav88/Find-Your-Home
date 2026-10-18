import { countUnreadNotifications } from "@fyh/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useSession } from "./session";
import { supabase } from "./supabase";

interface InboxValue {
  unread: number;
  refreshUnread: () => void;
}

const InboxContext = createContext<InboxValue>({ unread: 0, refreshUnread: () => {} });

const POLL_MS = 120_000;

/** Unread notification count for the tab badge. Refreshes on open, on return to the app and every 2 minutes. */
export function InboxProvider({ children }: { children: ReactNode }) {
  const { viewer } = useSession();
  const userId = viewer?.id ?? null;
  const [counts, setCounts] = useState<{ userId: string | null; unread: number }>({ userId: null, unread: 0 });
  const [tick, setTick] = useState(0);
  const refreshUnread = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    countUnreadNotifications(supabase)
      .then((unread) => active && setCounts({ userId, unread }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId, tick]);

  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(refreshUnread, POLL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshUnread();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [userId, refreshUnread]);

  // A count loaded for a previous account is never shown.
  const unread = userId && counts.userId === userId ? counts.unread : 0;
  const value = useMemo(() => ({ unread, refreshUnread }), [unread, refreshUnread]);
  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox(): InboxValue {
  return useContext(InboxContext);
}
