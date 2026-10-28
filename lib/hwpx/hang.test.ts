// 계층부호 문단 내어쓰기 점검(lib/hwpx/hang.ts) 시험 — 합성 모델만.
// 지키는 것: 부호 + 빈칸 + 글로 시작하는 문단만 부호 문단(부호만·빈칸 없음·글 안 부호는 아님, 앞 빈칸·탭·전각 빈칸·글자 겹침 글머리는 셈) ·
// 글머리표(heading BULLET) 문단은 글이 무엇이든 셈 · 내어쓰기(음수 intent)가 없으면 flat · 표 칸·글상자 안까지 셈

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Cell, Inline, Obj, Para, ParaPr } from "../hwp/model.ts";
import { hangCheck, markerLead } from "./hang.ts";

test("markerLead: 부호 + 빈칸(탭·전각 빈칸) + 글이면 앞머리 글자 수 · 아니면 0", () => {
  assert.equal(markerLead("□ 추진배경"), 2);
  assert.equal(markerLead("  - 대시 문단"), 4);
  assert.equal(markerLead("ㅇ\t탭 뒤 글"), 2);
  assert.equal(markerLead("∙　전각 빈칸"), 2);
  assert.equal(markerLead("※  두 칸"), 3);
  for (const s of ["-", "□ ", "-3% 감소", "※참고", "가. 제목", "글 안 □ 부호", "▶"]) assert.equal(markerLead(s), 0, s);
});

const pp = (indent: number, headingType: ParaPr["headingType"] = "NONE") => ({ indent, headingType }) as ParaPr;
const para = (paraPr: number, items: Inline[]): Para => ({ paraPr, style: 0, items, lines: [], length: 1, pageBreak: false });
const t = (text: string): Inline => ({ kind: "text", pos: 0, charPr: 0, text });

test("hangCheck: 부호·글머리표 문단 중 내어쓰기 없는 것 — 표 칸·글상자 안까지, 글자 겹침 글머리(∙ + 전각 빈칸)도 부호", () => {
  const paraPrs = [pp(0), pp(-1000), pp(0, "BULLET"), pp(-900, "BULLET")];
  // 점검이 보는 칸만 채운 합성 개체(표 칸 문단·글상자 문단)
  const cell = (ps: Para[]) => ({ paras: ps }) as unknown as Cell;
  const table: Inline = { kind: "obj", pos: 0, charPr: 0, obj: { kind: "table", cells: [cell([para(0, [t("ㅇ 칸 안 부호 문단")]), para(1, [t("- 칸 안 내어 씀")])])] } as unknown as Obj };
  const shape: Inline = { kind: "obj", pos: 0, charPr: 0, obj: { kind: "rect", text: { paras: [para(0, [t("※ 글상자 안")])] } } as unknown as Obj };
  const compose: Inline = { kind: "compose", pos: 0, charPr: 0, chars: "∙　", border: 0, size: 0, spread: 0, charPrs: [] };
  const paras = [
    para(0, [t("□ 내어쓰기 없음")]),
    para(1, [t("□ 내어 씀")]),
    para(2, [t("글머리표 문단 — 내어쓰기 없음")]),
    para(3, [t("글머리표 문단 — 내어 씀")]),
    para(0, [compose, t("겹친 글머리")]),
    para(0, [t("부호 없는 글")]),
    para(0, [table, shape]),
  ];
  const r = hangCheck({ doc: { paraPrs }, paras });
  assert.equal(r.marked, 8);
  assert.equal(r.flat, 5);
  assert.deepEqual(r.samples, ["□ 내어쓰기 없음", "글머리표 문단 — 내어쓰기 없음", "∙　겹친 글머리", "ㅇ 칸 안 부호 문단", "※ 글상자 안"]);
});
