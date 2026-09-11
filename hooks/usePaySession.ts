"use client";
import { useCallback, useEffect, useState } from "react";
import { clearSession, loadSession, payApi, saveSession, type PaySession } from "@/lib/pay";

/**
 * The Google account used for card orders.
 *
 * `ready` stays false until localStorage has been read after mount. The static
 * export renders signed-out HTML; reading storage during render would disagree
 * with it and throw a hydration error for anyone already signed in.
 */
export function usePaySession() {
  const [session, setSession] = useState<PaySession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  const signIn = useCallback(async (credential: string) => {
    const s = await payApi.signIn(credential);
    saveSession(s);
    setSession(s);
    return s;
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    // Otherwise Google's button offers to sign straight back into the same account.
    window.google?.accounts.id.disableAutoSelect();
  }, []);

  return { session, ready, signIn, signOut };
}
