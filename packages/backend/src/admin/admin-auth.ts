import {
  createHmac,
  timingSafeEqual
} from "node:crypto";
export { hashPassword, verifyPassword } from "../security/password-hash.js";

export function signSession(username: string, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ username, createdAt: Date.now() }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(
  token: string | undefined,
  secret: string
): { username: string } | null {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(new Uint8Array(signatureBuffer), new Uint8Array(expectedBuffer))
  ) {
    return null;
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    if (
      decoded &&
      typeof decoded === "object" &&
      "username" in decoded &&
      typeof decoded.username === "string"
    ) {
      return { username: decoded.username };
    }
  } catch {
    return null;
  }

  return null;
}
