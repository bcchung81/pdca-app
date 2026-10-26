import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { loadKordocChunks, type SourceBlock } from "../source.ts";
import { RPT_MG_DOCS, RPT_MG_EXPECTED_SECTIONS, RPT_MG_PARSERS, chapterOfHeading, parseReport25Mg, rptMgSpec, tableLines } from "./report25-mg.ts";

const blk = (text: string, page: number): SourceBlock => ({ id: `b${page}-${text.length}`, type: text.startsWith("#") ? "heading" : text.startsWith("|") || text.startsWith("<table") ? "table" : "text", text, page, breadcrumb: [] });
const flow = (...items: Array<[string, number]>) => items.map(([t, p]) => blk(t, p));
const body = (n: string) => `∙ ${n} ${"추진 내용을 길게 적은 본문 글입니다. ".repeat(6)}`;
const band = (n: number, title: string) => `| 평가내용 ${n} |  | ${title} |\n| --- | --- | --- |`;
const theme = (n: number, title: string) => `|  | ${n} |  | ${title} |\n| --- | --- | --- | --- |`;
const foot = (n: number) => `| ${n} | ∙ 2025년도 경영실적보고서 |\n| --- | --- |`;
const contact = "| 직 위 | 성 명 | 연락처 | E-mail |\n| --- | --- | --- | --- |\n| 전략기획팀장 | 홍길동 | 000-000-0000 | hong@kca.kr |";

/** 1-(1) 전략기획 모양: 맨 앞 「지표관리 방향」이 있어 로마 숫자가 한 칸씩 밀림 */
const shifted = (): SourceBlock[] =>
  flow(
    ["평가방법\n9등급 평가\n\n가중치\n2점", 1],
    [contact, 1],
    ["![image](image_001.png)", 1],
    ["## Ⅰ. 지표관리 방향", 2],
    [theme(1, "대내외 경영여건 분석"), 2],
    [body("환경분석"), 2],
    [foot(15), 2],
    ["## Ⅱ. 2024년도 경영실적평가 지적사항 조치실적", 3],
    ["| 지적/권고 사항 |  | 조치 및 개선실적 |  | 비고 |\n| --- | --- | --- | --- | --- |\n| ∙ 지적 하나 |  | ∙ 조치 하나 |  | p.20 |", 3],
    ["## Ⅲ. 전년 대비 주요 추진실적", 4],
    [band(1, "비전·핵심가치 수립"), 4],
    ["| ’24년까지의 주요실적 |  | ’25년 주요실적 |\n| --- | --- | --- |\n| ∙ 24년 실적 |  | ∙ 25년 실적 |", 4],
    [band(2, "경영혁신 계획"), 4],
    ["∙ 둘째 평가내용 전년 대비 실적 글", 4],
    ["## Ⅳ. 세부평가내용별 2025년도 추진실적 및 성과", 5],
    [band(1, "비전·핵심가치 수립 노력과 성과"), 5],
    ["경\n영\n전\n략", 5],
    [theme(1, "가치체계 설정 <u>BP</u>"), 5],
    ["### 가. 환경변화 반영 전략방향 도출 <u>BP</u> 지적개선", 5],
    [body("가 절"), 5],
    ["### 자원배분", 5],
    ["∙ 절 안의 소제목 아래 글", 5],
    ["### 나. 가치체계 적정성 진단", 5],
    [body("나 절"), 5],
    [foot(16), 5],
    ["|  | 경영전략 |\n| --- | --- |", 6],
    ["<table><tr><th rowspan=\"2\">Ⅰ. 경영관리</th></tr><tr></tr></table>", 6],
    [theme(2, "소통중심 가치체계 내재화"), 6],
    ["대주제 2는 가.가 없고 본문만 있음 ∙ 도식 글", 6],
    [band(2, "경영혁신 계획 이행"), 6],
    [theme(1, "혁신계획 수립"), 6],
    ["### 가. 혁신계획 절", 6],
    [body("혁신"), 6],
    ["## Ⅴ. 성과분석 및 환류", 7],
    [theme(1, "주요 성과분석"), 7],
    ["### 가. 계량 성과지표", 7],
    ["<table>\n<tr><th>구분</th><th>실적</th></tr>\n<tr><td>지표 하나</td><td>100%</td></tr>\n</table>", 7],
    ["### 나. 비계량 성과지표", 7],
    ["| 구분 | 성과 |\n| --- | --- |\n| 비계량 하나 | 성과 글 |", 7],
    [theme(2, "향후 개선계획"), 7],
    ["| 구분 | ’26년 개선방안 |\n| --- | --- |\n| 개선 하나 | 방안 글 |", 7],
    [foot(17), 7],
  );

test("장 판별: 로마 숫자가 아니라 제목 글로(1-(1)처럼 한 칸씩 밀려도 같은 장), 모르는 제목은 null", () => {
  assert.equal(chapterOfHeading("Ⅰ. 지표관리 방향"), "direction");
  assert.equal(chapterOfHeading("Ⅱ. 2024년도 경영실적평가 지적사항 조치실적"), "findings");
  assert.equal(chapterOfHeading("Ⅰ. 2024년도 경영실적평가 지적사항 조치실적"), "findings");
  assert.equal(chapterOfHeading("Ⅲ. 전년 대비 주요 추진실적"), "prior");
  assert.equal(chapterOfHeading("Ⅳ. 세부평가내용별 2025년도 추진실적 및 성과"), "detail");
  assert.equal(chapterOfHeading("Ⅲ. 세부평가내용별 2025년도 추진실적 및 성과"), "detail");
  assert.equal(chapterOfHeading("Ⅴ. 성과분석 및 환류"), "outcome");
  assert.equal(chapterOfHeading("Ⅵ. 부록"), null);
});

test("1-(1) 모양(로마 숫자 밀림): 장마다 조각, 절은 report_section(키·마커·대주제 번호), 도입·본문은 report_chapter", () => {
  const r = parseReport25Mg(shifted(), "rpt25-mg-01");
  assert.deepEqual(
    r.chunks.map((c) => [c.chunk_key, c.unit_type]),
    [
      ["rpt25-mg-01/MG-1/cover", "report_chapter"],
      ["rpt25-mg-01/MG-1/direction", "report_chapter"],
      ["rpt25-mg-01/MG-1/findings", "report_chapter"],
      ["rpt25-mg-01/MG-1/prior/1", "report_chapter"],
      ["rpt25-mg-01/MG-1/prior/2", "report_chapter"],
      ["rpt25-mg-01/MG-1/1/1/가", "report_section"],
      ["rpt25-mg-01/MG-1/1/1/나", "report_section"],
      ["rpt25-mg-01/MG-1/1/2/body", "report_chapter"],
      ["rpt25-mg-01/MG-1/2/1/가", "report_section"],
      ["rpt25-mg-01/MG-1/outcome/1/가", "report_chapter"],
      ["rpt25-mg-01/MG-1/outcome/1/나", "report_chapter"],
      ["rpt25-mg-01/MG-1/outcome/2/body", "report_chapter"],
    ],
  );
  assert.ok(r.chunks.every((c) => c.track === "경영관리" && c.business === "MG-1" && c.doc_id === "rpt25-mg-01"));
  const a = r.chunks.find((c) => c.chunk_key.endsWith("/1/1/가"))!;
  assert.equal(a.eval_item, "집행");
  assert.equal(a.title, "2025 보고서 전략기획 평가내용 1 가. 환경변화 반영 전략방향 도출");
  assert.deepEqual(a.meta.markers, ["BP", "지적개선"], "밑줄 태그가 낀 BP도 마커로");
  assert.deepEqual([a.meta.eval_no, a.meta.eval_title, a.meta.theme_no, a.meta.theme_title, a.meta.theme_markers, a.meta.mark], [1, "비전·핵심가치 수립 노력과 성과", 1, "가치체계 설정", ["BP"], "가"]);
  assert.ok(a.text.includes("자원배분") && a.text.includes("절 안의 소제목 아래 글"), "절 안 소제목은 절 본문");
  assert.ok(!a.text.includes("나 절"), "다음 절은 안 섞임");
  assert.match(a.context_prefix, /^2025년도 경영실적보고서\(경영관리\) · 전략기획 · 평가내용 1 · 비전·핵심가치 수립 노력과 성과 · 대주제 1 가치체계 설정 · 가\. .*\(p\.16\)$/);
  assert.equal(a.report_page_2025, 16, "쪽 꼬리표에서 읽은 인쇄 쪽");
  const direction = r.chunks.find((c) => c.chunk_key.endsWith("/direction"))!;
  assert.equal(direction.meta.chapter, "direction");
  assert.ok(direction.text.includes("환경분석"));
  assert.equal(r.chunks.find((c) => c.chunk_key.endsWith("/prior/2"))!.meta.eval_no, 2);
  assert.ok(r.chunks.find((c) => c.chunk_key.endsWith("/outcome/1/가"))!.text.includes("지표 하나 | 100%"), "HTML 표는 줄 글로");
  const two = r.chunks.find((c) => c.chunk_key.endsWith("/2/1/가"))!;
  assert.equal(two.meta.eval_no, 2, "평가내용 띠가 다시 나오면 대주제 번호가 1부터 다시");
});

test("제외: 담당자 표(개인정보)·쪽 머리·꼬리·옆 탭·지표 이름 머리·그림 표시는 조각에 없음", () => {
  const r = parseReport25Mg(shifted(), "rpt25-mg-01");
  const all = r.chunks.map((c) => c.text).join("\n");
  for (const bad of ["홍길동", "hong@kca.kr", "000-000-0000", "성 명", "연락처", "2025년도 경영실적보고서", "Ⅰ. 경영관리", "경영전략", "image_001", "경\n영"]) assert.ok(!all.includes(bad), bad);
  assert.ok(all.includes("평가방법") && all.includes("가중치"), "표지 본문은 남음");
  const leak = r.checks.find((c) => c.name.includes("글이 조각에 없음"))!;
  assert.equal(leak.ok, true);
  assert.equal((r.extras as { dropped: { contact: number; tab: number } }).dropped.contact, 1);
  assert.equal((r.extras as { dropped: { tab: number } }).dropped.tab, 1);
});

test("검산: 글 손실 없음·평가내용 번호 연속·인쇄 쪽·모르는 장 제목 없음은 통과, 절 수 기대값은 합성 흐름과 달라 실패", () => {
  const r = parseReport25Mg(shifted(), "rpt25-mg-01");
  const by = (s: string) => r.checks.find((c) => c.name.includes(s))!;
  assert.equal(by("글 손실").ok, true);
  assert.equal(by("평가내용 번호").ok, true);
  assert.equal(by("모르는 장 제목").ok, true);
  assert.equal(by("절(가.) 수").ok, false, "기대 10, 합성은 3");
  assert.equal(by("절(가.) 수").expected, 10);
  assert.equal(by("조각마다 인쇄 쪽").ok, false, "합성의 앞 쪽 일부는 꼬리표가 없음");
});

test("검산 실패 검출: 평가내용 번호가 건너뜀·모르는 장 제목·꼬리표 없는 담당자 줄", () => {
  const gap = flow(["평가방법", 1], ["## Ⅲ. 세부평가내용별 2025년도 추진실적 및 성과", 2], [band(1, "첫째"), 2], [theme(1, "대주제"), 2], ["### 가. 절", 2], [body("a"), 2], [band(3, "셋째, 둘째가 빠짐"), 3], [theme(1, "대주제"), 3], ["### 가. 절", 3], [body("b"), 3]);
  const g = parseReport25Mg(gap, "rpt25-mg-11");
  assert.equal(g.checks.find((c) => c.name.includes("평가내용 번호"))!.ok, false);
  assert.deepEqual(g.checks.find((c) => c.name.includes("평가내용 번호"))!.actual, [1, 3]);
  const unknown = parseReport25Mg(flow(["## Ⅲ. 세부평가내용별", 1], [band(1, "첫째"), 1], [theme(1, "t"), 1], ["### 가. 절", 1], [body("a"), 1], ["## Ⅶ. 알 수 없는 부록", 2], ["부록 글", 2]), "rpt25-mg-11");
  assert.equal(unknown.checks.find((c) => c.name.includes("모르는 장 제목"))!.ok, false);
  // 머리 없는 담당자 줄(이메일)이 조각에 새면 실패
  const leak = parseReport25Mg(flow(["## Ⅲ. 세부평가내용별", 1], [band(1, "첫째"), 1], [theme(1, "t"), 1], ["### 가. 절", 1], [body("a"), 1], ["| 홍길동 | 000-000-0000 | hong@kca.kr |\n| --- | --- | --- |", 1]), "rpt25-mg-11");
  assert.equal(leak.checks.find((c) => c.name.includes("글이 조각에 없음"))!.ok, false);
  // 본문이 150자 미만인 절은 경고
  const thin = parseReport25Mg(flow(["## Ⅲ. 세부평가내용별", 1], [band(1, "첫째"), 1], [theme(1, "t"), 1], ["### 가. 짧은 절", 1], ["∙ 짧음", 1]), "rpt25-mg-11");
  const c = thin.checks.find((x) => x.name.includes("150자"))!;
  assert.deepEqual([c.ok, c.level], [false, "warn"]);
});

test("가점 모양(「##」 장 제목 없음): 표지 다음 평가내용 띠부터 세부평가내용별로 보고 가.·나.를 절로 나눔", () => {
  const r = parseReport25Mg(
    flow(
      ["평가방법\n9등급 평가\n\n가중치\n5점", 1],
      [contact, 1],
      ["|  | 공공기관 혁신 노력과 성과 가점 |\n| --- | --- |", 2],
      [band(1, "AI 활용 혁신"), 3],
      ["혁신노 력과 성과", 3],
      [theme(1, "기반 구축"), 3],
      [body("기반"), 3],
      [theme(2, "자체 역량 기반 활용 <u>BP</u>"), 4],
      ["### 가. 자체 구축 sLLM 서비스 <u>BP</u> CoP", 4],
      [body("가"), 4],
      ["### 나. 가이드북 제작 신규", 4],
      [body("나"), 4],
      [foot(204), 4],
    ),
    "rpt25-mg-13",
  );
  assert.deepEqual(
    r.chunks.map((c) => [c.chunk_key, c.unit_type]),
    [
      ["rpt25-mg-13/MG-13/cover", "report_chapter"],
      ["rpt25-mg-13/MG-13/1/1/body", "report_chapter"],
      ["rpt25-mg-13/MG-13/1/2/가", "report_section"],
      ["rpt25-mg-13/MG-13/1/2/나", "report_section"],
    ],
  );
  assert.equal(r.chunks[0].measure, "가점");
  assert.deepEqual(r.chunks[2].meta.markers, [], "끝이 CoP라 BP는 제목에 남음(마커는 끝의 지적개선·BP·신규·AI만)");
  assert.deepEqual(r.chunks[3].meta.markers, ["신규"]);
  assert.ok(!r.chunks.map((c) => c.text).join("").includes("hong@kca.kr"));
  assert.equal(r.checks.find((c) => c.name.includes("평가내용 번호"))!.ok, true);
});

test("절 제목이 표의 첫 칸으로 나온 경우(윤리경영 모양)도 절로 나눔", () => {
  const r = parseReport25Mg(
    flow(
      ["## Ⅲ. 세부평가내용별", 1],
      [band(1, "첫째"), 1],
      [theme(2, "전사 참여형 활동"), 1],
      [`<table>\n<tr><th>가. 협의체 구성･운영 지적개선 BP 신규</th></tr>\n<tr><td>${body("표 안 본문")}</td></tr>\n</table>`, 1],
      ["### 나. 다음 절", 1],
      [body("나"), 1],
    ),
    "rpt25-mg-02",
  );
  assert.deepEqual(r.chunks.map((c) => c.chunk_key), ["rpt25-mg-02/MG-2/1/2/가", "rpt25-mg-02/MG-2/1/2/나"]);
  assert.equal(r.chunks[0].meta.title, "협의체 구성･운영");
  assert.deepEqual(r.chunks[0].meta.markers, ["지적개선", "BP", "신규"]);
  assert.ok(r.chunks[0].text.includes("표 안 본문"));
  assert.ok(!r.chunks[0].text.includes("가. 협의체"), "제목 칸은 본문에 되풀이하지 않음");
});

test("표 → 줄 글: 파이프·HTML 모두 칸은 「 | 」, 칸 안 줄바꿈은 「 / 」, 이스케이프 풀기", () => {
  assert.deepEqual(tableLines("| 구분 | 내용 |\n| --- | --- |\n| 항목 | ∙ 하나<br>∙ 50%\\~80% |"), ["구분 | 내용", "항목 | ∙ 하나 / ∙ 50%~80%"]);
  assert.deepEqual(tableLines("<table>\n<tr><th>구분</th><th>내용</th></tr>\n<tr><td></td><td></td></tr>\n<tr><td>항목</td><td>값</td></tr>\n</table>"), ["구분 | 내용", "항목 | 값"]);
});

test("문서 명세: 14개 지표(MG-1~14, 영문 파일명·기관 원본 이름), 파서가 문서마다 등록, 절 수 기대값은 11개 지표에만", () => {
  assert.equal(RPT_MG_DOCS.length, 14);
  assert.deepEqual(RPT_MG_DOCS.map((d) => d.unit), Array.from({ length: 14 }, (_, i) => `MG-${i + 1}`));
  assert.deepEqual(Object.keys(RPT_MG_PARSERS), RPT_MG_DOCS.map((d) => d.docId));
  const s = rptMgSpec(RPT_MG_DOCS[0]);
  assert.deepEqual([s.doc_id, s.file_name, s.parsed_name, s.tracks, s.status, s.basis_year, s.edition, s.original_name], ["rpt25-mg-01", "rpt25-mg-01.pdf", "rpt25-mg-01", ["경영관리"], "ingest", 2025, "260304_03시 판", "1-(1) 전략기획_260304_03시★★.pdf"]);
  assert.deepEqual(Object.keys(RPT_MG_EXPECTED_SECTIONS), RPT_MG_DOCS.slice(0, 11).map((d) => d.docId));
  assert.throws(() => parseReport25Mg([], "rpt25-mg-99"), /문서가 아님/);
});

// --- 실제 적재 산출물(원본이 이 컴퓨터에 있을 때만) ---
const PARSED = join(resolve(import.meta.dirname, "../../.."), "resources/knowledge/_parsed");
/** [report_section 수, report_chapter 수] — 2026-10-08 kordoc 4.15.3 산출물 기준 */
const EXPECT: Record<string, [number, number]> = {
  "rpt25-mg-01": [10, 15], "rpt25-mg-02": [11, 12], "rpt25-mg-03": [9, 16], "rpt25-mg-04": [16, 9], "rpt25-mg-05": [9, 7], "rpt25-mg-06": [8, 15], "rpt25-mg-07": [18, 12],
  "rpt25-mg-08": [17, 10], "rpt25-mg-09": [19, 21], "rpt25-mg-10": [15, 16], "rpt25-mg-11": [4, 14], "rpt25-mg-12": [11, 2], "rpt25-mg-13": [9, 5], "rpt25-mg-14": [11, 6],
};

test("실제 파일 14개: 오류 검산 통과, 조각 수 고정, 담당자 글 없음, 키 중복 없음", { skip: !existsSync(join(PARSED, "rpt25-mg-01.chunks.json")) && "kordoc 산출물이 없음" }, () => {
  let sections = 0;
  for (const d of RPT_MG_DOCS) {
    const r = parseReport25Mg(loadKordocChunks(JSON.parse(readFileSync(join(PARSED, `${d.docId}.chunks.json`), "utf8"))), d.docId);
    const failed = r.checks.filter((c) => !c.ok && c.level === "error");
    assert.deepEqual(failed, [], d.docId);
    const sec = r.chunks.filter((c) => c.unit_type === "report_section").length;
    assert.deepEqual([sec, r.chunks.length - sec], EXPECT[d.docId], d.docId);
    assert.ok(r.chunks.every((c) => c.business === d.unit && c.track === "경영관리"));
    assert.ok(!r.chunks.some((c) => /@kca\.kr|연락처|직\s*위\s*\|\s*성\s*명/.test(c.text)), `${d.docId} 담당자 글`);
    sections += sec;
  }
  assert.equal(sections, 167);
});
