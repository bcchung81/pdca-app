// 개발 서버 대상 화면·권한·업무 흐름 확인(pnpm e2e). 브라우저처럼 쿠키를 유지하고, 서버 액션은 개발 빌드의
// server-reference-manifest로 찾은 ID로 버튼과 같은 방식으로 부릅니다.
// 호스티드 Supabase에 시험 계정 3개(부서·성과관리팀·관리자)를 만들고, 카드 한 장(검사기획팀 카드 중 운영 기록이 없는 첫 카드)과
// 그 해 보고서를 잠시 바꾼 뒤 끝나면 모두 되돌립니다. 이미 그 해 보고서가 있거나 쓸 카드가 없으면 건드리지 않고 멈춥니다.
// 실행: pnpm dev 를 띄운 뒤 pnpm e2e
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pickTestCard } from "./pick-card.mjs";
import { guardProduction } from "../lib/db-target.ts";

guardProduction("e2e");

const BASE = "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "통과" : "실패"} ${name}${detail ? ` — ${detail}` : ""}`);
};

class Browser {
  jar = new Map();
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  async get(path) {
    const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie: this.cookieHeader() } });
    this.store(res);
    return { status: res.status, location: res.headers.get("location"), html: await res.text() };
  }
  async post(path, fields) {
    const fd = new FormData();
    for (const [k, v] of fields) fd.append(k, v);
    const res = await fetch(BASE + path, { method: "POST", redirect: "manual", body: fd, headers: { cookie: this.cookieHeader(), origin: BASE } });
    this.store(res);
    return { status: res.status, location: res.headers.get("location"), html: await res.text() };
  }
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** form 요소 안 input(hidden 포함)과, form="id"로 연결된 바깥 입력을 모읍니다 */
function formFields(html, formId) {
  const forms = [...html.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/g)];
  const f = formId ? forms.find((m) => m[1].includes(`id="${formId}"`)) : forms[0];
  const fields = [];
  for (const m of f[2].matchAll(/<input([^>]*?)\/?>/g)) {
    const name = /name="([^"]*)"/.exec(m[1]);
    const value = /value="([^"]*)"/.exec(m[1]);
    if (name) fields.push([decode(name[1]), value ? decode(value[1]) : ""]);
  }
  return fields;
}
/** 버튼 글자로 폼을 찾아 그 안 입력만 */
function formByButton(html, label) {
  const f = [...html.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/g)].find((m) => m[2].includes(label));
  if (!f) throw new Error(`폼 없음: ${label}`);
  return [...f[2].matchAll(/<input([^>]*?)\/?>/g)]
    .map((m) => [/name="([^"]*)"/.exec(m[1]), /value="([^"]*)"/.exec(m[1])])
    .filter(([n]) => n)
    .map(([n, v]) => [decode(n[1]), v ? decode(v[1]) : ""]);
}
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const decodeText = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const rowsOf = (html) => [...html.matchAll(/<tr class="group h-12/g)].length;

async function login(email) {
  const b = new Browser();
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const url = `/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`;
  const page = await b.get(url);
  const r = await b.post(url, formFields(page.html));
  if (r.status !== 303) throw new Error(`${email} 로그인 실패 ${r.status}`);
  return b;
}

async function ensureUser(email, role, teamName) {
  const { data: team } = teamName ? await admin.from("teams").select("id").eq("name", teamName).single() : { data: null };
  let { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) {
    const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
    p = { id: data.user.id };
  }
  await admin.from("profiles").update({ role, team_id: team?.id ?? null, display_name: `시험 ${role}` }).eq("id", p.id);
  return p.id;
}
async function deleteUser(email) {
  const { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) return;
  const { error } = await admin.auth.admin.deleteUser(p.id);
  if (error) console.error(`시험 계정 삭제 실패 ${email}: ${error.message}`);
}
import { readFileSync } from "node:fs";
const readActions = () => Object.fromEntries(Object.entries(JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8")).node).map(([id, v]) => [v.exportedName, id]));
let ACTION = readActions();
/**
 * 서버 액션 호출(클라이언트 버튼과 같은 방식) → 결과 JSON. 아직 컴파일 안 된 화면의 액션이면 화면을 먼저 열어 컴파일.
 * 처음 읽은 ID가 낡았으면(파일을 옮긴 뒤 다시 컴파일 — "Server action not found") 화면을 열고 목록을 다시 읽어 한 번 더
 */
async function call(b, path, name, args, retry = true) {
  if (!ACTION[name]) {
    await b.get(path);
    ACTION = readActions();
    if (!ACTION[name]) throw new Error(`서버 액션을 찾지 못함: ${name}`);
  }
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { cookie: b.cookieHeader(), origin: BASE, "next-action": ACTION[name], "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" },
    body: JSON.stringify(args),
  });
  b.store(res);
  const t = await res.text();
  if (retry && res.status === 404 && /Server action not found/.test(t)) {
    await b.get(path);
    ACTION = readActions();
    return call(b, path, name, args, false);
  }
  const lines = t.split("\n").filter(Boolean);
  for (const l of lines.reverse()) {
    const m = /^[0-9a-f]+:(\{.*\})$/.exec(l);
    if (m) {
      try {
        const j = JSON.parse(m[1]);
        if ("ok" in j || "status" in j) return j;
      } catch {}
    }
  }
  return { raw: t.slice(0, 300), http: res.status };
}

const DEPT = "pdca-e2e-dept@kca.kr";
const PMO = "pdca-e2e-pmo@kca.kr";
const ADMIN = "pdca-e2e-admin@kca.kr";
const YEAR = 2026;
const period = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
let restore = null;
try {
  await ensureUser(DEPT, "dept_user", "검사기획팀");
  await ensureUser(PMO, "pmo", null);
  await ensureUser(ADMIN, "admin", null);
  const { data: insp } = await admin.from("teams").select("id").eq("name", "검사기획팀").single();
  const { data: cards } = await admin.from("cards").select("id, uid, title, data, original_html, updated_at, updated_by, fixed_locked_at, fixed_locked_by, data_rev, eval_unit_id, team_id, edition, hq");
  // 시험 카드: 사람이 이미 고친 카드(작성본·점검·수정 이력·자료가 있는 카드)는 건드리지 않음
  const picked = await pickTestCard(admin, "검사기획팀");
  if (!picked) throw new Error("검사기획팀에 운영 기록이 없는 카드가 없어 시험하지 않습니다");
  const own = cards.find((c) => c.id === picked.id);
  console.log(`시험 카드: ${own.id} ${own.title}`);
  const ownCount = cards.filter((c) => c.team_id === insp.id).length;
  // 운영 데이터 보호: 시험 카드에 실제 기록이 있거나 그 해 보고서가 있으면 아무것도 바꾸지 않고 멈춤
  const busy = async (table, q) => (await q(admin.from(table).select("*", { count: "exact", head: true }))).count ?? 0;
  const before = {
    versions: await busy("card_versions", (q) => q.eq("card_id", own.id)),
    inspections: await busy("inspections", (q) => q.eq("card_id", own.id)),
    edits: await busy("card_edits", (q) => q.eq("card_id", own.id)),
    materials: await busy("card_materials", (q) => q.eq("card_id", own.id)),
    drafts: await busy("card_report_drafts", (q) => q.eq("card_id", own.id)),
    reports: await busy("reports", (q) => q.eq("year", YEAR)),
  };
  if (Object.values(before).some((n) => n > 0)) throw new Error(`시험 카드·보고서에 이미 운영 기록이 있어 시험하지 않습니다: ${JSON.stringify(before)}`);
  const { data: links0 } = await admin.from("card_knowledge_scope").select("*").eq("method", "rule").limit(1);
  const { data: tm0 } = await admin.from("task_map").select("*").eq("card_id", own.id).single();
  const { data: units0 } = await admin.from("eval_units").select("id, lead_team_id");
  const { data: allLinks } = await admin.from("card_knowledge_scope").select("card_id, chunk_key, status, confirmed_by, confirmed_at");
  const { data: allTasks } = await admin.from("task_map").select("card_id, status, note, confirmed_by, confirmed_at");
  restore = { own, link: links0[0], tm: tm0, units: units0, allLinks, allTasks };

  const d = await login(DEPT);
  const p = await login(PMO);

  // ── 역할 계층: 관리자 > 성과관리팀 > 부서 담당자(윗 역할은 아랫 역할 화면을 모두 봄)
  const ROUTES = ["/dashboard", "/cards", "/cards/import", "/cards/archive", "/inspections", "/inspections/summary", "/links", "/knowledge", "/reports", "/reports/cards", "/reports/outline", "/my", "/my/inspections", "/my/report", "/admin/library", "/admin/users", "/admin/usage", "/help"];
  const MIN = { "/dashboard": "pmo", "/cards": "pmo", "/cards/import": "pmo", "/cards/archive": "pmo", "/inspections": "pmo", "/inspections/summary": "pmo", "/links": "pmo", "/reports": "pmo", "/reports/cards": "pmo", "/reports/outline": "pmo", "/admin/library": "admin", "/admin/users": "admin", "/admin/usage": "admin" };
  const RANK = { dept_user: 0, pmo: 1, admin: 2 };
  const ERR = /Application error|Unhandled Runtime Error|Internal Server Error/;
  const a = await login(ADMIN);
  for (const [role, b] of Object.entries({ dept_user: d, pmo: p, admin: a })) {
    for (const route of ROUTES) {
      const res = await b.get(route);
      const allowed = RANK[role] >= RANK[MIN[route] ?? "dept_user"];
      const denied = /이상만 볼 수 있는 화면|관리자만 볼 수 있는 화면/.test(text(res.html));
      if (res.status >= 300 && res.status < 400) {
        check(`${role} ${route} → ${res.location}`, role === "dept_user" && route === "/cards" && /\/my/.test(res.location ?? ""), String(res.status));
        continue;
      }
      check(`${role} ${route}`, res.status === 200 && !ERR.test(res.html) && (allowed ? !denied : denied), `${res.status}${allowed && denied ? " 막힘" : ""}${!allowed && !denied ? " 열림(막혀야 함)" : ""}`);
    }
  }

  // ── 월별 작성본: 부서 작성 → 제출 → 돌려받음 → 다시 제출 → 성과관리팀 확정
  const my = await d.get("/my");
  check("내 과제 = 자기 부서 카드", rowsOf(my.html) === ownCount, `${rowsOf(my.html)}/${ownCount}`);
  const peek = await d.get(`/my?peek=${own.uid}`);
  check("담당자 옆 창: 이달 작성본 편집(원장과 같음)", /\d+월 작성본/.test(text(peek.html)) && text(peek.html).includes("원장과 같음") && peek.html.includes("contenteditable"));
  const fields = formByButton(peek.html, "지금 저장").filter(([k]) => k.startsWith("$ACTION") || k === "uid");
  const edited = structuredClone(own.data);
  edited.plan.lines = [...edited.plan.lines, "∙ (시험) 이달 실적 반영"];
  await d.post("/my", [...fields, ["payload", JSON.stringify({ data: edited, stage: "", progress: "", workStatus: "진행중" })]]);
  let { data: v } = await admin.from("card_versions").select("id, status, data, version").eq("card_id", own.id).eq("period", period).maybeSingle();
  check("작성본 저장(원장은 그대로)", v?.status === "draft" && v.data.plan.lines.at(-1) === "∙ (시험) 이달 실적 반영");
  const { data: ledger1 } = await admin.from("cards").select("data").eq("id", own.id).single();
  check("원장 변경 없음", JSON.stringify(ledger1.data) === JSON.stringify(own.data));
  const pWriting = await p.get(`/cards?peek=${own.uid}`);
  check("성과관리팀 옆 창: 부서 작성 중 안내", text(pWriting.html).includes("작성본을 작성 중입니다"));
  let r = await call(d, "/my", "setDraftStatus", [own.uid, "submit"]);
  let r2;
  check("제출", r.ok === true, JSON.stringify(r));
  edited.plan.lines = [...edited.plan.lines, "∙ (시험) 제출 뒤 고침"];
  await d.post("/my", [...fields, ["payload", JSON.stringify({ data: edited })]]);
  ({ data: v } = await admin.from("card_versions").select("id, status, data, note").eq("card_id", own.id).eq("period", period).maybeSingle());
  check("제출한 작성본은 저장 거절", v.status === "submitted" && v.data.plan.lines.at(-1) === "∙ (시험) 이달 실적 반영");
  const pl = await p.get(`/cards?peek=${own.uid}`);
  check("성과관리팀 옆 창: 제출됨·바뀐 칸 1개", /작성본 제출됨/.test(text(pl.html)) && /바뀐 칸\s*1\s*개/.test(text(pl.html)), text(pl.html).match(/바뀐 칸\s*\d+\s*개/)?.[0]);
  const plist = await p.get("/cards");
  check("원장 목록: 제출 칩·확정 대기 안내", plist.html.includes(">제출<") && text(plist.html).includes("확정 대기"));
  check("메뉴 배지: 과제 원장 할 일 1", plist.html.includes('title="과제 원장 · 할 일 1"'));
  r = await call(p, "/cards", "returnDraft", [v.id, "시험 메모: 목표 대비 실적"]);
  check("돌려보내기", r.ok === true, JSON.stringify(r));
  const dp = await d.get(`/my?peek=${own.uid}`);
  check("담당자에게 돌려받은 메모", text(dp.html).includes("돌려받음: 시험 메모"));
  check("메뉴 배지: 내 과제 할 일 1(돌려받음)", dp.html.includes('title="내 과제 · 할 일 1"'));
  r = await call(d, "/my", "setDraftStatus", [own.uid, "submit"]);
  ({ data: v } = await admin.from("card_versions").select("id, status, note").eq("card_id", own.id).eq("period", period).maybeSingle());
  check("다시 제출하면 메모 지움", r.ok === true && v.status === "submitted" && v.note === null);
  r = await call(d, "/cards", "confirmDraft", [v.id]);
  check("담당자는 확정 못 함", r.ok === false, JSON.stringify(r).slice(0, 120));
  // 제출 뒤 성과관리팀이 원장의 다른 구역(계량지표)을 고쳐도 확정이 덮어쓰지 않아야 함(구역 병합)
  const { data: ledgerNow } = await admin.from("cards").select("data").eq("id", own.id).single();
  const pmoEdit = structuredClone(ledgerNow.data);
  pmoEdit.kpi.rows[0].target = "45,500건(시험)";
  await admin.from("cards").update({ data: pmoEdit }).eq("id", own.id);
  r = await call(p, "/cards", "confirmDraft", [v.id]);
  const { data: after } = await admin.from("cards").select("data, original_html").eq("id", own.id).single();
  check("확정은 부서가 바꾼 구역만 반영(원장의 계량지표 변경 유지)", after.data.kpi.rows[0].target === "45,500건(시험)" && after.data.plan.lines.at(-1) === "∙ (시험) 이달 실적 반영");
  r2 = await call(p, "/cards", "confirmDraft", [v.id]);
  check("같은 작성본은 두 번 확정 못 함", r2.ok === false, JSON.stringify(r2).slice(0, 100));
  // 오래 열어 둔 창: 확정된 작성본 번호로 저장하면 거절(성과관리팀 수정을 옛 내용으로 되돌리지 않게)
  const staleDraft = structuredClone(edited);
  staleDraft.plan.lines = [...staleDraft.plan.lines, "∙ (시험) 오래된 창"];
  await d.post("/my", [...fields, ["payload", JSON.stringify({ data: staleDraft, versionId: v.id })]]);
  const { count: openAfterStale } = await admin.from("card_versions").select("id", { count: "exact", head: true }).eq("card_id", own.id).in("status", ["draft", "submitted"]);
  check("확정된 작성본 번호로 저장하면 거절(새 작성본 안 생김)", openAfterStale === 0, String(openAfterStale));
  // 원장도: 옛 개정 번호로 저장하면 거절
  const { data: revRow } = await admin.from("cards").select("data, data_rev").eq("id", own.id).single();
  const ledgerPeek2 = await p.get(`/cards?peek=${own.uid}`);
  const ledgerFields = formByButton(ledgerPeek2.html, "지금 저장").filter(([k]) => k.startsWith("$ACTION") || k === "uid");
  const staleLedger = structuredClone(revRow.data);
  staleLedger.plan.lines = [...staleLedger.plan.lines, "∙ (시험) 옛 원장"];
  await p.post("/cards", [...ledgerFields, ["payload", JSON.stringify({ data: staleLedger, rev: revRow.data_rev - 1, stage: "", progress: "", workStatus: "진행중" })]]);
  const { data: revAfter } = await admin.from("cards").select("data, data_rev").eq("id", own.id).single();
  check("옛 원장 개정 번호로 저장하면 거절", revAfter.data_rev === revRow.data_rev && !JSON.stringify(revAfter.data).includes("옛 원장"), `${revRow.data_rev}→${revAfter.data_rev}`);
  await p.post("/cards", [...ledgerFields, ["payload", JSON.stringify({ data: staleLedger, rev: revRow.data_rev, stage: "", progress: "", workStatus: "진행중" })]]);
  const { data: revOk } = await admin.from("cards").select("data, data_rev").eq("id", own.id).single();
  check("현재 개정 번호면 원장 저장·번호 1 증가", revOk.data_rev === revRow.data_rev + 1 && JSON.stringify(revOk.data).includes("옛 원장"), `${revRow.data_rev}→${revOk.data_rev}`);
  ({ data: v } = await admin.from("card_versions").select("id, status, confirmed_by").eq("card_id", own.id).eq("period", period).maybeSingle());
  const { data: edits } = await admin.from("card_edits").select("id, summary").eq("card_id", own.id);
  check("확정 → 원장 반영·원본 양식 다시 그림", after.data.plan.lines.at(-1) === "∙ (시험) 이달 실적 반영" && after.original_html.replace(/<[^>]+>/g, "").includes("(시험) 이달 실적 반영"), `ok=${r.ok} last=${JSON.stringify(after.data.plan.lines.at(-1))} html=${after.original_html.replace(/<[^>]+>/g, "").includes("이달 실적 반영")} raw=${JSON.stringify(r).slice(0, 160)}`);
  check("작성본 확정·이력", v.status === "confirmed" && edits.some((e) => /작성본 확정/.test(e.summary ?? "")), `${v.status} ${edits.map((e) => e.summary)}`);
  const my2 = await d.get("/my");
  check("내 과제 칩: 확정", my2.html.includes(">확정<"));

  // ── 월간 점검(종합점검 지침 14 양식): 작성 → (부서엔 안 보임) → 보내기 → 부서 확인
  const ip = await p.get(`/inspections?period=${period}&peek=${own.uid}`);
  check(
    "점검 화면·옆 창(지침 14 양식: 총평·7대 축·질의 패턴·정합성)",
    ip.status === 200 && ["AI 점검 총평", "우수사례 벤치마킹 7대 축", "평가위원 질의 패턴 분석 적용", "정합성 점검", "AI 점검 초안"].every((w) => text(ip.html).includes(w)),
  );
  const items = [...ip.html.matchAll(/aria-label="판단: ([^"]+)"/g)].length;
  check("점검 항목 20(7대축 7·질의패턴 8·정합성 5)", items === 20, String(items));
  const met = () => ({ judgment: "충족", question: "", fix: "", evidence: [], card: "", note: "" });
  // 근거 원문은 공통 지식(관리계획 자가진단)에 실제 있는 문장 — 저장할 때 서버가 대조해 「원문 확인」으로 바꿈
  const quote = "성과지표별 목표 달성 여부를 점검하고, 미달성 지표에 대한 원인 분석이 명확하다.";
  const payload = {
    form: "biz14",
    overview: { status: "시험 추진현황: 과정 실적 단계", direction: "★OutCome 연결: 시험 개선방향 → 체감 변화", case: "기준 미확인 — 붙임2 미확보" },
    axes: Array.from({ length: 7 }, (_, i) =>
      i === 3 ? { judgment: "미흡", question: "", fix: "시험 보완: '추진성과' 칸에 체감 변화 수치 추가", evidence: [{ source: "", quote, key: null, verified: null }], card: "'추진성과 — 정량' — 시험", note: "" } : met(),
    ),
    patterns: Array.from({ length: 8 }, (_, i) => (i === 6 ? { ...met(), judgment: "해당 없음", note: "시험 사유" } : met())),
    coherence: Array.from({ length: 5 }, met),
  };
  r = await call(p, "/inspections", "saveInspection", [own.uid, period, { ...payload, overview: { ...payload.overview, status: "" } }, "send"]);
  check("총평 추진현황 없이 보내기 거절", r.status === "error" && /추진현황/.test(r.message), JSON.stringify(r));
  r = await call(p, "/inspections", "saveInspection", [own.uid, period, { ...payload, axes: payload.axes.map((x, i) => (i === 3 ? { ...x, evidence: [] } : x)) }, "send"]);
  check("미흡에 근거 원문 없이 보내기 거절", r.status === "error" && /근거 원문/.test(r.message), JSON.stringify(r));
  r = await call(p, "/inspections", "saveInspection", [own.uid, period, payload, "save"]);
  check("점검 초안 저장 + 근거 원문 대조(원문 확인·출처 채움)", r.status === "ok" && r.result?.axes?.[3]?.evidence?.[0]?.verified === true && /자가진단/.test(r.result.axes[3].evidence[0].source), JSON.stringify(r.result?.axes?.[3]?.evidence ?? r).slice(0, 300));
  let mi = await d.get("/my/inspections");
  const recv = (h) => /<section aria-label="받은 점검"[\s\S]*?<\/section>/.exec(h)?.[0] ?? "";
  check("초안은 부서에 안 보임", recv(mi.html) !== "" && !text(recv(mi.html)).includes(own.title), "");
  r = await call(p, "/inspections", "saveInspection", [own.uid, period, payload, "send"]);
  check("부서에 보내기", r.status === "ok", r.status === "ok" ? r.message : JSON.stringify(r));
  const { data: ins } = await admin.from("inspections").select("id, status, result").eq("card_id", own.id).eq("period", period).single();
  mi = await d.get("/my/inspections");
  check("메뉴 배지: 점검 결과 할 일 1", mi.html.includes('title="점검 결과 · 할 일 1"'));
  check("부서 점검 결과: 확인 필요 1건", text(recv(mi.html)).includes(own.title) && text(recv(mi.html)).includes("확인 필요"));
  const mip = await d.get(`/my/inspections?peek=${ins.id}`);
  const mipWant = ["시험 추진현황", "보완할 것 1건", "▸ 보완: 시험 보완", "▸ 근거:", "▸ 카드:", "해당 없음 — 시험 사유", "확인했습니다"];
  check("받은 점검표: 총평·보완할 것·보완방안(▸ 보완·근거·카드)·확인 버튼", mipWant.every((w) => text(mip.html).includes(w)), mipWant.filter((w) => !text(mip.html).includes(w)).join(", "));
  r = await call(d, "/my/inspections", "acknowledgeInspection", [ins.id]);
  const { data: ins2 } = await admin.from("inspections").select("status").eq("id", ins.id).single();
  check("부서 확인", r.ok === true && ins2.status === "acknowledged", JSON.stringify(r));
  r = await call(p, "/inspections", "saveInspection", [own.uid, period, payload, "save"]);
  check("확인한 점검은 못 고침", r.status === "error", JSON.stringify(r));

  // ── 내려받기(CSV)·점검 검색
  const ex1 = await p.get("/cards/export");
  check("원장 내려받기(CSV, 머리글·59행 — BOM은 fetch가 벗김)", ex1.status === 200 && ex1.html.replace(/^\uFEFF/, "").startsWith("과제번호,") && ex1.html.trim().split("\r\n").length === cards.length + 1, `${ex1.status} ${ex1.html.trim().split("\r\n").length}`);
  const ex2 = await p.get(`/inspections/export?period=${period}`);
  check("점검 결과 내려받기(CSV, 점검결과 DB 속성 21열 + 20항목 × 판단·보완방안)", ex2.status === 200 && ex2.html.split("\r\n")[0].split(",").length === 21 + 40 && ex2.html.includes("시험 추진현황"), String(ex2.status));
  const sm = await p.get(`/inspections/summary?period=${period}`);
  const smText = decodeText(text(sm.html));
  check("월간 점검 취합 보고(총괄·공통 미흡)", sm.status === 200 && smText.includes("◆ 총괄 현황 : 점검 1건") && smText.includes("▸ 7대축 'OutCome 연결' 미흡 1건") && smText.includes("기관장 보고 1면"), smText.match(/◆ 총괄 현황[^/]*/)?.[0]);
  const smd = await p.get(`/inspections/summary/md?period=${period}`);
  check("취합 보고 내려받기(.md)", smd.status === 200 && smd.html.startsWith(`# [${period.slice(0, 4)}-${period.slice(5)}월] KCA 경영평가 월간 점검 취합 결과보고서`) && smd.html.includes("## ○ 기관장 보고 1면"), String(smd.status));
  const smdDept = await d.get(`/inspections/summary/md?period=${period}`);
  check("담당자는 취합 보고 못 내려받음(403)", smdDept.status === 403, String(smdDept.status));
  const ex3 = await d.get("/cards/export");
  check("담당자는 내려받기 못 함(403)", ex3.status === 403, String(ex3.status));
  const iq = await p.get(`/inspections?period=${period}&q=${encodeURIComponent("안테나")}`);
  const iqRows = [...iq.html.matchAll(/<tr class="h-12 (hover:bg-row-hover|bg-row-hover)"/g)].length;
  check("월간 점검 목록 검색", iqRows === 1, String(iqRows));

  // ── 경평 초안
  const mr0 = await d.get("/my/report");
  check("보고서 준비 전에도 부서는 카드마다 과제별 초안으로 감", text(mr0.html).includes("보고서 준비 전") && mr0.html.includes(`href="/reports/cards/${own.uid}"`), String(mr0.status));
  r = await call(p, "/reports", "prepareReports", [YEAR]);
  const { data: reps } = await admin.from("reports").select("id, eval_unit_id, team_id").eq("year", YEAR);
  const pairs = new Set(cards.filter((c) => c.team_id).map((c) => `${c.eval_unit_id}|${c.team_id}`));
  check("보고서 준비(사업×부서)", r.ok === true && reps.length === pairs.size, `${reps.length}/${pairs.size}`);
  r = await call(p, "/reports", "setLeadTeam", ["BZ-1", insp.id]);
  check("주관 부서 지정", r.ok === true);
  const mine = reps.find((x) => x.team_id === insp.id && x.eval_unit_id === "BZ-1");
  const theirs = reps.find((x) => x.team_id !== insp.id && x.eval_unit_id === "BZ-2");
  const mr = await d.get("/my/report");
  check("부서 보고서 초안 화면(주관 부서 공통 부분)", text(mr.html).includes("주관 부서 공통 부분") && text(mr.html).includes("계량 실적 입력"));
  // 계량 실적: 이 보고서 카드 중 계량지표 행이 있는 카드(시험 카드에 지표가 없을 수 있음)
  // 첫 지표 행 이름이 있는 카드(「-」 같은 빈 지표는 리뷰 화면에 나오지 않음). 과제번호 순으로 정해 매번 같은 카드
  const kpiCard = cards
    .filter((c) => c.team_id === insp.id && c.eval_unit_id === "BZ-1")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .find((c) => {
      const name = String(c.data.kpi?.rows?.[0]?.name ?? "").trim();
      return name && !/^[-–—·]+$/.test(name);
    });
  r = await call(d, "/my/report", "saveReportInputs", [mine.id, { [`${kpiCard.id}#0`]: "46,210건" }]);
  check("계량 실적 저장", r.ok === true, JSON.stringify(r));
  const s1 = await call(d, "/my/report", "startMaterialUpload", [mine.id, "시험.pdf", 12]);
  check("추가자료 서명 업로드 주소", s1.ok === true && s1.path?.startsWith(`${mine.id}/`), JSON.stringify(s1).slice(0, 100));
  const pub = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const up = await pub.storage.from("report-materials").uploadToSignedUrl(s1.path, s1.token, new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), { contentType: "application/pdf" });
  check("저장소에 바로 올림", !up.error, up.error?.message);
  r = await call(d, "/my/report", "finishMaterialUpload", [mine.id, s1.path, "시험.pdf", "application/pdf", 12]);
  const { data: mats } = await admin.from("report_materials").select("id").eq("report_id", mine.id);
  check("추가자료 등록", r.ok === true && mats.length === 1, JSON.stringify(r));
  const s2 = await call(d, "/my/report", "startMaterialUpload", [theirs.id, "x.pdf", 12]);
  check("남의 부서 보고서엔 못 올림", s2.ok === false, JSON.stringify(s2).slice(0, 100));
  r = await call(d, `/reports/${mine.id}`, "addComment", [mine.id, "all", "질문", "시험 질문"]);
  check("코멘트", r.ok === true, JSON.stringify(r));
  const rv = await p.get(`/reports/${mine.id}`);
  const rvText = text(rv.html);
  check("성과관리팀 리뷰 화면: 코멘트·계량 실적·자료", rvText.includes("시험 질문") && rvText.includes("46,210건") && rvText.includes("시험.pdf"), JSON.stringify({ status: rv.status, comment: rvText.includes("시험 질문"), kpi: rvText.includes("46,210건"), material: rvText.includes("시험.pdf") }));
  check("리뷰 화면: 평가내용2 과제별 초안 칸(아직 초안 없음 → 만들기 링크)", rvText.includes("평가내용2 과제별 초안(HTML)") && rvText.includes("초안 만들기"), "");
  const other = await d.get(`/reports/${theirs.id}`);
  check("남의 부서 보고서는 못 봄(404)", other.status === 404, String(other.status));
  r = await call(d, "/my/report", "setReportStatus", [mine.id, "submitted"]);
  check("초안 없으면 제출 못 함", r.ok === false, JSON.stringify(r));
  r = await call(d, "/my/report", "deleteMaterial", [mats[0].id]);
  const { data: objs } = await admin.storage.from("report-materials").list(String(mine.id));
  check("추가자료 삭제(파일까지)", r.ok === true && (objs ?? []).length === 0, `${(objs ?? []).length}`);
  const rl = await p.get("/reports");
  check("보고서 현황 표", text(rl.html).includes("주관") && text(rl.html).includes("자료 준비"));
  // 부서 제출 단위(2026-09-27): 부서는 원고를 직접 쓰지 않고(평가내용2는 과제별 초안), 과제별 초안이 모두 있어야 제출
  r = await call(d, `/reports/${mine.id}`, "saveReportBlocks", [mine.id, [{ type: "paragraph", text: "(시험) 부서 원고" }]]);
  check("부서는 원고를 직접 쓰지 않음", r.ok === false);
  r = await call(d, "/my/report", "setReportStatus", [mine.id, "submitted"]);
  check("과제별 초안이 없으면 제출 안 됨", r.ok === false, JSON.stringify(r).slice(0, 80));
  const rv2 = await p.get(`/reports/${mine.id}`);
  check("검토 화면: 직접 쓰기·HWPX 내보내기 단추 없음, 목록 아이콘", rv2.status === 200 && !text(rv2.html).includes("직접 쓰기") && !text(rv2.html).includes("HWPX 내보내기") && rv2.html.includes('aria-label="목록으로'), String(rv2.status));

  // ── 지적·과제 연결, 공통 지식, 부서 화면 보기
  const L = restore.link;
  r = await call(p, "/links", "setLinkStatus", [{ cardId: L.card_id, chunkKey: L.chunk_key }, "confirmed"]);
  const { data: l2 } = await admin.from("card_knowledge_scope").select("status").match({ card_id: L.card_id, chunk_key: L.chunk_key }).single();
  check("지적 연결 확정", r.ok === true && l2.status === "confirmed");
  r = await call(p, "/links", "setTaskMapStatus", [own.id, "confirmed", "시험 메모"]);
  check("과제 대응 확정", r.ok === true);
  r = await call(d, "/links", "setTaskMapStatus", [own.id, "draft", ""]);
  check("담당자는 연결 확정 못 함", r.ok === false);
  // 확신도 높은 초안 일괄 확정
  r = await call(p, "/links", "bulkConfirm", ["findings", 0.9]);
  const { data: sameTasks } = await admin.from("task_map").select("card_id").eq("status", "draft").eq("draft_status", "같음");
  r2 = await call(p, "/links", "bulkConfirm", ["tasks", 0.9]);
  const { count: sameLeft } = await admin.from("task_map").select("card_id", { count: "exact", head: true }).eq("status", "draft").eq("draft_status", "같음");
  check("일괄 확정(지적 점수 0.9↑·과제 대응 「같음」)", r.ok === true && r2.ok === true && sameLeft === 0 && (sameTasks?.length ?? 0) > 0, `${r.message} / ${r2.message}`);
  r = await call(d, "/links", "bulkConfirm", ["tasks", 0.9]);
  check("담당자는 일괄 확정 못 함", r.ok === false);
  const lk = await p.get(`/links?peek=${own.uid}`);
  check("연결 옆 창", text(lk.html).includes("카드 지적사항") && text(lk.html).includes("과제 대응"));
  const kn = await p.get(`/knowledge?q=${encodeURIComponent("사후 검증 시간")}`);
  check("공통 지식 검색", /검색 결과 [1-9]\d*건/.test(text(kn.html)), text(kn.html).match(/검색 결과 \d+건/)?.[0]);
  const pv = await p.get(`/my?team=${insp.id}`);
  check("성과관리팀: 부서 화면 보기(그 부서 과제)", rowsOf(pv.html) === ownCount && text(pv.html).includes("담당자에게 보이는 화면"), `${rowsOf(pv.html)}`);
  const pvp = await p.get(`/my?team=${insp.id}&peek=${own.uid}`);
  check("부서 화면 보기 옆 창은 읽기 전용", !pvp.html.includes("contenteditable") && text(pvp.html).includes("읽기 전용"));
  const dash = await p.get("/dashboard");
  const dashText = text(dash.html);
  check("현황: 공통 틀(이달 할 일 · 대상사업별 · 본부·실·단별 부서)", dashText.includes("이달 할 일") && dashText.includes("대상사업별") && dashText.includes("본부·실·단별"), dashText.slice(0, 80));
  check("현황: 점검 1건이 점검 통계에 잡힘", /보냄\s*1/.test(dashText), dashText.match(/보냄\s*\d+/)?.[0]);

  // ── 카드 전용 자료·수정 이력
  const cm = await call(d, "/my", "startCardMaterialUpload", [own.uid, "실적.pdf", 20]);
  check("카드 자료 서명 업로드 주소(자기 부서)", cm.ok === true && cm.path?.startsWith(`${own.uid}/`), JSON.stringify(cm).slice(0, 90));
  const up2 = await pub.storage.from("card-materials").uploadToSignedUrl(cm.path, cm.token, new Blob(["%PDF-1.4 card"], { type: "application/pdf" }), { contentType: "application/pdf" });
  r = await call(d, "/my", "finishCardMaterialUpload", [own.uid, cm.path, "실적.pdf", "application/pdf", 20]);
  const lm = await call(d, "/my", "listCardMaterials", [own.uid]);
  check("카드 자료 올림·목록", !up2.error && r.ok === true && lm.ok === true && lm.items?.length === 1 && lm.canEdit === true, JSON.stringify(lm).slice(0, 120));
  const otherCard = cards.find((c) => c.team_id !== insp.id);
  const cm2 = await call(d, "/my", "startCardMaterialUpload", [otherCard.uid, "x.pdf", 20]);
  check("다른 부서 카드엔 못 올림", cm2.ok === false, JSON.stringify(cm2).slice(0, 90));
  const lp = await call(p, "/cards", "listCardMaterials", [own.uid]);
  check("성과관리팀도 그 카드 자료를 봄", lp.ok === true && lp.items?.length === 1);
  r = await call(d, "/my", "deleteCardMaterial", [lm.items[0].id]);
  const { data: cobjs } = await admin.storage.from("card-materials").list(own.uid);
  check("카드 자료 삭제(파일까지)", r.ok === true && (cobjs ?? []).length === 0);
  // ── AI 작성지원 질문(runCardChat)·경평 초안 과제별 초안(AI 없이 확인: 빈 질문·권한·화면·HTML)
  r = await call(d, "/my", "runCardChat", [own.uid, "  ", [], null]);
  check("AI 작성지원 질문: 빈 질문 거절", r.ok === false && /질문을 적어/.test(r.message ?? ""), JSON.stringify(r).slice(0, 120));
  // 액션이 쓰이는 화면(경평 초안 › 과제별 초안)으로 불러야 막 띄운 개발 서버에서도 그 화면을 컴파일해 액션을 찾음
  const RC = (uid) => `/reports/cards/${uid}`;
  r = await call(d, RC(own.uid), "runReportSectionDraft", [otherCard.uid]);
  check("보고서 초안: 담당자는 다른 부서 카드 초안을 못 만듦", r.ok === false && /자기 부서 과제만/.test(r.message ?? ""), JSON.stringify(r).slice(0, 120));
  r = await call(d, RC(own.uid), "runReportSectionDraft", [own.uid, { card: ["00000000-0000-0000-0000-000000000000"], report: [] }]);
  check("보고서 초안: 이 카드 자료가 아닌 첨부는 거절", r.ok === false && /찾을 수 없는 것/.test(r.message ?? ""), JSON.stringify(r).slice(0, 120));
  // 과제별 초안 화면은 과제원장 전체 페이지와 같은 짜임(늘 전체 보기): 왼쪽 보고서 · 오른쪽 「AI 초안 | 점검 결과」 탭(아래 요청 칸) · 머리 폴더 단추로 여는 「근거 자료」
  const SEND_RE = /aria-label="(구성안|바로) (다시 )?만들기 요청"/;
  const rp0 = await d.get(RC(own.uid));
  check("과제별 초안 화면(초안 없음 · 초안 근거 요약 · 카드 전용 자료 · 요청 칸 보내기 단추)", rp0.status === 200 && text(rp0.html).includes("아직 초안이 없습니다") && text(rp0.html).includes("초안 근거") && text(rp0.html).includes("카드 전용 자료") && text(rp0.html).includes("바로 만들기") && SEND_RE.test(rp0.html), String(rp0.status));
  check("과제별 초안: 좌측 메뉴 없음(늘 전체 보기) · 머리 「근거 자료」·「더보기」 단추 · 탭 「AI 초안」·「점검 결과」", !rp0.html.includes('aria-label="주 메뉴"') && rp0.html.includes('aria-label="근거 자료"') && rp0.html.includes('aria-label="더보기"') && text(rp0.html).includes("AI 초안") && text(rp0.html).includes("점검 결과") && !text(rp0.html).includes("전체 보기"));
  const rpFull = await d.get(`${RC(own.uid)}?full=1`);
  check("과제별 초안 옛 전체 보기 주소(?full=1)도 같은 화면: 좌측 메뉴 없음 · 초안 근거", rpFull.status === 200 && !rpFull.html.includes('aria-label="주 메뉴"') && !text(rpFull.html).includes("기본 보기") && text(rpFull.html).includes("초안 근거"), String(rpFull.status));
  const cardFull = await d.get(`/cards/${own.uid}`);
  check("카드 전체 페이지는 전체 보기(좌측 메뉴·화면 탭 없음, 머리 한 줄)", cardFull.status === 200 && !cardFull.html.includes('aria-label="주 메뉴"') && cardFull.html.includes('aria-label="목록으로') && cardFull.html.includes("contenteditable"), String(cardFull.status));
  const rh0 = await d.get(`${RC(own.uid)}/html`);
  check("초안이 없으면 HTML 내려받기 404", rh0.status === 404, String(rh0.status));
  const old = await d.get(`/cards/${own.uid}/report`);
  check("옛 주소(원장 쪽 보고서 초안)는 경평 초안 화면으로", old.status >= 300 && old.status < 400 && (old.location ?? "").endsWith(RC(own.uid)), `${old.status} ${old.location}`);
  const peekMenu = await d.get(`/my?peek=${own.uid}`);
  check("원장 옆 창에는 경평 초안 메뉴가 없음", peekMenu.status === 200 && !text(peekMenu.html).includes("경평 초안(HTML)"), String(peekMenu.status));
  // 주관 부서(앞에서 시험 부서를 BZ-1 주관으로 지정)는 그 사업의 다른 부서 카드를 읽기만, 다른 사업 카드는 못 봄
  const farCard = cards.find((c) => c.team_id !== insp.id && c.eval_unit_id !== own.eval_unit_id);
  const rpFar = await d.get(RC(farCard.uid));
  check("다른 사업·다른 부서 카드 보고서 초안 화면은 못 봄(404)", rpFar.status === 404, String(rpFar.status));
  const sameUnitOther = cards.find((c) => c.team_id !== insp.id && c.eval_unit_id === own.eval_unit_id);
  if (sameUnitOther) {
    const rpLead = await d.get(RC(sameUnitOther.uid));
    check("주관 부서는 같은 사업 다른 부서 카드 초안을 읽기만(요청 칸 보내기 단추 없음)", rpLead.status === 200 && !SEND_RE.test(rpLead.html), String(rpLead.status));
  }
  const draftSpec = {
    version: 1,
    card: { id: own.id, taskNo: own.task_no ?? "1-다", title: own.title },
    business: { no: 1, name: "시험 대상사업" },
    task: { no: "1-1", title: "시험 실행과제", bp: false },
    sub: { mark: "가", title: "“시험 캐치프레이즈” 시험 소항목", markers: ["AI"] },
    rows: [{ label: "추진배경", bullets: ["시험 추진배경 <b>꺾쇠</b>"], diagram: { type: "none", title: "", rows: [], steps: [], actions: [] } }],
    results: ["시험 추진성과 99%"],
    caption: "시험",
    module: 0.5,
  };
  await admin.from("card_report_drafts").upsert({ card_id: own.id, year: YEAR, spec: draftSpec, warnings: ["카드에 없는 숫자 1개"], unknown_numbers: ["99%"], model: "e2e" }, { onConflict: "card_id,year" });
  const rp1 = await p.get(RC(own.uid));
  check("보고서 초안 화면: 소항목 HTML(마커·추진성과·모르는 숫자 표시·꺾쇠 이스케이프)", rp1.status === 200 && rp1.html.includes('class="k-task__no">1-1<') && rp1.html.includes('class="k-unv"') && rp1.html.includes("&lt;b&gt;꺾쇠") && text(rp1.html).includes("바로 다시 만들기"), String(rp1.status));
  r = await call(p, RC(own.uid), "setReportSectionBp", [own.uid, true]);
  const { data: bpRow } = await admin.from("card_report_drafts").select("spec").eq("card_id", own.id).single();
  const rpBp = await p.get(RC(own.uid));
  check("보고서 초안: BP 표시(사람이 고름) → 실행과제 띠에 BP 딱지", r.ok === true && bpRow.spec.task.bp === true && rpBp.html.includes("mk--bp"), JSON.stringify(r));
  r = await call(d, RC(own.uid), "setReportSectionBp", [otherCard.uid, true]);
  check("보고서 초안: 다른 부서 카드 BP는 못 바꿈", r.ok === false, JSON.stringify(r));
  const rcl = await p.get("/reports/cards?state=done");
  check("과제별 초안 목록: 초안 있는 과제에 이 카드(작성 화면 연결)", rcl.status === 200 && rcl.html.includes(`href="${RC(own.uid)}"`) && text(rcl.html).includes("초안 있음"), String(rcl.status));
  const rh1 = await p.get(`${RC(own.uid)}/html`);
  check("보고서 초안 HTML 내려받기(한 파일)", rh1.status === 200 && rh1.html.startsWith("<!doctype html>") && rh1.html.includes(".kca-dg-doc table.k-ladder") && !/googleapis/.test(rh1.html), String(rh1.status));
  const rvDraft = await p.get(`/reports/${mine.id}`);
  check("리뷰 화면: 과제별 초안 HTML이 평가내용2 칸에 모임", own.eval_unit_id !== "BZ-1" || rvDraft.html.includes('class="k-task__no">1-1<'), own.eval_unit_id);
  const lib = await a.get("/admin/library");
  check("관리 › 공통 자료: 파일 올리기 칸(끌어 놓기)", lib.status === 200 && text(lib.html).includes("파일을 끌어 놓거나 눌러서 고르기"), String(lib.status));
  const libFw = await a.get("/admin/library?tab=frameworks");
  check("관리 › 옛 「보고서 틀」 탭 주소는 공통 지식 탭으로", libFw.status === 200 && !text(libFw.html).includes("보고서 틀"), String(libFw.status));

  const hist = await call(d, "/my", "getCardHistory", [own.uid]);
  const confirmedEntry = hist.items?.find((h) => /작성본 확정/.test(h.summary));
  check("수정 이력: 작성본 확정 기록(바뀐 칸 1)이 원장 저장과 따로 남음", hist.ok === true && hist.items?.length === 2 && confirmedEntry?.changes.length === 1, JSON.stringify(hist.items?.map((h) => h.summary)));

  // ── 고정 영역 확정(Act·Plan·계량지표): 부서 작성본에서 잠김
  r = await call(p, "/cards", "setFixedLock", [[own.uid], true]);
  check("고정 영역 확정(성과관리팀)", r.ok === true && r.count === 1, JSON.stringify(r));
  r = await call(d, "/cards", "setFixedLock", [[own.uid], false]);
  check("담당자는 고정 영역 확정·풀기 못 함", r.ok === false);
  const lockedPeek = await d.get(`/my?peek=${own.uid}`);
  check("부서 옆 창: 고정 영역 잠김 표시", lockedPeek.html.includes('data-locked="1"') && text(lockedPeek.html).includes("고정 영역 잠김") && lockedPeek.html.includes("고정 영역(Act·Plan·계량지표)은 성과관리팀이 확정해"));
  check("부서 옆 창: 잠긴 칸엔 편집 속성 없음", !/data-p="plan\.[^"]*"[^>]*contenteditable/.test(lockedPeek.html) && /data-p="do\.[^"]*"[^>]*contenteditable/.test(lockedPeek.html));
  const lockFields = formByButton(lockedPeek.html, "지금 저장").filter(([k]) => k.startsWith("$ACTION") || k === "uid");
  const { data: base2 } = await admin.from("cards").select("data").eq("id", own.id).single();
  const planChanged = structuredClone(base2.data);
  planChanged.plan.lines = [...planChanged.plan.lines, "∙ (시험) 잠긴 계획 고침"];
  await d.post("/my", [...lockFields, ["payload", JSON.stringify({ data: planChanged })]]);
  let { data: v2 } = await admin.from("card_versions").select("id, status, data").eq("card_id", own.id).eq("period", period).eq("status", "draft").maybeSingle();
  check("잠긴 계획 변경은 반영 안 됨(원장 값 유지 → 바뀐 내용 없음)", !v2);
  const doChanged = structuredClone(base2.data);
  doChanged.do.lines = [...(doChanged.do.lines ?? []), "∙ (시험) 잠금 뒤 실적"];
  await d.post("/my", [...lockFields, ["payload", JSON.stringify({ data: doChanged })]]);
  ({ data: v2 } = await admin.from("card_versions").select("id, status, data").eq("card_id", own.id).eq("period", period).eq("status", "draft").maybeSingle());
  check("잠기지 않은 실적은 저장", v2?.data?.do?.lines?.at(-1) === "∙ (시험) 잠금 뒤 실적");
  const ledgerPeek = await p.get(`/cards?peek=${own.uid}`);
  check("성과관리팀 원장은 잠금과 상관없이 편집·확정 막대", /data-p="plan\.[^"]*"[^>]*contenteditable/.test(ledgerPeek.html) && text(ledgerPeek.html).includes("고정 영역 확정됨"));
  r = await call(p, "/cards", "setFixedLock", [[own.uid], false]);
  check("고정 영역 확정 풀기", r.ok === true);

  // ── 카드 현행화(한글 파일 → 원장)
  //    ① 원본 한글 파일 3개(59장)를 올리면 모두 확정 매칭 — 검토만 하고 반영하지 않음(다른 카드의 운영 변경을 건드리지 않게 모두 건너뜀)
  //    ② 시험 카드의 Check를 원장에서 바꿔 두고, 그 카드 하나만 대상으로 현행화 → [변경] → 「전체 반영」이 파일 값(원본)으로 되돌림
  const ORIG = "data/cards/260916";
  if (existsSync(ORIG)) {
    restore.importIds = [];
    const pub = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const hwps = readdirSync(ORIG).filter((f) => f.endsWith(".hwp")).sort();
    const upload = async (res, names) => {
      for (const [i, f] of names.entries()) {
        const { error } = await pub.storage.from("card-imports").uploadToSignedUrl(res.uploads[i].path, res.uploads[i].token, readFileSync(join(ORIG, f)), { contentType: "application/octet-stream" });
        if (error) check(`원본 파일 올리기 ${f}`, false, error.message);
      }
    };
    // 앞 단계 시험(작성본 확정 등)이 바꾼 원장을 원본으로 돌린 뒤 Check만 바꿔 둠
    const { data: cur } = await admin.from("cards").select("data_rev").eq("id", own.id).single();
    const drift = structuredClone(own.data);
    drift.check = { ...drift.check, items: ["∙ (시험) 현행화 전 원장에만 있는 점검 메모"], risks: [], monitoring: [], labels: {}, grid: null };
    await admin.from("cards").update({ data: drift, data_rev: cur.data_rev + 1 }).eq("id", own.id);

    r = await call(d, "/cards/import", "startCardImport", [{ files: [{ name: "x.hwpx", size: 10 }] }]);
    check("담당자는 원장 현행화를 시작하지 못함", r.ok === false);
    r = await call(p, "/cards/import", "startCardImport", [{ files: [{ name: "카드.pdf", size: 10 }] }]);
    check("한글 파일이 아니면 거절", r.ok === false && /HWP/.test(r.message ?? ""));
    r = await call(p, "/cards/import", "startCardImport", [{ files: hwps.map((f) => ({ name: f, size: statSync(join(ORIG, f)).size })) }]);
    check("현행화 시작 → 파일마다 올리기 주소", r.ok === true && r.uploads?.length === hwps.length, JSON.stringify(r).slice(0, 200));
    const importId = r.importId;
    restore.importIds.push(importId);
    await upload(r, hwps);
    let t0 = Date.now();
    r = await call(p, "/cards/import", "parseCardImport", [importId]);
    check("한글 파일 읽기·원장 매칭", r.ok === true, `${Date.now() - t0}ms`);
    const { data: items } = await admin.from("card_import_items").select("id, match, card_id, status").eq("import_id", importId);
    check("카드 59장 모두 확정 매칭", items?.length === cards.length && items.every((i) => i.match === "exact"), `${items?.length} / 확정 ${items?.filter((i) => i.match === "exact").length}`);
    const mine = items.find((i) => i.card_id === own.id);
    const peekItem = await p.get(`/cards/import/${importId}?item=${mine.id}`);
    check("과제 검토 옆 창: [Check] 변경과 줄 비교", text(peekItem.html).includes("[Check] 성과점검") && text(peekItem.html).includes("원장에만 있는 점검 메모"));
    r = await call(p, `/cards/import/${importId}`, "skipImportItems", [importId, items.map((i) => i.id), "e2e 검토만"]);
    check("검토만 하고 모두 건너뛰기", r.ok === true && r.message === `${cards.length}건 건너뜀`, r.message);

    const groupFile = hwps.find((f) => f.normalize("NFC").includes(`(${own.data.group})`)); // macOS 파일 이름은 자모 분리(NFD)일 수 있음
    r = await call(p, "/cards/import", "startCardImport", [{ files: [{ name: groupFile, size: statSync(join(ORIG, groupFile)).size }], cardUid: own.uid }]);
    check("이 카드만 현행화 시작", r.ok === true);
    const oneId = r.importId;
    restore.importIds.push(oneId);
    await upload(r, [groupFile]);
    r = await call(p, "/cards/import", "parseCardImport", [oneId]);
    const { data: one } = await admin.from("card_import_items").select("id, card_id").eq("import_id", oneId);
    check("묶음 파일에서 이 카드만 읽음", r.ok === true && one?.length === 1 && one[0].card_id === own.id, `${one?.length}`);
    const rv = await p.get(`/cards/import/${oneId}`);
    check("검토 화면: 위험 없음 1(변경 1)", /위험 없음\s*1\s*변경 1 · 변경 없음 0/.test(text(rv.html)), text(rv.html).match(/위험 없음[^가-힣]*[가-힣 ·0-9]{0,30}/)?.[0]);
    r = await call(p, `/cards/import/${oneId}`, "applySafeImportItems", [oneId]);
    check("전체 반영: 반영 1건", r.ok === true && /반영 1건/.test(r.message), r.message);
    const { data: synced } = await admin.from("cards").select("data, original_html").eq("id", own.id).single();
    check("시험 카드가 파일 값(원본 양식)으로 돌아옴", synced.original_html === own.original_html && synced.data.check.items.join("|") === own.data.check.items.join("|"));
    const { data: syncEdits } = await admin.from("card_edits").select("summary").eq("card_id", own.id).like("summary", "현행화:%");
    check("수정 이력에 현행화 기록", syncEdits?.length === 1, syncEdits?.[0]?.summary);
    r = await call(p, `/cards/import/${oneId}`, "applyImportItems", [oneId, [{ itemId: one[0].id, blocks: ["check"], removals: [] }]]);
    check("이미 처리한 항목은 다시 반영 안 됨", r.results?.[0]?.ok === false);
  } else check("원본 한글 파일이 없어 현행화 시험은 건너뜀", true);

  // ── 카드 한글(HWPX) 내려받기 → 그 파일을 그대로 현행화로 올리면 「변경 없음」(한글에서 고쳐 다시 올리는 흐름의 왕복)
  const hw = await fetch(`${BASE}/cards/${own.uid}/hwpx`, { headers: { cookie: p.cookieHeader() } });
  const hwBytes = Buffer.from(await hw.arrayBuffer());
  check("한글(HWPX) 내려받기", hw.status === 200 && hw.headers.get("content-type") === "application/hwp+zip" && hwBytes.subarray(0, 2).toString() === "PK" && /filename\*=UTF-8''/.test(hw.headers.get("content-disposition") ?? ""), `${hw.status} ${hwBytes.length}B`);
  const foreignCard = cards.find((c) => c.team_id && c.team_id !== insp.id && c.eval_unit_id !== own.eval_unit_id); // 주관 부서로 읽는 같은 사업 카드는 빼고
  check("담당자는 다른 부서 카드를 내려받지 못함", (await fetch(`${BASE}/cards/${foreignCard.uid}/hwpx`, { headers: { cookie: d.cookieHeader() } })).status === 404);
  check("담당자는 자기 카드를 내려받음", (await fetch(`${BASE}/cards/${own.uid}/hwpx`, { headers: { cookie: d.cookieHeader() } })).status === 200);
  {
    restore.importIds ??= [];
    const pub2 = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    r = await call(p, "/cards/import", "startCardImport", [{ files: [{ name: "내려받은 카드.hwpx", size: hwBytes.length }], cardUid: own.uid }]);
    restore.importIds.push(r.importId);
    const up = await pub2.storage.from("card-imports").uploadToSignedUrl(r.uploads[0].path, r.uploads[0].token, hwBytes, { contentType: "application/hwp+zip" });
    const rt = await call(p, "/cards/import", "parseCardImport", [r.importId]);
    const { data: rtItems } = await admin.from("card_import_items").select("id, match").eq("import_id", r.importId);
    const rtPage = await p.get(`/cards/import/${r.importId}`);
    check("내려받은 한글 파일을 다시 올리면 확정 매칭·변경 없음", !up.error && rt.ok === true && rtItems?.length === 1 && rtItems[0].match === "exact" && /위험 없음\s*1\s*변경 0 · 변경 없음 1/.test(text(rtPage.html)), text(rtPage.html).match(/위험 없음[^가-힣]*[가-힣 ·0-9]{0,30}/)?.[0]);
  }

  // ── 과제 삭제(보관) → 부서 화면에서 빠짐 → 보관함 → 되살리기. 영구 삭제는 관리자·보관 카드만
  r = await call(p, "/cards", "archiveCard", [own.uid, ""]);
  check("까닭 없이는 보관 안 됨", r.ok === false);
  r = await call(d, "/cards", "archiveCard", [own.uid, "시험"]);
  check("담당자는 보관 못 함", r.ok === false);
  r = await call(p, "/cards", "archiveCard", [own.uid, "시험 보관"]);
  check("과제 삭제(보관)", r.ok === true, r.message);
  check("보관하면 내 과제에서 빠짐", rowsOf((await d.get("/my")).html) === ownCount - 1);
  check("부서는 보관한 카드를 열지 못함", (await d.get(`/cards/${own.uid}`)).status === 404);
  const arch = await p.get("/cards/archive");
  check("보관함에 보임(까닭 포함)", text(arch.html).includes(own.title) && text(arch.html).includes("시험 보관"));
  const archPeek = await p.get(`/cards/${own.uid}`);
  check("보관한 카드는 읽기 전용 안내", text(archPeek.html).includes("보관한(삭제한) 과제입니다") && !archPeek.html.includes('contenteditable="plaintext-only"'));
  r = await call(a, "/cards/archive", "purgeCard", [own.uid, "9-가"]);
  check("영구 삭제는 과제번호 확인이 맞아야 함", r.ok === false);
  r = await call(p, "/cards/archive", "purgeCard", [own.uid, own.data.taskNo]);
  check("성과관리팀은 영구 삭제 못 함", r.ok === false);
  r = await call(p, "/cards/archive", "restoreCard", [own.uid]);
  check("되살리기", r.ok === true && rowsOf((await d.get("/my")).html) === ownCount);
  r = await call(a, "/cards/archive", "purgeCard", [own.uid, own.data.taskNo]);
  check("보관하지 않은 카드는 영구 삭제 안 됨", r.ok === false);

  // ── 목차·쪽 배정(6월 셋업)
  const { count: outlineBefore } = await admin.from("report_outline").select("card_id", { count: "exact", head: true }).eq("year", YEAR);
  if (!outlineBefore) {
    r = await call(p, "/reports/outline", "buildReportOutline", [YEAR, false]);
    const { count: outlineN } = await admin.from("report_outline").select("card_id", { count: "exact", head: true }).eq("year", YEAR);
    check("카드로 목차 만들기(과제마다 한 행)", r.ok === true && outlineN === cards.length, `${outlineN}/${cards.length}`);
    r = await call(p, "/reports/outline", "setOutline", [own.id, YEAR, { pages: 1.25 }]);
    check("0.5쪽 단위가 아니면 거절", r.ok === false);
    r = await call(p, "/reports/outline", "setOutline", [own.id, YEAR, { pages: 2.5 }]);
    check("쪽 배정", r.ok === true);
    r = await call(d, "/reports/outline", "setOutline", [own.id, YEAR, { pages: 3 }]);
    check("담당자는 쪽 배정 못 함", r.ok === false);
    const ol = await p.get("/reports/outline");
    check("목차 화면: 사업별 합계·예산", /\d+(\.5)?\s*쪽\s*\/\s*15\s*±\s*1\s*쪽/.test(text(ol.html)) && /대상사업\s*1\s*\./.test(text(ol.html)), text(ol.html).match(/[\d.]+\s*쪽\s*\/[^가-힣]{0,20}/)?.[0]);
    const mr2 = await d.get("/my/report");
    check("부서 보고서 화면: 자기 과제 배정 쪽수", text(mr2.html).includes("2.5쪽"));
    restore.outlineCreated = true;
  } else check("목차가 이미 있어 목차 시험은 건너뜀", true);
} catch (e) {
  failures++;
  console.error(e);
} finally {
  if (restore?.own) {
    const o = restore.own;
    await admin
      .from("cards")
      .update({ data: o.data, original_html: o.original_html, title: o.title, updated_by: o.updated_by, fixed_locked_at: o.fixed_locked_at, fixed_locked_by: o.fixed_locked_by, data_rev: o.data_rev, edition: o.edition, hq: o.hq, team_id: o.team_id, status: "active", retired_at: null, retired_by: null, retired_reason: null })
      .eq("id", o.id);
    // 현행화 묶음: 원본 파일·현행화 그림(imp{묶음}-*)·항목
    for (const id of restore.importIds ?? []) {
      const { data: objs } = await admin.storage.from("card-imports").list(String(id));
      if (objs?.length) await admin.storage.from("card-imports").remove(objs.map((f) => `${id}/${f.name}`));
      const { data: all } = await admin.from("cards").select("uid");
      for (const c of all ?? []) {
        const { data: imgs } = await admin.storage.from("card-originals").list(c.uid, { search: `imp${id}-` });
        const mineImgs = (imgs ?? []).filter((f) => f.name.startsWith(`imp${id}-`));
        if (mineImgs.length) await admin.storage.from("card-originals").remove(mineImgs.map((f) => `${c.uid}/${f.name}`));
      }
      await admin.from("card_imports").delete().eq("id", id);
    }
    // 점검이 확정 작성본을 참조하므로 점검 → 작성본 순서로 지움(그래야 시험 계정도 지워짐)
    const gone = async (table, q) => {
      const { error } = await q(admin.from(table).delete());
      if (error) console.error(`정리 실패 ${table}: ${error.message}`);
    };
    await gone("card_report_drafts", (q) => q.eq("card_id", o.id));
    await gone("inspections", (q) => q.eq("card_id", o.id));
    await gone("card_edits", (q) => q.eq("card_id", o.id));
    await gone("card_versions", (q) => q.eq("card_id", o.id));
    const { data: leftover } = await admin.storage.from("card-materials").list(o.uid);
    if (leftover?.length) await admin.storage.from("card-materials").remove(leftover.map((f) => `${o.uid}/${f.name}`));
    await gone("card_materials", (q) => q.eq("card_id", o.id));
    const { data: reps } = await admin.from("reports").select("id").eq("year", YEAR);
    for (const x of reps ?? []) {
      const { data: objs } = await admin.storage.from("report-materials").list(String(x.id));
      if (objs?.length) await admin.storage.from("report-materials").remove(objs.map((f) => `${x.id}/${f.name}`));
    }
    await admin.from("reports").delete().eq("year", YEAR);
    if (restore.outlineCreated) await admin.from("report_outline").delete().eq("year", YEAR);
    for (const u of restore.units ?? []) await admin.from("eval_units").update({ lead_team_id: u.lead_team_id }).eq("id", u.id);
    for (const L of restore.allLinks ?? [])
      await admin.from("card_knowledge_scope").update({ status: L.status, confirmed_by: L.confirmed_by, confirmed_at: L.confirmed_at }).match({ card_id: L.card_id, chunk_key: L.chunk_key });
    for (const t of restore.allTasks ?? []) await admin.from("task_map").update({ status: t.status, note: t.note, confirmed_by: t.confirmed_by, confirmed_at: t.confirmed_at }).eq("card_id", t.card_id);
    if (restore.link) {
      const L = restore.link;
      await admin.from("card_knowledge_scope").update({ status: L.status, confirmed_by: L.confirmed_by, confirmed_at: L.confirmed_at }).match({ card_id: L.card_id, chunk_key: L.chunk_key });
    }
    if (restore.tm) await admin.from("task_map").update({ status: restore.tm.status, note: restore.tm.note, confirmed_by: restore.tm.confirmed_by, confirmed_at: restore.tm.confirmed_at }).eq("card_id", restore.tm.card_id);
    const { data: back } = await admin.from("cards").select("original_html").eq("id", o.id).single();
    console.log("원복:", back.original_html === o.original_html);
  }
  await deleteUser(DEPT);
  await deleteUser(PMO);
  await deleteUser(ADMIN);
  console.log(failures ? `실패 ${failures}` : "모두 통과");
  process.exitCode = failures ? 1 : 0;
}
