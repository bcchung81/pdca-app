// 경평 초안 → 개조식 마크다운(lib/reports/section-md.ts) 테스트 — 2026-10-16 한글(HWPX) 내려받기 최소안.
// 지키는 것: 블록 19종이 글을 잃지 않고 정해진 줄 모양으로 펼쳐짐 · 라벨 묶음 · 칩·마커 · 【확인】 보존 · 그림 자리표시 · v1·v2 행 ·
// 경영관리 평가내용 → 대주제 → 절 머리 순서 · 모르는 종류는 warnings · 대표 spec 둘이 draftToKcaHwpx로 실제 변환돼 validateHwpx 통과 + 다시 읽힘.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parse, validateHwpx } from "kordoc";
import { draftToKcaHwpx } from "../hwpx/generate.ts";
import { BLOCK_KINDS, type Block, type BlockCell } from "./blocks.ts";
import { sectionMarkdown } from "./section-md.ts";
import type { ReportSectionSpec } from "./section.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const block = (b: Partial<Block> & Pick<Block, "kind">): Block => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...b });
const cell = (head: string, bullets: string[] = [], extra: Partial<BlockCell> = {}): BlockCell => ({ head, tag: "", bullets, note: "", ...extra });

function makeSpec(blocks: Block[], extra: Partial<ReportSectionSpec> = {}): ReportSectionSpec {
  return {
    version: 3,
    card: { id: "주요사업1/1-가", taskNo: "1-가", title: "과제명" },
    business: { no: 1, name: "방송미디어 진흥" },
    task: { no: "1-1", title: "실행과제 제목", bp: false },
    sub: { mark: "가", title: "소항목 제목", markers: [] },
    rows: [],
    results: [],
    caption: "",
    blocks,
    story: "단계 전개형",
    module: 1,
    ...extra,
  };
}
const md = (blocks: Block[], extra: Partial<ReportSectionSpec> = {}) => sectionMarkdown(makeSpec(blocks, extra));
const lines = (blocks: Block[], extra: Partial<ReportSectionSpec> = {}) => md(blocks, extra).md.split("\n");

test("머리: 대상사업·실행과제·소항목 표(칩은 [값] 제목 앞, 마커는 제목 뒤 글자, BP는 실행과제 뒤)", () => {
  const { md: m } = md([block({ kind: "bullets", items: ["문장"] })], { task: { no: "1-1", title: "실행과제 제목", bp: true }, sub: { mark: "나", title: "소항목 제목", markers: ["지적개선", "신규"], chip: "수신환경" } });
  const l = m.split("\n");
  assert.equal(l[0], "1-가 과제명 초안");
  assert.ok(l.includes("| 대상사업1 | 방송미디어 진흥 |"));
  assert.ok(l.includes("| 실행과제 1-1 | 실행과제 제목 [BP] |"));
  assert.ok(l.includes("| 나. | [수신환경] 소항목 제목 [지적개선] [신규] |"));
});

test("라벨 묶음: 이어진 같은 라벨은 □ 한 줄 아래, 라벨 없는 블록은 □ 없이 그대로", () => {
  const l = lines([
    block({ kind: "bullets", label: "추진배경", items: ["가"] }),
    block({ kind: "bullets", label: "추진배경", items: ["나"] }),
    block({ kind: "bullets", label: "추진내용", items: ["다"] }),
    block({ kind: "bullets", items: ["라"] }),
  ]);
  assert.equal(l.filter((x) => x === "□ 추진배경").length, 1);
  assert.deepEqual(l.filter((x) => /^(□|ㅇ)/.test(x)), ["□ 추진배경", "ㅇ 가", "ㅇ 나", "□ 추진내용", "ㅇ 다", "ㅇ 라"]);
});

test("블록 19종: 모두 글을 잃지 않고 펼침(경고 없음)", () => {
  const four = [cell("가", ["가1"], { tag: "T1", note: "가노트" }), cell("나", ["나1"]), cell("다", ["다1"]), cell("라", ["라1"])];
  const cases: Record<string, Block> = {
    bullets: block({ kind: "bullets", title: "불릿 제목", items: ["첫째 불릿", "둘째 불릿"] }),
    subhead: block({ kind: "subhead", text: "소제목 글" }),
    band: block({ kind: "band", label: "핵심", text: "띠 메시지" }),
    banner: block({ kind: "banner", text: "배너 메시지" }),
    cards: block({ kind: "cards", variant: "plain", title: "카드 제목", cells: four.slice(0, 3) }),
    compare: block({ kind: "compare", variant: "table", title: "비교 제목", rows: [{ key: "속도", before: ["느림"], after: ["빠름", "안정"] }] }),
    steps: block({ kind: "steps", variant: "row", cells: [cell("Step 1 수요조사", ["조사"]), cell("시범", ["운영"])] }),
    timeline: block({ kind: "timeline", variant: "chevron", cells: [cell("’24년", ["착수"]), cell("’25년", ["확산"], { note: "당해" })] }),
    hub: block({ kind: "hub", cells: [cell("KCA", ["총괄"]), cell("기관 A", ["자료 제공"]), cell("기관 B", ["현장 지원"])] }),
    voices: block({ kind: "voices", cells: [cell("현장 검사관", ["위험해요"]), cell("", ["빨라졌어요"])] }),
    define: block({ kind: "define", title: "용어 정의", text: "정의 본문", items: ["입력", "처리"] }),
    quotes: block({ kind: "quotes", cells: [cell("정부 지시", ["원문 인용"], { tag: "정부", note: "(’26.3.)" })] }),
    case: block({ kind: "case", label: "우수사례", title: "대통령상 수상", items: ["수상명 | 2025년 대상", "일시 : 6월"] }),
    chart: block({ kind: "chart", title: "막대 제목", series: [{ label: "’25년", value: "10건" }, { label: "’26년", value: "20건" }], badge: "2배 증가" }),
    stats: block({ kind: "stats", cells: [cell("24종", ["유형 수"], { tag: "구분A", note: "기준일 9월" }), cell("97%", ["신뢰도"])] }),
    qa: block({ kind: "qa", cells: [cell("왜 필요한가?", ["위험 때문", "추가 설명"])] }),
    table: block({ kind: "table", variant: "", title: "수치 표", items: ["구분", "’25년", "’26년"], cells: [cell("건수", ["10", "20"]), cell("비용", ["3억", "4억"])] }),
    strategy: block({ kind: "strategy", text: "목표 띠 글", items: ["목표", "전략", "과제", "지표"], cells: [cell("전략A", ["과제1"], { tag: "S1", note: "지표1" }), cell("전략B", ["과제2"], { note: "지표2" })] }),
    pdca: block({ kind: "pdca", text: "환류 글", cells: four }),
  };
  assert.deepEqual(Object.keys(cases).sort(), [...BLOCK_KINDS].sort(), "19종 모두 시험함");
  for (const [kind, b] of Object.entries(cases)) {
    const r = md([b]);
    assert.deepEqual(r.warnings, [], kind);
    // 블록의 모든 글이 마크다운에 남음(표기 | → \|·위첨자 제외한 평문 비교)
    const flat = r.md.replace(/\\\|/g, "|");
    for (const text of [b.title, b.text, ...b.items, ...b.cells.flatMap((c) => [c.head, c.tag, ...c.bullets, c.note.replace(/^\(|\)$/g, "")]), ...b.rows.flatMap((x) => [x.key, ...x.before, ...x.after]), ...b.series.flatMap((s) => [s.label, s.value]), b.badge]) {
      if (!text) continue;
      const core = kind === "steps" ? text.replace(/^Step\s?\d+\s*/, "") : text;
      assert.ok(flat.includes(core), `${kind}: 「${core}」가 빠짐\n${r.md}`);
    }
  }
  const m = (k: string) => md([cases[k]]).md;
  assert.ok(m("bullets").includes("ㅇ **불릿 제목**") && m("bullets").includes("ㅇ 첫째 불릿"));
  assert.ok(m("subhead").includes("ㅇ **소제목 글**"));
  assert.ok(m("band").includes("ㅇ (핵심) ==▶ 띠 메시지 ◀=="));
  assert.ok(m("banner").includes("ㅇ ==배너 메시지=="));
  assert.ok(m("cards").includes("ㅇ **[T1] 가**") && m("cards").includes("- 가1") && m("cards").includes("※ 가노트"));
  assert.ok(m("compare").includes("| 구분 | 기존 | 개선 |") && m("compare").includes("| 속도 | 느림 | 빠름 / 안정 |"));
  assert.ok(m("steps").includes("ㅇ **1단계 수요조사**") && m("steps").includes("ㅇ **2단계 시범**"));
  assert.ok(m("timeline").includes("ㅇ **’25년**") && m("timeline").includes("※ 당해"));
  assert.ok(m("hub").includes("ㅇ **[중심] KCA**") && m("hub").includes("ㅇ **기관 A**"));
  assert.ok(m("voices").includes("```text") && m("voices").includes("현장 검사관: “위험해요”") && m("voices").includes("현장: “빨라졌어요”"));
  assert.ok(m("define").includes("ㅇ **용어 정의**") && m("define").includes("- 입력 → 처리"));
  assert.ok(m("quotes").includes("[정부] 정부 지시") && m("quotes").includes("“원문 인용” (’26.3.)"));
  assert.ok(m("case").includes("ㅇ **[우수사례] 대통령상 수상**") && m("case").includes("- 수상명 | 2025년 대상"));
  assert.ok(m("chart").includes("[ 막대 제목 ]") && m("chart").includes("| ’26년 | 20건 |") && m("chart").includes("※ 2배 증가"));
  assert.ok(m("stats").includes("| 구분 | 수치 | 설명 |") && m("stats").includes("| 구분A | 24종 | 유형 수 / 기준일 9월 |"));
  assert.ok(m("qa").includes("ㅇ **Q. 왜 필요한가?**") && m("qa").includes("- A. 위험 때문") && m("qa").includes("- 추가 설명"));
  assert.ok(m("table").includes("| 구분 | ’25년 | ’26년 |") && m("table").includes("| 비용 | 3억 | 4억 |"));
  assert.ok(m("strategy").includes("ㅇ **목표** 목표 띠 글") && m("strategy").includes("| 전략 | [S1] 전략A | 전략B |") && m("strategy").includes("| 과제 | 과제1 | 과제2 |") && m("strategy").includes("| 지표 | 지표1 | 지표2 |"));
  assert.ok(m("pdca").includes("ㅇ **[T1] 가**") && m("pdca").includes("ㅇ **[A] 라**") && m("pdca").includes("ㅇ ↺ 환류 글"));
});

test("compare 패널(As-Is/To-Be·diag)은 2열 표, 번호·꼬리표는 렌더러와 같게", () => {
  const rows = [{ key: "수신", before: ["① 수작업"], after: ["① 자동판독"] }, { key: "", before: ["측정 느림"], after: ["측정 빠름"] }];
  const p = md([block({ kind: "compare", variant: "panels", items: ["As-Is: 현재", "To-Be: 개선"], rows })]).md;
  assert.ok(p.includes("| As-Is — 현재 | To-Be — 개선 |"));
  assert.ok(p.includes("| ➀ [수신] 수작업 | ➊ [수신] 자동판독 |") && p.includes("| ➁ 측정 느림 | ➋ 측정 빠름 |"));
  const d = md([block({ kind: "compare", variant: "diag", items: ["현황·문제: 사각", "추진방향: 보완"], rows })]).md;
  assert.ok(d.includes("| 현황·문제 — 사각 | 추진방향 — 보완 |"));
});

test("표 모양 4종: 막대·쉐브론은 값 표, result는 추진실적 열(아래 행 〃), ladder는 큰 라벨 〃", () => {
  const grid = (variant: string) => md([block({ kind: "table", variant, items: ["구분", "’25", "’26"], cells: [cell("건수", ["10건", "20건"])] })]).md;
  assert.ok(grid("bars").includes("| 건수 | 10건 | 20건 |") && grid("chevron").includes("| 구분 | ’25 | ’26 |"));
  const res = md([block({ kind: "table", variant: "result", cells: [cell("가", ["내용1"]), cell("나", ["내용2"])], series: [{ label: "검사 건수", value: "1,240건" }], text: "목표 초과" })]).md;
  assert.ok(res.includes("| 구분 | 추진내용 | 추진실적 |") && res.includes("| 가 | 내용1 | 1,240건 검사 건수 / 목표 초과 |") && res.includes("| 나 | 내용2 | 〃 |"));
  const lad = md([block({ kind: "table", variant: "ladder", cells: [cell("큰 라벨", ["가"], { tag: "하위1" }), cell("", ["나"], { tag: "하위2" }), cell("다른", ["다"], { tag: "하위3" })] })]).md;
  assert.ok(lad.includes("| 큰 라벨 | 하위1 | 가 |") && lad.includes("| 〃 | 하위2 | 나 |") && lad.includes("| 다른 | 하위3 | 다 |"));
});

test("그림 자리표시·【확인】·위첨자·세로줄 이스케이프", () => {
  const b = block({ kind: "bullets", items: ["실적 【확인: ’26년 검사 건수】 예정", "무선국 ^{’25년}100국 → ^{’26년}200국", "굵게 **핵심** 글"], figures: [{ kind: "photo", desc: "설악산 현장 측정 차량", pos: "right", size: "M" }, { kind: "logo", desc: "KCA･KOMSA 로고", pos: "right", size: "M" }] });
  const m = md([b]).md;
  assert.ok(m.includes("ㅇ 실적 【확인: ’26년 검사 건수】 예정"));
  assert.ok(m.includes("ㅇ 무선국 ’25년 100국 → ’26년 200국"));
  assert.ok(m.includes("ㅇ 굵게 **핵심** 글"));
  assert.ok(m.includes("ㅇ [그림 자리 — 사진: 설악산 현장 측정 차량]") && m.includes("ㅇ [그림 자리 — 로고: KCA･KOMSA 로고]"));
  assert.ok(md([block({ kind: "table", items: ["a", "b", "c"], cells: [cell("x|y", ["1", "2"]), cell("z", ["3", "4"])] })]).md.includes("| x\\|y | 1 | 2 |"));
});

test("추진성과: 3칸 표 · 불릿 · 막대 수치 표 · 강조 띠", () => {
  const m = md([block({ kind: "bullets", items: ["본문"] })], {
    results: ["검사 시간 50% 절감", "【확인: ’26년 실적】"],
    resultCards: [{ tag: "효율", headline: "소요시간", figure: "50%" }],
    resultChart: { title: "추이", series: [{ label: "’25년", value: "10" }, { label: "’26년", value: "20" }], badge: "" },
    resultBand: "50% 단축!",
  }).md;
  const l = m.split("\n");
  assert.ok(l.includes("□ 추진성과") && l.includes("| 구분 | 성과 | 수치 |") && l.includes("| 효율 | 소요시간 | 50% |"));
  assert.ok(l.includes("ㅇ 검사 시간 50% 절감") && l.includes("ㅇ 【확인: ’26년 실적】") && l.includes("| ’26년 | 20 |") && l.includes("ㅇ ==50% 단축!=="));
  assert.ok(l.indexOf("□ 추진성과") > l.indexOf("ㅇ 본문"));
});

test("v1·v2 행: 행 라벨 □ + 칸 글 ㅇ, 도식·막대·인용·메시지 띠(추진배경 다음)·우수사례", () => {
  const none = { type: "none" as const, title: "", rows: [], steps: [], actions: [] };
  const spec = makeSpec([], {
    version: 2,
    blocks: undefined,
    context: [{ chip: "정부", title: "정부 방침", quote: "인용 원문", cite: "(’26.1.)" }],
    banner: "메시지 띠 글",
    rows: [
      { label: "추진배경", bullets: ["배경 불릿"], diagram: none },
      { label: "추진내용", bullets: ["내용 불릿"], diagram: { type: "process_flow", title: "", rows: [], steps: [{ title: "수집", bullets: ["자료 수집"], note: "" }, { title: "분석", bullets: ["분석"], note: "" }], actions: [] }, chart: { title: "추이", series: [{ label: "’25", value: "1" }, { label: "’26", value: "2" }], badge: "" } },
      { label: "추진실적", bullets: ["실적"], diagram: { type: "action_table", title: "", rows: [], steps: [], actions: [{ effort: "노력A", result: "성과A" }] } },
    ],
    cases: [{ tab: "우수사례", title: "수상", items: ["대상"] }],
  });
  const { md: m, warnings } = sectionMarkdown(spec);
  assert.deepEqual(warnings, []);
  const l = m.split("\n");
  const at = (x: string) => l.findIndex((y) => y.includes(x));
  for (const x of ["인용 원문", "□ 추진배경", "배경 불릿", "메시지 띠 글", "□ 추진내용", "ㅇ **1단계 수집**", "| ’26 | 2 |", "□ 추진실적", "| 노력A | 성과A |", "[우수사례] 수상", "- 대상"]) assert.ok(at(x) >= 0, x);
  assert.ok(at("인용 원문") < at("□ 추진배경") && at("배경 불릿") < at("메시지 띠 글") && at("메시지 띠 글") < at("□ 추진내용") && at("□ 추진실적") < at("[우수사례]"));
});

const mgParts = [
  { key: "2.1.가", evalNo: 2, evalTitle: "경영 혁신 추진", themeNo: 1, themeTitle: "전략 수립", mark: "가", title: "전략 체계", story: "" as const, why: "", chip: "체계" },
  { key: "2.1.나", evalNo: 2, evalTitle: "경영 혁신 추진", themeNo: 1, themeTitle: "전략 수립", mark: "나", title: "환류 체계", story: "" as const, why: "" },
  { key: "2.2.가", evalNo: 2, evalTitle: "경영 혁신 추진", themeNo: 2, themeTitle: "성과 관리", mark: "가", title: "성과 점검", story: "" as const, why: "" },
  { key: "3.1.0", evalNo: 3, evalTitle: "셋째 평가내용", themeNo: 1, themeTitle: "셋째 대주제", mark: "", title: "", story: "" as const, why: "" },
];
const mgBlocks = [
  block({ kind: "bullets", label: "추진내용", items: ["가 절 글"] }),
  block({ kind: "bullets", label: "추진성과", items: ["나 절 글"] }),
  block({ kind: "bullets", items: ["성과 점검 글"] }),
  block({ kind: "bullets", items: ["셋째 글"] }),
];
const mgSpec = (extra: Partial<ReportSectionSpec> = {}) =>
  makeSpec(mgBlocks, { card: { id: "경영관리1/1-1", taskNo: "1-1", title: "전략기획 과제" }, sub: { mark: "가", title: "지표", markers: ["지적개선"] }, mg: { indicator: "전략기획", parts: mgParts, at: ["2.1.가", "2.1.나", "2.2.가", "3.1.0"] }, ...extra });

test("경영관리 spec.mg: 평가내용 → 대주제 → 절 머리가 해당 블록 앞에, 칩은 절 제목 앞, 첫 대주제에 마커", () => {
  const { md: m, warnings } = sectionMarkdown(mgSpec());
  assert.deepEqual(warnings, []);
  const l = m.split("\n");
  const at = (x: string) => l.findIndex((y) => y === x);
  const order = ["| 평가내용2 | 경영 혁신 추진 |", "| 대주제 1 | 전략 수립 [지적개선] |", "| 가. | [체계] 전략 체계 |", "ㅇ 가 절 글", "| 나. | 환류 체계 |", "ㅇ 나 절 글", "| 대주제 2 | 성과 관리 |", "| 가. | 성과 점검 |", "ㅇ 성과 점검 글", "| 평가내용3 | 셋째 평가내용 |", "| 대주제 1 | 셋째 대주제 |", "ㅇ 셋째 글"];
  const idx = order.map(at);
  assert.ok(idx.every((i) => i >= 0), JSON.stringify(order.filter((_, i) => idx[i] < 0)));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), "머리 순서");
  assert.ok(!m.includes("대상사업"), "경영관리는 대상사업 머리 없음");
});

test("경영관리 지적개선 마커는 spec.mg.finding 절의 대주제에, 어느 절에도 없는 블록은 끝에 모으고 경고", () => {
  const spec = mgSpec();
  spec.mg!.finding = ["2.2.가"];
  const m = sectionMarkdown(spec).md;
  assert.ok(m.includes("| 대주제 2 | 성과 관리 [지적개선] |") && m.includes("| 대주제 1 | 전략 수립 |"));
  const orphan = mgSpec();
  orphan.mg!.at = ["2.1.가", "9.9.가", "2.2.가", "3.1.0"];
  const r = sectionMarkdown(orphan);
  assert.equal(r.warnings.length, 1);
  assert.ok(r.md.includes("ㅇ 나 절 글"));
});

test("모르는 블록 종류: 글을 ㅇ 줄로 옮기고 warnings", () => {
  const r = md([{ ...block({ kind: "bullets" }), kind: "mystery" as any, title: "미지 제목", text: "미지 글", items: ["미지 항목"], cells: [cell("미지 칸", ["칸 글"])] }]);
  assert.equal(r.warnings.length, 1);
  assert.ok(r.warnings[0].includes("mystery"));
  for (const x of ["ㅇ 미지 제목", "ㅇ 미지 글", "ㅇ 미지 항목", "ㅇ 미지 칸", "ㅇ 칸 글"]) assert.ok(r.md.includes(x), x);
});

/** 대표 spec 둘을 실제 변환 → 검증 → 다시 읽기 */
const bizSpec = makeSpec(
  [
    block({ kind: "bullets", label: "추진배경", items: ["무선국 검사관의 고소 작업 위험(연 3만 회)"], figures: [{ kind: "photo", desc: "철탑 검사 현장", pos: "right", size: "M" }] }),
    block({ kind: "compare", label: "추진방향", variant: "panels", items: ["As-Is: 수작업", "To-Be: 자동판독"], rows: [{ key: "", before: ["육안 판독"], after: ["AI 판독"] }] }),
    block({ kind: "steps", label: "추진내용", variant: "row", cells: [cell("수요조사", ["현장 의견 120건"]), cell("시범운영", ["3개 지역"])] }),
    block({ kind: "table", label: "추진내용", items: ["구분", "’25년", "’26년"], cells: [cell("검사 건수", ["1,010건", "【확인: ’26년 검사 건수】"])] }),
    block({ kind: "voices", label: "추진내용", cells: [cell("검사관", ["빨라졌어요"])] }),
  ],
  { results: ["검사 시간 50% 절감"], sub: { mark: "가", title: "AI 판독 확산", markers: ["지적개선"], chip: "수신환경" } },
);

for (const [name, spec, texts] of [
  ["주요사업", bizSpec, ["AI 판독 확산", "추진배경", "추진방향", "수요조사", "검사 건수", "1,010건", "AI 판독", "빨라졌어요", "추진성과", "검사 시간 50% 절감"]],
  ["경영관리", mgSpec(), ["평가내용2", "경영 혁신 추진", "전략 수립", "전략 체계", "환류 체계", "성과 점검", "추진내용", "추진성과", "셋째 글"]],
] as const) {
  test(`${name} 대표 spec → draftToKcaHwpx 변환 → validateHwpx 통과·다시 읽어 주요 글이 들어 있음`, async () => {
    const { md: m, warnings } = sectionMarkdown(spec);
    assert.deepEqual(warnings, []);
    const { bytes, warnings: hw } = await draftToKcaHwpx(m);
    // kordoc 공문서 변환의 유일한 경고는 「요약박스 없음」(보고 목적 인용문 — 이 원고는 만들지 않음)
    assert.ok(hw.every((w) => w.includes("요약박스")), JSON.stringify(hw));
    const v: any = await (validateHwpx as any)(Buffer.from(bytes));
    assert.equal(v.ok, true, JSON.stringify(v.issues));
    const back: any = await parse(Buffer.from(bytes));
    assert.ok(back.success);
    for (const x of texts) assert.ok(back.markdown.includes(x), `「${x}」가 한글 파일에 없음`);
  });
}
