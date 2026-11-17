// 저장된 과제별 초안의 「없는 숫자」 다시 세기(lib/reports/draft-recount.ts, 2026-11-16) — 저장값(unknown_numbers·warnings)을 믿지 않고 다시 셈,
// 정상 초안(저장값 = 다시 센 값)은 화면·내려받기가 그대로, 근거가 적을수록 더 많이 잡힘(안전한 쪽).
// 3차(2026-11-17): 깨진 초안·한도를 넘는 글·다시 세기 실패는 던지지 않고 「없는 숫자 확인 불가」(막힘), 모양 검사를 지난 초안은 화면 함수가 던지지 않음.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { layoutBusiness, sheetsOf } from "./business-layout.ts";
import { sheetHtml } from "./business-html.ts";
import { SPEC_STRING_MAX, readDraftSpec, recountDraft, recountFailNote, recountUnknown, specIssue, unknownView, unknownWarnings } from "./draft-recount.ts";
import { recheckMgSection } from "./mg-draft.ts";
import type { MgPart } from "./mg-types.ts";
import { type ReportSectionSpec, recheckSection, sectionText } from "./section.ts";
import { sectionDocument, sectionHtml } from "./section-html.ts";
import { cardSubmitRow } from "./submission.ts";
import { warningLevel } from "./warning-levels.ts";

const block = (over: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...over });

const spec = (items: string[]): ReportSectionSpec => ({
  version: 3,
  card: { id: "주요사업3/3-나", taskNo: "3-나", title: "가짜 지원사업" },
  business: { no: 3, name: "가짜 대상사업" },
  task: { no: "3-1", title: "가짜 실행과제", bp: false },
  sub: { mark: "나", title: "현장 지원 확대", markers: [] },
  rows: [],
  blocks: [block({ label: "추진성과", items })],
  results: [],
  caption: "",
  module: 1,
});

const card = { taskNo: "3-나", title: "가짜 지원사업", outcome: { quantitative: ["현장 컨설팅 1,234건"] } };
const draft = spec(["현장 컨설팅 1,234건 지원", "만족도 87.5% 달성"]);
const KNOWN = "결과보고: 참여 기관 345곳";

test("저장값이 비어 있어도 다시 세어 없는 숫자를 칠하고, 경고에 없는 숫자 줄(막힘)을 다시 넣음", () => {
  const r = recountDraft(draft, card, KNOWN, { unknown: [], warnings: [] });
  assert.deepEqual(r.unknown, ["87.5%"]);
  assert.deepEqual(r.added, ["87.5%"]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /^카드·첨부 자료에 없는 숫자 1개\(저장된 점검 결과에 없던 1개를 다시 셈/);
  assert.equal(warningLevel(r.warnings[0]), "block", "없는 숫자 줄은 막힘 등급(앞머리 없이 같은 글 규칙)");
  // 미리보기·내려받기는 다시 센 값으로 붉은 점선
  assert.match(sectionHtml(draft, r.unknown), /<span class="k-unv"[^>]*>(<span class="k-nb">)?87\.5%</);
  assert.doesNotMatch(sectionHtml(draft, []), /k-unv/, "저장값만 믿으면 점선이 사라짐(고치기 전 동작)");
  // 근거가 하나도 없으면 다시 점검과 같은 말(「카드」)
  assert.match(recountDraft(draft, card, "", { unknown: null, warnings: [] }).warnings[0], /^카드에 없는 숫자 1개/);
});

test("정상 초안(저장값 = 다시 센 값): 칠할 숫자·경고·HTML 출력이 저장값 그대로", () => {
  const saved = recheckSection(draft, card, KNOWN);
  const r = recountDraft(draft, card, KNOWN, { unknown: saved.unknownNumbers, warnings: saved.warnings });
  assert.deepEqual(r.unknown, saved.unknownNumbers);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.warnings, saved.warnings);
  assert.equal(sectionHtml(draft, r.unknown, { blockMarks: true, repeats: true }), sectionHtml(draft, saved.unknownNumbers, { blockMarks: true, repeats: true }));
  const meta = { year: 2026, generatedAt: "2026-11-16 10:00", model: "m" };
  assert.equal(sectionDocument(draft, r.unknown, meta), sectionDocument(draft, saved.unknownNumbers, meta));
});

test("저장 뒤 근거가 늘어 다시 센 값에서 빠진 숫자는 저장값대로 남고(예전 화면 그대로), 저장값의 다른 숫자도 그대로 더함", () => {
  const r = recountDraft(draft, card, `${KNOWN}\n만족도 87.5%`, { unknown: ["87.5%", "9,999"], warnings: ["판면: 어림 300mm", "카드·첨부 자료에 없는 숫자 2개 — 원자료로 확인하거나 지워 주세요: 87.5%, 9,999"] });
  assert.deepEqual(r.unknown, ["87.5%", "9,999"]);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.warnings, ["판면: 어림 300mm", "카드·첨부 자료에 없는 숫자 2개 — 원자료로 확인하거나 지워 주세요: 87.5%, 9,999"]);
});

test("unknownWarnings: 저장값에 없던 숫자가 있으면 기존 없는 숫자 줄 자리를 바꾸고(다시 센 것 먼저), 다른 경고 순서는 그대로", () => {
  const v = unknownView(["1,111"], ["1,111", "87.5%"]);
  assert.deepEqual(v, { unknown: ["1,111", "87.5%"], added: ["87.5%"] });
  const w = unknownWarnings(["문장: 가", "카드에 없는 숫자 1개 — 원자료로 확인하거나 지워 주세요: 1,111", "판면: 나"], v, "카드");
  assert.equal(w.length, 3);
  assert.equal(w[0], "문장: 가");
  assert.match(w[1], /^카드에 없는 숫자 2개\(저장된 점검 결과에 없던 1개를 다시 셈 — .*\) — 원자료로 확인하거나 지워 주세요: 87\.5%, 1,111$/);
  assert.equal(w[2], "판면: 나");
  assert.deepEqual(unknownView("{}", []), { unknown: [], added: [] }, "배열이 아닌 저장값은 빈 값");
});

test("근거가 적을수록 없는 숫자가 더 많이 잡힘(단조 — 근거 일부로 센 값 ⊇ 전부로 센 값)", () => {
  const s = spec(["목표 1,000건 대비 1,234건(123.4%) 달성", "참여 기관 345곳·만족도 87.5%", "전년 900건에서 1,234건으로 334건 증가"]);
  const full = "목표 1,000건\n참여 기관 345곳\n만족도 87.5%\n전년 900건";
  const lines = full.split("\n");
  const all = new Set(recountUnknown(s, card, full));
  for (let mask = 0; mask < 1 << lines.length; mask++) {
    const part = lines.filter((_, i) => mask & (1 << i)).join("\n");
    const sub = new Set(recountUnknown(s, card, part));
    for (const x of all) assert.ok(sub.has(x), `근거 일부(${part.replace(/\n/g, " / ")})로 센 값에 ${x}가 있어야 함`);
  }
  assert.deepEqual([...all], [], "근거 전부면 셈한 값(123.4%·334)까지 근거");
});

test("경영관리 초안은 경영관리 다시 점검(절 제목 글 포함)으로 셈", () => {
  const part: MgPart = { key: "1.1.가", evalNo: 1, evalTitle: "가짜 평가내용", themeNo: 1, themeTitle: "가짜 대주제", mark: "가", title: "만족도 92점 달성", story: "", why: "" };
  const mg: ReportSectionSpec = { ...spec(["교육 1,234건 운영"]), mg: { indicator: "가짜 지표", parts: [part], at: ["1.1.가"] } };
  assert.deepEqual(recountUnknown(mg, card, ""), recheckMgSection(mg, card, "").unknownNumbers);
  assert.ok(recountUnknown(mg, card, "").includes("92"), "절 제목의 숫자도 셈");
  assert.ok(!recountUnknown(spec(["교육 1,234건 운영"]), card, "").includes("92"));
});

// ---------------------------------------------------------------------------
// 3차(2026-11-17): 실패하면 막힘

const FAIL = /^없는 숫자 확인 불가: /;
const stored = { unknown: ["9,999"], warnings: ["판면: 어림 300mm"] };

/** 여러 블록 모양이 든 가짜 초안(칸·전후 비교·막대·그림·배치까지) */
const rich = (): ReportSectionSpec => ({
  ...spec(["현장 컨설팅 1,234건 지원"]),
  blocks: [
    block({ label: "추진배경", items: ["참여 기관 345곳"], figures: [{ kind: "photo", desc: "가짜 현장 사진", pos: "right", size: "M" }] }),
    block({ kind: "cards", variant: "plus", cells: [{ head: "현황", tag: "", bullets: ["상담 1,234건"], note: "" }, { head: "문제", tag: "", bullets: ["대기 3주"], note: "가짜 메모" }] }),
    block({ kind: "compare", variant: "table", rows: [{ key: "처리 기간", before: ["3주"], after: ["1주"] }] }),
    block({ kind: "table", items: ["구분", "실적"], cells: [{ head: "상담", tag: "", bullets: ["120건"], note: "" }] }),
    block({ kind: "chart", series: [{ label: "’25", value: "100건" }, { label: "’26", value: "120건" }], badge: "20%" }),
    block({ kind: "steps", variant: "row", label: "추진내용", layout: "full", cells: [1, 2, 3].map((i) => ({ head: `${i}단계`, tag: "", bullets: [`가짜 활동 ${i}`], note: "" })) }),
  ],
  results: ["만족도 87.5% 달성"],
  resultChart: { title: "만족도", series: [{ label: "’25", value: "80점" }, { label: "’26", value: "87.5점" }], badge: "" },
  sources: [{ kind: "card", id: "m1", name: "가짜 결과보고.hwpx" }],
  ground: { weak: ["만족도 87.5% 달성"], checked: 3 },
  fit: { total: 200, budget: 255 },
  humanEdits: [1],
});
const mgPart: MgPart = { key: "1.1.가", evalNo: 1, evalTitle: "가짜 평가내용", themeNo: 1, themeTitle: "가짜 대주제", mark: "가", title: "만족도 92점 달성", story: "", why: "" };
const richMg = (): ReportSectionSpec => {
  const s = rich();
  return { ...s, mg: { indicator: "가짜 지표", parts: [mgPart], at: (s.blocks ?? []).map(() => mgPart.key) } };
};

/** 화면이 저장된 초안에 부르는 함수들(과제별 미리보기·HTML 내려받기·보고서 검토 제출 판정·사업 조판·다시 세기) */
function screenCalls(s: ReportSectionSpec): void {
  recountUnknown(s, card, KNOWN);
  sectionHtml(s, ["1,234"], { weak: s.ground?.weak ?? [], repeats: true, blockMarks: true, resultMark: true, editMarks: true });
  sectionDocument(s, ["1,234"], { year: 2026, generatedAt: "", model: "" });
  sectionText(s, true);
  cardSubmitRow({ id: "a", uid: "u", taskNo: "3-나", title: "t", included: true, pages: 1, dataRev: 1, draft: { spec: s, sourceRev: 1, unknownNumbers: [] } });
  const items = [{ cardId: "a", uid: "u", taskNo: "3-나", title: "t", section: "가", subsection: null, sort: 1, pages: 1, included: true, spec: s, unknownNumbers: ["1,234"], sourceRev: null, dataRev: null }];
  const laid = layoutBusiness(items, s.mg ? { mg: { budget: 1 } } : {});
  for (const sheet of sheetsOf(laid.pages)) sheetHtml(sheet, laid);
}

test("가짜 초안(두 트랙)은 모양 검사를 지나고 화면 함수가 모두 돎 — 정상 초안을 막지 않음", () => {
  for (const s of [rich(), richMg(), draft]) {
    assert.equal(specIssue(s), null);
    screenCalls(s);
    assert.equal(readDraftSpec(s).spec, s, "검사를 지나면 같은 객체(출력이 바이트까지 같음)");
  }
  assert.deepEqual(readDraftSpec(null), { spec: null, issue: null }, "초안이 없으면 까닭도 없음");
});

test("깨진 초안(빈 행 객체·null·글이 아닌 칸·모르는 블록 종류): 던지지 않고 「없는 숫자 확인 불가」(막힘) — 저장값은 믿지 않는다는 표지와 함께", () => {
  const broken: Array<[string, (s: ReportSectionSpec & Record<string, unknown>) => void]> = [
    ["rows:[{}]", (s) => (s.rows = [{}] as never)],
    ["rows:[null]", (s) => (s.rows = [null] as never)],
    ["blocks:[null]", (s) => (s.blocks = [null] as never)],
    ["blocks:[{}]", (s) => (s.blocks = [{}] as never)],
    ["블록 글이 객체", (s) => (s.blocks = [block({ text: { a: 1 } as never })])],
    ["불릿이 숫자", (s) => (s.blocks = [block({ items: 5 as never })])],
    ["칸 불릿이 없음", (s) => (s.blocks = [block({ kind: "cards", cells: [{ head: "a", tag: "", note: "" } as never] })])],
    ["모르는 블록 종류", (s) => (s.blocks = [block({ kind: "없는종류" as never })])],
    ["모르는 그림 크기", (s) => (s.blocks = [block({ figures: [{ kind: "photo", desc: "a", pos: "right", size: "XL" as never }] })])],
    ["results 글", (s) => (s.results = "abc" as never)],
    ["sub null", (s) => (s.sub = null as never)],
    ["card 없음", (s) => delete (s as Partial<ReportSectionSpec>).card],
    ["mg 빈 객체", (s) => (s.mg = {} as never)],
    ["humanEdits 글", (s) => (s.humanEdits = "1" as never)],
  ];
  for (const [name, mut] of broken) {
    const s = structuredClone(rich()) as ReportSectionSpec & Record<string, unknown>;
    mut(s);
    const issue = specIssue(s);
    assert.ok(issue, `${name}: 모양 검사에 걸려야 함`);
    assert.deepEqual(readDraftSpec(s), { spec: null, issue }, `${name}: 화면은 그리지 않고 까닭`);
    const r = recountDraft(s, card, KNOWN, stored);
    assert.equal(r.failed, issue, name);
    assert.match(r.warnings[0], FAIL, name);
    assert.equal(warningLevel(r.warnings[0]), "block", `${name}: 막힘 등급`);
    assert.deepEqual(r.warnings.slice(1), stored.warnings, `${name}: 저장된 경고는 뒤에 그대로`);
    assert.deepEqual(r.unknown, ["9,999"], `${name}: 칠할 숫자는 저장값뿐(다시 세지 않음)`);
  }
});

test("글 칸이 저장 경로 한도를 크게 넘으면 다시 세지 않음(공백만 긴 불릿에서도 바로 「확인 불가」) — 전체 글자·값 개수·깊이도", () => {
  const t0 = performance.now();
  const long = recountDraft(spec([`가${" ".repeat(50_000)}끝`]), card, KNOWN, stored);
  assert.ok(performance.now() - t0 < 500, "다시 세기의 2제곱 정규식을 부르지 않음");
  assert.match(long.failed ?? "", new RegExp(`한도 ${SPEC_STRING_MAX.toLocaleString("ko-KR")}자`));
  assert.equal(specIssue(spec(["가".repeat(SPEC_STRING_MAX)])), null, "한도까지는 통과(저장 경로 최대 600자의 3배 넘게 여유)");
  assert.match(specIssue(spec(Array.from({ length: 200 }, () => "가".repeat(1_900)))) ?? "", /모두 300,000자/);
  assert.match(specIssue(spec(Array.from({ length: 60_000 }, () => ""))) ?? "", /값이 50,000개/);
  let deep: Record<string, unknown> = {};
  for (let i = 0; i < 100_000; i++) deep = { a: deep };
  assert.match(specIssue({ ...draft, extra: deep }) ?? "", /값이/, "깊게 겹친 값도 스택을 넘지 않고 걸림");
});

test("다시 세기가 던지면(검사를 지난 초안이라도) 저장값만 칠하고 「확인 불가」 — 오류는 로그용으로만", () => {
  const throwing = new Proxy({}, { get: () => { throw new Error("가짜 오류"); } });
  const r = recountDraft(draft, throwing, KNOWN, stored);
  assert.equal(r.failed, "다시 세다가 오류가 남");
  assert.ok(r.error instanceof Error);
  assert.match(r.warnings[0], FAIL);
  assert.ok(!r.warnings[0].includes("가짜 오류"), "오류 글은 화면 경고에 넣지 않음");
  assert.deepEqual(r.unknown, ["9,999"]);
});

test("무작위로 깨뜨린 초안: 모양 검사를 지난 것은 화면 함수가 던지지 않음(두 트랙, 씨앗 고정)", () => {
  const WEIRD: unknown[] = [null, {}, [], 5, "x", true, [null], [{}], [5], { a: 1 }, -1];
  let seed = 20261117;
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const paths = (v: unknown, at: Array<string | number> = [], out: Array<Array<string | number>> = []) => {
    out.push(at);
    if (Array.isArray(v)) v.forEach((x, i) => paths(x, [...at, i], out));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) paths(x, [...at, k], out);
    return out;
  };
  let passed = 0;
  for (const base of [rich(), richMg()]) {
    const all = paths(base).filter((p) => p.length > 0);
    for (let i = 0; i < 1_200; i++) {
      const s = structuredClone(base) as unknown as Record<string | number, unknown>;
      const p = all[rnd(all.length)];
      let parent = s;
      for (const k of p.slice(0, -1)) parent = parent[k] as Record<string | number, unknown>;
      if (rnd(8) === 0 && !Array.isArray(parent)) delete parent[p[p.length - 1]];
      else parent[p[p.length - 1]] = structuredClone(WEIRD[rnd(WEIRD.length)]);
      const shown = readDraftSpec(s).spec;
      if (!shown) continue;
      passed++;
      assert.doesNotThrow(() => screenCalls(shown), `${p.join(".")} 를 바꾼 초안`);
    }
  }
  assert.ok(passed > 100, `검사를 지난 변형이 충분함(${passed})`);
});

test("저장값 상한: 글·수 조각만, 40자 넘는 조각은 빼고 300개까지(칠하기가 이 목록으로 찾기를 만듦)", () => {
  const many = Array.from({ length: 1_000 }, (_, i) => String(i + 10));
  assert.equal(unknownView(many, []).unknown.length, 300);
  assert.deepEqual(unknownView([null, { a: 1 }, 12, "1".repeat(41), "87.5%"], []).unknown, ["12", "87.5%"]);
});

test("recountFailNote: 다시 세지 못한 과제 한 줄(막힘) — 없으면 null", () => {
  assert.equal(recountFailNote([]), null);
  const note = recountFailNote([{ taskNo: "3-나" }, { taskNo: "5-가" }]) ?? "";
  assert.match(note, /^없는 숫자 확인 불가: 과제 2건\(3-나·5-가\)/);
  assert.equal(warningLevel(note), "block");
});
