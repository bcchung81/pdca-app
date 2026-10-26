// 참고3(경영관리 중간보고서 지적사항) 파서 — 합성 입력(P13 모양 포함)과 실제 파일 검산.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { loadKordocChunks } from "../source.ts";
import type { SourceBlock } from "../source.ts";
import { MIDREPORT_MG_EXPECTED, parseMidreportMg } from "./midreport-mg.ts";

const block = (text: string, page = 1): SourceBlock => ({ id: "c", type: "text", text, page, breadcrumb: [] });
const title = (t: string) => `<table>\n<tr><th><table>\n<tr><th rowspan="2">${t}</th></tr>\n<tr></tr>\n</table></th></tr>\n</table>`;
const head = "| No | 지적사항 | 책임부서 | 협업부서 |\n| --- | --- | --- | --- |\n";
const summary = (rows: Array<[string, string]>) =>
  `<table>\n<tr><th rowspan="2">범주</th><th colspan="3">’24년도</th><th colspan="3">’25년도</th></tr>\n<tr><td>평가지표</td><td>배점</td><td>지적건수</td><td>평가지표</td><td>배점</td><td>지적건수</td></tr>\n` +
  rows.map(([n, c]) => `<tr><td>- ${n}</td><td>1</td><td>1</td><td>- ${n}</td><td>1</td><td>${c}</td></tr>`).join("\n") +
  "\n</table>";

test("참고3: 제목표가 지적표 뒤에 와도 제목 순서로 이음(P13), 세평 태그·부서 분리·키", () => {
  const r = parseMidreportMg([
    block(summary([["윤리경영", "1"], ["일자리 및 균등한 기회", "2"], ["안전 및 재난관리", "1"]])),
    block(title("윤리경영")),
    block(head + "| 1<br>(세평①) | 윤리 지적 | 경영<br>기획팀 | 인사총무팀, 감사실 |"),
    // 일자리 표가 제목보다 먼저 나옴
    block(head + "| 1<br>(세평①) | 일자리 지적 하나 | 인사총무팀 |  |\n| 2 | 일자리 지적 둘 | 인사총무팀 |  |"),
    block(title("일자리 및 균등한 기회")),
    block(head + "| 1 | 안전 지적 | 안전관리팀 |  |"),
    block(title("안전 및 재난관리")),
  ]);
  const by = (u: string) => r.chunks.filter((c) => c.business === u);
  assert.equal(by("MG-2").length, 1);
  assert.equal(by("MG-3").length, 2);
  assert.equal(by("MG-4").length, 1);
  assert.deepEqual(r.chunks.map((c) => c.chunk_key), ["mid25-mg/MG-2/01", "mid25-mg/MG-3/01", "mid25-mg/MG-3/02", "mid25-mg/MG-4/01"]);
  const first = r.chunks[0];
  assert.equal(first.track, "경영관리");
  assert.equal(first.unit_type, "finding_row");
  assert.equal(first.meta.review_tag, "세평①");
  assert.equal(r.chunks[2].meta.review_tag, null);
  assert.deepEqual(first.dept_resp, ["경영기획팀"]);
  assert.deepEqual(first.dept_coop, ["인사총무팀", "감사실"]);
  assert.equal("related_business" in first.meta, false);
  const displaced = r.checks.find((c) => c.name.includes("P13"));
  assert.deepEqual(displaced?.actual, ["일자리 및 균등한 기회", "안전 및 재난관리"]);
  // 요약표(윤리 1·일자리 2·안전 1)와 맞아 지표별 건수 검산은 통과(전체 기대값 검산은 합성이라 실패)
  assert.equal(r.checks.find((c) => c.name.includes("요약표 대조"))?.ok, true);
});

test("참고3: 같은 지표 절이 둘이면 키 번호를 이어 세고, 같은 본문은 duplicate_of", () => {
  const r = parseMidreportMg([
    block(summary([["조직 및 인적자원관리", "9"]])),
    block(title("조직 및 인적자원관리")),
    block(head + "| 1 | 같은 글 | 인사팀 |  |"),
    block(title("일･가정 양립")),
    block(head + "| 1 | 같은 글 | 인사팀 |  |"),
  ]);
  assert.deepEqual(r.chunks.map((c) => c.chunk_key), ["mid25-mg/MG-9/01", "mid25-mg/MG-9/02"]);
  assert.equal(r.chunks[1].meta.finding_no, 1);
  assert.equal(r.chunks[1].meta.duplicate_of, "mid25-mg/MG-9/01");
});

test("참고3: 제목 수와 지적표 수가 다르면 던지고, 모르는 지표 이름은 검산 실패", () => {
  assert.throws(() => parseMidreportMg([block(title("윤리경영"))]), /맞지 않습니다/);
  const r = parseMidreportMg([block(title("처음 보는 지표")), block(head + "| 1 | 글 | 팀 |  |")]);
  const c = r.checks.find((x) => x.name.includes("지표 단위 풀림"));
  assert.equal(c?.ok, false);
  assert.match(c?.note ?? "", /처음 보는 지표/);
});

const REAL = "resources/knowledge/_parsed/mid25-mg.chunks.json";
test("참고3 실제 파일: 검산 전부 통과, 기대 건수, 재실행 동일", { skip: !existsSync(REAL) && "kordoc 산출물(mid25-mg.chunks.json — git 밖)이 없음" }, () => {
  const blocks = loadKordocChunks(JSON.parse(readFileSync(REAL, "utf8")));
  const a = parseMidreportMg(blocks);
  assert.deepEqual(a.checks.filter((c) => !c.ok), []);
  assert.equal(a.chunks.length, MIDREPORT_MG_EXPECTED.rows);
  assert.equal(a.chunks.filter((c) => c.meta.review_tag).length, MIDREPORT_MG_EXPECTED.reviewTags);
  // P13: 윤리경영 3 · 일자리 8 · 안전 4(제목을 앞에서부터 붙이면 11·4·0)
  const n = (u: string) => a.chunks.filter((c) => c.business === u).length;
  assert.deepEqual([n("MG-2"), n("MG-3"), n("MG-4")], [3, 8, 4]);
  assert.ok(a.chunks.every((c) => c.track === "경영관리" && c.business && c.dept_resp.length > 0));
  assert.deepEqual(parseMidreportMg(blocks), a);
});
