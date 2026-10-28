// section-html.ts 직접 시험(바이트 동일 시험은 section.test.ts·split-axes.test.ts가 봄 — 여기는 겹치지 않는 분기):
// 옛 v1·v2 모양(사다리·인용 상자·메시지 띠·우수사례·3칸 성과)·막대(miniChartHtml)·markRoots·머리 생략·경영관리 평가내용/대주제 이어쓰기와 지적개선 표지·내려받기 문서.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import type { MgPart } from "./mg-types.ts";
import type { Diagram, LadderRow, ReportSectionSpec } from "./section.ts";
import { blockHtml, blocksSampleHtml, markRoots, miniChartHtml, sectionBodyHtml, sectionDocument, sectionHtml } from "./section-html.ts";

const B = (kind: Block["kind"], label: string, over: Partial<Block> = {}): Block => ({ kind, label, title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...over });
const none: Diagram = { type: "none", title: "", rows: [], steps: [], actions: [] };
const row = (label: LadderRow["label"], bullets: string[], over: Partial<LadderRow> = {}): LadderRow => ({ label, bullets, diagram: none, ...over });
const base = (over: Partial<ReportSectionSpec> = {}): ReportSectionSpec => ({ version: 1, card: { id: "주요사업1/1-가", taskNo: "1-가", title: "과제 <제목>" }, business: { no: 1, name: "전파&진흥" }, task: { no: "1-1", title: "실행과제", bp: false }, sub: { mark: "가", title: "소항목", markers: [] }, rows: [], results: [], caption: "", module: 1, ...over });

test("markRoots: 맨 위 요소마다 속성을 더하고, 짝 없는 태그·스스로 닫는 태그는 깊이를 바꾸지 않음", () => {
  assert.equal(markRoots("<p>a</p><div><p>b</p></div>", 'data-x="1"'), '<p data-x="1">a</p><div data-x="1"><p>b</p></div>');
  assert.equal(markRoots("<br><p>a</p>", "d"), "<br d><p d>a</p>");
  assert.equal(markRoots('<svg><path d="M0"/></svg><p>x</p>', "d"), '<svg d><path d="M0"/></svg><p d>x</p>');
  assert.equal(markRoots("", "d"), "");
  assert.equal(markRoots("글만", "d"), "글만");
  // 짝이 안 맞는 닫는 태그가 깊이를 음수로 만들지 않음
  assert.equal(markRoots("</p><p>a</p>", "d"), "</p><p d>a</p>");
});

test("miniChartHtml: 마지막 막대만 진하게, 자리표시 값은 점선 빈 막대+확인, 한글 단위 값은 앞 숫자로 높이, 배지·제목", () => {
  const html = miniChartHtml({ title: "제목 <A>", series: [{ label: "’24", value: "10" }, { label: "’25", value: "20" }], badge: "+100%" });
  assert.match(html, /<figcaption>제목 &lt;A&gt;<span class="k-chart__badge" aria-hidden="true">\+100%<\/span><\/figcaption>/);
  assert.equal(html.match(/fill="#d7d8d7"/g)?.length, 1);
  assert.equal(html.match(/fill="#7e7f7e"/g)?.length, 1);
  assert.match(html, /aria-label="제목 &lt;A&gt;: ’24 10, ’25 20 \(\+100%\)"/);
  const hole = miniChartHtml({ title: "", series: [{ label: "’24", value: "5" }, { label: "’25", value: "【확인: 올해 값】" }], badge: "" });
  assert.match(hole, /stroke-dasharray="2 1\.5"/);
  assert.match(hole, />확인</);
  assert.ok(!hole.includes("<figcaption>"), "제목·배지 없으면 캡션 없음");
  // 3천만원처럼 단위가 붙은 값, 값이 모두 0이어도 최소 높이로 그려짐
  const unit = miniChartHtml({ title: "", series: [{ label: "a", value: "3천만원" }, { label: "b", value: "없음" }], badge: "" });
  assert.equal(unit.match(/<rect/g)?.length, 2);
  assert.match(unit, />3천만원</);
});

test("v1 모양: 대상사업·실행과제·소항목 머리, 사다리 행(막대가 있으면 두 칸), 추진성과 불릿, 모든 글 이스케이프", () => {
  const spec = base({ rows: [row("추진배경", ["배경 <b>"]), row("추진실적", ["실적"], { chart: { title: "", series: [{ label: "a", value: "1" }], badge: "" } })], results: ["성과 & 결과"], caption: "표 이름" });
  const html = sectionBodyHtml(spec);
  assert.match(html, /<p class="k-biz"><span class="k-biz__no">대상사업1<\/span><span>전파&amp;진흥<\/span><\/p>/);
  assert.match(html, /<span class="k-task__no">1-1<\/span><span class="k-task__t">실행과제<\/span>/);
  assert.match(html, /<h5 class="k-sub">가\. 소항목<\/h5>/);
  assert.match(html, /<caption class="sr">표 이름<\/caption>/);
  assert.match(html, /<th scope="row">추진배경<\/th>/);
  assert.ok(html.includes("배경 &lt;b&gt;") && !html.includes("<b>"));
  assert.match(html, /<div class="k-row2"><div>[\s\S]*<\/div><figure class="k-chart">/);
  assert.ok(html.includes("성과 &amp; 결과"));
  // 사다리 캡션 기본값
  assert.match(sectionBodyHtml(base({ rows: [row("추진배경", ["a"])] })), /<caption class="sr">소항목 추진 내용<\/caption>/);
});

test("v1 모양: BP·지적개선 마커, 도식 5종(전후 비교·단계·시기·카드·행동표)이 행 안에 그려지고 카드는 현황·배경에서 ✚로 잇고 4장까지", () => {
  const dg = (over: Partial<Diagram>): Diagram => ({ ...none, ...over });
  const steps = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `단계${i + 1}`, bullets: [`항목${i + 1}`], note: i === 0 ? "비고" : "" }));
  const spec = base({
    task: { no: "1-1", title: "실행과제", bp: true },
    sub: { mark: "가", title: "소항목", markers: ["지적개선", "신규"] },
    rows: [
      row("현황 및 문제점", [], { diagram: dg({ type: "card_grid", steps: steps(5) }) }),
      row("추진방향", [], { diagram: dg({ type: "card_grid", steps: steps(2) }) }),
      row("추진내용", ["a"], { diagram: dg({ type: "before_after", title: "전후", rows: [{ key: "구분1", before: ["전"], after: ["후"] }, { key: "구분2", before: ["전2"], after: ["후2"] }] }) }),
      row("추진노력", [], { diagram: dg({ type: "process_flow", steps: steps(3) }) }),
      row("추진실적", [], { diagram: dg({ type: "timeline", steps: steps(2) }) }),
      row("추진배경", [], { diagram: dg({ type: "action_table", actions: [{ effort: "노력", result: "성과" }] }) }),
    ],
  });
  const html = sectionBodyHtml(spec);
  assert.match(html, /mk--bp/);
  assert.match(html, /mk--dark">지적개선/);
  assert.match(html, /mk--new">신규/);
  assert.equal(html.match(/class="k-card"/g)?.length, 4 + 2, "카드 격자는 4장까지");
  assert.equal(html.match(/k-join/g)?.length, 3 + 0, "현황 행만 ✚(3개)");
  assert.equal(html.match(/<td class="k-ba__arrow" rowspan="2">/g)?.length, 1);
  assert.match(html, /class="k-proc" style="grid-template-columns:repeat\(3,1fr\)"/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /\(당해연도\)/);
  assert.match(html, /<td>노력<\/td><td>성과<\/td>/);
});

test("v2 모양: 인용 상자(하나면 --one·출처 괄호 정리), 메시지 띠는 추진배경 다음, 우수사례, 3칸 추진성과", () => {
  const spec = base({
    version: 2,
    context: [{ chip: "정부", title: "정책 <A>", quote: "인용문", cite: "(출처 2025)" }],
    banner: "메시지 띠",
    rows: [row("추진배경", ["배경"]), row("추진내용", ["내용"])],
    cases: [{ tab: "", title: "사례", items: ["사례 내용"] }],
    resultCards: [{ tag: "정량", headline: "머리", figure: "10%" }, { tag: "", headline: "머리2", figure: "20%" }],
    results: ["성과"],
  });
  const html = sectionBodyHtml(spec);
  assert.match(html, /class="k-ctx k-ctx--one"/);
  assert.match(html, /<span class="k-tag">정부<\/span>정책 &lt;A&gt;/);
  assert.match(html, /<li>“인용문”<span class="k-small">\(출처 2025\)<\/span><\/li>/);
  assert.ok(html.indexOf("추진배경") < html.indexOf("k-banner") && html.indexOf("k-banner") < html.indexOf("추진내용"));
  assert.match(html, /k-case__tab">우수사례</, "탭 이름이 비면 우수사례");
  assert.match(html, /repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /\[정량\] 머리/);
  assert.match(html, /k-result__body k-result__body--cards/);
  // 두 상자면 연결선으로 잇고 --one 아님, 추진배경 행이 없으면 띠가 맨 앞
  const two = sectionBodyHtml({ ...spec, context: [spec.context![0], { chip: "", title: "둘째", quote: "q", cite: "" }], rows: [row("추진내용", ["내용"])] });
  assert.ok(!two.includes("k-ctx--one") && two.includes("k-ctx__link"));
  assert.ok(two.indexOf("k-banner") < two.indexOf("k-ladder") + 400);
});

test("v1/v2: 빈 spec은 머리만 그리고 사다리·성과·인용은 만들지 않음", () => {
  const html = sectionBodyHtml(base());
  assert.ok(!html.includes("k-ladder") && !html.includes("k-result") && !html.includes("k-ctx"));
  assert.ok(html.includes("k-biz") && html.includes("k-task") && html.includes("k-sub"));
});

test("머리 생략: task는 대상사업 상자만 빼고, sub는 대상사업·실행과제 띠를 모두 뺌, 대상사업 머리 지도는 all일 때만", () => {
  const spec = base({ rows: [row("추진배경", ["a"])] });
  const task = sectionBodyHtml(spec, [], { head: "task" });
  assert.ok(!task.includes("k-biz") && task.includes("k-task"));
  const sub = sectionBodyHtml(spec, [], { head: "sub" });
  assert.ok(!sub.includes("k-biz") && !sub.includes("k-task") && sub.includes("k-sub"));
  assert.match(sectionBodyHtml(spec, [], { bizMap: "<div class='map'></div>" }), /<\/p>\n<div class='map'><\/div>/);
  assert.ok(!sectionBodyHtml(spec, [], { head: "task", bizMap: "<div class='map'></div>" }).includes("class='map'"));
});

test("v3 블록 목록: 블록 순번 표지(blockMarks)·고치기 표지(editMarks)는 v3일 때만, 추진성과 표지는 resultMark일 때만", () => {
  const spec = base({ version: 3, blocks: [B("bullets", "추진내용", { items: ["한 줄"] })], results: ["성과"] });
  const plain = sectionHtml(spec);
  assert.ok(!plain.includes("data-block") && !plain.includes("data-t=") && !plain.includes("data-result"));
  const marked = sectionHtml(spec, [], { blockMarks: true, editMarks: true, resultMark: true });
  assert.match(marked, /data-block="0"/);
  assert.match(marked, /data-t="/);
  assert.match(marked, /data-result/);
  // v1 spec에 editMarks를 줘도 표지 없음(출력 동일)
  const v1 = base({ rows: [row("추진배경", ["a"])] });
  assert.equal(sectionHtml(v1, [], { editMarks: true }), sectionHtml(v1));
  // 부르고 나면 고치기 상태가 남지 않음
  assert.equal(sectionHtml(spec), plain);
});

const part = (evalNo: number, themeNo: number, mark: string, over: Partial<MgPart> = {}): MgPart => ({ key: `${evalNo}.${themeNo}.${mark || "0"}`, evalNo, evalTitle: `평가${evalNo}`, themeNo, themeTitle: `대주제${themeNo}`, mark, title: mark ? `절${mark}` : "", story: "", why: "", ...over });
const mgSpec = (parts: MgPart[], over: Partial<ReportSectionSpec> = {}, mgOver: Partial<NonNullable<ReportSectionSpec["mg"]>> = {}): ReportSectionSpec =>
  base({ version: 3, task: { no: "9-1", title: "과제", bp: false }, sub: { mark: "", title: "과제", markers: [] }, blocks: parts.map((p) => B("bullets", "추진내용", { items: [`내용${p.key}`] })), results: [], mg: { indicator: "지표", parts, at: parts.map((p) => p.key), ...mgOver }, ...over });

test("경영관리: 평가내용 상자 → 대주제 띠 → 절 제목 순으로, 바뀔 때만 다시 그리고 표지 없는 절은 절 제목 없이 본문", () => {
  const html = sectionBodyHtml(mgSpec([part(1, 1, "가"), part(1, 1, "나"), part(1, 2, ""), part(2, 1, "가")]));
  assert.equal(html.match(/class="k-biz__no">평가내용/g)?.length, 2);
  assert.equal(html.match(/<h4 class="k-task">/g)?.length, 3);
  assert.equal(html.match(/<h5 class="k-sub">/g)?.length, 3, "표지 없는 절은 절 제목 없음");
  assert.ok(html.includes("내용1.2.0"));
});

test("경영관리: 마커(BP·지적개선·신규)는 첫 대주제 띠에, 지적개선은 finding 절의 대주제 띠로 옮겨 한 번만", () => {
  const parts = [part(1, 1, "가"), part(1, 2, "가"), part(1, 2, "나")];
  const spec = mgSpec(parts, { task: { no: "9-1", title: "과제", bp: true }, sub: { mark: "", title: "과제", markers: ["지적개선", "신규"] } });
  const first = sectionBodyHtml(spec);
  const themes = first.split(/(?=<h4 class="k-task">)/).slice(1);
  assert.ok(themes[0].includes("mk--bp") && themes[0].includes("지적개선") && themes[0].includes("신규"), "필드가 없으면 첫 띠에 모두");
  assert.ok(!themes[1].includes("mk--"));
  const moved = sectionBodyHtml({ ...spec, mg: { ...spec.mg!, finding: ["1.2.나"] } });
  const mt = moved.split(/(?=<h4 class="k-task">)/).slice(1);
  assert.ok(mt[0].includes("mk--bp") && mt[0].includes("신규") && !mt[0].includes("지적개선"));
  assert.equal((moved.match(/지적개선/g) ?? []).length, 1);
  assert.ok(mt[1].includes("지적개선"), "finding 절의 대주제 띠에");
  // 지적개선 마커가 없으면 finding이 있어도 표지 없음
  assert.ok(!sectionBodyHtml(mgSpec(parts, {}, { finding: ["1.2.나"] })).includes("지적개선"));
});

test("경영관리 이어쓰기(mgCont): 앞 과제와 같은 평가내용이면 상자를, 같은 대주제면 띠도 안 그리고 마커는 다음 띠·절 제목에", () => {
  const parts = [part(1, 1, "가"), part(1, 1, "나"), part(1, 2, "가")];
  const spec = mgSpec(parts, { sub: { mark: "", title: "과제", markers: ["신규"] } });
  const evalOnly = sectionBodyHtml(spec, [], { mgCont: { eval: true, theme: false } });
  assert.ok(!evalOnly.includes("평가내용1") && evalOnly.includes("대주제1") && evalOnly.includes("대주제2"));
  const both = sectionBodyHtml(spec, [], { mgCont: { eval: true, theme: true } });
  assert.ok(!both.includes("평가내용1") && !both.includes("대주제1"));
  assert.ok(both.includes("대주제2"));
  const mark = both.match(/mk--new/g)?.length;
  assert.equal(mark, 1, "마커는 한 번");
  assert.ok(both.indexOf("mk--new") < both.indexOf("대주제2"), "첫 절 제목에 붙음");
});

test("경영관리: 절에 블록이 없거나 at이 어긋나도 깨지지 않음", () => {
  const spec = mgSpec([part(1, 1, "가"), part(1, 1, "나")]);
  const html = sectionBodyHtml({ ...spec, mg: { ...spec.mg!, at: ["1.1.가", "없는 절"] } });
  assert.ok(html.includes("절가") && html.includes("절나"));
  assert.ok(html.includes("내용1.1.가") && !html.includes("내용1.1.나"));
});

test("blockHtml·blocksSampleHtml: 블록 하나와 견본 문서(제목·성과 없이 블록만)", () => {
  const b = B("bullets", "추진내용", { items: ["견본 글"] });
  const marks = (unknown: string[], weak: string[] = []) => Object.assign(new Set(unknown), { weak: new Set(weak) });
  assert.ok(blockHtml(b, marks([])).includes("견본 글"));
  assert.ok(blockHtml(b, marks([], ["견본 글"])).includes("k-weak"), "근거 약한 문장은 옅은 점선");
  assert.ok(!blockHtml(b, marks([])).includes("k-weak"));
  assert.ok(blockHtml(B("bullets", "x", { items: ["수치 12.5% 기록"] }), marks(["12.5%"])).includes("k-unv"), "모르는 숫자는 붉은 점선");
  const sample = blocksSampleHtml([b]);
  assert.match(sample, /^<div class="kca-dg-doc"><div class="k-paper"><div class="k-frame">/);
  assert.ok(sample.includes("견본 글") && !sample.includes("k-sub") && !sample.includes("k-result"));
  assert.ok(blocksSampleHtml([]).endsWith("</div></div></div>"));
});

test("sectionDocument: 제목·머리말(주요사업/경영관리 구분·모델·시각·없는 숫자 안내)이 이스케이프되고 외부 링크 없는 한 파일", () => {
  const biz = sectionDocument(base({ rows: [row("추진배경", ["a"])] }), ["12.5"], { year: 2026, generatedAt: "2026-10-17", model: "claude <x>" });
  assert.match(biz, /^<!doctype html>/);
  assert.match(biz, /<title>2026년도 경영실적보고서 초안 — 1-가 과제 &lt;제목&gt;<\/title>/);
  assert.match(biz, /\(주요사업\) 평가내용2 소항목 초안 · 과제관리카드 1-가 · AI 초안\(claude &lt;x&gt;\) · 2026-10-17 · 붉은 점선/);
  assert.ok(!/<link |src="http/.test(biz));
  const mg = sectionDocument(mgSpec([part(1, 1, "가")]));
  assert.match(mg, /\(경영관리\) 지표 초안 · 과제관리카드 1-가 · 초안<\/p>/);
  assert.ok(!mg.includes("붉은 점선"));
});

test("괄호 + 조사 묶음(2026-10-28): 「(…)」 바로 뒤 조사 1~2자는 .k-nb 한 덩어리 — 괄호 안 빈칸·긴 괄호·조사가 아닌 긴 말·괄호만은 그대로", () => {
  const html = blockHtml(B("bullets", "", { items: ["통합(’26.9.)에 맞춰 운영", "체계(AI)로, 정비", "기준(사후 검증)에 맞춤", "방안(가나다라마바사아자차카타파)에 따라", "통합(’26.9.)부터는 확대", "통합(’26.9.) 완료"] }), new Set());
  assert.match(html, /통합<span class="k-nb">\(’26\.9\.\)에<\/span> 맞춰/);
  assert.match(html, /체계<span class="k-nb">\(AI\)로<\/span>, 정비/);
  assert.equal(html.match(/k-nb/g)?.length, 2, "빈칸 든 괄호·12자 넘는 괄호·조사 셋 이상·괄호만은 묶지 않음");
  // 화면 글(태그를 걷은 글)은 그대로
  assert.ok(html.replace(/<[^>]+>/g, "").includes("통합(’26.9.)에 맞춰 운영"));
});
