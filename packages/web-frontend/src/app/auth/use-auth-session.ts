"use client";

import { useCallback, useEffect, useState } from "react";
import { loadAuthSession, logoutAuthSession } from "./auth-api";
import type { AuthState, AuthUser } from "./auth-types";

const AUTH_SESSION_WATCHDOG_MS = 6500;

export function useAuthSession() {
  const [state, setState] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    let active = true;
    const watchdog = setTimeout(() => {
      if (!active) return;
      setState({ status: "guest" });
    }, AUTH_SESSION_WATCHDOG_MS);

    loadAuthSession()
      .then((session) => {
        if (!active) return;
        clearTimeout(watchdog);
        setState(session ? { status: "ready", user: session.user } : { status: "guest" });
      })
      .catch(() => {
        if (!active) return;
        clearTimeout(watchdog);
        setState({ status: "guest" });
      });

    return () => {
      active = false;
      clearTimeout(watchdog);
    };
  }, []);

  const setUser = useCallback((user: AuthUser) => {
    setState({ status: "ready", user });
  }, []);

  const logout = useCallback(async () => {
    await logoutAuthSession();
    setState({ status: "guest" });
  }, []);

  return {
    ...state,
    setUser,
    logout,
  };
}
