import { expect, test } from "@playwright/test";

import { noHorizontalOverflow, signUp } from "./helpers";

test("mobile: every game screen fits the phone width", async ({ page }) => {
  await signUp(page, "mob");
  for (const [path, marker] of [
    ["/dashboard", "Latest player cards"],
    ["/collection", "Showing all"],
    ["/team", "Pick your XI"],
    ["/marketplace", "players for sale"],
    ["/stadium", "Construction history"],
    ["/matches", "Season record"],
    ["/challenges", "Daily challenges"],
    ["/leaderboards", "Top managers"],
    ["/profile", "Badges"],
    ["/settings", "Account & privacy"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByText(marker).first()).toBeVisible();
    expect(await noHorizontalOverflow(page), `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

test("mobile: tap-to-place in the team builder", async ({ page }) => {
  await signUp(page, "mob");
  await page.goto("/team");
  const bench = page.locator('[aria-label^="Bench: "]').first();
  const name = ((await bench.getAttribute("aria-label")) ?? "").replace("Bench: ", "").split(",")[0];
  await bench.tap();
  await expect(page.getByText(`${name} selected`)).toBeVisible();
  await page.locator('[aria-label^="GK: "]').first().tap();
  await expect(page.locator(`[aria-label^="GK: ${name},"]`)).toHaveCount(1);
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible(); // sticky save bar
});
