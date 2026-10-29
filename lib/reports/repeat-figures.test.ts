// 같은 수치 반복 경고(lib/reports/repeat-figures.ts, 2026-10-27) 시험 — 수치 열쇠 정규화, 주요사업 블록 3개 규칙, 경영관리 절 2개 규칙, 흔한 값 제외.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { figureKeys, figureRepeatWarning, figureSpans, repeatMarks, repeatedFigures, repeatedSentences, sentenceRepeatWarning } from "./repeat-figures.ts";
import type { ReportSectionSpec } from "./section.ts";
import { warningLevel } from "./warning-levels.ts";

const blk = (items: string[], b: Partial<Block> = {}): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items, cells: [], rows: [], series: [], badge: "", ...b });
const spec = (over: Partial<ReportSectionSpec> = {}): ReportSectionSpec => ({
  version: 3,
  card: { id: "주요사업9/9-가", taskNo: "9-가", title: "t" },
  business: { no: 9, name: "사업" },
  task: { no: "9-1", title: "t", bp: false },
  sub: { mark: "가", title: "t", markers: [] },
  rows: [],
  results: [],
  caption: "",
  module: 1,
  ...over,
});

test("수치 열쇠: 쉼표·빈칸을 걷어 값+단위로, 날짜·시점·자리표시 안·단위 없는 숫자는 뺌, 화살표 앞 맨 숫자는 뒤 단위를 받음", () => {
  assert.deepEqual([...figureKeys("시설 1,922곳 관리, 1922 곳 재확인")], [["1922곳", "1,922곳"]]);
  assert.deepEqual([...figureKeys("협력회의(7.6.) ’26.8 기준 2026년 3단계 【확인: 450건】")].length, 0);
  assert.deepEqual([...figureKeys("포상 12 → 22명 확대")].map(([k]) => k), ["12명", "22명"]);
  assert.deepEqual([...figureKeys("예측 오차 0.7%･1.8%, ^{’25년}99.7%")].map(([k]) => k), ["0.7%", "1.8%", "99.7%"]);
  assert.deepEqual([...figureKeys("예산 42백만원(17%) 증액")].map(([k]) => k), ["42백만원", "17%"]);
});

test("흔한 값: 0·100%·한 자리 개수는 세지 않음(%·점·배·억은 한 자리도 셈)", () => {
  assert.deepEqual([...figureKeys("중대재해 0건, 준수율 100%, 3개 분야 7건, 5대 역할")], []);
  assert.deepEqual([...figureKeys("오차 2%, 만족도 4점, 3배")].map(([k]) => k), ["2%", "4점", "3배"]);
});

test("주요사업: 같은 수치가 서로 다른 블록 3개 이상(추진성과 상자도 한 블록)이면 참고 경고, 2개까지는 없음", () => {
  const three = spec({ blocks: [blk(["취약시설 **1,922곳** 관리"]), blk(["1,922곳 안전관리(’26.8월말)"])], results: ["우선 측정으로 1,922곳 관리"] });
  const w = figureRepeatWarning(three);
  assert.ok(w?.startsWith("반복 수치: 1,922곳(블록 3개)"), String(w));
  assert.equal(warningLevel(w!), "info");
  assert.equal(figureRepeatWarning(spec({ blocks: [blk(["1,922곳"]), blk(["1,922곳"])] })), null, "2개는 경고 없음");
  assert.equal(figureRepeatWarning(spec({ blocks: [blk(["1,922곳 · 1,922곳 · 1,922곳"])] })), null, "한 블록 안 여러 번은 1로 셈");
  assert.equal(figureRepeatWarning(spec({ blocks: [blk(["무재해 0건"]), blk(["0건 유지"]), blk(["사고 0건"])] })), null, "흔한 값");
});

test("경영관리: 블록 3개 이상이거나 서로 다른 절 2개 이상이면 경고, 한 절 안 블록 2개는 없음", () => {
  const mg = (at: string[], blocks: Block[]) => spec({ blocks, mg: { indicator: "지표", parts: [], at } });
  const cross = figureRepeatWarning(mg(["1.3.가", "1.3.나"], [blk(["포상 12명→22명 확대"]), blk(["포상 12 → 22명"])]));
  assert.ok(cross?.startsWith("반복 수치: 12명(블록 2개·절 2개)·22명(블록 2개·절 2개)"), String(cross));
  assert.equal(figureRepeatWarning(mg(["1.3.가", "1.3.가"], [blk(["87% → 89%"]), blk(["인식도 89%"])])), null);
  assert.ok(figureRepeatWarning(mg(["1.3.가", "1.3.가", "1.3.가"], [blk(["31명"]), blk(["31명"]), blk(["31명"])]))?.includes("31명(블록 3개·절 1개)"));
});

test("repeatedFigures: 블록 수 많은 순, 4개 넘으면 경고에 「외 N개」", () => {
  const units = [["10곳 20곳 30곳 40곳 50곳"], ["10곳 20곳 30곳 40곳 50곳"], ["10곳 20곳 30곳 40곳 50곳 10곳"], ["10곳"]].map((texts, i) => ({ group: `b${i}`, texts }));
  assert.deepEqual(repeatedFigures(units)[0], ["10곳", 4, 4]);
  assert.match(figureRepeatWarning(spec({ blocks: units.map((u) => blk(u.texts)) }))!, / 외 1개 — /);
});

// ───────────────────────── 화면 표시(2026-10-29 「되풀이되는 구간 하이라이트」)

test("figureSpans: 원래 글의 수치 자리·열쇠 — 강조 안·위첨자 뒤·화살표 앞 맨 숫자, 자리표시 안·날짜·흔한 값·표기를 사이에 낀 수치는 자리 없음", () => {
  const at = (t: string) => figureSpans(t).map((x) => [t.slice(x.start, x.end), x.key]);
  assert.deepEqual(at("취약시설 **1,922곳** 관리"), [["1,922곳", "1922곳"]]);
  assert.deepEqual(at("^{’25년}99.7% 달성"), [["99.7%", "99.7%"]]);
  assert.deepEqual(at("포상 12 → 22명"), [["12", "12명"], ["22명", "22명"]]);
  assert.deepEqual(at("【확인: 450건】 (7.6.) ’26.8 무재해 0건 100% 3명"), []);
  assert.deepEqual(at("**12**명"), [], "표기를 사이에 끼면 감싸지 않음");
  // figureKeys와 같은 열쇠
  const t = "시설 **1,922곳** · 포상 12 → 22명 · ^{’25년}99.7%";
  assert.deepEqual(figureSpans(t).map((x) => x.key).sort(), [...figureKeys(t).keys()].sort());
});

test("repeatMarks.figures: 경고와 같은 기준(주요사업 블록 3개·경영관리 절 2개)의 열쇠 → 블록 수", () => {
  const three = spec({ blocks: [blk(["**1,922곳** 관리"]), blk(["1,922곳 점검"])], results: ["1,922곳 관리"] });
  assert.deepEqual([...repeatMarks(three).figures], [["1922곳", 3]]);
  assert.equal(repeatMarks(spec({ blocks: [blk(["1,922곳"]), blk(["1,922곳"])] })).figures.size, 0);
  const mg = spec({ blocks: [blk(["포상 22명"]), blk(["포상 22명 확대"])], mg: { indicator: "지표", parts: [], at: ["1.3.가", "1.3.나"] } });
  assert.deepEqual([...repeatMarks(mg).figures], [["22명", 2]]);
});

test("반복 문장: 서로 다른 블록(추진성과 상자 포함)의 거의 같은 문장 쌍만 — 같은 블록 안·짧은 라벨·자리표시만 같은 줄은 아님, 참고 경고", () => {
  const long = "지역 방송사 협업으로 재난방송 송출 체계를 고도화";
  const s1 = spec({
    blocks: [blk([long, "협업 강화"], { label: "추진내용" }), blk([`${long}함`, "협업 강화"], { label: "추진실적" }), blk([long, long], { label: "개선" })],
    results: [`${long} 완료`, "재난방송 송출 성과를 전국 단위로 확산하여 정례화"],
  });
  const pairs = repeatedSentences(s1);
  assert.ok(pairs.every((p) => p.a.at !== p.b.at), "같은 블록 쌍 없음");
  assert.ok(pairs.every((p) => p.a.text !== "협업 강화"), "짧은 글은 셈하지 않음");
  assert.deepEqual(new Set(pairs.flatMap((p) => [p.a.name, p.b.name])), new Set(["추진내용", "추진실적", "개선", "추진성과"]));
  assert.equal(pairs.length, 6, "네 곳의 같은 문장 — 쌍 6개, 같은 블록 안 두 번은 한 번으로");
  const marks = repeatMarks(s1).sentences;
  assert.deepEqual(marks.get(long)?.get(0), ["추진실적", "개선", "추진성과"]);
  assert.deepEqual(marks.get(long)?.get(2), ["추진내용", "추진실적", "추진성과"]);
  assert.deepEqual(new Set(marks.get(`${long} 완료`)?.get(-1)), new Set(["추진내용", "추진실적", "개선"]), "추진성과 상자 = -1");
  const w = sentenceRepeatWarning(s1);
  assert.ok(w?.startsWith("반복 문장: 「지역 방송사 협업으로 재난방송 송출 체계를…」("), String(w));
  assert.match(w!, / 외 3쌍 — /);
  assert.equal(warningLevel(w!), "info");
  assert.equal(sentenceRepeatWarning(spec({ blocks: [blk(["【확인: ’26년 교육 운영 실적 건수】"]), blk(["【확인: ’26년 교육 운영 실적 건수】"])] })), null, "자리표시만 같은 줄");
  assert.equal(sentenceRepeatWarning(spec({ blocks: [blk([long])] })), null);
});

test("경영관리 반복 문장 이름에 절 표지(「나. 추진내용」)", () => {
  const long = "노사 공동 TF를 구성하여 인사제도 개선안을 마련";
  const part = (key: string, mark: string) => ({ key, evalNo: 1, evalTitle: "", themeNo: 1, themeTitle: "", mark, title: "", story: "" as const });
  const mg = spec({ blocks: [blk([long], { label: "추진내용" }), blk([long], { label: "추진내용" })], mg: { indicator: "지표", parts: [part("1.1.가", "가"), part("1.1.나", "나")], at: ["1.1.가", "1.1.나"] } as ReportSectionSpec["mg"] });
  assert.deepEqual(repeatMarks(mg).sentences.get(long)?.get(0), ["나. 추진내용"]);
});

test("same-text.ts는 잎 모듈(import 없음 — repeat-figures → business-layout → … → section 고리 막기)", async () => {
  const { readFileSync } = await import("node:fs");
  assert.doesNotMatch(readFileSync(new URL("./same-text.ts", import.meta.url), "utf8"), /^import /m);
});
