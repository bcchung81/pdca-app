// 절 성과 재료 잇기(mg-outcomes.ts) 시험 — 재료 → 원장 줄 잇기 규칙과 순환 import 재발 방지(2026-10-29 개발 서버 「Cannot access … before initialization」).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CLOSE_LABEL, outcomeRefs } from "./mg-outcomes.ts";

const mat = (id: string, text: string, quote = "", kind = "figure") => ({ id, kind, text, quote });

test("재료 → 원장 줄: 글·구절이 줄을 담거나 8자 이상 조각이 줄 안에 들면 이음(띄어쓰기·괄호 무시), 짧은 조각·자료 필요는 안 이음", () => {
  const lines = ["수요 기반 신규 등록 31건(계획대비 3배)", "신규 등록(31건), 교육 과정(7건)(’26.8 기준)", "활용 중심으로 기준 전환"];
  const refs = outcomeRefs(
    [
      mat("m1", "수요 기반 신규 등록 31건(계획 대비 3배), 월별 실적 31건", "수요 기반 신규 등록 31건(계획대비 3배)"),
      mat("m2", "교육 과정 7건", "교육 과정(7건)"),
      mat("m3", "31건"),
      mat("m4", "정성: 활용 중심으로 기준을 전환", "활용 중심으로 기준 전환", "fact"),
      mat("m5", "수요 기반 신규 등록 31건(계획대비 3배)", "", "need"),
    ],
    lines,
  );
  assert.deepEqual(refs.get("m1"), [0]);
  assert.equal(refs.get("m2"), undefined, "「교육과정7건」은 8자 미만이라 줄 안 조각으로 안 셈");
  assert.equal(refs.get("m3"), undefined);
  assert.deepEqual(refs.get("m4"), [2]);
  assert.equal(refs.get("m5"), undefined, "자료 필요 재료는 안 이음");
  assert.equal(CLOSE_LABEL, "추진성과");
});

test("mg-outcomes.ts는 다른 모듈을 import하지 않음(잎 모듈 — mg-outline·mg-close가 함께 써도 고리가 안 생김)", () => {
  const src = readFileSync(new URL("./mg-outcomes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^\s*(import|export)\b[^\n]*\bfrom\s+["']/m);
});

test("고리 안 모듈을 새 프로세스에서 하나씩 첫 모듈로 불러도 초기화 오류가 없음", () => {
  for (const f of ["mg-outline.ts", "mg-close.ts", "mg-page-plan.ts", "business-layout.ts", "composition.ts", "mg-draft.ts"]) {
    const url = new URL(`./${f}`, import.meta.url).href;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(url)})`], { encoding: "utf8" });
    assert.equal(r.status, 0, `${f}: ${r.stderr.slice(0, 400)}`);
  }
});
