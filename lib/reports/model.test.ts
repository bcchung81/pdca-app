import assert from "node:assert/strict";
import { test } from "node:test";
import { REPORT_STATUSES, canMove, cleanBlocks, deptCanMove, kpiKey, kpiRowsOf, parseTableText, reportsToStart, readBlocks, safeExt, toTableText } from "./model.ts";

test("블록 읽기는 형식이 맞는 것만", () => {
  const b = readBlocks([{ id: "b1", type: "heading", level: 2, text: "가" }, { id: 3, type: "paragraph" }, { id: "t", type: "table", rows: [["a", 1]] }, { id: "x", type: "image" }]);
  assert.deepEqual(
    b.map((x) => [x.id, x.type]),
    [
      ["b1", "heading"],
      ["t", "table"],
    ],
  );
  assert.deepEqual(b[1].rows, [["a", "1"]]);
  assert.deepEqual(readBlocks(null), []);
});

test("부서 상태 전환·키·확장자", () => {
  assert.ok(deptCanMove("drafting", "submitted"));
  assert.ok(deptCanMove("submitted", "drafting"));
  assert.ok(!deptCanMove("submitted", "approved"));
  assert.ok(!deptCanMove("approved", "drafting"));
  assert.equal(kpiKey("주요사업1/1-가", 0), "주요사업1/1-가#0");
  assert.equal(safeExt("현장사진.ZIP"), ".zip");
  assert.equal(safeExt("공문"), "");
});

test("계량지표 자리표시 행 제외, 원래 순번 유지", () => {
  const rows = kpiRowsOf([{ name: "-", target: "-" }, { name: "AI 활용 건수", unit: "건", target: "45,000건", prev: "30,706건" }, null]);
  assert.deepEqual(rows, [{ i: 1, name: "AI 활용 건수", unit: "건", target: "45,000건", prev: "30,706건" }]);
  assert.deepEqual(kpiRowsOf(undefined), []);
});

test("블록 정리: 형식·id·길이, 표 붙여넣기", () => {
  let n = 0;
  const r = cleanBlocks(
    [
      { id: "a", type: "heading", level: 3, text: "가" },
      { id: "a", type: "paragraph", text: "x".repeat(6000) },
      { id: "bad id!", type: "table", rows: [["1", 2], ["", ""]] },
      { type: "image" },
    ],
    () => `n${++n}`,
  );
  assert.ok("blocks" in r);
  if ("blocks" in r) {
    assert.deepEqual(r.blocks.map((b) => [b.id, b.type]), [["a", "heading"], ["n1", "paragraph"], ["n2", "table"]]);
    assert.equal(r.blocks[0].level, 1);
    assert.equal(r.blocks[1].text?.length, 5000);
    assert.deepEqual(r.blocks[2].rows, [["1", "2"]], "빈 행 제거");
  }
  assert.deepEqual(cleanBlocks("x", () => "z"), { error: "블록 목록이 아닙니다." });
  assert.deepEqual(parseTableText("구분\t추진노력\n학습\t수집"), [["구분", "추진노력"], ["학습", "수집"]]);
  assert.deepEqual(parseTableText("| a | b |\n|---|---|\n| 1 | 2 |"), [["a", "b"], ["1", "2"]]);
});

test("엑셀 복사(여러 줄 칸·따옴표·빈 칸·대시 행) 읽기와 왕복", () => {
  const excel = '구분\t추진결과\n"학습\n데이터"\t"수집 ""완료"""\n-\t-\n';
  const rows = parseTableText(excel);
  assert.deepEqual(rows, [["구분", "추진결과"], ["학습\n데이터", '수집 "완료"'], ["-", "-"]], "대시만 있는 행도 남김");
  assert.deepEqual(parseTableText(toTableText(rows)), rows, "왕복");
  assert.deepEqual(parseTableText("a\t\tc"), [["a", "", "c"]]);
  assert.deepEqual(parseTableText("| a | b |\n| - | - |"), [["a", "b"], ["-", "-"]], "한 글자 대시는 구분선 아님");
});


test("보고서 상태 전이 표(canMove — 2026-10-10 개선 계획 P1-1): 부서는 준비→작성 중·제출·제출 취소, 성과관리팀은 그에 더해 승인(제출에서만)·승인 취소 — 제출을 건너뛰는 승인은 누구도 안 됨", () => {
  const ok = (role: "dept_user" | "pmo" | "admin") => REPORT_STATUSES.flatMap((from) => REPORT_STATUSES.filter((to) => to !== from && canMove(role, from, to)).map((to) => `${from}→${to}`)).sort();
  assert.deepEqual(ok("dept_user"), ["drafting→submitted", "preparing→drafting", "submitted→drafting"]);
  assert.deepEqual(ok("pmo"), ["approved→drafting", "drafting→submitted", "preparing→drafting", "submitted→approved", "submitted→drafting"]);
  assert.deepEqual(ok("admin"), ok("pmo"));
  assert.equal(canMove("pmo", "preparing", "approved"), false, "준비에서 바로 승인(제출 조건 우회) 안 됨");
  assert.equal(canMove("pmo", "drafting", "approved"), false, "제출 전 승인 안 됨");
  assert.equal(canMove("pmo", "approved", "drafting"), true, "승인 취소(다시 고치게) — 성과관리팀만");
  assert.equal(canMove("dept_user", "approved", "drafting"), false);
  assert.equal(canMove("pmo", "preparing", "submitted"), false, "초안이 하나도 없으면 준비 — 제출 조건 미달");
  assert.equal(canMove("dept_user", "drafting", "drafting"), false, "같은 상태로는 안 바꿈");
  // 부서 전이 함수와 일치(예전 이름 그대로 쓰는 곳)
  for (const from of REPORT_STATUSES) for (const to of REPORT_STATUSES) assert.equal(deptCanMove(from, to), canMove("dept_user", from, to), `${from}→${to}`);
});

test("초안이 먼저 있는 준비 중 보고서만 시작 대상", () => {
  const r = (id: number, eval_unit_id: string, team_id: number, year: number, status: "preparing" | "drafting" = "preparing") => ({ id, eval_unit_id, team_id, year, status });
  const reports = [r(1, "BZ-1", 10, 2026), r(2, "BZ-1", 11, 2026), r(3, "BZ-2", 10, 2026), r(4, "BZ-1", 10, 2025), r(5, "BZ-3", 10, 2026, "drafting"), r(6, "BZ-4", 12, 2026)];
  const drafts = [
    { year: 2026, eval_unit_id: "BZ-1", team_id: 10 },
    { year: 2026, eval_unit_id: "BZ-1", team_id: 10 },
    { year: 2026, eval_unit_id: "BZ-3", team_id: 10 },
    { year: 2026, eval_unit_id: "BZ-4", team_id: null },
  ];
  assert.deepEqual(reportsToStart(reports, drafts), [1]);
  assert.deepEqual(reportsToStart(reports, []), []);
});
