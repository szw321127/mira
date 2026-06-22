import { readCookie, readUserSessionToken, USER_SESSION_COOKIE } from "./auth-session.js";

describe("auth session cookies", () => {
  it("returns undefined for malformed percent encoding", () => {
    expect(readCookie(`${USER_SESSION_COOKIE}=%E0%A4%A`, USER_SESSION_COOKIE)).toBeUndefined();
    expect(
      readUserSessionToken(`${USER_SESSION_COOKIE}=%E0%A4%A`)
    ).toBeUndefined();
  });
});
