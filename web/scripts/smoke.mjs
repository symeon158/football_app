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

for (const path of ["/club", "/collection", "/team", "/stadium", "/marketplace", "/matches", "/challenges", "/leaderboards", "/profile", "/settings"]) {
  const res = await get(path);
  const html = await res.text();
  check(`${path} renders for signed-in user`, res.status === 200 && html.includes("Coming soon"), String(res.status));
}

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

// 6. Sign out
const signout = await submitForm("/dashboard", {});
check("sign-out redirects to login", [303, 307].includes(signout.status) && signout.headers.get("location")?.includes("/login"),
  `${signout.status} ${signout.headers.get("location")}`);
check("dashboard protected again after sign-out", (await get("/dashboard")).status === 307);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
