// 경평 초안 근거 합치기(lib/reports/draft-sources.ts) + 집필 요청의 「구성안 뒤 추가된 자료」·「담당자 요청」(composition.ts planReviseText — 두 트랙) — 2026-10-29
import assert from "node:assert/strict";
import { test } from "node:test";
import { missingSources, mergeSources, pickOf, readPick, specSources, withFileSources } from "./draft-sources.ts";
import { type Composition, planPrompt } from "./composition.ts";
import { mgPlanPrompt } from "./mg-draft.ts";
import { reportDraftPrompts, reportDraftPromptsMg } from "../prompts/sets.ts";

test("mergeSources: 저장된 근거 ∪ 지금 고른 근거 — 새 자료는 뒤에, 뺀 자료는 저장된 근거에 있어도 뺌, 전년 절은 저장된 것 그대로", () => {
  const saved = { card: ["c1", "c2"], report: ["r1"], prior: ["p1"] };
  const m = mergeSources(saved, { card: ["c1", "c3"], report: ["r2"], off: { card: ["c2"], report: [] } });
  assert.deepEqual(m.sources, { card: ["c1", "c3"], report: ["r1", "r2"], prior: ["p1"] });
  assert.deepEqual(m.added, { card: ["c3"], report: ["r2"] });
  assert.equal(m.kept, 2, "c1·r1(뺀 c2 제외)");
  // 새로 고른 자료를 다시 빼면 안 들어감
  assert.deepEqual(mergeSources(saved, { card: ["c3"], report: [], off: { card: ["c3"], report: ["r1"] } }).sources, { card: ["c1", "c2"], report: [], prior: ["p1"] });
});

test("mergeSources: 고른 근거가 없으면 저장된 근거 그대로(예전 호출), 옛 구성안(근거 기록 없음)이면 고른 자료가 모두 새 자료 · 전년 절은 자동", () => {
  const saved = { card: ["c1"], report: [], prior: [] };
  assert.deepEqual(mergeSources(saved, undefined), { sources: saved, added: { card: [], report: [] }, kept: 1 });
  const old = mergeSources(null, { card: ["c1", "c2"], report: [] });
  assert.equal(old.sources.prior, undefined, "전년 절 없음 = 서버가 자동으로 고름");
  assert.deepEqual(old.sources, { card: ["c1", "c2"], report: [] });
  assert.deepEqual(old.added.card, ["c1", "c2"]);
});

test("missingSources: 지금 고른 자료 중 이 카드 자료가 아닌 것(다른 카드 id)은 거절, 저장된 근거 중 지운 것은 넘어감", () => {
  const want = { card: ["c1", "other-card"], report: ["r9"] };
  const found = { card: ["c1"], report: [] };
  // 다른 카드의 자료 id·다른 보고서 id는 DB 조회(card_id·report_id 조건)에서 안 나옴 → 찾지 못함 → 거절
  assert.deepEqual(missingSources(want, found), ["other-card", "r9"]);
  // 저장된 근거(loose)에 든 id는 그 뒤 지웠어도 거절하지 않음 — 지금 새로 고른 id만 확인
  assert.deepEqual(missingSources(want, found, { card: ["other-card"], report: [] }), ["r9"]);
  // lenient(직접 고침·되돌리기)는 아무것도 거절하지 않음
  assert.deepEqual(missingSources(want, found, true), []);
});

test("readPick·pickOf: 서버는 받은 값의 모양·크기만 받아들이고(문자열 id), 화면의 뺀 자료 열쇠(c:·r:)를 나눔", () => {
  assert.equal(readPick(null), undefined);
  assert.equal(readPick("x"), undefined);
  assert.deepEqual(readPick({ card: ["a", 1, "", "a", "x".repeat(81)], report: "r", off: { card: ["b"], report: [null] } }), { card: ["a"], report: [], off: { card: ["b"], report: [] } });
  assert.deepEqual(readPick({ card: Array.from({ length: 400 }, (_, i) => `c${i}`), report: [] })?.card.length, 300);
  assert.deepEqual(pickOf(["c1"], ["r1"], new Set(["c:c2", "r:r3"])), { card: ["c1"], report: ["r1"], off: { card: ["c2"], report: ["r3"] } });
});

test("블록 고치기 근거: 초안 근거(spec.sources) ∪ 지금 고른 근거 — 초안 뒤 올린 자료가 들어가고 뺀 자료는 빠짐, 새로 쓴 자료는 초안 근거 목록에도 더함", () => {
  const spec = [
    { kind: "card", id: "c1", name: "a.hwp" },
    { kind: "prior", id: "rpt25-biz/1", name: "2025 절" },
    { kind: "lens", id: "l1", name: "편람" },
  ];
  const saved = specSources(spec);
  assert.deepEqual(saved, { card: ["c1"], report: [], prior: ["rpt25-biz/1"] });
  assert.deepEqual(specSources(spec, ["k"]).prior, ["k"], "priorKeys가 있으면 그것");
  const m = mergeSources(saved, { card: ["c1", "c-new"], report: [] });
  assert.deepEqual(m.sources, { card: ["c1", "c-new"], report: [], prior: ["rpt25-biz/1"] });
  assert.deepEqual(mergeSources(saved, { card: ["c-new"], report: [], off: { card: ["c1"], report: [] } }).sources.card, ["c-new"]);
  // 새 자료는 첨부 뒤·전년 절 앞에, 이미 있는 자료는 그대로
  const next = withFileSources(spec, [
    { kind: "card", id: "c1", name: "a.hwp" },
    { kind: "card", id: "c-new", name: "b.pdf" },
  ]);
  assert.deepEqual(next?.map((x) => x.id), ["c1", "c-new", "rpt25-biz/1", "l1"]);
  assert.equal(withFileSources(spec, [{ kind: "card", id: "c1", name: "a.hwp" }]), spec, "새 자료가 없으면 그대로");
});

const plan = (over: Partial<Composition> = {}): Composition => ({ version: 1, message: "메시지", points: ["논점"], story: "단계 전개형", storyWhy: "", alternative: "", blocks: [], results: "결과", materials: [], memo: "", ...over });

test("집필 요청(주요사업·경영관리): 구성안 뒤 추가된 자료·담당자 요청이 있으면 「승인된 구성안」 끝에 두 절 — 없으면 예전 글 그대로", () => {
  const revise = { added: ["새 실적.hwpx", "만족도.pdf"], request: "추진성과를 새 자료의 올해 실적으로 채워 주세요" };
  for (const [name, render] of [
    ["주요사업", (r?: typeof revise) => planPrompt(reportDraftPrompts().prompts, plan(), 1, "all", r)],
    ["경영관리", (r?: typeof revise) => mgPlanPrompt(reportDraftPromptsMg().prompts, plan(), { indicator: "지표", prior: [], pages: null }, r)],
  ] as const) {
    const base = render();
    const text = render(revise);
    assert.ok(text.startsWith(base), `${name}: 앞부분은 예전 글 그대로`);
    assert.doesNotMatch(text, /\{\{\w+\}\}/);
    assert.match(text, /「구성안 뒤 추가된 자료」 2건 — .*「새 실적\.hwpx」, 「만족도\.pdf」/, name);
    assert.match(text, /구성안 재료 번호에 없어도/, `${name}: 재료 번호 밖 자료를 먼저 씀`);
    assert.match(text, /짜임\(.*블록 수·순서·종류.*\)은 바꾸지 않습니다/, `${name}: 짜임은 그대로`);
    assert.match(text, /근거에 없는 숫자는 쓰지 않습니다/, `${name}: 근거 밖 숫자 금지`);
    assert.match(text, /「담당자 요청」 — .*근거로 쓰지 않습니다.*\n추진성과를 새 자료의 올해 실적으로 채워 주세요/, `${name}: 요청 글은 지시로만`);
    assert.ok(text.indexOf("「구성안 뒤 추가된 자료」") < text.indexOf("「담당자 요청」"));
    // 하나만 있으면 그 절만, 둘 다 없으면 예전 글
    assert.doesNotMatch(render({ added: [], request: "요청만" }), /구성안 뒤 추가된 자료/);
    assert.doesNotMatch(render({ added: ["a.hwp"], request: "  " }), /담당자 요청/);
    assert.equal(render({ added: [], request: "" }), base, `${name}: 둘 다 없으면 바이트까지 같음`);
  }
});
