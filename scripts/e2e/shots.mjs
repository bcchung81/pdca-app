// 역할별 화면 캡처(pnpm e2e:shots): 이 컴퓨터의 Chrome을 헤드리스로 띄워 시험 계정(부서·성과관리팀·관리자)으로 화면을 찍습니다.
// 인자 없이 부르면 주요 화면 전부, 인자로 [["pmo","/cards","이름", { click, key, type, eval, full }], ...] JSON을 주면 그 화면만(eval = 찍기 전에 페이지에서 실행할 글 — 예: 접힌 상자 열기). 폭·높이는 VW·VH(기본 1440×900).
// 인자는 계획 객체({ out, team, track, assign, fixtures, shots })나 @파일경로도 받습니다 — 단계(steps)·번호 표기(marks)·실명 자동 가림. 계약: data/manual/dept-user/shots-plan-contract.md
// 접속 주소는 E2E_BASE(기본 http://localhost:3000). --plan-only면 계획 검증과 「DB에 만들 것/지울 것」만 출력하고 끝냄(DB·브라우저에 닿지 않음).
// 브라우저 콘솔 오류·경고도 함께 출력합니다. 끝나면 시험 계정이 만든 데이터(작성본·점검표·카드 전용 자료·AI 기록) → 담당 지정 → 계정 순으로 지우고 표로 보입니다.
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { currentPeriod } from "../../lib/cards/view.ts";
import { guardProduction } from "../lib/db-target.ts";
import { CARD_PSEUDO, SHOT_USERS, UID_RE, cleanupTable, formatWrites, loadPlan, parseCardRef, personMaskPairs, planWrites, validatePlan } from "./shot-plan.mjs";
import { inspectionRow } from "./shot-fixtures.mjs";
import { applyMasks, drawMarks, runStep } from "./shot-marks.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
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
// 계획은 DB에 닿기 전에 검증(금지어 클릭 등) — 잘못되면 아무것도 만들지 않고 멈춤
const listArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const plan = listArg ? loadPlan(listArg) : { shots: DEFAULT };
const planErrors = validatePlan(plan, { fileExists: (p) => existsSync(resolve(ROOT, p)) });
const PERIOD = currentPeriod();

// 미리보기: 여기서 끝냄 — 아래의 운영 DB 보호·DB 클라이언트·폴더 만들기·브라우저는 이 줄 뒤에만 있음
if (process.argv.includes("--plan-only")) {
  console.log(planErrors.length ? `캡처 계획 오류:\n${planErrors.map((e) => `- ${e}`).join("\n")}` : `캡처 계획 검증 통과: ${plan.shots.length}장`);
  console.log(formatWrites(planWrites(plan, PERIOD)).join("\n"));
  process.exit(planErrors.length ? 1 : 0);
}
if (planErrors.length) { console.error(`캡처 계획 오류:\n${planErrors.map((e) => `- ${e}`).join("\n")}`); process.exit(1); }

guardProduction("e2e:shots");
const BASE = (process.env.E2E_BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const TRACK_COOKIE = "pdca_track"; // lib/tracks/index.ts TRACK_COOKIE와 같음(track-switch.tsx는 encodeURIComponent로 씀)
const MATERIAL_BUCKET = "card-materials"; // app/(app)/cards/materials-actions.ts — 경로는 {cards.uid}/{무작위}{확장자}
const shots = plan.shots;
const OUT = plan.out ? (isAbsolute(plan.out) ? plan.out : resolve(ROOT, plan.out)) : (process.env.E2E_SHOTS ?? join(tmpdir(), "pdca-e2e-shots"));

const DEFAULT_VIEWPORT = { width: Number(process.env.VW ?? 1440), height: Number(process.env.VH ?? 900) };
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
// 가림용 가상 이름(저장소에는 실명을 적지 않음 — 진짜 이름은 실행할 때 DB에서 읽음)
const PSEUDO = ["김가온", "이나래", "박다솜", "최라온", "정마루", "한소람", "오두리", "윤하늘", "강보람", "임새롬"];
async function ensureUser(email, role, teamName) {
  const { data: team } = teamName ? await admin.from("teams").select("id").eq("name", teamName).maybeSingle() : { data: null };
  if (teamName && !team) throw new Error(`팀을 찾을 수 없음: ${teamName}`);
  let { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) { const { data } = await admin.auth.admin.createUser({ email, email_confirm: true }); p = { id: data.user.id }; }
  await admin.from("profiles").update({ role, team_id: team?.id ?? null, display_name: role === "dept_user" ? "이시험 차장" : role === "pmo" ? "박시험 차장" : "관리 시험" }).eq("id", p.id);
  return p.id;
}
async function del(email) {
  const { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (p) { const { error } = await admin.auth.admin.deleteUser(p.id); if (error) console.error("삭제 실패", email, error.message); }
}
let browser;
// email이 없으면 로그인하지 않는 세션(anon)
async function session(email) {
  const ctx = await browser.newContext({ viewport: DEFAULT_VIEWPORT, deviceScaleFactor: 1, locale: "ko-KR" });
  if (plan.track) await ctx.addCookies([{ name: TRACK_COOKIE, value: encodeURIComponent(plan.track), url: BASE }]);
  const page = await ctx.newPage();
  page.on("console", async (m) => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?")));
    console.log(`[콘솔 ${m.type()}] ${page.url().replace(BASE, "")} ${args.map((a) => String(a).slice(0, 900)).join(" | ")}`);
  });
  page.on("pageerror", (e) => console.log(`[페이지 오류] ${page.url().replace(BASE, "")} ${String(e).slice(0, 600)}`));
  if (!email) return page;
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30000 });
  return page;
}
const users = { dept: [SHOT_USERS.dept.email, SHOT_USERS.dept.role, plan.team ?? "검사기획팀"], pmo: [SHOT_USERS.pmo.email, SHOT_USERS.pmo.role, null], admin: [SHOT_USERS.admin.email, SHOT_USERS.admin.role, null] };
const userIds = {};
let failedMarks = 0;
const key = (unit, no) => `${unit}\u0000${no}`;

// ── 시작 전(DB에 쓰기 전): 계획이 쓰는 카드를 찾고, fixtures 카드에 이미 데이터가 있으면 아무것도 만들지 않고 멈춤
// 계획이 쓰는 {{uid:평가단위:과제번호}}·assign·fixtures 카드를 DB에서 찾음(없으면 오류로 멈춤)
const refs = new Set([...JSON.stringify(shots).matchAll(UID_RE)].map((m) => key(m[1], m[2])));
for (const [u, t] of [...(plan.assign ?? []), ...(plan.fixtures ?? [])]) refs.add(key(u, t));
const cardOf = {};
for (const r of refs) {
  const [unit, no] = r.split("\u0000");
  const { data: c, error } = await admin.from("cards").select("id, uid").eq("eval_unit_id", unit).eq("task_no", no).maybeSingle();
  if (error) throw new Error(`카드 조회 실패 ${unit}:${no} — ${error.message}`);
  if (!c) throw new Error(`카드를 찾을 수 없음: ${unit}:${no}`);
  cardOf[r] = c;
}
const subst = (str) => str.replace(UID_RE, (_, unit, no) => cardOf[key(unit, no)].uid);
const fixtureCards = (plan.fixtures ?? []).map(([u, t]) => ({ ref: `${u}:${t}`, ...cardOf[key(u, t)] }));
const writes = planWrites(plan, PERIOD);
/** fixtures 카드 자료 폴더의 시작 때 파일(끝에 「시작 때 없던 파일」을 가려내는 기준) */
const baselineFiles = new Map();
async function folderFiles(uid) {
  const { data, error } = await admin.storage.from(MATERIAL_BUCKET).list(uid, { limit: 1000 });
  if (error) throw new Error(`저장소 목록 실패 ${uid} — ${error.message}`);
  return (data ?? []).filter((o) => o.id).map((o) => `${uid}/${o.name}`);
}

/** 성과관리팀 시험 계정 이름으로 점검표 1건을 「보냄」으로 넣음(서비스 키 — 결과는 shot-fixtures.mjs의 가상 점검표, 집계는 lib/inspections/model.ts) */
async function seedInspection(spec) {
  const [unit, no] = parseCardRef(spec.card);
  userIds.pmo ??= await ensureUser(...users.pmo);
  const { error } = await admin.from("inspections").insert({ card_id: cardOf[key(unit, no)].id, period: spec.period ?? PERIOD, status: "sent", created_by: userIds.pmo, ...inspectionRow() });
  if (error) throw new Error(`점검표 넣기 실패 ${spec.card} — ${error.message}`);
  console.log(`점검표 넣음 ${spec.card} ${spec.period ?? PERIOD} 보냄`);
}

/** 시험 계정(pdca-shot-*) id — 이번에 만든 것과 예전에 남은 것 모두 */
async function shotIds() {
  const { data, error } = await admin.from("profiles").select("id").like("email", "pdca-shot-%");
  if (error) throw new Error(`시험 계정 조회 실패 — ${error.message}`);
  return (data ?? []).map((p) => p.id);
}
const count = async (q) => { const { count: n, error } = await q; if (error) throw new Error(error.message); return n ?? 0; };

/**
 * 시험 계정이 만든 데이터 정리(계정 삭제보다 먼저 — card_versions·inspections·card_materials의 작성자 열은 계정을 연쇄 삭제하지 않아 남아 있으면 계정이 안 지워짐).
 * 판정은 작성자 id(시험 계정)뿐 — 다른 사람 행은 건드리지 않음. 확정한 작성본·원장 수정 이력은 원장이 바뀌었다는 뜻이라 지우지 않고 남은 것으로 셈
 */
async function cleanupData(ids, { orphans = true } = {}) {
  const rows = [];
  const purge = async (name, table, col, extra = (q) => q) => {
    const made = await count(extra(admin.from(table).select("*", { count: "exact", head: true }).in(col, ids)));
    let deleted = 0;
    if (made) {
      const { data, error } = await extra(admin.from(table).delete().in(col, ids)).select("*");
      if (error) console.error(`[정리 실패] ${name} — ${error.message}`);
      deleted = data?.length ?? 0;
    }
    rows.push({ name, made, deleted, left: await count(extra(admin.from(table).select("*", { count: "exact", head: true }).in(col, ids))) });
  };
  await purge("AI 결과(ai_results)", "ai_results", "user_id");
  await purge("AI 기록(ai_requests)", "ai_requests", "user_id");
  await purge("점검표(inspections)", "inspections", "created_by");
  // 카드 전용 자료: 파일 먼저, 그다음 행
  const { data: mats, error: matErr } = await admin.from("card_materials").select("id, storage_path").in("uploaded_by", ids);
  if (matErr) throw new Error(`자료 조회 실패 — ${matErr.message}`);
  const paths = new Set((mats ?? []).map((m) => m.storage_path));
  // fixtures 폴더에서 시작 뒤 생겼고 어느 행도 가리키지 않는 파일(올리다 끊긴 것)
  for (const c of orphans ? fixtureCards : []) {
    const { data: refRows } = await admin.from("card_materials").select("storage_path").eq("card_id", c.id);
    const referenced = new Set((refRows ?? []).map((r) => r.storage_path));
    for (const f of await folderFiles(c.uid)) if (!baselineFiles.get(c.uid)?.has(f) && !referenced.has(f)) paths.add(f);
  }
  const { data: removed, error: rmErr } = paths.size ? await admin.storage.from(MATERIAL_BUCKET).remove([...paths]) : { data: [] };
  if (rmErr) console.error(`[정리 실패] 자료 파일 — ${rmErr.message}`);
  await purge("카드 전용 자료(card_materials)", "card_materials", "uploaded_by");
  let filesLeft = 0;
  for (const uid of new Set([...paths].map((p) => p.split("/")[0]))) {
    const now = new Set(await folderFiles(uid));
    filesLeft += [...paths].filter((p) => p.startsWith(`${uid}/`) && now.has(p)).length;
  }
  rows.push({ name: "자료 파일(저장소)", made: paths.size, deleted: removed?.length ?? 0, left: filesLeft });
  await purge("작성본(card_versions, 작성 중·제출)", "card_versions", "created_by", (q) => q.in("status", ["draft", "submitted"]));
  const confirmed = await count(admin.from("card_versions").select("*", { count: "exact", head: true }).in("created_by", ids).eq("status", "confirmed"));
  rows.push({ name: "확정한 작성본(원장 반영 — 손으로 확인)", made: confirmed, deleted: 0, left: confirmed });
  const edits = await count(admin.from("card_edits").select("*", { count: "exact", head: true }).in("edited_by", ids));
  rows.push({ name: "원장 수정 이력(card_edits — 손으로 확인)", made: edits, deleted: 0, left: edits });
  return rows;
}

// 이전 실행이 끊겨(정리 전에 강제 종료 등) 시험 계정이 남긴 행이 있으면 먼저 지움 — 시험 계정 작성 행만, 시작 때 기준이 없으므로 「행이 안 가리키는 파일」 정리는 안 함
const leftover = await shotIds();
if (leftover.length) {
  console.log(`이전 실행이 남긴 시험 계정 ${leftover.length}개의 데이터부터 지움:`);
  console.log(cleanupTable(await cleanupData(leftover, { orphans: false })).join("\n"));
}
const conflicts = [];
for (const c of fixtureCards) {
  const [v, i, m] = await Promise.all([
    admin.from("card_versions").select("id, period, status").eq("card_id", c.id).or(`period.eq.${PERIOD},status.in.(draft,submitted)`),
    admin.from("inspections").select("id, period, status").eq("card_id", c.id).in("period", writes.checkPeriods),
    admin.from("card_materials").select("id").eq("card_id", c.id),
  ]);
  for (const r of [v, i, m]) if (r.error) throw new Error(`시작 전 확인 실패 ${c.ref} — ${r.error.message}`);
  if (v.data.length) conflicts.push(`${c.ref}: 작성본 ${v.data.map((x) => `${x.period} ${x.status}`).join(", ")}`);
  if (i.data.length) conflicts.push(`${c.ref}: 점검표 ${i.data.map((x) => `${x.period} ${x.status}`).join(", ")}`);
  if (m.data.length) conflicts.push(`${c.ref}: 카드 전용 자료 ${m.data.length}건`);
  baselineFiles.set(c.uid, new Set(await folderFiles(c.uid)));
}
if (conflicts.length) {
  console.error(`시험 데이터를 넣을 카드에 이미 데이터가 있어 아무것도 만들지 않고 멈춤(실제 담당자 데이터와 섞이지 않게):\n${conflicts.map((x) => `- ${x}`).join("\n")}`);
  process.exit(1);
}
mkdirSync(join(OUT, "raw"), { recursive: true });

try {
  // 부서 시험 계정을 team에 두고 assign 과제의 담당자로 지정(담당 지정은 끝에서 명시 삭제 — assigned_by는 null 허용)
  if (plan.assign?.length) {
    userIds.dept = await ensureUser(...users.dept);
    for (const [u, t] of plan.assign) {
      const { error } = await admin.from("card_assignees").upsert({ card_id: cardOf[key(u, t)].id, user_id: userIds.dept, assigned_by: null });
      if (error) throw new Error(`담당 지정 실패 ${u}:${t} — ${error.message}`);
    }
  }

  // 실명 자동 가림(team을 준 경우): 이름·메일·자료 파일명을 DB에서 읽어 가명으로 치환할 쌍을 만듦
  const maskPairs = [];
  if (plan.team) {
    const { data: team } = await admin.from("teams").select("id").eq("name", plan.team).maybeSingle();
    const { data: ps } = await admin.from("profiles").select("display_name, email").eq("team_id", team.id).eq("active", true).not("email", "like", "pdca-shot-%");
    (ps ?? []).forEach((p, i) => {
      const alias = PSEUDO[i % PSEUDO.length] + (i >= PSEUDO.length ? String(Math.floor(i / PSEUDO.length) + 1) : "");
      const name = (p.display_name ?? "").trim();
      if (name) maskPairs.push([name, alias]);
      const first = name.split(/\s+/)[0];
      if (first !== name && /^[가-힣]{2,4}$/.test(first)) maskPairs.push([first, alias]);
      if (p.email) maskPairs.push([p.email, `user${i + 1}@example.kr`]);
    });
    const ids = (plan.assign ?? []).map(([u, t]) => cardOf[key(u, t)].id);
    if (ids.length) {
      // 카드에 적힌 팀장·작성자 이름(cards.data의 manager·writer): 같은 사람은 같은 가상 이름
      const { data: cs } = await admin.from("cards").select("mgr:data->>manager, wr:data->>writer").in("id", ids);
      const aliasOf = new Map(), have = new Set(maskPairs.map((p) => p[0]));
      const cardAlias = (name) => {
        if (!aliasOf.has(name)) { const i = aliasOf.size; aliasOf.set(name, CARD_PSEUDO[i % CARD_PSEUDO.length] + (i >= CARD_PSEUDO.length ? String(Math.floor(i / CARD_PSEUDO.length) + 1) : "")); }
        return aliasOf.get(name);
      };
      for (const c of cs ?? []) for (const v of [c.mgr, c.wr]) for (const pr of personMaskPairs(v, cardAlias)) if (!have.has(pr[0])) { have.add(pr[0]); maskPairs.push(pr); }
      const { data: ms } = await admin.from("card_materials").select("file_name").in("card_id", ids);
      for (const m of ms ?? []) maskPairs.push([m.file_name, `자료예시${extname(m.file_name)}`]);
    }
  }

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const pages = {};
  for (const [who, rawPath, name, rawOpts] of shots) {
    if (!pages[who]) {
      if (who === "anon") pages[who] = await session(null);
      else { userIds[who] ??= await ensureUser(...users[who]); pages[who] = await session(users[who][0]); }
    }
    const page = pages[who];
    const path = subst(rawPath);
    const opts = rawOpts ? JSON.parse(subst(JSON.stringify(rawOpts))) : undefined;
    if (opts?.viewport) await page.setViewportSize(opts.viewport);
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    if (opts?.click) { await page.getByRole("button", { name: opts.click }).first().click(); await page.waitForTimeout(1200); }
    if (opts?.eval) { await page.evaluate(opts.eval); await page.waitForTimeout(500); }
    if (opts?.key) { await page.keyboard.press(opts.key); await page.waitForTimeout(500); if (opts.type) { await page.keyboard.type(opts.type); await page.waitForTimeout(400); } }
    for (const step of opts?.steps ?? []) {
      if ("seedInspection" in step) await seedInspection(step.seedInspection);
      else await runStep(page, step, { root: ROOT });
    }
    await applyMasks(page, maskPairs);
    await page.waitForTimeout(400);
    const full = Boolean(opts?.full);
    if (opts?.marks?.length) {
      await page.screenshot({ path: `${OUT}/raw/${name}.png`, fullPage: full });
      failedMarks += await drawMarks(page, opts.marks, name, { full });
    }
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
    if (opts?.viewport) await page.setViewportSize(DEFAULT_VIEWPORT); // 같은 세션을 다음 화면이 재사용하므로 되돌림
    console.log("찍음", name);
  }
} finally {
  await browser?.close();
  // 데이터 → 담당 지정 → 계정 순으로 지우고, 끝에 만든 것/지운 것/남은 것 표
  const rows = [];
  try {
    const ids = await shotIds();
    if (ids.length) rows.push(...(await cleanupData(ids)));
    const assigned = ids.length ? await count(admin.from("card_assignees").select("*", { count: "exact", head: true }).in("user_id", ids)) : 0;
    if (assigned) await admin.from("card_assignees").delete().in("user_id", ids);
    for (const u of Object.values(users)) await del(u[0]);
    const leftIds = await shotIds();
    const leftAssign = leftIds.length ? await count(admin.from("card_assignees").select("*", { count: "exact", head: true }).in("user_id", leftIds)) : 0;
    rows.push({ name: "담당 지정(card_assignees)", made: assigned, deleted: assigned - leftAssign, left: leftAssign });
    rows.push({ name: "시험 계정(pdca-shot-*)", made: ids.length, deleted: ids.length - leftIds.length, left: leftIds.length });
  } catch (e) {
    console.error(`[정리 오류] ${e.message}`);
    rows.push({ name: "정리 중 오류 — 손으로 확인", made: "?", deleted: "?", left: 1 });
  }
  console.log(cleanupTable(rows).join("\n"));
  const left = rows.reduce((n, r) => n + (Number(r.left) || 0), 0);
  if (left) { console.error(`[남은 것] ${left}건 — 위 표를 확인하세요`); process.exitCode = 1; }
  if (failedMarks) console.log(`[표기 실패] 합계 ${failedMarks}건`);
  console.log(`화면: ${OUT}`);
}
