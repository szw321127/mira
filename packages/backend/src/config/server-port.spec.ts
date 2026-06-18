import { resolveServerPort } from "./server-port.js";

describe("resolveServerPort", () => {
  it("prefers BACKEND_PORT for local backend development", () => {
    expect(resolveServerPort({ BACKEND_PORT: "3001", PORT: "3000" })).toBe(3001);
  });

  it("falls back to PORT for Docker deployment", () => {
    expect(resolveServerPort({ PORT: "3000" })).toBe(3000);
  });

  it("defaults to the local backend port", () => {
    expect(resolveServerPort({})).toBe(3001);
  });
});
