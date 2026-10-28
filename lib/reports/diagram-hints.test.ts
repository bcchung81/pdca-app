// 경평 초안 도식 고르기(lib/reports/diagram-hints.ts) 순수 로직 시험: 신호별 후보(diagramHints)·짜임 집계(kindUsage)·같은 소항목 반복(repeatedKinds).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { inspectionCardText } from "../ai/inspect.ts";
import type { Block } from "./blocks.ts";
import { diagramHints, isOwnKind, orgNames, kindUsage, ownKindsIn, repeatedKinds } from "./diagram-hints.ts";
import { NO_SEED_CARDS } from "../testing/originals.ts";


const ROOT = resolve(import.meta.dirname, "../..");
const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const first = (text: string) => diagramHints(text)[0]?.kind;

test("연도 신호: 4개 이상은 timeline:dots(연혁), 정확히 3개는 timeline(단계 흐름)", () => {
  assert.equal(first("’22년 조사 … ’23년 시범 … ’24년 확대 … ’25년 전국"), "timeline:dots");
  assert.equal(first("’23년 조사 … ’24년 시범 … ’25년 전국"), "timeline");
});

test("기관 신호: 3곳 이상이면 hub, '협조요청'처럼 요청·신청으로 끝나는 낱말은 기관으로 세지 않음", () => {
  const hints = diagramHints("과기정통부 행안부 승강기공단 협조 추진");
  assert.ok(hints.some((h) => h.kind === "hub" && /과기정통부.*행안부.*승강기공단/.test(h.why)));
  assert.deepEqual(diagramHints("과기정통부 행안부 협조요청"), [], "기관 2곳뿐(요청은 제외)이라 후보 없음");
});

test("기관 신호: 「…민주정부」·API 데이터 출처 기관(국가법령정보센터·천문연구원)만 있으면 hub가 아님(주요사업3/7-나 오탐)", () => {
  assert.deepEqual(orgNames("세계 최고 AI 민주정부 실현 중앙정부"), [], "「정부」로 끝나는 낱말은 기관이 아님");
  const text = ["국정과제: 세계 최고 AI 민주정부 실현", "국가법령정보센터(법제처) API의 실시간 연계", "천문연구원 휴일 정보 등 외부 API 실시간 연계"].join("\n");
  assert.ok(!diagramHints(text).some((h) => h.kind === "hub"));
});

test("기관 신호: 협업 낱말과 같은 줄의 기관 3곳은 hub, 근거 글에 「협업 낱말과 함께 나온 기관」을 적음", () => {
  const hub = diagramHints("한국공단·안전협회·미래재단 업무협약 체결").find((h) => h.kind === "hub");
  assert.ok(hub && /협업 낱말과 함께 나온 기관 3곳/.test(hub.why) && /한국공단/.test(hub.why), hub?.why);
});

test("기관 신호: 같은 표 칸이 <br>로 나뉘어 협조 문장과 API 문장이 다른 조각이면 API 쪽 기관은 안 셈", () => {
  const cell = "<td>과기정통부·행안부 협조 체계 구축<br>국가법령정보센터 API 연계<br/>천문연구원 API 연계</td>";
  assert.equal(diagramHints(cell).some((h) => h.kind === "hub"), false, "협조 조각의 기관은 2곳뿐");
  assert.ok(diagramHints(`${cell}<br>소방청 협력`).some((h) => h.kind === "hub"), "협업 낱말 조각 기관은 조각이 달라도 합쳐 셈(2곳 + 소방청)");
});

test("기관 신호: 「|」·칸 태그로만 이어진 표 한 행은 한 묶음 — 협업 낱말과 같은 행의 기관을 셈", () => {
  assert.ok(diagramHints("과기정통부 | 행안부 | 소방청 | 공동 수행").some((h) => h.kind === "hub"));
  assert.ok(diagramHints("<td>과기정통부</td><td>행안부</td><td>소방청 업무협약</td>").some((h) => h.kind === "hub"));
});

test("기관 신호: 낱말 끝 조사 하나는 걷고 판정(한국전력공사와→한국전력공사), 걷고 2자 미만이면 버림, 「협약 예산」 체크박스 줄은 협업 낱말이 아님", () => {
  assert.deepEqual(orgNames("한국전력공사와 동서대학교와의 행안부는 소방청에서 등"), ["한국전력공사", "동서대학교", "행안부", "소방청"]);
  assert.deepEqual(orgNames("부가 청이"), []);
  assert.equal(diagramHints("☑ 협약 예산 : 200백만원 과기정통부 행안부 소방청").some((h) => h.kind === "hub"), false);
});

test("전후·전환 신호: 한 줄에 전(기존·현행·수기…)과 후(개선·전환·→…)가 함께 있어야 compare:panels(다른 줄에 나뉘면 뜨지 않음)", () => {
  assert.equal(first("기존 방식에서 개선 방식으로 전환, As-Is → To-Be"), "compare:panels");
  assert.deepEqual(diagramHints("기존 체계는 낡았다.\n개선 방향을 검토한다."), [], "기존·개선이 각각 다른 줄이면 후보 없음");
});

test("수치 신호(경영관리): 단위 붙은 서로 다른 수 4개 이상이면 stats", () => {
  assert.equal(diagramHints("민원 1,240건 처리, 24종 분류, 63종 확인, 97% 신뢰도", {}, { track: "mg" })[0]?.kind, "stats");
});

test("수치 신호(주요사업, 2026-10-28): 핵심 수치 띠(stats) 후보를 내지 않음 — 주요사업 새 초안은 수치 띠를 쓰지 않음", () => {
  const text = "민원 1,240건 처리, 24종 분류, 63종 확인, 97% 신뢰도";
  assert.ok(!diagramHints(text).some((h) => h.kind === "stats"));
});

test("단계 신호: 3개 이상이면 steps, 4개 이상이면서 의견·한계·방향·해결이 모두 있으면 steps:zigzag(ㄹ자)만", () => {
  assert.equal(first("1단계 준비 2단계 실행 3단계 점검"), "steps");
  assert.equal(first("1단계 준비 2단계 실행 3단계 점검 4단계 마무리"), "steps", "4개여도 의견·한계·방향·해결이 다 있어야 지그재그");
  assert.equal(first("1단계 의견 수렴 2단계 한계 파악 3단계 방향 설정 4단계 해결 이행"), "steps:zigzag");
});

test("말투 신호: …요·…죠·…까로 끝난 따옴표 말은 voices", () => {
  assert.equal(first("“전자파가 걱정돼요”"), "voices");
});

test("용어 신호: 란?·이란·개념·정의·용어가 있으면 define", () => {
  assert.equal(first("AI 판독이란? 개념과 정의를 설명"), "define");
});

test("위험 신호: 리스크·위험·한계·문제점·부족·저하가 3번 이상이면 cards(병렬 칸)", () => {
  assert.equal(first("현장의 위험 요소와 문제점, 안전 리스크가 상존"), "cards");
});

test("수상 신호: 수상·공모전·우수사례·선정·장관상·표창이 있으면 case", () => {
  assert.equal(first("과기정통부 공모전 수상, 우수사례로 선정"), "case");
});

test("가치 신호: 공공성·효율성·서비스질 등 가치 낱말이 2개 이상이면 band", () => {
  assert.equal(first("공공성과 효율성을 높이는 서비스질 개선"), "band");
});

// ---------------------------------------------------------------------------
// 수치 표(table)·VS 대립(cards:vs)·Q&A(qa) 신호 — 2026-09-27 표현 보강

test("수치 표 신호: 한 줄에 단위 수치 3개 이상인 줄이 2줄 이상이면 table", () => {
  const text = "구분 | ’24년 10건 20% 5명\n구분2 | ’25년 15건 25% 6명";
  const hints = diagramHints(text);
  assert.ok(hints.some((h) => h.kind === "table"), hints.map((h) => h.kind).join(","));
  assert.deepEqual(diagramHints("’24년 10건 20% 5명"), [], "한 줄뿐이면 table 후보 없음(수치가 4개라 stats는 뜰 수 있으나 이 예시는 3개라 아무 후보 없음)");
});

test("VS 대립 신호: 찬반·입장 차이·상충·대립·VS가 있으면 cards:vs", () => {
  assert.equal(first("찬반 논쟁이 있는 사안"), "cards:vs");
  assert.equal(first("두 방식 A VS B 비교"), "cards:vs");
  assert.equal(first("입장 차이가 크다"), "cards:vs");
});

test("Q&A 신호: 「왜/어떻게 …?」 질문 글이 있으면 qa(질문 글 우선), 질문 글이 없고 extras.survey만 있어도 qa", () => {
  assert.equal(first("왜 이 사업을 하는가? 국민 편익을 위해서다."), "qa");
  assert.deepEqual(diagramHints("평범한 문장뿐"), [], "질문 글·survey 둘 다 없으면 후보 없음");
  const hints = diagramHints("평범한 문장뿐", { survey: ["평가위원 질의 하나", "질의 둘"] });
  assert.ok(hints.some((h) => h.kind === "qa" && h.why.includes("실사 질의")), hints.map((h) => h.kind).join(","));
});

test("table·cards:vs·qa는 이 과제만의 요소(own)가 아님 — 기본 도식", () => {
  assert.equal(isOwnKind("table"), false);
  assert.equal(isOwnKind("cards:vs"), false);
  assert.equal(isOwnKind("qa"), false);
});

test("실제 시드 카드(주요사업1/1-가): 도식 후보가 3개 이상이고 hub는 아님(기관 10곳이 부서·자료 출처일 뿐 협업 낱말과 같은 조각에 없음, 2026-10-14) — 월별 실적에 수치가 없어 stats도 아님(2026-10-15)", { skip: NO_SEED_CARDS }, () => {
  const seed = JSON.parse(readFileSync(join(ROOT, "seed/cards/260916/biz-260916.json"), "utf8")) as { cards: Array<Record<string, unknown>> };
  const card = seed.cards.find((c) => c.id === "주요사업1/1-가")!;
  const hints = diagramHints(inspectionCardText(card));
  assert.ok(hints.length >= 3, `후보 ${hints.length}개`);
  const kinds = hints.map((h) => h.kind);
  assert.ok(!kinds.includes("stats"), kinds.join(","));
  assert.ok(!kinds.includes("hub"), kinds.join(","));
});

test("kindUsage: 짜임 서명에서 kind별 사용 횟수를 많은 순으로, bullets·subhead는 뺌", () => {
  const usage = kindUsage(["cards → steps", "steps → chart", "cards:plain → hub"]);
  assert.deepEqual(usage[0], ["steps", 2], "steps가 두 서명에 걸쳐 가장 많이 쓰임");
  assert.ok(usage.every(([k]) => k !== "bullets" && k !== "subhead"));
  const withNoise = kindUsage(["bullets → cards", "cards → subhead"]);
  assert.deepEqual(withNoise, [["cards", 2]], "bullets·subhead는 세지 않음");
});

test("repeatedKinds: chart·bullets·subhead는 여러 번 써도 빼고, cards처럼 두 번 쓴 도식만 알림", () => {
  const blocks = [blk("cards", { label: "A" }), blk("chart", { label: "A" }), blk("cards", { label: "B" }), blk("bullets", { label: "B" }), blk("subhead")];
  assert.deepEqual(repeatedKinds(blocks), ["cards"]);
  assert.deepEqual(repeatedKinds([blk("chart"), blk("chart"), blk("bullets"), blk("bullets")]), [], "chart·bullets 반복은 알리지 않음");
});

test("긴 글(30만 자)도 빨리 끝남 — 정규식 되돌림 방지", () => {
  const t1 = performance.now();
  diagramHints("가".repeat(300_000));
  assert.ok(performance.now() - t1 < 500, "30만 자 반복 글자도 500ms 안에 끝남");

  const t2 = performance.now();
  const hints = diagramHints("협조요청 과기정통부 행안부 승강기공단 ".repeat(20_000));
  assert.ok(performance.now() - t2 < 500, "협조요청 낱말이 섞인 20,000번 반복도 500ms 안에 끝남");
  assert.ok(hints.some((h) => h.kind === "hub"), "기관 신호는 여전히 hub로 잡음");
});

// ---------------------------------------------------------------------------
// 도식 수렴 해소(③, 2026-09-27): 이 과제만의 요소(own) 갈래·순서, 기본 도식과의 정렬, isOwnKind·ownKindsIn

test("isOwnKind: quotes·voices·define·case·hub·chart만 이 과제만의 요소, compare:panels 등 기본 도식은 아님", () => {
  for (const k of ["quotes", "voices", "define", "case", "hub", "chart"]) assert.equal(isOwnKind(k), true, k);
  for (const k of ["compare:panels", "compare", "steps", "steps:zigzag", "cards", "timeline", "timeline:dots", "stats", "banner", "band", "bullets", "subhead"]) assert.equal(isOwnKind(k), false, k);
});

test("갈래 정렬: 점수가 낮아도 이 과제만의 요소(own)는 기본 도식보다 항상 앞섬", () => {
  // compare:panels 점수(2 + 3*2 = 8)가 chart(series, 점수 4)보다 높아도 own인 chart가 먼저
  const text = ["기존 방식에서 개선 방식으로 전환", "현행 체계를 개선 체계로 전환", "수기 처리를 개선 처리로 전환"].join("\n");
  const hints = diagramHints(text, { series: ["지표A: ’25년 10건 → ’26년 목표 20건"] });
  assert.deepEqual(hints.map((h) => h.kind), ["chart", "compare:panels"]);
  assert.equal(hints[0].own, true);
  assert.equal(hints[1].own, false);
});

test("지적 인용 신호(extras.critiques): quotes 후보를 만들되 점수는 가장 낮음(원문 인용·우수사례·협업 구조보다 뒤)", () => {
  const hints = diagramHints("과기정통부 공모전 수상 우수사례 선정", { critiques: ["실질적 투입 시간을 통합적으로 고려하여 성과를 재산정할 필요가 있다"] });
  const kinds = hints.map((h) => h.kind);
  assert.ok(kinds.includes("quotes"));
  assert.ok(kinds.indexOf("case") < kinds.indexOf("quotes"), "우수사례(9)가 지적 인용(3)보다 앞");
  // 지적 인용과 원문 인용(“…”)이 함께 있으면 점수가 더 센 원문 인용 쪽 why로 하나만 남음(한 종류당 하나)
  const both = diagramHints("“판독 정확도를 크게 높였다는 평가”", { critiques: ["실질적 투입 시간을 재산정할 필요가 있다"] });
  assert.equal(both.filter((h) => h.kind === "quotes").length, 1);
  assert.match(both.find((h) => h.kind === "quotes")!.why, /원문 인용/, "원문 인용(점수5)이 지적 인용(점수3)을 덮음");
});

test("막대 신호(extras.series): 같은 지표의 시점별 값이 있으면 chart(이 과제만의 요소)", () => {
  const hints = diagramHints("아무 신호도 없는 밋밋한 글", { series: ["지표A: ’25년 10건 → ’26년 목표 20건"] });
  assert.deepEqual(hints, [{ kind: "chart", why: "같은 지표의 시점별 값 1개(지표A: ’25년 10건 → ’26년 목표 20건) — 행 오른쪽 막대", own: true }]);
});

test("인용 신호 갈래: 다·마침표로 끝난 “…”는 quotes(원문 인용)만, …요·…죠·…까로 끝난 “…”는 voices(말풍선)만", () => {
  const cited = diagramHints("“판독 정확도를 크게 높였다는 평가”");
  assert.deepEqual(cited.map((h) => h.kind), ["quotes"]);
  const speech = diagramHints("“전자파가 너무 걱정되고 무서워요”");
  assert.deepEqual(speech.map((h) => h.kind), ["voices"], "말투로 끝난 인용은 voices만(quotes로 겹쳐 세지 않음)");
});

test("ownKindsIn: 블록 목록이 실제로 쓴 이 과제만의 요소 종류(중복 없이)", () => {
  assert.deepEqual(ownKindsIn([blk("bullets"), blk("compare"), blk("timeline")]), [], "기본 도식만 쓰면 빈 배열");
  assert.deepEqual(ownKindsIn([blk("hub"), blk("chart"), blk("chart"), blk("bullets")]), ["hub", "chart"], "own 종류만, 중복 없이");
});

test("59장 시드 카드 분포(실측 2026-09-27): compare:panels는 20장 이하에서 뜨고, 어느 한 도식도 1순위가 25장을 넘지 않음(2026-10-14 협업 낱말 조각만 세어 줄바꿈·<br> 조각 + 조사 걷기로 hub 17→4·chart 17→24·case 9·quotes 8→10; 같은 날 막대 후보를 ’26 실적(부서 입력)이 있을 때만 만들어 시드엔 실적이 없으니 chart 24→0·quotes 10→27·steps 5·compare:panels 2; 2026-10-15 stats 후보를 올해 실적 재료 수치 2개 이상일 때만 만들어 stats 후보 47→29장)", { skip: NO_SEED_CARDS }, () => {
  const seed = JSON.parse(readFileSync(join(ROOT, "seed/cards/260916/biz-260916.json"), "utf8")) as { cards: Array<Record<string, unknown>> };
  const stripBullet = (s: string) => s.replace(/^[∙•·\-→※]\s*/, "").trim();
  let compareCount = 0;
  let statsCount = 0;
  const rank1 = new Map<string, number>();
  for (const card of seed.cards) {
    const text = inspectionCardText(card);
    const findings = card.act && typeof card.act === "object" ? (card.act as { findings?: unknown }).findings : undefined;
    const critiques = (Array.isArray(findings) ? findings : []).filter((x): x is string => typeof x === "string").map(stripBullet).filter((x) => x.length > 5);
    // 막대(series)는 ’25 실적과 ’26 실적(부서 입력)이 둘 다 있을 때만 — 시드 카드에는 ’26 실적이 없어 늘 빈 목록(예전: 목표로 채워 chart가 1순위 24장)
    const series: string[] = [];
    // 수치 띠(stats)는 주요사업 후보에 없음(2026-10-28)
    const hints = diagramHints(text, { critiques, series });
    if (hints.some((h) => h.kind === "compare:panels")) compareCount += 1;
    if (hints.some((h) => h.kind === "stats")) statsCount += 1;
    if (hints[0]) rank1.set(hints[0].kind, (rank1.get(hints[0].kind) ?? 0) + 1);
  }
  assert.ok(compareCount <= 20, `compare:panels ${compareCount}장`);
  for (const [kind, n] of rank1) assert.ok(n <= 28, `${kind} 1순위 ${n}장`); // quotes가 막대 몫을 이어받아 27장(예전 25 상한은 chart 24 기준)
  assert.equal(rank1.get("hub"), 4);
  assert.equal(rank1.get("chart"), undefined);
  assert.equal(rank1.get("case"), 9);
  assert.equal(rank1.get("quotes"), 27);
  assert.equal(statsCount, 0, "stats 후보 없음(2026-10-28 — 예전 글의 단위 수치 4개 이상 47장 → 2026-10-15 올해 실적 재료 2개 이상 29장)");
});

// 경영관리 전용 신호(C12) — track: "mg"일 때만 켜짐
const MG = { track: "mg" } as const;
const mgKinds = (t: string, extraTexts?: string[]) => diagramHints(t, {}, { ...MG, extraTexts });
const MG_CASES: Array<[string, string, string]> = [
  ["strategy", "비전과 미션 아래 전략과제를 세웠다", "비전 없이 전략과제만 (경영관리 신호 아님)"],
  ["pdca", "계획 수립 → 평가 운영 → 성과 점검 → 보상·환류", ""],
  ["cards", "소과제 1과 소과제 2, 세부과제 3을 추진했다", ""],
  ["steps", "채용 육성 평가 보상 단계별 관리", ""],
  ["table", "정부 지침 준수 현황을 점검했다", ""],
  ["compare:table", "구분 | 주요활동 | 추진실적\n채용 | 공고 | 완료", ""],
  ["timeline", "추진경과: ’24년 착수, ’25년 확대", ""],
];

test("경영관리 신호마다 후보가 나오고, track 없이 부르면 새 후보가 안 나옴(주요사업 불변)", () => {
  for (const [kind, text] of MG_CASES) {
    const on = mgKinds(text);
    assert.ok(on.some((h) => h.kind === kind && !h.own), `${kind} 후보(mg)`);
  }
  for (const [kind, text] of MG_CASES.filter(([k]) => ["steps", "table", "compare:table", "timeline"].includes(k))) {
    assert.ok(!diagramHints(text).some((h) => h.kind === kind), `${kind}는 track 없으면 안 나옴`);
  }
  assert.ok(!diagramHints("소과제 1과 소과제 2, 세부과제 3을 추진했다").some((h) => h.kind === "cards"));
  for (const [, text] of MG_CASES) assert.deepEqual(diagramHints(text, {}, {}), diagramHints(text));
  // 같은 글이라도 track 없이 부른 결과는 옵션 객체를 줘도 그대로
  assert.deepEqual(diagramHints("채용 육성 평가 보상", {}, { extraTexts: ["소과제 소과제"] }), diagramHints("채용 육성 평가 보상"));
});

test("경영관리: extraTexts 글의 신호도 잡히고, 신호가 약하면 안 잡힘", () => {
  assert.ok(!mgKinds("추진 배경을 설명한다").some((h) => h.kind === "table"));
  assert.ok(mgKinds("추진 배경을 설명한다", ["지침 준수 점검표"]).some((h) => h.kind === "table"));
  assert.ok(!mgKinds("전략과제 하나").some((h) => h.kind === "strategy"));
  // 낱말이 흩어져 있기만 하면 PDCA·준수표가 아님(카드 43장 중 35장이 걸리던 넓은 조건 — 2026-10-12)
  assert.ok(!mgKinds("사업 계획을 세웠다\n운영 과정을 평가했다\n제도를 개선했다").some((h) => h.kind === "pdca"));
  assert.ok(!mgKinds("규정에 따라 처리했고 일정을 준수했다").some((h) => h.kind === "table"));
  // 추가 글(2025 절)은 경영관리 신호에만 — 이 과제만의 요소(우수사례 등)는 카드·첨부 글에서만
  assert.deepEqual(mgKinds("추진 배경을 설명한다", ["장관 표창 수상", "「현장이 달라졌다」고 말했다"]).filter((h) => h.own), mgKinds("추진 배경을 설명한다").filter((h) => h.own));
});

test("경영관리 신호도 긴 글(30만 자)에서 빨리 끝남", () => {
  const t = performance.now();
  mgKinds("가".repeat(300_000), ["나".repeat(300_000)]);
  mgKinds("소과제 준수 지침 채용 육성 ".repeat(20_000));
  assert.ok(performance.now() - t < 800);
});
