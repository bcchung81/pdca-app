// 핵심공통항목 파서 시험 — 합성 자료(실제 기관 값 아님)와, 원본 xlsx가 이 컴퓨터에 있을 때만 도는 실제 파일 시험.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { blocksToChunks, parse } from "kordoc";
import { cellText } from "../normalize.ts";
import type { SourceBlock } from "../source.ts";
import { loadKordocChunks } from "../source.ts";
import { parsePipeTable } from "../table.ts";
import { CORE_ITEMS_EXPECTED, parseCoreItems, sectionCode } from "./core-items.ts";

const HEAD = ["", "구분", "2024년도 실적", "2025년도 실적", "경영실적보고서 <br>해당 페이지", "작성시 참고사항", "비고1<br>(단위)", "비고2"];
const row = (...c: string[]) => `| ${["", ...c, ...Array(Math.max(0, 7 - c.length)).fill("")].join(" | ")} |`;
const table = (lines: string[]) => [`| | 기관명: 가상기관 | | | | | | |`, "| --- | --- | --- | --- | --- | --- | --- | --- |", `| ${HEAD.join(" | ")} |`, ...lines].join("\n");
const block = (text: string): SourceBlock => ({ id: "t", type: "table", text, page: 2, breadcrumb: [] });

const SAMPLE = [
  block(
    table([
      row("일반 현황 (2026년 3월 1일 기준)"),
      row("정규직 인원(명) / 일반직(명) / 무기계약직(명)", "525 / 332 / 193", "518 / 323 / 195", "p.9", "", "명"),
      row("1-(1) 전략기획"),
      row("대외기관 평가"),
      row("정보공개 종합평가 결과", "보통", "보통", "p.10"),
      row("기업성장센터 유무(O/X) / 운영실적 건수", "O / 4", "O / 8", "p11, p.12", "", "건"),
      row("4-(1)(나)일.가정 양립"),
      row("육아휴직 사용률", "10.5", "11.0", "", "", "%"),
      row("정책가점 (1) 안전한 일터 조성"),
      row("안전 관리 활동"),
      row("중대재해 건수", "0", "0", "", "", "건"),
      "",
      row("\\* 각종 예산금액은 최종변경 예산 기준"),
    ]),
  ),
  { ...block("<table><tr><td>안내문</td></tr></table>"), page: 1 },
];

test("합성: 섹션 경계·단위·복합 값 그대로 보존", () => {
  const r = parseCoreItems([SAMPLE[1], SAMPLE[0]]);
  assert.deepEqual(
    r.chunks.map((c) => [c.chunk_key, c.business, c.unit_type, c.track]),
    [
      ["core25-mg/general", null, "core_item", "경영관리"],
      ["core25-mg/1-1", "MG-1", "core_item", "경영관리"],
      ["core25-mg/4-1b", "MG-9", "core_item", "경영관리"],
      ["core25-mg/bonus-1", "MG-12", "core_item", "경영관리"],
    ],
  );
  const text = (k: string) => r.chunks.find((c) => c.chunk_key === `core25-mg/${k}`)!.text;
  assert.match(text("1-1"), /\| 기업성장센터 유무\(O\/X\) \/ 운영실적 건수 \| O \/ 4 \| O \/ 8 \| p11, p\.12 \| {2}\| 건 \|/);
  assert.match(text("general"), /525 \/ 332 \/ 193 \| 518 \/ 323 \/ 195 \| p\.9/);
  assert.match(text("1-1"), /\[대외기관 평가\]/);
  assert.equal(r.chunks[0].meta.role, "cross_check");
  assert.equal(r.chunks[1].meta.sheet_note, "각종 예산금액은 최종변경 예산 기준");
  assert.equal(r.chunks[1].meta.rows, 2);
  // 합성 자료는 기대값과 달라 건수 검산은 실패 — 단위 사전 이름이 풀린 것만 확인
  assert.equal(r.checks.find((c) => c.name.includes("지표 사전"))!.ok, false);
});

test("섹션 코드: 지표·가·나·가점·일반 현황", () => {
  assert.equal(sectionCode("1-(1) 전략기획"), "1-1");
  assert.equal(sectionCode("4-(1)(가)조직 및 인적자원관리"), "4-1a");
  assert.equal(sectionCode("4-(1)(나)일.가정 양립"), "4-1b");
  assert.equal(sectionCode("정책가점 (3) 국정과제 등 핵심정책 이행"), "bonus-3");
  assert.equal(sectionCode("일반 현황 (2026년 3월 1일 기준)"), "general");
  assert.equal(sectionCode("대외기관 평가"), null);
});

test("사전에 없는 섹션 이름이면 검산이 실패로 알림", () => {
  const r = parseCoreItems([block(table([row("9-(9) 가상지표"), row("항목", "1", "2")]))]);
  const c = r.checks.find((x) => x.name.includes("지표 사전"))!;
  assert.equal(c.ok, false);
  assert.deepEqual((c.actual as Record<string, string[]>)["사전에 없는 이름"], ["9-(9) 가상지표"]);
});

test("양식 표가 없으면 던짐", () => {
  assert.throws(() => parseCoreItems([SAMPLE[1]]), /양식 표/);
});

const REAL = join(import.meta.dirname, "../../../data/guides/261002/core-items-mg-25.xlsx");

test("실제 파일: 검산 통과·재실행 동일·값 칸이 원문 그대로", { skip: !existsSync(REAL) && "원본 xlsx가 없음" }, async () => {
  const res = await parse(readFileSync(REAL), { images: false });
  assert.ok(res.success);
  const blocks = loadKordocChunks(JSON.parse(JSON.stringify(blocksToChunks(res.blocks))));
  const a = parseCoreItems(blocks);
  assert.deepEqual(a.checks.filter((c) => !c.ok), []);
  assert.deepEqual(parseCoreItems(blocks), a);
  assert.equal(a.chunks.length, CORE_ITEMS_EXPECTED.sections);
  // 원문 표의 모든 값 칸이 조각 글에 그대로 있음(복합 값 `O / 4` 포함)
  const table = blocks.find((b) => b.text.trimStart().startsWith("|") && /\|\s*구분\s*\|/.test(b.text.slice(0, 1500)))!;
  const all = a.chunks.map((c) => c.text).join("\n");
  const lines = new Set(all.split("\n"));
  const dataRows = parsePipeTable(table.text).rows.slice(3).filter((r) => r.slice(2).some((v) => v) && !r[1].startsWith("*"));
  assert.equal(dataRows.length, CORE_ITEMS_EXPECTED.dataRows);
  for (const r of dataRows) {
    const want = `| ${r.slice(1).map((c) => cellText(c, " ").replace(/\|/g, "\\|")).join(" | ")} |`;
    assert.ok(lines.has(want), `조각에 없는 행: ${want.slice(0, 80)}`);
  }
  assert.match(all, /\| O \/ 4 \| O \/ 8 \|/);
  assert.match(all, /525 \/ 332 \/ 193 \| 518 \/ 323 \/ 195/);
});
