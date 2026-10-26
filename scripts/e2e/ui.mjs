// 실제 화면 조작 흐름(pnpm e2e:ui): 이 컴퓨터의 Chrome을 헤드리스로 띄워 부서 담당자·성과관리팀으로 로그인하고
// 카드 칸 입력 → 자동 저장 → 제출 → 비교 → 확정 → 수정 이력, 보고서 준비 → 주관 부서 → 목차 → 리뷰 코멘트를 버튼으로 해 봅니다.
// 단계마다 화면을 찍어 E2E_SHOTS(기본: 임시 폴더/pdca-e2e-shots)에 남기고, 끝나면 시험 계정·기록을 모두 되돌립니다.
// 시험 카드·그 해 보고서·목차에 운영 기록이 있으면 아무것도 바꾸지 않고 멈춥니다. 실행: pnpm dev 를 띄운 뒤 pnpm e2e:ui
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { pickTestCard } from "./pick-card.mjs";
import { guardProduction } from "../lib/db-target.ts";

guardProduction("e2e:ui");
const BASE = "http://localhost:3000";
const OUT = process.env.E2E_SHOTS ?? join(tmpdir(), "pdca-e2e-shots");
mkdirSync(OUT, { recursive: true });
const YEAR = 2026;
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
let fails = 0;
const check = (n, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "통과" : "실패"} ${n}${d ? " — " + d : ""}`); };
async function ensureUser(email, role, teamName) {
  const { data: team } = teamName ? await admin.from("teams").select("id").eq("name", teamName).single() : { data: null };
  let { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!p) { const { data } = await admin.auth.admin.createUser({ email, email_confirm: true }); p = { id: data.user.id }; }
  await admin.from("profiles").update({ role, team_id: team?.id ?? null, display_name: role === "dept_user" ? "이시험 차장" : "박시험 차장" }).eq("id", p.id);
}
async function del(email) {
  const { data: p } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (p) { const { error } = await admin.auth.admin.deleteUser(p.id); if (error) console.error("계정 삭제 실패", email, error.message); }
}
/** 시험용 워드 파일(문단만) — 경평 초안의 첨부 자료 */
async function docx(paras) {
  const z = new JSZip();
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  z.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.map((t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return Buffer.from(await z.generateAsync({ type: "uint8array" }));
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[페이지 오류]", String(e).slice(0, 400)));
  page.on("console", (m) => { if (m.type() === "error") console.log("[콘솔 오류]", m.text().slice(0, 300)); });
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  await page.goto(`${BASE}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=/`);
  await page.locator("form button[type=submit]").first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 30000 });
  return page;
}
const shot = (page, name, full = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const DEPT = "pdca-ui-dept@kca.kr", PMO = "pdca-ui-pmo@kca.kr";
// 시험 카드: 검사기획팀 카드 중 운영 기록(작성본·점검·수정 이력·자료)이 없는 첫 카드
const own = await pickTestCard(admin, "검사기획팀", "id, uid, data, original_html, title, updated_by, fixed_locked_at, fixed_locked_by");
if (!own) { console.log("운영 기록이 없는 시험 카드가 없어 멈춤"); process.exit(1); }
console.log(`시험 카드: ${own.id} ${own.title}`);
const { data: units0 } = await admin.from("eval_units").select("id, lead_team_id");
const busy = async (t, q) => (await q(admin.from(t).select("*", { count: "exact", head: true }))).count ?? 0;
const pre = { v: await busy("card_versions", (q) => q.eq("card_id", own.id)), e: await busy("card_edits", (q) => q.eq("card_id", own.id)), r: await busy("reports", (q) => q.eq("year", YEAR)), o: await busy("report_outline", (q) => q.eq("year", YEAR)) };
if (Object.values(pre).some(Boolean)) { console.log("운영 기록이 있어 멈춤", pre); process.exit(1); }
try {
  await ensureUser(DEPT, "dept_user", "검사기획팀");
  await ensureUser(PMO, "pmo", null);
  const d = await session(DEPT);
  const p = await session(PMO);

  // ── 부서: 카드 칸에 입력 → 자동 저장 → 제출
  await d.goto(`${BASE}/my?peek=${own.uid}`, { waitUntil: "networkidle" });
  const line = d.locator('[data-p^="do.lines."][contenteditable]').first();
  await line.click();
  await d.keyboard.press("End");
  await d.keyboard.type(" (UI 시험 입력)");
  await d.waitForTimeout(3500);
  const status = await d.locator('[role="status"]').first().innerText().catch(() => "");
  check("입력 뒤 자동 저장", /저장됨/.test(status), status);
  const { data: v1 } = await admin.from("card_versions").select("id, status, data").eq("card_id", own.id).maybeSingle();
  check("작성본에 입력 반영(원장은 그대로)", v1?.status === "draft" && JSON.stringify(v1.data.do.lines).includes("(UI 시험 입력)"));
  await shot(d, "20-dept-typed");
  // 리뷰어 도구줄: 작성 중엔 네 가지, Esc는 도구줄만 닫음(옆 창은 그대로)
  const dBar = d.getByRole("toolbar", { name: "고른 글" });
  const dragD = async (sel) => {
    const el = d.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    const y = b.y + Math.min(11, b.height / 2);
    await d.mouse.move(b.x + b.width * 0.3, y);
    await d.mouse.down();
    await d.mouse.move(b.x + b.width * 0.6, y, { steps: 6 });
    await d.mouse.up();
    await d.waitForTimeout(350);
  };
  await dragD('.kca-card [data-p^="do.lines."][contenteditable]');
  check("부서 작성본: 드래그 도구줄 네 가지", (await dBar.getByRole("button").count()) === 4, JSON.stringify({ buttons: await dBar.getByRole("button").allInnerTexts().catch(() => []), sel: await d.evaluate(() => String(window.getSelection())).catch(() => "") }));
  await d.keyboard.press("Escape");
  await d.waitForTimeout(200);
  check("Esc는 도구줄만 닫음", !(await dBar.isVisible()) && (await d.locator("aside.peek-sheet").count()) === 1);
  await d.getByRole("button", { name: "성과관리팀에 제출" }).click();
  await d.waitForTimeout(2500);
  const { data: v2 } = await admin.from("card_versions").select("status").eq("card_id", own.id).single();
  check("제출 버튼 → 제출됨", v2.status === "submitted", v2.status);
  check("제출 뒤 칸 잠김(읽기 전용)", (await d.locator('[data-p^="do.lines."][contenteditable]').count()) === 0);
  await dragD('.kca-card [data-p^="do.lines."]');
  check("읽기 전용: 도구줄은 질문만", (await dBar.getByRole("button").allInnerTexts()).map((t) => t.trim()).join(",") === "질문");
  await shot(d, "21-dept-submitted");

  // ── 성과관리팀: 비교 보기 → 확정
  await p.goto(`${BASE}/cards?peek=${own.uid}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "비교 보기" }).click();
  await p.waitForTimeout(500);
  check("비교에 입력한 칸", (await p.locator("ol li").filter({ hasText: "(UI 시험 입력)" }).count()) > 0);
  await shot(p, "22-pmo-compare");
  await p.getByRole("button", { name: "확정(원장 반영)" }).click();
  await p.waitForTimeout(3000);
  const { data: led } = await admin.from("cards").select("data").eq("id", own.id).single();
  check("확정 → 원장 반영", JSON.stringify(led.data.do.lines).includes("(UI 시험 입력)"));
  const shownLedger = await p.locator('[data-p^="do.lines."]').allInnerTexts();
  check("확정 뒤 편집기가 원장 새 내용 표시", shownLedger.some((t) => t.includes("(UI 시험 입력)")));
  await p.getByRole("button", { name: "수정 이력" }).click();
  await p.waitForTimeout(1500);
  check("수정 이력 패널에 확정 기록", (await p.getByText("9월 작성본 확정").count()) > 0);
  await shot(p, "23-pmo-history");
  // ── 쪽 보기(인쇄 모양): 한글처럼 쪽을 나눠 그림(읽기 전용, 꼬리말에 원본 쪽 번호) → 이어 보기로 돌아오면 다시 편집
  await p.getByRole("button", { name: "쪽 보기" }).click();
  await p.waitForSelector(".hw-page", { timeout: 20000 });
  const pv = await p.evaluate(() => ({ pages: document.querySelectorAll(".hw-page").length, foot: document.querySelector(".hw-page .hw-foot")?.textContent?.replace(/\s/g, "") ?? "", editable: document.querySelectorAll('.hw-page [contenteditable]:not([contenteditable="false"])').length }));
  check("쪽 보기: 쪽으로 나눠 그림(읽기 전용, 꼬리말 쪽 번호)", pv.pages >= 1 && pv.editable === 0 && /^-\d+-$/.test(pv.foot), JSON.stringify(pv));
  await shot(p, "23b-pmo-pages");
  await p.getByRole("button", { name: "이어 보기" }).click();
  await p.waitForTimeout(500);
  check("이어 보기로 돌아오면 편집 칸", (await p.locator('.kca-card [data-p][contenteditable="plaintext-only"]').count()) > 0);

  // ── 카드 리뷰어(성과관리팀 원장): 드래그 → 도구줄 → 좋음 · 삭제(되돌리기) · AI 수정 요청+질문(5초 안 → 한 번에) → 반영 → 되돌리기
  await p.goto(`${BASE}/cards?peek=${own.uid}`, { waitUntil: "networkidle" });
  const paths = await p.evaluate(() => {
    const lines = [...document.querySelectorAll(".kca-card .kc-ln[contenteditable]")].filter((el) => el.innerText.trim().length > 30).map((el) => el.dataset.p);
    const first = (re, not = []) => lines.find((x) => re.test(x) && !not.includes(x));
    const ai = first(/^plan\./);
    const del = first(/^do\.lines\./);
    const ask = first(/^(outcome|check)\./, [ai, del]);
    const keep = first(/^(act|outcome|check|do)\./, [ai, del, ask]);
    return { ai, del, ask, keep };
  });
  console.log("리뷰어 시험 칸:", paths);
  const dragIn = async (path, from = 0.3, to = 0.6) => {
    const el = p.locator(`.kca-card [data-p="${path}"]`);
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    const y = b.y + Math.min(11, b.height / 2);
    await p.mouse.move(b.x + b.width * from, y);
    await p.mouse.down();
    await p.mouse.move(b.x + b.width * to, y, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(350);
  };
  const bar = p.getByRole("toolbar", { name: "고른 글" });
  // 카드 밖 여백에서 놓아도 도구줄(전체 페이지처럼 여백이 넓으면 줄 끝까지 끌다 카드 밖에서 놓기 쉬움)
  {
    const el = p.locator(`.kca-card [data-p="${paths.keep}"]`);
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    const card = await p.locator(".kca-card").first().boundingBox();
    const y = b.y + Math.min(11, b.height / 2);
    await p.mouse.move(b.x + b.width * 0.3, y);
    await p.mouse.down();
    await p.mouse.move(card.x + card.width + 60, y, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(350);
    check("카드 밖에서 놓아도 도구줄", await bar.isVisible());
    // 고른 글을 풀면 도구줄이 닫힘(Esc는 옆 창 닫기와 겹칠 수 있어 쓰지 않음)
    await p.evaluate(() => getSelection().removeAllRanges());
    await p.waitForTimeout(200);
  }
  await dragIn(paths.keep);
  check("드래그하면 도구줄(AI 수정 요청·질문·삭제·좋음)", (await bar.getByRole("button").allInnerTexts()).join(",").replace(/\s/g, "") === "AI수정요청,질문,삭제,좋음");
  await shot(p, "30-review-bar");
  await bar.getByRole("button", { name: "좋음" }).click();
  check("좋음 → 여백 메모", (await p.locator('[data-note][data-status="kept"]').count()) === 1);
  const delBefore = await p.locator(`.kca-card [data-p="${paths.del}"]`).innerText();
  await dragIn(paths.del, 0.35, 0.6);
  await bar.getByRole("button", { name: "삭제" }).click();
  await p.waitForTimeout(400);
  const delAfter = await p.locator(`.kca-card [data-p="${paths.del}"]`).innerText();
  check("삭제 → 고른 글만 지움", delAfter.length > 0 && delAfter.length < delBefore.length, `${delBefore.length}→${delAfter.length}자`);
  await shot(p, "31-review-deleted");
  await p.getByRole("status").getByRole("button", { name: "되돌리기" }).click();
  await p.waitForTimeout(400);
  check("삭제 되돌리기", (await p.locator(`.kca-card [data-p="${paths.del}"]`).innerText()) === delBefore);
  await p.waitForTimeout(2500);
  const { data: planRow } = await admin.from("cards").select("data").eq("id", own.id).single();
  const planBefore = JSON.stringify(planRow.data.plan);
  await dragIn(paths.ai, 0.2, 0.7);
  await bar.getByRole("button", { name: "AI 수정 요청" }).click();
  await p.getByLabel("코멘트 내용").fill("이 줄을 두괄식으로 한 문장만 더 짧게 다듬어 주세요(수치·사실은 그대로).");
  await shot(p, "32-review-composer");
  await p.keyboard.press("ControlOrMeta+Enter");
  await p.waitForTimeout(300);
  check("보내면 메모(보냄) + 5초 되돌리기 알림", (await p.locator('[data-note][data-status="grace"]').count()) === 1 && (await p.getByRole("status").getByRole("button", { name: "되돌리기" }).count()) === 1);
  if (paths.ask) {
    await dragIn(paths.ask, 0.2, 0.5);
    await bar.getByRole("button", { name: "질문" }).click();
    await p.getByLabel("코멘트 내용").fill("이 성과 표현이 점검 기준(정량 근거)에 맞나요? 한 문장으로 답해 주세요.");
    await p.keyboard.press("ControlOrMeta+Enter");
  }
  await p.waitForFunction(() => document.querySelectorAll('[data-note][data-status="sending"]').length > 0, null, { timeout: 15000 });
  check("5초 뒤 한 묶음으로 AI 처리 중", (await p.locator('[data-note][data-status="sending"]').count()) === (paths.ask ? 2 : 1));
  await shot(p, "33-review-sending");
  const t0 = Date.now();
  await p.waitForFunction(() => document.querySelectorAll('[data-note][data-status="grace"],[data-note][data-status="queued"],[data-note][data-status="sending"]').length === 0, null, { timeout: 330000 });
  const states = await p.locator("[data-note]").evaluateAll((els) => els.map((e) => e.dataset.status));
  console.log(`AI 처리 ${Math.round((Date.now() - t0) / 1000)}초 · 메모 상태: ${states.join(", ")}`);
  check("AI 결과: 수정 요청은 반영(또는 까닭과 함께 반영 안 함), 질문은 답변", states.includes("applied") || states.includes("declined"), states.join(","));
  if (paths.ask) check("질문 → 답변", states.includes("answered"), states.join(","));
  await shot(p, "34-review-done");
  if (states.includes("applied")) {
    await p.waitForTimeout(3500);
    const { data: afterAi } = await admin.from("cards").select("data").eq("id", own.id).single();
    check("AI 반영 → 원장 자동 저장", JSON.stringify(afterAi.data.plan) !== planBefore);
    const applied = p.locator('[data-note][data-status="applied"]');
    await applied.getByRole("button").first().click();
    await applied.getByRole("button", { name: "되돌리기" }).click();
    await p.waitForTimeout(3500);
    const { data: undone } = await admin.from("cards").select("data").eq("id", own.id).single();
    check("코멘트 되돌리기 → 원장도 원래대로", JSON.stringify(undone.data.plan) === planBefore);
    await shot(p, "35-review-undone");
  }
  const { count: aiRows } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("card_id", own.id).eq("feature", "card_comment");
  check("AI 사용 기록(card_comment) 한 번", aiRows === 1, String(aiRows));

  // ── AI 작성지원(오른쪽 패널 탭, 지침 09 — 드래그 코멘트와 다른 기능): 개선 제안(기본) · 실적 반영(모드 A, 요청 칸에 붙여 넣은 실적 + 첨부)
  // 오른쪽 패널은 늘 열려 있고 과제를 열면 「AI 작성지원」 탭(머리의 여닫는 버튼은 없앴음)
  check("오른쪽 패널: 「AI 작성지원 | 점검 결과」 탭, AI 작성지원이 기본", (await p.getByRole("tab", { name: "AI 작성지원", selected: true }).count()) === 1 && (await p.getByRole("tab", { name: "점검 결과" }).count()) === 1);
  const panel = p.getByRole("region", { name: "AI 작성지원" });
  await panel.getByRole("button", { name: "개선 제안 요청" }).click();
  await panel.getByText(/^개선 제안 · 근거 자료 \d+건/).waitFor({ timeout: 330000 });
  const reviewText = await panel.innerText();
  console.log("AI 작성지원(개선 제안) 결론:", (await panel.locator("p.text-sm.font-bold").first().innerText().catch(() => "")).slice(0, 120));
  check("AI 작성지원 개선 제안: 근거 자료·지침 기호(◆▸)·카드 반영 제안(8건 이하)", /[◆▸]/.test(reviewText) && /카드 반영 제안 [1-8]건/.test(reviewText), reviewText.slice(0, 160).replace(/\s+/g, " "));
  await shot(p, "36-assist-review");
  await panel.getByRole("radio", { name: "실적 반영", exact: true }).click();
  // 첨부: 옆 창에 파일을 놓으면(여기서는 파일 고르기 칸) 카드 전용 자료로 올라가고 첨부 칩으로 골라짐 → 요청에 함께 감
  const assistAtt = "UI시험-AI첨부-결과보고.docx";
  await panel.locator("input[type=file]").setInputFiles({ name: assistAtt, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await docx(["9월 실적 결과보고(9.26.)", "고속철도 LTE-R 준공검사 3건 완료(9.12.), 정기검사 2개 노선 12km 전파품질 측정 완료"]) });
  await panel.getByRole("button", { name: `${assistAtt} 첨부 빼기` }).waitFor({ timeout: 60000 });
  check("AI 작성지원 첨부: 파일 → 카드 전용 자료로 올리고 첨부 칩", true);
  // 실적 문장·수치는 요청 칸 하나에 붙여 넣음(따로 뜨던 붙여 넣기 칸은 없앴음)
  await panel.getByLabel("실적 자료·요청", { exact: true }).fill("9월 실적(결과보고 9.26.): 고속철도 LTE-R 준공검사 3건 완료(9.12.), 정기검사 2개 노선 12km 전파품질 측정 완료, 이동형 측정시스템 5대 운영으로 누적 측정 구간 1,240km");
  await panel.getByRole("button", { name: "실적 반영(모드 A) 요청" }).click();
  await panel.getByText(/^실적 반영\(모드 A\) · 근거 자료 \d+건/).waitFor({ timeout: 330000 });
  const reflectText = await panel.innerText();
  const sixCols = ["월", "추진실적", "정량성과", "정성성과", "진도율", "리스크(대응)"].every((k) => reflectText.includes(k));
  check("AI 작성지원 실적 반영(모드 A): 월별 6열 표 + 원본자료 확인 문구(또는 되묻기)", (sixCols && /원본자료 수치와 일치하는지/.test(reflectText)) || /되묻|확인되지 않습니다/.test(reflectText), reflectText.slice(0, 160).replace(/\s+/g, " "));
  check("AI 작성지원 실적 반영: 요청 말풍선에 첨부 이름", reflectText.includes(`첨부: ${assistAtt}`));
  await shot(p, "37-assist-reflect");
  // 뒤의 경평 초안 시험(첨부 1건)과 섞이지 않게 이 첨부는 바로 정리
  const { data: assistMats } = await admin.from("card_materials").select("id, storage_path").eq("card_id", own.id).eq("file_name", assistAtt);
  check("AI 작성지원 첨부: 카드 전용 자료 1건 등록", assistMats?.length === 1, String(assistMats?.length));
  if (assistMats?.length) {
    await admin.storage.from("card-materials").remove(assistMats.map((m) => m.storage_path));
    await admin.from("card_materials").delete().in("id", assistMats.map((m) => m.id));
  }
  const { count: assistRows } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("card_id", own.id).eq("feature", "card_assist").eq("status", "ok");
  check("AI 사용 기록(card_assist) 두 번", assistRows === 2, String(assistRows));

  // ── 월간 점검 AI 초안(종합점검 지침 14): 확정 카드 + 관리계획 발췌 → 20항목 판단·총평 → 초안으로 저장(보내기는 사람이)
  const inspPeriod = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  await p.goto(`${BASE}/inspections?period=${inspPeriod}&peek=${own.uid}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "AI 점검 초안", exact: true }).click();
  // 버튼이 「AI 점검 중…」이 됐다가 끝나면 「AI 점검 초안」으로 돌아옴(그 사이 화면을 떠나면 요청이 끊김)
  await p.getByRole("button", { name: "AI 점검 중…" }).waitFor({ timeout: 10000 });
  await p.getByRole("button", { name: "AI 점검 초안", exact: true }).waitFor({ timeout: 560000 });
  console.log("AI 점검 초안 결과:", (await p.locator('[role="status"], [role="alert"]').last().innerText().catch(() => "")).slice(0, 200));
  // AI 초안이 끝나면 「점검표 보기」(부서와 같은 AI 컨설팅 결과 양식) — 판단 칸(표 4번째 열)이 20개 모두 채워짐
  const judged = await p.locator('.peek-sheet article[aria-label="과제관리카드 AI 컨설팅 결과"] tbody tr td:nth-child(4)').evaluateAll((els) => els.filter((e) => /^(충족|미흡|기준 미확인|해당 없음)$/.test(e.textContent.trim())).length);
  check("AI 점검 초안: 20항목 모두 판단(보기 양식)", judged === 20, String(judged));
  const { data: insRow } = await admin.from("inspections").select("status, model, result").eq("card_id", own.id).eq("period", inspPeriod).maybeSingle();
  check(
    "AI 점검 초안 저장(초안·지침 14 양식·사례제안 붙임2 미확보·AI 표시)",
    insRow?.status === "draft" && insRow.result?.form === "biz14" && insRow.result.overview.case === "기준 미확인 — 붙임2 미확보" && Boolean(insRow.result.ai?.model) && Boolean(insRow.result.overview.status),
    JSON.stringify(insRow?.result?.notices ?? null),
  );
  const weakRows = ["axes", "patterns", "coherence"].flatMap((k) => insRow?.result?.[k] ?? []).filter((r) => r.judgment === "미흡");
  check("AI 점검 초안: 미흡마다 근거 원문·카드 근거", weakRows.every((r) => r.fix && r.card && r.evidence.some((e) => e.quote)), `미흡 ${weakRows.length}건 · 원문 확인 ${weakRows.flatMap((r) => r.evidence).filter((e) => e.verified).length}/${weakRows.flatMap((r) => r.evidence).length}`);
  await shot(p, "38-inspection-ai");
  await p.locator(".peek-sheet .overflow-y-auto").first().evaluate((el) => el.scrollTo(0, el.scrollHeight / 2));
  await shot(p, "38b-inspection-ai-rows");
  const { count: inspRows } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("card_id", own.id).eq("feature", "inspection").eq("status", "ok");
  check("AI 사용 기록(inspection) 한 번", inspRows === 1, String(inspRows));
  // 보낼 수 있는 초안이면 보내고, 부서 담당자 화면(받은 점검표)을 봄 — AI 초안에 확인할 곳이 남았으면 건너뜀(AI 결과에 따라 다름)
  const sendBtn = p.getByRole("button", { name: "부서에 보내기" });
  if (await sendBtn.isEnabled()) {
    await sendBtn.click();
    await p.getByText("부서에 보냈습니다.").waitFor({ timeout: 20000 });
    const { data: sentRow } = await admin.from("inspections").select("id, status").eq("card_id", own.id).eq("period", inspPeriod).single();
    await d.goto(`${BASE}/my/inspections?peek=${sentRow.id}`, { waitUntil: "networkidle" });
    const deptText = await d.locator(".peek-sheet").innerText();
    check("부서 받은 점검표(AI): 총평·보완할 것·양식 표·확인 버튼", /AI 점검 총평/.test(deptText) && /우수사례 벤치마킹 7대 축/.test(deptText) && (/보완할 것 \d+건/.test(deptText) || !weakRows.length) && /확인했습니다/.test(deptText) && !/운영 알림/.test(deptText), deptText.slice(0, 120).replace(/\s+/g, " "));
    await shot(d, "39-dept-inspection");
    await d.locator(".peek-sheet .overflow-y-auto").first().evaluate((el) => el.scrollTo(0, el.scrollHeight / 3));
    await shot(d, "39b-dept-inspection-rows");
    // 최종 점검현황: 저장한 판정 요약(result.summary) → 내 과제 목록 「AI 컨설팅」 칸에 「N월 판정 · 보냄」
    const { data: sumRow } = await admin.from("inspections").select("result").eq("id", sentRow.id).single();
    const verdict = sumRow?.result?.summary?.verdict;
    check("점검표 판정 요약(result.summary) 저장", ["점검완료", "보완요청", "재점검필요"].includes(verdict), JSON.stringify(sumRow?.result?.summary ?? null));
    await d.goto(`${BASE}/my`, { waitUntil: "networkidle" });
    const cellText = await d.evaluate((uid) => [...document.querySelectorAll("tr")].find((tr) => tr.querySelector(`a[href*="${uid}"]`))?.querySelector('[data-col="inspection"]')?.textContent ?? "", own.uid);
    check("내 과제 목록 AI 컨설팅: 최종 점검(점검월 · 판정 · 보냄)", cellText.includes(`${Number(inspPeriod.slice(5))}월`) && cellText.includes(verdict) && cellText.includes("보냄"), cellText);
  } else console.log("AI 초안에 보내기 전 확인할 곳이 있어 부서 화면 보기는 건너뜀:", await sendBtn.getAttribute("title"));

  // ── AI 작성지원 「질문」(지침 09 자유 대화 — 앞의 요청·답을 이어서 물음): 카드는 왼쪽 그대로, 자유 질문 → 마크다운 답
  await p.goto(`${BASE}/cards?peek=${own.uid}`, { waitUntil: "networkidle" });
  // 과제를 열면 오른쪽 패널의 「AI 작성지원」 탭
  const chat = p.getByRole("region", { name: "AI 작성지원" });
  check("AI 작성지원 기록이 옆 창을 다시 열어도 남음(이 탭)", (await chat.getByText(/^개선 제안 · 근거 자료 \d+건/).count()) === 1);
  await chat.getByRole("radio", { name: "질문" }).click();
  await chat.getByLabel("질문", { exact: true }).fill("전략연계 점검: 국정과제·ESG·AI활용(AX) 연계가 카드에 제대로 적혀 있는지 보고, 빠지거나 약한 곳을 보완해 주세요.");
  await chat.getByRole("button", { name: "질문 보내기" }).click();
  await chat.getByText(/^질문 · 근거 자료 \d+건/).waitFor({ timeout: 330000 });
  const chatText = await chat.locator("[data-answer]").last().innerText();
  check("AI 작성지원 질문: 자유 질문 → 마크다운 답(지침 기호·근거 자료 수·복사)", /[◆▸□]/.test(chatText) && /근거 자료 \d+건/.test(chatText) && chatText.includes("복사"), chatText.slice(0, 160).replace(/\s+/g, " "));
  check("AI 작성지원 질문: 카드는 왼쪽에 그대로(편집 칸 있음)", (await p.locator("[data-p]").count()) > 0);
  await shot(p, "40-card-chat");
  const { count: chatRows } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("card_id", own.id).eq("feature", "card_chat").eq("status", "ok");
  check("AI 사용 기록(card_chat) 한 번", chatRows === 1, String(chatRows));

  // ── 경평 초안 › 과제별 초안: 카드 1장(원장) + 이 화면에서 올린 첨부 자료 → 평가내용2 소항목 HTML(2025 최종본 양식)
  // 화면은 과제원장 전체 페이지와 같은 짜임: 머리 폴더 단추 → 오른쪽 자리에 「근거 자료」(✕·Esc로 탭에 돌아옴) · 「AI 초안」 탭 아래 요청 칸
  await p.goto(`${BASE}/reports/cards/${own.uid}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "근거 자료", exact: true }).click();
  const src = p.getByRole("region", { name: "근거 자료" });
  const attName = "UI시험-9월-결과보고.docx";
  await src.locator("input[type=file]").setInputFiles({ name: attName, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await docx(["9월 실적 결과보고(9.26.)", "고속철도 LTE-R 준공검사 3건 완료(9.12.), 이동형 측정시스템 5대로 누적 측정 구간 1,240km, 정기검사 2개 노선 12km 전파품질 측정 완료"]) });
  const attBox = src.getByRole("checkbox", { name: `${attName} 초안에 넣기` });
  await attBox.waitFor({ timeout: 30000 });
  check("과제별 초안: 이 화면에서 올린 카드 전용 자료가 근거 목록에 바로(기본으로 넣음)", await attBox.isChecked());
  await shot(p, "41a-report-card-sources");
  await src.getByRole("button", { name: "근거 자료 닫기" }).click();
  const aiDraft = p.getByRole("region", { name: "AI 초안" });
  check("과제별 초안: 올린 자료가 AI 초안 요청 칸의 첨부 칩에도 있음(고른 상태를 함께 씀)", (await aiDraft.getByText(attName).count()) > 0);
  // 요청 종류는 단계 레일에서 고름(요청 칸 칩 없음, 2026-10-22) — 구성안이 없으면 보조 단추가 바로 보냄, 초안이 생기면 주 단추가 「점검 결과 보기」
  await aiDraft.getByRole("button", { name: "구성안 없이 바로 만들기" }).click();
  await aiDraft.getByRole("button", { name: "점검 결과 보기" }).waitFor({ timeout: 480000 });
  check("보고서 초안: 소항목 HTML(실행과제 N-M·가.·라벨 사다리·추진성과)", (await p.locator(".k-task__no").count()) === 1 && (await p.locator("table.k-ladder").count()) === 1 && (await p.locator(".k-result__label").count()) === 1);
  const { data: draftRow } = await admin.from("card_report_drafts").select("spec, unknown_numbers, source_rev").eq("card_id", own.id).maybeSingle();
  check("보고서 초안 저장(spec·원장 개정 번호·첨부 1건)", [1, 2, 3].includes(draftRow?.spec?.version) && Array.isArray(draftRow.spec.rows) && (draftRow.spec.version !== 3 || draftRow.spec.blocks?.length > 0) && draftRow.source_rev !== null && draftRow.spec.sources?.length === 1 && draftRow.spec.sources[0].name === attName, JSON.stringify({ unknown: draftRow?.unknown_numbers ?? null, sources: draftRow?.spec?.sources ?? null }));
  check("초안 도구줄: 「반영: 첨부 1」", (await p.getByText("반영: 첨부 1").count()) > 0);
  const { count: repRows } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("card_id", own.id).eq("feature", "report_section").eq("status", "ok").like("mode", "%+1f");
  check("AI 사용 기록(report_section, 첨부 1건)", repRows === 1, String(repRows));
  await shot(p, "41-card-report", true);

  // ── 경평 초안: 준비 → 주관 부서 → 목차 → 부서 화면 → 코멘트
  await p.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: `${YEAR} 보고서 준비` }).click();
  await p.waitForTimeout(3000);
  check("보고서 준비 버튼", (await busy("reports", (q) => q.eq("year", YEAR))) > 0);
  const { data: insp } = await admin.from("teams").select("id").eq("name", "검사기획팀").single();
  await p.locator("select").first().selectOption(String(insp.id));
  await p.waitForTimeout(2500);
  const { data: bz1 } = await admin.from("eval_units").select("lead_team_id").eq("id", "BZ-1").single();
  check("주관 부서 고르기", bz1.lead_team_id === insp.id);
  await shot(p, "24-reports", true);
  await p.goto(`${BASE}/reports/outline`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "카드로 목차 만들기" }).click();
  await p.waitForTimeout(3000);
  await p.reload({ waitUntil: "networkidle" });
  const sums = await p.getByText(/쪽 \/ 15±1쪽/).allInnerTexts();
  check("목차 만들기 → 사업별 15쪽", sums.length === 3 && sums.every((t) => t.startsWith("15쪽")), sums.join(", "));
  await shot(p, "25-outline");
  await d.goto(`${BASE}/my/report`, { waitUntil: "networkidle" });
  await shot(d, "26-dept-report", true);
  const { data: rep } = await admin.from("reports").select("id").eq("year", YEAR).eq("team_id", insp.id).eq("eval_unit_id", "BZ-1").single();
  await d.goto(`${BASE}/reports/${rep.id}`, { waitUntil: "networkidle" });
  await d.getByLabel("코멘트 내용").fill("평가내용2 1-가 소항목은 2쪽이면 충분할까요?");
  await d.getByRole("radio", { name: "질문" }).click();
  await d.getByRole("button", { name: "보내기", exact: true }).click();
  await d.waitForTimeout(2500);
  check("리뷰어 코멘트 보내기", (await d.getByText("2쪽이면 충분할까요").count()) > 0);
  await shot(d, "27-reviewer");
} catch (e) {
  fails++;
  console.error(e);
} finally {
  await browser.close();
  await admin.from("cards").update({ data: own.data, original_html: own.original_html, title: own.title, updated_by: own.updated_by, fixed_locked_at: own.fixed_locked_at, fixed_locked_by: own.fixed_locked_by }).eq("id", own.id);
  for (const t of ["card_report_drafts", "inspections", "card_edits", "card_versions", "card_materials"]) { const { error } = await admin.from(t).delete().eq("card_id", own.id); if (error) console.error("정리 실패", t, error.message); }
  const { data: objs } = await admin.storage.from("card-materials").list(own.uid);
  if (objs?.length) { const { error } = await admin.storage.from("card-materials").remove(objs.map((o) => `${own.uid}/${o.name}`)); if (error) console.error("정리 실패 card-materials", error.message); }
  await admin.from("reports").delete().eq("year", YEAR);
  await admin.from("report_outline").delete().eq("year", YEAR);
  for (const u of units0) await admin.from("eval_units").update({ lead_team_id: u.lead_team_id }).eq("id", u.id);
  await del(DEPT);
  await del(PMO);
  const { data: back } = await admin.from("cards").select("original_html").eq("id", own.id).single();
  console.log("원복:", back.original_html === own.original_html, fails ? `실패 ${fails}` : "모두 통과", `· 화면: ${OUT}`);
  process.exitCode = fails ? 1 : 0;
}
