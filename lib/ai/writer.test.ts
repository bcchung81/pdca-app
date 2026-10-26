import assert from "node:assert/strict";
import { test } from "node:test";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { readCliResult } from "./cli-result.ts";
import { ASSIST_TEXT_MAX, SUGGESTION_MAX, WRITER_MODES, type WriterResult, WriterResultSchema, cardOutline, flattenHtmlTables, isAttachableName, knowledgeBlock, noRequirementResult, userPrompt, verifyResult } from "./writer.ts";
import { emptyResult } from "../inspections/model.ts";
import { followupBasis } from "./followup.ts";
import { fileRefs } from "./material-text.ts";
import { assistPrompts } from "../prompts/sets.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

// 작성지원 프롬프트(resources/prompts/card-assist) — 적응문 규칙 검사는 system.md @system에서
const P = assistPrompts().prompts;
const APP_ADAPTER = P.system.system;

const cards = seedCards();
const card = cards.find((c) => c.id === "주요사업1/1-가")!;
const refs = [{ key: "mid25-biz/BZ-1/03", title: "'25 중간보고서 지적 · 주요사업1 3번", unitType: "finding_row", text: "인공지능 안테나 자동 판독 기술을 통해 약 3만 시간의 검사 소요 시간을 단축했다고 제시하였으나 …" }];

test("결과 형식은 구조화 출력 형식으로 바뀐다", () => {
  const fmt = zodOutputFormat(WriterResultSchema);
  assert.ok(fmt);
});

test("카드 개요: 모든 글 칸에 경로가 붙고 표 안 칸도 나온다", { skip: NO_SEED_CARDS }, () => {
  const text = cardOutline(card);
  assert.ok(text.includes("title | AI 기반 안테나"));
  assert.ok(/plan\.lines\.0 \| /.test(text));
  assert.ok(/do\.monthly\.0\.items\.0 \| /.test(text));
  const withTable = cards.find((x) => x.do.lines?.some((l: unknown) => typeof l === "object"))!;
  assert.ok(/do\.lines\.\d+\.table\.rows\.\d+\.\d+\.lines\.\d+ \| /.test(cardOutline(withTable)));
});

test("요청: 모드·기준 월·요청 내용·근거 자료가 들어가고 근거 글은 꺾쇠가 풀린다", { skip: NO_SEED_CARDS }, () => {
  const p = userPrompt(P, card, knowledgeBlock([{ ...refs[0], text: "a<b>c" }]), { mode: "improve", note: "짧게", periodLabel: "2026년 9월", attachmentText: null, files: [] });
  assert.ok(p.includes("요청 종류: 개선 제안"));
  assert.ok(p.includes("요청 내용(사용자): 짧게"));
  // 개선 제안 = 지침 작업절차의 세 가지(지적사항 환류·전략연계 점검·점검 대비)를 한 요청으로
  for (const w of ["「지적사항_환류」", "「전략연계_점검」", "「점검기준」", "8건 이하"]) assert.ok(p.includes(w), w);
  assert.ok(p.includes('<source key="mid25-biz/BZ-1/03"'));
  assert.ok(p.includes("a&lt;b&gt;c"));
});

test("검증: 원문에 있는 인용만 확인됨, 없는 자료 key는 버림, 반영 경로는 실제 글 칸만", { skip: NO_SEED_CARDS }, () => {
  const raw: WriterResult = {
    headline: "h",
    summary: "◆ s",
    citations: [
      { key: "mid25-biz/BZ-1/03", quote: "「약 3만 시간의 검사 소요 시간을 단축」" },
      { key: "mid25-biz/BZ-1/03", quote: "원문에 없는 문장입니다" },
      { key: "없는/key", quote: "x" },
    ],
    suggestions: [
      { kind: "replace", target_path: "plan.lines.0", period: null, proposed: ["∙ 새 계획"], reason: "r", source_keys: ["mid25-biz/BZ-1/03", "없는/key"] },
      { kind: "replace", target_path: "overview", period: null, proposed: ["x"], reason: "r", source_keys: [] },
      { kind: "insert_after", target_path: "plan.lines.999", period: null, proposed: ["x"], reason: "r", source_keys: [] },
      { kind: "monthly", target_path: null, period: "9월", proposed: ["∙ 9월 실적"], reason: "r", source_keys: [] },
      { kind: "replace", target_path: "title", period: null, proposed: ["  "], reason: "빈 제안", source_keys: [] },
    ],
    monthly_row: null,
    need_input: null,
    followup: null,
  };
  const v = verifyResult(raw, card, refs);
  assert.deepEqual(v.citations.map((c) => c.verified), [true, false]);
  assert.deepEqual(v.suggestions.map((s) => s.applicable), [true, false, false, true]);
  assert.deepEqual(v.suggestions[0].sourceKeys, ["mid25-biz/BZ-1/03"]);
  assert.equal(v.suggestions[0].current, card.plan.lines[0]);
});

test("첨부 파일: 자료마다 <source key=file:N> 봉투에 뽑은 글을 표를 풀어 넣음(PDF도 글 — 원본 문서로 안 보냄)", { skip: NO_SEED_CARDS }, () => {
  const p = userPrompt(P, card, "", {
    mode: "reflect",
    note: "",
    periodLabel: "2026년 9월",
    attachmentText: null,
    files: [
      { name: "실적.pdf", text: "PDF에서 뽑은 글 12건" },
      { name: "9월 실적.hwpx", text: "<table><tr><th>구분</th><th>9월</th></tr><tr><td>검사<br>건수</td><td>1,240건</td></tr></table>" },
    ],
  });
  assert.ok(p.includes("「첨부 자료」 2건 — 이 카드의 카드 전용 자료"));
  assert.ok(p.includes('<source key="file:1" title="실적.pdf" kind="카드 전용 자료">\nPDF에서 뽑은 글 12건\n</source>'));
  assert.ok(p.includes('<source key="file:2" title="9월 실적.hwpx" kind="카드 전용 자료">\n구분 | 9월 |\n검사 / 건수 | 1,240건 |'));
  assert.ok(!p.includes("<table>"));
  assert.doesNotMatch(p, /PDF 문서로 붙어|앞부분만/);
});

test("첨부는 자르지 않음: 8만 자 자료 셋의 끝 글까지 모두 요청에 들어감(참고자료 1단계 — 예전 파일당 6만·합계 12만 자)", { skip: NO_SEED_CARDS }, () => {
  const files = ["가", "나", "다"].map((ch, i) => ({ name: `자료${i + 1}.hwpx`, text: `${ch.repeat(80_000)} 끝 수치 ${i + 1},234건` }));
  const p = userPrompt(P, card, "", { mode: "improve", note: "", periodLabel: "2026년 9월", attachmentText: null, files });
  for (const f of files) assert.ok(p.includes(f.text), f.name);
});

test("실적 반영: 요청 칸에 붙여 넣은 글은 「실적 자료·요청」으로(요청 내용 줄은 그쪽을 가리킴, 2만 자까지)", { skip: NO_SEED_CARDS }, () => {
  const pasted = "9월 실적: 준공검사 3건 완료(9.12.) — 월별 상자로 정리해 줘";
  const p = userPrompt(P, card, "", { mode: "reflect", note: "", periodLabel: "2026년 9월", attachmentText: pasted, files: [] });
  assert.ok(p.includes("요청 내용(사용자): 아래 「실적 자료·요청」에 함께 적혀 있을 수 있음"));
  assert.ok(p.includes(`「실적 자료·요청(사용자가 요청 칸에 붙여 넣은 글)」\n${pasted}`));
  assert.ok(!p.includes("(없음 — 요청 종류대로)"));
  const long = userPrompt(P, card, "", { mode: "reflect", note: "", periodLabel: "2026년 9월", attachmentText: "가".repeat(ASSIST_TEXT_MAX.reflect + 50), files: [] });
  assert.ok(long.includes("가".repeat(ASSIST_TEXT_MAX.reflect)) && !long.includes("가".repeat(ASSIST_TEXT_MAX.reflect + 1)));
  // 다른 요청 종류: 요청 내용은 그대로, 없으면 요청 종류대로
  assert.ok(userPrompt(P, card, "", { mode: "improve", note: "", periodLabel: "2026년 9월", attachmentText: null, files: [] }).includes("(없음 — 요청 종류대로)"));
});

test("공통 지식 HTML 표: 프롬프트에는 줄 글로, 인용은 표 칸 글과 대조해 원문 확인", { skip: NO_SEED_CARDS }, () => {
  const ref = { key: "att3/q1", title: "실사 답변", unitType: "qa_pair", text: '<table><tr><th>구 분</th><th>기 존</th></tr><tr><td>지표명</td><td>5G 이동통신<br>활성화 기여도</td></tr></table>' };
  const block = knowledgeBlock([ref]);
  assert.ok(block.includes("지표명 | 5G 이동통신 / 활성화 기여도 |"));
  assert.ok(!block.includes("&lt;table") && !block.includes("&lt;br"));
  // 조각 머리말(where — '25 등급·편람 가중치 등)도 보냄
  assert.ok(knowledgeBlock([{ ...ref, where: "'25 평가보고서 · 주요사업1 · 등급 C" }]).includes(`where="'25 평가보고서 · 주요사업1 · 등급 C"`));
  assert.match(APP_ADAPTER, /「관리계획 발췌」 = 제목이 '관리계획 …'/);
  // 2단계: 2025 경영실적보고서 절이 ③ 사업 공통에 들어감 — 전년 문장·실적으로만(예전에는 「근거 자료에 없으니 지어내지 않음」)
  assert.match(APP_ADAPTER, /경영실적보고서\(붙임0\) = 「2025 보고서 …」 제목의 절/);
  assert.match(APP_ADAPTER, /「근거 자료」 ①~③은 이 과제에 해당하는 자료가 빠지지 않게/);
  const raw: WriterResult = { headline: "h", summary: "s", citations: [{ key: "att3/q1", quote: "지표명 5G 이동통신 활성화 기여도" }], suggestions: [], monthly_row: null, need_input: null, followup: null };
  assert.equal(verifyResult(raw, card, [ref]).citations[0].verified, true);
});

test("카드 반영 제안은 8건까지(우선순위 순으로 받아 코드가 자름)", { skip: NO_SEED_CARDS }, () => {
  const raw: WriterResult = {
    headline: "h",
    summary: "s",
    citations: [],
    suggestions: Array.from({ length: 11 }, (_, i) => ({ kind: "insert_after" as const, target_path: "plan.lines.0", period: null, proposed: [`줄 ${i}`], reason: "r", source_keys: [] })),
    monthly_row: null,
    need_input: null,
    followup: null,
  };
  const v = verifyResult(raw, card, []);
  assert.equal(v.suggestions.length, SUGGESTION_MAX);
  assert.deepEqual(v.suggestions.map((x) => x.proposed[0]).slice(0, 2), ["줄 0", "줄 1"]);
});

test("첨부 인용: file:N 열쇠로 첨부 전체 글과 대조(뒤쪽 글도 원문 확인), 없는 열쇠는 버림", { skip: NO_SEED_CARDS }, () => {
  const docs = [{ id: "m1", kind: "card" as const, name: "결과보고.hwpx", text: `${"가".repeat(70_000)} LTE-R 준공검사 3건 완료` }];
  const raw: WriterResult = {
    headline: "h",
    summary: "s",
    citations: [
      { key: "file:1", quote: "LTE-R 준공검사 3건 완료" },
      { key: "file:1", quote: "지어낸 구절입니다" },
      { key: "file:9", quote: "없는 자료" },
    ],
    suggestions: [{ kind: "insert_after", target_path: "plan.lines.0", period: null, proposed: ["줄"], reason: "r", source_keys: ["file:1", "file:9"] }],
    monthly_row: null,
    need_input: null,
    followup: null,
  };
  const v = verifyResult(raw, card, fileRefs(docs));
  assert.deepEqual(
    v.citations.map((c) => [c.key, c.title, c.verified]),
    [
      ["file:1", "결과보고.hwpx", true],
      ["file:1", "결과보고.hwpx", false],
    ],
  );
  assert.deepEqual(v.suggestions[0].sourceKeys, ["file:1"]);
});
test("표 풀기: 병합 표의 태그·그림·참조 문자를 읽기 쉬운 줄로", () => {
  assert.equal(flattenHtmlTables('<table>\n<tr><td rowspan="2">A &amp; B</td><td><img src="x.png"></td></tr>\n</table>'), "A & B | [그림] |\n"); // 태그 사이 줄바꿈이 빈 줄로 남지 않음
  assert.ok(isAttachableName("결과보고.HWPX") && isAttachableName("a.pdf") && !isAttachableName("a.zip"));
});

test("CLI 결과: 구조화 출력·모델·토큰을 읽고, 오류·로그인·형식 누락을 가림", () => {
  const ok = readCliResult(
    JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: { a: 1 }, total_cost_usd: 0.1, usage: { input_tokens: 2, cache_creation_input_tokens: 900, cache_read_input_tokens: 50, output_tokens: 7 }, modelUsage: { "claude-opus-5-5": {} } }),
    "opus",
  );
  assert.deepEqual(ok, { output: { a: 1 }, model: "claude-opus-5-5", usage: { input: 2, output: 7, cacheRead: 50, cacheWrite: 900, cacheWrite1h: 0 }, costUsd: 0.1 });
  assert.throws(() => readCliResult("not json", "opus"), /AI 답을 읽지 못했습니다/);
  assert.throws(() => readCliResult(JSON.stringify({ subtype: "success", is_error: true, result: "Not logged in · Please run /login" }), "opus"), /로그인/);
  assert.throws(() => readCliResult(JSON.stringify({ subtype: "success", is_error: false, result: "x" }), "opus"), /형식/);
  assert.throws(() => readCliResult(JSON.stringify({ subtype: "success", is_error: true, result: "You've hit your session limit · resets 3:10pm (Asia/Seoul)" }), "opus"), /사용량 한도/);
});

test("CLI용 JSON 스키마: draft-7로 내면 결과 형식의 필수 칸이 그대로", () => {
  const schema = z.toJSONSchema(WriterResultSchema, { target: "draft-7" }) as { required: string[]; $schema: string };
  assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
  assert.deepEqual([...schema.required].sort(), ["citations", "followup", "headline", "monthly_row", "need_input", "suggestions", "summary"]);
});

function basisOf(fix = "정량 칸에 체감 수치 추가") {
  const r = emptyResult();
  r.axes[3] = { ...r.axes[3], judgment: "미흡", fix, card: "'추진성과 — 정량' — 내부 효율만", question: "", evidence: [], note: "" };
  return followupBasis({ period: "2026-09", status: "sent", result: r })!;
}

test("보완 점검: 요청 종류가 있고, 점검표 보완 요구 블록은 followup 요청에만 들어간다", { skip: NO_SEED_CARDS }, () => {
  assert.ok("followup" in WRITER_MODES);
  const req = { mode: "followup" as const, note: "", periodLabel: "2026년 9월", attachmentText: null, files: [], followup: basisOf() };
  const p = userPrompt(P, card, knowledgeBlock([]), req);
  assert.ok(p.includes("요청 종류: 보완 점검(모드 C)"));
  assert.ok(p.includes("「점검표 보완 요구」 — 2026-09 점검(부서에 보냄) · 미흡 1건"));
  assert.ok(p.includes("axes.4 | ★7대축 4 OutCome 연결 | 정량 칸에 체감 수치 추가 | '추진성과 — 정량' — 내부 효율만 | — | —"), "빈 칸(예상 질의·근거)은 —");
  assert.ok(p.includes("반영됨 · 일부 반영 · 미반영 · 확인 불가"));
  assert.ok(!userPrompt(P, card, knowledgeBlock([]), { ...req, mode: "improve" }).includes("점검표 보완 요구"), "다른 요청 종류에는 블록이 없음");
});

test("보완 점검 검증: verifyResult가 followup 답을 점검표 행과 맞춰 대조표로 만들고, 점검표를 안 주면 null", { skip: NO_SEED_CARDS }, () => {
  const res: WriterResult = { headline: "h", summary: "s", citations: [], suggestions: [], monthly_row: null, need_input: null, followup: [{ id: "axes.4", judgment: "미반영", card_quote: "", inspection_quote: "", remaining: "정량 칸에 수치 추가" }] };
  const v = verifyResult(res, card, [], basisOf());
  assert.equal(v.followup?.counts["미반영"], 1);
  assert.equal(v.followup?.items[0].remaining, "정량 칸에 수치 추가");
  assert.equal(verifyResult(res, card, []).followup, null);
});

test("보완 요구가 0건이면 AI 없이 코드가 만든 결과(항목 0건, 안내 문구)", () => {
  const b = followupBasis({ period: "2026-09", status: "sent", result: emptyResult() })!;
  const r = noRequirementResult(b);
  assert.equal(r.followup?.counts.total, 0);
  assert.ok(r.headline.includes("보완 요구가 없습니다"));
  assert.deepEqual(r.suggestions, []);
});
