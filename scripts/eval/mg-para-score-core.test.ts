// 절별 채점(mg-para-score-core.ts) 시험 — 가짜 글만(기관 원문 없음). A1~A4·C1~C5·D1~D5·E1~E5 통과/실패, 심사 답 검사, 합계.
import assert from "node:assert/strict";
import test from "node:test";
import type { Block } from "../../lib/reports/blocks.ts";
import { type Baseline, type ScoreMeta, type ScoreOptions, type ScoreSpec, isPerfLine, judgeFailed, judgeItems, ledgerLines, qtyKey, qtyTokens, scoreCard, scoreMarkdown, totalsOf } from "./mg-para-score-core.ts";

const blk = (o: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...o });
const cell = (bullets: string[], head = "") => ({ head, tag: "", bullets, note: "" });
const part = { key: "1.1.가", title: "가짜 절", themeTitle: "가짜 대주제", mark: "가" };
const meta = (o: Partial<ScoreMeta> = {}): ScoreMeta => ({ warnings: [], unknownNumbers: [], outlineWarnings: [], ...o });
const one = (blocks: Block[], m = meta(), planBlocks: number | null = null, o: ScoreOptions = {}) => {
  const spec: ScoreSpec = { blocks, at: blocks.map(() => part.key), parts: [part] };
  const r = scoreCard(spec, m, planBlocks, o);
  const get = (id: string) => [...r.sections[0].items, ...r.overall].find((i) => i.id === id)!;
  return get;
};
const LONG = "가짜 시스템을 2건 새로 열어 담당자가 직접 확인하는 절차를 만들었다";

test("A1 불릿 평균 20자 · A2 10자 이하 10% · 추진성과 라벨은 뺌", () => {
  assert.equal(one([blk({ items: [LONG, LONG] })])("A1").pass, true);
  assert.equal(one([blk({ items: ["짧은 불릿 하나", "짧은 둘"] })])("A1").pass, false);
  assert.equal(one([blk({ label: "추진성과", items: ["짧음"] }), blk({ items: [LONG] })])("A1").pass, true);
  assert.equal(one([blk({ items: [LONG, LONG] })])("A2").pass, true);
  assert.equal(one([blk({ items: [LONG, "짧은 글"] })])("A2").pass, false);
});

test("A3 날짜만 불릿", () => {
  assert.equal(one([blk({ items: [LONG] })])("A3").pass, true);
  assert.equal(one([blk({ items: [LONG, "~8월"] })])("A3").pass, false);
});

test("A4 구체어 — 숫자·묶음·영문 약어, 추진배경·bullets 블록은 제외", () => {
  const cards = (t: string) => blk({ kind: "cards", label: "추진내용", cells: [cell([t]), cell([t])] });
  assert.equal(one([cards("관련 규정을 고쳐 절차를 바꿨다")])("A4").pass, false);
  assert.equal(one([cards("관련 규정을 2건 고쳤다")])("A4").pass, true);
  assert.equal(one([cards("‘가짜 제도’를 바꿨다")])("A4").pass, true);
  assert.equal(one([cards("JSON 형식으로 바꿨다")])("A4").pass, true);
  assert.equal(one([blk({ items: ["구체어가 없는 불릿"] }), blk({ kind: "compare", label: "추진배경", cells: [cell(["구체어 없음"])] })])("A4").pass, true);
});

test("E4 상자 채움(옛 A5) — 나란한 칸 줄 수가 크게 다르면 실패", () => {
  const long = "가짜 시스템을 새로 열어 담당자가 직접 확인하는 절차를 만들고 그 결과를 부서에 알리는 체계를 갖췄다. ".repeat(3);
  const hollow = blk({ kind: "cards", label: "추진내용", cells: [cell([long, long, long]), cell(["짧음"])] });
  const even = blk({ kind: "cards", label: "추진내용", cells: [cell([long]), cell([long])] });
  assert.equal(one([hollow])("E4").pass, false);
  assert.equal(one([even])("E4").pass, true);
});

test("C1~C3 절 항목", () => {
  const v = (kind: Block["kind"]) => blk({ kind });
  assert.equal(one([v("cards"), v("cards")])("C1").pass, false);
  assert.equal(one([v("table"), v("table"), v("cards")])("C1").pass, true);
  assert.equal(one([v("cards"), v("steps")])("C2").pass, true);
  assert.equal(one([v("bullets"), v("cards")])("C2").pass, false);
  assert.equal(one([v("cards"), v("hub")])("C3").pass, true);
  assert.equal(one([v("cards"), v("steps")])("C3").pass, false);
});

test("C4 모양 다양성 · C5 구성안 그대로", () => {
  const v = (kind: Block["kind"], variant = "") => blk({ kind, variant });
  assert.equal(one([v("cards", "plain"), v("steps", "row"), v("bullets")])("C4").pass, true);
  assert.equal(one([v("cards", "plain"), v("cards", "plain"), v("cards", "plain")])("C4").pass, false);
  const b = [v("cards")];
  assert.equal(one(b)("C5").pass, true);
  assert.equal(one(b, meta({ warnings: ["막대: 실적 값이 2개 미만이라 뺐습니다"] }))("C5").pass, false);
  assert.equal(one(b, meta({ outlineWarnings: ["구성안: 여는 블록이 지적 대응에서 시작"] }))("C5").pass, false);
  assert.equal(one(b, meta(), 2)("C5").pass, false);
  assert.equal(one(b, meta(), 1)("C5").pass, true);
});

test("D1~D5 전체 항목", () => {
  const b = [blk({ items: [LONG] })];
  const ok = one(b);
  for (const id of ["D1", "D2", "D3", "D4", "D5"]) assert.equal(ok(id).pass, true, id);
  assert.equal(one(b, meta({ unknownNumbers: ["12"] }))("D1").pass, false);
  assert.equal(one(b, meta({ warnings: ["실적 칸: 「…」 — 계획이 실적 칸에 있음"] }))("D2").pass, false);
  assert.equal(one(b, meta({ warnings: ["글 모양: 괄호 짝이 안 맞는 글 1개"] }))("D3").pass, false);
  assert.equal(one(b, meta({ warnings: ["분량: 어림 300mm"] }))("D4").pass, false);
  assert.equal(one([blk({ items: ["실적은 【확인: 가짜 값】 이고 【확인: 다른 값】 이다"] })])("D5").pass, false);
  assert.equal(one([blk({ items: ["실적은 【확인: 가짜 값】 이다"] })])("D5").pass, true);
});

test("심사 답 — 6개 한 번씩, 근거 인용 없는 예는 아니오, 실패는 전부 실패", () => {
  const items = ["B1", "B2", "B3", "B4", "B5", "B6"].map((id) => ({ id, pass: true, quote: "가짜 인용", why: "이유" }));
  assert.equal(judgeItems({ items, core: "핵심 문장" })!.every((i) => i.pass), true);
  const noQuote = items.map((i) => (i.id === "B3" ? { ...i, quote: " " } : i));
  assert.equal(judgeItems({ items: noQuote, core: "x" })!.find((i) => i.id === "B3")!.pass, false);
  assert.equal(judgeItems({ items: items.slice(1), core: "x" }), null);
  assert.equal(judgeItems({ items: [...items.slice(1), items[1]], core: "x" }), null);
  assert.equal(judgeItems("엉뚱"), null);
  assert.equal(judgeFailed("시간 초과").every((i) => !i.pass), true);
});

test("합계 — 항목 하나가 실패하면 그 묶음 소계만 깎임, 보고서에 실패 한 줄", () => {
  const spec: ScoreSpec = { blocks: [blk({ items: [LONG, "~8월"] })], at: [part.key], parts: [part] };
  const r = scoreCard(spec, meta());
  const t = totalsOf(r.sections, r.overall);
  assert.equal(t.A.total, 4);
  assert.equal(t.A.pass, 2); // A2(짧은 불릿 50%)·A3(날짜만) 실패
  assert.equal(t.D.pass, 5);
  assert.equal(t.B.total, 0);
  const md = scoreMarkdown([{ card: "가짜카드", ...r }], false);
  assert.match(md, /- A3 가짜카드 절 1\.1\.가/);
});

const base: Baseline = { metrics: { "MG-9": { qtyPerPage: 20, perfPerSection: 1.5 } } };
const withBase = (o: ScoreOptions = {}): ScoreOptions => ({ baseline: base, metric: "MG-9", pages: 1, ...o });

test("수량 토큰 — 단위 붙은 수만, 날짜·개월·시점은 뺌", () => {
  assert.deepEqual(qtyTokens("서비스 15% 확대(64건→79건), 3년 연속 1등급, 2만 명, 185만원"), ["15%", "64건", "79건", "3년 연속", "2만", "185만"]);
  assert.equal(qtyTokens("6월 23일 기관장 회의, ’25.11 제정, 6개월 운영, 1등급").length, 0);
  assert.equal(qtyKey("104개소"), qtyKey("104 개"));
  assert.equal(qtyKey("12,025건"), "12025건");
  assert.equal(isPerfLine("비용 91%↓"), true);
  assert.equal(isPerfLine("5단계 → 2단계"), true);
  assert.equal(isPerfLine("우수 등급 달성"), false);
});

test("E1 쪽당 수량 토큰 — 2025 쪽당 값의 70% 이상(없으면 셈하지 않음)", () => {
  const dense = [blk({ items: ["가짜 지표 10건 처리 20명 교육 30% 향상 4회 운영 5점 상승 6곳 확대 7종 구축 8편 발간 9배 증가 10개 마련 11억원 절감 12시간 단축 13단계 개선 14항목 정비"] })];
  assert.equal(one(dense, meta(), null, withBase({ pages: 1 }))("E1").pass, true);
  assert.equal(one(dense, meta(), null, withBase({ pages: 3 }))("E1").pass, false);
  assert.equal(one(dense, meta(), null, { pages: 1 })("E1"), undefined);
});

test("E2 원장 성과 사용률 — 80% 이상, 원장 수량 없으면 통과", () => {
  const ledger = ["성과 12건 처리", "만족도 4.5점", "비용 20% 절감", "교육 30명", "참여 5회"];
  const used = (n: number) => [blk({ items: ledger.slice(0, n).map((l) => `가짜 근거 ${l}`) })];
  assert.equal(one(used(5), meta(), null, { ledger })("E2").pass, true);
  assert.equal(one(used(4), meta(), null, { ledger })("E2").pass, true);
  assert.equal(one(used(3), meta(), null, { ledger })("E2").pass, false);
  assert.equal(one(used(1), meta(), null, { ledger: ["성과 없음"] })("E2").pass, true);
  assert.equal(one(used(1))("E2"), undefined);
});

test("E3 계획 표현 — 절당 「예정·계획」 1곳 이하", () => {
  assert.equal(one([blk({ items: ["내년에 확대할 예정이다"] })])("E3").pass, true);
  assert.equal(one([blk({ items: ["내년에 확대할 예정이다", "운영 계획을 세웠다"] })])("E3").pass, false);
  assert.equal(one([blk({ label: "추진성과", title: "계획 제목은 본문이 아님", items: ["가짜 성과 3건"] })])("E3").pass, true);
});

test("E5 성과 수 — 초안 전체: 닫는 추진성과 성과 줄 합 ÷ 절 수가 2025 절 평균 이상", () => {
  const close = (items: string[]) => blk({ label: "추진성과", items });
  const two = (blocks: Block[], at: string[], o: ScoreOptions) => {
    const p2 = { ...part, key: "1.1.나" };
    return scoreCard({ blocks, at, parts: [part, p2] }, meta(), null, o).overall.find((i) => i.id === "E5");
  };
  // 절 2개 중 뒤 절만 성과 3줄로 닫아도 3/2 = 1.5 ≥ 1.5 (중간 절이 추진성과 없이 끝나는 관례)
  const ok = two([blk({ items: ["성과 아님"] }), close(["성과 3건 달성", "비용 20%↓", "5단계 → 2단계"])], [part.key, "1.1.나"], withBase());
  assert.equal(ok?.pass, true);
  assert.equal(two([blk({ items: ["성과 아님"] }), close(["성과 3건 달성", "우수 등급 달성"])], [part.key, "1.1.나"], withBase())?.pass, false);
  assert.equal(one([blk({ items: ["성과 3건", "성과 4건"] })], meta(), null, withBase())("E5").pass, false, "추진성과 라벨 블록이 없으면 0줄");
  const stats = [blk({ kind: "stats", label: "추진성과", cells: [{ head: "10건 → 20건", tag: "", bullets: [], note: "’26년" }, { head: "", tag: "", bullets: ["참여 5회 확대"], note: "" }] })];
  assert.equal(one(stats, meta(), null, withBase())("E5").pass, true);
  assert.equal(one(close(["성과 3건"]) ? [close(["성과 3건"])] : [], meta(), null, { baseline: base, metric: "MG-1" })("E5"), undefined, "기준값 없으면 셈하지 않음");
});

test("합계에 E 소계, 보고서에 E 열", () => {
  const spec: ScoreSpec = { blocks: [blk({ items: ["내년에 확대할 예정이다 그리고 운영 계획도 있다"] })], at: [part.key], parts: [part] };
  const r = scoreCard(spec, meta());
  const t = totalsOf(r.sections, r.overall);
  assert.equal(t.E.total, 2); // E3·E4 (기준값·원장 없음)
  assert.equal(t.E.pass, 1);
  const md = scoreMarkdown([{ card: "가짜카드", ...r }], false);
  assert.match(md, /\| E \|/);
  assert.match(md, /- E3 가짜카드 절 1\.1\.가/);
});

test("원장 성과 줄 — 정량 성과 칸 전체(예정·예상·목표 줄 뺌) + 월별 표의 예정 열이 아닌 칸", () => {
  const th = (t: string) => ({ th: true, lines: [t], colspan: 1, rowspan: 1 });
  const td = (t: string) => ({ th: false, lines: [t], colspan: 1, rowspan: 1 });
  const card = {
    outcome: { quantitative: ["∙ 신규 등록 31건", "(계획대비 3배)", "∙ 연말 30건 예정", "∙ 목표 50%"] },
    do: { monthly: [{ period: "1월~8월", items: ["일반 글 3건", { table: { rows: [[th("[~7월]"), th("[8월](진행중)"), th("[9월](예정)")], [td("교육 4회"), td("등록 31건"), td("예정 20건")]] } }] }] },
  };
  assert.deepEqual(ledgerLines(card), ["∙ 신규 등록 31건 (계획대비 3배)", "일반 글 3건", "교육 4회", "등록 31건"]);
  assert.deepEqual(ledgerLines({}), []);
});
