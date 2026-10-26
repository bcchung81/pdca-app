import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { loadKordocChunks, type SourceBlock } from "../source.ts";
import { QA_MG_DOCS, QA_MG_PARSERS, parseQaMg, parseQuestion, qaMgSpec, splitAtHeaders } from "./qa-mg.ts";

const blk = (text: string, page: number, type = "table"): SourceBlock => ({ id: `b${page}`, type, text, page, breadcrumb: [] });
const head = (kind: string, page: string, q: string) => `<table>\n<tr><th>전략기획</th><th>${kind}</th><th>${page}</th></tr>\n<tr><td colspan="3">${q}</td></tr>\n</table>`;

test("질문 읽기: 번호·태그([경평지적사항]·[국회지적사항]·(공통)·(p.쪽))·본문", () => {
  assert.deepEqual(parseQuestion("3. [경평지적사항] 핵심가치 …를 설명해 주시기 바랍니다."), { no: 3, tags: ["경평지적사항"], refPage: null, body: "핵심가치 …를 설명해 주시기 바랍니다." });
  assert.deepEqual(parseQuestion("23. (p.9) 기관의 ESG 연계성"), { no: 23, tags: ["보고서쪽질문"], refPage: 9, body: "기관의 ESG 연계성" });
  assert.deepEqual(parseQuestion("11. (공통) BP를 제시해 주시기 바랍니다."), { no: 11, tags: ["공통"], refPage: null, body: "BP를 제시해 주시기 바랍니다." });
  assert.deepEqual(parseQuestion("번호 없는 글"), { no: null, tags: [], refPage: null, body: "번호 없는 글" });
});

test("머리 자르기: 표 중간의 머리 줄에서 앞 표는 닫고 새 표는 열며, 앞 빈 칸·칸 폭(colspan)·보고서 쪽 칸 없음·파이프 표 변형도 받음", () => {
  // 앞 표(증빙) 뒤에 같은 표 안에서 다음 질문 머리가 이어지는 모양(쪽을 넘긴 표가 합쳐짐)
  const merged = blk('<table>\n<tr><td>증빙 6-1</td><td>제목</td><td>보고서 P.9</td></tr>\n<tr><td></td><td>전략기획</td><td colspan="5">질문 답변자료</td><td colspan="2">보고서 P.27</td></tr>\n<tr><td></td><td colspan="8">14. (p.27) 대체인력뱅크를 설명해 주시기 바랍니다.</td></tr>\n<tr><td>증빙 14-1</td><td>자료</td><td>-</td></tr>\n</table>', 5);
  const parts = splitAtHeaders(merged);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].head, null);
  assert.match(parts[0].text, /증빙 6-1[\s\S]*<\/table>$/);
  assert.equal(parts[1].head?.section, "Q");
  assert.equal(parts[1].head?.reportPage, "보고서 P.27");
  assert.equal(parts[1].head?.question, "14. (p.27) 대체인력뱅크를 설명해 주시기 바랍니다.");
  assert.match(parts[1].text, /^<table>\s*<tr><td>증빙 14-1<\/td>[\s\S]*<\/table>$/);
  // 보고서 쪽 칸이 없는 2칸 머리(요청자료)
  const two = splitAtHeaders(blk('<table> <tr><th>국정과제 등 핵심정책 이행</th><th>요청자료</th></tr> <tr><td colspan="2">4. 각종 수상기록에 대한 증빙자료</td></tr> </table>', 95));
  assert.deepEqual([two.length, two[0].head?.section, two[0].head?.reportPage, two[0].head?.question, two[0].text], [1, "R", "", "4. 각종 수상기록에 대한 증빙자료", ""]);
  // 파이프 표로 나온 머리
  const pipe = splitAtHeaders(blk("| 윤리경영 | 질문 답변자료 | 보고서 P.5 |\n| --- | --- | --- |\n| 2. [경평지적사항] 윤리 질문 | | |\n\n답변 글", 7));
  assert.equal(pipe[0].head?.question, "2. [경평지적사항] 윤리 질문");
  // 머리가 없으면 그대로
  assert.deepEqual(splitAtHeaders(blk("본문만", 3, "text")), [{ head: null, text: "본문만", page: 3 }]);
});

const base = (): SourceBlock[] => [
  blk("# 1-(1) 전략기획", 1, "heading"),
  blk("| Ⅰ | 질문 답변자료 |\n| --- | --- |", 2),
  blk("1. [국회지적사항] 질문 하나 ········ 1\n2. (공통) 질문 둘 ········ 3", 2, "text"),
  blk("| Ⅱ | 요청자료 |\n| --- | --- |", 2),
  blk("1. 요청 하나 ········ 9", 2, "text"),
  blk(head("질문 답변자료", "-", "1. [국회지적사항] 질문 하나"), 3),
  blk("☑ 답변 하나입니다.", 3, "text"),
  blk('| 증빙 1-1 | 증빙 제목 | 보고서 P.5 |\n| --- | --- | --- |', 4),
  blk("![image](image_001.png) ![image](image_002.png)", 4, "text"),
  blk(head("질문 답변자료", "보고서 P.11", "2. (공통) 질문 둘"), 5),
  blk("☑ 답변 둘입니다.", 5, "text"),
  blk(head("요청자료", "-", "1. 요청 하나"), 6),
  blk("☑ 요청 답.", 6, "text"),
];

test("질문 단위 조각: 질문 1쌍·요청 1건 = 조각 1개, 태그·보고서 쪽·그림 수를 meta에 두고 그림 표시는 글에서 빼며 검산이 모두 통과", () => {
  const r = parseQaMg(base(), "qa25-mg-01");
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks.filter((c) => !c.ok)));
  assert.deepEqual(r.chunks.map((c) => [c.chunk_key, c.unit_type, c.business, c.track]), [
    ["qa25-mg-01/q01", "qa_pair", "MG-1", "경영관리"],
    ["qa25-mg-01/q02", "qa_pair", "MG-1", "경영관리"],
    ["qa25-mg-01/r01", "request_evidence", "MG-1", "경영관리"],
  ]);
  const q1 = r.chunks[0];
  assert.equal(q1.blocks[0], "질문 1: [국회지적사항] 질문 하나");
  assert.match(q1.text, /답변 하나입니다/);
  assert.match(q1.text, /증빙 1-1/);
  assert.ok(!q1.text.includes("![image]"), "그림 표시는 글에서 뺌");
  assert.deepEqual([q1.meta.tags, q1.meta.image_count, q1.meta.report_page, q1.meta.question, q1.pdf_page_start, q1.pdf_page_end], [["국회지적사항"], 2, null, "질문 하나", 3, 4]);
  assert.equal(r.chunks[1].meta.report_page, "보고서 P.11");
  assert.deepEqual(r.chunks[1].q_type, ["공통"]);
  assert.deepEqual(r.chunks[2].q_type, ["요청자료"]);
  assert.match(q1.context_prefix ?? "", /1-\(1\) 전략기획 · Ⅰ 질문 답변자료 1$/);
  assert.match(q1.title, /^'25 실사 질문 · 전략기획 Q1 · 질문 하나$/);
  assert.deepEqual(r.extras?.toc, [{ q: 2, r: 1 }]);
});

test("검산: 질문 번호가 건너뛰면(머리 줄을 못 읽은 질문) 멈춤 수준 오류, 목차 수와 다르면 경고", () => {
  const bad = base().filter((b) => !b.text.includes("2. (공통) 질문 둘") || b.text.includes("········"));
  const r = parseQaMg(bad, "qa25-mg-01");
  const miss = r.checks.find((c) => c.name.startsWith("질문 번호가"));
  assert.equal(miss?.ok, true, "남은 질문 1개만이라 번호 자체는 이어짐");
  assert.equal(r.checks.find((c) => c.name.startsWith("질문 수가 목차"))?.ok, false, "목차는 2개");
  const gap = base().concat([blk(head("질문 답변자료", "-", "4. 건너뛴 질문"), 7)]);
  const g = parseQaMg(gap, "qa25-mg-01");
  assert.equal(g.checks.find((c) => c.name.startsWith("질문 번호가"))?.ok, false);
  assert.deepEqual((g.checks.find((c) => c.name.startsWith("질문 번호가"))?.actual as { missing: number[] }).missing, [3]);
});

test("긴 답변은 조각을 나누고(qa_part·parent_key) 글 손실은 없으며, 둘째 표지가 오면 번호가 다시 1부터인 구간으로 키에 s2가 붙음", () => {
  const long = Array.from({ length: 6 }, (_, i) => blk(`☑ 주장 ${i + 1} ${"가".repeat(900)}`, 3, "text"));
  const blocks = [blk("# 4-(1) 조직 및 인적자원관리", 1, "heading"), blk(head("질문 답변자료", "-", "1. 긴 질문"), 3), ...long, blk("# 4-(1) ㉮ 일･가정 양립", 20, "heading"), blk("1. 일가정 질문 ········ 1", 20, "text"), blk(head("질문 답변자료", "-", "1. 일가정 질문"), 21), blk("답", 21, "text")];
  const r = parseQaMg(blocks, "qa25-mg-09");
  assert.ok(r.checks.every((c) => c.ok), JSON.stringify(r.checks.filter((c) => !c.ok)));
  const keys = r.chunks.map((c) => c.chunk_key);
  assert.ok(keys.includes("qa25-mg-09/q01/part1") && keys.includes("qa25-mg-09/q01/part2"));
  assert.ok(keys.includes("qa25-mg-09/s2/q01"));
  const part = r.chunks.find((c) => c.chunk_key === "qa25-mg-09/q01/part2")!;
  assert.equal(part.unit_type, "qa_part");
  assert.equal(part.meta.parent_key, "qa25-mg-09/q01");
  assert.match(r.chunks.at(-1)!.title, /일･가정 양립 Q1/);
  assert.equal(r.chunks.at(-1)!.meta.section_label, "4-(1) ㉮ 일･가정 양립");
});

test("문서 명세: 13개 지표 구간(MG-13 AI 활용 혁신은 답변자료 없음), 영문 파일명·기관 원본 이름, 파서가 문서마다 등록됨", () => {
  assert.equal(QA_MG_DOCS.length, 13);
  assert.deepEqual(QA_MG_DOCS.map((d) => d.unit).sort(), ["MG-1", "MG-10", "MG-11", "MG-12", "MG-14", "MG-2", "MG-3", "MG-4", "MG-5", "MG-6", "MG-7", "MG-8", "MG-9"].sort());
  assert.ok(!QA_MG_DOCS.some((d) => d.unit === "MG-13"));
  assert.deepEqual(Object.keys(QA_MG_PARSERS).sort(), QA_MG_DOCS.map((d) => d.docId).sort());
  const s = qaMgSpec(QA_MG_DOCS[0]);
  assert.deepEqual([s.doc_id, s.file_name, s.parsed_name, s.tracks, s.status, s.original_name], ["qa25-mg-01", "qa25-mg-01.pdf", "qa25-mg-01", ["경영관리"], "ingest", "(첨부1 발췌) 경영관리A팀 답변자료 1-(1) 전략기획.pdf"]);
  assert.match(s.scope, /원본 3~132쪽/);
  // 구간이 겹치지 않고 팀마다 쪽 순서
  for (const team of ["A", "B"] as const) {
    const r = QA_MG_DOCS.filter((d) => d.team === team).map((d) => d.pages).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < r.length; i++) assert.equal(r[i][0], r[i - 1][1] + 1, `${team}팀 구간이 이어짐`);
  }
});

// --- 실제 적재 산출물(원본이 이 컴퓨터에 있을 때만) ---
const PARSED = join(resolve(import.meta.dirname, "../../.."), "resources/knowledge/_parsed");
const EXPECT: Record<string, [number, number]> = {
  "qa25-mg-01": [40, 8], "qa25-mg-02": [40, 11], "qa25-mg-03": [33, 9], "qa25-mg-04": [30, 3], "qa25-mg-05": [20, 3], "qa25-mg-06": [41, 2], "qa25-mg-07": [40, 4],
  "qa25-mg-08": [35, 3], "qa25-mg-09": [60, 6], "qa25-mg-10": [29, 4], "qa25-mg-11": [24, 3], "qa25-mg-12": [20, 4], "qa25-mg-14": [21, 4],
};

test("실제 파일 13개: 검산이 모두 통과하고 질문·요청 수가 목차와 같으며(고정 기대값) 조각 키가 겹치지 않음", { skip: !existsSync(join(PARSED, "qa25-mg-01.chunks.json")) && "kordoc 산출물이 없음" }, () => {
  let total = 0;
  for (const d of QA_MG_DOCS) {
    const r = parseQaMg(loadKordocChunks(JSON.parse(readFileSync(join(PARSED, `${d.docId}.chunks.json`), "utf8"))), d.docId);
    assert.ok(r.checks.every((c) => c.ok), `${d.docId} ${JSON.stringify(r.checks.filter((c) => !c.ok))}`);
    assert.deepEqual([r.extras?.questions, r.extras?.requests], EXPECT[d.docId], d.docId);
    assert.ok(r.chunks.every((c) => c.business === d.unit && c.track === "경영관리"));
    total += r.chunks.length;
  }
  assert.equal(total, 523);
});
