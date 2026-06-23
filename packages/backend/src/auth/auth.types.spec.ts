import {
  parseCodeRequest,
  parseBindEmailRequest,
  parseLoginRequest,
  parsePasswordLoginRequest,
  parsePasswordRegisterRequest,
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

  it("normalizes password registration requests", () => {
    expect(
      parsePasswordRegisterRequest({
        username: " Mira_User ",
        password: "strong-pass-123"
      })
    ).toEqual({
      username: "mira_user",
      password: "strong-pass-123"
    });
    expect(
      parsePasswordRegisterRequest({
        username: "ab",
        password: "strong-pass-123"
      })
    ).toBeNull();
    expect(
      parsePasswordRegisterRequest({
        username: "mira user",
        password: "strong-pass-123"
      })
    ).toBeNull();
    expect(
      parsePasswordRegisterRequest({
        username: "mirauser",
        password: "short"
      })
    ).toBeNull();
  });

  it("normalizes password login identifiers", () => {
    expect(
      parsePasswordLoginRequest({
        identifier: " User@Example.COM ",
        password: "strong-pass-123"
      })
    ).toEqual({
      identifier: "user@example.com",
      password: "strong-pass-123"
    });
    expect(
      parsePasswordLoginRequest({
        identifier: " MiraUser ",
        password: "strong-pass-123"
      })
    ).toEqual({
      identifier: "mirauser",
      password: "strong-pass-123"
    });
    expect(
      parsePasswordLoginRequest({ identifier: "", password: "strong-pass-123" })
    ).toBeNull();
    expect(
      parsePasswordLoginRequest({ identifier: "mirauser", password: "" })
    ).toBeNull();
  });

  it("normalizes bind-email verification requests", () => {
    expect(parseBindEmailRequest({ email: " User@Example.COM ", code: "123456" }))
      .toEqual({
        email: "user@example.com",
        code: "123456"
      });
    expect(parseBindEmailRequest({ email: "bad", code: "123456" })).toBeNull();
    expect(parseBindEmailRequest({ email: "user@example.com", code: "12345" }))
      .toBeNull();
  });
});
