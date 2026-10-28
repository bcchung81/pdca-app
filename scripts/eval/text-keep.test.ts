// 글 보존 점검(text-keep.ts) 시험 — 합성 스냅숏만(기관 원문·실명 없음).
// 지키는 것: 담는 상자(inline·contents가 아닌 가장 가까운 조상)마다 세로 가운데가 같은 조각을 한 줄로(왼쪽부터) · 글이 든 안쪽 담는 상자(딱지)와
// 글 있는 의사요소 자리에서 끊음 · 글 없는 안쪽 상자(빈칸 자리)에서는 끊지 않음 · 공백만인 줄 뺌 ·
// 비교는 공백을 지우고 한 문단 안에서만(두 문단으로 갈라지면 빠진 줄) · 표 칸 안 문단까지 다시 읽음
import assert from "node:assert/strict";
import test from "node:test";
import type { HwpDoc } from "../../lib/hwp/model.ts";
import type { LayoutSnapshot, SnapBox, SnapNode, SnapPseudo, SnapStyle, SnapText } from "../../lib/reports/dom-hwpx/snapshot.ts";
import { hwpParaTexts, missingLines, screenLines } from "./text-keep.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const st = (display: string) => ({ display }) as SnapStyle;
const box = (display: string, children: SnapNode[], extra: Partial<SnapBox> = {}): SnapBox => ({ kind: "box", tag: "span", rect: { x: 0, y: 0, w: 10, h: 4 }, style: st(display), children, ...extra });
/** 글 마디: 조각마다 [글 시작, x, y] — 높이 4, 폭 5 */
const text = (t: string, frags: [number, number, number][]): SnapText => ({ kind: "text", text: t, frags: frags.map(([at, x, y]) => ({ at, x, y, w: 5, h: 4 })) });
const snap = (children: SnapNode[]): LayoutSnapshot => ({ version: 1, frame: { w: 170, h: 100 }, root: box("block", children) });
const pseudo = (t: string): SnapPseudo => ({ text: t, style: st("inline"), rect: null });

test("화면 글 줄: 담는 상자마다 같은 높이 조각을 왼쪽부터 이음 · 감긴 줄은 따로 · 다른 담는 상자는 따로 · 공백만인 줄은 뺌", () => {
  const p = box("block", [box("inline", [text("둘째 줄 끝", [[0, 0, 10], [4, 40, 10]])]), text("첫 ", [[0, 0, 5]]), text("글", [[0, 10, 5]])]);
  const other = box("block", [text("다른 상자", [[0, 0, 20]]), text("   ", [[0, 0, 30]])]);
  const lines = screenLines(snap([p, other]));
  assert.deepEqual(
    lines.map((l) => l.text),
    ["첫 글", "둘째 줄 끝", "다른 상자"],
  );
});

test("화면 글 줄: 글이 든 안쪽 담는 상자(딱지)·글 있는 의사요소 자리에서 끊음 · 글 없는 안쪽 상자는 끊지 않음", () => {
  const line = box("block", [
    text("앞 글", [[0, 0, 5]]),
    box("inline-block", [text("딱지", [[0, 20, 5]])]),
    text("뒤 글", [[0, 30, 5]]),
    box("inline-block", []), // 빈칸 자리
    text("이어짐", [[0, 40, 5]]),
    box("inline", [text("표지 뒤", [[0, 60, 5]])], { before: pseudo("확인 ") }),
  ]);
  assert.deepEqual(
    screenLines(snap([line])).map((l) => l.text),
    ["앞 글", "딱지", "뒤 글이어짐", "표지 뒤"],
  );
});

test("빠진 줄: 공백을 지우고 한 문단 안에서만 찾음 — 두 문단으로 갈라지면 빠짐 · 표 칸 안 문단까지 다시 읽음", () => {
  const para = (t: string, items: any[] = []) => ({ items: [{ kind: "text", text: t }, ...items] }) as any;
  const table = { kind: "table", cells: [{ paras: [para("칸 안 글")] }] };
  const doc = { sections: [{ paras: [para("소통하고 혁신하는"), para("정부"), para("", [{ kind: "obj", obj: table }]), para("붙은글")] }] } as unknown as HwpDoc;
  const paras = hwpParaTexts(doc);
  assert.ok(paras.includes("칸 안 글"));
  const lines = ["소통하고 혁신하는 정부", "칸 안 글", "붙은 글", "혁신하는"].map((t) => ({ text: t, x: 0, y: 0 }));
  assert.deepEqual(
    missingLines(lines, paras).map((l) => l.text),
    ["소통하고 혁신하는 정부"],
  );
});
