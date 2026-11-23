import { describe, expect, it } from "vitest";

import { signInSchema, signUpSchema, USERNAME_PATTERN } from "./auth";

describe("signUpSchema", () => {
  const valid = { username: "legend_99", email: "Manager@Example.com ", password: "goal2026!" };

  it("accepts valid input and normalises the e-mail", () => {
    const parsed = signUpSchema.parse(valid);
    expect(parsed.email).toBe("manager@example.com");
  });

  it.each(["ab", "this_name_is_way_too_long", "bad name", "drop;table", "émile"])(
    "rejects username %j",
    (username) => {
      expect(signUpSchema.safeParse({ ...valid, username }).success).toBe(false);
    },
  );

  it.each(["short1", "allletters", "12345678", "x".repeat(73) + "1"])("rejects password %j", (password) => {
    expect(signUpSchema.safeParse({ ...valid, password }).success).toBe(false);
  });

  it("rejects malformed e-mail", () => {
    expect(signUpSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("matches the database CHECK constraint pattern", () => {
    // Keep in sync with profiles.username CHECK in the core schema migration.
    expect(USERNAME_PATTERN.source).toBe("^[A-Za-z0-9_]{3,20}$");
  });
});

describe("signInSchema", () => {
  it("requires a password", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});
