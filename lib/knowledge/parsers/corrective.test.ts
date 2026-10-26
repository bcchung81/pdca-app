// 시정조치 계획 파서 시험 — 표 모양만 본뜬 시험용 가상 자료입니다(실제 기관 내용 아님). 실제 파일 시험은 원본이 이 컴퓨터에 있을 때만 돕니다(resources/knowledge는 git 밖).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import { layerOf } from "../bundle.ts";
import { cellText, compactKey } from "../normalize.ts";
import { whereWithNote } from "../revision-note.ts";
import type { SourceBlock } from "../source.ts";
import { loadKordocChunks } from "../source.ts";
import { parseHtmlTables, parsePipeTable } from "../table.ts";
import { CORRECTIVE_EXPECTED, parseCorrective } from "./corrective.ts";

const block = (text: string, page = 1): SourceBlock => ({ id: "c", type: "text", text, page, breadcrumb: [] });

const PIPE = (rows: string[][]) => ["| 지적사항 | 조치계획 |", "| --- | --- |", ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

const SAMPLE: SourceBlock[] = [
  block("시험 문서\n\n기관명 : 가상기관\n\n[기관 경영평가]\n\n□ 지표명 : 전략기획"),
  block(PIPE([["･ 가상 지적 하나", "･ 가상 조치 하나"], ["･ 가상 지적 둘", "･ 가상 조치 둘"]])),
  block("□ 지표명 : 일자리 및 균등한 기회(㉮일자리 창출과 공정한 채용)", 2),
  block(PIPE([["･ 가상 일자리 지적", "･ 가상 일자리 조치"]]), 2),
  block("□ 지표명 : 전파기반 대국민 서비스 강화 사업", 2),
  block(PIPE([["･ 가상 사업 지적", "･ 첫째 조치<br>･ 둘째 조치"]]), 2),
  block("□ 지표명 : 주요사업 계량지표 구성의 적합성 및 목표의 도전성", 3),
  block(
    `<table>
<tr><th>지적사항</th><th>조치계획</th></tr>
<tr><td>･ 가상 공통지표 지적 하나<br>전파품질 조기 안정화 기여도</td><td>･ 가상 단독 조치</td></tr>
<tr><td>･ <br>가상 공통지표 지적 둘<br>인명구조 및 재난경보 무선국 관리 강화 성과</td><td rowspan="2">･ 가상 합친 조치</td></tr>
<tr><td>･ 가상 공통지표 지적 셋<br>인명구조 및 재난경보 무선국 관리 강화 성과</td></tr>
<tr><td>･ 가상 공통지표 지적 넷<br>ICT기금 재정 효율화 성과</td><td>･ 가상 기금 조치</td></tr>
</table>`,
    3,
  ),
  block("□ 지표명 : 안전한 일터 조성을 위한 노력과 성과(혁신가점)", 4),
  block(PIPE([["･ 가상 안전 지적", "･ 가상 안전 조치"]]), 4),
  block("[기관장 경영계약 이행실적 평가]\n\n□ 지표명 : 이사회 기능 활성화 및 책임성 확보", 4),
  block(PIPE([["･ 가상 이사회 지적", "･ 가상 이사회 조치"]]), 4),
];

const parsed = parseCorrective(SAMPLE);
const by = (key: string) => parsed.chunks.find((c) => c.chunk_key === `corr25-2610/${key}`)!;

test("지표명을 단위로 풀고 조각 키·트랙·단위를 정함", () => {
  assert.deepEqual(
    parsed.chunks.map((c) => [c.chunk_key, c.track, c.business]),
    [
      ["corr25-2610/MG-1/01", "경영관리", "MG-1"],
      ["corr25-2610/MG-1/02", "경영관리", "MG-1"],
      ["corr25-2610/MG-3/01", "경영관리", "MG-3"],
      ["corr25-2610/BZ-2/01", "주요사업", "BZ-2"],
      ["corr25-2610/BZ-4/01", "주요사업", "BZ-4"],
      ["corr25-2610/BZ-4/02", "주요사업", "BZ-4"],
      ["corr25-2610/BZ-4/03", "주요사업", "BZ-4"],
      ["corr25-2610/BZ-4/04", "주요사업", "BZ-4"],
      ["corr25-2610/MG-12/01", "경영관리", "MG-12"],
      ["corr25-2610/CEO/01", "경영관리", null],
    ],
  );
  assert.ok(parsed.chunks.every((c) => c.unit_type === "corrective_action" && c.doc_id === "corr25-2610"));
  assert.equal(by("MG-3/01").meta.sub_indicator, "㉮일자리 창출과 공정한 채용");
  assert.equal(by("MG-12/01").meta.bonus, true);
  assert.equal(by("MG-1/01").pdf_page_start, 1);
});

test("지적사항과 조치계획은 한 조각 안의 인용 단위 둘 — 글머리·여러 문단 처리", () => {
  assert.deepEqual(by("MG-1/01").blocks, ["지적사항: 가상 지적 하나", "조치계획: 가상 조치 하나"]);
  assert.equal(by("BZ-2/01").blocks[1], "조치계획:\n· 첫째 조치\n· 둘째 조치");
  assert.equal(by("MG-1/01").text, "지적사항: 가상 지적 하나\n\n조치계획: 가상 조치 하나");
  assert.match(by("MG-3/01").context_prefix, /경영관리 지표 3 일자리 및 균등한 기회 ㉮일자리 창출과 공정한 채용 · 1번/);
});

test("공통지표 행: 끝줄의 지표명을 떼어 소속 사업과 제목으로, 빈 글머리 줄은 버림", () => {
  assert.equal(by("BZ-4/01").meta.related_business, "BZ-1");
  assert.equal(by("BZ-4/02").meta.related_business, "BZ-2");
  assert.equal(by("BZ-4/04").meta.related_business, "BZ-3");
  assert.equal(by("BZ-4/02").blocks[0], "지적사항: 가상 공통지표 지적 둘"); // 「･ <br>」 머리와 지표명 줄이 글에서 빠짐
  assert.match(by("BZ-4/02").title, /공통지표 2번 · 인명구조 및 재난경보 무선국 관리 강화 성과$/);
  assert.equal(by("BZ-4/01").meta.metric_2026, "전파품질 조기 안정화 기여도");
});

test("조치계획이 위 행과 합쳐진 곳은 두 행 모두에 같은 글을 적고 묶음을 남김", () => {
  assert.equal(by("BZ-4/02").blocks[1], "조치계획: 가상 합친 조치");
  assert.equal(by("BZ-4/03").blocks[1], "조치계획: 가상 합친 조치");
  assert.equal(by("BZ-4/02").meta.plan_shared_with, null);
  assert.equal(by("BZ-4/03").meta.plan_shared_with, "corr25-2610/BZ-4/02");
  assert.equal(by("BZ-4/04").meta.plan_shared_with, null);
  assert.equal(parsed.checks.find((c) => c.name.includes("합쳐진 행"))?.actual, 1);
});

test("기관장 행은 검색 전용 — 어느 과제의 AI 근거에도 안 들어감, 나머지는 단위가 맞는 과제에만", () => {
  const ceo = by("CEO/01");
  assert.equal(ceo.meta.search_only, true);
  assert.equal(ceo.searchable, true);
  for (const unit of ["MG-1", "MG-12", "BZ-1", "BZ-2"]) assert.equal(layerOf(ceo, unit), null);
  const row = (key: string) => ({ ...by(key), text: by(key).text });
  assert.equal(layerOf(row("MG-1/01"), "MG-1"), "business");
  assert.equal(layerOf(row("MG-1/01"), "MG-3"), null);
  assert.equal(layerOf(row("MG-1/01"), "BZ-2"), null); // 주요사업 과제에는 경영관리 지식이 안 감
  assert.equal(layerOf(row("BZ-2/01"), "BZ-2"), "business");
  assert.equal(layerOf(row("BZ-2/01"), "MG-1"), null);
  assert.equal(layerOf(row("BZ-4/01"), "BZ-1"), "business"); // 공통지표는 소속 사업의 ③에만
  assert.equal(layerOf(row("BZ-4/01"), "BZ-2"), null);
});

test("요청 때 where 꼬리표: 조치계획은 약속일 뿐 이행 실적·숫자 근거가 아님", () => {
  const where = whereWithNote(by("MG-1/01"));
  assert.match(where ?? "", /시정조치 계획 — 조치계획은 기관이 하겠다고 약속한 것이며 이행 실적·사실·숫자의 근거가 아님/);
  assert.equal(whereWithNote({ chunk_key: "x", unit_type: "finding_row", context_prefix: "머리" }), "머리");
});

test("새 지표 이름은 조용히 빠지지 않고 멈춤", () => {
  assert.throws(() => parseCorrective([block("□ 지표명 : 처음 보는 지표"), block(PIPE([["･ 가", "･ 나"]]))]), /단위로 풀 수 없습니다/);
  assert.throws(() => parseCorrective([block(PIPE([["･ 가", "･ 나"]]))]), /지표명보다 지적표가 먼저/);
  // 공통지표인데 끝줄 지표명이 사전에 없으면 소속 검산이 실패로 알림
  const bad = parseCorrective([
    block("□ 지표명 : 주요사업 계량지표 구성의 적합성 및 목표의 도전성"),
    block(PIPE([["･ 가상 지적<br>사전에 없는 지표", "･ 가상 조치"]])),
  ]);
  assert.equal(bad.checks.find((c) => c.name.includes("소속 사업"))?.ok, false);
});

// --- 실제 파일(원본이 있을 때만) ---
const REAL = join(import.meta.dirname, "../../../resources/knowledge/_parsed/corr25-2610.chunks.json");

test("실제 파일: 검산 전부 통과하고 모든 칸의 글이 조각에 그대로 들어 있음", { skip: !existsSync(REAL) && "원본 산출물이 없음" }, () => {
  const blocks = loadKordocChunks(JSON.parse(readFileSync(REAL, "utf8")));
  const real = parseCorrective(blocks);
  assert.ok(real.checks.every((c) => c.ok), JSON.stringify(real.checks.filter((c) => !c.ok)));
  assert.equal(real.chunks.length, CORRECTIVE_EXPECTED.rows);
  // 글 손실 검산: 원문 표의 지적·조치 칸 글(공통지표 행의 지표명 줄만 제외)이 조각 글 안에 빠짐없이 있음
  const text = real.chunks.map((c) => compactKey(c.text)).join("|");
  let cells = 0;
  for (const b of blocks) {
    const t = b.text.trim();
    if (!/지적사항/.test(t.slice(0, 80)) || !(t.startsWith("|") || t.startsWith("<table"))) continue;
    const rows = t.startsWith("|") ? parsePipeTable(t).rows.slice(1).map((r) => r) : parseHtmlTables(t)[0].rows.slice(1).map((r) => r.cells.map((c) => c.html));
    for (const r of rows) for (const cell of r) {
      const lines = cellText(cell, "\n").split("\n").map((l) => l.replace(/^[·\s]+/, "").trim()).filter(Boolean);
      for (const line of lines) {
        if (/계량지표 구성/.test(b.breadcrumb.join("")) && line === lines[lines.length - 1] && cell === r[0]) continue; // 지표명 줄
        assert.ok(text.includes(compactKey(line)), `조각에 없는 글: ${line.slice(0, 40)}`);
        cells += 1;
      }
    }
  }
  assert.ok(cells >= 100, `확인한 줄 ${cells}`);
});
