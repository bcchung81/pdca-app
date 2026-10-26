// compare-report-core.ts: 작은 가짜 입력으로 집계 값을 대조한다.
import assert from "node:assert/strict";
import test from "node:test";
import {
  type Arm,
  agreements,
  armFromName,
  armScores,
  asymmetryNote,
  axesOf,
  collectDrafts,
  detMetrics,
  flawTable,
  judgedByName,
  manifestFromNames,
  mean,
  pairedWins,
  parseJudge,
  parseManifest,
  pearson,
  ranksOf,
  scoreIndex,
  spearman,
} from "./compare-report-core.ts";

const near = (a: number | null, b: number | null) => assert.ok(a !== null && b !== null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("피어슨·스피어만: 완전 일치 1, 반대 -1, 같은 값뿐이면 null, 동순위는 평균 순위", () => {
  near(pearson([1, 2, 3], [2, 4, 6]), 1);
  near(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  near(spearman([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
  assert.equal(pearson([1], [1]), null);
  assert.deepEqual(ranksOf([5, 1, 5, 3]), [3.5, 1, 3.5, 2]);
  assert.equal(mean([]), null);
  near(mean([1, null, 3]), 2);
});

test("이름 앞머리로 팔·회차 나누기(O-·N-·V0)", () => {
  assert.deepEqual(armFromName("O-SAX"), { arm: "O", slot: "SAX" });
  assert.deepEqual(armFromName("V0"), { arm: "V0", slot: "V0" });
  assert.equal(armFromName("그냥"), null);
  const m = manifestFromNames([{ name: "O-A1", card: "c" }, { name: "N-A1", card: "c" }, { name: "V0", card: "c" }]);
  assert.deepEqual(m.arms.map((a) => a.id), ["O", "N", "V0"]);
  assert.equal(m.drafts[1].run, "A1");
});

// 가짜 라운드: 팔 x·y, 카드 c, 회차 1·2(y의 2회차는 생성 실패)
const arms: Arm[] = [{ id: "x", label: "X", effort: "high", provider: "cli" }, { id: "y", label: "Y", effort: "medium", provider: "api" }];
const manifest = parseManifest({
  round: "r",
  arms,
  drafts: [
    { name: "x__c__1", arm: "x", card: "c", run: 1, ok: true, durationMs: 2000, retries: 1, usage: { input: 100, output: 10, cached: 0 } },
    { name: "x__c__2", arm: "x", card: "c", run: 2, ok: true, durationMs: 4000, retries: 0, usage: { input: 300, output: 30, cached: 0 } },
    { name: "y__c__1", arm: "y", card: "c", run: 1, ok: true, durationMs: 1000 },
    { name: "y__c__2", arm: "y", card: "c", run: 2, ok: false, error: "시간 초과" },
  ],
});
const records = [
  { file: "x__c__1.html.json", fitEstimate: { total: 90, budget: 100 }, groundWeak: { weakShare: 0.1 }, lensCover: { count: 4 }, diagrams: { distinct: 3 } },
  { file: "x__c__2.html.json", fitEstimate: { total: 100, budget: 100 }, groundWeak: { weakShare: 0.3 }, lensCover: { count: 2 }, diagrams: { distinct: 1 } },
];
const drafts = collectDrafts(
  manifest.drafts.map((md) => ({ manifest: md, hasFile: md.ok !== false, unknownNumbers: md.arm === "x" ? (md.name.endsWith("1") ? ["1", "2"] : []) : null, warnings: md.name === "x__c__1" ? ["올해 실적: 없음", "문장: 예시"] : null })),
  scoreIndex([{ prefix: "", records }]),
);
const judges = [
  parseJudge({ judge: "J1", drafts: [{ id: "D1", scores: { 근거: 4, 논점: 2 }, overall: 6 }, { id: "D2", scores: { 근거: 2, 논점: 2 }, overall: 4 }, { id: "D3", scores: { 근거: 3, 논점: 3 }, overall: 5 }], ranking: ["D1", "D3", "D2"], common_flaws: [{ flaw: "f", drafts: ["D1", "D3", "D9"], cause: "c" }] }, "J1"),
  parseJudge({ drafts: [{ id: "D1", scores: { 근거: 5, 논점: 3 }, overall: 8 }, { id: "D2", scores: { 근거: 3, 논점: 3 }, overall: 7 }, { id: "D3", scores: { 근거: 2, 논점: 2 }, overall: 3 }], ranking: ["D1", "D2", "D3"] }, "j2-file"),
];
const key = { D1: "x__c__1", D2: "x__c__2", D3: "y__c__1" };

test("심사 평균: 심사자 동등 평균, 심사자 이름은 judge 값(없으면 파일 이름)", () => {
  assert.deepEqual(axesOf(judges), ["근거", "논점"]);
  assert.equal(judges[1].judge, "j2-file");
  const judged = judgedByName(judges, key);
  const rows = armScores(arms, drafts, judged, ["J1", "j2-file"], ["근거", "논점"]);
  near(rows[0].byJudge.J1.overall, 5);
  near(rows[0].byJudge["j2-file"].overall, 7.5);
  near(rows[0].mean.overall, 6.25);
  near(rows[0].mean.axes["근거"], 3.5);
  near(rows[1].mean.overall, 4);
  assert.equal(rows[1].n, 1);
});

test("짝 승수: 같은 카드·회차에 두 팔 점수가 있는 것만(실패·무심사 제외), 심사자별로도", () => {
  const judged = judgedByName(judges, key);
  const [p] = pairedWins(arms, drafts, judged, ["J1", "j2-file"]);
  assert.equal(p.n, 1); // 회차 2는 y가 실패
  assert.equal(p.aWins, 1); // x 1회차 평균 7 > y 1회차 평균 4
  assert.deepEqual(p.byJudge.J1, { n: 1, aWins: 1, bWins: 0, ties: 0 });
  assert.deepEqual(p.byJudge["j2-file"], { n: 1, aWins: 1, bWins: 0, ties: 0 });
});

test("일치도: 순위 스피어만·종합 피어슨", () => {
  const [g] = agreements(judges, key);
  assert.equal(g.common, 3);
  // 순위 J1: D1,D3,D2 → x1=1,y1=2,x2=3 / J2: D1,D2,D3 → 1,3,2 → 순위 상관 0.5
  near(g.spearman, 0.5);
  near(g.pearson, pearson([6, 4, 5], [8, 7, 3]));
});

test("공통 결함: 키에 없는 초안은 세지 않고 팔별 건수", () => {
  const [f] = flawTable(judges, key, drafts, arms);
  assert.deepEqual(f.byArm, { x: 1, y: 1 });
  assert.equal(f.total, 2);
});

test("결정론 지표: 값 있는 것만 평균, 없으면 null, 실패 수·토큰·시간", () => {
  const [x, y] = detMetrics(arms, drafts, true);
  near(x.fill, 0.95);
  near(x.weakShare, 0.2);
  near(x.lens, 3);
  near(x.distinct, 2);
  near(x.unknownNumbers, 1);
  near(x.blockWarnings, 1);
  near(x.infoWarnings, 1);
  near(x.retries, 0.5);
  near(x.durationSec, 3);
  near(x.inputTokens, 200);
  assert.equal(x.failed, 0);
  assert.equal(y.failed, 1);
  assert.equal(y.fill, null);
  assert.equal(y.inputTokens, null);
  assert.equal(y.unknownNumbers, null);
  near(y.durationSec, 1);
  assert.equal(detMetrics(arms, drafts, false)[0].failed, null);
});

test("비대칭 주석은 manifest의 effort·경로에서 자동, 같으면 없음", () => {
  assert.match(asymmetryNote(arms)!, /x=high · y=medium/);
  assert.equal(asymmetryNote([{ id: "a", label: "a", effort: "high" }, { id: "b", label: "b", effort: "high" }]), null);
});
