// 경평 초안 경고 등급(lib/reports/warning-levels.ts) 시험 — 앞머리 표가 경고를 만드는 코드와 같은지, 정렬, 기본 표시 개수.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { WARNING_HEADS, WARNING_SHOWN_MAX, gradeWarnings, warningHead, warningLevel, warningView } from "./warning-levels.ts";

const ROOT = resolve(import.meta.dirname, "../..");

/** 초안·구성안 경고를 만드는 파일(앞머리 대조 대상) */
const SOURCES = [
  "lib/reports/section.ts",
  "lib/reports/mg-draft.ts",
  "lib/reports/mg-outline.ts",
  "lib/reports/result-plan.ts",
  "lib/reports/composition.ts",
  "lib/reports/fit.ts",
  "lib/reports/blocks.ts",
  "lib/reports/split-axes.ts",
  "lib/reports/diagram-hints.ts",
  "lib/reports/actuals.ts",
  "app/(app)/reports/cards/draft-write.ts",
];

/** 코드에 「머리: 」로 시작하는 글이 있지만 경고 앞머리가 아닌 것 — 다른 글의 일부(프롬프트 표 머리·올해 실적 아래 중첩 문구·지표 이름 등) */
const NOT_A_HEAD = new Set(["hub 참여 기관 2곳", "핵심 수치 띠", "계획·카드에 기관이 이름 붙인 전략(예"]);

/** 소스에서 「"머리: …」·「`머리: …」로 시작하는 문자열 리터럴의 머리를 모음 */
function headsInCode(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const f of SOURCES) {
    const text = readFileSync(join(ROOT, f), "utf8");
    for (const m of text.matchAll(/[`"]([가-힣A-Za-z][^`"$:\n]{0,22}):\s/g)) found.set(m[1], [...(found.get(m[1]) ?? []), f]);
  }
  return found;
}

test("앞머리 표: 경고를 만드는 코드의 모든 앞머리가 표에 있다(새 앞머리를 더하면 등급을 정해야 함)", () => {
  const missing = [...headsInCode()].filter(([h]) => !NOT_A_HEAD.has(h) && !(h in WARNING_HEADS)).map(([h, fs]) => `${h} (${[...new Set(fs)].join(", ")})`);
  assert.deepEqual(missing, [], `warning-levels.ts WARNING_HEADS에 등급을 더하세요`);
});

test("앞머리 표: 코드에 없는 낡은 앞머리가 표에 남아 있지 않다(블록 정리 줄 머리 quotes·voices·case·define 제외)", () => {
  const inCode = headsInCode();
  const stale = Object.keys(WARNING_HEADS).filter((h) => !inCode.has(h) && !["quotes", "voices", "case", "define"].includes(h));
  assert.deepEqual(stale, []);
});

test("등급: 사실·판면 문제는 block", () => {
  const block = [
    "카드·근거 자료에 없는 숫자 5개 — 원자료로 확인하거나 지워 주세요: 0.218, 897",
    "카드에 없는 숫자 1개 — 원자료로 확인하거나 지워 주세요: 154",
    "전년 인용: 「…」는 2025 보고서 글 — 올해 근거로 바꾸거나 빼 주세요",
    "올해 실적: 핵심 수치 띠에 올해(’26년) 실적 칸이 없습니다(13개 전년 이전)",
    "올해 실적: 추진성과에 올해(’26년) 실적이 없습니다",
    "판면: 어림 300mm로 1쪽(255mm)보다 45mm 넘칩니다 — 칸 글·블록을 줄여 주세요.",
    "분량: 어림 400mm(약 1.6쪽) — 배정 1쪽(작성분량 기준) 대비 +57% — 블록·칸 글을 줄이거나 구성안에서 블록을 빼 주세요.",
    "구성안: 승인한 절 3개 중 1개(가. 제목)를 쓰지 않았습니다 — 다시 만들거나 구성안을 고쳐 주세요.",
    "첨부: AI가 읽지 못해 빼고 썼습니다 — a.pdf",
    "빈 칸: [성과지표] 표의 「’25년」 1칸이 비었습니다",
    "실적 칸: 「’26.11월 시범 예정」 — 계획(「예정」)이 실적 칸에 있음 — 올해 한 일·결과로 바꾸거나 계획은 추진내용으로",
    "추진성과 상자가 비었습니다.",
    "카드 밖 부분 2쪽 넘침 — 어림 4쪽(앞 2 + 뒤 2)이 2025 3쪽보다 김",
    "지표 전체 12쪽이 작성분량 10쪽(±1쪽)보다 많음",
    "카드 밖 부분을 불러오지 못해 본문만 조판했습니다 — 오류",
  ];
  for (const w of block) assert.equal(warningLevel(w), "block", w);
});

test("등급: 문장·표현·짜임·칸 채우기 등은 info", () => {
  const info = [
    "문장: 한 칸에 서로 다른 항목을 나열한 글 1개",
    "문체: ‘~함·~됨·~음·~임·~다’로 끝난 문장 1개",
    "칸 채우기: [추진내용 왼쪽 패널] 4.2/7줄 — 나란한 칸보다 줄이 적어",
    "추진성과: 블록에 쓴 수치를 되풀이(794·529) — 추진성과는 기준 대비 결과나 블록에 없는 성과로",
    "추진성과 막대: 값이 있는 막대가 2개보다 적어 뺐습니다.",
    "그림: 기존→개선 옆 글 폭이 모자라 그림 2개를 작게(S) 줄였습니다.",
    "그림 자리: 초안에 그림 자리가 없습니다",
    "도식: 이 과제만의 요소가 없습니다",
    "짜임: 시각 블록 3개의 모양이 1가지뿐입니다",
    "절: 평가내용 1 · 대주제 3 · 마. 제목의 마지막 블록이 라벨 「추진성과」가 아닙니다",
    "구성안: 승인한 짜임 8블록 중 6블록만 같은 순서로 썼습니다",
    "근거 약함: 근거 글과 겹치는 말이 적은 문장 1개",
    "판면: 어림 226mm로 1쪽(255mm)에 29mm가 빕니다.",
    "분량: 어림 277mm(약 1.1쪽) — 배정 3쪽(작성분량 기준) 대비 -64% — 근거가 있으면 블록·칸을 보태 주세요.",
    "올해 실적: 자리표시가 6개입니다 — 평가 논점에 꼭 필요한 수치 4개까지만 남깁니다.",
    "사람이 고친 블록 1개(2번) — 다시 만들면 사라집니다(수정 이력에는 남음).",
    "case(추진배경): 근거 원문(evidence)을 찾지 못해 뺐습니다",
    "quotes: 근거 원문에서 찾지 못한 인용 1개를 뺐습니다",
    "글 한도: [stats] 가장 긴 칸이 2줄 → 칸마다 1줄 이하(한 줄 약 15자)로",
    "도식 블록이 2개보다 적습니다 — 2025 최종본은 1쪽에 5~8개입니다.",
    "자동 고치기: 시간이 모자라 자동 고치기를 하지 않았습니다",
    "갈래: 갈래 축이 없어 칩 [가]을(를) 뺐습니다.",
    "지표 전체 8쪽이 작성분량 10쪽(±1쪽)보다 적음",
    "비어 있는 칸 3개 — 채우면 카드 밖 부분 높이가 늘어남",
    "3쪽이 20%만 참 — 「과제」이 앞 쪽을 약 5mm(약 1줄) 넘쳐 쪽이 하나 늘어남",
  ];
  for (const w of info) assert.equal(warningLevel(w), "info", w);
});

test("등급: 모르는 앞머리·앞머리 없는 글은 info", () => {
  assert.equal(warningLevel("새로 생긴 점검: 어떤 글"), "info");
  assert.equal(warningLevel("앞머리 없는 글"), "info");
  assert.equal(warningLevel(""), "info");
});

test("앞머리: 콜론 앞 24자까지, 없으면 빈 글", () => {
  assert.equal(warningHead("문장: 글"), "문장");
  assert.equal(warningHead("case(추진배경): 글"), "case(추진배경)");
  assert.equal(warningHead("앞머리가 없이 길게 이어지는 설명 글이라서 스물네 글자를 넘는다: 뒤"), "");
  assert.equal(warningHead("사람이 고친 블록 1개(2번)"), "");
});

test("정렬: block 먼저, 같은 등급 안은 원래 순서", () => {
  const list = ["문장: a", "판면: 어림 300mm로 1쪽(255mm)보다 45mm 넘칩니다", "문체: b", "첨부: c", "그림: d"];
  assert.deepEqual(
    gradeWarnings(list).map((w) => w.text.slice(0, 2)),
    ["판면", "첨부", "문장", "문체", "그림"],
  );
  assert.deepEqual(
    gradeWarnings(list).map((w) => w.level),
    ["block", "block", "info", "info", "info"],
  );
});

const blocks = (n: number) => Array.from({ length: n }, (_, i) => `첨부: 막힘 ${i}`);
const infos = (n: number) => Array.from({ length: n }, (_, i) => `문장: 참고 ${i}`);

test("기본 표시: 막힘 전부 + 참고는 합쳐 3개까지(막힘이 3개 넘으면 막힘만)", () => {
  assert.equal(WARNING_SHOWN_MAX, 3);
  const cases: Array<[number, number, number, number]> = [
    // block, info, 보임, 접힘
    [0, 0, 0, 0],
    [0, 4, 3, 1],
    [2, 0, 2, 0],
    [2, 4, 3, 3],
    [3, 4, 3, 4],
    [5, 0, 5, 0],
    [5, 4, 5, 4],
  ];
  for (const [b, i, shown, folded] of cases) {
    const v = warningView([...infos(i), ...blocks(b)]);
    assert.equal(v.shown.length, shown, `block ${b} info ${i} 보임`);
    assert.equal(v.folded.length, folded, `block ${b} info ${i} 접힘`);
    assert.equal(v.blockCount, b);
    assert.equal(v.infoCount, i);
    assert.ok(v.folded.every((w) => w.level === "info"), "접히는 것은 참고뿐");
    assert.ok(v.shown.slice(0, b).every((w) => w.level === "block"), "보이는 것은 막힘이 먼저");
  }
});

test("기본 표시: 접힌 참고도 원래 순서를 지킨다", () => {
  const v = warningView(["문장: 1", "문장: 2", "문장: 3", "문장: 4", "문장: 5"]);
  assert.deepEqual(v.shown.map((w) => w.text), ["문장: 1", "문장: 2", "문장: 3"]);
  assert.deepEqual(v.folded.map((w) => w.text), ["문장: 4", "문장: 5"]);
});
