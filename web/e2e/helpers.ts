import { expect, type Page } from "@playwright/test";

let counter = 0;

/** Creates a fresh manager through the real sign-up form and lands on the dashboard. */
export async function signUp(page: Page, prefix = "e2e") {
  const id = `${Date.now().toString(36)}${counter++}`;
  const username = `${prefix}_${id}`.slice(0, 20);
  const password = "Kickoff2026";
  await page.goto("/signup");
  await page.fill("#username", username);
  await page.fill("#email", `${username}@example.test`);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Latest player cards")).toBeVisible();
  return { username, password };
}

/** The exact coin balance from the top bar (below 10,000 it isn't abbreviated). */
export async function coinBalance(page: Page) {
  const text = await page.locator('header [class*="border-gold/30"]').first().textContent();
  return Number((text ?? "").replace(/[^\d]/g, ""));
}

export async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Plays one match from the Match Centre and skips to the result. */
export async function playMatch(page: Page, opts: { tactic?: string; difficulty?: string } = {}) {
  await page.goto("/matches");
  await expect(page.getByText("Season record")).toBeVisible();
  if (opts.tactic) await page.click(`label:has(input[value=${opts.tactic}])`);
  if (opts.difficulty) await page.click(`label:has(input[value=${opts.difficulty}])`);
  await page.getByRole("button", { name: "Kick off" }).click();
  await page.waitForURL(/\/matches\/[0-9a-f-]{36}\?live=1/);
  await page.getByRole("button", { name: "Skip to result" }).click();
  await expect(page.getByText("Match stats")).toBeVisible();
}
