import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "kordoc";
import { looksLikeMgmtFile, parseMgmtMarkdown, sectionOfLabel, splitDept, splitOutsideParens, splitTitle, splitUnit } from "./parse-mgmt.ts";

test("과제명 칸 「제목 (과제번호 : 지표명 N-M)」 — 줄바꿈·공백이 달라도 같게 읽고, 번호가 없으면 null", () => {
  assert.deepEqual(splitTitle("경영전략의 체계적 수립 및 이행\n(과제번호 : 전략기획 1-1)"), { title: "경영전략의 체계적 수립 및 이행", indicatorName: "전략기획", indicatorNo: 1, taskNo: "1-1" });
  assert.deepEqual(splitTitle("효율적인 예산편성 및 투명한 집행 (과제번호 : 재무예산관리 8-2)"), { title: "효율적인 예산편성 및 투명한 집행", indicatorName: "재무예산관리", indicatorNo: 8, taskNo: "8-2" });
  assert.equal(splitTitle("과제번호 없음")?.taskNo, undefined);
  assert.equal(splitTitle("제목 (과제번호 : 전략기획 가-나)"), null);
});

test("경영관리 파일 판별: 과제번호가 「지표명 N-M」이면 경영관리, 「N-가」면 주요사업", () => {
  assert.ok(looksLikeMgmtFile("<th>경영전략의 체계적 수립<br>(과제번호 : 전략기획 1-1)</th>"));
  assert.ok(looksLikeMgmtFile("(과제번호 : 안전 및 재난관리 4-3)"));
  assert.ok(!looksLikeMgmtFile("<th>AI 기반 안테나<br>(과제번호 : 1-가)</th>"));
  assert.ok(!looksLikeMgmtFile("과제번호 없음"));
});

test("부서(팀)·지표명(단위)·구역 이름", () => {
  assert.deepEqual(splitDept("경영기획본부(경영기획팀)"), { department: "경영기획본부", team: "경영기획팀" });
  assert.deepEqual(splitDept("감사실"), { department: "감사실", team: "" });
  assert.deepEqual(splitOutsideParens("경영기획본부(경영기획팀) / 운영지원단(인사총무팀)"), ["경영기획본부(경영기획팀)", "운영지원단(인사총무팀)"]);
  assert.deepEqual(splitOutsideParens("A(가/나)/B"), ["A(가/나)", "B"], "괄호 안의 「/」는 나누지 않음");
  assert.deepEqual(splitUnit("국정과제 이행지수(%)"), { name: "국정과제 이행지수", unit: "%" });
  assert.deepEqual(splitUnit("정보공개종합평가(등급)"), { name: "정보공개종합평가", unit: "등급" });
  assert.deepEqual(splitUnit("총자산이익률"), { name: "총자산이익률", unit: null });
  for (const [t, k] of [["과제 개요", "overview"], ["전년도 환류", "feedback"], ["지적 및 개선방안", "findings"], ["추진내용", "do"], ["계량\n성과지표", "kpi"], ["추진성과", "outcome"]] as const) assert.equal(sectionOfLabel(t), k);
  assert.equal(sectionOfLabel("[Act] 전년도 환류"), null, "주요사업 구역 이름은 경영관리 구역이 아님");
});

// 실제 8월 점검 자료(이 컴퓨터 data/ — git 밖)를 진짜 kordoc으로 읽는다
const REAL = resolve(import.meta.dirname, "../../../data/cards/260904/cards-260904-mg.hwp");
test("실제 경영관리 카드 파일(8월 점검 자료): 43장을 경고 없이 읽고, 목차(44개)와 대조해 빠진 14-1만 알림(파일이 없으면 건너뜀)", { skip: !existsSync(REAL) && "원본(data/cards/260904/cards-260904-mg.hwp)이 없음" }, async () => {
  const bytes = readFileSync(REAL);
  const res = await parse(Buffer.from(bytes));
  assert.ok(res.success && res.fileType === "hwp");
  const out = parseMgmtMarkdown(res.markdown, { sourceName: "cards-260904-mg.hwp", fileType: "hwp" });
  assert.equal(out.cards.length, 43);
  assert.equal(out.skipped, 0);
  assert.deepEqual(out.index.map((e) => [e.bundle, e.declared, e.tasks.length]), [["경영전략", 5, 5], ["안전 및 책임경영", 17, 17], ["재무성과관리", 3, 3], ["조직 운영 및 관리", 11, 11], ["혁신노력과 성과", 8, 8]]);
  const got = new Set(out.cards.map((c) => c.taskNo));
  assert.deepEqual(out.index.flatMap((e) => e.tasks.map((t) => t.no)).filter((n) => !got.has(n)), ["14-1"], "표지는 44개지만 14-1 카드는 이 파일에 없음");
  assert.equal(new Set(out.cards.map((c) => c.id)).size, 43, "카드 id가 겹치지 않음");
  for (const c of out.cards) {
    assert.deepEqual(c.parseWarnings, [], c.id);
    assert.equal(c.id, `경영관리${c.indicatorNo}/${c.taskNo}`);
    assert.ok(c.title && c.department && c.manager && c.writer, c.id);
    assert.equal(c.overview.cells.length, 4, c.id);
    assert.ok(c.feedback.rows.length >= 1 && c.findings.rows.length >= 1 && c.kpi.rows.length >= 1 && c.outcome.quantitative.length >= 1 && c.outcome.qualitative.length >= 1, c.id);
    assert.ok(c.do.lines.length >= 1 && c.do.monthly.length === 1 && c.do.monthly[0].period === "1월~8월", c.id);
    assert.equal(c.indexTitle !== null, true, `${c.id} 목차 제목`);
  }
  const byNo = (no: string) => out.cards.find((c) => c.taskNo === no)!;
  assert.deepEqual(out.cards.map((c) => c.bundle).filter((b, i, a) => b !== a[i - 1]), ["경영전략", "안전 및 책임경영", "재무성과관리", "조직 운영 및 관리", "혁신노력과 성과"]);
  // 공동 과제: 주관 부서가 앞, 협업 부서·담당자는 partners
  // 담당자 실명은 시험 글에 적지 않고 「이름 + 직위」 꼴만 봄(공개 저장소)
  const person = (role: string) => new RegExp(`^[가-힣]{2,4} ${role}$`);
  assert.deepEqual([byNo("3-3").department, byNo("3-3").team], ["경영기획본부", "경영기획팀"]);
  assert.match(byNo("3-3").manager, person("팀장"));
  assert.match(byNo("3-3").writer, person("대리"));
  assert.equal(byNo("3-3").partners.length, 1);
  const [partner] = byNo("3-3").partners;
  assert.deepEqual([partner.department, partner.team], ["운영지원단", "인사총무팀"]);
  assert.match(partner.manager, person("팀장"));
  assert.match(partner.writer, person("차장"));
  assert.equal(byNo("5-3").department, "안전관리실");
  assert.equal(byNo("5-3").partners[0].department, "경영기획본부");
  // 「지적사항 없음」에 개선방안이 여러 줄(행 병합) — 한 묶음으로
  assert.equal(byNo("4-3").findings.rows.length, 1);
  assert.deepEqual(byNo("4-3").findings.rows[0].finding, ["지적사항 없음"]);
  assert.equal(byNo("4-3").findings.rows[0].plan.length, 3);
  // 환류·추진성과가 여러 행인 카드
  assert.equal(byNo("8-1").feedback.rows.length, 2);
  assert.equal(byNo("8-1").outcome.quantitative.length, 2);
  // 지표 부칸(보직자·직원)이 있는 계량 성과지표는 한 지표로
  assert.equal(byNo("13-2").kpi.rows.length, 1);
  assert.equal(byNo("13-2").kpi.rows[0].name, "AI 윤리 수준 진단");
  // 값 칸이 두 줄에 걸치고 부칸(「-」·「직원」)이 둘째 줄에 있는 모양: 첫 줄 글만 지표 값, 둘째 줄 부칸은 sub로(한 문자열에 합치면 화면·내려받기에서 겹쳐 보임)
  assert.equal(byNo("13-2").kpi.rows[0].prev, "4.05 (보직자 대상)");
  assert.equal(byNo("13-2").kpi.rows[0].target, "보직자 4.15");
  assert.equal(byNo("13-2").kpi.rows[0].sub, "- 직원");
  // 지표명이 줄마다 따로 있는 모양(13-4)은 예전처럼 칸별로 이어 붙임
  assert.match(byNo("13-4").kpi.rows[2].name, /대국민[\s\S]*안전관리/);
  assert.equal(byNo("13-4").kpi.rows[2].sub, undefined);
  assert.deepEqual([byNo("1-1").kpi.rows[0].name, byNo("1-1").kpi.rows[0].unit, byNo("1-1").kpi.rows[0].prev, byNo("1-1").kpi.rows[0].target], ["국정과제 이행지수", "%", "100", "100(6개 복합지표)"]);
  // 추진내용의 중첩 표는 표 줄({table})로 보존
  assert.ok(byNo("1-1").do.lines.some((l) => typeof l === "object" && "table" in l));
});
