// 판면 맞추기(lib/reports/fit.ts) 순수 로직 시험: 줄 수 어림·자간 맞춤(fitLayout)·칸 폭·행 묶음·문턱값·점수.
// 글꼴 상수(charEm 등)는 화면 실측값이라 바뀔 수 있으므로, 가능한 한 hangulPerLine 같은 내보낸 함수로 기대값을 derive합니다(글자 수를 손으로 박지 않음).

import assert from "node:assert/strict";
import { test } from "node:test";
import { type Block, type Figure, LOGO_MM } from "./blocks.ts";
import { SUBMIT_OVER as SUBMIT_OVER_FROM_SUBMISSION } from "./submission.ts";
import {
  FIT_BAND,
  FIT_RANGE_TEXT,
  type FitReport,
  SUBMIT_OVER,
  HEAD_PART_MM,
  PAGE_MM,
  blockAreaMm,
  blockCosts,
  blockHeight,
  blockHeightWithFigures,
  blockRooms,
  blockWidth,
  canonicalBlock,
  capacityLines,
  bodyLayout,
  fitLayout,
  fitNeeded,
  fitReport,
  fitScore,
  figuresWidth,
  frameHeight,
  guardFigures,
  hangulPerLine,
  headCut,
  hollowBoxes,
  hollowWarning,
  lineCount,
  lineLayout,
  plainText,
  resultWidth,
  slotOf,
  textEm,
 figureBoxMm,
  fitVerdict } from "./fit.ts";

const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const cell = (head: string, bullets: string[] = [], tag = "", note = "") => ({ head, tag, bullets, note });

test("lineCount: 빈 글은 0줄, 한 줄에 맞으면 1줄", () => {
  assert.equal(lineCount("", 60), 0);
  assert.equal(lineCount("   ", 60), 0);
  assert.equal(lineCount("가나다", 60), 1);
});

test("lineCount: 띄어쓰기 단위로 넘기고 낱말은 쪼개지 않음(keep-all)", () => {
  const width = 60;
  const n = hangulPerLine(width);
  const w1 = "가".repeat(n); // 정확히 한 줄을 채우는 낱말
  const w2 = "나".repeat(n);
  assert.equal(lineCount(w1, width), 1);
  // 두 낱말을 이으면 각 낱말은 쪼개지지 않고 통째로 다음 줄로 — 2줄(3줄이 아님)
  assert.equal(lineCount(`${w1} ${w2}`, width), 2);
});

test("본문 글자 단위(chars — 2026-10-28, 2025 최종본): 어절 안 한글 글자 사이에서도 넘겨 줄을 채우고, 영문·숫자 덩어리·닫는 부호는 떼지 않음", () => {
  const width = 60;
  const n = hangulPerLine(width);
  const half = "가".repeat(Math.ceil(n * 0.6));
  // 어절 단위: 둘째 어절이 통째로 다음 줄 — 첫 줄이 60%쯤만 참. 글자 단위: 첫 줄을 채우고 나머지만 다음 줄
  const word = lineLayout(`${half} ${half}`, width);
  const chars = lineLayout(`${half} ${half}`, width, undefined, false, true);
  assert.equal(word.lines, 2);
  assert.equal(chars.lines, 2);
  assert.ok(chars.last < word.last, `글자 단위 마지막 줄 ${chars.last} < 어절 단위 ${word.last}`);
  // 한 줄을 꼭 채우는 한글 n자는 한 줄, 영문 덩어리는 쪼개지 않고 통째로 다음 줄
  assert.equal(lineCount("가".repeat(n), width, undefined, false, true), 1);
  assert.equal(lineLayout(`${"가".repeat(n - 1)}ABCD`, width, undefined, false, true).lines, 2);
  // 줄 끝 한글에 붙은 마침표는 그 글자와 함께 넘어감(줄 첫머리에 마침표 없음) — 같은 글이라도 마침표가 붙으면 줄이 늘 수 있음
  assert.equal(lineCount(`${"가".repeat(n)}.`, width, undefined, false, true), 2);
  // bodyLayout = 본문 크기·글자 단위·자간 맞춤
  assert.deepEqual(bodyLayout(`${half} ${half}`, width), fitLayout(`${half} ${half}`, width, undefined, false, true));
  // 돋움(머리)은 chars를 줘도 어절 단위 그대로
  assert.deepEqual(lineLayout(`${half} ${half}`, width, 10.6, true, true), lineLayout(`${half} ${half}`, width, 10.6, true));
});

test("lineCount: 한 낱말이 줄보다 길면 글자 단위로 올림(ceil) 나눔", () => {
  const width = 60;
  const n = hangulPerLine(width);
  // 정확히 n의 배수인 낱말은 항상 그 배수만큼의 줄(부동소수 여유 없이 딱 나뉨)
  assert.equal(lineCount("가".repeat(n * 3), width), 3);
  assert.equal(lineCount("가".repeat(n * 4), width), 4);
});

test("lineCount: 강조 표시(**…**)는 폭에 넣지 않지만, 강조 글자는 굵은 돋움 폭으로 셈", () => {
  const width = 60;
  assert.equal(plainText("**가나다**"), "가나다");
  // 강조 표시 자체(**)는 폭이 0 — 강조 글자는 돋움(굵게) 폭으로 셈하므로 강조 없는 바탕 폭과는 다름
  assert.equal(textEm("**가나다**"), textEm("가나다", true));
  assert.notEqual(textEm("**가나다**"), textEm("가나다"));
  // 줄 수 자체는 이 예시에서는 같은 폭 구간 안이라 같음(폭이 줄어드는 방향이라 넘치지 않음)
  assert.equal(lineCount("**가나다**", width), lineCount("가나다", width));
});

test("hangulPerLine: lineCount과 들어맞음 — 정확히 그 글자 수면 1줄, 한 글자 더하면 2줄", () => {
  for (const w of [40, 60, 100, 150]) {
    const n = hangulPerLine(w);
    assert.ok(n > 0, `width ${w}`);
    assert.equal(lineCount("가".repeat(n), w), 1, `width ${w}`);
    assert.equal(lineCount("가".repeat(n + 1), w), 2, `width ${w}`);
  }
});

test("lineLayout: 마지막 줄 채움 비율(last) — 정확히 절반 글자 수면 last ≈ 0.5", () => {
  const width = 60;
  const n = hangulPerLine(width);
  const half = "가".repeat(Math.round(n / 2));
  const { lines, last } = lineLayout(half, width);
  assert.equal(lines, 1);
  assert.ok(Math.abs(last - 0.5) <= 0.1, `last ${last}`);
});

test("fitLayout: 1~2글자만 넘친 칸 글은 자간을 줄여 한 줄로 맞추지만(squeezed), 30% 넘게 넘친 글은 그대로 둠", () => {
  const width = 60;
  const n = hangulPerLine(width);
  const over1 = "가".repeat(n + 1); // 한 글자만 넘침
  assert.equal(lineLayout(over1, width).lines, 2, "자간을 넓히기 전에는 2줄");
  const fit1 = fitLayout(over1, width);
  assert.equal(fit1.lines, 1);
  assert.equal(fit1.squeezed, true);

  const over30 = "가".repeat(Math.ceil(n * 1.3)); // 약 30% 넘침
  const fit30 = fitLayout(over30, width);
  assert.equal(fit30.lines, 2, "자간을 줄여도 한 줄로 못 맞춤");
  assert.equal(fit30.squeezed, false);
});

test("slotOf: 비교표(사다리 폭) 칸 글 폭은 약 52mm(±1.5mm), 카드 칸 수가 늘수록 칸 폭은 좁아짐", () => {
  const ladderWidth = blockWidth({ label: "라벨", kind: "compare" });
  const compareSlot = slotOf({ kind: "compare", variant: "table", cells: [] }, ladderWidth);
  assert.ok(Math.abs(compareSlot.body - 52) <= 1.5, `compare body ${compareSlot.body}`);

  const cardsWidth = blockWidth({ label: "라벨", kind: "cards" });
  const cardsBody = (n: number) => slotOf({ kind: "cards", variant: "plain", cells: Array.from({ length: n }, () => cell("")) }, cardsWidth).body;
  const s2 = cardsBody(2);
  const s3 = cardsBody(3);
  const s4 = cardsBody(4);
  assert.ok(s4 < s3 && s3 < s2, `4칸(${s4}) < 3칸(${s3}) < 2칸(${s2})`);
});

test("slotOf/blockHeight: stats 칸도 칸 수가 늘수록 좁아지고(3칸 < 2칸) 높이는 0보다 큼", () => {
  const width = blockWidth({ label: "라벨", kind: "stats" });
  const statsBody = (n: number) => slotOf({ kind: "stats", variant: "", cells: Array.from({ length: n }, () => cell("")) }, width).body;
  const body2 = statsBody(2);
  const body3 = statsBody(3);
  assert.ok(body3 < body2, `3칸(${body3}) < 2칸(${body2})`);
  const b = blk("stats", { label: "A", cells: [cell("40,000건", ["설명"], "태그"), cell("98%", ["설명2"], "태그2"), cell("24종", ["설명3"])] });
  assert.ok(blockHeight(b, width) > 0);
});

test("fitReport 행 묶음: 같은 라벨 연속 블록은 한 행, 라벨 없는·전폭 블록은 따로, 행 끝 막대만 있으면 간이 막대 높이", () => {
  const spec = {
    sub: { title: "제목" },
    blocks: [
      blk("bullets", { label: "A", items: ["가나다"] }),
      blk("cards", { label: "A", cells: [cell("h1", ["가나다"]), cell("h2", ["가나다"])] }),
      blk("chart", { label: "A", title: "t", series: [{ label: "a", value: "1" }, { label: "b", value: "2" }] }),
      blk("compare", { label: "B", rows: [{ key: "k", before: ["가"], after: ["나"] }] }),
      blk("banner", { text: "메시지" }),
      blk("chart", { label: "C", title: "t2", series: [{ label: "a", value: "1" }, { label: "b", value: "2" }] }),
    ],
    results: ["결과"],
    resultCards: [],
    module: 1,
  };
  const fr = fitReport(spec);
  assert.deepEqual(fr.rows.map((r) => r.label), ["A", "B", "", "C"]);
  assert.equal(fr.rows[0].kinds, "bullets+cards+chart");
  // 라벨만 있고 다른 블록이 없는 막대 행(C)은 간이(lone) 막대 높이라 45mm보다 작음
  assert.ok(fr.rows[3].mm < 45, `lone chart 행 ${fr.rows[3].mm}mm`);
  assert.equal(fr.budget, spec.module * PAGE_MM.height);
  assert.ok(fr.total > fr.rows.reduce((s, r) => s + r.mm, 0), "총 높이는 행 높이 합보다 큼(제목부·추진성과 포함)");
});

test("fitReport wrapped: 칸 폭보다 긴 불릿만 실림(perLine은 그 칸의 한 줄 글자 수)", () => {
  const longBullet = "가".repeat(20);
  const specLong = {
    sub: { title: "제목" },
    blocks: [blk("cards", { label: "A", cells: [cell("h1", [longBullet]), cell("h2", [longBullet]), cell("h3", [longBullet]), cell("h4", [longBullet])] })],
    results: [],
    resultCards: [],
    module: 1,
  };
  const frLong = fitReport(specLong);
  assert.equal(frLong.wrapped.length, 4);
  for (const w of frLong.wrapped) assert.ok(w.perLine < 20, `perLine ${w.perLine}`);

  const shortBullet = "가".repeat(3);
  const specShort = { ...specLong, blocks: [blk("cards", { label: "A", cells: [cell("h1", [shortBullet]), cell("h2", [shortBullet]), cell("h3", [shortBullet]), cell("h4", [shortBullet])] })] };
  assert.equal(fitReport(specShort).wrapped.length, 0);
});

test("fitReport ragged/sparse: 3칸 카드에서 5글자 칸 글은 sparse(60% 미만), 자간 맞춤을 넘겨 넘친 칸 글은 ragged(35% 미만)로 실림", () => {
  const width = blockWidth({ label: "라벨", kind: "cards" });
  const slot = slotOf({ kind: "cards", variant: "plain", cells: [cell(""), cell(""), cell("")] }, width);
  const n = hangulPerLine(slot.body);
  const sparseText = "가".repeat(5);
  const raggedText = "가".repeat(n + Math.round(n * 0.2)); // 자간 맞춤(SQUEEZE 6.5%)으로는 못 줄이는 넘침
  const spec = {
    sub: { title: "제목" },
    blocks: [blk("cards", { label: "A", cells: [cell("h1", [sparseText]), cell("h2", [raggedText]), cell("h3", [])] })],
    results: [],
    resultCards: [],
    module: 1,
  };
  const fr = fitReport(spec);
  assert.ok(fr.sparse.some((x) => x.text === sparseText), "5글자 칸 글은 sparse");
  assert.ok(fr.ragged.some((x) => x.text === raggedText), "자간 맞춤을 넘긴 칸 글은 ragged");
  assert.ok(!fr.sparse.some((x) => x.text === raggedText), "ragged 칸 글은 sparse가 아님(두 줄이라 fill 기준이 다름)");
});

test("fitReport bullets: 살펴본 칸 글 수에는 행 칸 글뿐 아니라 추진성과(results)도 셈", () => {
  const specNoResults = { sub: { title: "제목" }, blocks: [blk("bullets", { label: "A", items: ["가나다"] })], results: [], resultCards: [], module: 1 };
  const specWithResults = { ...specNoResults, results: ["결과 하나", "결과 둘"] };
  const noResults = fitReport(specNoResults);
  const withResults = fitReport(specWithResults);
  assert.equal(noResults.bullets, 1);
  assert.equal(withResults.bullets, 3);
});

test("fitNeeded: over(예산의 1.02배 넘음)·under(0.95배 못 미침)·ragged(한두 글자 넘긴 칸 글 3개 이상)·sparse(덜 채운 칸 글이 30%·최소 4개 이상)·그 밖은 null", () => {
  const budget = 255;
  const base: FitReport = { budget, total: budget, rows: [], wrapped: [], ragged: [], sparse: [], bullets: 10 };
  assert.equal(fitNeeded({ ...base, total: Math.ceil(budget * FIT_BAND.over) + 1 }), "over");
  assert.equal(fitNeeded({ ...base, total: Math.floor(budget * FIT_BAND.under) - 1 }), "under");
  const line = (n: number) => Array.from({ length: n }, () => ({ where: "x", text: "y", lines: 2, perLine: 10, fill: 0.2 }));
  assert.equal(fitNeeded({ ...base, ragged: line(3) }), "ragged");
  assert.equal(fitNeeded({ ...base, ragged: line(2) }), null, "ragged는 3개 미만이면 필요 없음");
  assert.equal(fitNeeded({ ...base, bullets: 10, sparse: line(4) }), "sparse", "30%(3개) < 최소 4개 — 4개부터 필요");
  assert.equal(fitNeeded({ ...base, bullets: 10, sparse: line(3) }), null);
  assert.equal(fitNeeded({ ...base, bullets: 40, sparse: line(11) }), null, "ceil(40*0.3)=12보다 적으면 아직");
  assert.equal(fitNeeded({ ...base, bullets: 40, sparse: line(12) }), "sparse");
  assert.equal(fitNeeded(base), null);
  // 문턱 바로 안쪽은 맞춤 필요 없음
  assert.equal(fitNeeded({ ...base, total: Math.floor(budget * FIT_BAND.over) }), null);
  // over·under가 ragged·sparse보다 먼저 판정됨
  assert.equal(fitNeeded({ ...base, total: Math.ceil(budget * FIT_BAND.over) + 1, ragged: [], sparse: [] }), "over");
});

test("fitScore: 넘침은 같은 크기로 빈 것보다 나쁘고, ragged·sparse 칸 글이 많을수록 점수가 나빠짐(ragged가 sparse보다 무거움)", () => {
  const budget = 255;
  const base: FitReport = { budget, total: budget - 45, rows: [], wrapped: [], ragged: [], sparse: [], bullets: 10 };
  const over = fitScore({ ...base, total: budget + 45 });
  const under = fitScore({ ...base, total: budget - 45 });
  assert.ok(over > under, `over ${over} > under ${under}`);

  const line = (n: number) => Array.from({ length: n }, () => ({ where: "", text: "", lines: 2, perLine: 5, fill: 0.2 }));
  const plain = fitScore(base);
  const oneRagged = fitScore({ ...base, ragged: line(1) });
  const oneSparse = fitScore({ ...base, sparse: line(1) });
  assert.ok(oneRagged > plain && oneSparse > plain);
  assert.ok(oneRagged - plain > oneSparse - plain, "ragged 하나(+3)가 sparse 하나(+1)보다 나쁨");
});

test("capacityLines: 9줄(qa·table·cards vs 줄 추가), 첫 줄은 bullets 안내, 한 줄은 cards 2칸을 담음", () => {
  const lines = capacityLines();
  assert.equal(lines.length, 9);
  assert.match(lines[0], /bullets/);
  assert.ok(lines.some((l) => l.includes("cards 2칸")), lines.join("\n"));
  assert.ok(lines.some((l) => l.includes("qa") && l.includes("table") && l.includes("cards vs")), lines.join("\n"));
});

test("blockCosts: 6줄(qa·table 줄 추가, 마지막은 그림 자리 크기), 각 종류(quotes·compare·steps·stats·chart·qa·table)를 언급하고 mm 수는 모두 양수, compare 3행 > 2행·zigzag > steps 4단계", () => {
  const lines = blockCosts();
  assert.equal(lines.length, 6);
  assert.match(lines[5], /그림 자리.*S 20×15.*M 32×20.*MAP 30×40.*로고 22×10/);
  assert.match(lines[0], /quotes/);
  assert.match(lines[1], /steps/);
  assert.match(lines[2], /compare/);
  assert.match(lines[3], /stats/);
  assert.match(lines[3], /chart/);
  assert.match(lines[4], /qa/);
  assert.match(lines[4], /table/);
  const mmValues = lines.flatMap((l) => [...l.matchAll(/(\d+)mm/g)].map((m) => Number(m[1])));
  assert.ok(mmValues.length > 0);
  assert.ok(mmValues.every((n) => n > 0), `mm 수는 모두 양수여야 함: ${mmValues.join(",")}`);
  const cmpMatch = /compare 표 2행 (\d+)mm·3행 (\d+)mm/.exec(lines[2])!;
  assert.ok(cmpMatch, lines[2]);
  assert.ok(Number(cmpMatch[2]) > Number(cmpMatch[1]), "compare 3행이 2행보다 높음");
  const stepsMatch = /4단계 (\d+)mm·zigzag (\d+)mm/.exec(lines[1])!;
  assert.ok(stepsMatch, lines[1]);
  assert.ok(Number(stepsMatch[2]) > Number(stepsMatch[1]), "zigzag가 steps 4단계보다 높음");
});

test("blockAreaMm: 0.5쪽은 80~90mm, 1쪽은 205~215mm(제목부·추진성과를 뺀 블록 영역)", () => {
  const half = blockAreaMm(0.5);
  const full = blockAreaMm(1);
  assert.ok(half >= 80 && half <= 90, `0.5쪽 ${half}mm`);
  assert.ok(full >= 205 && full <= 215, `1쪽 ${full}mm`);
});

// ---------------------------------------------------------------------------
// 머리 모드 판면 예산(사업 단위 조판, 2026-09-27) — headCut·frameHeight·blockAreaMm·fitReport의 head 인자

test("headCut: all은 0, task는 대상사업 상자만큼(HEAD_PART_MM.biz), sub는 대상사업 상자+실행과제 띠(둘 다)", () => {
  assert.equal(headCut("all"), 0);
  assert.equal(headCut(), 0, "기본값은 all");
  assert.equal(headCut("task"), HEAD_PART_MM.biz);
  assert.equal(headCut("sub"), HEAD_PART_MM.biz + HEAD_PART_MM.task);
});

test("frameHeight: 머리 모드가 낮을수록(all → task → sub) 제목부가 줄어 정확히 headCut만큼 낮음", () => {
  const all = frameHeight("제목", ["결과"], 0, {}, undefined, "all");
  const task = frameHeight("제목", ["결과"], 0, {}, undefined, "task");
  const sub = frameHeight("제목", ["결과"], 0, {}, undefined, "sub");
  const eps = 1e-9;
  assert.ok(Math.abs(all - task - HEAD_PART_MM.biz) < eps, `all − task = ${all - task}`);
  assert.ok(Math.abs(all - sub - (HEAD_PART_MM.biz + HEAD_PART_MM.task)) < eps, `all − sub = ${all - sub}`);
  // 다섯째 인자(markers)를 생략한 기본값도 all과 같음
  assert.equal(frameHeight("제목", ["결과"], 0), all);
});

test("blockAreaMm: sub는 all보다 headCut(all·sub 차이)만큼 블록 영역이 늘어남(반올림 고려 — 1쪽 기준 14mm)", () => {
  const all = blockAreaMm(1);
  const sub = blockAreaMm(1, "sub");
  assert.equal(sub - all, 14, `sub − all = ${sub - all}`);
  const task = blockAreaMm(1, "task");
  assert.ok(task > all && task < sub, `all < task(${task}) < sub`);
});

test("fitReport: spec.head가 task·sub면 total이 headCut만큼(반올림 오차 1mm 안) 줄고, head를 안 주면 all과 같음", () => {
  const spec = { sub: { title: "제목" }, blocks: [blk("bullets", { label: "A", items: ["가나다"] })], results: ["결과"], resultCards: [], module: 1 };
  const all = fitReport(spec);
  const task = fitReport({ ...spec, head: "task" as const });
  const sub = fitReport({ ...spec, head: "sub" as const });
  const noHead = fitReport(spec);
  assert.ok(Math.abs(all.total - task.total - HEAD_PART_MM.biz) <= 1, `all − task = ${all.total - task.total}`);
  assert.ok(Math.abs(all.total - sub.total - (HEAD_PART_MM.biz + HEAD_PART_MM.task)) <= 1, `all − sub = ${all.total - sub.total}`);
  assert.equal(noHead.total, all.total, "head를 안 주면 all과 같음");
});

// ---------------------------------------------------------------------------
// 그림 자리표시(figures) — blockHeightWithFigures·blockRooms·guardFigures(2026-09-27)

const fig = (kind: Figure["kind"], over: Partial<Figure> = {}): Figure => ({ kind, desc: "x", pos: "right", size: "M", ...over });

test("blockHeightWithFigures: 그림이 없으면 blockHeight와 같음", () => {
  const b = blk("bullets", { label: "A", items: ["가나다"] });
  const width = blockWidth(b);
  assert.equal(blockHeightWithFigures(b, width), blockHeight(b, width));
});

test("blockHeightWithFigures: 옆 그림은 글 폭을 줄여 높이를 늘리거나(줄 수 증가) 그림 높이 이상", () => {
  const b = blk("bullets", { label: "A", items: ["가나다라마바사아자차카타파하가나다라마바사"] });
  const width = blockWidth(b);
  const base = blockHeight(b, width);
  const withFig = { ...b, figures: [fig("illust", { size: "L" })] };
  const withFigHeight = blockHeightWithFigures(withFig, width);
  assert.ok(withFigHeight > base, `그림이 붙으면 글 폭이 줄어 높이가 늘어남(${base} → ${withFigHeight})`);
  // 그림이 행 높이를 정하면 그림 칸 실제 높이(서술 줄 반영) − 0.3mm(사다리 행 여백은 fitReport가 더함 — K·L·M 행별 실측)
  assert.ok(withFigHeight >= figureBoxMm(withFig.figures[0]) - 0.3, "그림 칸 높이 이상");
  assert.ok(figureBoxMm(withFig.figures[0]) >= 24, "그림 칸은 등급 높이(L 24mm) 이상");
});

test("blockHeightWithFigures: 협업 구조(hub) 가운데 로고는 글 폭을 줄이지 않고 가운데 칸 높이에만 로고 줄 높이(LOGO_MM.h + 2)를 더함", () => {
  const cell = (head: string, bullets: string[] = []) => ({ head, tag: "", bullets, note: "" });
  const b = blk("hub", { cells: [cell("가운데", ["설명"]), cell("기관1", ["역할1"]), cell("기관2", ["역할2"])] });
  const width = blockWidth(b);
  const base = blockHeight(b, width);
  const withLogo = { ...b, figures: [fig("logo", { pos: "center" })] };
  const withLogoHeight = blockHeightWithFigures(withLogo, width);
  // 가운데 칸 높이에만 더하므로 블록 높이는 base 이상, base + LOGO_MM.h + 2 이하(목록 칸이 더 높으면 늘지 않을 수도 있음)
  assert.ok(withLogoHeight >= base, `로고를 더하면 높이는 줄지 않음(${base} → ${withLogoHeight})`);
  assert.ok(withLogoHeight <= base + LOGO_MM.h + 2, `늘어나는 만큼은 로고 줄 높이 이하(${base} + ${LOGO_MM.h + 2} = ${base + LOGO_MM.h + 2}, 실제 ${withLogoHeight})`);
});

test("blockHeightWithFigures: 협업 구조(hub) 가운데 로고 — 목록 칸이 가운데보다 낮아 가운데가 기준이면 정확히 LOGO_MM.h + 2만큼 늘어남", () => {
  const cell = (head: string, bullets: string[] = []) => ({ head, tag: "", bullets, note: "" });
  // 목록 칸(기관1·기관2)의 note는 짧게, 가운데 칸의 설명을 길게 두어 가운데가 최댓값이 되게 함
  const b = blk("hub", { cells: [cell("가운데", ["가나다라마바사아자차카타파하가나다라마바사아자차카타파하"]), cell("기관1", ["역할"]), cell("기관2", ["역할"])] });
  const width = blockWidth(b);
  const base = blockHeight(b, width);
  const withLogo = { ...b, figures: [fig("logo", { pos: "center" })] };
  assert.equal(blockHeightWithFigures(withLogo, width), base + LOGO_MM.h + 2);
});

test("figuresWidth: 로고 묶음(logoMm)은 기관 수만큼 넓어짐 — 폭에 반영됨(평가 라운드 G 로고 묶음)", () => {
  const b2 = blk("bullets", { label: "A", items: ["가"], figures: [fig("logo", { desc: "기관A･기관B 로고" })] });
  const b4 = blk("bullets", { label: "A", items: ["가"], figures: [fig("logo", { desc: "기관A･기관B･기관C･기관D 로고" })] });
  assert.ok(figuresWidth(b4) > figuresWidth(b2), "기관이 많을수록 로고 묶음 폭이 넓어짐");
});

test("figuresWidth·blockHeightWithFigures: 협업 구조(hub) 가운데 로고 묶음은 이름 수와 상관없이 폭에서 빠지고 그대로", () => {
  const cell = (head: string, bullets: string[] = []) => ({ head, tag: "", bullets, note: "" });
  const base = blk("hub", { cells: [cell("가운데", ["설명"]), cell("기관1", ["역할1"]), cell("기관2", ["역할2"])] });
  const width = blockWidth(base);
  const with2 = { ...base, figures: [fig("logo", { pos: "center", desc: "기관A･기관B 로고" })] };
  const with4 = { ...base, figures: [fig("logo", { pos: "center", desc: "기관A･기관B･기관C･기관D 로고" })] };
  assert.equal(figuresWidth(with2), 0, "가운데 로고 묶음은 폭에서 빠짐");
  assert.equal(figuresWidth(with4), 0, "이름 수가 많아도 가운데 로고는 폭 제외 그대로");
  assert.equal(blockHeightWithFigures(with2, width), blockHeightWithFigures(with4, width), "이름 수와 상관없이 로고 줄 높이만 고정으로 더함");
  const plain = blockHeight(base, width);
  const withLogoHeight = blockHeightWithFigures(with2, width);
  assert.ok(withLogoHeight >= plain && withLogoHeight <= plain + LOGO_MM.h + 2, `가운데 칸에만 더하므로 base 이상 base+${LOGO_MM.h + 2} 이하(${plain} ~ ${plain + LOGO_MM.h + 2}, 실제 ${withLogoHeight})`);
});

test("blockRooms: 막대가 붙은 라벨 행(같은 라벨의 chart 포함)은 좁고, 라벨만 있는 행은 사다리 폭, 전폭 블록(banner)은 170mm", () => {
  const blocks = [
    blk("bullets", { label: "A", items: ["가나다"] }),
    blk("chart", { label: "A", series: [{ label: "a", value: "1" }, { label: "b", value: "2" }] }),
    blk("compare", { label: "B", rows: [{ key: "k", before: ["a"], after: ["b"] }] }),
    blk("banner", { text: "y" }),
  ];
  const rooms = blockRooms(blocks);
  assert.equal(rooms.length, 4, "블록마다 한 항목");
  assert.ok(rooms[0] < blockWidth(blocks[2]), "막대가 붙은 A 행은 B 행(사다리 폭)보다 좁음");
  assert.equal(rooms[0], rooms[1], "같은 행의 두 블록은 같은 폭");
  assert.equal(rooms[2], blockWidth(blocks[2]), "라벨만 있고 막대가 없는 행은 사다리 폭 그대로");
  assert.equal(rooms[3], PAGE_MM.width, "전폭 블록(banner)은 170mm");
});

test("guardFigures: 넓은 전폭 블록은 그대로(그림이 넉넉히 들어감)", () => {
  const b = blk("bullets", { items: ["x"], figures: [fig("photo")] });
  const warnings = guardFigures([b]);
  assert.deepEqual(warnings, []);
  assert.deepEqual(b.figures, [fig("photo")]);
});

test("guardFigures: 막대가 붙은 좁은 행의 전후 비교 패널 안 M 그림 둘은 빠지고 경고", () => {
  const compareBlock = blk("compare", { label: "A", variant: "panels", items: ["기존", "개선"], rows: [{ key: "k", before: ["b"], after: ["c"] }], figures: [fig("illust", { pos: "left" }), fig("photo", { pos: "right" })] });
  const chartBlock = blk("chart", { label: "A", series: [{ label: "a", value: "1" }, { label: "b", value: "2" }] });
  const warnings = guardFigures([compareBlock, chartBlock]);
  assert.deepEqual(compareBlock.figures, [], "패널 안 그림 둘 다 빠짐");
  assert.ok(warnings.some((w) => w.includes("A의 폭이 좁아 그림 2개를 뺐습니다")));
});

test("guardFigures: 옆 그림이 너무 크면(W 두 개) 작게(S) 줄이고 경고", () => {
  const b = blk("bullets", { label: "A", items: ["x"], figures: [fig("illust", { size: "W" }), fig("photo", { size: "W" })] });
  const warnings = guardFigures([b]);
  assert.ok(b.figures?.every((f) => f.size === "S"));
  assert.ok(warnings.some((w) => w.includes("작게(S) 줄였습니다")));
});

test("guardFigures: 로고·지도는 폭이 모자라도 작게 줄이지 않음(모자라면 대신 빠짐)", () => {
  const b = blk("bullets", { label: "A", items: ["x"], figures: [fig("map", { size: "L" }), fig("photo", { size: "L" })] });
  guardFigures([b]);
  assert.equal(b.figures?.length, 1);
  assert.equal(b.figures?.[0].kind, "map");
  assert.equal(b.figures?.[0].size, "L", "지도는 크기를 줄이지 않고 그대로 둠(모자라면 다른 그림이 대신 빠짐)");
});

test("fitReport: 같은 spec에 그림을 더하면 어림 높이(total)가 늘거나 같음", () => {
  const spec = {
    sub: { title: "제목" },
    blocks: [blk("bullets", { label: "A", items: ["가나다"] })],
    results: ["결과"],
    resultCards: [],
    module: 1,
  };
  const withoutFig = fitReport(spec);
  const withFig = fitReport({ ...spec, blocks: [{ ...spec.blocks[0], figures: [fig("illust", { size: "L" })] }] });
  assert.ok(withFig.total >= withoutFig.total, `그림을 더하면 높이가 늘거나 같음(${withoutFig.total} → ${withFig.total})`);
});

// ---------------------------------------------------------------------------
// canonicalBlock(구성안 판면 어림용, 2026-09-27) — 종류별 칸 수·전후 비교 행·불릿 줄·막대 수

test("canonicalBlock: bullets는 n개 줄, compare(table)는 n행(before·after 1개씩)", () => {
  const b = canonicalBlock("bullets", "", 3, "");
  assert.equal(b.items.length, 3);
  const c = canonicalBlock("compare", "table", 2, "라벨");
  assert.equal(c.rows.length, 2);
  assert.ok(c.rows.every((r) => r.before.length === 1 && r.after.length === 1));
});

test("canonicalBlock: compare panels는 items에 기존·개선을 담음", () => {
  const p = canonicalBlock("compare", "panels", 3, "");
  assert.deepEqual(p.items, ["기존", "개선"]);
});

test("canonicalBlock: cards는 n칸·칸마다 불릿 2개, hub는 최소 3칸(가운데 + 2)", () => {
  const cards = canonicalBlock("cards", "plain", 2, "라벨");
  assert.equal(cards.cells.length, 2);
  assert.ok(cards.cells.every((c) => c.bullets.length === 2));
  const hub = canonicalBlock("hub", "", 2, "");
  assert.equal(hub.cells.length, 3, "hub는 n=2여도 최소 3칸");
});

test("canonicalBlock: chart는 막대 2~4개(n=1이어도 2개, n=5는 4개로 자름)", () => {
  const one = canonicalBlock("chart", "", 1, "라벨");
  assert.equal(one.series.length, 2);
  const many = canonicalBlock("chart", "", 5, "라벨");
  assert.equal(many.series.length, 4);
});

test("canonicalBlock: compare 행이 늘면 blockHeight도 늘거나 같음", () => {
  const b2 = canonicalBlock("compare", "table", 2, "라벨");
  const b4 = canonicalBlock("compare", "table", 4, "라벨");
  assert.ok(blockHeight(b4, blockWidth(b4)) >= blockHeight(b2, blockWidth(b2)));
});

// ---------------------------------------------------------------------------
// 행별 실측 보정(2026-09-27): 인용 출처·수치 띠 자리표시·전후 비교 패널 그림·정의 칩·연도 흐름 tag·hub 제목

test("blockHeight quotes: 출처가 마지막 줄 여유 안에 들어가면 줄이 안 늘고, 아주 긴 출처는 줄이 늘어남", () => {
  const width = blockWidth({ kind: "quotes", label: "" });
  const text = "짧은 인용문입니다";
  const withoutNote = blk("quotes", { cells: [cell("", [text], "", "")] });
  const withShortNote = blk("quotes", { cells: [cell("", [text], "", "출처")] });
  const withLongNote = blk("quotes", { cells: [cell("", [text], "", "가".repeat(80))] });
  const h0 = blockHeight(withoutNote, width);
  const h1 = blockHeight(withShortNote, width);
  const h2 = blockHeight(withLongNote, width);
  assert.equal(h1, h0, "여유 안에 드는 짧은 출처는 줄을 늘리지 않음");
  assert.ok(h2 > h1, `아주 긴 출처는 줄을 늘림(${h1} → ${h2})`);
});

test("blockHeight stats: 자리표시(【확인: …】) 칸은 같은 글을 15pt 수치로 셌을 때보다 낮거나 같음", () => {
  const width = blockWidth({ kind: "stats", label: "A" });
  const text = "3만국 이상";
  const plain = blk("stats", { label: "A", cells: [cell(text, ["설명"]), cell(text, ["설명"])] });
  const placeholder = blk("stats", { label: "A", cells: [cell(`【확인: ${text}】`, ["설명"]), cell(`【확인: ${text}】`, ["설명"])] });
  assert.ok(blockHeight(placeholder, width) <= blockHeight(plain, width), "자리표시 수치(10.5pt)는 15pt 수치보다 낮거나 같은 칸 높이");
});

test("blockHeight 전후 비교(compare panels): 오른쪽(To-Be) 패널 안 그림은 높이를 늘리거나 같고, 가운데 큰 그림은 양쪽 패널을 좁혀 높이가 늘거나 같음", () => {
  const width = blockWidth({ kind: "compare", label: "A" });
  const base = blk("compare", { label: "A", variant: "panels", items: ["기존", "개선"], rows: [{ key: "구분", before: ["기존 내용"], after: ["개선 내용"] }] });
  const h0 = blockHeight(base, width);
  const withRightFig = { ...base, figures: [fig("photo", { pos: "right", size: "M" })] };
  const h1 = blockHeightWithFigures(withRightFig, width);
  assert.ok(h1 >= h0, `오른쪽 패널 안 그림이 있으면 높이가 같거나 큼(${h0} → ${h1})`);

  const withCenterFig = { ...base, figures: [fig("illust", { pos: "center", size: "L" })] };
  const h2 = blockHeightWithFigures(withCenterFig, width);
  assert.ok(h2 >= h0, `가운데 큰 그림은 두 패널 글 폭을 좁혀 높이가 같거나 큼(${h0} → ${h2})`);
});

test("blockHeight define: 칩이 많고 길면 적을 때보다 높음(칩 줄바꿈 chipRowsMm)", () => {
  const width = blockWidth({ kind: "define", label: "A" });
  const few = blk("define", { label: "A", title: "무엇?", text: "설명", items: ["단계"] });
  const many = blk("define", {
    label: "A",
    title: "무엇?",
    text: "설명",
    items: ["매우 긴 칩 이름 하나", "매우 긴 칩 이름 둘", "매우 긴 칩 이름 셋", "매우 긴 칩 이름 넷", "매우 긴 칩 이름 다섯"],
  });
  assert.ok(blockHeight(many, width) > blockHeight(few, width));
});

test("blockHeight timeline(chevron): 칸 머리의 tag 길이는 높이에 영향 없음(렌더러가 head만 그림)", () => {
  const width = blockWidth({ kind: "timeline", label: "A" });
  const shortTag = blk("timeline", { label: "A", variant: "chevron", cells: [cell("head1", ["가나다"], "짧", ""), cell("head2", ["가나다"], "짧", "")] });
  const longTag = blk("timeline", {
    label: "A",
    variant: "chevron",
    cells: [cell("head1", ["가나다"], "매우매우매우매우매우매우매우매우긴태그", ""), cell("head2", ["가나다"], "매우매우매우매우매우매우매우매우긴태그", "")],
  });
  assert.equal(blockHeight(shortTag, width), blockHeight(longTag, width));
});

test("blockHeight hub: title이 있으면 없을 때보다 높음(제목 줄 HEAD_MM + 1)", () => {
  const width = blockWidth({ kind: "hub", label: "A" });
  const noTitle = blk("hub", { label: "A", cells: [cell("가운데", ["설명"]), cell("기관1", ["역할1"]), cell("기관2", ["역할2"])] });
  const withTitle = { ...noTitle, title: "협업 구조" };
  assert.ok(blockHeight(withTitle, width) > blockHeight(noTitle, width));
});

// ---------------------------------------------------------------------------
// 표현 보강(2026-09-27): 위첨자 폭·qa·table 높이·cards vs 폭·frameHeight 곁들임·canonicalBlock qa·table·fitReport resultChart

test("textEm/plainText: 위첨자(^{…})는 폭이 줄지만 0은 아님 — ^{’24년}100국은 ’24년100국보다 좁고 100국보다 넓음", () => {
  const sup = "^{’24년}100국";
  const full = "’24년100국";
  const rest = "100국";
  assert.ok(textEm(sup) < textEm(full), `sup ${textEm(sup)} < full ${textEm(full)}`);
  assert.ok(textEm(sup) > textEm(rest), `sup ${textEm(sup)} > rest ${textEm(rest)}`);
  assert.equal(plainText(sup), full, "plainText는 위첨자 표시만 걷고 글자는 남김");
});

test("lineLayout: 위첨자 표기 안의 빈칸에서는 줄을 넘기지 않음(하나의 낱말로 다룸)", () => {
  const width = 60;
  const n = hangulPerLine(width);
  // 위첨자 안 공백이 있어도 줄바꿈 후보가 되면 안 됨 — 위첨자 앞뒤에 다른 낱말을 붙여 줄 수를 셈
  const sup = `^{’24 년 실적} ${"가".repeat(n - 2)}`;
  const withoutSpace = `^{’24년실적} ${"가".repeat(n - 2)}`;
  assert.equal(lineLayout(sup, width).lines, lineLayout(withoutSpace, width).lines, "위첨자 안 빈칸이 줄바꿈 지점이 되지 않음");
});

test("blockHeight qa: Q&A 쌍이 늘면 높이도 늘거나 같음, 답이 하나뿐이면 답이 둘인 것보다 폭이 넓음(들여쓰기 없음)", () => {
  const one = blk("qa", { label: "A", cells: [cell("왜 필요한가?", ["안전을 위해"])] });
  const two = blk("qa", { label: "A", cells: [cell("왜 필요한가?", ["안전을 위해"]), cell("어떻게 하나?", ["단계별로"])] });
  assert.ok(blockHeight(two, blockWidth(two)) >= blockHeight(one, blockWidth(one)));

  const w = blockWidth(one);
  const soloSlot = slotOf({ kind: "qa", variant: "", cells: [cell("q", ["a1"])] }, w);
  const dualSlot = slotOf({ kind: "qa", variant: "", cells: [cell("q", ["a1", "a2"])] }, w);
  assert.equal(soloSlot.body, dualSlot.body, "slotOf 폭 계산은 칸 수와 무관 — qaAnswerWidth가 답 개수로 들여쓰기를 뗌(blockHeight에서 적용)");
});

test("blockHeight table: 값 행이 늘면 높이도 늘거나 같음", () => {
  const b2 = canonicalBlock("table", "", 2, "");
  const b4 = canonicalBlock("table", "", 4, "");
  assert.ok(blockHeight(b4, blockWidth(b4)) >= blockHeight(b2, blockWidth(b2)));
});

test("slotOf: cards vs(2칸) 칸 폭은 평범한 2칸(plain)보다 좁음(가운데 VS 원 9mm)", () => {
  const width = blockWidth({ label: "라벨", kind: "cards" });
  const vsSlot = slotOf({ kind: "cards", variant: "vs", cells: [cell(""), cell("")] }, width);
  const plainSlot = slotOf({ kind: "cards", variant: "plain", cells: [cell(""), cell("")] }, width);
  assert.ok(vsSlot.body < plainSlot.body, `vs ${vsSlot.body} < plain ${plainSlot.body}`);
});

test("frameHeight: resultChart(막대)가 있으면 불릿이 짧아도 최소 CHART_MM 이상, resultBand(강조 띠)가 있으면 불릿 폭(resultWidth)이 좁아짐", () => {
  const plain = frameHeight("제목", ["짧은 결과"], 0);
  const withChart = frameHeight("제목", ["짧은 결과"], 0, { chart: true });
  assert.ok(withChart > plain, `chart 있으면 더 높음: ${withChart} > ${plain}`);

  const wideBand = resultWidth();
  const narrowBand = resultWidth({ band: "98% 달성" });
  assert.ok(narrowBand < wideBand, `강조 띠가 있으면 불릿 폭이 좁아짐: ${narrowBand} < ${wideBand}`);
});

test("canonicalBlock: qa·table 모양 — qa는 cells에 head·bullets가 채워지고, table은 items(구분+값열 3개)·cells가 채워짐", () => {
  const qa = canonicalBlock("qa", "", 2, "");
  assert.equal(qa.cells.length, 2);
  assert.ok(qa.cells.every((c) => c.head && c.bullets.length >= 1));
  const tb = canonicalBlock("table", "", 3, "");
  assert.equal(tb.items.length, 4, "구분 + 값 열 3개");
  assert.equal(tb.cells.length, 3);
  assert.ok(tb.cells.every((c) => c.bullets.length === 3));
});

test("fitReport: resultChart(막대 2개 이상)가 있으면 total이 늘거나 같음", () => {
  const base = { sub: { title: "제목" }, blocks: [blk("bullets", { label: "A", items: ["가나다"] })], results: ["짧은 결과"], resultCards: [], module: 1 };
  const without = fitReport(base);
  const withChart = fitReport({ ...base, resultChart: { series: [{ label: "’25년", value: "1" }, { label: "’26년", value: "2" }] } });
  assert.ok(withChart.total >= without.total, `chart 있으면 total이 늘거나 같음: ${withChart.total} >= ${without.total}`);
});

// ---------------------------------------------------------------------------
// 빈 상자(2026-10-15 후속 5): 나란한 칸 줄 수 차이

/** 칸 폭 한 줄을 거의 채운 불릿 n개(한 줄 = 그 칸 한 줄 한글 글자 수 — 폭은 hollowBoxes와 같은 셈) */
const fullLines = (b: Block, n: number) => {
  const s = slotOf(b, blockRooms([b])[0] - figuresWidth(b));
  return Array.from({ length: n }, () => "가".repeat(hangulPerLine(s.body)));
};

test("hollowBoxes: 형제 칸 3줄·3줄·1줄이면 1줄 칸 하나가 빈 칸(어디·쓴 줄·형제 최장 줄·한 줄 글자 수·늘릴 글자 수)", () => {
  const b = blk("cards", { label: "추진내용", variant: "plain", cells: [cell("가"), cell("나"), cell("다")] });
  b.cells = [cell("가", fullLines(b, 3)), cell("나", fullLines(b, 3)), cell("다", fullLines(b, 1))];
  const h = hollowBoxes([b]);
  assert.equal(h.length, 1, JSON.stringify(h));
  assert.equal(h[0].where, "추진내용 3번째 칸");
  assert.equal(h[0].most, 3);
  assert.ok(h[0].used > 0.8 && h[0].used <= 1, `쓴 줄 ${h[0].used}`);
  assert.equal(h[0].perLine, hangulPerLine(slotOf(b, blockRooms([b])[0]).body));
  assert.ok(h[0].add >= h[0].perLine, `형제 90%(2.7줄)까지 약 1.7줄 — ${h[0].add}자`);
  // 판면 어림(fitReport)에도 같은 목록
  assert.deepEqual(fitReport({ sub: { title: "제목" }, blocks: [b], results: [], module: 0.5 }).hollow, h);
});

test("hollowBoxes: 모두 1줄이면(형제 최장 2줄 미만) 빈 칸 없음, 2줄·2줄이면 없음", () => {
  const b = blk("steps", { label: "추진내용", variant: "row", cells: [cell("가"), cell("나"), cell("다")] });
  b.cells = [cell("가", fullLines(b, 1)), cell("나", ["짧은 글"]), cell("다", fullLines(b, 1))];
  assert.deepEqual(hollowBoxes([b]), []);
  b.cells = [cell("가", fullLines(b, 2)), cell("나", fullLines(b, 2)), cell("다", fullLines(b, 2))];
  assert.deepEqual(hollowBoxes([b]), []);
});

test("hollowBoxes: 표·막대·수치 띠·연혁 점은 재지 않음(줄 수가 달라도 빈 칸 없음)", () => {
  const long = Array.from({ length: 4 }, () => "가".repeat(40));
  const blocks = [
    blk("table", { label: "실적", variant: "result", cells: [cell("가", long), cell("나", ["짧음"])] }),
    blk("stats", { cells: [cell("1건", [long.join(" ")]), cell("2건", ["짧음"])] }),
    blk("chart", { label: "실적", title: "지표", series: [{ label: "’25년", value: "1" }, { label: "’26년", value: "2" }] }),
    blk("timeline", { variant: "dots", cells: [cell("’25년", long), cell("’26년", ["짧음"])] }),
  ];
  assert.deepEqual(hollowBoxes(blocks), []);
});

test("hollowBoxes: 결과 줄(note)도 칸 줄 수에 셈 — 3줄 형제 옆 2줄 + 결과 줄 1줄 칸은 빈 칸이 아님, 결과 줄을 빼면 빈 칸", () => {
  const b = blk("timeline", { label: "추진경과", variant: "chevron", cells: [cell("’25년"), cell("’26년")] });
  const s = slotOf(b, blockRooms([b])[0]);
  const note = "가".repeat(hangulPerLine(s.note));
  b.cells = [cell("’25년", fullLines(b, 3)), cell("’26년", fullLines(b, 2), "", note)];
  assert.deepEqual(hollowBoxes([b]), []);
  b.cells = [cell("’25년", fullLines(b, 3)), cell("’26년", fullLines(b, 2))];
  assert.equal(hollowBoxes([b]).length, 1);
});

test("hollowBoxes: 전후 패널은 왼쪽·오른쪽 패널을 형제로, ㄹ자 단계는 같은 줄(1·4단계 / 2·3단계)끼리만 견줌", () => {
  const long = "가".repeat(30);
  const panel = blk("compare", { label: "추진내용", variant: "panels", items: ["기존", "개선"], rows: [{ key: "", before: [long], after: ["짧음"] }, { key: "", before: [long], after: ["짧음"] }] });
  const hp = hollowBoxes([panel]);
  assert.deepEqual(hp.map((x) => x.where), ["추진내용 오른쪽 패널"]);
  const z = blk("steps", { label: "추진내용", variant: "zigzag", cells: [cell("1"), cell("2"), cell("3"), cell("4")] });
  // 1·4단계는 3줄씩, 2·3단계는 1줄씩 — 같은 줄끼리는 맞으므로 빈 칸 없음
  z.cells = [cell("1", fullLines(z, 3)), cell("2", fullLines(z, 1)), cell("3", fullLines(z, 1)), cell("4", fullLines(z, 3))];
  assert.deepEqual(hollowBoxes([z]), []);
});

test("빈 상자: fitNeeded 사유가 아니고(빈 칸만으로는 null) fitScore에는 칸 하나에 1점, 경고는 「칸 채우기:」 머리말·덜 찬 순 4곳 + 외 N칸", () => {
  const base: FitReport = { budget: 255, total: 255, rows: [], wrapped: [], ragged: [], sparse: [], bullets: 10 };
  const box = (where: string, used: number) => ({ where, used, most: 3, perLine: 20, add: 30 });
  const hollow = [box("가 1번째 칸", 1), box("나 2번째 칸", 0.5), box("다 1번째 칸", 2), box("라 1번째 칸", 1.5), box("마 2번째 칸", 0.2)];
  assert.equal(fitNeeded({ ...base, hollow }), null);
  assert.equal(fitScore({ ...base, hollow }) - fitScore(base), hollow.length);
  const w = hollowWarning(hollow)!;
  assert.match(w, /^칸 채우기: \[마 2번째 칸\] 0\.2\/3줄 · \[나 2번째 칸\] 0\.5\/3줄 · \[가 1번째 칸\] 1\/3줄 · \[라 1번째 칸\] 1\.5\/3줄 외 1칸 — /);
  assert.match(w, /근거에 있는 사실로 짧은 칸을 보강하고, 더 쓸 사실이 없으면 긴 칸을 줄여/);
  assert.equal(hollowWarning([]), null);
  assert.equal(hollowWarning(undefined), null);
});

test("fitVerdict: 판면 판정 하나 — 95% 미만 빔 · 95~102% 맞음 · 102~104% 조금 넘침 · 104% 초과 넘침(경계값)", () => {
  const level = (pct: number) => fitVerdict(pct).level;
  assert.equal(level(94.9), "under");
  assert.equal(level(95), "ok", "95%는 맞음(FIT_BAND.under 미만만 빔)");
  assert.equal(level(101), "ok");
  assert.equal(level(102), "ok", "102%는 맞음(FIT_BAND.over 초과만 넘침)");
  assert.equal(level(102.1), "slight");
  assert.equal(level(104), "slight", "104%는 조금 넘침(제출 확인 목록도 104% 초과만)");
  assert.equal(level(104.1), "over");
  assert.equal(level(130), "over");
  // 문턱은 상수 그대로(맞추기·판면 경고 FIT_BAND, 제출 확인 SUBMIT_OVER)
  assert.equal(level(FIT_BAND.under * 100), "ok");
  assert.equal(level(FIT_BAND.over * 100), "ok");
  assert.equal(level(SUBMIT_OVER * 100), "slight", "제출 확인 목록의 「판면 넘침」(fitPct > SUBMIT_OVER × 100)과 「넘침」이 같은 과제");
  assert.equal(SUBMIT_OVER_FROM_SUBMISSION, SUBMIT_OVER, "submission.ts가 같은 값을 다시 내보냄");
});

test("fitVerdict: 톤 — 맞음은 끝(중립), 빔·조금 넘침은 우리 차례(경고색 아님), 넘침만 경고 · 뜻 글", () => {
  assert.deepEqual([94.9, 95, 102, 102.1, 104, 104.1].map((p) => fitVerdict(p).tone), ["doing", "done", "done", "doing", "doing", "alert"]);
  assert.deepEqual([90, 100, 103, 110].map((p) => fitVerdict(p).label), ["분량 빔", "분량 맞음", "조금 넘침", "넘침"]);
  assert.match(fitVerdict(110).hint, /제출 전 확인/);
  assert.equal(FIT_RANGE_TEXT, "맞음 95~102% · 조금 넘침 ~104% · 넘침 104% 초과");
});
