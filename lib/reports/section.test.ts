import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Block, blockSignature } from "./blocks.ts";
import type { YearActuals } from "./actuals.ts";
import type { DiagramHint } from "./diagram-hints.ts";
import { FIT_BAND, type FitReport, PAGE_MM, blockAreaMm, fitReport } from "./fit.ts";
import type { LensRef } from "./lens.ts";
import type { PriorPick } from "./prior.ts";
import { reportDraftPrompts } from "../prompts/sets.ts";
import { markRoots, sectionDocument, sectionHtml } from "./section-html.ts";
import { LADDER_LABELS, clipLine, composeIssues, draftEvidence, figureCap, figurePlaceIssues, fitPrompt, moduleGuide, quoteFoundIn, type SectionContext, recheckSection, resultExtras, resultRepeatIssue, sectionHints, sectionText, sourceKey, type SectionOutput, SectionOutputSchema, cardNumbers, numberTokens, readSection, reportTypography, sectionContext, sectionPrompt, siblingLayout, styleWarnings, verifySection } from "./section.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const seed = { cards: seedCards<Record<string, any>>() };
const group = (g: string) => seed.cards.filter((c) => c.group === g).map((c) => ({ id: c.id, taskNo: c.taskNo, targetBusiness: c.targetBusiness, executionTaskNo: c.executionTaskNo, executionTask: c.executionTask }));
const card = seed.cards.find((c) => c.id === "주요사업1/1-가")!;
// 경평 초안 프롬프트(resources/prompts/report-draft) — 적응문 규칙 검사는 시스템 프롬프트 틀(system.md)에서
const P = reportDraftPrompts().prompts;
const REPORT_ADAPTER = P.system.system;

test("지적사항 없음 카드는 지적개선 마커가 안 붙음", { skip: NO_SEED_CARDS }, () => {
  for (const f of ["∙ 경영평가 지적사항 없음", "∙ 해당없음", "∙ 해당사항 없음", "-"]) {
    const c = { ...card, act: { ...card.act, findings: [f] } };
    assert.ok(!sectionContext(c, group("주요사업1")).markers.includes("지적개선"), f);
  }
});

test("번호·마커는 코드가: 대상사업 N·실행과제 N-M·소항목 가·마커(지적개선·AI)·쪽 모듈(AX 붙임 1쪽)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  assert.deepEqual(ctx.business, { no: 1, name: "전파품질 향상" });
  assert.equal(ctx.task.no, "1-1");
  assert.equal(ctx.task.title, card.executionTask);
  assert.equal(ctx.mark, "가");
  assert.deepEqual(ctx.markers, ["지적개선", "AI"]);
  assert.equal(ctx.module, 1);
  // 둘째 대상사업 카드는 대상사업2, 그 안 실행과제는 1부터
  const second = seed.cards.find((c) => c.group === "주요사업1" && c.targetBusiness !== card.targetBusiness)!;
  const c2 = sectionContext(second, group("주요사업1"));
  assert.equal(c2.business.no, 2);
  assert.match(c2.task.no, /^2-\d$/);
  assert.match(sectionPrompt(P, card, ctx, 2026), /대상사업1 전파품질 향상 › 실행과제 1-1 .* › 소항목 가\./);
});

// ---------------------------------------------------------------------------
// 머리 모드 판면 예산(사업 단위 조판, 2026-09-27) — sectionContext.head

test("sectionContext.head: 과제번호 순서로 앞 과제와 대상사업이 다르면 all, 실행과제 번호만 다르면 task, 둘 다 같으면 sub", { skip: NO_SEED_CARDS }, () => {
  const g1 = group("주요사업1");
  const at = (id: string) => sectionContext(g1.find((c) => c.id === id)!, g1).head;
  assert.equal(at("주요사업1/1-가"), "all", "그룹의 첫 과제(대상사업이 처음 나옴)");
  assert.equal(at("주요사업1/1-나"), "sub", "바로 앞(1-가)과 대상사업·실행과제 모두 같음");
  assert.equal(at("주요사업1/2-가"), "task", "바로 앞(1-라)과 대상사업은 같고 실행과제만 다름");
  assert.equal(at("주요사업1/5-가"), "all", "바로 앞(4-나)과 대상사업이 다름(전파품질 향상 → 전파자원 공급)");
});

test("sectionContext.head: 59장 실측 분포 all 6 · task 19 · sub 34", { skip: NO_SEED_CARDS }, () => {
  const counts = { all: 0, task: 0, sub: 0 };
  for (const g of ["주요사업1", "주요사업2", "주요사업3"]) {
    const rows = group(g);
    for (const c of rows) counts[sectionContext(seed.cards.find((x) => x.id === c.id)!, rows).head] += 1;
  }
  assert.deepEqual(counts, { all: 6, task: 19, sub: 34 });
  assert.equal(counts.all + counts.task + counts.sub, 59);
});

test("verifySection: spec.head가 ctx.head 그대로 담김", { skip: NO_SEED_CARDS }, () => {
  const g1 = group("주요사업1");
  const sub = seed.cards.find((c) => c.id === "주요사업1/1-나")!;
  const ctxAll = sectionContext(card, g1);
  const ctxSub = sectionContext(sub, g1);
  assert.equal(verifySection(out(), card, ctxAll).spec.head, "all");
  assert.equal(verifySection(out(), sub, ctxSub).spec.head, "sub");
});

test("숫자 조각: 쉼표·소수·%, 연도(’25·2026년)·한 자리 수는 대조하지 않음", { skip: NO_SEED_CARDS }, () => {
  assert.deepEqual(numberTokens("’25년 30,706건 → 45,000건(150%), 1.5만 시간, 3개 과제, 2026년, 7.6. 회의"), ["30,706", "45,000", "150%", "1.5", "7.6"]);
  const known = cardNumbers(card);
  assert.ok(known.has("45000") && known.has("4.5") && known.has("150%"));
  // 괄호 속 월.일 날짜(카드의 「9월 4일」을 줄여 쓴 것)는 숫자가 아님 — 월·일 범위 밖이거나 단위가 붙으면 숫자
  assert.deepEqual(numberTokens("계약 완료(9.4), 회의(7.6.), 기간(~10.31), 신뢰도(9.4%), 점수(13.5)"), ["9.4%", "13.5"]);
  assert.deepEqual(numberTokens("’26.8 기준･~10.9 운영, (최대 16주, ~10.9)"), ["16"], "물결 뒤 월.일은 뒤에 무엇이 오든 날짜(카드·초안 같은 규칙 — H 3/4-나)");
  assert.deepEqual(numberTokens("회의(7.6.), 기간(~10.31)", { dates: true }), ["7.6", "10.31"], "근거 쪽은 날짜도 셈(dates)");
});

test("근거의 괄호 속 날짜는 아는 숫자 — 초안이 괄호 없이 같은 날짜를 써도 없는 숫자가 아니고, 근거에 없는 날짜는 그대로 잡힘(2026-10-10 계획서 §10 E2: 라운드 V 1/2-가 「기관장회의 6.23」 오탐)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const evidence = "전파유관기관장 회의 주요안건 논의(6.23.) 및 시험타워 현장 테스트(6.16.)";
  const o = out({ blocks: [blk({ kind: "timeline", label: "추진경과", cells: [{ head: "기관장회의 6.23", tag: "", bullets: ["주요안건 논의"], note: "" }, { head: "현장 테스트 6.16", tag: "", bullets: ["추가 검증"], note: "" }, { head: "보고회 7.15", tag: "", bullets: ["결과 보고"], note: "" }] })], results: [] });
  assert.deepEqual(verifySection(o, card, ctx, evidence).unknownNumbers, ["7.15"]);
  assert.deepEqual(verifySection(o, card, ctx).unknownNumbers, ["6.23", "6.16", "7.15"], "근거에 없으면 날짜도 잡음");
  const spec = verifySection(o, card, ctx, evidence).spec;
  assert.deepEqual(recheckSection(spec, card, evidence).unknownNumbers, ["7.15"], "다시 점검도 같은 규칙");
});

type OutBlock = SectionOutput["blocks"][number];
const blk = (b: Partial<OutBlock> & Pick<OutBlock, "kind">): OutBlock => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as OutBlock;
const cell = (head: string, bullets: string[] = [], tag = "", note = "") => ({ head, tag, bullets, note });
function out(over: Partial<SectionOutput> = {}): SectionOutput {
  return {
    title: "가. “철탑 오름 없이 안전하게” AI 안테나 판독 전국 확산",
    story: "단계 전개형",
    blocks: [
      blk({ kind: "bullets", label: "추진배경", items: ["- 고소 작업 위험 해소 필요", "고소 작업 <script>"] }),
      blk({ kind: "compare", label: "추진내용", rows: [{ key: "판독", before: ["현장 확인"], after: ["AI 판독 45,000건"] }] }),
      blk({ kind: "steps", label: "추진내용", cells: [cell("자료 수집")] }),
      blk({ kind: "timeline", cells: [cell("’25년 수도권", ["북서울본부 운영"]), cell("’26년 전국", ["전국 본부 확산"])] }),
    ],
    results: ["검사 소요시간 약 1.5만 시간 절감 예상", "판독 정확도 98% 달성"],
    resultCards: [],
    caption: "AI 판독 전후 비교",
    ...over,
  };
}

test("검증(v3 블록): 칸이 모자란 블록 버림·글머리 기호와 꺾쇠 걷기·제목 앞 '가.' 떼기·이야기 틀·카드에 없는 숫자 경고", { skip: NO_SEED_CARDS }, () => {
  assert.ok(SectionOutputSchema.safeParse(out()).success);
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx);
  assert.equal(v.spec.version, 3);
  assert.deepEqual(v.spec.rows, [], "v3은 고정 행 없음");
  assert.deepEqual(v.spec.blocks?.map((b) => [b.kind, b.label]), [["bullets", "추진배경"], ["compare", "추진내용"], ["timeline", ""]], "단계 1칸짜리 steps는 버림");
  assert.deepEqual(v.spec.blocks?.[0].items, ["고소 작업 위험 해소 필요", "고소 작업 script"], "글머리 기호·꺾쇠 걷음");
  assert.equal(v.spec.story, "단계 전개형");
  assert.equal(v.spec.sub.title, "“철탑 오름 없이 안전하게” AI 안테나 판독 전국 확산");
  assert.deepEqual(v.unknownNumbers, ["98%"], "98%는 카드에 없음");
  assert.ok(v.warnings.some((w) => w.includes("카드에 없는 숫자 1개")));
  assert.ok(!v.warnings.some((w) => w.startsWith("도식 블록이")), "시각 블록 2개(비교·연도 흐름)면 경고 없음");
  assert.ok(verifySection(out({ blocks: [out().blocks[0]] }), card, ctx).warnings.some((w) => w.startsWith("도식 블록이 2개보다 적습니다")));
  assert.equal(readSection(JSON.parse(JSON.stringify(v.spec)))?.task.no, "1-1");
  assert.equal(readSection({ version: 2 }), null);
  assert.equal(readSection({ version: 3, rows: [] }), null, "v3인데 blocks 없음");
});

test("첨부 자료: 프롬프트에 자료마다 이름·전체 글(자르지 않음 — PDF도 글, 참고자료 1단계)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  assert.doesNotMatch(sectionPrompt(P, card, ctx, 2026), /첨부 자료/, "첨부가 없으면 카드만");
  const p = sectionPrompt(P, card, ctx, 2026, [
    { name: "9월 결과보고.hwp", text: "LTE-R 준공검사 3건, 누적 측정 구간 1,240km" },
    { name: "보도자료.pdf", text: "PDF에서 뽑은 글" },
  ]);
  assert.match(p, /「첨부 자료」 2건 — .*전체 글\(자르지 않음/);
  assert.match(p, /\[첨부 1\] 9월 결과보고\.hwp — [^\n]+\nLTE-R 준공검사 3건, 누적 측정 구간 1,240km/);
  assert.match(p, /\[첨부 2\] 보도자료\.pdf — [^\n]+\nPDF에서 뽑은 글/);
  assert.doesNotMatch(p, /원본 문서\(PDF\)|앞부분만/);
  assert.ok(p.indexOf("「카드」") < p.indexOf("「첨부 자료」"), "카드가 뼈대(먼저)");
  // 예전 합계 15만 자 상한을 넘는 자료 둘도 끝까지
  const big = (ch: string) => `${ch.repeat(100_000)} 끝`;
  const p2 = sectionPrompt(P, card, ctx, 2026, [
    { name: "a.hwp", text: big("가") },
    { name: "b.hwp", text: big("나") },
  ]);
  assert.ok(p2.includes(big("가")) && p2.includes(big("나")));
});

test("숫자 대조 근거(draftEvidence): 첨부 6만 자 뒤 숫자도 「없는 숫자」가 아님 — AI가 본 글과 대조하는 글이 같음(참고자료 P5 회귀)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({ results: ["판독 정확도 98% 달성", "누적 측정 구간 1,240km"] });
  const actuals = { kpi: [], monthly: [] } as unknown as Parameters<typeof draftEvidence>[3];
  const file = { name: "결과보고.hwpx", text: `${"가".repeat(70_000)}\n정확도 98% · 누적 측정 구간 1,240km` };
  const { known, quoteOnly } = draftEvidence([file], [], [], actuals);
  assert.ok(known.includes("1,240km"), "전체 글이 근거에 들어감");
  assert.deepEqual(verifySection(o, card, ctx, known, [], quoteOnly).unknownNumbers, []);
  // 평가 기준·지적(실사 밖 관점)은 인용 대조에만 — 그 숫자는 아는 숫자가 아님
  const lens: LensRef[] = [
    { group: "survey", key: "s", title: "실사", where: "", text: "측정 구간 1,240km" },
    { group: "criteria", key: "c", title: "기준", where: "", text: "정확도 98%" },
  ];
  const ev = draftEvidence([], [], lens, actuals);
  assert.deepEqual(verifySection(o, card, ctx, ev.known, [], ev.quoteOnly).unknownNumbers, ["98%"]);
});

test("숫자 대조 근거(draftEvidence linked): 이 과제에 연결된 2025 보고서 절·실사 답변의 수치는 아는 숫자, 연결된 평가위원 지적 수치는 아님(라운드 S·T·U 3-2-가 3,160건)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({ results: ["오디오 콘텐츠 배포 3,160건", "판독 정확도 98% 달성", "만족도 85.376점"] });
  const actuals = { kpi: [], monthly: [] } as unknown as Parameters<typeof draftEvidence>[3];
  const linked = [
    { unitType: "report_section", text: "전년 대비 14% 보급 확대(3,160건)" },
    { unitType: "qa_pair", text: "정확도 98%를 달성하였습니다" },
    { unitType: "evaluator_comment", text: "목표에 미치지 못하는 85.376을 기록" },
  ];
  const ev = draftEvidence([], [], [], actuals, linked);
  assert.deepEqual(verifySection(o, card, ctx, ev.known, [], ev.quoteOnly).unknownNumbers, ["85.376"]);
  assert.deepEqual(verifySection(o, card, ctx, draftEvidence([], [], [], actuals).known).unknownNumbers, ["3,160", "98%", "85.376"], "연결을 안 넘기면 예전과 같음");
});

test("숫자 대조: 첨부 자료에 있는 숫자는 아는 숫자 — 카드에도 첨부에도 없는 숫자만 붉은 점선", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({ results: ["판독 정확도 98% 달성", "누적 측정 구간 1,240km"] });
  const bare = verifySection(o, card, ctx);
  assert.deepEqual(bare.unknownNumbers, ["98%", "1,240"]);
  assert.ok(bare.warnings.some((w) => w.startsWith("카드에 없는 숫자 2개")));
  const part = verifySection(o, card, ctx, "결과보고(9.26.): 누적 측정 구간 1,240km");
  assert.deepEqual(part.unknownNumbers, ["98%"]);
  assert.ok(part.warnings.some((w) => w.startsWith("카드·첨부 자료에 없는 숫자 1개")));
  assert.deepEqual(verifySection(o, card, ctx, "정확도 98 % · 1240 km").unknownNumbers, [], "쉼표·단위 띄어쓰기가 달라도 같은 수");
});

test("초안 spec의 근거 자료(sources)는 저장 뒤 다시 읽어도 그대로", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const spec = { ...verifySection(out(), card, ctx).spec, sources: [{ kind: "card" as const, id: "m1", name: "9월 결과보고.hwp" }] };
  assert.deepEqual(readSection(JSON.parse(JSON.stringify(spec)))?.sources, [{ kind: "card", id: "m1", name: "9월 결과보고.hwp" }]);
  assert.equal(readSection(JSON.parse(JSON.stringify(verifySection(out(), card, ctx).spec)))?.sources, undefined, "옛 초안(카드만)은 sources 없음");
});

test("HTML: 이스케이프·마커·도식·추진성과, 모르는 숫자는 붉은 점선, 내려받기 문서는 CSS 포함 한 파일", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx);
  const html = sectionHtml(v.spec, v.unknownNumbers);
  assert.match(html, /<h4 class="k-task"><span class="k-task__no">1-1<\/span>/);
  assert.match(html, /<h5 class="k-sub">가\. “철탑 오름 없이 안전하게” AI 안테나 판독 전국 확산<span class="mk mk--dark">지적개선<\/span><span class="mk mk--dark">AI<\/span><\/h5>/);
  assert.match(html, /<table class="k-ba">/);
  assert.match(html, /<li>고소 작업 script<\/li>/, "검증이 꺾쇠를 걷음");
  const raw = sectionHtml({ ...v.spec, results: ['R&D “협업” <script>alert(1)</script>'] }, []);
  assert.match(raw, /R&amp;D “협업” &lt;script&gt;alert\(1\)&lt;\/script&gt;/, "렌더러는 모든 글을 이스케이프");
  assert.doesNotMatch(raw, /<script>/);
  assert.match(html, /<div class="k-result__label">추진성과<\/div>/);
  assert.match(html, /<span class="k-unv" title="카드에 없는 숫자 — 원자료로 확인">98%<\/span>/);
  assert.doesNotMatch(html, /k-unv[^>]*>45,000/, "카드에 있는 숫자는 표시 안 함");
  const doc = sectionDocument(v.spec, v.unknownNumbers, { year: 2026, generatedAt: "9.26 13:00", model: "m" });
  assert.match(doc, /^<!doctype html>/);
  assert.match(doc, /\.kca-dg-doc table\.k-ladder/);
  assert.doesNotMatch(doc, /googleapis|<link /, "외부 글꼴·링크 없음");
});

test("쪽 모듈: 목차·쪽 배정 값 우선(0.5쪽 단위, 3쪽까지), 없으면 AX 붙임 1쪽·그 밖 0.5쪽", { skip: NO_SEED_CARDS }, () => {
  assert.equal(sectionContext(card, group("주요사업1"), 2).module, 2);
  assert.equal(sectionContext(card, group("주요사업1"), 1.3).module, 1.5);
  assert.equal(sectionContext(card, group("주요사업1"), 9).module, 3);
  const noAx = seed.cards.find((c) => c.group === "주요사업1" && !(Array.isArray(c.axAttachments) && c.axAttachments.length))!;
  assert.equal(sectionContext(noAx, group("주요사업1")).module, 0.5);
  assert.match(sectionPrompt(P, card, sectionContext(card, group("주요사업1"), 2), 2026), /쪽 모듈: 2쪽\(시각 블록 9~10개\(.*\) \+ 불릿 블록 12줄 이하 \+ 그림 자리 4~8개\(.*\)\)/);
});

test("2025 최종본 문체 반영: 적응문(제목 명사구·동작성 명사 종결·~함 금지·조사 줄이기·추진성과 틀·실측 우선)과 라벨 순서", () => {
  for (const rule of ["2025 최종본 실측", "~함·~됨·~음·~임", "동작성 명사", "[분야] 머리", "55자", "’25년", "(’24년 A → ’25년 B)", "둘이 다르면 이 적응문"]) assert.ok(REPORT_ADAPTER.includes(rule), rule);
  assert.ok(!REPORT_ADAPTER.includes("…함,"), "명사형 어미 예시(…함)는 뺌 — 2025 본문 1,037개 중 1개");
  assert.deepEqual([...LADDER_LABELS], ["추진배경", "현황 및 문제점", "추진방향", "추진내용", "추진노력", "추진실적"]);
});

test("표기 통일(결정론): 글자 사이 가운뎃점은 ･, 연도 따옴표는 ’ — 뜻은 그대로", { skip: NO_SEED_CARDS }, () => {
  assert.equal(reportTypography("자료 수집·학습 및 검증∙분석 ㆍ 공유"), "자료 수집･학습 및 검증･분석･공유");
  assert.equal(reportTypography("‘25년 수도권 → '26년 전국, (’25.6) ‘24~’25"), "’25년 수도권 → ’26년 전국, (’25.6) ’24~’25");
  assert.equal(reportTypography("‘AI 판독’ 공모전 ‘25개 기관’"), "‘AI 판독’ 공모전 ‘25개 기관’", "명칭 따옴표·연도 아닌 숫자는 그대로");
  assert.equal(reportTypography("· 앞 기호 없음"), "· 앞 기호 없음", "글자 사이가 아니면 그대로");
  // 검증을 거치면 AI 글에도 적용
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection({ ...out(), results: ["수집·분석 체계로 ‘25년 검사 효율 향상"] }, card, ctx);
  assert.equal(v.spec.results[0], "수집･분석 체계로 ’25년 검사 효율 향상");
});

test("문체 경고(결정론): ~함·~다로 끝난 문장, 두 줄 넘는 불릿, 한 줄 넘는 추진성과 — 괄호 비교·명사(시스템)는 빼고", () => {
  const row = (bullets: string[]) => ({ label: "추진내용" as const, bullets, diagram: { type: "none" as const, title: "", rows: [], steps: [], actions: [] } });
  assert.deepEqual(styleWarnings({ rows: [row(["안테나 AI 판독 전국 확산", "무선국검사관리시스템", "검사 시간 단축(’24년 A → ’25년 B)"])], results: ["미흡구간 집중 개선으로 통신품질 향상"] }), []);
  const w = styleWarnings({ rows: [row(["판독 시스템을 구축함", "전국으로 확대하였다(’25.6)", "가".repeat(111)])], results: ["나".repeat(76)] });
  assert.equal(w.length, 3);
  assert.match(w[0], /끝난 문장 2개/);
  assert.match(w[1], /두 줄\(110자\)을 넘는 불릿 1개/);
  assert.match(w[2], /한 줄\(75자\)을 넘는 추진성과 문장 1개/);
  // v3 블록: 불릿·칸 불릿은 보고, 인용·말풍선은 원문이라 보지 않음
  const b = (kind: Block["kind"], x: Partial<Block>): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
  const wb = styleWarnings({ rows: [], results: [], blocks: [b("bullets", { items: ["판독 체계를 마련함"] }), b("cards", { cells: [{ head: "a", tag: "", bullets: ["전국으로 확대하였다"], note: "" }] }), b("voices", { cells: [{ head: "시민", tag: "", bullets: ["전자파가 걱정됩니다"], note: "" }] })] });
  assert.equal(wb.length, 1);
  assert.match(wb[0], /끝난 문장 2개/);
});

test("분량 안내(판면 실측): 1쪽 시각 블록 5~6개·불릿 블록 6줄 이하, 0.5쪽은 짜임 고정 2개·2줄(블록 영역 약 85mm) — 적응문 규칙(이야기 틀·블록 사전 이름 대조는 lib/prompts/prompts.test)", () => {
  assert.match(moduleGuide(P, 1), /^시각 블록 5~6개.*불릿 블록 6줄 이하 \+ 그림 자리 2~4개/);
  assert.match(moduleGuide(P, 0.5), /^시각 블록 2개\(기본 도식 1 \+ 이 과제만의 요소 1 — 요청의 이 과제만의 요소 후보가 '25 평가위원 지적 인용뿐이면 기본 도식 2\) \+ 불릿 블록 2줄 이하 \+ 그림 자리 1개\(/, "0.5쪽은 짜임 고정(평가 라운드 D: 고치기 1회 뒤에도 117~129%)");
  for (const rule of ["62개의 블록 종류·순서가 모두 다릅니다", "형제 소항목", "이야기 틀", "블록 사전", "evidence", "resultCards", "지어내지 않습니다"]) assert.ok(REPORT_ADAPTER.includes(rule), rule);
});

test("figureCap: 0.5쪽은 1개(평가 라운드 H — 그림을 넣은 0.5쪽 넘침), 1쪽은 4개, 2쪽은 8개(모듈 × 4) — moduleGuide의 그림 자리 안내와 같은 값을 씀", () => {
  assert.equal(figureCap(0.5), 1);
  assert.equal(figureCap(1), 4);
  assert.equal(figureCap(2), 8);
  assert.match(moduleGuide(P, 1), new RegExp(`그림 자리 2~${figureCap(1)}개`));
  assert.match(moduleGuide(P, 0.5), new RegExp(`그림 자리 ${figureCap(0.5)}개`));
});

const HAY_PLAN = "’25년 수도권 운영 → ’26년 전국 확산 운영으로 검사관 의사결정 보조도구 정착";

test("v3 근거 블록: 인용·말풍선은 칸마다, 우수사례·정의는 evidence를 근거 원문에서 찾은 것만 — 막대는 숫자 막대 2개 이상, 3칸 추진성과는 2칸 이상", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const hay = sourceKey(`${card.plan.sustainability}`);
  assert.ok(quoteFoundIn(hay, HAY_PLAN));
  assert.ok(quoteFoundIn(hay, "’25년 수도권 운영...검사관 의사결정 보조도구 정착"), "…로 줄인 인용은 조각마다");
  assert.ok(!quoteFoundIn(hay, "현장 안전이 최우선이라는 대통령 지시"));
  const v = verifySection(
    out({
      blocks: [
        blk({ kind: "quotes", cells: [cell("전국 확산", [`“${HAY_PLAN}”`], "방향", "’26 카드"), cell("지어낸 지시", ["현장 안전이 최우선이라는 대통령 지시"], "정부", "’25.6")] }),
        blk({ kind: "voices", label: "현장 의견", cells: [cell("시민", ["기지국 전자파가 걱정돼요"]), cell("어민", ["지어낸 말이에요"])] }),
        blk({ kind: "define", title: "SafeVision이란?", text: "AI 기반 출장지 사전 안전진단 시스템", items: ["주소 입력", "AI 판독", "안전 등급"], evidence: "AI 기반 출장지 사전 안전진단 시스템" }),
        blk({ kind: "case", label: "우수사례", title: "공모전 대상 수상", items: ["과기정통부 공모전 대상"], evidence: "과기정통부 공모전 대상 수상" }),
        blk({ kind: "chart", label: "추진실적", title: "고위험 작업 대체", series: [{ label: "’25년", value: "30,706건" }, { label: "’26년", value: "45,000건" }] }),
        blk({ kind: "chart", label: "추진실적", title: "x", series: [{ label: "’25년", value: "3건" }] }),
      ],
      resultCards: [{ tag: "근로자 안전", headline: "고위험 작업 대체", figure: "’26년 목표 45,000건" }],
    }),
    card,
    ctx,
    "시민 의견: “기지국 전자파가 걱정돼요”",
  );
  assert.deepEqual(v.spec.blocks?.map((b) => b.kind), ["quotes", "voices", "define", "chart"], "근거 없는 우수사례·막대 1개짜리는 버림");
  assert.deepEqual(v.spec.blocks?.[0].cells.map((c) => [c.tag, c.bullets[0]]), [["방향", HAY_PLAN]], "근거에 없는 인용은 칸째 뺌, 따옴표는 렌더러가 붙임");
  assert.deepEqual(v.spec.blocks?.[1].cells.map((c) => c.head), ["시민"], "첨부·전년 절 글(extraText)도 근거");
  assert.ok(v.warnings.some((w) => w.includes("찾지 못한 인용 1개")) && v.warnings.some((w) => w.includes("찾지 못한 말풍선 1개")));
  assert.ok(v.warnings.some((w) => w.startsWith("case(우수사례): 근거 원문(evidence)을 찾지 못해")));
  assert.deepEqual(v.spec.resultCards, [], "3칸 추진성과는 2칸 이상일 때만");
  assert.match(sectionText(v.spec), /’26년 45,000건/);
});

test("clipLine·3칸 추진성과 한도: 닫히지 않은 【…】·(…)는 여는 기호 앞에서 끊고, 잘리면 문체 경고(라운드 T 1-8-가 「… 【확인: 」)", { skip: NO_SEED_CARDS }, () => {
  assert.equal(clipLine("짧은 글", 40), "짧은 글");
  assert.equal(clipLine("AI 모니터링(’26.8)", 12), "AI 모니터링");
  assert.equal(clipLine("전국 15개소 조사로 이용현황 분석, 디지털 무전기 교환 지원 【확인: ’26년 교환 대수】", 40), "전국 15개소 조사로 이용현황 분석, 디지털 무전기 교환 지원");
  assert.equal(clipLine("시간 단축 (’25년 30,706건) 【확인: ’26년】 이후 확산까지", 31), "시간 단축 (’25년 30,706건) 【확인: ’26년】");
  const cards = (headline: string) => [
    { tag: "AI 모니터링(’26.8)", headline, figure: "96% 단축" },
    { tag: "현장조사", headline: "전국 15개소 조사", figure: "15개소" },
  ];
  const ctx = sectionContext(card, group("주요사업1"));
  const long = verifySection(out({ resultCards: cards("AI 자동화로 모니터링 시간 단축, 불법 판매정보 【확인: ’26년 차단 건수】 차단") }), card, ctx);
  assert.deepEqual(long.spec.resultCards?.map((c) => [c.tag, c.headline]), [["AI 모니터링", "AI 자동화로 모니터링 시간 단축, 불법 판매정보"], ["현장조사", "전국 15개소 조사"]]);
  assert.ok(long.warnings.some((w) => w.startsWith("문체: 추진성과 3칸 글 2곳이")), long.warnings.join("\n"));
  const fine = verifySection(out({ resultCards: cards("모니터링 시간 단축").map((c) => ({ ...c, tag: "AI 모니터링" })) }), card, ctx);
  assert.ok(!fine.warnings.some((w) => w.includes("추진성과 3칸 글")));
});

test("v3 짜임 겹침: 형제 초안과 블록 순서가 같으면 경고, 요청에는 형제 짜임·전년 절 짜임(근사)을 적음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx);
  assert.equal(blockSignature(v.spec.blocks ?? []), "bullets → compare → timeline");
  const mine = siblingLayout(v.spec)!;
  assert.deepEqual(mine, { label: "1-1 가. “철탑 오름 없이 안전하게” AI 안테나 판", story: "단계 전개형", signature: "bullets → compare → timeline" });
  const dup = verifySection(out(), card, ctx, "", [{ ...mine, label: "1-2 가. 엘리베이터" }]);
  assert.ok(dup.warnings.some((w) => w === "짜임: 같은 주요사업의 1-2 가. 엘리베이터와 블록 순서가 똑같습니다 — 다시 만들거나 블록을 바꿔 주세요."));
  assert.ok(!verifySection(out(), card, ctx, "", [{ ...mine, signature: "timeline → cards" }]).warnings.some((w) => w.startsWith("짜임:")));
  const p = sectionPrompt(P, card, ctx, 2026, [], [], [{ label: "1-2 가. 엘리베이터", story: "한계 극복·다자협업형", signature: "cards → banner → hub" }]);
  assert.match(p, /「같은 주요사업의 다른 소항목 초안이 쓴 짜임」 1개 — .*겹치지 않게/);
  assert.match(p, /- 1-2 가\. 엘리베이터 \[한계 극복·다자협업형\] cards → banner → hub/);
  assert.equal(siblingLayout({ ...v.spec, blocks: [] }), null, "블록 없는(옛) 초안은 형제 짜임에서 뺌");
  // 보조 틀(구성안 subStory — spec.plan에 남김)은 형제 짜임에 「주 + 보조」로, 틀 후보 감점은 주 틀만(story 칸)
  const withSub = siblingLayout({ ...v.spec, plan: { story: "단계 전개형", subStory: "현장 목소리형", matched: 3, total: 3 } })!;
  assert.equal(withSub.story, "단계 전개형");
  assert.equal(withSub.subStory, "현장 목소리형");
  const p2 = sectionPrompt(P, card, ctx, 2026, [], [], [withSub]);
  assert.match(p2, /\[단계 전개형 \+ 현장 목소리형\]/);
});

test("v3 HTML: 라벨 있는 연속 블록 = 사다리 표(같은 라벨은 한 행·행 끝 막대는 오른쪽), 전폭 블록이 표를 나눔, 모양별 도식", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(
    out({
      blocks: [
        blk({ kind: "quotes", cells: [cell("전국 확산", [HAY_PLAN], "방향", "’26 카드")] }),
        blk({ kind: "bullets", label: "추진배경", items: ["검사 현장 추락 위험 상존"] }),
        blk({ kind: "banner", text: "“오르지 않고 판독한다” AI 안테나 판독 전국 확산" }),
        blk({ kind: "cards", label: "현황 및 문제점", variant: "plus", cells: [cell("수도권 한정 운영", ["전국 기준 부재"]), cell("성과 기준 미흡", ["사후검증 제외"])] }),
        blk({ kind: "compare", label: "Step 1 전국 확산", variant: "panels", items: ["수도권 운영", "전국 운영"], rows: [{ key: "지역", before: ["북서울본부"], after: ["전국 본부"] }] }),
        blk({ kind: "chart", label: "Step 1 전국 확산", title: "고위험 작업 대체", series: [{ label: "’25년", value: "30,706건" }, { label: "’26년", value: "45,000건" }] }),
        blk({ kind: "steps", label: "추진내용", variant: "zigzag", cells: [cell("Step 1 자료 수집", ["무선국 자료"]), cell("2단계 지침", ["표준 절차"]), cell("시스템 반영", ["RIMS"]), cell("신뢰도 향상", ["제조사 협력"])] }),
        blk({ kind: "timeline", variant: "dots", cells: [cell("’24년", ["기술 연구"]), cell("’25년", ["수도권 운영"]), cell("’26년", ["전국 확산"])] }),
        blk({ kind: "hub", cells: [cell("판독 협의체", ["기준 공유"]), cell("이동통신사", ["제원 공유"]), cell("제조사", ["장비 정보"])] }),
        blk({ kind: "hub", cells: [cell("KCA", ["운영"]), cell("KT", ["솔루션"]), cell("한기대", ["특허"]), cell("제조사", ["장비"])] }),
        blk({ kind: "voices", cells: [cell("시민", ["기지국 전자파가 걱정돼요"])] }),
        blk({ kind: "define", title: "SafeVision이란?", text: "AI 기반 출장지 사전 안전진단 시스템", items: ["주소 입력", "AI 판독"], evidence: "AI 기반 출장지 사전 안전진단 시스템" }),
        blk({ kind: "band", label: "공공성", text: "추락 위험 현장 원천 차단" }),
        blk({ kind: "subhead", text: "① [국내] 전국 확산" }),
      ],
    }),
    card,
    ctx,
    "“기지국 전자파가 걱정돼요”",
  );
  assert.equal(v.spec.blocks?.length, 14);
  const html = sectionHtml(v.spec, v.unknownNumbers);
  const order = ["k-ctx k-ctx--one", ">추진배경</th>", "k-banner", ">현황 및 문제점</th>", "Step 1</span><br>전국 확산</th>", "k-zig", "k-dots", 'class="k-hub"', "k-hub--list", "k-voice", "k-dfn", "k-band", "k-subh", "k-result"].map((k) => html.indexOf(k));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), `순서 ${order}`);
  assert.equal(html.match(/<table class="k-ladder">/g)?.length, 2, "메시지 띠가 사다리 표를 둘로 나눔");
  assert.equal(html.match(/<th scope="row"><span class="k-tag">Step 1<\/span>/g)?.length, 1, "같은 라벨은 한 행");
  assert.match(html, /<div class="k-row2"><div><div class="k-panels">.*<\/div><figure class="k-chart"><figcaption>고위험 작업 대체<\/figcaption>/, "행 끝 막대는 오른쪽");
  assert.match(html, /k-cards--join[^>]*>.*<div class="k-join" aria-hidden="true">✚<\/div>/);
  assert.match(html, /<span class="k-tag k-tag--dark">To-Be<\/span>전국 운영/);
  assert.match(html, /<b>1단계<\/b><span>자료 수집<\/span>.*<b>2단계<\/b><span>지침<\/span>/, "지그재그 칸 제목의 Step N·N단계는 뗌");
  assert.match(html, /<li aria-current="step"><span class="k-dots__yr">’26년<\/span>/, "연혁 점의 마지막이 올해");
  assert.match(html, /<blockquote>“기지국 전자파가 걱정돼요”<\/blockquote>/);
  assert.match(html, /<h6 class="k-dfn__tab">SafeVision이란\?<\/h6>.*<span class="k-chip">주소 입력<\/span><span class="k-arr" aria-hidden="true">→<\/span>/);
  assert.match(html, /<div class="k-band__l">공공성<\/div><div class="k-band__t">▶ 추락 위험 현장 원천 차단 ◀<\/div>/);
  assert.match(html, />30,706건<\/text>/);
});

test("옛 초안(v2 행 사다리)도 그대로 그림 — 인용 상자 → 추진배경 행 → 메시지 띠 → 나머지 행, 기존·개선 열 균형", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v3 = verifySection(out(), card, ctx).spec;
  const none = { type: "none" as const, title: "", rows: [], steps: [], actions: [] };
  const v2 = readSection(
    JSON.parse(
      JSON.stringify({
        ...v3,
        version: 2,
        blocks: undefined,
        story: undefined,
        rows: [
          { label: "추진배경", bullets: ["검사 현장 추락 위험 상존"], diagram: none, chart: null },
          { label: "추진내용", bullets: [], diagram: { type: "before_after", title: "", rows: [{ key: "판독", before: ["현장 확인"], after: ["AI 판독"] }], steps: [], actions: [] }, chart: null },
        ],
        context: [{ chip: "방향", title: "전국 확산", quote: HAY_PLAN, cite: "’26 카드" }],
        banner: "“오르지 않고 판독한다”",
      }),
    ),
  )!;
  const html = sectionHtml(v2, []);
  const order = ["k-ctx", "추진배경</th>", "k-banner", "추진내용</th>", "k-result"].map((k) => html.indexOf(k));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), `순서 ${order}`);
  assert.match(html, /<table class="k-ba"><colgroup><col style="width:15%"><col style="width:39%"><col style="width:6%"><col style="width:40%"><\/colgroup>/);
});

test("전년도 보고서 절(과거 실적): 프롬프트에 닮은 정도·같은 과제 여부·시점 요구와 원문, 적응문은 PDCA 행 재료", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const section = { key: "rpt25-biz/BZ-1/1-1/가", business: "BZ-1", taskNo: "1-1", mark: "가", title: "“철탑 오름 없이 안전하게” AI 이미지 분석 기술로 현장 위험 원천 차단", taskTitle: "AI･디지털 스마트 전파 검사 체계로 현장 안전･효율 혁신", targetName: "전파품질 향상", page: 119, text: "’24년 기술 연구 | ’25년 개발 및 시범 운영 | ’26년 확대 운영\n\n안테나 유형 24종, 제원 63종 분류 | 분석 결과 검증 신뢰도 97%" };
  const p = sectionPrompt(P, card, ctx, 2026, [], [
    { section, score: 0.49 },
    { section: { ...section, key: "x", mark: "나" }, score: 0.2 },
  ]);
  assert.match(p, /「전년도\(2025\) 경영실적보고서 — 이 과제와 닮은 절」 2개 — .*반드시 시점\(’25년 등\)을 붙입니다/);
  assert.match(p, /\[전년 1\] 2025 보고서 1-1 가\. “철탑 오름 없이 안전하게”.*\(p\.119\) · 닮은 정도 0\.49\(같은 과제로 보임\)/);
  assert.match(p, /\[전년 2\] .* · 닮은 정도 0\.2\(비슷한 과제 — .*작성 방식만 참고\)/);
  assert.ok(p.includes("안테나 유형 24종, 제원 63종 분류"));
  assert.match(p, /\(전년 절 짜임 — 앱이 글에서 뽑은 근사: 연도 흐름\)/);
  assert.match(p, /짜임은 올해 이야기에 맞게 다시 고릅니다/);
  assert.ok(!sectionPrompt(P, card, ctx, 2026).includes("이 과제와 닮은 절"), "전년 절이 없으면 블록 없음");
  for (const rule of ["PDCA 흐름", "반드시 시점(’24년·’25년)", "Check→Act", "Plan·Do", "OutCome = Act", "추상 문구", "복제하지 않고"]) assert.ok(REPORT_ADAPTER.includes(rule), rule);
  // 전년 절 수치는 대조 근거(과거 수치를 시점과 함께 쓰면 경고 아님)
  const v = verifySection(out({ results: ["’25년 분석 신뢰도 97% 확보 기반 전국 확산"] }), card, ctx, section.text);
  assert.ok(!v.unknownNumbers.includes("97%"));
});

test("평가 기준·평가위원 관점: 카드 바로 뒤 묶음별 블록(머리말 있으면 함께), 인용 원문 대조에만 쓰는 글은 수치를 아는 숫자로 치지 않음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const lens = [
    { group: "criteria" as const, key: "c2", title: "'26 편람 · ② 주요사업별 추진계획이 적절하게 집행되었는가?", where: "편람", text: "주요사업별 실행계획에 따른 추진 활동의 적정성" },
    { group: "critiques" as const, key: "e2", title: "'25 평가보고서 · 주요사업1 · 집행 ③", where: "", text: "실질적 투입 시간을 통합적으로 고려하여 성과를 재산정할 필요가 있다" },
    { group: "peers" as const, key: "p1", title: "붙임2 · 기관 — 사업(B+)", where: "", text: "민원 처리 기간 42% 단축" },
  ];
  const p = sectionPrompt(P, card, ctx, 2026, [], [], [], lens);
  const at = (s: string) => p.indexOf(s);
  assert.ok(at("「카드」") < at("「평가 기준·평가위원 관점」") && at("「평가 기준·평가위원 관점」") < at("[평가 기준]") && at("[평가 기준]") < at("['25 평가위원 지적]") && at("['25 평가위원 지적]") < at("[유관기관 우수 사례]"), "묶음 순서");
  assert.ok(!p.includes("['25 실사 질의응답]"), "빈 묶음은 머리도 없음");
  assert.match(p, /\(1\) '26 편람 · ② 주요사업별 추진계획이 적절하게 집행되었는가\? — 편람\n주요사업별 실행계획/);
  assert.match(p, /\(1\) '25 평가보고서 · 주요사업1 · 집행 ③\n실질적 투입 시간/, "머리말 없으면 제목만");
  assert.ok(!sectionPrompt(P, card, ctx, 2026).includes("「평가 기준·평가위원 관점」"), "평가 근거가 없으면 블록 없음");
  const o = out({
    blocks: [
      ...out().blocks,
      blk({ kind: "quotes", cells: [cell("지적", ["실질적 투입 시간을 통합적으로 고려하여 성과를 재산정할 필요가 있다"], "'25 평가위원", "'25 평가보고서")] }),
    ],
    results: ["민원 처리 기간 42% 단축"],
  });
  const quoteOnly = lens.map((x) => x.text).join("\n"); // 실사 답변이 아닌 평가 근거(평가 기준·지적·유관기관 사례)
  const v = verifySection(o, card, ctx, "", [], quoteOnly);
  assert.equal(v.spec.blocks?.find((b) => b.kind === "quotes")?.cells.length, 1, "평가위원 지적 원문 인용은 남김");
  assert.deepEqual(v.unknownNumbers, ["42%"], "다른 기관 수치는 KCA 실적 근거가 아님");
});

test("판면 예산: sectionPrompt는 「카드」 뒤·「전년도」 앞에 「판면 예산」을 넣고, 칸 폭 안내(cards 2칸)와 블록 영역 mm를 담음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1")); // 이 카드는 AX 붙임이라 module 1
  assert.equal(ctx.module, 1);
  const section = { key: "rpt25-biz/BZ-1/1-1/가", business: "BZ-1", taskNo: "1-1", mark: "가", title: "t", taskTitle: "tt", targetName: "전파품질 향상", page: 119, text: "가나다" };
  const p = sectionPrompt(P, card, ctx, 2026, [], [{ section, score: 0.49 }]);
  // 쪽 모듈 안내(moduleGuide)에 「판면 예산」을 앞서 가리키는 문구가 한 번 더 있으므로, 절 제목 자체(뒤에 “— 이 소항목은…”이 옴)로 찾음
  const fitGuideIdx = p.indexOf("「판면 예산」 — 이 소항목은");
  assert.ok(fitGuideIdx > 0);
  assert.ok(p.indexOf("「카드」") < fitGuideIdx, "「판면 예산」 절은 「카드」 뒤");
  assert.ok(fitGuideIdx < p.indexOf("「전년도"), "「판면 예산」 절은 「전년도」 앞");
  assert.ok(p.includes("cards 2칸"), "칸 폭별 한 줄 글자 수 안내를 담음");
  assert.ok(p.includes(`블록 영역은 약 ${blockAreaMm(ctx.module)}mm`));
});

test("판면 맞추기 요청(fitPrompt): over는 'mm를 줄입니다'·초안 JSON, under는 'mm가 비어 있습니다', ragged·sparse는 안내 문구와 항목 줄(마지막 줄·자 안팎)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const draft = out();
  const base: FitReport = { budget: 255, total: 255, rows: [{ label: "A", kinds: "bullets", mm: 100 }], wrapped: [], ragged: [], sparse: [], bullets: 10 };

  const overReport: FitReport = { ...base, total: 300 };
  const pOver = fitPrompt(P, ctx, draft, overReport, "over");
  assert.ok(pOver.includes("mm를 줄입니다"));
  assert.ok(pOver.includes(draft.title), "앞서 쓴 초안 JSON에 제목이 담김");
  assert.ok(pOver.includes("「앞서 쓴 초안」"));

  const underReport: FitReport = { ...base, total: 150 };
  const pUnder = fitPrompt(P, ctx, draft, underReport, "under");
  assert.ok(pUnder.includes("mm가 비어 있습니다"));

  const raggedLine = { where: "추진배경 · bullets", text: "가".repeat(20), lines: 2, perLine: 8, fill: 0.2 };
  const raggedReport: FitReport = { ...base, ragged: [raggedLine] };
  const pRagged = fitPrompt(P, ctx, draft, raggedReport, "ragged");
  assert.ok(pRagged.includes("한두 글자만 다음 줄로"));
  assert.ok(pRagged.includes("마지막 줄"), "항목 줄에 마지막 줄 채움이 담김");
  assert.ok(pRagged.includes("자 안팎"));

  const sparseLine = { where: "추진내용 · cards", text: "가".repeat(3), lines: 1, perLine: 12, fill: 0.25 };
  const sparseReport: FitReport = { ...base, sparse: [sparseLine] };
  const pSparse = fitPrompt(P, ctx, draft, sparseReport, "sparse");
  assert.ok(pSparse.includes("덜 채운 칸 글"));
  assert.ok(pSparse.includes("마지막 줄"));
  assert.ok(pSparse.includes("자 안팎"));
});

test("판면 검증(verifySection): spec.fit(total/budget)을 채우고, 많이 넘치면 '넘칩니다', 많이 비면 '빕니다' 경고 — FIT_BAND 기준", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const small = verifySection(out(), card, ctx);
  assert.equal(small.spec.fit?.budget, ctx.module * PAGE_MM.height);
  assert.equal(typeof small.spec.fit?.total, "number");
  assert.ok(small.spec.fit!.total < small.spec.fit!.budget * FIT_BAND.under, "작은 기본 초안은 1쪽 예산에 크게 못 미침");
  assert.ok(small.warnings.some((w) => w.startsWith("판면:") && w.includes("빕니다")));

  // 칸 글이 긴 블록을 여럿 두면 예산을 넘김
  const bigBlocks = Array.from({ length: 12 }, (_, i) =>
    blk({ kind: "cards", label: `L${i}`, cells: [cell("머리1", ["가나다라마바사아자차카타파하가나다라마바사아자차카타파하 " + i]), cell("머리2", ["가나다라마바사아자차카타파하가나다라마바사아자차카타파하 " + i])] }),
  );
  const big = verifySection(out({ blocks: bigBlocks }), card, ctx);
  assert.ok(big.spec.fit!.total > big.spec.fit!.budget * FIT_BAND.over, "칸 글 많은 12개 블록은 1쪽 예산을 넘침");
  assert.ok(big.warnings.some((w) => w.startsWith("판면:") && w.includes("넘칩니다")));
});

test("cleanLine: 강조 표시(**…**)는 남기고, 앞 글머리 기호 하나만 뗌", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({ blocks: [blk({ kind: "bullets", label: "추진배경", items: ["**핵심 45,000건** 달성", "- 앞 글머리"] })] });
  const v = verifySection(o, card, ctx);
  assert.deepEqual(v.spec.blocks?.[0].items, ["**핵심 45,000건** 달성", "앞 글머리"]);
});

test("HTML 강조: **…**는 이스케이프 후 굵게(<b>), 짝이 없는 **는 지움", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx);
  const html1 = sectionHtml({ ...v.spec, results: ["**4.5만회** 달성"] }, []);
  assert.match(html1, /<b>4\.5만회<\/b> 달성/);
  const html2 = sectionHtml({ ...v.spec, results: ["**<script>** 위험"] }, []);
  assert.match(html2, /<b>&lt;script&gt;<\/b> 위험/, "이스케이프 후 굵게 — 원문 태그가 살아나지 않음");
  assert.doesNotMatch(html2, /<script>/);
  const html3 = sectionHtml({ ...v.spec, results: ["가나다 ** 마바사"] }, []);
  assert.doesNotMatch(html3, /\*/, "짝이 없는 **는 지움");
});

test("HTML: 기본 모양(steps) 칸 제목의 'Step N'·'N단계'는 번호 칩이 대신하므로 뗌(꼬리표가 정확히 그 값이어도 뗌)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const withHead = verifySection(out({ blocks: [blk({ kind: "steps", variant: "row", cells: [cell("Step 1 자료 수집", ["내용1"]), cell("2단계 검증", ["내용2"])] })] }), card, ctx);
  const html1 = sectionHtml(withHead.spec, withHead.unknownNumbers);
  assert.match(html1, /<span class="k-num">1<\/span>자료 수집/);
  assert.match(html1, /<span class="k-num">2<\/span>검증/);

  // 머리글은 그대로 두고 꼬리표(tag)가 정확히 "Step N"이면 그것도 뗌(렌더러가 번호 칩과 겹치지 않게)
  const withTag = verifySection(out({ blocks: [blk({ kind: "steps", variant: "row", cells: [cell("자료 수집", ["내용1"], "Step 1"), cell("검증", ["내용2"], "Step 2")] })] }), card, ctx);
  const html2 = sectionHtml(withTag.spec, withTag.unknownNumbers);
  assert.match(html2, /<span class="k-num">1<\/span>자료 수집/);
  assert.match(html2, /<span class="k-num">2<\/span>검증/);
  assert.doesNotMatch(html2, /Step 1/, "꼬리표 'Step 1'은 번호 칩과 겹치므로 뗌");
});

test("sectionPrompt 도식 고르기(diagram-hints): 「판면 예산」 뒤에 오고, 카드 1-가의 도식 후보(steps 등 — 월별 실적에 수치가 없어 stats는 없음)를 담으며, 형제 초안이 쓴 도식(kindUsage)도 적음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const p = sectionPrompt(P, card, ctx, 2026);
  const iFit = p.indexOf("「판면 예산」");
  const iDiag = p.indexOf("「도식 고르기」");
  assert.ok(iFit > 0 && iDiag > iFit, "「도식 고르기」는 「판면 예산」 뒤");
  assert.match(p, /- steps: /, "카드 1-가 글의 도식 후보에 steps가 담김");
  assert.doesNotMatch(p, /- stats: /, "올해 실적 수치가 없어 stats 후보는 없음(2026-10-15)");
  const p2 = sectionPrompt(P, card, ctx, 2026, [], [], [{ label: "x", story: "", signature: "cards → steps" }]);
  assert.match(p2, /이미 쓴 도식\(많이 쓴 순\): .*cards 1/, "형제 초안 짜임의 kind별 사용 횟수를 적음");
});

test("sectionPrompt 규칙 정리(④): fit.guide는 블록 종류별 어림 높이(blockCosts)와 「문체 › 읽히는 문장·판면」을 가리키고, diagram.guide는 「블록 사전 › 도식 고르기」를 가리키며 옛 ①②③ 규칙 글은 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const p = sectionPrompt(P, card, ctx, 2026);
  assert.match(p, /블록 종류별 어림 높이/, "blockCosts 안내 문구");
  assert.match(p, /compare 표 2행 \d+mm/, "blockCosts의 compare 줄이 실려 있음");
  assert.match(p, /「문체 › 읽히는 문장·판면」/);
  const diagIdx = p.indexOf("「도식 고르기」");
  const diagSection = p.slice(diagIdx, p.indexOf("\n\n", diagIdx + 10) + 1 || diagIdx + 600);
  assert.match(diagSection, /「블록 사전 › 도식 고르기」/);
  assert.doesNotMatch(diagSection, /①[\s\S]*②[\s\S]*③/, "옛 ①②③ 규칙 나열은 blocks.md로 옮겨져 여기 없음");
});

test("verifySection: 같은 소항목에 cards 도식을 두 번 쓰면 '도식: 한 소항목에 같은 도식을 두 번' 경고", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const twoCards = out({
    blocks: [blk({ kind: "cards", label: "A", cells: [cell("h1", ["가나다"]), cell("h2", ["가나다"])] }), blk({ kind: "cards", label: "B", cells: [cell("h3", ["가나다"]), cell("h4", ["가나다"])] })],
  });
  const v = verifySection(twoCards, card, ctx);
  assert.ok(v.warnings.some((w) => w === "도식: 한 소항목에 같은 도식을 두 번 썼습니다(cards) — 다른 모양의 도식으로 바꿔 주세요."));
});

test("v3 HTML: stats(핵심 수치 띠 — 저장된 초안)는 k-stat__v로, compare panels는 As-Is ➀·To-Be ➊ 번호, case의 「라벨 | 글」 줄은 k-case__kv", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const withEvidence = out({
    blocks: [
      blk({ kind: "compare", variant: "panels", items: ["기존 요약", "개선 요약"], rows: [{ key: "판독", before: ["현장 확인"], after: ["AI 판독"] }] }),
      blk({ kind: "case", label: "우수사례", title: "공모전 대상", items: ["공모명 | 2025년 공모전"], evidence: "2025년 공모전 수상" }),
    ],
  });
  const v = verifySection(withEvidence, card, ctx, "2025년 공모전 수상");
  assert.deepEqual(v.spec.blocks?.map((b) => b.kind), ["compare", "case"]);
  // 2026-10-28부터 새 주요사업 초안은 수치 띠를 빼므로(verifySection) 저장된 초안처럼 spec에 직접 넣어 그림 — 렌더러는 예전 그대로
  const stats = { kind: "stats" as const, label: "", title: "", variant: "", text: "", items: [], cells: [cell("40,000건", ["설명"]), cell("98%", ["설명2"])], rows: [], series: [], badge: "" };
  const html = sectionHtml({ ...v.spec, blocks: [stats, ...v.spec.blocks!] }, []);
  assert.match(html, /<p class="k-stat__v">40,000건<\/p>/);
  assert.match(html, /➀/, "As-Is 번호");
  assert.match(html, /➊/, "To-Be 번호");
  assert.match(html, /<li class="k-case__kv"><span class="k-tag">공모명<\/span>2025년 공모전<\/li>/);
});

test("sectionDocument: 내려받기 문서는 자간 맞춤(fitTextLines) <script>를 담고, 그 코드에 k-fit-tight·k-left(좁은 칸 왼쪽 정렬, 평가 라운드 G) 클래스가 있음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx);
  const doc = sectionDocument(v.spec, v.unknownNumbers, { year: 2026, generatedAt: "", model: "" });
  assert.match(doc, /<script>/);
  assert.match(doc, /k-fit-tight/);
  assert.match(doc, /k-left/);
});

test("sectionDocument marks: 기본은 data-fit-row가 없고, { marks: true }면 fitReport(...).rows.length만큼 0부터 차례로 붙음(사다리 행·전폭 블록·같은 라벨 합침 섞인 v3)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  // out()의 블록: bullets(추진배경)·compare+steps(추진내용, 같은 라벨 한 행)·timeline(라벨 없음, 전폭) — 사다리 행·전폭이 섞임
  const v = verifySection(out(), card, ctx);
  const plain = sectionDocument(v.spec, v.unknownNumbers, { year: 2026, generatedAt: "", model: "" });
  assert.doesNotMatch(plain, /data-fit-row/, "기본은 marks 없음");

  const marked = sectionDocument(v.spec, v.unknownNumbers, { year: 2026, generatedAt: "", model: "" }, { marks: true });
  const found = [...marked.matchAll(/data-fit-row="(\d+)"/g)].map((m) => Number(m[1]));
  const expected = fitReport(v.spec as never).rows.length;
  assert.ok(expected >= 2, `이 v3 spec은 사다리 행 + 전폭 블록이 섞여 행이 2개 이상이어야 함(${expected})`);
  assert.equal(found.length, expected, `data-fit-row 개수는 fitReport(...).rows.length(${expected})와 같음`);
  assert.deepEqual(found, Array.from({ length: expected }, (_, i) => i), "0부터 차례대로");
});

test("sectionHtml blockMarks: 옵션이 없으면 data-block이 없고(내려받기도), 켜면 spec.blocks 순번(0…n-1)마다 — 속성만 더해 걷으면 기본 출력과 같음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  // out()의 블록: 사다리 행(같은 라벨 합침)·전폭 블록이 섞임
  const v = verifySection(out(), card, ctx);
  const plain = sectionHtml(v.spec, v.unknownNumbers);
  assert.doesNotMatch(plain, /data-block=/, "기본 출력에는 없음");
  assert.doesNotMatch(sectionDocument(v.spec, v.unknownNumbers), /data-block=/, "내려받기에는 없음");
  const html = sectionHtml(v.spec, v.unknownNumbers, { blockMarks: true });
  const found = [...new Set([...html.matchAll(/data-block="(\d+)"/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  assert.deepEqual(found, v.spec.blocks!.map((_, i) => i), "블록 수만큼, 0부터 차례로");
  assert.equal(html.replace(/ data-block="\d+"/g, ""), plain, "속성만 더함(배치 그대로)");
});

test("sectionHtml resultMark(2026-10-13): 끄면 지금 출력과 바이트까지 같고, 켜면 추진성과 상자에 data-result 1개(data-block은 아님) — 경영관리·빈 상자는 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx);
  assert.ok(v.spec.results.length, "이 spec은 추진성과 줄이 있음");
  for (const base of [{}, { blockMarks: true, editMarks: true }]) {
    const plain = sectionHtml(v.spec, v.unknownNumbers, base);
    assert.equal(sectionHtml(v.spec, v.unknownNumbers, { ...base, resultMark: false }), plain, "끄면 그대로");
    const html = sectionHtml(v.spec, v.unknownNumbers, { ...base, resultMark: true });
    assert.equal((html.match(/data-result/g) ?? []).length, 1);
    assert.match(html, /<div data-result class="k-result/);
    assert.equal(html.replace(" data-result", ""), plain, "속성만 더함");
  }
  assert.doesNotMatch(sectionDocument(v.spec, v.unknownNumbers), /data-result/, "내려받기에는 없음");
  assert.doesNotMatch(sectionHtml({ ...v.spec, results: [], resultCards: [], resultChart: null }, [], { resultMark: true }), /data-result/, "빈 상자는 그리지 않음");
});

test("markRoots: 맨 위 요소마다 속성(여러 요소로 된 블록 모두), 안쪽 요소·svg 안 스스로 닫는 태그·짝 없는 태그는 그대로", () => {
  const html = '<p class="t">제목 &lt;b&gt;</p><div class="x"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg><br><span>a</span></div><svg class="k-brace"><path d="M2 0"/></svg>';
  const out = markRoots(html, 'data-block="3"');
  assert.equal((out.match(/data-block="3"/g) ?? []).length, 3, "맨 위 p·div·svg 셋");
  assert.match(out, /^<p data-block="3" class="t">/);
  assert.match(out, /<span>a<\/span>/, "안쪽 요소는 그대로");
  assert.match(out, /<path d="M0 0"\/>/, "스스로 닫는 태그 그대로");
  assert.equal(out.replace(/ data-block="3"/g, ""), html);
});

// ---------------------------------------------------------------------------
// 올해 실적(B, 2026-09-27, lib/reports/actuals.ts)

const ACTUALS_SAMPLE = {
  today: "2026-09-27",
  kpi: [
    { name: "지표A", unit: "건", prev: "10건", target: "20건", expected: "", input: "15건" },
    { name: "지표B", unit: "%", prev: "80%", target: "90%", expected: "85%", input: "" },
    { name: "지표C", unit: "명", prev: "5명", target: "10명", expected: "", input: "" },
  ],
  monthly: [{ period: "1월~8월", line: "659건 응답" }],
};

test("sectionPrompt: 「올해 실적 재료」— 계량지표 세 갈래(부서 입력·카드 예상 칸·없음 자리표시)와 월별 실적 줄, 자리표시 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const p = sectionPrompt(P, card, ctx, 2026, [], [], [], [], ACTUALS_SAMPLE);
  assert.doesNotMatch(p, /\{\{\w+\}\}/);
  assert.ok(p.includes("「올해(2026년) 실적 재료」"));
  assert.ok(p.includes("- 계량지표 지표A(건): ’25년 실적 10건 · ’26년 목표 20건 · ’26년 실적 15건(부서 입력)"), "부서 입력");
  assert.ok(p.includes("- 계량지표 지표B(%): ’25년 실적 80% · ’26년 목표 90% · ’26년 실적 85%(카드 예상 칸 — 실적이 아니라 예상)"), "카드 예상 칸");
  assert.ok(p.includes("- 계량지표 지표C(명): ’25년 실적 5명 · ’26년 목표 10명 · ’26년 실적 없음 — 쓰려면 【확인: ’26년 지표C】"), "없음 — 자리표시 안내");
  assert.ok(p.includes("- 월별 실적 중 수치가 든 줄(카드 do.monthly — 모두 올해 실적이므로 쓸 때 ’26.월 시점을 붙임):"));
  assert.ok(p.includes("  - [1월~8월] 659건 응답"));
  // 올해 실적 재료가 없으면(월별 수치 없음) 안내 문구
  const p2 = sectionPrompt(P, card, ctx, 2026, [], [], [], [], { ...ACTUALS_SAMPLE, monthly: [] });
  assert.ok(p2.includes("- 월별 실적에 수치가 든 줄이 없습니다 — 올해 값이 필요한 자리는 【확인: …】 자리표시로 남깁니다(전년 값·목표로 채우지 않음)."));
});

test("fitPrompt: 판면이 맞고(need=null) 올해 실적 문제만 있으면 「고치기」 머리 + 문제 목록, 「행별 어림 높이」·ragged·sparse 안내는 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const draft = out();
  const report: FitReport = { budget: 255, total: 255, rows: [{ label: "A", kinds: "bullets", mm: 100 }], wrapped: [], ragged: [], sparse: [], bullets: 10 };
  const issues = ["핵심 수치 띠에 올해(’26년) 실적 칸이 없습니다(40,000건 시점 없음) — 한 칸 이상을 「올해 실적 재료」의 값으로 바꿉니다.", "추진성과에 올해(’26년) 실적이 없습니다(예상·목표·전년 값뿐이거나 시점이 없음) — …"];
  const p = fitPrompt(P, ctx, draft, report, null, issues);
  assert.ok(p.includes("「고치기」"));
  assert.ok(p.includes("판면이 맞습니다(255mm / 255mm)"));
  for (const text of issues) assert.ok(p.includes(`  - ${text}`), text);
  assert.ok(!p.includes("행별 어림 높이"), "need가 없으면 행별 높이 안내는 없음");
  assert.ok(!p.includes("한두 글자만 다음 줄로"), "need가 없으면 ragged 안내도 없음");
  assert.ok(!p.includes("덜 채운 칸 글"), "need가 없으면 sparse 안내도 없음");
  // year를 안 주면(기본값 []) 「올해 실적」 문제 목록 자체가 안 붙음
  assert.doesNotMatch(fitPrompt(P, ctx, draft, report, null), /- 올해 실적/);
});

test("fitPrompt: 근거에 없는 숫자를 주면 맨 앞(기준 사다리 ① 근거)에 목록으로 — 근거 수치로 바꾸거나 숫자 없이·올해 값은 자리표시, 안 주면 없음(2026-10-10 계획서 §10 E4)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const report: FitReport = { budget: 255, total: 200, rows: [{ label: "A", kinds: "bullets", mm: 100 }], wrapped: [], ragged: [], sparse: [], bullets: 10 };
  const p = fitPrompt(P, ctx, out(), report, "under", ["올해 실적 문제"], [], ["문장 문제"], ["77%", "12.3"]);
  assert.match(p, /근거에 없는 숫자/);
  for (const t of ["  - 77%", "  - 12.3"]) assert.ok(p.includes(t), t);
  assert.ok(p.indexOf("근거에 없는 숫자") < p.indexOf("올해 실적(앱이") && p.indexOf("올해 실적(앱이") < p.indexOf("문장(앱이"), "근거 → 올해 실적 → 문장 순서");
  assert.doesNotMatch(fitPrompt(P, ctx, out(), report, "under"), /근거에 없는 숫자/);
});

test("verifySection: 자리표시(【확인: …】) 안의 숫자는 대조 대상이 아님 — 사실이 아니므로 카드에 없어도 경고 안 함", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({ results: ["【확인: ’26년 누적 1,234건】 달성"] });
  const v = verifySection(o, card, ctx);
  assert.ok(!v.unknownNumbers.includes("1,234"));
  assert.equal(v.spec.results[0], "【확인: ’26년 누적 1,234건】 달성", "글 자체는 그대로 남음(HTML은 노란 칸으로 그림)");
});

test("verifySection: year를 주면 올해 실적 문제(yearIssues)를 '올해 실적: ' 머리로 경고에 넣고, year가 없으면 판단하지 않음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const planOnlyDraft = out({ results: ["AI 판독 전국 확산으로 검사 소요시간 절감 예상", "’25년 대비 150% 상향된 위험 해소 예상"] });
  const withYear = verifySection(planOnlyDraft, card, ctx, "", [], "", 2026);
  assert.ok(withYear.yearIssues.length > 0);
  assert.ok(withYear.warnings.some((w) => w.startsWith("올해 실적: ") && w.includes("추진성과에 올해(’26년) 실적이 없습니다")));
  const noYear = verifySection(planOnlyDraft, card, ctx);
  assert.deepEqual(noYear.yearIssues, [], "year를 안 주면 빈 배열");
  assert.ok(!noYear.warnings.some((w) => w.startsWith("올해 실적:")));
});

test("HTML: 【확인: …】은 노란 칸(k-need)으로 바뀌고, 안쪽 글도 이스케이프됨(태그가 살아나지 않음)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx);
  const html = sectionHtml({ ...v.spec, results: ["실적 【확인: <b>x</b>】 확인 필요"] }, []);
  assert.match(html, /<span class="k-need" title="담당자 확인 — 채울 자료">&lt;b&gt;x&lt;\/b&gt;<\/span>/);
  assert.doesNotMatch(html, /<b>x<\/b>/, "이스케이프된 자리표시 안 태그는 살아나지 않음");
});

// ---------------------------------------------------------------------------
// 도식 수렴 해소(③, 2026-09-27, lib/reports/diagram-hints.ts) — sectionHints·composeIssues·verifySection·fitPrompt

test("sectionHints: 올해 실적 계량지표(부서 입력·목표)로 series(chart), lens의 '25 평가위원 지적으로 critiques(quotes)", { skip: NO_SEED_CARDS }, () => {
  const lens: LensRef[] = [{ group: "critiques", key: "e1", title: "'25 지적", where: "", text: "실질적 투입 시간을 통합적으로 고려하여 성과를 재산정할 필요가 있다" }];
  const withInput: YearActuals = { today: "", kpi: [{ name: "지표A", unit: "건", prev: "10건", target: "20건", expected: "", input: "15건" }], monthly: [] };
  const hintsInput = sectionHints(card, [], [], lens, withInput, 2026);
  assert.ok(hintsInput.some((h) => h.kind === "chart" && h.why.includes("지표A: ’25년 10건 → ’26년 15건")), "부서 입력값은 그대로 시점과 함께");
  assert.ok(hintsInput.some((h) => h.kind === "quotes" && h.why.includes("'25 평가위원 지적 1건")));

  // 2026-10-14: 부서 입력(’26 실적)이 없고 목표만 있으면 실적 없는 목표 막대가 되므로 후보에서 뺌
  const withoutInput: YearActuals = { today: "", kpi: [{ name: "지표B", unit: "%", prev: "80%", target: "90%", expected: "", input: "" }], monthly: [] };
  const hintsTarget = sectionHints(card, [], [], [], withoutInput, 2026);
  assert.ok(!hintsTarget.some((h) => h.kind === "chart" && h.why.includes("지표B")), "목표만 있으면 막대 후보 없음");

  // prev나 target(입력)에 수치가 없는 계량지표는 series에 안 들어가 chart 후보가 안 생김
  const noFigure: YearActuals = { today: "", kpi: [{ name: "지표C", unit: "명", prev: "", target: "", expected: "", input: "" }], monthly: [] };
  assert.ok(!sectionHints(card, [], [], [], noFigure, 2026).some((h) => h.kind === "chart" && h.why.includes("지표C")));
});

// 전년 절(2025 보고서)의 인용·현장 말·수상 낱말이 이 과제만의 요소 후보를 켜지 않음(2026-10-14 후속 2 — 블라인드 심사 「전년복제」)
const PRIOR_ONLY = "주민은 “전자파가 걱정돼서 잠을 못 자요”라고 했다.\n장관은 “전파 안전은 국민 생활의 기본 바탕이다”라고 강조했다.\n’25 공모전 장관상 수상\n기존 수기 점검을 자동 점검으로 전환";
const priorOf = (text: string): PriorPick[] => [{ section: { key: "rpt25/k", business: "BZ-1", taskNo: "1-1", mark: "가", title: "전년 절", taskTitle: "", targetName: "", page: null, text }, score: 0.3 }];
const NO_ACTUALS: YearActuals = { today: "", kpi: [], monthly: [] };

test("sectionHints: 이 과제만의 요소는 카드·첨부 글로만(전년 절 인용·말투·수상 낱말로 안 켜짐), 기본 도식은 전년 절까지 봄", () => {
  const bare = { id: "x", taskNo: "1-1", title: "전파 안전 점검" };
  const hints = sectionHints(bare, priorOf(PRIOR_ONLY), [], [], NO_ACTUALS, 2026);
  assert.deepEqual(hints.filter((h) => h.own), [], "전년 절에만 있는 인용·말풍선·우수사례는 후보 아님");
  assert.ok(hints.some((h) => h.kind === "compare:panels" && !h.own), "전년 절의 전후 줄은 기본 도식 신호로 셈");
  // 카드에 같은 말이 있으면 켜짐
  const spoken = sectionHints({ ...bare, title: "주민 “전자파가 걱정돼서 잠을 못 자요”" }, priorOf(PRIOR_ONLY), [], [], NO_ACTUALS, 2026);
  assert.equal(spoken[0].kind, "voices");
  // 첨부 글의 인용·수상도 켜짐
  const attached = sectionHints(bare, priorOf(PRIOR_ONLY), [{ name: "결과보고", text: "“전파 안전은 국민 생활의 기본 바탕이다” — ’26 공모전 우수사례 선정" }], [], NO_ACTUALS, 2026);
  assert.deepEqual(attached.filter((h) => h.own).map((h) => h.kind), ["case", "quotes"]);
  // 전년 절이 없으면 예전과 같음(한 번만 셈)
  assert.deepEqual(sectionHints(bare, [], [{ name: "a", text: PRIOR_ONLY }], [], NO_ACTUALS, 2026).filter((h) => h.own).map((h) => h.kind), ["case", "voices", "quotes"]);
});

test("verifySection(years): 인용·말풍선·우수사례 원문이 2025 보고서 글에서만 찾아지면 「전년 인용:」 짜임 문제, 올해 근거에도 있으면 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const actuals = { kpi: [], monthly: [] } as unknown as YearActuals;
  const o = out({
    blocks: [
      ...out().blocks,
      blk({ kind: "voices", cells: [cell("주민", ["“전자파가 걱정돼서 잠을 못 자요”"])] }),
      blk({ kind: "case", title: "’25 공모전", items: ["장관상 수상"], evidence: "’25 공모전 장관상 수상" }),
    ],
  });
  const ev = draftEvidence([], priorOf(PRIOR_ONLY), [], actuals);
  assert.equal(ev.past, PRIOR_ONLY);
  const v = verifySection(o, card, ctx, ev.known, [], ev.quoteOnly, undefined, [], undefined, { past: ev.past, current: ev.current });
  const issue = v.composeIssues.find((x) => x.startsWith("전년 인용:"));
  assert.ok(issue, "짜임 문제로(자동 고치기 사유)");
  assert.match(issue!, /「전자파가 걱정돼서 잠을 못 자요」·「’25 공모전 장관상 수상」는 2025 보고서 글 — 올해 근거로 바꾸거나 빼 주세요/);
  assert.ok(v.warnings.includes(issue!));
  // 첨부(올해 근거)에 같은 말이 있으면 문제 아님
  const withFile = draftEvidence([{ name: "만족도 조사", text: "주민 “전자파가 걱정돼서 잠을 못 자요” · ’25 공모전 장관상 수상" }], priorOf(PRIOR_ONLY), [], actuals);
  assert.ok(!verifySection(o, card, ctx, withFile.known, [], withFile.quoteOnly, undefined, [], undefined, withFile).composeIssues.some((x) => x.startsWith("전년 인용:")));
  // years를 안 주면 보지 않음(예전과 같음)
  assert.ok(!verifySection(o, card, ctx, ev.known, [], ev.quoteOnly).composeIssues.some((x) => x.startsWith("전년 인용:")));
  // 이 과제에 연결된 2025 보고서 절(linked report_section)도 2025 글, 연결된 실사 답변은 올해 근거
  const linked = draftEvidence([], [], [], actuals, [{ unitType: "report_section", text: "가" }, { unitType: "qa_pair", text: "나" }]);
  assert.deepEqual([linked.past, linked.current], ["가", "나"]);
});

test("sectionPrompt 도식 고르기: 두 목록(이 과제만의 요소·기본 도식)이 모두 있으면 각 항목이, 후보가 없으면 목록마다 '없음'", () => {
  const bareCard = { id: "x", taskNo: "1-1", title: "테스트 과제" };
  const bareCtx: SectionContext = { business: { no: 1, name: "테스트" }, task: { no: "1-1", title: "테스트" }, mark: "가", markers: [], module: 1, head: "all" };
  const pBare = sectionPrompt(P, bareCard, bareCtx, 2026);
  const guide = (p: string) => p.slice(p.indexOf("「도식 고르기」"), p.indexOf("「도식 고르기」") + 400);
  assert.match(guide(pBare), /강한 순\):\n {2}- 없음\n- 기본 도식\(내용 모양에 맞는 것\):\n {2}- 없음/, "둘 다 후보 없으면 둘 다 없음");
  const pOwnOnly = sectionPrompt(P, bareCard, bareCtx, 2026, [{ name: "a", text: "“판독 정확도를 크게 높였다는 평가”" }]);
  assert.match(guide(pOwnOnly), /강한 순\):\n {2}- quotes: .*\n- 기본 도식\(내용 모양에 맞는 것\):\n {2}- 없음/, "own만 있으면 own은 항목, 기본은 없음");
  const baLine = ["기존 방식에서 개선 방식으로 전환", "현행 체계를 개선 체계로 전환", "수기 처리를 개선 처리로 전환"].join("\n");
  const pBasicOnly = sectionPrompt(P, bareCard, bareCtx, 2026, [{ name: "a", text: baLine }]);
  assert.match(guide(pBasicOnly), /강한 순\):\n {2}- 없음\n- 기본 도식\(내용 모양에 맞는 것\):\n {2}- compare:panels: /, "기본만 있으면 own은 없음, 기본은 항목");
});

test("composeIssues: 이 과제만의 요소 후보가 없거나 이미 쓴 종류가 있으면 빈 배열, 그 밖엔 후보를 이름 붙여 알림", () => {
  const own: DiagramHint[] = [{ kind: "hub", why: "기관 3곳(과기정통부·행안부·승강기공단) — 협업 구조", own: true }];
  assert.deepEqual(composeIssues([], []), [], "후보 자체가 없으면 빈 배열");
  const usedHub: Block = { kind: "hub", label: "", title: "", variant: "", text: "", items: [], cells: [{ head: "a", tag: "", bullets: ["b"], note: "" }], rows: [], series: [], badge: "" };
  assert.deepEqual(composeIssues([usedHub], own), [], "이미 hub를 썼으면 빈 배열");
  const onlyBasic: Block = { kind: "bullets", label: "", title: "", variant: "", text: "", items: ["a"], cells: [], rows: [], series: [], badge: "" };
  assert.deepEqual(composeIssues([onlyBasic], own), ["이 과제만의 요소가 없습니다 — 기본 도식 하나를 후보(hub) 중 하나로 바꿉니다: 기관 3곳(과기정통부·행안부·승강기공단) — 협업 구조."]);
});

test("composeIssues: '25 평가위원 지적 인용 후보만 있으면 강제하지 않고, 다른 후보가 있으면 그것만 이름 붙여 알림", () => {
  const quoteOnly: DiagramHint[] = [{ kind: "quotes", why: "'25 평가위원 지적 2건 — 지적 원문 인용 상자로 「지적 → 올해 조치」", own: true }];
  const onlyBasic: Block = { kind: "bullets", label: "", title: "", variant: "", text: "", items: ["a"], cells: [], rows: [], series: [], badge: "" };
  assert.deepEqual(composeIssues([onlyBasic], quoteOnly), [], "지적 인용뿐이면 빈 배열");
  const both: DiagramHint[] = [...quoteOnly, { kind: "case", why: "수상·공모전·우수사례 — 우수사례 상자", own: true }];
  const issues = composeIssues([onlyBasic], both);
  assert.equal(issues.length, 1);
  assert.ok(issues[0].includes("case"));
  assert.ok(!issues[0].includes("'25 평가위원 지적"));
});

test("verifySection(own): 짜임 문제(composeIssues)가 있으면 spec에 담고 '도식: ' 경고를 냄, 없으면 둘 다 비움", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const own: DiagramHint[] = [{ kind: "hub", why: "기관 3곳 — 협업 구조", own: true }];
  // 기본 out()의 블록(bullets·compare·timeline)은 이 과제만의 요소를 안 씀 → 짜임 문제 있음
  const withIssue = verifySection(out(), card, ctx, "", [], "", undefined, own);
  assert.equal(withIssue.composeIssues.length, 1);
  assert.ok(withIssue.warnings.some((w) => w.startsWith("도식: 이 과제만의 요소가 없습니다")));
  // own을 안 주면(기본값 []) 짜임 문제를 보지 않음
  const noOwn = verifySection(out(), card, ctx);
  assert.deepEqual(noOwn.composeIssues, []);
  assert.ok(!noOwn.warnings.some((w) => w.startsWith("도식:") && w.includes("이 과제만의 요소")));
});

test("fitPrompt: 짜임 문제(compose)가 있으면 need와 상관없이 목록을 더함 — need가 없으면 그래도 「고치기」 머리", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const draft = out();
  const report: FitReport = { budget: 255, total: 255, rows: [{ label: "A", kinds: "bullets", mm: 100 }], wrapped: [], ragged: [], sparse: [], bullets: 10 };
  const compose = ["이 과제만의 요소가 없습니다 — 기본 도식 하나를 후보(hub) 중 하나로 바꿉니다: 기관 3곳 — 협업 구조."];
  const p = fitPrompt(P, ctx, draft, report, null, [], compose);
  assert.ok(p.includes("「고치기」"), "need가 없으면(판면이 맞으면) 짜임 문제만 있어도 「고치기」 머리");
  assert.ok(p.includes("짜임(앱이 초안에서 찾은 문제"));
  assert.ok(p.includes(`  - ${compose[0]}`));
  // compose를 안 주면(기본값 []) 짜임 문제 목록 자체가 없음
  assert.doesNotMatch(fitPrompt(P, ctx, draft, report, null), /짜임\(앱이 초안에서 찾은 문제/);
});

test("styleWarnings: 【확인: …】 자리표시는 4자(○○○○)로 셈 — 자리표시가 길어서 원문이 75자를 넘어도 추진성과 경고는 없음", () => {
  const filler = "가".repeat(80);
  const line = `실적 【확인: ${filler}】 달성`;
  assert.ok(line.length > 75, "원문 자체는 75자를 훌쩍 넘음");
  assert.deepEqual(styleWarnings({ rows: [], results: [line], blocks: [] }), []);
});

// ---------------------------------------------------------------------------
// 그림 자리표시(figures, 2026-09-27, lib/reports/blocks.ts·fit.ts·section-html.ts)

const figOut = (n: number, over: Partial<{ kind: "photo" | "illust" | "map" | "screen" | "logo"; pos: "left" | "right" | "center"; size: "S" | "M" | "L" | "W" | "MAP" }> = {}) =>
  Array.from({ length: n }, (_, i) => ({ kind: "photo" as const, desc: `현장 사진${i}`, pos: "right" as const, size: "M" as const, ...over }));

test("verifySection: 그림 자리표시는 쪽 모듈 상한(0.5쪽 2·1쪽 4)을 넘으면 뒤 블록 것부터 빼고 경고", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1")); // AX 붙임 카드라 module 1 → 상한 4
  assert.equal(ctx.module, 1);
  const o = out({
    blocks: [
      blk({ kind: "cards", label: "A", cells: [cell("h1", ["가나다"]), cell("h2", ["나"])], figures: figOut(2) }),
      blk({ kind: "cards", label: "B", cells: [cell("h1", ["가나다"]), cell("h2", ["나"])], figures: figOut(2) }),
      blk({ kind: "cards", label: "C", cells: [cell("h1", ["가나다"]), cell("h2", ["나"])], figures: figOut(2) }),
    ],
  });
  const v = verifySection(o, card, ctx);
  assert.deepEqual(v.spec.blocks?.map((b) => b.figures?.length), [2, 2, 0], "앞 두 블록(합 4개)만 남고 셋째 블록의 그림은 빠짐");
  assert.ok(v.warnings.some((w) => w === "그림: 자리표시는 1쪽에 4개까지라 뒤 2개를 뺐습니다."));
});

test("verifySection: 그림 서술(figures.desc)의 숫자는 sectionText(숫자 대조·문체 경고 대상)에 들어가지 않아 '없는 숫자'로 잡히지 않음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({ blocks: [blk({ kind: "bullets", label: "추진배경", items: ["가나다"], figures: [{ kind: "photo", desc: "50m 고소 작업차 현장 사진", pos: "right", size: "M" }] })] });
  const v = verifySection(o, card, ctx);
  assert.ok(!v.unknownNumbers.includes("50"), "그림 서술의 숫자는 대조 대상이 아님");
  assert.doesNotMatch(sectionText(v.spec), /50m/, "그림 자리표시 글은 sectionText(숫자 대조·검색 대상)에 없음");
});

test("HTML: 옆 그림은 k-figrow로 감싸고, left는 본문 앞·그 밖은 뒤", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({ blocks: [blk({ kind: "bullets", label: "추진배경", items: ["가나다"], figures: [{ kind: "photo", desc: "왼쪽사진", pos: "left", size: "M" }, { kind: "illust", desc: "오른쪽삽화", pos: "right", size: "M" }] })] });
  const v = verifySection(o, card, ctx);
  const html = sectionHtml(v.spec, v.unknownNumbers);
  assert.match(html, /<div class="k-figrow">/);
  const iLeft = html.indexOf("왼쪽사진");
  const iMain = html.indexOf("k-figrow__main");
  const iRight = html.indexOf("오른쪽삽화");
  assert.ok(iLeft > 0 && iLeft < iMain && iMain < iRight, `순서 left(${iLeft}) < main(${iMain}) < right(${iRight})`);
});

test("HTML: 전후 비교(compare panels) — left 그림은 As-Is 패널 안, center 그림은 두 패널 사이(k-panels__mid, 열 폭이 바뀜)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({
    blocks: [blk({ kind: "compare", variant: "panels", items: ["기존", "개선"], rows: [{ key: "k", before: ["a"], after: ["b"] }], figures: [{ kind: "illust", desc: "작업전 삽화", pos: "left", size: "M" }, { kind: "illust", desc: "가운데 삽화", pos: "center", size: "L" }] })],
  });
  const v = verifySection(o, card, ctx);
  const html = sectionHtml(v.spec, []);
  assert.match(html, /style="grid-template-columns:minmax\(0,1fr\) \d+mm minmax\(0,1fr\)"/, "가운데 그림이 있으면 열 폭이 바뀜");
  const iAsIs = html.indexOf('<section class="k-panel">');
  const iFigLeft = html.indexOf("작업전 삽화");
  const iToBe = html.indexOf('<section class="k-panel k-panel--to">');
  const iMid = html.indexOf("k-panels__mid");
  assert.ok(iAsIs >= 0 && iAsIs < iFigLeft && iFigLeft < iToBe, "왼쪽 그림은 As-Is 패널 안");
  assert.ok(iMid > 0, "가운데 그림 자리");
  assert.match(html, /k-panels__mid">[\s\S]*가운데 삽화/);
});

test("HTML: 협업 구조(hub) 가운데 로고는 k-hub__logos, 우수사례(case) 옆 그림은 k-case__figslot", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const o = out({
    blocks: [
      blk({ kind: "hub", cells: [cell("판독 협의체", ["기준 공유"]), cell("이동통신사", ["제원 공유"])], figures: [{ kind: "logo", desc: "이동통신사･KCA 기관 로고", pos: "center", size: "M" }] }),
      blk({ kind: "case", label: "우수사례", title: "공모전 대상", items: ["수상"], evidence: "과기정통부 공모전 대상 수상", figures: [{ kind: "photo", desc: "시상식 사진", pos: "right", size: "M" }] }),
    ],
  });
  const v = verifySection(o, card, ctx, "과기정통부 공모전 대상 수상");
  assert.deepEqual(v.spec.blocks?.map((b) => b.kind), ["hub", "case"], "우수사례는 근거 원문을 찾아 남음");
  const html = sectionHtml(v.spec, []);
  assert.match(html, /<div class="k-hub__logos">[\s\S]*기관 로고/);
  assert.match(html, /class="k-fig k-case__figslot"[^>]*>[\s\S]*시상식 사진/);
});

test("HTML: 그림 서술(desc)도 렌더러가 이스케이프 — <b>가 글자로 남고 태그가 살아나지 않음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx);
  const raw = sectionHtml({ ...v.spec, blocks: [{ kind: "bullets", label: "", title: "", variant: "", text: "", items: ["x"], cells: [], rows: [], series: [], badge: "", figures: [{ kind: "photo", desc: "<b>현장</b> 사진", pos: "right", size: "M" }] }] }, []);
  assert.match(raw, /&lt;b&gt;현장&lt;\/b&gt; 사진/);
  assert.doesNotMatch(raw, /<b>현장/);
});

// ---------------------------------------------------------------------------
// 그림 자리 2차 보완(2026-09-27, 평가 라운드 G — 불릿 옆 쏠림·과다 축소, lib/reports/section.ts figurePlaceIssues·fitPrompt)

const bulletsWithFig = (kind: "photo" | "logo" = "photo"): Block => ({
  kind: "bullets",
  label: "",
  title: "",
  variant: "",
  text: "",
  items: ["a"],
  cells: [],
  rows: [],
  series: [],
  badge: "",
  figures: [{ kind, desc: "x", pos: "right", size: "M" }],
});

test("figurePlaceIssues: 불릿 옆 그림 2개 이상은 문제, 1쪽 이상에서 그림이 모두 불릿 옆이면 문제, 0.5쪽 불릿 옆 1개는 문제 없음, 로고는 셈에서 빠짐", () => {
  assert.deepEqual(figurePlaceIssues([bulletsWithFig(), bulletsWithFig()], 1), [
    "그림 자리: 불릿 블록 옆 그림이 2개입니다 — 1개만 남기고 나머지는 전후 비교(패널 안)·우수사례 옆·현황 칸·단계 블록 옆으로 옮깁니다.",
  ]);
  assert.deepEqual(figurePlaceIssues([bulletsWithFig()], 1), [
    "그림 자리: 그림이 모두 불릿 블록 옆입니다 — 하나 이상은 도식 블록(전후 비교 패널 안·우수사례 옆·현황 칸·단계 블록 옆)에 둡니다.",
  ]);
  assert.deepEqual(figurePlaceIssues([bulletsWithFig()], 0.5), [], "0.5쪽은 불릿 옆 그림 1개까지 허용");
  assert.deepEqual(figurePlaceIssues([bulletsWithFig("logo")], 1), [], "로고는 그림 자리 문제 셈에서 빠짐");
  assert.deepEqual(figurePlaceIssues([], 1), [], "그림이 없으면 문제 없음");
});

test("verifySection: 그림 자리 문제(figurePlaceIssues)가 있으면 '그림 자리: ' 경고와 composeIssues에 모두 들어감", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1")); // module 1, 상한 4개라 그림 2개는 깎이지 않음
  const o = out({
    blocks: [
      blk({ kind: "bullets", label: "추진배경", items: ["가나다"], figures: figOut(1) }),
      blk({ kind: "bullets", label: "추진내용", items: ["라마바"], figures: figOut(1) }),
      blk({ kind: "timeline", cells: [cell("’25년", ["설명"])] }),
    ],
  });
  const v = verifySection(o, card, ctx);
  const msg = "그림 자리: 불릿 블록 옆 그림이 2개입니다 — 1개만 남기고 나머지는 전후 비교(패널 안)·우수사례 옆·현황 칸·단계 블록 옆으로 옮깁니다.";
  assert.ok(v.warnings.includes(msg), "경고에 들어감");
  assert.ok(v.composeIssues.includes(msg), "고치기 요청(composeIssues)에도 들어감");
});

test("fitPrompt: over·under 요청에 목표 범위(예산의 97~100%)가 들어감 — 1쪽(budget 255)이면 '목표 높이는 247~255mm'", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const draft = out();
  const base: FitReport = { budget: 255, total: 255, rows: [{ label: "A", kinds: "bullets", mm: 100 }], wrapped: [], ragged: [], sparse: [], bullets: 10 };
  const pOver = fitPrompt(P, ctx, draft, { ...base, total: 300 }, "over");
  assert.match(pOver, /목표 높이는 247~255mm/);
  const pUnder = fitPrompt(P, ctx, draft, { ...base, total: 150 }, "under");
  assert.match(pUnder, /목표 높이는 247~255mm/);
});


// ---------------------------------------------------------------------------
// 추진성과 곁들임(resultExtras) — 막대(resultChart)·강조 띠(resultBand), 2026-09-27 표현 보강

// numberTokens가 돌려주는 표기(쉼표·퍼센트 포함) 그대로 알아야 함(verifySection의 isKnown과 같은 규칙)
const known = new Set(["45,000", "150%", "98%"]);
const isKnown = (t: string) => known.has(t);

test("resultExtras: 막대는 시점 라벨이 모두 있고, 값이 모두 근거에 있는 숫자이며 2개 이상일 때만 남음", () => {
  const good = resultExtras({ resultChart: { title: "판독 확대", series: [{ label: "’25년", value: "45,000건" }, { label: "’26년", value: "150%" }], badge: "" } }, false, isKnown, "");
  assert.ok(good.chart, "시점 라벨·근거 숫자가 다 있으면 남음");
  assert.deepEqual(good.chart?.series.map((s) => s.value), ["45,000건", "150%"]);
  assert.deepEqual(good.warnings, []);
});

test("resultExtras: 시점 라벨이 없는 막대는 버리고 경고", () => {
  const r = resultExtras({ resultChart: { title: "", series: [{ label: "지역A", value: "45,000건" }, { label: "지역B", value: "150%" }], badge: "" } }, false, isKnown, "");
  assert.equal(r.chart, null);
  assert.ok(r.warnings.some((w) => w.includes("시점 라벨")));
});

test("resultExtras: 근거에 없는 값이 있는 막대는 버리고 경고", () => {
  const r = resultExtras({ resultChart: { title: "", series: [{ label: "’25년", value: "45,000건" }, { label: "’26년", value: "99,999건" }], badge: "" } }, false, isKnown, "");
  assert.equal(r.chart, null);
  assert.ok(r.warnings.some((w) => w.includes("근거에 없는 값") && w.includes("99,999건")));
});

test("resultExtras: 자리표시(【확인: …】) 값이 든 막대는 버림", () => {
  const r = resultExtras({ resultChart: { title: "", series: [{ label: "’25년", value: "【확인: 값】" }, { label: "’26년", value: "150%" }], badge: "" } }, false, isKnown, "");
  assert.equal(r.chart, null);
});

test("resultExtras: 값이 있는 막대가 1개뿐이면 버리고 경고", () => {
  const r = resultExtras({ resultChart: { title: "", series: [{ label: "’25년", value: "45,000건" }], badge: "" } }, false, isKnown, "");
  assert.equal(r.chart, null);
  assert.ok(r.warnings.some((w) => w.includes("2개보다 적어")));
});

test("resultExtras: 3칸 추진성과(resultCards)와 함께면 막대를 버리고 경고", () => {
  const r = resultExtras({ resultChart: { title: "", series: [{ label: "’25년", value: "45,000건" }, { label: "’26년", value: "150%" }], badge: "" } }, true, isKnown, "");
  assert.equal(r.chart, null);
  assert.ok(r.warnings.some((w) => w.includes("3칸 추진성과와 함께")));
});

test("resultExtras: 강조 띠는 근거에 있는 등급으로 올려야(C → B) 남고, 근거에 없는 등급이면 버림", () => {
  const ok = resultExtras({ resultBand: "C→B 등급 향상" }, false, isKnown, "지난해 C등급에서 이번에 B등급으로 향상");
  assert.equal(ok.band, "C→B 등급 향상");
  const bad = resultExtras({ resultBand: "D→A 등급 향상" }, false, isKnown, "지난해 C등급에서 이번에 B등급으로 향상");
  assert.equal(bad.band, "");
  assert.ok(bad.warnings.some((w) => w.includes("근거에 있는 숫자·등급이 아니어서")));
});

test("resultExtras: 막대와 강조 띠가 함께 있으면 띠 글을 막대 배지로 옮기고 띠는 비움", () => {
  const r = resultExtras(
    { resultChart: { title: "", series: [{ label: "’25년", value: "45,000건" }, { label: "’26년", value: "150%" }], badge: "" }, resultBand: "98% 달성" },
    false,
    isKnown,
    "",
  );
  assert.ok(r.chart);
  assert.equal(r.chart?.badge, "98% 달성");
  assert.equal(r.band, "");
  assert.ok(r.warnings.some((w) => w.includes("막대와 함께 쓰지 않아")));
});

test("resultExtras: 자리표시(【확인: …】) 값이 든 강조 띠는 버림", () => {
  const r = resultExtras({ resultBand: "【확인: 등급】 향상" }, false, isKnown, "");
  assert.equal(r.band, "");
});

test("verifySection: 통과한 막대·강조 띠는 spec에 담기고 없는 숫자에 안 잡힘", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out({ resultChart: { title: "판독 확대", series: [{ label: "’25년", value: "30,706건" }, { label: "’26년", value: "45,000건" }], badge: "" } }), card, ctx);
  assert.ok(v.spec.resultChart);
  assert.deepEqual(v.spec.resultChart?.series.map((s) => s.value), ["30,706건", "45,000건"]);
  assert.ok(!v.unknownNumbers.includes("30,706") && !v.unknownNumbers.includes("45,000"));
});

test("styleWarnings: 위첨자(^{…})는 길이·끝말 셈에서 빠짐 — 위첨자로 늘어난 추진성과가 75자를 넘어도 경고 없음", () => {
  const short = "가".repeat(70);
  const line = `${short} ^{’24년에서 ’25년으로 달라진 실적}100건`;
  assert.ok(line.length > 75);
  assert.deepEqual(styleWarnings({ rows: [], results: [line], blocks: [] }), []);
});

test("HTML: ^{…} 표기는 <sup>로 바뀌고, 짝이 없는 ^{는 그대로 남으며 이스케이프됨", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out({ results: ["^{’24년}100국 → ^{’25년}200국 확대"] }), card, ctx);
  const html = sectionHtml(v.spec, []);
  assert.match(html, /<sup class="k-sup">’24년<\/sup>100국/);
  assert.match(html, /<sup class="k-sup">’25년<\/sup>200국/);
  const raw = sectionHtml({ ...v.spec, results: ["짝 없는 ^{닫히지 않음"] }, []);
  assert.doesNotMatch(raw, /<sup/);
  assert.match(raw, /\^\{닫히지 않음/);
});

// ---------------------------------------------------------------------------
// 새 블록: qa(Q&A 상자)·table(수치 표)·cards vs(대립) — HTML 마크업

test("HTML: qa(Q&A 상자)는 dl.k-qa로, 쌍마다 dt(질문)·dd(답 불릿)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out({ blocks: [blk({ kind: "qa", cells: [cell("왜 필요한가요?", ["안전 확보를 위해"])] })] }), card, ctx);
  const html = sectionHtml(v.spec, []);
  assert.match(html, /<dl class="k-qa">/);
  assert.match(html, /<dt>[\s\S]*왜 필요한가요\?[\s\S]*<\/dt><dd>[\s\S]*안전 확보를 위해[\s\S]*<\/dd>/);
});

test("HTML: table(수치 표)은 table.k-tbl + colgroup, 빈 칸은 빈 td", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(
    out({
      blocks: [
        blk({
          kind: "table",
          items: ["구분", "’24년", "’25년"],
          cells: [cell("가입자", ["10만", "20만"]), cell("매출", ["", "8억"])],
        }),
      ],
    }),
    card,
    ctx,
  );
  const html = sectionHtml(v.spec, []);
  assert.match(html, /<table class="k-tbl"><colgroup>/);
  assert.match(html, /<th scope="col">구분<\/th><th scope="col">’24년<\/th><th scope="col">’25년<\/th>/);
  assert.match(html, /<th scope="row">매출<\/th><td><\/td><td>8억<\/td>/, "빈 칸은 빈 td");
});

test("HTML: cards vs(대립)는 k-cards--vs로, 두 칸 사이 VS 표지", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out({ blocks: [blk({ kind: "cards", variant: "vs", cells: [cell("찬성", ["도입 편익 큼"]), cell("반대", ["도입 비용 큼"])] })] }), card, ctx);
  const html = sectionHtml(v.spec, []);
  assert.match(html, /<div class="k-cards k-cards--vs">/);
  assert.match(html, /<div class="k-vs" aria-label="대비">VS<\/div>/);
});

// ---------------------------------------------------------------------------
// 근거 겹침(4단계 검증 보강, 2026-09-27, lib/reports/ground.ts) — verifySection이 spec.ground와 경고를 담음. HTML 표시는 화면 미리보기만

// 근거 있는 문장(카드 제목 그대로 — overlap 1) — 블록 라벨은 빈 문자열로 둠(라벨도 근거를 보는데 「추진배경」 같은 짧은 라벨은
// 2025 실측 자체가 카드 글과 겹치지 않아 0.333으로 기준(0.5) 아래일 수 있음 — 이 시험은 라벨이 아니라 본문 문장을 봄)
const GROUNDED = "AI 안테나 자동판독 무선국 검사 안전 효율 혁신";
const UNRELATED = ["화성 탐사선 발사 성공", "축구 국가대표팀 월드컵 우승", "커피 원두 로스팅 비법 공개", "은하수 관측 다큐멘터리 방영", "열대어 수족관 조명 밝기 조절", "산호초 백화 현상 관찰 기록"];

test("verifySection: 근거(카드 글)와 겹치는 말이 적은 문장은 spec.ground.weak에 원문 전부가 담기고, '근거 약함: ' 경고는 겹침이 낮은 순으로 최대 5개까지만", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out({ blocks: [blk({ kind: "bullets", label: "", items: UNRELATED })], results: [] }), card, ctx);
  assert.ok(v.spec.ground, "약한 문장이 있으면 ground를 채움");
  assert.equal(v.spec.ground?.weak.length, UNRELATED.length, "약한 문장 원문 전부(자르지 않음)");
  for (const s of UNRELATED) assert.ok(v.spec.ground?.weak.includes(s));
  assert.equal(v.spec.ground!.checked, UNRELATED.length, "판단한 문장 수");
  const msg = v.warnings.find((w) => w.startsWith("근거 약함: "));
  assert.ok(msg, "경고가 들어감");
  assert.equal(msg!.split(" / ").length, 5, "경고 문장은 최대 5개까지만 나열");
  assert.match(msg!, new RegExp(`문장 ${UNRELATED.length}개\\(판단 ${v.spec.ground!.checked}개 중\\)`));
});

test("verifySection: 근거와 잘 겹치면(카드 제목 그대로) ground도 '근거 약함:' 경고도 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out({ blocks: [blk({ kind: "bullets", label: "", items: [GROUNDED] })], results: [GROUNDED] }), card, ctx);
  assert.equal(v.spec.ground, undefined);
  assert.ok(!v.warnings.some((w) => w.startsWith("근거 약함: ")));
});

test("verifySection: 근거 겹침은 카드뿐 아니라 첨부·전년 절 글(extraText)도 봄 — extraText에 있으면 약하지 않음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const one = UNRELATED[0];
  const bare = verifySection(out({ blocks: [blk({ kind: "bullets", label: "", items: [one] })], results: [] }), card, ctx);
  assert.ok(bare.spec.ground?.weak.includes(one));
  const withExtra = verifySection(out({ blocks: [blk({ kind: "bullets", label: "", items: [one] })], results: [] }), card, ctx, one);
  assert.equal(withExtra.spec.ground, undefined, "첨부·전년 절 글에 그대로 있으면 겹침이 커져 더는 약하지 않음");
});

test("sectionHtml: weak 옵션을 줄 때만 근거 약한 문장을 옅은 점선(k-weak)으로 감쌈, sectionDocument(내려받기)에는 넣지 않음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out({ blocks: [blk({ kind: "bullets", label: "", items: UNRELATED })], results: [] }), card, ctx);
  const weak = v.spec.ground!.weak;
  const plain = sectionHtml(v.spec, v.unknownNumbers);
  assert.doesNotMatch(plain, /class="k-weak"/, "weak 옵션을 안 주면 표시 없음");
  const marked = sectionHtml(v.spec, v.unknownNumbers, { weak });
  assert.match(marked, /class="k-weak"/, "weak 옵션을 주면 표시");
  assert.match(marked, new RegExp(`class="k-weak"[^>]*>${weak[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<`));
  // 내려받기 문서: sectionDocument는 weak 옵션을 받지 않으므로(타입 Pick<SectionHtmlOptions, "marks">) 어떤 문장도 표시되지 않음
  // — CSS에는 .k-weak 규칙이 늘 있으므로(항상 정의) class="k-weak"로 감싼 곳이 없는지만 봄(사용자 결정 2026-09-27)
  const doc = sectionDocument(v.spec, v.unknownNumbers, { year: 2026, generatedAt: "", model: "" });
  assert.doesNotMatch(doc, /class="k-weak"/, "내려받기 문서는 근거 약한 문장을 표시하지 않음");
});

// ---------------------------------------------------------------------------
// 문장 품질(문장품질-수정안 P7, 2026-09-27, lib/reports/prose.ts) — verifySection이 담고 fitPrompt가 교정 요청에 넣음

test("verifySection: 문장 문제(proseIssues)가 있으면 spec.proseIssues에 담고 '문장: ' 경고를 냄, 없으면 둘 다 비움", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const listedBlock = blk({ kind: "bullets", label: "추진내용", items: ["산악 커버리지 분석, 현장 전파수신레벨 수집, 신속 서비스용 집중 검사 운영"] });
  const withIssue = verifySection(out({ blocks: [listedBlock] }), card, ctx);
  assert.ok(withIssue.proseIssues.length > 0);
  assert.ok(withIssue.proseIssues.some((x) => x.startsWith("한 칸에 서로 다른 항목을 나열한 글")));
  assert.ok(withIssue.warnings.some((w) => w.startsWith("문장: 한 칸에 서로 다른 항목을 나열한 글")));
  const plainBlock = blk({ kind: "bullets", label: "추진배경", items: ["철탑에 오르지 않는 AI 안테나 판독으로 추락 위험 해소"] });
  const noIssue = verifySection(out({ blocks: [plainBlock] }), card, ctx);
  assert.deepEqual(noIssue.proseIssues, []);
  assert.ok(!noIssue.warnings.some((w) => w.startsWith("문장:")));
});

test("fitPrompt: prose를 주면 「문장(앱이 초안에서 찾은 문제」 머리와 항목이 붙고, 안 주면(기본값 []) 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const draft = out();
  const report: FitReport = { budget: 255, total: 255, rows: [{ label: "A", kinds: "bullets", mm: 100 }], wrapped: [], ragged: [], sparse: [], bullets: 10 };
  const prose = ["한 칸에 서로 다른 항목을 나열한 글 1개 — 한 칸 한 명제(대상·수단·결과)로 다시 쓰고 나머지 항목은 빼거나 다른 칸으로: [추진내용] 「산악 커버리지 분석, 현장 전파수신레벨…」"];
  const p = fitPrompt(P, ctx, draft, report, null, [], [], prose);
  assert.ok(p.includes("「고치기」"), "need가 없어도(판면이 맞아도) 문장 문제만 있으면 「고치기」 머리");
  assert.ok(p.includes("문장(앱이 초안에서 찾은 문제"));
  assert.ok(p.includes(`  - ${prose[0]}`));
  assert.doesNotMatch(fitPrompt(P, ctx, draft, report, null), /문장\(앱이 초안에서 찾은 문제/, "prose를 안 주면 문장 문제 목록 자체가 없음");
});

// ---------------------------------------------------------------------------
// recheckSection(사람이 고친 초안 다시 점검 — lib/reports/block-edit.ts 블록 고치기 뒤)

test("recheckSection: 블록 글에 카드에 없는 숫자를 넣으면 unknownNumbers에 들어가고, extraText에 있으면 안 들어감", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const spec = verifySection(out({ blocks: [blk({ kind: "bullets", label: "추진배경", items: ["판독 정확도 77% 달성"] })], results: [] }), card, ctx).spec;
  const bare = recheckSection(spec, card);
  assert.deepEqual(bare.unknownNumbers, ["77%"]);
  assert.ok(bare.warnings.some((w) => w.includes("카드에 없는 숫자 1개")));
  const withExtra = recheckSection(spec, card, "결과보고(9.26.): 77% 달성");
  assert.deepEqual(withExtra.unknownNumbers, [], "extraText에 그 숫자가 있으면 아는 숫자");
  assert.ok(!withExtra.warnings.some((w) => w.includes("없는 숫자")));
});

test("recheckSection: humanEdits가 있으면 「사람이 고친 블록 N개(…번)」 경고, spec.fit(판면 어림)이 다시 셈됨", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const base = verifySection(out(), card, ctx).spec;
  assert.equal(base.humanEdits, undefined, "고치기 전에는 없음");
  const withEdits: typeof base = { ...base, humanEdits: [0, 2] };
  const r = recheckSection(withEdits, card);
  assert.ok(r.warnings.includes("사람이 고친 블록 2개(1·3번) — 다시 만들면 사라집니다(수정 이력에는 남음)."));
  assert.equal(typeof r.spec.fit?.total, "number");
  assert.equal(r.spec.fit?.total, fitReport(withEdits).total);
  assert.equal(r.spec.fit?.budget, fitReport(withEdits).budget);
  const noEdits = recheckSection(base, card);
  assert.ok(!noEdits.warnings.some((w) => w.startsWith("사람이 고친 블록")));
});

test("sectionOutputSchema: 구성안대로 쓸 때 story는 문자열로 받고 값은 코드가 구성안 틀로 덮음(주 + 보조·가운뎃점 변형·빈 글에도 파싱·검증 통과), 안 주면 모든 틀 중 하나", { skip: NO_SEED_CARDS }, async () => {
  const { sectionOutputSchema, withPlanStory } = await import("./section.ts");
  const locked = sectionOutputSchema(undefined, "한계 극복·다자협업형");
  const any = sectionOutputSchema();
  const shape = (story: string) => ({ title: "제목", story, blocks: [], results: [], resultCards: [], caption: "" });
  // 2026-10-12 실례: AI가 주 + 보조로 붙이거나 가운뎃점 문자(· U+00B7 / ･ U+FF65 / ㆍ)를 다르게 적어 구조화 출력 파싱이 통째로 실패했음
  const odd = ["한계 극복·다자협업형", "한계 극복·다자협업형 + 연혁·연도 사다리형", "한계 극복･다자협업형", "한계 극복ㆍ다자협업형", "원스톱 통합형", ""];
  const ctx = sectionContext(card, group("주요사업1"));
  const plan = { story: "한계 극복·다자협업형" as const };
  for (const story of odd) {
    const parsed = locked.safeParse(shape(story));
    assert.equal(parsed.success, true, `파싱: ${story}`);
    // 집필(첫 초안)과 판면 맞추기(고치기) 모두 callReportSection이 withPlanStory를 거침 — 검증 결과 spec.story는 구성안 틀
    const o = withPlanStory(out({ story: story as any }), plan);
    assert.equal(o.story, "한계 극복·다자협업형", `덮어씀: ${story}`);
    assert.equal(verifySection(o, card, ctx).spec.story, "한계 극복·다자협업형", `spec.story: ${story}`);
  }
  // 구성안 없이(바로 만들기) 쓰면 AI가 고른 틀 그대로, 모르는 틀은 빈 글
  assert.equal(withPlanStory(out({ story: "현장 목소리형" })).story, "현장 목소리형");
  assert.equal(verifySection(out({ story: "한계 극복･다자협업형" as any }), card, ctx).spec.story, "");
  assert.equal(any.safeParse(shape("원스톱 통합형")).success, true);
  assert.equal(any.safeParse(shape("가짜 틀")).success, false, "구성안이 없을 때는 12종(+섞음) 중 하나");
});

test("보고서 추가자료의 관계: 카드 전용·이 과제에 연결(확정)은 숫자 근거, 연결하지 않은 같은 보고서 자료는 인용 대조에만 — 프롬프트에 관계가 적힘", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const files = [
    { name: "카드 전용.hwp", text: "카드전용수치 111건", relation: "card" as const, numberEvidence: true },
    { name: "연결한 자료.pdf", text: "연결자료수치 222건", relation: "matched" as const, numberEvidence: true },
    { name: "다른 과제 사진.pdf", text: "다른과제수치 333건", relation: "same-report" as const, numberEvidence: false },
  ];
  const p = sectionPrompt(P, card, ctx, 2026, files);
  assert.match(p, /\[첨부 1\] 카드 전용\.hwp — 이 과제 카드 전용 자료/);
  assert.match(p, /\[첨부 2\] 연결한 자료\.pdf — 이 과제에 연결해 확정한 보고서 추가자료/);
  assert.match(p, /\[첨부 3\] 다른 과제 사진\.pdf — 같은 보고서의 다른 자료 — 이 과제에 연결하지 않았습니다/);
  const actuals = { kpi: [], monthly: [] } as unknown as Parameters<typeof draftEvidence>[3];
  const ev = draftEvidence(files, [], [], actuals);
  assert.ok(ev.known.includes("카드전용수치") && ev.known.includes("연결자료수치"), "숫자 근거로 인정");
  assert.ok(!ev.known.includes("다른과제수치"), "연결하지 않은 자료의 수치는 숫자 근거가 아님");
  assert.ok(ev.quoteOnly.includes("다른과제수치"), "그래도 인용 대조에는 씀");
  // 관계를 안 적은 옛 호출·시험은 그대로 숫자 근거
  assert.ok(draftEvidence([{ name: "옛", text: "옛수치 1" }], [], [], actuals).known.includes("옛수치"));
});

test("resultExtras: 실적 막대가 2개 미만(’25 실적 + ’26 목표)이면 버리고 경고, ’24·’25 실적 + 목표는 실적 2개라 남음", () => {
  const k = new Set(["87.8", "90", "80"]);
  const r = resultExtras({ resultChart: { title: "", series: [{ label: "’25년", value: "87.8점" }, { label: "’26년 목표", value: "90점" }], badge: "" } }, false, (t) => k.has(t), "");
  assert.equal(r.chart, null);
  assert.ok(r.warnings.some((w) => w.includes("실적 값이 2개 미만")));
  const ok = resultExtras({ resultChart: { title: "", series: [{ label: "’24년", value: "80점" }, { label: "’25년", value: "87.8점" }, { label: "’26년 목표", value: "90점" }], badge: "" } }, false, (t) => k.has(t), "");
  assert.equal(ok.chart?.series.length, 3);
});

test("resultExtras(2026-10-15): 추진성과 막대도 【확인】 값은 실적으로 안 셈 — ’25 실적 + ’26 목표 + ’26 【확인】은 실적 1개라 버림", () => {
  const k = new Set(["4.16", "4.37"]);
  const r = resultExtras({ resultChart: { title: "", series: [{ label: "’25년 실적", value: "4.16점" }, { label: "’26년 목표", value: "4.37점" }, { label: "’26년 실적", value: "【확인: ’26년 만족도】" }], badge: "" } }, false, (t) => k.has(t), "");
  assert.equal(r.chart, null);
  assert.ok(r.warnings.some((w) => w.includes("실적 값이 2개 미만")));
});

test("verifySection: 실적 하나 + 목표 하나 막대 블록은 빠지고 경고, 실적 둘 + 목표는 남음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const bar = (series: Array<{ label: string; value: string }>) => blk({ kind: "chart", label: "추진실적", title: "만족도", series });
  const v1 = verifySection(out({ blocks: [bar([{ label: "’25년", value: "87.8점" }, { label: "’26년 목표", value: "90점" }])] }), card, ctx);
  assert.ok(!v1.spec.blocks?.some((b) => b.kind === "chart"));
  assert.ok(v1.warnings.includes("막대: 실적 값이 2개 미만(목표·계획 값만 더한 막대)이라 뺐습니다 — 실적 값이 쌓이면 다시 쓸 수 있습니다"));
  const v2 = verifySection(out({ blocks: [bar([{ label: "’24년", value: "80점" }, { label: "’25년", value: "87.8점" }, { label: "’26년 목표", value: "90점" }])] }), card, ctx);
  assert.ok(v2.spec.blocks?.some((b) => b.kind === "chart"));
});

test("resultRepeatIssue: 같은 수치 2개 이상이면 문제, 1개·연도·자리표시 안 숫자는 안 셈", () => {
  assert.match(resultRepeatIssue("720건 처리, 6.9% 개선", "월 720건 판독 / 오차 6.9% 감소") ?? "", /^추진성과: 블록에 쓴 수치를 되풀이\(720·6\.9%?\)/);
  assert.equal(resultRepeatIssue("720건 처리, 5.1% 개선", "월 720건 판독 / 오차 6.9% 감소"), null);
  assert.equal(resultRepeatIssue("2026년 ’25년 ’26 계획", "2026년 ’25년 ’26 계획"), null);
  assert.equal(resultRepeatIssue("【확인: 720건】 【확인: 6.9%】", "720건 6.9%"), null);
});

test("verifySection: 추진성과가 블록 수치 2개를 되풀이하면 경고에는 있고 짜임 문제(composeIssues)에는 없음, 1개면 경고도 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const base = [blk({ kind: "bullets", label: "추진내용", items: ["월 720건 판독, 오차 6.9% 감소"] })];
  const v = verifySection(out({ blocks: base, results: ["720건 판독, 오차 6.9% 감소"] }), card, ctx);
  assert.ok(!v.composeIssues.some((x) => x.startsWith("추진성과:")));
  assert.ok(v.warnings.some((x) => x.startsWith("추진성과: 블록에 쓴 수치를 되풀이")));
  const one = verifySection(out({ blocks: base, results: ["720건 판독 달성"] }), card, ctx);
  assert.ok(!one.warnings.some((x) => x.startsWith("추진성과:")));
});

test("빈 상자(2026-10-15 후속 5): 고치기 요청(fitPrompt)에 판면을 맞출 때도(need)·판면이 맞을 때도(null) 빈 칸 목록, 없으면 안 붙음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const report: FitReport = { budget: 255, total: 255, rows: [{ label: "A", kinds: "cards", mm: 100 }], wrapped: [], ragged: [], sparse: [], bullets: 10, hollow: [{ where: "추진내용 3번째 칸", used: 0.9, most: 3, perLine: 14, add: 25 }] };
  const item = "  - [추진내용 3번째 칸] 0.9줄 / 형제 칸 3줄 — 카드·첨부의 올해 사실로 약 25자 보강(이 칸 한 줄 14자), 올해 사실로 더 쓸 것이 없으면 긴 칸을 줄여 맞춤";
  for (const need of ["under", null] as const) {
    const p = fitPrompt(P, ctx, out(), { ...report, total: need ? 200 : 255 }, need, need ? [] : ["올해 실적 문제"]);
    assert.ok(p.includes("- 나란한 칸 줄 수("), need ?? "null");
    assert.ok(p.includes(item), need ?? "null");
  }
  assert.ok(!fitPrompt(P, ctx, out(), { ...report, hollow: [] }, null, ["올해 실적 문제"]).includes("나란한 칸 줄 수"));
});

test("빈 상자: 검증(verifySection)·다시 점검(recheckSection)이 「칸 채우기:」 경고를 내고, 짜임·올해 실적·문장 문제(자동 고치기 사유)에는 넣지 않음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const long = "현장 점검 결과를 담당 부서가 함께 확인하여 개선 과제를 정리";
  const o = out({ blocks: [...out().blocks, blk({ kind: "cards", label: "추진성과", variant: "plain", cells: [cell("가", [long, long, long]), cell("나", [long, long, long]), cell("다", ["짧은 글"])] })] });
  const v = verifySection(o, card, ctx);
  const w = v.warnings.find((x) => x.startsWith("칸 채우기: "));
  assert.ok(w?.includes("[추진성과 3번째 칸]"), v.warnings.join("\n"));
  for (const k of ["composeIssues", "yearIssues", "proseIssues"] as const) assert.ok(!v[k].some((x) => x.includes("칸 채우기")), k);
  assert.ok(recheckSection(v.spec, card).warnings.some((x) => x.startsWith("칸 채우기: ")));
});

// 핵심 수치 띠(주요사업): 2026-10-15 후속 6은 올해 실적 칸 2개 미만만 뺐고, 2026-10-28부터 새 초안은 띠를 모두 뺌(수치는 단계 결과 줄·추진성과로) — 도식 후보도 없음
test("verifySection: 주요사업 새 초안의 수치 띠는 올해 실적 칸이 있어도 빼고 경고, 판면·올해 실적 점검은 뺀 뒤 블록으로(year 유무와 상관없음)", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const bad = blk({ kind: "stats", cells: [cell("30,706건", ["대체 건수"], "", "’25년"), cell("45,000건", ["대체 건수"], "", "’26년 목표"), cell("【확인: ’26년 대체 건수】", ["대체 건수"])] });
  const good = blk({ kind: "stats", cells: [cell("720건", ["판독 건수"], "", "’26.9.21 기준"), cell("50건", ["신규 국소"], "", "’26.9")] });
  for (const stats of [bad, good]) {
    const v = verifySection(out({ blocks: [...out().blocks, stats] }), card, ctx, "", [], "", 2026);
    assert.ok(!v.spec.blocks!.some((b) => b.kind === "stats"), "수치 띠를 뺌");
    assert.ok(v.warnings.some((w) => w.startsWith("수치 띠: 주요사업 초안은 따로 떨어진 수치 띠를 쓰지 않아 뺐습니다")), v.warnings.join(" / "));
    assert.ok(!v.yearIssues.some((x) => x.includes("핵심 수치 띠")), "뺀 띠는 올해 실적 점검(자동 고치기 사유)에 안 남음");
    assert.equal(v.spec.fit!.total, verifySection(out(), card, ctx, "", [], "", 2026).spec.fit!.total, "판면 어림은 뺀 뒤 블록 기준");
  }
  assert.ok(!verifySection(out({ blocks: [...out().blocks, good] }), card, ctx).spec.blocks!.some((b) => b.kind === "stats"), "year가 없어도 뺌");
});

test("recheckSection(year): 사람이 고친 주요사업 수치 띠에 올해 실적 칸이 모자라면 자리표시가 아니라 「수치 띠를 빼고 다른 도식으로」라고 알림", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, group("주요사업1"));
  const v = verifySection(out(), card, ctx, "", [], "", 2026);
  const edited = { ...v.spec, blocks: [...v.spec.blocks!, { kind: "stats" as const, label: "", title: "", variant: "", text: "", items: [], cells: [cell("93.9%", ["정확도"], "", "’26.7 시범"), cell("【확인: ’26년 누적 건수】", ["누적"])], rows: [], series: [], badge: "" }] };
  const w = recheckSection(edited, card, "", 2026).warnings.filter((x) => x.includes("핵심 수치 띠"));
  assert.ok(w.some((x) => /올해\(’26년\) 실적 칸이 1개뿐.*수치 띠를 빼고 다른 도식으로 바꿉니다/.test(x)), w.join(" / "));
  assert.ok(!w.some((x) => x.includes("자리표시로 바꿉니다")));
});

test("sectionHints: 주요사업은 핵심 수치 띠(stats) 후보를 내지 않음 — 올해 실적 재료 수치가 2개 이상이어도(2026-10-28)", () => {
  const bare = { id: "x", taskNo: "1-1", title: "판독 1,240건 처리, 24종 분류, 63종 확인, 97% 신뢰도" };
  const two: YearActuals = { today: "", kpi: [{ name: "판독 정확도", unit: "%", prev: "90%", target: "95%", expected: "", input: "93.9" }], monthly: [{ period: "1월~8월", line: "∙ AI 판독 1,416건 수행(목표 2,000건)" }] };
  assert.ok(!sectionHints(bare, [], [], [], two, 2026).some((h) => h.kind === "stats"));
});
