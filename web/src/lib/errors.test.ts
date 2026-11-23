import { describe, expect, it } from "vitest";

import { toUserMessage } from "./errors";

describe("toUserMessage", () => {
  it("maps known game errors", () => {
    expect(toUserMessage({ message: "INSUFFICIENT_FUNDS" })).toMatch(/enough Football Coins/);
  });
  it("never leaks raw database errors", () => {
    expect(toUserMessage({ message: 'relation "private.audit_log" does not exist' })).toBe(
      "Something went wrong. Please try again.",
    );
    expect(toUserMessage(null)).toBe("Something went wrong. Please try again.");
  });
});
