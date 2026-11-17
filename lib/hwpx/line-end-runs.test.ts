// 개조식 한글 변환 앞의 줄 끝 금칙 글자 연속 끊기(kordoc-input.ts breakLineEndRuns): 보통 글은 같은 문자열, 긴 연속만 보이지 않는 표식으로 끊고
// 보이는 글자는 그대로 — 변환(draftToKcaHwpx) 처리 시간이 글 길이에 비례하는지 넉넉한 시간 안에서 확인합니다.

import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { draftToKcaHwpx } from "./generate.ts";
import { LINE_END_RUN_MAX, breakLineEndRuns } from "./kordoc-input.ts";

const JOINER = "\u2060";
const BANNED = [..."$([{£¥〈《「『【〔₩"];

test("줄 끝 금칙 글자 연속 끊기: 보통 글·짧은 연속은 같은 문자열, 긴 연속은 정해진 자수마다 표식 — 표식을 빼면 원래 글", () => {
  for (const s of ["", "정부는 공공데이터를 개방(연 3만 건)", "「(가)」 [참고] {값} $5 ₩1,000 £ ¥ 〈《【〔", "(".repeat(LINE_END_RUN_MAX) + "가"])
    assert.equal(breakLineEndRuns(s), s);
  const long = "가" + "(".repeat(LINE_END_RUN_MAX * 2 + 3) + "나";
  const out = breakLineEndRuns(long);
  assert.equal(out, "가" + "(".repeat(LINE_END_RUN_MAX) + JOINER + "(".repeat(LINE_END_RUN_MAX) + JOINER + "(((" + "나");
  assert.equal(out.replaceAll(JOINER, ""), long);
  // 금칙 글자끼리는 종류가 달라도 한 연속, 줄바꿈·다른 글자는 연속을 끊음
  const mixed = BANNED.join("");
  assert.equal(breakLineEndRuns(mixed).split(JOINER).map((x) => x.length).join(","), `${LINE_END_RUN_MAX},${mixed.length - LINE_END_RUN_MAX}`);
  assert.equal(breakLineEndRuns(`${"(".repeat(LINE_END_RUN_MAX)}\n${"(".repeat(LINE_END_RUN_MAX)}`).includes(JOINER), false);
});

test("개조식 한글 변환 처리 시간: 줄 끝 금칙 글자가 길게 이어진 칸이 여럿이어도 2초 안, 보이는 글자는 그대로", async () => {
  // 부호 줄만(부호 없는 줄 머리의 $$는 kordoc이 수식 표지로 걷음 — 고치기 전과 같음)
  const lines = Array.from({ length: 40 }, (_, i) => `${["ㅇ ", "- ", "※ "][i % 3]}${BANNED[i % BANNED.length].repeat(600)}`);
  const t0 = performance.now();
  const { bytes } = await draftToKcaHwpx(`처리 시간 점검\n${lines.join("\n")}\n`);
  const ms = performance.now() - t0;
  assert.ok(ms < 2000, `${ms.toFixed(0)}ms`);
  const section = await (await JSZip.loadAsync(bytes)).file("Contents/section0.xml")!.async("string");
  const text = [...section.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => m[1].replace(/<[^>]+>/g, "")).join("");
  for (const ch of BANNED) {
    const want = lines.filter((l) => l.endsWith(ch.repeat(600))).length * 600;
    assert.equal([...text].filter((c) => c === ch).length, want, ch);
  }
});
