// 경영관리 카드의 AI 작성지원(지침 08, 2026-10-07): 카드 → AI 입력 글, 반영 경로 검사, 경영관리 전용 프롬프트(card-*-mg).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { NO_PDCA_GUIDES, pdcaGuide } from "../testing/originals.ts";
import { fillFrom } from "../prompts/template.ts";
import { BUNDLE_COLS, buildBundle, sharedTexts } from "../knowledge/bundle.ts";
import { PROMPT_FEATURES, assistPromptsMg, assistPrompts, chatPromptsMg, commentPromptsMg } from "../prompts/sets.ts";
import { type WriterResult, cardOutline, userPrompt, verifyResult } from "./writer.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = resolve(import.meta.dirname, "../..");
/** run.ts(server-only)의 cardSystem과 같은 조립 — 지침 사본·문체 기준을 시스템 글에 채움 */
const sys = (p: any, guide: string) => fillFrom(p, "system", "system", { guideline: pdcaGuide(guide), style: readFileSync(join(ROOT, "resources/harness/report-harness/style-guide.md"), "utf8") });
const mg: any = {
  id: "경영관리1/1-1", group: "경영관리1", taskNo: "1-1", title: "경영전략의 체계적 수립 및 이행", indicatorNo: 1, indicatorName: "전략기획", bundle: "경영전략",
  department: "경영기획본부", team: "경영기획팀", deptText: "경영기획본부(경영기획팀)", manager: "김가나 팀장", writer: "이다라",
  overview: { cells: ["∙ 과제 개요 한 줄"] },
  feedback: { rows: [{ self: ["∙ 국정과제와 전략 성과지표를 연계하는 체계 구축"], plan: ["∙ 이행지수를 경영목표로 설정"] }], headers: {} },
  findings: { rows: [{ finding: ["∙ 핵심가치 진단 기준의 개념이 구체적이지 않음"], plan: ["∙ 4대 진단기준 세부평가요소 부여"] }], headers: {} },
  do: { lines: ["∙ 추진내용 첫 줄", { table: { rows: [[{ lines: ["표 칸 글"] }]] } }], monthly: [{ period: "1월~8월", items: ["∙ 8월까지 실적"] }] },
  kpi: { rows: [{ name: "국정과제 이행지수", unit: "%", prev: "100", target: "100", nameRaw: "국정과제 이행지수(%)", sub: "- 직원" }], headers: {}, columns: ["name", "prev", "target"] },
  outcome: { quantitative: ["∙ 정량 한 줄"], qualitative: ["∙ 정성 한 줄"] },
};

test("경영관리 카드 개요: 칸 경로가 붙고(환류·지적 행·월별 실적·계량지표·추진성과), Plan·Check·전략 연계성 칸은 없음", () => {
  const t = cardOutline(mg);
  for (const path of ["title", "deptText", "@person", "overview.cells.0", "feedback.rows.0.self.0", "feedback.rows.0.plan.0", "findings.rows.0.finding.0", "findings.rows.0.plan.0", "do.lines.0", "do.lines.1.table.rows.0.0.lines.0", "do.monthly.0.period", "do.monthly.0.items.0", "kpi.rows.0.nameRaw", "kpi.rows.0.prev", "kpi.rows.0.target", "outcome.quantitative.0", "outcome.qualitative.0"])
    assert.match(t, new RegExp(`^${path.replace(/\./g, "\\.")} \\|`, "m"), path);
  assert.match(t, /\(과제번호 1-1 · 지표 1 전략기획 · 경영전략\)/);
  assert.ok(!/^(act|plan|strategy|check)\./m.test(t), "주요사업 칸 경로 없음");
  assert.match(t, /부칸 — 편집 칸 아님 \| - 직원/);
});

test("경영관리 반영 제안 경로: 환류·지적 표의 줄만 허용하고 알 수 없는 칸은 거름(없는 칸·부칸 제안 불가)", () => {
  const raw = (target_path: string): WriterResult => ({
    headline: "h", summary: "s", need_input: null, monthly_row: null, citations: [], followup: [],
    suggestions: [{ kind: "replace", target_path, period: null, proposed: ["새 글"], reason: "r", source_keys: [] }],
  } as unknown as WriterResult);
  const ok = (p: string) => verifyResult(raw(p), mg, []).suggestions[0].applicable;
  for (const p of ["findings.rows.0.plan.0", "findings.rows.0.finding.0", "feedback.rows.0.self.0", "feedback.rows.0.plan.0", "kpi.rows.0.target", "do.lines.0"]) assert.equal(ok(p), true, p);
  for (const p of ["findings.rows.0.sub", "findings.rows.9.plan.0", "act.findings.0", "strategy.ai.text"]) assert.equal(ok(p), false, p);
});

test("경영관리 프롬프트 폴더 3개가 주요사업과 같은 절 구성으로 읽히고, 판(version)은 주요사업과 따로", () => {
  for (const f of ["card-assist-mg", "card-chat-mg", "card-comment-mg"]) assert.ok(PROMPT_FEATURES[f], f);
  assert.match(assistPromptsMg().prompts.version, /^card-assist-mg@/);
  assert.notEqual(assistPromptsMg().prompts.version, assistPrompts().prompts.version);
  assert.match(chatPromptsMg().prompts.version, /^card-chat-mg@/);
  assert.match(commentPromptsMg().prompts.version, /^card-comment-mg@/);
});

test("경영관리 시스템 프롬프트: 지침 08 전문 + 경영관리 적응문, 주요사업 이름·대상사업 3개 설명은 없음", { skip: NO_PDCA_GUIDES }, () => {
  for (const text of [sys(assistPromptsMg().prompts, "08-assist-guide-mg.md"), sys(chatPromptsMg().prompts, "08-assist-guide-mg.md"), sys(commentPromptsMg().prompts, "08-assist-guide-mg.md")]) {
    assert.match(text, /경영관리 과제관리카드 운영 코디네이터 지침/, "지침 08 전문");
    assert.match(text, /경영관리 작성지원 지침\(08\)/);
    assert.match(text, /지침의 '대상사업'\(주요사업 3개\)은 경영관리 카드에 해당이 없고 지표가 그 자리를 맡습니다/);
    assert.ok(!text.includes("'전파이용 기회 확대'"), "주요사업 대상사업 설명 없음");
    assert.ok(!text.includes("{{"), "자리표시가 다 채워짐");
  }
  // 주요사업 시스템 프롬프트는 그대로(지침 09)
  assert.ok(!sys(assistPrompts().prompts, "09-assist-guide-biz.md").includes("경영관리 과제관리카드 운영 코디네이터 지침"));
});

test("경영관리 요청 글: 할 일은 지침 08(지적사항 환류·자료 대조·고정영역 문구), 모드 A 끝 문장은 지침 절대원칙 1 그대로", () => {
  const P = assistPromptsMg().prompts;
  const req = (mode: any) => userPrompt(P, mg, "", { mode, note: "", periodLabel: "2026년 10월", attachmentText: mode === "reflect" ? "9월 실적 12건" : null, files: [] });
  const improve = req("improve");
  assert.match(improve, /지침 「지적사항_환류」/);
  assert.match(improve, /핵심공통항목/);
  assert.match(improve, /고정영역 — 성과관리팀 제출 시 변경 사유를 함께 적어 주십시오/);
  assert.ok(!improve.includes("전략연계 점검"), "경영관리에는 전략 연계성 칸이 없음");
  assert.match(req("reflect"), /「이 초안의 수치가 원본자료와 일치하는지 확인 후 카드에 반영하십시오.」/);
  assert.match(req("discover"), /제안 목표치/);
  assert.match(improve, /^feedback\.rows\.0\.self\.0 \|/m, "카드 칸 경로가 요청에 들어감");
});

test("경영관리 공통 지식 층 글: 지표 공통(③)이 지표 이름으로 나오고 경영관리 층 문구를 씀", () => {
  const chunk = (key: string, business: string | null, track = "경영관리") => ({ chunk_key: key, doc_id: "plan-2607", seq: 1, unit_type: "checklist_group", track, business, title: key, text: "본문", context_prefix: null, meta: null });
  const b = buildBundle([chunk("a", "MG-3"), chunk("b", null), chunk("c", null, "가점")], { evalUnitId: "MG-3", data: mg });
  const texts = sharedTexts(assistPromptsMg().prompts, b).join("\n");
  assert.match(texts, /근거 자료 ③ 경영관리 지표3 일자리 및 균등한 기회 지표 공통/);
  assert.match(texts, /근거 자료 ① 경영관리 공통/);
  assert.match(texts, /근거 자료 ② 가점 공통/);
  assert.ok(BUNDLE_COLS.includes("business"));
});
