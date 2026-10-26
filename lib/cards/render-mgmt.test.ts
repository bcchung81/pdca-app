import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse } from "kordoc";
import { readHwp5 } from "../hwp/hwp5.ts";
import { extractCardLayouts } from "../hwp/layout.ts";
import { MGMT_INDICATORS } from "../tracks/mgmt-units.ts";
import { trackOfUnit } from "../tracks/index.ts";
import { parseMgmtMarkdown } from "./hwp/parse-mgmt.ts";
import { checkEditable, getAt } from "./edit.ts";
import { fixedSectionsOf } from "./fixed.ts";
import { buildLayouts, layoutTaskNo } from "./layout-build.ts";
import { isMgmtCard } from "./mgmt-card.ts";
import { editTargets } from "./patch.ts";
import { pathLabel, sectionTitle } from "./path-label.ts";
import { renderCard } from "./render.ts";

const card = () => ({
  id: "경영관리3/3-2",
  group: "경영관리3",
  taskNo: "3-2",
  title: "양질의 민간일자리 창출 노력",
  indicatorName: "일자리 및 균등한 기회",
  deptText: "경영기획본부(ESG혁신홍보팀)",
  department: "경영기획본부",
  manager: "김가나 팀장",
  writer: "이다라 차장",
  overview: { kind: "고도화", term: "중장기", checks: { advanced: true, new: false, shortTerm: false, longTerm: true }, cells: ["☑ 고도화과제(기존)", "□ 26년 신규과제", "□ 단기과제(~2년 미만)", "☑ 중장기과제(2년 이상)"] },
  feedback: { rows: [{ self: ["∙ 자체평가 1", "∙ 자체평가 2"], plan: ["∙ 개선방안 1"] }], headers: { self: "’25년 자체평가", plan: "’26년 개선방안" } },
  findings: { rows: [{ finding: ["∙ 지적 1"], plan: ["∙ 개선 1", "∙ 개선 2"] }], headers: { finding: "’25년 지적사항", plan: "’26년 개선방안" } },
  do: { lines: ["∙ 추진 소제목 (7월)", "- 세부"], monthly: [{ period: "1월~8월", periodTokens: ["1월", "~", "8월"], periodLines: ["1월", "~", "8월"], items: ["∙ 실적 1"] }] },
  kpi: { rows: [{ name: "신규 채용", unit: "명", prev: "10", target: "12", nameRaw: "신규 채용(명)" }], headers: { name: "지표명(단위)", prev: "’25년 실적", target: "’26년 목표" }, columns: ["name", "prev", "target"] },
  outcome: { quantitative: ["∙ 정량 1"], qualitative: ["∙ 정성 1"], headers: { quantitative: "정량 성과", qualitative: "정성 성과(기대 효과)" } },
});

test("경영관리 카드 구분: 묶음 id가 경영관리N인 카드만", () => {
  assert.ok(isMgmtCard(card()) && isMgmtCard({ group: "경영관리14" }));
  assert.ok(!isMgmtCard({ group: "주요사업1" }) && !isMgmtCard({}) && !isMgmtCard(null) && !isMgmtCard({ group: "경영관리" }));
});

test("경영관리 렌더러: renderCard가 칸 6개를 양식 순서대로 그리고, 편집 모드에서 글줄·칸마다 JSON 경로(data-p)를 단다", () => {
  const html = renderCard(card(), { editable: true });
  const order = ["과제명", "과제 개요", "전년도", "지적 및", "추진내용", "계량", "추진성과"].map((s) => html.indexOf(s));
  assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `양식 순서: ${order}`);
  assert.ok(!html.includes("[Act]") && !html.includes("[Plan]") && !html.includes("전략<br>연계성"), "주요사업 칸이 없음");
  assert.match(html, /\(과제번호 : 일자리 및 균등한 기회 3-2\)/);
  const paths = [...html.matchAll(/data-p="([^"]+)"/g)].map((m) => m[1]);
  for (const p of ["title", "deptText", "@person", "overview.cells.0", "feedback.rows.0.self.1", "feedback.rows.0.plan.0", "feedback.headers.self", "findings.rows.0.finding.0", "findings.rows.0.plan.1", "findings.headers.finding", "do.lines.0", "do.monthly.0.period", "do.monthly.0.items.0", "kpi.rows.0.nameRaw", "kpi.rows.0.prev", "kpi.rows.0.target", "outcome.quantitative.0", "outcome.qualitative.0"]) assert.ok(paths.includes(p), `data-p ${p}`);
  assert.ok(!paths.some((p) => p.startsWith("kpi.rows.0.formula")), "산식 칸이 없음");
  const view = renderCard(card());
  assert.ok(!view.includes("data-p="), "보기 모드에는 편집 표지가 없음");
  assert.equal(renderCard({ ...card(), findings: { rows: [], headers: {} } }, { editable: true }).includes("과제 개요"), true, "지적이 한 건도 없어도 그려짐");
});

test("저장 검증: 경영관리 카드는 자기 구역(과제개요·환류·지적·추진내용·계량·성과)을 보고, 주요사업 구역(act·plan…)을 요구하지 않음", () => {
  assert.equal(checkEditable(card(), card()), null);
  const noFind = { ...card(), findings: undefined };
  assert.match(checkEditable(card(), noFind) ?? "", /findings 구역이 없습니다/);
  assert.match(checkEditable(card(), { ...card(), id: "다른" }) ?? "", /id는 바꿀 수 없습니다/);
  assert.match(checkEditable({ group: "주요사업1", id: "x", taskNo: "1-가" }, { group: "주요사업1", id: "x", taskNo: "1-가", title: "t" }) ?? "", /구역이 없습니다/, "주요사업 카드는 예전 검사 그대로");
});

test("경로 이름: 전년도 환류·지적 및 개선방안 칸이 사람이 읽는 이름으로", () => {
  assert.equal(pathLabel("feedback.rows.0.self.1"), "전년도 환류 · 1행 ’25년 자체평가 · 2번째 줄");
  assert.equal(pathLabel("findings.rows.2.plan.0"), "지적 및 개선방안 · 3행 ’26년 개선방안 · 1번째 줄");
  assert.equal(pathLabel("findings.rows.0.finding.0"), "지적 및 개선방안 · 1행 ’25년 지적사항 · 1번째 줄");
  assert.equal(pathLabel("findings.headers.finding"), "지적 및 개선방안 · 지적사항 머리");
  assert.equal(sectionTitle("feedback.rows.0.self.0"), "전년도 환류");
  assert.equal(sectionTitle("findings.rows.0.plan.0"), "지적 및 개선방안");
});

test("경영관리 평가지표 14개: 번호·단위 id·카드 묶음 이름이 겹치지 않고 모두 경영관리 단위", () => {
  assert.equal(MGMT_INDICATORS.length, 14);
  assert.deepEqual(MGMT_INDICATORS.map((i) => i.no), Array.from({ length: 14 }, (_, i) => i + 1));
  assert.equal(new Set(MGMT_INDICATORS.map((i) => i.id)).size, 14);
  assert.equal(new Set(MGMT_INDICATORS.map((i) => i.group)).size, 14);
  for (const i of MGMT_INDICATORS) assert.ok(trackOfUnit(i.id) === "경영관리" && i.group === `경영관리${i.no}` && i.id === `MG-${i.no}`, i.id);
  assert.deepEqual([...new Set(MGMT_INDICATORS.map((i) => i.bundle))], ["경영전략", "안전 및 책임경영", "재무성과관리", "조직 운영 및 관리", "혁신노력과 성과"]);
});

// 실제 8월 점검 자료(이 컴퓨터 data/ — git 밖)
const REAL = resolve(import.meta.dirname, "../../data/cards/260904/cards-260904-mg.hwp");
test("실제 경영관리 카드 파일: 원본 배치 43장이 과제번호로 짝지어지고 잇기 적중률 97% 이상, 묶음 제목 줄은 앞 카드 배치에 안 붙고, 편집 칸은 모두 카드 JSON 글 값을 가리킴(파일이 없으면 건너뜀)", { skip: !existsSync(REAL) && "원본(data/cards/260904/cards-260904-mg.hwp)이 없음" }, async () => {
  const bytes = new Uint8Array(readFileSync(REAL));
  const res = await parse(Buffer.from(bytes));
  assert.ok(res.success);
  const parsed = parseMgmtMarkdown(res.markdown, { sourceName: "cards-260904-mg.hwp", fileType: "hwp" });
  const doc = readHwp5(bytes);
  const layouts = extractCardLayouts(doc);
  assert.equal(layouts.length, 43, "8-x 카드(첫 칸 「과제(과제번호)」)까지 카드 표로 인식");
  assert.deepEqual(layouts.map((l) => layoutTaskNo(l)), parsed.cards.map((c) => c.taskNo), "배치의 과제번호(지표명 뒤 N-M)가 카드와 같은 차례");
  // 묶음 제목 줄(「[안전 및 책임경영]」)과 그 뒤 목차 표는 앞 카드(2-3) 배치에 안 붙음
  const l23 = layouts[parsed.cards.findIndex((c) => c.taskNo === "2-3")];
  const text = JSON.stringify(l23.blocks);
  assert.ok(!text.includes("안전 및 책임경영") && !text.includes("일자리 및 균등한"), "2-3 배치에 다음 묶음 제목·목차가 없음");
  const { built, skipped } = buildLayouts(doc, parsed.cards);
  assert.equal(skipped.length, 0);
  assert.equal(built.length, 43);
  for (const b of built) assert.ok(b.stats.bound / b.stats.targets >= 0.97, `${parsed.cards[b.index].taskNo} ${b.stats.bound}/${b.stats.targets}`);
  // 편집 칸 왕복 계약: data-p가 가리키는 값은 글(문자열)이어야 편집기가 그대로 씀
  for (const c of parsed.cards) {
    const html = renderCard(c, { editable: true });
    // 빈 칸의 자리표시(data-empty — 쓰면 줄이 생김)는 값이 아직 없는 것이 정상
    const bad = [...html.matchAll(/<[^>]*data-p="([^"]+)"[^>]*>/g)].filter((m) => !m[0].includes('data-empty="1"')).map((m) => m[1]).filter((p) => p !== "@person" && typeof getAt(c, p.replace(/#\d+$/, "")) !== "string");
    assert.deepEqual(bad, [], c.id);
  }
});

test("경영관리 고정 영역 잠금: 전년도 환류·지적 및 개선방안·계량지표 칸만 잠기고(부서 작성본) 추진내용·월별 실적·추진성과는 고칠 수 있음", () => {
  const targets = editTargets(card(), [...fixedSectionsOf(card())]);
  const locked = [...targets].filter(([, t]) => t.locked).map(([p]) => p.split(".")[0]);
  const open = [...targets].filter(([, t]) => !t.locked).map(([p]) => p.split(".")[0]);
  assert.deepEqual([...new Set(locked)].sort(), ["feedback", "findings", "kpi"]);
  assert.ok(open.includes("do") && open.includes("outcome"), "추진내용·추진성과는 잠기지 않음");
  assert.ok(!open.some((k) => ["feedback", "findings", "kpi"].includes(k)), "잠긴 구역에 열린 칸이 없음");
});
