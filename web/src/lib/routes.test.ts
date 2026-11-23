import { describe, expect, it } from "vitest";

import { isAuthPath, isProtectedPath, safeNextPath } from "./routes";

describe("isProtectedPath", () => {
  it.each(["/dashboard", "/team/abc", "/marketplace", "/settings"])("protects %s", (p) => {
    expect(isProtectedPath(p)).toBe(true);
  });
  it.each(["/", "/login", "/signup", "/auth/confirm", "/dashboards-public"])("leaves %s public", (p) => {
    expect(isProtectedPath(p)).toBe(false);
  });
});

describe("isAuthPath", () => {
  it("detects auth pages", () => {
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/signup")).toBe(true);
    expect(isAuthPath("/dashboard")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/team/123?tab=bench")).toBe("/team/123?tab=bench");
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/ok\r\nSet-Cookie: x=y",
    null,
    42,
  ])("blocks open redirect %j", (next) => {
    expect(safeNextPath(next)).toBe("/dashboard");
  });
});
