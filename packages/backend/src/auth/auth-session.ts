import type { Response } from "express";

export const USER_SESSION_COOKIE = "mira_user_session";
export const USER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName !== name) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function readUserSessionToken(cookieHeader: string | undefined): string | undefined {
  return readCookie(cookieHeader, USER_SESSION_COOKIE);
}

export function setUserSessionCookie(response: Response, token: string): void {
  response.cookie(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: USER_SESSION_MAX_AGE_SECONDS * 1000
  });
}

export function clearUserSessionCookie(response: Response): void {
  response.clearCookie(USER_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
}
