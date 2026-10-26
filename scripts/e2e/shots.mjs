// 역할별 화면 캡처(pnpm e2e:shots): 이 컴퓨터의 Chrome을 헤드리스로 띄워 시험 계정(부서·성과관리팀·관리자)으로 화면을 찍습니다.
// 인자 없이 부르면 주요 화면 전부, 인자로 [["pmo","/cards","이름", { click, key, type, eval, full }], ...] JSON을 주면 그 화면만(eval = 찍기 전에 페이지에서 실행할 글 — 예: 접힌 상자 열기). 폭·높이는 VW·VH(기본 1440×900).
// 브라우저 콘솔 오류·경고도 함께 출력합니다. 끝나면 시험 계정을 지웁니다(데이터는 바꾸지 않음).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { guardProduction } from "../lib/db-target.ts";

guardProduction("e2e:shots");
const BASE = "http://localhost:3000";
const OUT = process.env.E2E_SHOTS ?? join(tmpdir(), "pdca-e2e-shots");
mkdirSync(OUT, { recursive: true });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
async function ensureUser(email, role, teamName) {
  const { data: team } = teamName ? await admin.from("teams").select("id").eq("name", teamName).single() : { data: null };
  let { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) { const { data } = await admin.auth.admin.createUser({ email, email_confirm: true }); p = { id: data.user.id }; }
  await admin.from("profiles").update({ role, team_id: team?.id ?? null, display_name: role === "dept_user" ? "이시험 차장" : role === "pmo" ? "박시험 차장" : "관리 시험" }).eq("id", p.id);
}
async function del(email) {
  const { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (p) { const { error } = await admin.auth.admin.deleteUser(p.id); if (error) console.error("삭제 실패", email, error.message); }
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: Number(process.env.VW ?? 1440), height: Number(process.env.VH ?? 900) }, deviceScaleFactor: 1, locale: "ko-KR" });
  const page = await ctx.newPage();
  page.on("console", async (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?")));
    console.log(`[콘솔 ${m.type()}] ${page.url().replace(BASE, "")} ${args.map((a) => String(a).slice(0, 900)).join(" | ")}`);
  });
  page.on("pageerror", (e) => console.log(`[페이지 오류] ${page.url().replace(BASE, "")} ${String(e).slice(0, 600)}`));
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30000 });
  return page;
}
const DEFAULT = [
  ["pmo", "/dashboard", "pmo-dashboard"],
  ["pmo", "/cards", "pmo-cards"],
  ["pmo", "/inspections", "pmo-inspections"],
  ["pmo", "/inspections/summary", "pmo-inspection-summary"],
  ["pmo", "/links", "pmo-links"],
  ["pmo", "/reports", "pmo-reports"],
  ["pmo", "/reports/outline", "pmo-outline"],
  ["pmo", "/knowledge", "pmo-knowledge"],
  ["pmo", "/my", "pmo-dept-preview"],
  ["dept", "/my", "dept-my"],
  ["dept", "/my/inspections", "dept-inspections"],
  ["dept", "/my/report", "dept-report"],
  ["admin", "/admin/library", "admin-library"],
  ["admin", "/admin/users", "admin-users"],
  ["admin", "/admin/usage", "admin-usage"],
  ["dept", "/help", "dept-help"],
];
// 화면 목록 JSON은 「--」로 시작하지 않는 첫 인자(--allow-production 같은 플래그를 JSON으로 읽어 실패하던 것을 막음 — 2026-10-10)
const listArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const shots = listArg ? JSON.parse(listArg) : DEFAULT;
const users = { dept: ["pdca-shot-dept@kca.kr", "dept_user", "검사기획팀"], pmo: ["pdca-shot-pmo@kca.kr", "pmo", null], admin: ["pdca-shot-admin@kca.kr", "admin", null] };
try {
  const pages = {};
  for (const [who, path, name, opts] of shots) {
    if (!pages[who]) { await ensureUser(...users[who]); pages[who] = await session(users[who][0]); }
    const page = pages[who];
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    if (opts?.click) { await page.getByRole("button", { name: opts.click }).first().click(); await page.waitForTimeout(1200); }
    if (opts?.eval) { await page.evaluate(opts.eval); await page.waitForTimeout(500); }
    if (opts?.key) { await page.keyboard.press(opts.key); await page.waitForTimeout(500); if (opts.type) { await page.keyboard.type(opts.type); await page.waitForTimeout(400); } }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: Boolean(opts?.full) });
    console.log("찍음", name);
  }
} finally {
  await browser.close();
  for (const u of Object.values(users)) await del(u[0]);
  console.log(`화면: ${OUT}`);
}
