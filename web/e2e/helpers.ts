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
  // The first sign-up after a server start can be slow (cold connections); later ones take ~2 s.
  await expect(page.getByText("Latest player cards")).toBeVisible({ timeout: 60_000 });
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
  await page.waitForURL(/\/matches\/[0-9a-f-]{36}/);
  await playKeyMoments(page);
  await skipToResult(page);
  await expect(page.getByText("Match stats")).toBeVisible();
}

const momentLabel = async (page: Page) => {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.count())) return "";
  return `${await dialog.getByText(/^Key moment/).textContent()}|${await dialog.getByRole("heading").textContent()}`;
};

/** Plays an interactive match through every key moment (first option each time) until full time. */
export async function playKeyMoments(page: Page) {
  const dialog = page.getByRole("dialog");
  const skip = page.getByRole("button", { name: /Skip to result|Watch replay/ }); // full time reached
  const next = page.getByRole("button", { name: "Next moment" });
  for (let i = 0; i < 20; i++) {
    await expect(dialog.or(skip).or(next).first()).toBeVisible({ timeout: 60_000 });
    if (await skip.isVisible()) return;
    if (await dialog.isVisible()) {
      const label = await momentLabel(page);
      await dialog.getByRole("button").first().click();
      // Wait until this moment is resolved (the next one, or full time, replaces it).
      await expect.poll(() => momentLabel(page).catch(() => ""), { timeout: 60_000 }).not.toBe(label);
      continue;
    }
    await next.click().catch(() => {}); // the clock may reach the moment by itself first
  }
  throw new Error("the match never reached full time");
}

/** Ends the full-time replay (it may already have finished on its own). */
export async function skipToResult(page: Page) {
  const skip = page.getByRole("button", { name: "Skip to result" });
  if (await skip.isVisible()) await skip.click().catch(() => {});
  await expect(page.getByRole("button", { name: "Watch replay" })).toBeVisible();
}
