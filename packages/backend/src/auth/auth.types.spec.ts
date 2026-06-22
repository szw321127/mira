import {
  parseCodeRequest,
  parseLoginRequest,
  normalizeEmail,
  isValidEmail
} from "./auth.types.js";

describe("auth types", () => {
  it("normalizes and validates email addresses", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("returns null for invalid code requests", () => {
    expect(parseCodeRequest({ email: "User@Example.COM " })).toEqual({
      email: "user@example.com"
    });
    expect(parseCodeRequest({ email: "bad" })).toBeNull();
    expect(parseCodeRequest({})).toBeNull();
  });

  it("returns null for invalid login requests", () => {
    expect(parseLoginRequest({ email: "User@Example.COM ", code: "123456" })).toEqual({
      email: "user@example.com",
      code: "123456"
    });
    expect(parseLoginRequest({ email: "user@example.com", code: "12345" })).toBeNull();
    expect(parseLoginRequest({ email: "bad", code: "123456" })).toBeNull();
  });
});
