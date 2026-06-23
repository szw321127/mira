export type PublicUser = {
  id: string;
  email: string | null;
  username: string | null;
  status: "enabled" | "disabled";
};

type UserLike = {
  id: string;
  email: string | null;
  username: string | null;
  status: "enabled" | "disabled";
};

type LoginRequestLike = {
  email?: unknown;
  code?: unknown;
};

type PasswordRegisterRequestLike = {
  username?: unknown;
  password?: unknown;
};

type PasswordLoginRequestLike = {
  identifier?: unknown;
  password?: unknown;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6}$/;
const USERNAME_PATTERN = /^[a-z0-9_-]{3,32}$/;
const PASSWORD_MIN_LENGTH = 8;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: unknown): boolean {
  const email = normalizeEmail(value);
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidUsername(value: unknown): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= PASSWORD_MIN_LENGTH;
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

export function parsePasswordRegisterRequest(
  value: unknown
): { username: string; password: string } | null {
  const username = normalizeUsername(readUsername(value));
  const password = readPassword(value);
  if (!isValidUsername(username) || !isValidPassword(password)) {
    return null;
  }
  return { username, password };
}

export function parsePasswordLoginRequest(
  value: unknown
): { identifier: string; password: string } | null {
  const identifier = normalizeEmail(readIdentifier(value));
  const password = readPassword(value);
  if (!identifier || !isValidPassword(password)) {
    return null;
  }
  return { identifier, password };
}

export function parseBindEmailRequest(
  value: unknown
): { email: string; code: string } | null {
  return parseLoginRequest(value);
}

export function toPublicUser(user: UserLike): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
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

function readUsername(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as PasswordRegisterRequestLike).username;
}

function readIdentifier(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  return (value as PasswordLoginRequestLike).identifier;
}

function readPassword(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const password = (value as PasswordRegisterRequestLike).password;
  return typeof password === "string" ? password : "";
}
