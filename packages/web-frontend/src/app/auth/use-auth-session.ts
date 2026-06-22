"use client";

import { useCallback, useEffect, useState } from "react";
import { loadAuthSession, logoutAuthSession } from "./auth-api";
import type { AuthState, AuthUser } from "./auth-types";

export function useAuthSession() {
  const [state, setState] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    let active = true;

    loadAuthSession()
      .then((session) => {
        if (!active) return;
        setState(session ? { status: "ready", user: session.user } : { status: "guest" });
      })
      .catch(() => {
        if (!active) return;
        setState({ status: "guest" });
      });

    return () => {
      active = false;
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
