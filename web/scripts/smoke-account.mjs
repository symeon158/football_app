#!/usr/bin/env node
/**
 * End-to-end check of Settings → password change, data export and account
 * deletion, against a running app + local Supabase. Uses its own throwaway
 * account (it deletes it). Server actions are driven through Next's action
 * protocol exactly as the browser would call them.
 *
 *   npm run build && npm run start   # in one terminal
 *   npm run smoke:account            # in another
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
let failures = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "✓" : "✗"} ${name}${!cond && extra ? `  → ${extra}` : ""}`); if (!cond) failures++; };

const id = Date.now().toString(36);
const user = { username: `acct_${id}`, email: `acct_${id}@example.test`, password: "Kickoff2026" };
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: su } = await anon().auth.signUp({ email: user.email, password: user.password, options: { data: { username: user.username } } });
const uid = su.user.id;
let cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(su.session)).toString("base64url")}`;

/** Finds a server action's id in the page's client chunks by its exported name. */
async function actionId(page, name) {
  const html = await (await fetch(BASE + page, { headers: { cookie } })).text();
  const chunks = [...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const c of chunks) {
    const js = await (await fetch(BASE + c)).text();
    const m = js.match(new RegExp(`createServerReference\\)\\("([0-9a-f]{40,})"[^)]*?"${name}"`)) ?? js.match(new RegExp(`\\("([0-9a-f]{40,})",[^)]*?"${name}"\\)`));
    if (m) return m[1];
  }
  throw new Error(`action ${name} not found`);
}
async function callAction(page, name, args) {
  const res = await fetch(BASE + page, {
    method: "POST",
    headers: { cookie, "next-action": await actionId(page, name), accept: "text/x-component", "content-type": "text/plain;charset=UTF-8", origin: BASE },
    body: JSON.stringify(args),
    redirect: "manual",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8");
  // Parse RSC rows sequentially: "id:<json>\n", or "id:T<hexByteLength>,<text>"
  // (text rows carry no trailing newline, so the next row follows directly).
  const rows = {};
  let i = 0;
  while (i < buf.length) {
    const colon = buf.indexOf(0x3a, i);
    if (colon < 0) break;
    const rowId = buf.subarray(i, colon).toString("utf8").trim();
    if (buf[colon + 1] === 0x54 /* T */) {
      const comma = buf.indexOf(0x2c, colon);
      const len = parseInt(buf.subarray(colon + 2, comma).toString("utf8"), 16);
      rows[rowId] = buf.subarray(comma + 1, comma + 1 + len).toString("utf8");
      i = comma + 1 + len;
    } else {
      const nl = buf.indexOf(0x0a, colon);
      const end = nl < 0 ? buf.length : nl;
      rows[rowId] = buf.subarray(colon + 1, end).toString("utf8");
      i = end + 1;
    }
  }
  const resultRow = Object.values(rows).reverse().find((v) => v.startsWith("{") && v.includes('"ok"'));
  const result = resultRow ? JSON.parse(resultRow) : null;
  if (result && typeof result.data === "string" && /^\$\d+$/.test(result.data)) result.data = rows[result.data.slice(1)];
  return { status: res.status, location: res.headers.get("x-action-redirect") ?? res.headers.get("location"), result, raw: text };
}

const settings = await (await fetch(BASE + "/settings", { headers: { cookie } })).text();
check("settings page renders with private e-mail shown only to the owner", settings.includes(user.email) && settings.includes("Delete account"));

// Password change
const wrong = await callAction("/settings", "changePassword", [{ current: "NotMyPassword1", next: "NewKickoff2027" }]);
check("wrong current password is rejected", wrong.result?.ok === false && /incorrect/.test(wrong.result?.message), JSON.stringify(wrong.result));
const changed = await callAction("/settings", "changePassword", [{ current: user.password, next: "NewKickoff2027" }]);
check("password can be changed", changed.result?.ok === true, JSON.stringify(changed.result) + changed.raw.slice(0, 200));
const oldLogin = await anon().auth.signInWithPassword({ email: user.email, password: user.password });
const newLogin = await anon().auth.signInWithPassword({ email: user.email, password: "NewKickoff2027" });
check("old password no longer works, new one does", Boolean(oldLogin.error) && !newLogin.error);
user.password = "NewKickoff2027";
if (newLogin.data.session) cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(newLogin.data.session)).toString("base64url")}`;

// Data export
const exported = await callAction("/settings", "exportMyData", [{}]);
let doc = null;
try { doc = JSON.parse(exported.result?.data ?? "null"); } catch { /* fallthrough */ }
check("data export contains my profile, ledger and cards", doc?.profile?.username === user.username && doc.coin_transactions.length >= 1 && doc.cards.length === 17, exported.raw.slice(0, 200));
check("data export contains no other user's data", JSON.stringify(doc).includes(user.username) && !JSON.stringify(doc).includes("smoke_"));

// Deletion
const badName = await callAction("/settings", "deleteMyAccount", [{ confirmUsername: "someone_else", password: user.password }]);
check("deletion refused when the username doesn't match", badName.result?.ok === false);
const badPass = await callAction("/settings", "deleteMyAccount", [{ confirmUsername: user.username, password: "WrongPass123" }]);
check("deletion refused with the wrong password", badPass.result?.ok === false);
const del = await callAction("/settings", "deleteMyAccount", [{ confirmUsername: user.username, password: user.password }]);
check("account deletion succeeds and redirects home", (del.location ?? "").includes("deleted=1") || del.raw.includes("deleted=1"), `${del.status} ${del.location} ${del.raw.slice(0, 160)}`);
const afterLogin = await anon().auth.signInWithPassword({ email: user.email, password: user.password });
check("deleted account can no longer sign in", Boolean(afterLogin.error));
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { count } = await service.from("profiles").select("id", { count: "exact", head: true }).eq("id", uid);
check("profile and game data are gone", count === 0, String(count));

console.log(failures ? `\n${failures} check(s) failed` : "\nAll account checks passed");
process.exit(failures ? 1 : 0);
