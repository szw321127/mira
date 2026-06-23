import type { AuthSession } from "./auth-types";

type BackendMessage = {
  message?: string;
  error?: string;
};

const AUTH_SESSION_TIMEOUT_MS = 5000;

async function readJson<T>(response: Response): Promise<T | null> {
  const value: unknown = await response.json().catch(() => null);
  return value as T | null;
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined" || typeof AbortSignal.timeout !== "function") {
    return undefined;
  }
  return AbortSignal.timeout(timeoutMs);
}

function readBackendMessage(value: BackendMessage | null, fallback: string) {
  return value?.message || value?.error || fallback;
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    signal: createTimeoutSignal(AUTH_SESSION_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  return readJson<AuthSession>(response);
}

export async function requestEmailCode(email: string): Promise<void> {
  const response = await fetch("/api/auth/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const data = await readJson<BackendMessage>(response);
    throw new Error(readBackendMessage(data, "验证码发送失败"));
  }
}

export async function loginWithEmailCode(
  email: string,
  code: string,
): Promise<AuthSession> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });

  if (!response.ok) {
    const data = await readJson<BackendMessage>(response);
    throw new Error(readBackendMessage(data, "登录失败"));
  }

  const session = await readJson<AuthSession>(response);
  if (!session) {
    throw new Error("登录失败");
  }

  return session;
}

export async function logoutAuthSession(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
  });

  if (!response.ok) {
    const data = await readJson<BackendMessage>(response);
    throw new Error(readBackendMessage(data, "退出登录失败"));
  }
}
