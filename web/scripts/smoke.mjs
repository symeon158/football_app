#!/usr/bin/env node
/**
 * End-to-end smoke test against a running app + local Supabase stack.
 *
 *   npm run build && npm run start      # in one terminal
 *   npm run smoke                       # in another
 *
 * Signs up a fresh user through the real sign-up form (server action,
 * progressive-enhancement POST), then checks provisioning, route protection
 * and that the browser-side key cannot tamper with coins.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${!cond && extra ? `  → ${extra}` : ""}`);
  if (!cond) failures++;
};

const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const store = (res) =>
  res.headers.getSetCookie().forEach((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const v = pair.slice(i + 1);
    if (v) jar.set(pair.slice(0, i), v);
    else jar.delete(pair.slice(0, i));
  });
const get = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: cookieHeader() }, ...opts });
  store(res);
  return res;
};
const decode = (s) =>
  s.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

async function submitForm(path, fields) {
  const html = await (await get(path)).text();
  const form = new FormData();
  for (const m of html.matchAll(/<input type="hidden" name="(\$ACTION[^"]*)"(?: value="([^"]*)")?/g)) {
    form.append(m[1], decode(m[2] ?? ""));
  }
  // Other server-rendered hidden fields (e.g. the kick-off idempotency key), unless overridden.
  for (const m of html.matchAll(/<input type="hidden" name="([a-zA-Z][\w-]*)" value="([^"]*)"/g)) {
    if (!(m[1] in fields)) form.append(m[1], decode(m[2]));
  }
  form.lastHtml = html;
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return get(path, { method: "POST", body: form, headers: { cookie: cookieHeader() } });
}

const suffix = Date.now().toString(36);
const user = { username: `smoke_${suffix}`, email: `smoke_${suffix}@example.test`, password: "Kickoff2026" };

// 1. Public pages and route protection
check("landing page renders", (await get("/")).status === 200);
const anonDash = await get("/dashboard");
check("anonymous /dashboard redirects to login", anonDash.status === 307 &&
  anonDash.headers.get("location")?.includes("/login?next=%2Fdashboard"), anonDash.headers.get("location"));

// 2. Validation errors come back from the server action
const bad = await submitForm("/signup", { ...user, username: "x", password: "short" });
const badHtml = await bad.text();
check("invalid sign-up is rejected with field errors", bad.status === 200 && badHtml.includes("Use at least 8 characters"));

// 3. Real sign-up
const signup = await submitForm("/signup", user);
check("sign-up redirects to dashboard", [303, 307].includes(signup.status) &&
  signup.headers.get("location")?.endsWith("/dashboard"), `${signup.status} ${signup.headers.get("location")}`);
check("session cookie set", [...jar.keys()].some((k) => k.startsWith("sb-")));
if (![303, 307].includes(signup.status)) {
  const msg = (await signup.text()).match(/role="alert"[^>]*>([^<]+)</)?.[1] ?? "unknown";
  console.error(`
Sign-up failed (${msg}); later checks depend on it, stopping.`);
  console.error("If this says 'Too many attempts', the local auth rate limit was hit (supabase/config.toml).");
  process.exit(1);
}

// 4. Dashboard shows provisioned club
const dash = await get("/dashboard");
const dashHtml = await dash.text();
check("dashboard renders for signed-in user", dash.status === 200);
check("dashboard shows username", dashHtml.includes(user.username));
check("dashboard shows 1,000 FC", dashHtml.includes("1,000"));
check("dashboard shows team and rating", dashHtml.includes(`${user.username} FC`) && dashHtml.includes("Team rating"));
for (const section of ["Latest player cards", "Challenges", "Recent results", "Stadium", "Manager level"]) {
  check(`dashboard has "${section}" section`, dashHtml.includes(section));
}
check("dashboard renders 6 player cards", (dashHtml.match(/<article aria-label=/g) ?? []).length === 6);
check("dashboard lists daily challenges", dashHtml.includes("Daily Victory"));

for (const path of ["/settings"]) {
  const res = await get(path);
  const html = await res.text();
  check(`${path} renders for signed-in user`, res.status === 200 && html.includes("Coming soon"), String(res.status));
}

// Phase 3: collection, filters, player profile, comparison
const colHtml = await (await get("/collection")).text();
const cardIds = [...new Set([...colHtml.matchAll(/href="\/players\/([0-9a-f-]{36})"/g)].map((m) => m[1]))];
check("collection shows all 17 starter cards", colHtml.includes("Showing all 17 cards") && cardIds.length >= 16, `${cardIds.length} links`);
check("collection flags the starting XI", (colHtml.match(/title="In your starting XI"/g) ?? []).length === 11);
const rareHtml = await (await get("/collection?rarity=rare")).text();
check("rarity filter narrows results", rareHtml.includes("1 of 17 cards match"));
const tamperHtml = await (await get("/collection?rarity=mythic&position=XX&page=-3&sort=drop")).text();
check("tampered filters fall back safely", tamperHtml.includes("Showing all 17 cards"));
const noneHtml = await (await get("/collection?q=zzzzzz")).text();
check("search with no match shows empty state", noneHtml.includes("No cards match these filters"));
const playerHtml = await (await get(`/players/${cardIds[0]}`)).text();
for (const s of ["Attributes", "Player info", "Biography", "Career", "Market value", "In your collection"]) {
  check(`player page has "${s}"`, playerHtml.includes(s));
}
const missing = await (await get("/players/00000000-0000-4000-8000-000000000000")).text();
check("unknown player shows not-found", missing.includes("Player not found"));
const badId = await (await get("/players/not-a-uuid")).text();
check("malformed player id shows not-found", badId.includes("Player not found"));
const cmpHtml = await (await get(`/players/compare?ids=${cardIds[0]},${cardIds[1]}`)).text();
check("compare page renders head-to-head table", cmpHtml.includes("Head to head") && cmpHtml.includes("Overall"));
const cmpForm = await (await get(`/players/compare?slot=${cardIds[0]}&slot=${cardIds[2]}&slot=`)).text();
check("compare picker (GET form) works without JS", cmpForm.includes("Head to head"));

const loginWhileSignedIn = await get("/login");
check("signed-in user is bounced from /login", loginWhileSignedIn.status === 307 &&
  loginWhileSignedIn.headers.get("location")?.endsWith("/dashboard"));

// 5. Browser-key tampering attempts (what a malicious client could try)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
const { error: loginErr } = await sb.auth.signInWithPassword({ email: user.email, password: user.password });
check("API sign-in works", !loginErr, loginErr?.message);

const { data: wallets } = await sb.from("wallets").select("balance");
check("user sees exactly one wallet with 1000 FC", wallets?.length === 1 && wallets[0].balance === 1000, JSON.stringify(wallets));

const { error: walletErr } = await sb.from("wallets").update({ balance: 999999 }).neq("balance", -1);
check("cannot edit own coin balance", Boolean(walletErr), "update succeeded!");

const { error: ledgerErr } = await sb.from("coin_transactions").insert({
  user_id: (await sb.auth.getUser()).data.user.id, amount: 5000, balance_after: 6000,
  tx_type: "admin_adjustment", idempotency_key: "smoke:hack:1",
});
check("cannot write to the coin ledger", Boolean(ledgerErr), "insert succeeded!");

const { data: others } = await sb.from("card_ownership").select("user_id").neq("user_id", (await sb.auth.getUser()).data.user.id);
check("cannot see other users' cards", (others ?? []).length === 0);

const { data: after } = await sb.from("wallets").select("balance").single();
check("balance unchanged after tampering", after?.balance === 1000);

// Phase 4: team builder and squads
const teamHtml = await (await get("/team")).text();
check("team builder renders the pitch", teamHtml.includes("Pick your XI") && teamHtml.includes('aria-label="Pitch, 4-3-3"'));
check("team builder shows all 11 starters", ["GK:", "LB:", "RB:", "LW:", "ST:", "RW:"].every((p) => teamHtml.includes(`aria-label="${p}`)) && (teamHtml.match(/aria-label="(GK|LB|CB|RB|CM|LW|ST|RW): /g) ?? []).length === 11,
  String((teamHtml.match(/aria-label="(GK|LB|CB|RB|CM|LW|ST|RW): /g) ?? []).length));
check("team builder shows rating and chemistry", teamHtml.includes(">Rating<") && teamHtml.includes(">Chemistry<"));
const clubHtml = await (await get("/club")).text();
check("club page lists the active squad", clubHtml.includes("Active squad") && clubHtml.includes(`${user.username} FC`));

const uid = (await sb.auth.getUser()).data.user.id;
const { data: myTeam } = await sb.from("teams").select("id, captain_ownership_id, team_players(slot, ownership_id)").eq("is_active", true).single();
const slots = myTeam.team_players.map((tp) => ({ slot: tp.slot, ownership_id: tp.ownership_id }));
const { error: saveErr } = await sb.rpc("save_lineup", { p_team_id: myTeam.id, p_formation: "4-4-2", p_tactic: "defensive", p_captain: myTeam.captain_ownership_id, p_slots: slots });
check("save_lineup RPC accepts a valid line-up", !saveErr, saveErr?.message);
const savedHtml = await (await get("/team")).text();
check("saved formation is shown", savedHtml.includes('aria-label="Pitch, 4-4-2"'));

const { error: directErr } = await sb.from("team_players").insert({ team_id: myTeam.id, user_id: uid, ownership_id: slots[0].ownership_id, slot: 22 });
check("direct team_players writes are refused", Boolean(directErr), "insert succeeded!");
const { error: badCapErr } = await sb.rpc("save_lineup", { p_team_id: myTeam.id, p_formation: "4-3-3", p_tactic: "balanced", p_captain: slots.find((x) => x.slot >= 11).ownership_id, p_slots: slots });
check("bench captain rejected", badCapErr?.message === "CAPTAIN_NOT_STARTER", badCapErr?.message);

const { data: newTeamId, error: createErr } = await sb.rpc("create_team", { p_name: "Smoke Reserves", p_copy_from: myTeam.id });
check("create_team copies a squad", !createErr && Boolean(newTeamId), createErr?.message);
check("club page shows the new squad", (await (await get("/club")).text()).includes("Smoke Reserves"));
const copyHtml = await (await get(`/team?team=${newTeamId}`)).text();
check("copied squad opens in the builder", copyHtml.includes('aria-label="Pitch, 4-4-2"'));
const { error: delErr } = await sb.rpc("delete_team", { p_team_id: newTeamId });
check("delete_team removes it", !delErr, delErr?.message);
const { error: lastErr } = await sb.rpc("delete_team", { p_team_id: myTeam.id });
check("cannot delete the last squad", lastErr?.message === "LAST_TEAM", lastErr?.message);

// Phase 5: marketplace, packs, coin history
const mktHtml = await (await get("/marketplace")).text();
check("marketplace lists players for sale", /\d+ players for sale/.test(mktHtml) && mktHtml.includes("Transfer market"));
const highHtml = await (await get("/marketplace?min=85")).text();
const highRatings = [...highHtml.matchAll(/aria-label="[^"]*, (\d+) rated /g)].map((m) => Number(m[1]));
check("min-rating filter only shows 85+", highRatings.length > 0 && highRatings.every((r) => r >= 85), highRatings.join(","));

const { data: cheapest } = await sb.from("card_catalog").select("card_id, market_price").eq("is_purchasable", true).order("market_price").limit(1).single();
const key = crypto.randomUUID();
const before = (await sb.from("wallets").select("balance").single()).data.balance;
const { data: own1, error: buyErr } = await sb.rpc("buy_card", { p_card_id: cheapest.card_id, p_idempotency_key: key });
const afterBuy = (await sb.from("wallets").select("balance").single()).data.balance;
check("buy_card charges the market price", !buyErr && afterBuy === before - cheapest.market_price, buyErr?.message ?? `${before} → ${afterBuy}`);
const { data: own2 } = await sb.rpc("buy_card", { p_card_id: cheapest.card_id, p_idempotency_key: key });
const afterReplay = (await sb.from("wallets").select("balance").single()).data.balance;
check("replayed purchase is free and returns the same card", own2 === own1 && afterReplay === afterBuy);
const { data: icon } = await sb.from("card_catalog").select("card_id").eq("rarity", "icon").limit(1).single();
const { error: poorErr } = await sb.rpc("buy_card", { p_card_id: icon.card_id, p_idempotency_key: crypto.randomUUID() });
check("cannot buy what you can't afford", poorErr?.message === "INSUFFICIENT_FUNDS", poorErr?.message);

const packsHtml = await (await get("/marketplace/packs")).text();
check("packs page publishes odds", packsHtml.includes("Odds per card") && packsHtml.includes("80%") && packsHtml.includes("Guaranteed"));
const { data: bronze } = await sb.from("card_packs").select("id").eq("code", "bronze").single();
const { data: openingId, error: packErr } = await sb.rpc("open_pack", { p_pack_id: bronze.id, p_idempotency_key: crypto.randomUUID() });
check("open_pack opens a bronze pack", !packErr && Boolean(openingId), packErr?.message);
const revealHtml = await (await get(`/marketplace/packs/${openingId}`)).text();
check("reveal page shows 3 face-down cards", revealHtml.includes("Bronze Pack") && (revealHtml.match(/aria-label="(Reveal next card|Face-down card)"/g) ?? []).length === 3);
check("unknown pack opening is not found", (await (await get("/marketplace/packs/00000000-0000-4000-8000-000000000000")).text()).includes("could not be found"));
const histHtml = await (await get("/marketplace/history")).text();
check("coin history lists purchases", histHtml.includes("Bought player") && histHtml.includes("Opened pack") && histHtml.includes("Welcome bonus"));
const finalBal = (await sb.from("wallets").select("balance").single()).data.balance;
const { data: ledger } = await sb.from("coin_transactions").select("amount");
check("ledger sum equals wallet balance", ledger.reduce((a, r) => a + r.amount, 0) === finalBal);

// Phase 6: stadium builder
const stHtml = await (await get("/stadium")).text();
check("stadium page renders upgrades", stHtml.includes("Stadium builder") && stHtml.includes("Construction history") && stHtml.includes("5,000 seats"));
const balBefore = (await sb.from("wallets").select("balance").single()).data.balance;
const { data: lightCost } = await sb.from("stadium_upgrade_costs").select("cost").eq("category", "lighting").eq("level", 2).single();
const upKey = crypto.randomUUID();
const { data: newLevel, error: upErr } = await sb.rpc("upgrade_stadium", { p_category: "lighting", p_expected_level: 1, p_idempotency_key: upKey });
const balAfter = (await sb.from("wallets").select("balance").single()).data.balance;
check("upgrade_stadium raises the level and charges the price", !upErr && newLevel === 2 && balAfter === balBefore - lightCost.cost, upErr?.message ?? `${balBefore} → ${balAfter}`);
const { data: replayLevel } = await sb.rpc("upgrade_stadium", { p_category: "lighting", p_expected_level: 1, p_idempotency_key: upKey });
check("replayed upgrade is free", replayLevel === 2 && (await sb.from("wallets").select("balance").single()).data.balance === balAfter);
const { error: staleErr } = await sb.rpc("upgrade_stadium", { p_category: "lighting", p_expected_level: 1, p_idempotency_key: crypto.randomUUID() });
check("stale expected level is refused", staleErr?.message === "STADIUM_LEVEL_CHANGED", staleErr?.message);
const { error: directLvl } = await sb.from("stadiums").update({ seating_level: 5 }).eq("user_id", uid);
check("stadium levels cannot be set directly", Boolean(directLvl), "update succeeded!");
const { error: renameErr } = await sb.from("stadiums").update({ name: "Smoke Park", design_template: "fortress" }).eq("user_id", uid);
// React separates adjacent text nodes with <!-- --> in HTML; users never see them.
const visibleText = (html) => html.replaceAll("<!-- -->", "");
const st2 = visibleText(await (await get("/stadium")).text());
check("rename + design change show on the page", !renameErr && st2.includes("Smoke Park") && st2.includes("Fortress · Level"), renameErr?.message);
check("construction history lists the upgrade", st2.includes("Lighting</span> 1 → 2"));

// Phase 7: match engine
const centre = await (await get("/matches")).text();
check("Match Centre renders the kick-off form", centre.includes("Kick off") && centre.includes("Rewards") && centre.includes("Season record"));
const keyMatch = centre.match(/name="key" value="([^"]+)"/);
check("kick-off form carries a server-rendered idempotency key", Boolean(keyMatch));
const { data: activeTeam } = await sb.from("teams").select("id").eq("is_active", true).single();
const balBeforeMatch = (await sb.from("wallets").select("balance").single()).data.balance;
const kick = await submitForm("/matches", { teamId: activeTeam.id, tactic: "attacking", difficulty: "easy", key: keyMatch[1] });
const matchUrl = kick.headers.get("location") ?? "";
const matchId = matchUrl.match(/\/matches\/([0-9a-f-]{36})/)?.[1];
check("kick-off plays a match and redirects to it", [303, 307].includes(kick.status) && Boolean(matchId), `${kick.status} ${matchUrl}`);
const { data: played } = await sb.from("matches").select("home_score, away_score, reward_coins, xp_gained, difficulty, tactic, seed, engine_version").eq("id", matchId).single();
const { count: evCount } = await sb.from("match_events").select("seq", { count: "exact", head: true }).eq("match_id", matchId);
check("match stored with events, server rewards and settings", played?.difficulty === "easy" && played?.tactic === "attacking" && played.reward_coins > 0 && evCount >= 3,
  JSON.stringify(played));
const balAfterMatch = (await sb.from("wallets").select("balance").single()).data.balance;
check("match reward paid into the wallet", balAfterMatch === balBeforeMatch + played.reward_coins, `${balBeforeMatch} → ${balAfterMatch} (+${played.reward_coins})`);
const matchHtml = visibleText(await (await get(`/matches/${matchId}`)).text());
check("match page shows a verified, reproducible replay", matchHtml.includes("Verified replay") && matchHtml.includes(`${played.home_score} – ${played.away_score}`));
const again = await submitForm("/matches", { teamId: activeTeam.id, tactic: "attacking", difficulty: "easy", key: keyMatch[1] });
check("resubmitting the same form returns the same match", (again.headers.get("location") ?? "").includes(matchId), again.headers.get("location"));
check("resubmission is not paid twice", (await sb.from("wallets").select("balance").single()).data.balance === balAfterMatch);
const quick = await submitForm("/matches", { teamId: activeTeam.id, tactic: "balanced", difficulty: "normal" });
check("cooldown blocks an instant second kick-off", quick.status === 200 && (await quick.text()).includes("Catch your breath"));
const { error: cheatErr } = await sb.rpc("record_match", { p_user_id: uid, p_team_id: activeTeam.id, p_idempotency_key: "cheat-0000001", p_payload: { home_score: 9, away_score: 0 } });
check("players cannot call record_match", Boolean(cheatErr), "call succeeded!");
const histAfter = await (await get("/marketplace/history")).text();
check("coin history shows the match reward", histAfter.includes("Match reward"));
const dashAfter = visibleText(await (await get("/dashboard")).text());
check("dashboard recent results show the match", dashAfter.includes(`${played.home_score} – ${played.away_score}`) && !dashAfter.includes("No matches played yet"));

// Phase 8: challenges, achievements, leaderboards, profiles
const chHtml = visibleText(await (await get("/challenges")).text());
check("challenges page shows live progress from the match", chHtml.includes("Daily challenges") && chHtml.includes("Warm-up") && chHtml.includes("1/2"));
await new Promise((r) => setTimeout(r, 5500)); // match cooldown
const centre2 = await (await get("/matches")).text();
const key2 = centre2.match(/name="key" value="([^"]+)"/)?.[1];
const kick2 = await submitForm("/matches", { teamId: activeTeam.id, tactic: "balanced", difficulty: "easy", key: key2 });
check("second match played after the cooldown", [303, 307].includes(kick2.status), String(kick2.status));
const { data: chs } = await sb.rpc("get_challenges");
const warmup = chs.find((c) => c.code === "daily_play_2");
check("Warm-up completed by two matches", warmup?.completed === true && warmup?.progress === 2, JSON.stringify(warmup));
const balPreClaim = (await sb.from("wallets").select("balance").single()).data.balance;
const { data: claimed, error: claimErr } = await sb.rpc("claim_challenge", { p_challenge_id: warmup.id });
const balPostClaim = (await sb.from("wallets").select("balance").single()).data.balance;
check("claiming pays the reward", !claimErr && balPostClaim === balPreClaim + warmup.reward_coins && claimed.coins === warmup.reward_coins, claimErr?.message);
const { error: dupClaim } = await sb.rpc("claim_challenge", { p_challenge_id: warmup.id });
check("a challenge can only be claimed once", dupClaim?.message === "ALREADY_CLAIMED", dupClaim?.message);
const { data: achs } = await sb.rpc("get_achievements");
const locked = achs.find((a) => !a.unlocked);
const { error: lockedErr } = await sb.rpc("claim_achievement", { p_achievement_id: locked.id });
check("locked achievements cannot be claimed", achs.length === 7 && lockedErr?.message === "NOT_COMPLETED", lockedErr?.message);
const { error: forgeErr } = await sb.from("user_achievements").insert({ user_id: uid, achievement_id: locked.id, claimed_at: new Date().toISOString() });
check("achievements cannot be granted directly", Boolean(forgeErr), "insert succeeded!");

const lbHtml = visibleText(await (await get("/leaderboards?board=wins&period=week")).text());
check("leaderboard shows my rank", /You&#x27;re <span class="font-bold">#\d+<\/span>/.test(lbHtml));
const { data: board } = await sb.rpc("get_leaderboard", { p_board: "level", p_period: "all", p_limit: 20 });
const other = board.find((r) => !r.is_me);
const profHtml = visibleText(await (await get("/profile")).text());
check("profile page shows my stats and editor", profHtml.includes(`@${user.username}`) && profHtml.includes("Edit profile") && profHtml.includes("W–D–L"));
const { error: profErr } = await sb.from("profiles").update({ display_name: "Smoke Manager", avatar_key: "avatar-07" }).eq("id", uid);
check("display name and avatar are editable", !profErr && (await (await get("/profile")).text()).includes("Smoke Manager"), profErr?.message);
if (other) {
  const otherHtml = visibleText(await (await get(`/managers/${encodeURIComponent(other.username)}`)).text());
  check("public manager profile renders without private data", otherHtml.includes(`@${other.username}`) && otherHtml.includes("W–D–L") && !otherHtml.includes("@example.test"));
}
const meHtml = await (await get(`/managers/${user.username}`)).text();
// The redirect happens inside streamed content, so Next emits it as an instruction, not a 3xx.
check("my own manager page redirects to /profile", meHtml.includes("NEXT_REDIRECT;replace;/profile;"));
// (Every page embeds Next's not-found fallback, so check for the absence of a profile instead.)
check("unknown manager shows no profile", !visibleText(await (await get("/managers/no_such_manager_xyz")).text()).includes("W–D–L"));

// 6. Sign out
const signout = await submitForm("/dashboard", {});
check("sign-out redirects to login", [303, 307].includes(signout.status) && signout.headers.get("location")?.includes("/login"),
  `${signout.status} ${signout.headers.get("location")}`);
check("dashboard protected again after sign-out", (await get("/dashboard")).status === 307);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
