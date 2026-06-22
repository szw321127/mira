export type PublicUser = {
  id: string;
  email: string;
  status: "enabled" | "disabled";
};

type UserLike = {
  id: string;
  email: string;
  status: "enabled" | "disabled";
};

type LoginRequestLike = {
  email?: unknown;
  code?: unknown;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function parseCodeRequest(value: unknown): { email: string } | null {
  const email = normalizeEmail(readEmail(value));
  if (!isValidEmail(email)) {
    return null;
  }
  return { email };
}

export function parseLoginRequest(
  value: unknown
): { email: string; code: string } | null {
  const email = normalizeEmail(readEmail(value));
  const code = readCode(value).trim();
  if (!isValidEmail(email) || !CODE_PATTERN.test(code)) {
    return null;
  }
  return { email, code };
}

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status
  };
}

function readEmail(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  return (value as LoginRequestLike).email;
}

function readCode(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const code = (value as LoginRequestLike).code;
  return typeof code === "string" ? code : "";
}
