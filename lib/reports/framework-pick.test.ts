// 짜임 고르기·여러 안(lib/reports/framework-pick.ts) 시험 — 2026-10-12 「같은 양식 찍어내기」 ②·③:
// 고른 짜임 검증(트랙별 틀 목록·패턴 id·예시 절 키), 요청 글(자리표시가 남지 않고 근거 아님 안내가 들어감), 예시 절 글은 숫자·원문 대조 근거가 아님,
// 구성안 기록 필드(옛 구성안 호환), 여러 안 정리(같은 짜임 한 번만·「AI가 다르게」 순번)·같은 짜임 표시, 비용 어림, 이름 정규화(matchName).

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { MAIN_STORIES } from "./blocks.ts";
import { type Composition, type CompositionOutput, cleanComposition, readComposition } from "./composition.ts";
import { MG_MAIN_STORIES } from "./frameworks-mg.ts";
import { matchName } from "./frameworks.ts";
import { FRAMEWORK_PATTERNS, patternOf } from "./framework-patterns.ts";
import {
  ALT_LIMITS,
  type ExampleSection,
  altContext,
  altCostText,
  altSignature,
  cleanAltChoices,
  cleanFrameChoice,
  exampleItems,
  exampleOf,
  frameKey,
  frameLabel,
  framePrompt,
  isEmptyFrame,
  markDuplicateAlts,
  outlineCostUsd,
  outlineFrameOf,
  patternBlockText,
  patternPrompt,
} from "./framework-pick.ts";
import { outlineText } from "./outline-text.ts";
import { reportOutlinePrompts, reportOutlinePromptsMg } from "../prompts/sets.ts";
import { evidenceOf } from "./section.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const seed = { cards: seedCards<Record<string, any>>() };
const card = seed.cards.find((c) => c.id === "주요사업1/1-가")!;

const EXAMPLE: ExampleSection = {
  key: "rpt25-biz/BZ-9/9-9/가",
  title: "2025 보고서 9-9 가. 예시 절",
  where: "실행과제 9-9 · 2025 보고서 p.200",
  // 이 과제 근거에 없는 사실·숫자(예시 절은 짜임만 본뜸)
  text: "추진배경 | ∙ 예시기관 민원 4,321건 접수\n\n추진성과 | ∙ 처리시간 87% 단축",
  images: 3,
};

test("matchName: 가운뎃점 변형·띄어쓰기·화살표·번호·따옴표·「주 + 보조」를 정식 이름으로, 모르면 빈 글(두 트랙)", () => {
  assert.equal(matchName("한계 극복･다자협업형", MAIN_STORIES), "한계 극복·다자협업형");
  assert.equal(matchName("한계 극복ㆍ다자협업형", MAIN_STORIES), "한계 극복·다자협업형");
  assert.equal(matchName("한계 극복・다자협업형", MAIN_STORIES), "한계 극복·다자협업형");
  assert.equal(matchName("기존 => 개선형", MAIN_STORIES), "기존→개선형");
  assert.equal(matchName("③ 이슈→해결책형", MAIN_STORIES), "이슈→해결책형");
  assert.equal(matchName("가치 축 분할형 + 현장 목소리형", MAIN_STORIES), "가치 축 분할형");
  assert.equal(matchName("PDCA체계형", MG_MAIN_STORIES), "PDCA 체계형");
  assert.equal(matchName("단계ㆍ연도 로드맵형", MG_MAIN_STORIES), "단계·연도 로드맵형");
  for (const bad of ["", "  ", "섞음", "없는 틀형", undefined, null, 3]) assert.equal(matchName(bad, MAIN_STORIES), "", String(bad));
  // 모든 정식 이름은 자기 자신으로
  for (const s of [...MAIN_STORIES, ...MG_MAIN_STORIES]) assert.equal(matchName(s, [...MAIN_STORIES, ...MG_MAIN_STORIES]), s);
});

test("cleanFrameChoice: 이야기 틀은 그 트랙 목록(주요사업은 섞음 포함·경영관리 12종)만, 패턴은 카탈로그 id, 예시 절은 그 트랙 키 모양, auto는 다른 갈래가 없을 때만", () => {
  assert.deepEqual(cleanFrameChoice({ story: "단계 전개형", pattern: "pool-3-2", example: { key: "rpt25-biz/BZ-1/1-1/가", title: "  제목  " } }, false), { ok: true, frame: { story: "단계 전개형", pattern: "pool-3-2", example: { key: "rpt25-biz/BZ-1/1-1/가", title: "제목" } } });
  assert.deepEqual(cleanFrameChoice({ story: "섞음" }, false), { ok: true, frame: { story: "섞음" } });
  assert.equal(cleanFrameChoice({ story: "섞음" }, true).ok, false, "경영관리는 섞음 없음");
  assert.equal(cleanFrameChoice({ story: "배경·내용·성과형" }, false).ok, false, "트랙이 다른 틀");
  assert.equal(cleanFrameChoice({ story: "배경·내용·성과형" }, true).ok, true);
  assert.equal(cleanFrameChoice({ pattern: "없는-패턴" }, false).ok, false);
  assert.equal(cleanFrameChoice({ example: { key: "rpt25-mg-01/MG-1/1/1/가", title: "" } }, false).ok, false, "주요사업 카드에 경영관리 절");
  assert.equal(cleanFrameChoice({ example: { key: "rpt25-mg-01/MG-1/1/1/가", title: "" } }, true).ok, true);
  assert.equal(cleanFrameChoice({ example: { key: "corr25-2610/x", title: "" } }, true).ok, false, "보고서 절이 아닌 조각");
  assert.deepEqual(cleanFrameChoice({ auto: true }, false), { ok: true, frame: { auto: true } });
  assert.deepEqual(cleanFrameChoice({ auto: true, story: "단계 전개형" }, false), { ok: true, frame: { story: "단계 전개형" } }, "다른 갈래와 함께면 auto 버림");
  assert.deepEqual(cleanFrameChoice(undefined, false), { ok: true, frame: {} });
  assert.equal(isEmptyFrame({}), true);
});

test("cleanAltChoices: 2~3안, 빈 짜임·같은 짜임은 한 번만(걸러 낸 수), 「AI가 다르게」는 여러 번, 잘못된 짜임이면 거절", () => {
  const r = cleanAltChoices([{ story: "단계 전개형" }, { story: "단계 전개형" }, {}, { pattern: "std-1-5" }], false);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.alts, [{ story: "단계 전개형" }, { pattern: "std-1-5" }]);
    assert.equal(r.dropped, 2);
  }
  const auto = cleanAltChoices([{ auto: true }, { auto: true }, { story: "현장 목소리형" }], false);
  assert.ok(auto.ok && auto.alts.length === 3, "AI가 다르게 둘 + 틀 하나");
  assert.equal(cleanAltChoices([{ story: "단계 전개형" }], false).ok, false, "1안은 거절");
  assert.equal(cleanAltChoices([{ story: "단계 전개형" }, { pattern: "pool-3-1" }, { pattern: "pool-3-2" }, { pattern: "pool-3-5" }], false).ok, false, `${ALT_LIMITS.max}안 넘음`);
  assert.equal(cleanAltChoices([{ story: "없는 틀" }, { pattern: "pool-3-1" }], false).ok, false);
  assert.equal(cleanAltChoices("x", false).ok, false);
  assert.notEqual(frameKey({ story: "a" }), frameKey({ pattern: "a" }));
});

test("altContext: 「AI가 다르게」 안만 — 몇 번째 안·다른 안 이름·순번(AI 안끼리 다른 차례)", () => {
  const alts = [{ story: "현장 목소리형" }, { auto: true }, { auto: true }];
  assert.equal(altContext(alts, 0), null);
  const a1 = altContext(alts, 1)!;
  assert.deepEqual([a1.no, a1.total, a1.rank], [2, 3, 1]);
  assert.match(a1.others, /이야기 틀 현장 목소리형/);
  assert.match(a1.others, /AI가 정할 다른 안/);
  assert.equal(altContext(alts, 2)!.rank, 2);
});

test("요청 글(두 트랙): 구성 패턴·예시 절·여러 안 절이 자리표시 없이 채워지고, 짜임이 자동 판단보다 앞섬·근거 아님 안내가 들어감", () => {
  for (const [p, mg] of [[reportOutlinePrompts().prompts, false], [reportOutlinePromptsMg().prompts, true]] as const) {
    const text = framePrompt(p, { pattern: patternOf("std-1-5"), example: EXAMPLE, alt: { no: 2, total: 3, others: "이야기 틀 현장 목소리형", rank: 2 } }, mg);
    assert.doesNotMatch(text, /\{\{[^}]+\}\}/);
    assert.match(text, /담당자가 고른 짜임/);
    assert.match(text, /자동 판단·「틀 고르기」 후보보다 앞섭니다/);
    assert.match(text, /근거 없는 칸을 지어 채우지 않습니다/);
    assert.match(text, /표준 3단 1-5형/);
    assert.match(text, /표준보고서 컨설팅 「보고서 템플릿 구조 활용」\(2024\.11\) p\.11·12/);
    assert.match(text, /\[추진내용\] 추진실적 열 표\(table:result\) 3행/);
    assert.match(text, /이 글은 이 과제의 근거가 아닙니다/);
    assert.match(text, /예시기관 민원 4,321건/, "예시 절 글은 자르지 않고 짜임 참고로 넣음");
    assert.match(text, /그림·도식 3장은 글에 없습니다/);
    assert.match(text, /2\/3안/);
    assert.match(text, /2번째 틀부터/);
    assert.match(text, mg ? /그 절의 why/ : /storyWhy/);
    assert.match(text, mg ? /절 끝 라벨 「추진성과」 블록/ : /추진성과\(resultShape bullets/);
  }
  const p = reportOutlinePrompts().prompts;
  assert.equal(framePrompt(p, {}, false), "", "아무것도 안 고르면 빈 글");
  assert.doesNotMatch(framePrompt(p, { alt: { no: 1, total: 2, others: "x", rank: 1 } }, false), /번째 틀부터|담당자가 고른 짜임/, "첫 AI 안은 순번 안내 없음·짜임 머리 없음");
  for (const pat of FRAMEWORK_PATTERNS) assert.doesNotMatch(patternPrompt(p, pat, false), /\{\{[^}]+\}\}/, pat.id);
  assert.equal(patternBlockText({ label: "", kind: "banner", cells: 1 }), "(전폭) 메시지 띠(banner)");
  assert.equal(patternBlockText({ label: "추진내용", kind: "table", variant: "chevron", cells: 2, layout: "full" }), "[추진내용] 쉐브론 머리 표(table:chevron) 2행 · 전폭(라벨 칸 없음)");
});

test("예시 절 글은 근거가 아님: 그 글의 숫자·구절로 만든 재료는 원문 못 찾음·근거에 없는 숫자로 경고(숫자 대조 목록에 안 들어감)", { skip: NO_SEED_CARDS }, () => {
  // 서버(outline-actions.ts bizComposition)는 근거 글(p.known·p.quoteOnly)만으로 evidenceOf를 셈 — 예시 절 글은 요청 글에만
  const { hayKey, known } = evidenceOf(card);
  assert.ok(!known.has("4321") && !known.has("4,321"), "예시 숫자는 아는 숫자가 아님");
  const out = {
    message: "m",
    points: [],
    story: "단계 전개형",
    storyWhy: "",
    alternative: "",
    materials: [{ id: "m1", kind: "figure", text: "민원 4,321건 접수", when: "", source: "2025 예시 절", quote: "예시기관 민원 4,321건 접수" }],
    blocks: [{ kind: "stats", variant: "", label: "추진배경", purpose: "p", cells: 2, materials: ["m1"], figures: [], alts: [] }],
    results: "",
  } as CompositionOutput;
  const r = cleanComposition(out, hayKey, known);
  assert.equal(r.composition.materials[0].found, false);
  assert.ok(r.warnings.some((w) => /원문에서 구절을 찾지 못한 재료 1개/.test(w)));
  assert.ok(r.warnings.some((w) => /근거에 없는 숫자가 든 수치 재료 1개/.test(w)));
});

test("구성안 기록(frame): 고른 것 + 요청 글만 남기고, 옛 구성안(frame 없음)도 그대로 읽히며 화면 글은 빈 글", () => {
  assert.deepEqual(outlineFrameOf({ story: "단계 전개형", pattern: "pool-3-2" }, "  지적 해소를 앞에  "), { story: "단계 전개형", pattern: "pool-3-2", request: "지적 해소를 앞에" });
  assert.equal(outlineFrameOf({}, ""), undefined);
  assert.equal(outlineFrameOf({}, "x".repeat(600))?.request?.length, 500, "요청 글 500자");
  const old = { version: 1, message: "", points: [], story: "단계 전개형", storyWhy: "", alternative: "", blocks: [], results: "", materials: [], memo: "" };
  const c = readComposition(old) as Composition;
  assert.ok(c);
  assert.equal(outlineText(c).frame, "");
  assert.deepEqual(outlineText(c).partFrames, {});
  const withFrame = readComposition({ ...old, frame: { pattern: "std-1-6", example: { key: EXAMPLE.key, title: EXAMPLE.title }, request: "가로로" } })!;
  assert.equal(outlineText(withFrame).frame, "구성 패턴 표준 3단 1-6형 — 가로전개(0.5쪽) · 2025 예시 「9-9 가. 예시 절」");
  assert.equal(outlineText(withFrame).frameRequest, "가로로");
  assert.equal(frameLabel({ auto: true }), "AI가 다르게");
});

test("여러 안 정리: 같은 모양·배치·틀이면 같은 짜임(라벨 글은 안 봄), 앞 안 번호로 표시하고 실패한 안은 비교하지 않음", () => {
  const a = altSignature([{ kind: "cards", variant: "plus", label: "현황" }, { kind: "steps", variant: "row", label: "추진내용" }], "단계 전개형");
  const b = altSignature([{ kind: "cards", variant: "plus", label: "현황 및 문제점" }, { kind: "steps", variant: "row", label: "실행" }], "단계 전개형");
  const c = altSignature([{ kind: "cards", variant: "plus", label: "현황" }, { kind: "steps", variant: "row", label: "추진내용", layout: "stage" }], "단계 전개형");
  const d = altSignature([{ kind: "cards", variant: "plus", label: "현황" }, { kind: "steps", variant: "row", label: "추진내용" }], "원스톱 통합형");
  assert.equal(a, b);
  assert.notEqual(a, c, "배치가 다르면 다른 짜임");
  assert.notEqual(a, d, "틀이 다르면 다른 짜임");
  assert.deepEqual(markDuplicateAlts([a, null, b, c, a]), [null, null, 0, null, 0]);
  assert.deepEqual(markDuplicateAlts([null, null]), [null, null]);
});

test("비용 어림: 구성안 한 번 = 입력 캐시 쓰기 + 출력(지금 모델 단가), 여러 안은 N배 — 모르는 모델이면 금액 없이", () => {
  const one = outlineCostUsd("claude-sonnet-5-5", false)!;
  assert.ok(one > 0.5 && one < 1.5, `주요사업 1안 $${one}`);
  assert.ok(outlineCostUsd("claude-sonnet-5-5", true)! < one, "경영관리 입력이 조금 작음");
  assert.equal(outlineCostUsd("cli/claude-sonnet-5-5", false), one, "CLI는 API 환산");
  assert.equal(outlineCostUsd("모르는-모델", false), null);
  assert.equal(altCostText(3, one), `3안 = 구성안 3번 비용(약 $${(one * 3).toFixed(1)})`);
  assert.equal(altCostText(2, null), "2안 = 구성안 2번 비용");
});

test("예시 절 조각 → 요청 재료·고르기 목록(같은 사업·지표 먼저)", () => {
  const biz = exampleOf({ chunk_key: "rpt25-biz/BZ-1/1-1/가", title: "2025 보고서 1-1 가. 제목", text: "글", business: "BZ-1", report_page_2025: 119, meta: { task_no: "1-1", task_title: "과제", target_no: 1, target_name: "전파품질 향상", images: ["a", "b"] } });
  assert.equal(biz.where, "대상사업 1 전파품질 향상 · 실행과제 1-1 과제 · 2025 보고서 p.119");
  assert.equal(biz.images, 2);
  const mg = exampleOf({ chunk_key: "rpt25-mg-01/MG-1/1/1/가", title: "t", text: "", business: "MG-1", report_page_2025: null, meta: { eval_no: 1, eval_title: "평가", theme_no: 2, theme_title: "대주제" } });
  assert.equal(mg.where, "평가내용 1 평가 · 대주제 2 대주제");
  const items = exampleItems(
    [
      { chunk_key: "a", title: "A", business: "BZ-2" },
      { chunk_key: "b", title: "B", business: "BZ-1" },
      { chunk_key: "c", title: "C", business: "BZ-2" },
    ],
    "BZ-2",
  );
  assert.deepEqual(items.map((x) => [x.key, x.same]), [["a", true], ["c", true], ["b", false]]);
});

test("patternPrompt(2026-10-28): 주요사업은 구성 패턴의 핵심 수치 띠 블록을 「수치 띠 자리 — 단계 결과 줄·추진성과에」로 적고, 경영관리는 그대로 stats", () => {
  const p = reportOutlinePrompts().prompts;
  const pat = FRAMEWORK_PATTERNS.find((x) => x.blocks.some((b) => b.kind === "stats"))!;
  const biz = patternPrompt(p, pat, false);
  assert.doesNotMatch(biz, /\(stats\)/);
  assert.match(biz, /수치 띠 자리 — 주요사업은 수치 띠를 쓰지 않고 그 수치는 앞 블록의 단계 칸 결과 줄·표 결과 열·추진성과에/);
  assert.match(patternPrompt(reportOutlinePromptsMg().prompts, pat, true), /\(stats\)/);
});
