// 경평 초안 사업 단위 조판(lib/reports/business-layout.ts) 순수 로직 시험: 머리 모드 판면 예산 반영(specHeight·layoutBusiness),
// 쪽 나눔(대상사업·실행과제 경계·이어 쓰기·넘침), 사업 전체 검사(같은 문장·같은 짜임·초안 없음·다시 만들기 권장), sheetsOf 묶음.

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PAGE_MM } from "./fit.ts";
import { type BusinessItem, HEAD_PART_MM, headModes, layoutBusiness, orderItems, sheetsOf, specHeight } from "./business-layout.ts";
import type { Block } from "./blocks.ts";
import { bizMapHtml, sheetHtml } from "./business-html.ts";
import { BIZ_MAP_MM, PAGE_TOLERANCE_MM, SPILL_FILL_MAX, SAME_TEXT_MAX, bizMapLine, bizMapMm, bizMapRows, bizMapWidth, businessChecks, headCut } from "./business-layout.ts";
import { LINE_MM, fitReport, frameHeight, lineCount } from "./fit.ts";
import type { ReportSectionSpec } from "./section.ts";

const H = PAGE_MM.height;

const item = (over: Partial<BusinessItem> = {}): BusinessItem => ({
  cardId: "c1",
  uid: "u1",
  taskNo: "1-가",
  title: "제목",
  section: "가",
  subsection: "1. 실행",
  sort: 0,
  pages: 1,
  included: true,
  spec: null,
  sourceRev: null,
  dataRev: null,
  ...over,
});

const spec = (over: Record<string, unknown> = {}): any => ({ version: 3, sub: { title: "제목" }, blocks: [], results: [], caption: "", ...over });

// ---------------------------------------------------------------------------
// specHeight

test("specHeight: 초안이 없으면 null", () => {
  assert.equal(specHeight(null), null);
});

test("specHeight: spec.fit.total이 있으면(양수) 그 값과 fit 출처", () => {
  assert.deepEqual(specHeight(spec({ fit: { total: 220, budget: 255 } })), { mm: 220, source: "fit" });
});

test("specHeight: fit이 없어도 blocks가 있는 v3 초안은 fitReport로 다시 셈(estimate)", () => {
  const s = spec({ blocks: [{ kind: "bullets", label: "A", title: "", variant: "", text: "", items: ["가나다"], cells: [], rows: [], series: [], badge: "" }], module: 1 });
  const h = specHeight(s);
  assert.equal(h?.source, "estimate");
  assert.ok((h?.mm ?? 0) > 0);
});

test("specHeight: fit도 없고 blocks도 없으면(v1·v2 옛 초안) null(assigned로 셈함은 layoutBusiness의 몫)", () => {
  assert.equal(specHeight(spec({ version: 1, blocks: undefined })), null);
});

// ---------------------------------------------------------------------------
// headModes

test("headModes: 첫 소항목은 all, 대상사업이 바뀌면 all, 같은 대상사업·다른 실행과제는 task, 둘 다 같으면 sub", () => {
  const items = [
    { section: "가", subsection: "1. 실행" },
    { section: "가", subsection: "1. 실행" }, // 같음 → sub
    { section: "가", subsection: "2. 실행" }, // 실행과제만 다름 → task
    { section: "나", subsection: "1. 실행" }, // 대상사업이 다름 → all
  ];
  assert.deepEqual(headModes(items), ["all", "sub", "task", "all"]);
});

test("headModes: subsection이 둘 다 null이어도(대상사업 미지정 등) 같으면 sub", () => {
  assert.deepEqual(headModes([{ section: "가", subsection: null }, { section: "가", subsection: null }]), ["all", "sub"]);
});

// ---------------------------------------------------------------------------
// orderItems

test("orderItems: included=false는 빠지고, sort → 과제번호 순", () => {
  const items = [item({ cardId: "b", sort: 0, taskNo: "2-가" }), item({ cardId: "a", sort: 0, taskNo: "1-가" }), item({ cardId: "x", sort: 0, taskNo: "3-가", included: false })];
  assert.deepEqual(orderItems(items).map((it) => it.cardId), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// layoutBusiness — 머리 모드 판면 예산(사업 단위 조판, 2026-09-27)

test("layoutBusiness: 조판 머리 모드와 초안의 spec.head가 같으면(sub=sub) 높이가 spec.fit.total 그대로 — 더 빼지 않음", () => {
  const first = item({ cardId: "a", sort: 0, taskNo: "1-가", spec: spec({ fit: { total: 200, budget: 255 }, head: "all" }) });
  const second = item({ cardId: "b", sort: 1, taskNo: "1-나", spec: spec({ fit: { total: 200, budget: 255 }, head: "sub" }) });
  const layout = layoutBusiness([first, second]);
  // 같은 대상사업·같은 실행과제라 둘째 소항목의 조판 머리 모드는 sub
  assert.equal(layout.sections[1].head, "sub");
  assert.equal(layout.sections[1].height, 200, "spec.head도 sub라 머리를 더 빼지 않음");
});

test("layoutBusiness: spec.head가 없는(예전) 초안은 조판 머리 모드만큼(sub면 headCut 전부) 뺌", () => {
  const first = item({ cardId: "a", sort: 0, taskNo: "1-가", spec: spec({ fit: { total: 200, budget: 255 } }) });
  const second = item({ cardId: "b", sort: 1, taskNo: "1-나", spec: spec({ fit: { total: 200, budget: 255 } }) }); // head 없음 = all로 봄
  const layout = layoutBusiness([first, second]);
  assert.equal(layout.sections[1].head, "sub");
  const expected = Math.round((200 - (HEAD_PART_MM.biz + HEAD_PART_MM.task)) * 10) / 10;
  assert.equal(layout.sections[1].height, expected, `200 − ${HEAD_PART_MM.biz + HEAD_PART_MM.task} = ${expected}`);
});

test("layoutBusiness: 초안이 없으면(assigned) 배정 쪽수 × 255mm를 높이로 쓰고 fit은 null", () => {
  const layout = layoutBusiness([item({ pages: 1, spec: null })]);
  assert.equal(layout.sections[0].source, "assigned");
  assert.equal(layout.sections[0].height, H);
  assert.equal(layout.sections[0].fit, null);
});

test("layoutBusiness: 대상사업·실행과제가 바뀌면 새 쪽, 같은 실행과제 소항목은 한 쪽에 이어 씀", () => {
  const items = [
    item({ cardId: "a", sort: 0, taskNo: "1-가", section: "가", subsection: "1. 실행", pages: 0.5, spec: spec({ fit: { total: 100, budget: 127.5 }, head: "all" }) }),
    item({ cardId: "b", sort: 1, taskNo: "1-나", section: "가", subsection: "1. 실행", pages: 0.5, spec: spec({ fit: { total: 100, budget: 127.5 }, head: "sub" }) }),
    item({ cardId: "c", sort: 2, taskNo: "2-가", section: "가", subsection: "2. 실행", pages: 1, spec: spec({ fit: { total: H, budget: H }, head: "all" }) }),
  ];
  const layout = layoutBusiness(items);
  assert.equal(layout.pages.length, 2, "a·b는 한 쪽, c(실행과제가 바뀜)는 새 쪽");
  assert.deepEqual(layout.pages[0].pieces.map((p) => p.cardId), ["a", "b"]);
  assert.deepEqual(layout.pages[1].pieces.map((p) => p.cardId), ["c"]);
});

test("layoutBusiness: 한 쪽보다 큰 소항목은 새 쪽에서 시작해 여러 쪽에 걸침(more·cont)", () => {
  const big = item({ cardId: "a", sort: 0, pages: 1, spec: spec({ fit: { total: H * 1.6, budget: H }, head: "all" }) });
  const layout = layoutBusiness([big]);
  assert.ok(layout.pages.length >= 2, "한 쪽에 다 안 들어가 두 쪽 이상");
  assert.equal(layout.pages[0].pieces[0].more, true);
  assert.equal(layout.pages[1].pieces[0].cont, true);
});

test("layoutBusiness: summary.assigned은 넣은 과제 쪽수 합, excluded는 뺀 과제 수", () => {
  const items = [item({ cardId: "a", pages: 1 }), item({ cardId: "b", pages: 0.5 }), item({ cardId: "c", pages: 1, included: false })];
  const layout = layoutBusiness(items);
  assert.equal(layout.summary.assigned, 1.5);
  assert.equal(layout.summary.excluded, 1);
  assert.equal(layout.summary.total, 2);
});

// ---------------------------------------------------------------------------
// sheetsOf

test("sheetsOf: 다음 쪽으로 이어지는(more) 소항목이 있는 쪽끼리 한 장으로 묶고, 안 이어지면 낱장", () => {
  const pageA = { no: 1, pieces: [{ index: 0, cardId: "a", taskNo: "1-가", head: "all" as const, top: 0, height: 10, total: 10, offset: 0, cont: false, more: true, over: false }], used: 10, over: 0, fill: 0.04 };
  const pageB = { no: 2, pieces: [{ index: 0, cardId: "a", taskNo: "1-가", head: "all" as const, top: 0, height: 5, total: 10, offset: 10, cont: true, more: false, over: false }], used: 5, over: 0, fill: 0.02 };
  const pageC = { no: 3, pieces: [{ index: 1, cardId: "b", taskNo: "1-나", head: "sub" as const, top: 0, height: 5, total: 5, offset: 0, cont: false, more: false, over: false }], used: 5, over: 0, fill: 0.02 };
  const sheets = sheetsOf([pageA, pageB, pageC]);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].length, 2, "a쪽 A·B는 한 장");
  assert.equal(sheets[1].length, 1, "C는 낱장");
});

// ---------------------------------------------------------------------------
// 쪽 나눔 한도·배정 대비·예산·검사·sheetHtml(5단계 처음 시험을 다시 더함)

const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });

/** 블록 목록(v3) 초안 — total을 주면 초안에 남은 어림(fit.total, 머리 모드 all로 맞춘 값)으로 씀 */
function mkSpec(taskNo: string, x: Partial<ReportSectionSpec> & { total?: number } = {}): ReportSectionSpec {
  const { total, ...rest } = x;
  return {
    version: 3,
    card: { id: `주요사업1/${taskNo}`, taskNo, title: `과제 ${taskNo}` },
    business: { no: 1, name: "전파품질 향상" },
    task: { no: "1-1", title: "스마트 검사 체계", bp: false },
    sub: { mark: taskNo.split("-")[1] ?? "가", title: `소항목 ${taskNo}`, markers: [] },
    rows: [],
    results: [`${taskNo} 추진성과로 현장 검사 소요시간을 줄임`],
    caption: "",
    blocks: [blk("bullets", { label: "추진배경", items: [`${taskNo} 과제의 추진배경 설명 문장`] })],
    module: 0.5,
    ...(total ? { fit: { total, budget: 127.5 } } : {}),
    ...rest,
  };
}

let seq = 0;
function mkItem(taskNo: string, section: string, subsection: string | null, pages: number, s: ReportSectionSpec | null = null, x: Partial<BusinessItem> = {}): BusinessItem {
  seq += 1;
  return { cardId: `주요사업1/${taskNo}`, uid: `u-${taskNo}`, taskNo, title: `과제 ${taskNo}`, section, subsection, sort: seq, pages, included: true, spec: s, sourceRev: s ? 1 : null, dataRev: 1, ...x };
}
const round1 = (v: number) => Math.round(v * 10) / 10;

test("머리 높이: frameHeight의 머리 모드 차이 = headCut(대상사업 상자 + 실행과제 띠 = HEAD_PART_MM)", () => {
  const all = frameHeight("제목", [], 0, {}, []);
  assert.ok(Math.abs(all - frameHeight("제목", [], 0, {}, [], "task") - HEAD_PART_MM.biz) < 0.01);
  assert.ok(Math.abs(all - frameHeight("제목", [], 0, {}, [], "sub") - (HEAD_PART_MM.biz + HEAD_PART_MM.task)) < 0.01);
  assert.deepEqual([headCut("all"), headCut("task"), headCut("sub")], [0, HEAD_PART_MM.biz, HEAD_PART_MM.biz + HEAD_PART_MM.task]);
});

test("쪽 나눔(2025 관행): 같은 실행과제 0.5쪽 두 자리 = 한 쪽 꽉 참, 실행과제 끝 반 쪽은 빔 — 배정 합 2.5쪽이 조판 3쪽", () => {
  const l = layoutBusiness([mkItem("1-가", "A", "1. 가", 0.5), mkItem("1-나", "A", "1. 가", 0.5), mkItem("2-가", "A", "2. 나", 0.5), mkItem("3-가", "B", "1. 다", 1)]);
  assert.deepEqual(
    l.pages.map((p) => p.pieces.map((x) => `${x.taskNo}:${x.head}`)),
    [["1-가:all", "1-나:sub"], ["2-가:task"], ["3-가:all"]],
  );
  assert.equal(l.pages[0].used, H, "소항목 사이 띄움은 어림 높이 안에 있어 더하지 않음");
  assert.equal(l.pages[0].over, 0);
  assert.equal(l.pages[1].fill, 0.5);
  assert.equal(l.summary.assigned, 2.5);
  assert.equal(l.summary.laid, 3);
  assert.equal(l.summary.blank, round1(H * 0.5));
  assert.deepEqual(l.sections.map((s) => [s.startPage, s.endPage]), [[1, 1], [1, 1], [2, 2], [3, 3]]);
});

test("쪽 나눔 한도: 판면을 PAGE_TOLERANCE_MM(102%) 안에서 넘치면 그 쪽에 두고 넘침(mm), 한도를 넘으면 다음 쪽", () => {
  assert.ok(Math.abs(PAGE_TOLERANCE_MM - H * 0.02) < 0.01);
  // 130mm(머리 all) + (140 − 14.1mm, 머리 sub) = 255.9mm → 한 쪽, 0.9mm 넘침
  const t = layoutBusiness([mkItem("2-가", "A", "2", 0.5, mkSpec("2-가", { total: 130 })), mkItem("2-나", "A", "2", 0.5, mkSpec("2-나", { total: 140 }))]);
  assert.equal(t.pages.length, 1);
  assert.equal(t.sections[1].height, round1(140 - headCut("sub")));
  assert.equal(t.pages[0].over, round1(130 + 140 - headCut("sub") - H));
  assert.ok(t.pages[0].over > 0 && t.pages[0].over <= PAGE_TOLERANCE_MM);
  const far = layoutBusiness([mkItem("3-가", "A", "3", 0.5, mkSpec("3-가", { total: 140 })), mkItem("3-나", "A", "3", 0.5, mkSpec("3-나", { total: 140 + H * 0.05 }))]);
  assert.equal(far.pages.length, 2, "한도 밖 넘침은 다음 쪽");
  // 남은 자리에 안 들어가면 다음 쪽(초안 없음 = 배정 높이)
  assert.deepEqual(layoutBusiness([mkItem("4-가", "A", "4", 1), mkItem("4-나", "A", "4", 0.5)]).pages.map((p) => p.pieces.map((x) => x.taskNo)), [["4-가"], ["4-나"]]);
});

test("쪽 나눔: 한 쪽보다 큰 소항목은 새 쪽에서 시작하고 뒤 소항목은 마지막 쪽에 이어 씀 — sheetsOf가 걸친 쪽을 한 장으로", () => {
  const head = mkItem("0-가", "A", "0", 0.5);
  const big = mkItem("1-가", "A", "1", 1.5, mkSpec("1-가", { total: 1.5 * H, module: 1.5 }));
  const next = mkItem("1-나", "A", "1", 0.5);
  const l = layoutBusiness([next, big, head]);
  assert.deepEqual(
    l.pages.map((p) => p.pieces.map((x) => `${x.taskNo}${x.cont ? "(이어짐)" : ""}${x.more ? "→" : ""}`)),
    [["0-가"], ["1-가→"], ["1-가(이어짐)", "1-나"]],
  );
  const cont = l.pages[2].pieces[0];
  assert.equal(cont.offset, H);
  assert.equal(cont.height, round1(1.5 * H - headCut("task") - H), "실행과제 첫 소항목(머리 task)은 대상사업 상자만큼 뺌");
  assert.deepEqual([l.sections[1].startPage, l.sections[1].endPage], [2, 3]);
  assert.deepEqual(sheetsOf(l.pages).map((sh) => sh.map((p) => p.no)), [[1], [2, 3]]);
});

test("높이 출처: fit → estimate → 옛 초안(v2)·초안 없음은 배정 쪽수, 옛 초안은 「어림 없음」 목록", () => {
  const withFit = mkSpec("1-가", { total: 200 });
  const v3 = mkSpec("1-나");
  const v2: ReportSectionSpec = { ...mkSpec("1-다"), version: 2, blocks: undefined, rows: [{ label: "추진배경", bullets: ["옛 사다리 불릿 문장입니다"], diagram: { type: "none", title: "", rows: [], steps: [], actions: [] } }] };
  assert.deepEqual(specHeight(v3), { mm: fitReport(v3).total, source: "estimate" });
  const l = layoutBusiness([mkItem("1-가", "A", "1", 1, withFit), mkItem("1-나", "A", "1", 0.5, v3), mkItem("1-다", "A", "1", 0.5, v2)]);
  assert.deepEqual(l.sections.map((s) => s.source), ["fit", "estimate", "assigned"]);
  assert.equal(l.sections[2].height, 0.5 * H);
  assert.equal(l.sections[2].fit, null, "높이를 모르면 배정과 견주지 않음");
  assert.deepEqual(l.checks.unestimated.map((x) => x.taskNo), ["1-다"]);
});

test("배정 대비: 조판 높이가 배정 × 102% 넘으면 over(조각에도 넘침), 95% 못 미치면 under — 머리 없는 예전 초안은 all로 맞춘 것으로 봄", () => {
  const l = layoutBusiness([
    mkItem("1-가", "A", "1", 1, mkSpec("1-가", { total: 300 })),
    mkItem("1-나", "A", "1", 0.5, mkSpec("1-나", { total: 127.5 })),
    mkItem("2-가", "A", "2", 0.5, mkSpec("2-가", { total: 130 })),
  ]);
  assert.equal(l.sections[0].fit, "over");
  assert.equal(l.sections[0].delta, 300 - H);
  assert.ok(l.pages[0].pieces[0].over);
  assert.equal(l.sections[1].fit, "under", "머리 sub로 14.1mm 빠져 113.4mm = 89%");
  assert.equal(l.sections[2].fit, "ok", "머리 task로 6.9mm 빠져 123.1mm = 97%");
});

test("예산: 조판 쪽 수·배정 합을 15±1쪽과 견줌(16쪽 맞음·13쪽 모자람), 뺀 과제는 셈하지 않음", () => {
  const rows = Array.from({ length: 16 }, (_, i) => mkItem(`${i + 1}-가`, "A", String(i + 1), 1));
  rows.push(mkItem("99-가", "A", "99", 1, null, { included: false }));
  const l = layoutBusiness(rows);
  assert.equal(l.summary.assigned, 16);
  assert.equal(l.summary.laid, 16);
  assert.equal(l.summary.state, "ok");
  assert.equal(l.summary.assignedState, "ok");
  assert.equal(l.summary.excluded, 1);
  assert.equal(layoutBusiness(rows.slice(0, 13)).summary.state, "under");
  assert.equal(layoutBusiness([...rows.slice(0, 16), mkItem("17-가", "A", "17", 1), mkItem("18-가", "A", "18", 1)]).summary.state, "over");
});

test("검사 · 같은 문장: 서로 다른 소항목의 닮은 정도 0.8 이상 문장, 짧은 글(라벨)·같은 소항목 안은 뺌, SAME_TEXT_MAX 상한", () => {
  const same = "현장 검사관의 고소 작업 위험을 원천 차단하는 AI 판독 시스템 도입";
  const a = mkSpec("1-가", { blocks: [blk("bullets", { label: "추진배경", items: [same, "추진배경"] })], results: ["검사 소요시간 단축"] });
  const b = mkSpec("1-나", { blocks: [blk("bullets", { label: "추진배경", items: [`${same}으로 안전 확보`] })], results: [same] });
  const c = mkSpec("2-가", { blocks: [blk("bullets", { label: "추진배경", items: ["전혀 다른 내용의 해상 안전 선박 점검 지원 사업 문장"] })], results: ["해상 골든타임 확보"] });
  const r = businessChecks([mkItem("1-가", "A", "1", 0.5, a), mkItem("1-나", "A", "1", 0.5, b), mkItem("2-가", "A", "2", 0.5, c)]);
  assert.equal(r.sameSentenceCount, 2, "1-가 문장이 1-나 불릿·추진성과 두 곳에(1-나 안의 두 문장끼리는 셈하지 않음)");
  assert.ok(r.sameSentences.every((p) => p.a.taskNo === "1-가" && p.b.taskNo === "1-나" && p.score >= 0.8));
  assert.ok(!r.sameSentences.some((p) => p.a.text === "추진배경"));
  assert.ok(r.sameSentences[0].a.text.length <= 41, "문장 앞부분만(40자 + …)");

  const many = Array.from({ length: 30 }, (_, i) => `공통 문장 번호 ${i}번째 항목 검사 체계 고도화로 안전 확보 방안 마련`);
  const x = mkSpec("3-가", { blocks: [blk("bullets", { label: "추진내용", items: many })] });
  const y = mkSpec("3-나", { blocks: [blk("bullets", { label: "추진내용", items: many })] });
  const big = businessChecks([mkItem("3-가", "A", "3", 0.5, x), mkItem("3-나", "A", "3", 0.5, y)]);
  assert.ok(big.sameSentenceCount > SAME_TEXT_MAX);
  assert.equal(big.sameSentences.length, SAME_TEXT_MAX);
});

test("검사 · 같은 짜임(블록 서명)·이야기 틀 수·초안 없음·다시 만들기 권장", () => {
  const shape = [blk("bullets", { label: "추진배경", items: ["가 과제 배경 문장입니다"] }), blk("compare", { label: "추진내용", rows: [{ key: "검사", before: ["육안"], after: ["AI"] }] })];
  const r = businessChecks([
    mkItem("1-가", "A", "1", 0.5, mkSpec("1-가", { blocks: shape, story: "한계 극복" })),
    mkItem("1-나", "A", "1", 0.5, mkSpec("1-나", { blocks: shape, story: "한계 극복" }), { sourceRev: 3, dataRev: 4 }),
    mkItem("2-가", "A", "2", 0.5, mkSpec("2-가", { blocks: [blk("stats", { cells: [{ head: "97%", tag: "", bullets: ["신뢰도"], note: "’25년" }, { head: "3만국", tag: "", bullets: ["적용"], note: "’25년" }] })], story: "단계 전개" })),
    mkItem("2-나", "A", "2", 0.5, null),
  ]);
  assert.deepEqual(r.sameLayouts, [{ signature: "bullets → compare", taskNos: ["1-가", "1-나"] }]);
  assert.deepEqual(r.stories, [
    { story: "한계 극복", taskNos: ["1-가", "1-나"] },
    { story: "단계 전개", taskNos: ["2-가"] },
  ]);
  assert.deepEqual(r.missing.map((x) => [x.taskNo, x.pages]), [["2-나", 0.5]]);
  assert.deepEqual(r.stale.map((x) => x.taskNo), ["1-나"], "초안의 원장 개정 번호 ≠ 지금 원장");
});

test("sheetHtml: 머리 모드대로(대상사업 상자·실행과제 띠는 처음 한 번), 같은 쪽 둘째는 띄움, 초안 없는 자리는 점선 빈 칸, 글 이스케이프", () => {
  const l = layoutBusiness([
    mkItem("1-가", "A", "1", 0.5, mkSpec("1-가", { total: 120 })),
    mkItem("1-나", "A", "1", 0.5, mkSpec("1-나", { total: 120 })),
    mkItem("2-가", "A", "2", 0.5, null, { title: "<script>x</script>" }),
  ]);
  const [one, two] = sheetsOf(l.pages).map((sh) => sheetHtml(sh, l));
  assert.equal(one.match(/class="k-biz"/g)?.length, 1);
  assert.equal(one.match(/class="k-task"/g)?.length, 1);
  assert.equal(one.match(/class="k-sub"/g)?.length, 2);
  assert.match(one, /id="bz-u-1-나" style="margin-top:3mm;?"/);
  assert.match(one, /--bz-n:1/);
  assert.match(one, /- 1 -/);
  assert.match(two, /bz-empty/);
  assert.match(two, /초안 없음 · 배정 0\.5쪽/);
  assert.ok(two.includes(`href="/reports/cards/${encodeURIComponent("u-2-가")}"`));
  assert.match(two, /height:127\.5mm/);
  assert.ok(!two.includes("<script>"), "과제명 이스케이프");
});

test("sheetHtml: 여러 쪽에 걸친 소항목은 한 번만 그리고 쪽 경계 선·쪽 번호 범위", () => {
  const l = layoutBusiness([mkItem("1-가", "A", "1", 2, mkSpec("1-가", { total: 2 * H - 10, module: 2 }))]);
  const sheets = sheetsOf(l.pages);
  assert.equal(l.pages.length, 2);
  assert.equal(sheets.length, 1);
  const html = sheetHtml(sheets[0], l);
  assert.equal(html.match(/class="k-sub"/g)?.length, 1);
  assert.match(html, /1쪽 끝 · 2쪽/);
  assert.match(html, /--bz-n:2/);
  assert.match(html, /- 1~2 -/);
});

// ---------------------------------------------------------------------------
// 경영관리 지표 조판(2026-10-10 — opts.mg): 평가내용이 바뀌면 새 쪽, 같은 평가내용은 이어 씀, 머리 되풀이 생략, 절 머리 높이, 2025 본문 쪽 예산

const bullets = (n: number, label = "추진내용"): Block => ({ kind: "bullets", label, title: "", variant: "", text: "", items: Array.from({ length: n }, (_, i) => `경영관리 추진 내용 ${i + 1}번 줄`), cells: [], rows: [], series: [], badge: "" });
/** 경영관리 초안: parts = [평가내용, 대주제, 절 표지] 목록, 절마다 불릿 블록 하나 */
const mgSpec = (parts: Array<[number, number, string]>, lines = 2): any => ({
  version: 3,
  sub: { title: "과제 제목", markers: [] },
  business: { no: 0, name: "" },
  task: { no: "", title: "", bp: false },
  blocks: parts.map(() => bullets(lines)),
  results: [],
  caption: "",
  module: 1,
  mg: { parts: parts.map(([evalNo, themeNo, mark], i) => ({ key: `${evalNo}.${themeNo}.${mark || 0}`, evalNo, evalTitle: `평가내용 ${evalNo} 제목`, themeNo, themeTitle: `대주제 ${themeNo}`, mark, title: mark ? `절 ${i + 1} 제목` : "" })), at: parts.map(([e, t, m]) => `${e}.${t}.${m || 0}`) },
});
const mgItem = (id: string, sort: number, section: string, s: any, pages = 1): BusinessItem => item({ cardId: id, uid: id, taskNo: id, section, subsection: null, sort, pages, spec: s });

test("경영관리 조판: 평가내용이 바뀌면 새 쪽, 같은 평가내용이면(대주제가 달라도) 이어 씀 — 주요사업의 실행과제 새 쪽 규칙은 안 씀", () => {
  const items = [
    mgItem("9-1", 0, "평가내용 1. 운용계획", mgSpec([[1, 1, "가"]])),
    mgItem("9-4", 1, "평가내용 1. 운용계획", mgSpec([[1, 2, "가"]])),
    mgItem("9-2", 2, "평가내용 2. 성과평가", mgSpec([[2, 1, "가"]])),
  ];
  const lay = layoutBusiness(items, { mg: { budget: 2 } });
  assert.deepEqual(lay.sections.map((s) => [s.taskNo, s.head, s.startPage]), [["9-1", "all", 1], ["9-4", "task", 1], ["9-2", "all", 2]]);
  assert.deepEqual(lay.sections.map((s) => s.mgCont), [{ eval: false, theme: false }, { eval: true, theme: false }, { eval: false, theme: false }]);
  assert.equal(lay.summary.laid, 2);
  assert.deepEqual(lay.summary.budget, { target: 2, tolerance: 1 });
  assert.equal(lay.summary.state, "ok");
  // 같은 목록을 주요사업으로 조판하면 실행과제(subsection) 규칙 — 머리 모드가 달라짐(경로가 섞이지 않음)
  assert.deepEqual(layoutBusiness(items).sections.map((s) => s.head), ["all", "sub", "all"]);
});

test("경영관리 조판 높이: 블록 어림 − 주요사업식 머리 + 절 머리, 앞 과제와 같은 평가내용이면 평가내용 상자(6.9mm), 같은 대주제면 대주제 띠(7.2mm)도 뺌", () => {
  const a = mgSpec([[1, 1, "가"]]);
  const b = mgSpec([[1, 1, "나"]]);
  const lay = layoutBusiness([mgItem("a", 0, "평가내용 1. x", a), mgItem("b", 1, "평가내용 1. x", b)], { mg: { budget: 2 } });
  assert.deepEqual(lay.sections[1].mgCont, { eval: true, theme: true });
  assert.equal(lay.sections[1].head, "sub");
  const full = lay.sections[0].height;
  assert.ok(Math.abs(full - lay.sections[1].height - (HEAD_PART_MM.biz + HEAD_PART_MM.task)) < 0.15, `${full} vs ${lay.sections[1].height}`);
  // 절 머리가 많을수록 높아짐: 대주제 둘·절 둘인 초안 > 대주제 하나·절 하나(블록 수가 같아도)
  const two = mgSpec([[1, 1, "가"], [1, 2, "가"]]);
  const one = { ...mgSpec([[1, 1, "가"], [1, 1, ""]]) };
  assert.ok(layoutBusiness([mgItem("t", 0, "평가내용 1. x", two)], { mg: { budget: 1 } }).sections[0].height > layoutBusiness([mgItem("o", 0, "평가내용 1. x", one)], { mg: { budget: 1 } }).sections[0].height);
});

test("경영관리 조판: 초안 없는 과제는 배정 쪽수 × 255mm·목차 1단의 평가내용으로 경계를 정하고, 쪽 수는 2025 본문 ±1쪽으로 견줌", () => {
  const lay = layoutBusiness(
    [mgItem("8-1", 0, "평가내용 1. 재무", mgSpec([[1, 1, "가"], [1, 2, "가"]])), mgItem("8-2", 1, "평가내용 2. 예산", null, 2), mgItem("8-3", 2, "평가내용 3. 성과", null, 2)],
    { mg: { budget: 8 } },
  );
  assert.deepEqual(lay.sections.map((s) => [s.taskNo, s.head, s.source]), [["8-1", "all", "estimate"], ["8-2", "all", "assigned"], ["8-3", "all", "assigned"]]);
  assert.equal(lay.sections[1].height, 2 * H);
  assert.equal(lay.summary.laid, 5, "8-1 한 쪽 + 8-2 두 쪽 + 8-3 두 쪽(평가내용마다 새 쪽)");
  assert.equal(lay.summary.state, "under", "5쪽 < 2025 8쪽 − 1");
  assert.equal(lay.summary.assignedState, "under", "배정 5쪽");
});

test("경영관리 조각 HTML: 앞 과제에 이어지면 첫 평가내용 상자·대주제 띠를 다시 그리지 않고, 첫 과제는 그대로", () => {
  const a = mgSpec([[1, 1, "가"]]);
  const b = mgSpec([[1, 1, "나"]]);
  const lay = layoutBusiness([mgItem("a", 0, "평가내용 1. x", a), mgItem("b", 1, "평가내용 1. x", b)], { mg: { budget: 2 } });
  const html = sheetsOf(lay.pages).map((sh) => sheetHtml(sh, lay)).join("");
  assert.equal((html.match(/k-biz__no">평가내용1</g) ?? []).length, 1, "평가내용 상자는 한 번");
  assert.equal((html.match(/class="k-task"/g) ?? []).length, 1, "대주제 띠도 한 번");
  assert.equal((html.match(/class="k-sub"/g) ?? []).length, 2, "절 제목은 둘 다");
});

// ---------------------------------------------------------------------------
// 대상사업 머리 지도(opts.map — 주요사업만, 기본 끔)

test("머리 지도 줄: 대상사업 안 실행과제를 조판 순서·중복 없이, 소항목은 「표지. 제목」(초안 없으면 항목 이름), 다음 대상사업에서 끊음", () => {
  const items = [
    mkItem("1-가", "A", "1-1. 스마트 검사", 0.5, mkSpec("1-가", { total: 100 })),
    mkItem("1-나", "A", "1-1. 스마트 검사", 0.5, mkSpec("1-나", { total: 100 })),
    mkItem("2-가", "A", "1-2. 현장 지원", 0.5, null, { title: "현장 <지원> 과제" }),
    mkItem("1-다", "A", "1-1. 스마트 검사", 0.5, mkSpec("1-다", { total: 100 })),
    mkItem("3-가", "B", "2-1. 다른 사업", 0.5, mkSpec("3-가", { total: 100 })),
  ];
  const rows = bizMapRows(items, headModes(items), 0);
  assert.deepEqual(rows, [
    { no: "1-1", name: "스마트 검사 체계", subs: ["가. 소항목 1-가", "나. 소항목 1-나", "다. 소항목 1-다"] },
    { no: "1-2", name: "현장 지원", subs: ["현장 <지원> 과제"] },
  ]);
  assert.deepEqual(bizMapRows(items, headModes(items), 4).map((r) => r.subs), [["가. 소항목 3-가"]]);
  assert.equal(bizMapLine(rows[0]), "1-1 스마트 검사 체계 가. 소항목 1-가 · 나. 소항목 1-나 · 다. 소항목 1-다");
});

test("머리 지도 HTML: 머리 「추진개요」 + 실행과제 줄, 모든 글 이스케이프, 줄이 없으면 빈 글", () => {
  const html = bizMapHtml([{ no: "1-1", name: "A&B <과제>", subs: ['가. "제목"', "나. 둘"] }]);
  assert.equal(html, '<div class="bz-map"><p class="bz-map__h">추진개요</p><ul><li><b class="bz-map__no">1-1</b> A&amp;B &lt;과제&gt; <span class="bz-map__subs">가. &quot;제목&quot; · 나. 둘</span></li></ul></div>');
  assert.equal(bizMapHtml([]), "");
});

test("머리 지도 높이: 테두리·안 여백·머리 한 줄 + 줄마다 줄바꿈 수 × 10pt×1.45, 긴 줄은 줄바꿈만큼 커짐", () => {
  const PTM = 25.4 / 72;
  const one = bizMapMm([{ no: "1-1", name: "짧은 이름", subs: ["가. 제목"] }]);
  const base = 2 * BIZ_MAP_MM.border + 2 * BIZ_MAP_MM.padY + BIZ_MAP_MM.headPt * BIZ_MAP_MM.headLh * PTM + BIZ_MAP_MM.gap;
  const line = BIZ_MAP_MM.pt * BIZ_MAP_MM.lh * PTM;
  assert.ok(Math.abs(one - (base + line)) < 1e-9, String(one));
  const long = { no: "1-2", name: "가".repeat(60), subs: ["가. " + "나".repeat(60), "나. " + "다".repeat(60)] };
  const n = lineCount(bizMapLine(long), bizMapWidth(), BIZ_MAP_MM.pt, true);
  assert.ok(n >= 2);
  assert.ok(Math.abs(bizMapMm([long]) - (base + n * line)) < 1e-9);
  assert.equal(bizMapMm([]), 0);
});

test("머리 지도 켜기: 대상사업 첫 소항목(머리 all)만 상자 높이만큼 커지고 나머지는 그대로, 끄면 지금과 같음", () => {
  const items = () => [
    mkItem("1-가", "A", "1-1. 스마트 검사", 0.5, mkSpec("1-가", { total: 120 }), { sort: 1 }),
    mkItem("1-나", "A", "1-1. 스마트 검사", 0.5, mkSpec("1-나", { total: 120 }), { sort: 2 }),
    mkItem("2-가", "A", "1-2. 현장 지원", 0.5, mkSpec("2-가", { total: 120 }), { sort: 3 }),
    mkItem("3-가", "B", "2-1. 다른 사업", 0.5, mkSpec("3-가", { total: 120 }), { sort: 4 }),
  ];
  const off = layoutBusiness(items());
  const on = layoutBusiness(items(), { map: true });
  assert.deepEqual(layoutBusiness(items(), { map: false }), off, "끈 상태 = 옵션 없음");
  assert.ok(off.sections.every((s) => !("map" in s)));
  const add0 = bizMapMm(on.sections[0].map!);
  assert.ok(add0 > 0);
  assert.equal(on.sections[0].height, round1(off.sections[0].height + add0));
  assert.equal(on.sections[0].fullHeight, round1(off.sections[0].fullHeight + add0));
  assert.equal(on.sections[0].fit, "over", "120mm + 상자 > 127.5mm × 102%");
  assert.deepEqual(
    on.sections.slice(1, 3).map((s) => [s.height, s.fullHeight, "map" in s]),
    off.sections.slice(1, 3).map((s) => [s.height, s.fullHeight, false]),
  );
  assert.ok(on.sections[3].map && on.sections[3].height > off.sections[3].height, "다음 대상사업 첫 소항목도");
  // 그림: 대상사업 상자 바로 뒤에 상자, 끄면 상자 없음
  const html = sheetsOf(on.pages).map((sh) => sheetHtml(sh, on)).join("");
  assert.equal((html.match(/class="bz-map"/g) ?? []).length, 2);
  assert.match(html, /<\/span><\/p>\n<div class="bz-map">/);
  const offHtml = sheetsOf(off.pages).map((sh) => sheetHtml(sh, off)).join("");
  assert.ok(!offHtml.includes('class="bz-map"'));
});

test("머리 지도: 경영관리(opts.mg)면 무시, 초안 없는 첫 소항목에는 넣지 않음", () => {
  const a = mgSpec([[1, 1, "가"]]);
  const mgOff = layoutBusiness([mgItem("a", 0, "평가내용 1. x", a)], { mg: { budget: 1 } });
  const mgOn = layoutBusiness([mgItem("a", 0, "평가내용 1. x", a)], { mg: { budget: 1 }, map: true });
  assert.deepEqual(mgOn, mgOff);
  const none = layoutBusiness([mkItem("1-가", "A", "1-1. x", 0.5, null)], { map: true });
  assert.ok(!none.sections[0].map);
  assert.equal(none.sections[0].height, 0.5 * H);
});

// ---------------------------------------------------------------------------
// 쪽 채움 경고(pageWarnings): 앞 소항목이 판면을 넘쳐 흐른 거의 빈 쪽 — 새 쪽 경계 바로 앞이나 본문 마지막 쪽일 때만

const bizBig = (id: string, sort: number, taskNo: string, subsection: string, total: number, head: "all" | "task" | "sub"): BusinessItem =>
  item({ cardId: id, sort, taskNo, title: `${id} 과제`, section: "가", subsection, pages: Math.ceil(total / H), spec: spec({ fit: { total, budget: H }, head }) });

test("쪽 채움 경고(주요사업): 한 쪽을 몇 줄 넘친 소항목이 다음 쪽에 거의 빈 채 남고 뒤가 새 실행과제면 쪽·채움·mm·줄·과제 이름을 알림", () => {
  const spill = 15.3;
  const lay = layoutBusiness([bizBig("a", 0, "1-가", "1. 실행", H + spill, "all"), bizBig("b", 1, "2-가", "2. 실행", 100, "all")]);
  assert.equal(lay.pages.length, 3, "a는 두 쪽(넘침 15.3mm가 둘째 쪽), b는 실행과제가 바뀌어 새 쪽");
  assert.deepEqual(lay.warnings, [`2쪽이 6%만 참 — 「1-가 a 과제」이 앞 쪽을 약 ${spill}mm(약 ${Math.round(spill / LINE_MM)}줄) 넘쳐 쪽이 하나 늘어남. 그만큼 줄이면 한 쪽이 줄어듦`]);
});

test("쪽 채움 경고(주요사업): 본문 마지막 쪽이어도 경고, 같은 실행과제 이어 쓰기 때문에 밀린 쪽(뒤가 경계가 아님)·반쪽·넘침 큰 쪽은 경고하지 않음", () => {
  assert.equal(layoutBusiness([bizBig("a", 0, "1-가", "1. 실행", H + 15, "all")]).warnings.length, 1, "마지막 쪽");
  // 뒤 소항목이 같은 실행과제(sub) — 안 들어가 밀린 것이라 넘침을 줄여도 쪽이 안 줆
  assert.deepEqual(layoutBusiness([bizBig("a", 0, "1-가", "1. 실행", H + 15, "all"), bizBig("b", 1, "1-나", "1. 실행", 200, "sub")]).warnings, []);
  // 반쪽 경계(채움 25~60%)는 배정 문제라 경고하지 않음
  const half = layoutBusiness([bizBig("a", 0, "1-가", "1. 실행", H + SPILL_FILL_MAX * H + 5, "all"), bizBig("b", 1, "2-가", "2. 실행", 100, "all")]);
  assert.deepEqual(half.warnings, []);
  // 채움 높은 쪽
  assert.deepEqual(layoutBusiness([bizBig("a", 0, "1-가", "1. 실행", H * 1.9, "all"), bizBig("b", 1, "2-가", "2. 실행", 100, "all")]).warnings, []);
  // 넘침이 없어 한 쪽에 든 소항목(102% 안)은 쪽이 안 늘어남
  assert.deepEqual(layoutBusiness([bizBig("a", 0, "1-가", "1. 실행", H + 3, "all"), bizBig("b", 1, "2-가", "2. 실행", 100, "all")]).warnings, []);
});

test("쪽 채움 경고(경영관리): 평가내용이 바뀌는 쪽 앞의 거의 빈 쪽은 경고, 같은 평가내용 이어 쓰기로 밀린 쪽·넘침 없이 반쪽에서 끝난 쪽은 아님", () => {
  const warn = layoutBusiness([mgItem("6-1", 0, "평가내용 1. 가", null, 1.06), mgItem("6-2", 1, "평가내용 2. 나", null, 1)], { mg: { budget: 2 } });
  assert.equal(warn.pages.length, 3);
  assert.equal(warn.warnings.length, 1);
  assert.match(warn.warnings[0], /^2쪽이 6%만 참 — 「6-1 제목」이 앞 쪽을 약 15\.3mm\(약 \d+줄\) 넘쳐 쪽이 하나 늘어남\. 그만큼 줄이면 한 쪽이 줄어듦$/);
  // 같은 평가내용(task 머리 — 새 쪽 규칙 아님)이라 뒤 과제가 밀린 쪽
  assert.deepEqual(layoutBusiness([mgItem("6-1", 0, "평가내용 1. 가", null, 1.06), mgItem("6-2", 1, "평가내용 1. 가", null, 1)], { mg: { budget: 2 } }).warnings, []);
  // 넘침 없이 반쪽(50%)에서 끝나고 평가내용이 바뀜
  assert.deepEqual(layoutBusiness([mgItem("6-1", 0, "평가내용 1. 가", null, 0.5), mgItem("6-2", 1, "평가내용 2. 나", null, 1)], { mg: { budget: 2 } }).warnings, []);
  // 넘친 부분이 절반인 쪽
  assert.deepEqual(layoutBusiness([mgItem("6-1", 0, "평가내용 1. 가", null, 1.5), mgItem("6-2", 1, "평가내용 2. 나", null, 1)], { mg: { budget: 2 } }).warnings, []);
  // 본문 마지막 쪽
  assert.equal(layoutBusiness([mgItem("6-1", 0, "평가내용 1. 가", null, 1.06)], { mg: { budget: 1 } }).warnings.length, 1);
});
