import { expect, test } from "@playwright/test";

import { coinBalance, playKeyMoments, playMatch, signUp, skipToResult } from "./helpers";

test.describe("Football Legends — core journeys", () => {
  test("sign up provisions a club and the dashboard shows it", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const { username } = await signUp(page);
    await expect(page.getByText(`${username} FC`).first()).toBeVisible();
    expect(await coinBalance(page)).toBe(1000);
    await expect(page.getByText("Team rating")).toBeVisible();
    await expect(page.locator("article[aria-label]")).toHaveCount(6);
    expect(errors).toEqual([]);
  });

  test("anonymous visitors are sent to sign in", async ({ page }) => {
    await page.goto("/collection");
    await expect(page).toHaveURL(/\/login\?next=%2Fcollection/);
  });

  test("team builder: drag a substitute onto the pitch, auto-pick and save", async ({ page }) => {
    await signUp(page);
    await page.goto("/team");
    const st = page.locator('[aria-label^="ST: "]').first();
    const bench = page.locator('[aria-label^="Bench: "]').first();
    const benchName = ((await bench.getAttribute("aria-label")) ?? "").replace("Bench: ", "").split(",")[0];

    const a = (await bench.boundingBox())!, b = (await st.boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 25; i++) await page.mouse.move(a.x + a.width / 2 + ((b.x - a.x) * i) / 25, a.y + a.height / 2 + ((b.y - a.y) * i) / 25);
    await page.mouse.up();
    await expect(page.locator(`[aria-label^="ST: ${benchName},"]`)).toHaveCount(1);
    await expect(page.getByText("You have unsaved changes.")).toBeVisible();

    await page.selectOption("select >> nth=0", "4-2-3-1");
    await page.getByRole("button", { name: "Auto-pick best XI" }).click();
    await page.getByRole("button", { name: "Save line-up" }).click();
    await expect(page.getByText("Line-up saved.")).toBeVisible();
    await page.reload();
    await expect(page.locator('section[aria-label="Pitch, 4-2-3-1"]')).toBeVisible();
  });

  test("economy: buy a player once (double-click), open a pack, upgrade the stadium", async ({ page }) => {
    await signUp(page);
    await page.goto("/marketplace?sort=price-asc");
    const buy = page.locator("button[aria-label^='Buy ']").first();
    const price = Number(((await buy.getAttribute("aria-label")) ?? "").match(/for (\d+) Football/)![1]);
    await buy.click();
    await page.getByRole("button", { name: "Confirm" }).dblclick();
    await expect(page.getByText("Bought!")).toBeVisible();
    await expect.poll(() => coinBalance(page)).toBe(1000 - price);

    await page.goto("/marketplace/packs");
    await expect(page.getByText("Odds per card").first()).toBeVisible();
    await page.locator("li:has-text('Bronze Pack') button:has-text('Open for')").click();
    await page.getByRole("button", { name: "Open pack" }).click();
    await page.waitForURL(/\/marketplace\/packs\/[0-9a-f-]{36}$/);
    await page.getByRole("button", { name: "Reveal all" }).click();
    await expect(page.getByRole("link", { name: "Open another" })).toBeVisible();
    await expect.poll(() => coinBalance(page)).toBe(1000 - price - 400);

    await page.goto("/stadium");
    await page.click("button[aria-label^='Upgrade Lighting to level 2']");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Upgraded to level 2!")).toBeVisible();
    await expect.poll(() => coinBalance(page)).toBe(1000 - price - 400 - 300);

    await page.goto("/marketplace/history");
    await expect(page.locator("tbody tr")).toHaveCount(4); // welcome, buy, pack, stadium
  });

  test("match: key moments, reward hidden until full time, result verified", async ({ page }) => {
    await signUp(page);
    await page.goto("/matches");
    await page.getByRole("button", { name: "Kick off" }).click();
    await page.waitForURL(/\/matches\/[0-9a-f-]{36}$/);
    await expect(page.locator('header [class*="border-gold/30"]').first()).toBeHidden();
    await expect(page.getByRole("dialog").getByText(/^Key moment/)).toBeVisible({ timeout: 60_000 });
    await playKeyMoments(page);
    await skipToResult(page);
    await expect(page.getByText("Man of the match")).toBeVisible();
    await expect(page.getByText(/Verified replay/)).toBeVisible();
    await expect(page.locator('header [class*="border-gold/30"]').first()).toBeVisible();
    expect(await coinBalance(page)).toBeGreaterThan(1000);
  });

  test("progression: two matches complete Warm-up, which pays once", async ({ page }) => {
    await signUp(page);
    await playMatch(page);
    await page.waitForTimeout(5500); // match cooldown
    await playMatch(page);
    await page.goto("/challenges");
    const before = await coinBalance(page);
    await page.getByRole("button", { name: "Claim reward for Warm-up" }).click();
    await expect(page.locator("li:has-text('Warm-up')").getByText("Claimed")).toBeVisible();
    await expect.poll(() => coinBalance(page)).toBe(before + 50);
    await page.reload();
    await expect(page.getByRole("button", { name: "Claim reward for Warm-up" })).toHaveCount(0);
  });

  test("settings: export my data, then delete the account", async ({ page }) => {
    const { username, password } = await signUp(page);
    await page.goto("/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    expect((await download).suggestedFilename()).toBe(`football-legends-${username}.json`);

    await page.getByRole("button", { name: "Delete my account…" }).click();
    const deleteForm = page.locator("form", { hasText: "cannot be undone" });
    await deleteForm.getByLabel("Username", { exact: true }).fill(username);
    await deleteForm.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await page.waitForURL(/\/\?deleted=1/);
    await expect(page.getByText("Your account and all its data have been deleted.")).toBeVisible();

    await page.goto("/login");
    await page.fill("#email", `${username}@example.test`);
    await page.fill("#password", password);
    await page.click("button[type=submit]");
    await expect(page.getByText("Invalid e-mail or password.")).toBeVisible();
  });

  test("challenge: play another manager's squad; they see the result and can challenge back", async ({ page, browser }) => {
    const other = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1440, height: 1500 } });
    const op = await other.newPage();
    const { username: opponent } = await signUp(op, "def");
    const { username: me } = await signUp(page, "chl");

    await page.goto(`/managers/${opponent}`);
    await page.getByRole("link", { name: `Challenge ${opponent}` }).click();
    await page.waitForURL(`**/matches/challenge/${opponent}`);
    await expect(page.getByText("Their starting XI")).toBeVisible();
    await expect(page.getByText(`Paid matches against ${opponent} today: 5 of 5 left`)).toBeVisible();
    await page.getByRole("button", { name: /^Challenge / }).click();
    await page.waitForURL(/\/matches\/[0-9a-f-]{36}$/);
    const matchPath = new URL(page.url()).pathname;
    await playKeyMoments(page);

    await op.goto("/matches");
    await expect(op.getByText(`${me} challenged you`).first()).toBeVisible();
    await op.goto(matchPath);
    await expect(op.getByText(`${me} challenged your club`)).toBeVisible();
    await expect(op.getByRole("link", { name: "Challenge back" })).toBeVisible();
    await other.close();
  });

  test("forgot password: e-mailed link lets the player choose a new password", async ({ page, context }) => {
    const { username, password } = await signUp(page);
    const email = `${username}@example.test`;
    await context.clearCookies();

    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.fill("#email", email);
    await page.click("button[type=submit]");
    await expect(page.getByText("a reset link is on its way")).toBeVisible();

    // Local Supabase delivers e-mail to Mailpit.
    const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
    let link: string | undefined;
    await expect
      .poll(async () => {
        const list = await (await fetch(`${mailpit}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
        if (!list.messages?.length) return undefined;
        const msg = await (await fetch(`${mailpit}/api/v1/message/${list.messages[0].ID}`)).json();
        link = String(msg.HTML || msg.Text).match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
        return link;
      }, { timeout: 30_000 })
      .toBeTruthy();

    await page.goto(link!);
    await page.waitForURL("**/reset-password");
    await page.fill("#password", "NewPass2026");
    await page.fill("#confirmPassword", "NewPass2026");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/dashboard\?password=updated/);
    await expect(page.getByText("Your password has been updated.")).toBeVisible();

    await context.clearCookies();
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click("button[type=submit]");
    await expect(page.getByText("Invalid e-mail or password.")).toBeVisible();
    await expect(page.locator("#email")).toHaveValue(email); // kept after a failed attempt
    await page.fill("#password", "NewPass2026");
    await page.click("button[type=submit]");
    await page.waitForURL("**/dashboard");
  });
});
