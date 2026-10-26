// 경영관리 경평 초안 구성안(lib/reports/mg-outline.ts) 시험 — 전년 골격 읽기·추천 평가내용·AI 답 정리·절 점검·사람 편집(2026-10-09 R3).

import assert from "node:assert/strict";
import { test } from "node:test";
import { editOf } from "./composition.ts";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MgOutlineOut, type MgOutlineOutput, type MgPriorSection, applyMgCompositionEdit, cleanMgComposition, defaultEvals, isMgMainStory, isMgStory, mgCloseRule, mgClosePrompt, mgCompositionIssues, mgDiagramPrompt, mgFindingOpenIssue, mgOverlapIssues, mgPartPrompt, mgPartRedo, mgSiblingOf, mgSiblingsPrompt, replaceMgPart, skeletonLines, toMgPriorSection, unclosedPartKeys } from "./mg-outline.ts";
import { reportDraftPromptsMg, reportOutlinePromptsMg } from "../prompts/sets.ts";
import { patternOf } from "./framework-patterns.ts";
import { sourceKey } from "./section.ts";
import { mgPlanPrompt } from "./mg-draft.ts";
import { warningLevel } from "./warning-levels.ts";

const sec = (evalNo: number, themeNo: number, mark: string, title: string, text = "본문"): MgPriorSection => ({ key: `rpt25-mg-09/MG-9/${evalNo}/${themeNo}/${mark || "body"}`, evalNo, evalTitle: `평가내용 ${evalNo} 제목`, themeNo, themeTitle: `대주제 ${evalNo}-${themeNo}`, mark, title, markers: [], text, page: null });
const PRIOR = [sec(1, 1, "", ""), sec(1, 2, "가", "가 절"), sec(1, 2, "나", "나 절"), sec(3, 1, "가", "셋째 가"), sec(4, 1, "가", "넷째 가"), sec(5, 1, "가", "다섯째 가")];

test("전년 골격: 세부평가내용별 장의 절·절 없는 대주제 본문만 읽고(그 밖 장·번호 없는 조각은 null), 평가내용 → 대주제 → 절 줄로", () => {
  const detail = toMgPriorSection({ chunk_key: "k1", text: "글", meta: { chapter: "detail", eval_no: 1, eval_title: "가치", theme_no: 2, theme_title: "대주제", mark: "가", title: "절 제목", theme_markers: ["BP"], markers: ["신규"] }, report_page_2025: 12 });
  assert.deepEqual(detail, { key: "k1", evalNo: 1, evalTitle: "가치", themeNo: 2, themeTitle: "대주제", mark: "가", title: "절 제목", markers: ["BP", "신규"], text: "글", page: 12 });
  assert.equal(toMgPriorSection({ chunk_key: "k2", meta: { chapter: "detail_theme", eval_no: 1, theme_no: 1, theme_title: "전략" } })?.mark, "", "대주제 본문은 표지 없음");
  assert.equal(toMgPriorSection({ chunk_key: "k3", meta: { chapter: "outcome", theme_no: 1 } }), null, "성과분석 장은 골격 아님");
  assert.equal(toMgPriorSection({ chunk_key: "k4", meta: { chapter: "detail", eval_no: null, theme_no: 1 } }), null);
  assert.deepEqual(skeletonLines([PRIOR[2], PRIOR[0], PRIOR[1]]), ["평가내용 1. 평가내용 1 제목", "  대주제 1. 대주제 1-1 — 절 없이 대주제 본문", "  대주제 2. 대주제 1-2", "    가. 가 절", "    나. 나 절"]);
});

test("추천 평가내용: 분석 §5 첫 대응(9-3 → 3·4) 중 전년 골격에 있는 번호만, 대응이 없거나 골격에 없으면 그 지표의 평가내용 모두", () => {
  assert.deepEqual(defaultEvals("9-3", PRIOR), [3, 4]);
  assert.deepEqual(defaultEvals("9-1", PRIOR), [1]);
  assert.deepEqual(defaultEvals("12-1", PRIOR), [1, 3, 4, 5], "가점은 대응 없음 → 모두");
  assert.deepEqual(defaultEvals("9-2", PRIOR), [1, 3, 4, 5], "평가내용 2가 골격에 없으면 모두");
  assert.deepEqual(defaultEvals("1-1", []), []);
});

const out = (): MgOutlineOutput => ({
  message: "핵심",
  points: ["논점 1", "논점 2"],
  parts: [
    { evalNo: 1, themeNo: 2, themeTitle: "", mark: "나.", title: "둘째 절", story: "기존·개선형", why: "이어짐" },
    { evalNo: 1, themeNo: 2, themeTitle: "", mark: "가", title: "첫 절", story: "배경·내용·성과형", why: "" },
    { evalNo: 0, themeNo: 1, themeTitle: "", mark: "", title: "", story: "구분표 중심형", why: "" },
    { evalNo: 1, themeNo: 3, themeTitle: "새 대주제", mark: "가", title: "블록 없는 절", story: "구분표 중심형", why: "" },
  ],
  materials: [
    { id: "m1", kind: "fact", text: "사실", when: "", source: "카드", quote: "원문 구절 하나 둘 셋" },
    { id: "m2", kind: "need", text: "올해 실적", when: "", source: "", quote: "" },
  ],
  blocks: [
    { part: 1, kind: "bullets", variant: "", label: "추진배경", purpose: "왜", cells: 2, materials: ["m1", "m9"], figures: [], alts: [] },
    { part: 1, kind: "stats", variant: "", label: "추진성과", purpose: "결과", cells: 3, materials: ["m2"], figures: [], alts: [] },
    { part: 2, kind: "cards", variant: "plain", label: "추진내용", purpose: "무엇", cells: 3, materials: ["m1"], figures: [], alts: [] },
    { part: 3, kind: "bullets", variant: "", label: "x", purpose: "버림", cells: 1, materials: [], figures: [], alts: [] },
    { part: 9, kind: "bullets", variant: "", label: "x", purpose: "버림", cells: 1, materials: [], figures: [], alts: [] },
  ],
});

test("AI 답 정리: 절은 번호·표지를 정리해 평가내용 → 대주제 → 절 순, 대주제 이름은 전년 골격, 블록은 가리킨 절로 놓여 절 순서대로, 갈 곳 없는 블록·블록 없는 절은 빼고 경고", () => {
  const { composition: c, warnings } = cleanMgComposition(out(), sourceKey("원문 구절 하나 둘 셋"), new Set(), { indicator: "조직 및 인적자원관리", prior: PRIOR });
  assert.equal(c.mg?.indicator, "조직 및 인적자원관리");
  assert.deepEqual(
    c.mg?.parts.map((p) => [p.key, p.themeTitle, p.title, p.story]),
    [
      ["1.2.가", "대주제 1-2", "첫 절", "배경·내용·성과형"],
      ["1.2.나", "대주제 1-2", "둘째 절", "기존·개선형"],
    ],
  );
  assert.equal(c.mg?.parts[0].evalTitle, "평가내용 1 제목");
  // 블록: 1번 절(나.)의 두 블록이 2번 절(가.)의 블록 뒤로 — 절 순서
  assert.deepEqual(
    c.blocks.map((b) => [b.at, b.label]),
    [
      ["1.2.가", "추진내용"],
      ["1.2.나", "추진배경"],
      ["1.2.나", "추진성과"],
    ],
  );
  assert.deepEqual(c.blocks[1].materials, ["m1"], "재료표에 없는 번호는 뗌");
  assert.equal(c.materials.find((m) => m.id === "m1")?.found, true);
  assert.equal(c.story, "");
  assert.ok(warnings.some((w) => w.includes("놓일 절을 알 수 없는 블록 2개")));
  assert.ok(warnings.some((w) => w.includes("블록이 없는 절 1개")));
});

test("구성안 점검: 「추진성과」로 닫지 않은 절(대주제 본문은 예외)·자료 필요·재료 없는 블록, 판면 경고는 없음", () => {
  const { composition: c } = cleanMgComposition(out(), "", new Set(), { indicator: "지표", prior: PRIOR });
  const issues = mgCompositionIssues(c);
  // 가. 절은 추진성과 블록이 없지만 같은 대주제의 마지막 절(나.)이 추진성과로 닫아 공용으로 덮임(분석 §8.8 — 공용 추진성과 18단위)
  assert.ok(!issues.some((w) => w.includes("가. 첫 절") && w.includes("닫히지")), "가. 절은 대주제 공용 추진성과로 덮임");
  assert.ok(!issues.some((w) => w.includes("나. 둘째 절") && w.includes("닫히지")));
  assert.ok(issues.some((w) => w.startsWith("자료 필요 1건")));
  assert.ok(!issues.some((w) => w.startsWith("판면")));
  const body = { ...c, mg: { ...c.mg!, parts: [{ ...c.mg!.parts[0], key: "1.1.0", mark: "", title: "" }] }, blocks: [{ ...c.blocks[0], at: "1.1.0" }] };
  assert.ok(!mgCompositionIssues(body).some((w) => w.includes("추진성과")), "대주제 본문은 추진성과로 닫지 않아도 됨");
});

test("사람 편집: 절 제목·이야기 틀 고치기, 블록을 다른 절로 옮기면 절 순서로 다시 섬, 빠진 절의 블록·모르는 절 블록은 첫 절로, 블록 10개 넘어도 받음(경영관리 상한 32)", () => {
  const { composition: c } = cleanMgComposition(out(), "", new Set(), { indicator: "지표", prior: PRIOR });
  const e = editOf(c);
  assert.deepEqual(
    e.parts?.map((p) => p.key),
    ["1.2.가", "1.2.나"],
  );
  assert.deepEqual(
    e.blocks.map((b) => b.at),
    ["1.2.가", "1.2.나", "1.2.나"],
  );
  // 나. 절 블록 하나를 가. 절로 옮기고 절 제목·틀을 고침
  const moved = applyMgCompositionEdit(c, { ...e, blocks: [e.blocks[1], e.blocks[0], { ...e.blocks[2], at: "1.2.가" }], parts: [{ key: "1.2.가", title: "고친 제목", story: "문제·해결형" }, { key: "1.2.나", title: "둘째 절", story: "없는 틀" }] }).composition;
  assert.deepEqual(
    moved.blocks.map((b) => [b.at, b.label]),
    [
      ["1.2.가", "추진내용"],
      ["1.2.가", "추진성과"],
      ["1.2.나", "추진배경"],
    ],
  );
  assert.equal(moved.mg?.parts[0].title, "고친 제목");
  assert.equal(moved.mg?.parts[0].story, "문제·해결형");
  assert.equal(moved.mg?.parts[1].story, "기존·개선형", "모르는 틀이면 그대로");
  assert.equal(moved.blocks[1].by, "human", "절을 옮긴 블록은 사람이 고친 블록");
  // 나. 절을 빼면 그 블록은 첫 절로
  const dropped = applyMgCompositionEdit(c, { ...e, parts: [{ key: "1.2.가", title: "첫 절", story: "배경·내용·성과형" }] });
  assert.deepEqual(dropped.composition.mg?.parts.map((p) => p.key), ["1.2.가"]);
  assert.ok(dropped.composition.blocks.every((b) => b.at === "1.2.가"));
  assert.ok(dropped.notes.some((n) => n.includes("첫 절로 옮겼습니다")));
  // 블록 12개(주요사업 상한 10을 넘음)
  const many = applyMgCompositionEdit(c, { ...e, blocks: Array.from({ length: 12 }, () => ({ ...e.blocks[0] })) });
  assert.equal(many.composition.blocks.length, 12);
});

// ---------------------------------------------------------------------------
// 같은 지표 다른 카드의 짜임(형제) — 대주제·절 겹침 점검과 구성안 요청(2026-10-09)

const plan = (parts: Array<[number, number, string, string]>, story = "배경·내용·성과형") => {
  const { composition } = cleanMgComposition(
    {
      ...out(),
      parts: parts.map(([evalNo, themeNo, mark, title]) => ({ evalNo, themeNo, themeTitle: "", mark, title, story, why: "" })),
      blocks: parts.flatMap((_, i) => [
        { part: i + 1, kind: "cards", variant: "plain", label: "추진내용", purpose: "무엇", cells: 3, materials: ["m1"], figures: [], alts: [] },
        { part: i + 1, kind: "stats", variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m2"], figures: [], alts: [] },
      ]),
    } as MgOutlineOutput,
    sourceKey("원문 구절 하나 둘 셋"),
    new Set(),
    { indicator: "조직 및 인적자원관리", prior: PRIOR },
  );
  return composition;
};

test("mgSiblingOf: 구성안의 절마다 열쇠·이름·틀·블록 서명, 구성안이 없거나 경영관리 골격이 없으면 null", () => {
  const sib = mgSiblingOf("9-1", plan([[1, 2, "가", "첫 절"]]))!;
  assert.equal(sib.taskNo, "9-1");
  assert.deepEqual(sib.parts.map((p) => [p.key, p.story, p.signature]), [["1.2.가", "배경·내용·성과형", "cards:plain → stats"]]);
  assert.match(sib.parts[0].label, /평가내용 1 · 대주제 2 · 가\. 첫 절/);
  assert.equal(mgSiblingOf("9-1", null), null);
  assert.equal(mgSiblingOf("9-1", { ...plan([[1, 2, "가", "첫 절"]]), mg: undefined }), null);
});

test("mgOverlapIssues: 같은 절 열쇠·같은 대주제 본문·같은 대주제 안 같은 절 제목이면 겹침 경고, 다른 절이면 없음", () => {
  const sib = mgSiblingOf("9-1", plan([[1, 2, "가", "첫 절"]]))!;
  const same = mgOverlapIssues(plan([[1, 2, "가", "다른 제목"]]), [sib]);
  assert.equal(same.length, 1);
  assert.match(same[0], /^겹침: 평가내용 1 · 대주제 2 · 가\. 다른 제목 — 9-1 카드 구성안도 같은 절\(1\.2\.가\)/);
  assert.match(mgOverlapIssues(plan([[1, 2, "나", "첫 절"]]), [sib])[0] ?? "", /같은 제목/);
  assert.deepEqual(mgOverlapIssues(plan([[1, 2, "나", "둘째 절"]]), [sib]), [], "같은 대주제의 다른 절은 겹침 아님");
  assert.deepEqual(mgOverlapIssues(plan([[1, 2, "가", "첫 절"]]), []), []);
});

test("구성안 요청: 형제 짜임·도식 후보 절을 채우면 자리표시가 남지 않고, 없으면 빈 글", () => {
  const op = reportOutlinePromptsMg().prompts;
  const sib = mgSiblingOf("9-1", plan([[1, 2, "가", "첫 절"]]))!;
  const text = mgSiblingsPrompt(op, [sib]);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.match(text, /9-1/);
  assert.match(text, /1\.2\.가/);
  assert.equal(mgSiblingsPrompt(op, []), "");
  const d = mgDiagramPrompt(op, [{ kind: "hub", why: "기관 3곳", own: true }, { kind: "table", why: "수치 줄", own: false }]);
  assert.doesNotMatch(d, /\{\{\w+\}\}/);
  assert.match(d, /hub — 기관 3곳/);
  assert.match(d, /table — 수치 줄/);
  assert.equal(mgDiagramPrompt(op, []), "");
});

test("구성안 점검 — 성과로 닫기(14개 지표 육안 §8.8: 추진성과 행 없이 끝나는 절 46%, 「추진실적」 열·대주제 공용 추진성과를 인정하면 22%): 「추진실적」·「성과」 라벨도 닫음, 같은 대주제 마지막 절의 추진성과는 앞 절도 덮음", () => {
  const base = cleanMgComposition(out(), "", new Set(), { indicator: "지표", prior: PRIOR }).composition;
  const parts = [
    { ...base.mg!.parts[0], key: "1.2.가", themeNo: 2, mark: "가", title: "첫 절" },
    { ...base.mg!.parts[0], key: "1.2.나", themeNo: 2, mark: "나", title: "둘째 절" },
    { ...base.mg!.parts[0], key: "1.3.가", themeNo: 3, mark: "가", title: "셋째 절" },
  ];
  const blk = (at: string, label: string, kind = "cards") => ({ ...base.blocks[0], at, label, kind: kind as never, materials: ["m1"], purpose: "목적" });
  const c = (blocks: ReturnType<typeof blk>[]) => ({ ...base, mg: { ...base.mg!, parts }, blocks });
  // 가: 추진내용만이지만 같은 대주제 마지막 절(나)이 추진성과로 닫음 → 덮임. 3.가: 구분표 「구분·주요활동·추진실적」으로 닫음
  const ok = mgCompositionIssues(c([blk("1.2.가", "추진내용"), blk("1.2.나", "추진성과", "stats"), blk("1.3.가", "구분·주요활동·추진실적", "table")]));
  assert.ok(!ok.some((w) => w.includes("닫히지")), ok.join("\n"));
  // 나가 닫지 않으면 가·나 모두 알림, 문구는 「대부분」이라 단정하지 않음
  const bad = mgCompositionIssues(c([blk("1.2.가", "추진내용"), blk("1.2.나", "추진내용"), blk("1.3.가", "추진실적", "table")]));
  const w = bad.filter((x) => x.includes("닫히지"));
  assert.equal(w.length, 2, bad.join("\n"));
  assert.doesNotMatch(w[0], /대부분/);
  assert.match(w[0], /추진실적/);
});

test("구성안 점검 — 여는 블록이 '25 지적 대응(2026-10-17 서사 순서 S): 핵심 메시지·절마다 첫 블록 목적·라벨에 지적어면 참고 경고 한 줄, 첫 블록이 아닌 지적 해소 블록은 통과", () => {
  const base = cleanMgComposition(out(), "", new Set(), { indicator: "지표", prior: PRIOR }).composition;
  const parts = [
    { ...base.mg!.parts[0], key: "1.2.가", themeNo: 2, mark: "가", title: "첫 절" },
    { ...base.mg!.parts[0], key: "1.2.나", themeNo: 2, mark: "나", title: "둘째 절" },
  ];
  const blk = (at: string, label: string, purpose: string) => ({ ...base.blocks[0], at, label, kind: "cards" as never, materials: ["m1"], purpose });
  const c = (message: string, blocks: ReturnType<typeof blk>[]) => ({ ...base, message, mg: { ...base.mg!, parts }, blocks });
  const ok = c("현장 민원 처리 시간을 줄여 이용자 불편 해소", [blk("1.2.가", "추진배경", "현장 민원 지연 문제"), blk("1.2.가", "추진내용", "'25 평가위원 지적을 해소한 전후 비교"), blk("1.2.나", "추진배경", "정부 지침 요구")]);
  assert.equal(mgFindingOpenIssue(ok), "");
  assert.ok(!mgCompositionIssues(ok).some((w) => w.includes("지적 대응에서 시작")));
  const bad = c("'25 지적 해소로 체계 고도화", [blk("1.2.가", "지적개선", "평가 의견 반영"), blk("1.2.나", "추진배경", "개선 요구에 대응"), blk("1.2.나", "추진성과", "성과")]);
  const w = mgFindingOpenIssue(bad);
  assert.match(w, /^구성안: 여는 블록이 '25 지적 대응에서 시작 — 이 과제의 가치\(왜\)에서 시작하고 지적 대응은 그것을 해소하는 블록 하나로/);
  assert.match(w, /핵심 메시지 · .*첫 절 첫 블록 · .*둘째 절 첫 블록/);
  assert.equal(mgCompositionIssues(bad).filter((x) => x === w).length, 1);
  assert.equal(warningLevel(w), "info", "참고 등급 — 자동 고치기·막힘 아님");
});

// 절별 「이 틀로 다시 짜기」(2026-10-10 사용자 결정): 그 절 블록만 바꾸고 다른 절은 그대로
const current = () => {
  const { composition } = cleanMgComposition(out(), sourceKey("원문 구절 하나 둘 셋"), new Set(), { indicator: "조직 및 인적자원관리", prior: PRIOR });
  // 둘째 절(1.2.나)의 블록은 사람이 고른 블록으로 둠(다른 절의 사람 편집이 남는지 보려고)
  return { ...composition, blocks: composition.blocks.map((b) => (b.at === "1.2.나" ? { ...b, by: "human" as const, purpose: "사람이 고친 목적" } : b)) };
};
const redoOut = (): MgOutlineOutput => ({
  message: "새 핵심",
  points: ["새 논점"],
  // AI가 표지를 바꿔 내도 앱은 고른 절 열쇠로 둠
  parts: [{ evalNo: 1, themeNo: 2, themeTitle: "", mark: "다", title: "다시 짠 절", story: "문제·해결형", why: "문제에서 해결로" }],
  materials: [
    { id: "m1", kind: "fact", text: "사실", when: "", source: "카드", quote: "원문 구절 하나 둘 셋" },
    { id: "m2", kind: "fact", text: "새 사실", when: "", source: "카드", quote: "원문 구절 하나 둘 셋" },
    { id: "m3", kind: "fact", text: "안 쓰는 재료", when: "", source: "카드", quote: "원문 구절 하나 둘 셋" },
  ],
  blocks: [
    { part: 1, kind: "bullets", variant: "", label: "문제", purpose: "무엇이 문제", cells: 2, materials: ["m1"], figures: [], alts: [] },
    { part: 1, kind: "compare", variant: "panels", label: "해결", purpose: "어떻게", cells: 2, materials: ["m2"], figures: [], alts: [] },
    { part: 1, kind: "stats", variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m2"], figures: [], alts: [] },
  ],
});

test("절 다시 짜기 합치기(replaceMgPart): 고른 절 블록만 새 블록(AI가 표지를 바꿔도 그 절 열쇠), 다른 절의 블록·사람 편집은 그대로, 절 순서 유지, 틀·둔 이유는 바뀜", () => {
  const cur = current();
  const next = cleanMgComposition(redoOut(), sourceKey("원문 구절 하나 둘 셋"), new Set(), { indicator: "조직 및 인적자원관리", prior: PRIOR }).composition;
  const r = replaceMgPart(cur, next, "1.2.가", "문제·해결형");
  assert.equal(r.changed, true);
  const c = r.composition;
  // 지금 구성안: 1.2.가 = 추진내용 1개, 1.2.나 = 추진배경·추진성과(사람이 고른 블록)
  assert.deepEqual(c.blocks.map((b) => [b.at, b.label]), [["1.2.가", "문제"], ["1.2.가", "해결"], ["1.2.가", "추진성과"], ["1.2.나", "추진배경"], ["1.2.나", "추진성과"]], "절 순서대로 — 다시 짠 절의 옛 블록(추진내용)은 빠짐");
  assert.ok(c.blocks.filter((b) => b.at === "1.2.나").every((b) => b.by === "human" && b.purpose === "사람이 고친 목적"), "다른 절의 사람 편집은 그대로");
  const part = c.mg!.parts.find((p) => p.key === "1.2.가")!;
  assert.deepEqual([part.story, part.why, part.title], ["문제·해결형", "문제에서 해결로", "첫 절"], "틀·둔 이유는 바뀌고 제목은 지금 것");
  assert.deepEqual(c.mg!.parts.map((p) => p.key), ["1.2.가", "1.2.나"], "절 목록은 그대로");
  assert.equal(c.message, cur.message, "핵심 메시지·논점은 지금 구성안 것");
});

test("절 다시 짜기 합치기: 새 재료는 같은 글·구절이면 지금 번호를, 아니면 겹치지 않는 새 번호로(쓰지 않는 새 재료는 안 넣음), 옛 블록만 쓰던 재료는 빼고 자료 필요는 남김", () => {
  const cur = current();
  const next = cleanMgComposition(redoOut(), sourceKey("원문 구절 하나 둘 셋"), new Set(), { indicator: "조직 및 인적자원관리", prior: PRIOR }).composition;
  const c = replaceMgPart(cur, next, "1.2.가", "문제·해결형").composition;
  const ids = c.materials.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "재료 번호가 겹치지 않음");
  const mat = (id: string) => c.materials.find((m) => m.id === id)!;
  const redo = c.blocks.filter((b) => b.at === "1.2.가");
  assert.equal(mat(redo[0].materials[0]).text, "사실");
  assert.equal(redo[0].materials[0], "m1", "같은 재료는 지금 번호(m1)");
  assert.equal(mat(redo[1].materials[0]).text, "새 사실");
  assert.notEqual(redo[1].materials[0], "m2", "새 재료는 새 번호(지금 m2 = 자료 필요와 안 겹침)");
  assert.ok(!c.materials.some((m) => m.text === "안 쓰는 재료"), "새 블록이 안 쓰는 새 재료는 넣지 않음");
  assert.ok(c.materials.some((m) => m.id === "m2" && m.kind === "need"), "다른 절(1.2.나 추진성과)이 쓰는 자료 필요 m2는 그대로");
  // 옛 블록만 쓰던 재료는 빠짐: 1.2.가의 옛 블록(추진내용)만 쓰던 재료가 있으면 — 여기서는 m1을 1.2.나도 써서 남음
  assert.ok(c.materials.some((m) => m.id === "m1"));
  const solo = { ...cur, materials: [...cur.materials, { ...cur.materials[0], id: "m7", text: "옛 절만 쓰던 재료" }], blocks: cur.blocks.map((b) => (b.at === "1.2.가" ? { ...b, materials: ["m7"] } : b)) };
  assert.ok(!replaceMgPart(solo, next, "1.2.가", "문제·해결형").composition.materials.some((m) => m.id === "m7"), "옛 블록만 쓰던 재료는 뺌");
});

test("절 다시 짜기 합치기: AI가 블록을 못 내면 그대로(changed false), 없는 절이면 그대로, 블록 상한을 넘는 새 블록은 버림", () => {
  const cur = current();
  const empty = { ...cur, blocks: [], materials: [] };
  assert.equal(replaceMgPart(cur, empty, "1.2.가", "문제·해결형").changed, false);
  assert.equal(replaceMgPart(cur, cur, "9.9.가", "문제·해결형").changed, false);
  const many = { ...cur, blocks: Array.from({ length: 40 }, (_, i) => ({ ...cur.blocks[0], label: `b${i}` })) };
  const r = replaceMgPart(cur, many, "1.2.가", "문제·해결형");
  assert.ok(r.composition.blocks.length <= 32);
  assert.ok(r.notes.some((n) => n.includes("블록 상한")));
});

test("절 다시 짜기 요청 글: 고른 절 열쇠·이름·틀과 다른 절 요약을 채우면 자리표시가 남지 않고, 없는 절이면 null", () => {
  const op = reportOutlinePromptsMg().prompts;
  const cur = current();
  const redo = mgPartRedo(cur, "1.2.가", "문제·해결형")!;
  assert.deepEqual(redo.others.map((o) => o.key), ["1.2.나"]);
  const text = mgPartPrompt(op, redo);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.match(text, /이 절만 다시 짜기/);
  assert.match(text, /\[1\.2\.가\]/);
  assert.match(text, /「문제·해결형」/);
  assert.match(text, /다른 절 \[1\.2\.나\]/);
  assert.equal(mgPartRedo(cur, "9.9.가", "문제·해결형"), null);
});

test("절 다시 짜기(짜임 고르기 — 2026-10-12): 틀 없이 구성 패턴·예시 절로 다시 짜면 AI가 그 절의 틀을 고르게 하고(요청 글), 고른 짜임 글을 다른 절 목록 뒤에 붙임", () => {
  const op = reportOutlinePromptsMg().prompts;
  const cur = current();
  const redo = mgPartRedo(cur, "1.2.가", undefined, { pattern: patternOf("pool-3-2"), example: { key: "rpt25-mg-01/MG-1/1/1/가", title: "2025 보고서 예시", where: "평가내용 1", text: "추진배경 | 예시 글", images: 0 } })!;
  assert.equal(redo.story, undefined);
  const text = mgPartPrompt(op, redo);
  assert.doesNotMatch(text, /\{\{[^}]+\}\}/);
  assert.match(text, /아래 담당자가 고른 짜임·요청대로 다시 짜/);
  assert.match(text, /story\(주 틀\)·subStory\(보조 틀\)는 이 절의 성격과/);
  assert.doesNotMatch(text, /subStory는 빈 글입니다/);
  assert.match(text, /다른 절 \[1\.2\.나\][\s\S]*담당자가 고른 짜임[\s\S]*3단-2[\s\S]*2025 예시 절 — 2025 보고서 예시/, "다른 절 목록 뒤에 짜임");
  assert.match(text, /절 끝 라벨 「추진성과」 블록/);
  // 틀을 고르면 예전 글 그대로(그 틀 하나로)
  assert.match(mgPartPrompt(op, mgPartRedo(cur, "1.2.가", "문제·해결형")!), /story는 「문제·해결형」, subStory는 빈 글입니다/);
});

test("절 다시 짜기 합치기(짜임 고르기): 틀을 고르지 않았으면 AI가 적은 주 틀·보조 틀(정리된 12종)을, 고른 짜임은 그 절에 남기고 다시 짜면 바뀜", () => {
  const cur = current();
  const out = { ...redoOut(), parts: [{ ...redoOut().parts[0], story: "문제ㆍ해결형", subStory: "계량 모니터링형" }] };
  const next = cleanMgComposition(out, sourceKey("원문 구절 하나 둘 셋"), new Set(), { indicator: "조직 및 인적자원관리", prior: PRIOR }).composition;
  const frame = { pattern: "pool-3-2", request: "배경을 셋으로" };
  const r = replaceMgPart(cur, next, "1.2.가", { frame });
  const part = r.composition.mg!.parts.find((p) => p.key === "1.2.가")!;
  assert.deepEqual([part.story, part.subStory, part.frame], ["문제·해결형", "계량 모니터링형", frame], "AI가 고른 틀(가운뎃점 정리)·보조 틀·고른 짜임");
  assert.equal(r.composition.mg!.parts.find((p) => p.key === "1.2.나")!.frame, undefined, "다른 절은 그대로");
  // 틀을 고르면 그 틀(보조 틀은 지움), 짜임 기록 없이 다시 짜면 옛 기록은 지움
  const again = replaceMgPart(r.composition, next, "1.2.가", "기존·개선형").composition.mg!.parts.find((p) => p.key === "1.2.가")!;
  assert.deepEqual([again.story, again.subStory, again.frame], ["기존·개선형", undefined, undefined]);
  // AI가 틀을 못 적었으면 지금 틀 그대로
  const blank = cleanMgComposition({ ...redoOut(), parts: [{ ...redoOut().parts[0], story: "모르는 틀" }] }, sourceKey("원문 구절 하나 둘 셋"), new Set(), { indicator: "x", prior: PRIOR }).composition;
  assert.equal(replaceMgPart(cur, blank, "1.2.가", {}).composition.mg!.parts.find((p) => p.key === "1.2.가")!.story, cur.mg!.parts.find((p) => p.key === "1.2.가")!.story);
});

// ---------------------------------------------------------------------------
// 닫기 관례(2026-10-12 사용자 결정 D2): 그 지표 2025 절이 모두 「추진성과」 행으로 닫혔으면 엄격 — 절마다 마지막 블록 라벨 「추진성과」

test("닫기 관례: 2025 절(표지 있는 것) 글이 모두 「추진성과 |」 줄을 가지면 엄격, 하나라도 없으면 기본, 대주제 본문은 셈에서 뺌, 절이 없으면 기본(total 0)", () => {
  const closed = (mark: string) => sec(1, 2, mark, `${mark} 절`, `추진배경 | 배경\n\n추진성과 | ∙ 7분 → 1분`);
  assert.deepEqual(mgCloseRule([sec(1, 1, "", ""), closed("가"), closed("나")]), { strict: true, closed: 2, total: 2 });
  assert.deepEqual(mgCloseRule([closed("가"), sec(1, 2, "나", "나 절", "구분 | 주요활동 | 추진실적")]), { strict: false, closed: 1, total: 2 });
  assert.deepEqual(mgCloseRule([closed("가"), sec(1, 2, "나", "나 절", "추진내용 | ∙ 추진성과 점검 체계 마련")]).strict, false, "줄머리가 아닌 「추진성과」 낱말은 안 셈");
  assert.deepEqual(mgCloseRule(PRIOR.filter((x) => !x.mark)), { strict: false, closed: 0, total: 0 });
  const op = reportOutlinePromptsMg().prompts;
  assert.match(mgClosePrompt(op, [closed("가"), closed("나")], "AI 활용 혁신"), /^「닫기 관례」 이 지표\(「AI 활용 혁신」\)의 2025 보고서는 절 2개가 모두 라벨 「추진성과」 행으로 닫혔습니다/);
  assert.match(mgClosePrompt(op, PRIOR, "지표"), /절마다 닫는 모양이 다릅니다/);
  assert.match(mgClosePrompt(op, [], "지표"), /절 글이 없어 기본 규칙대로/);
  for (const t of [mgClosePrompt(op, [closed("가")], "x"), mgClosePrompt(op, PRIOR, "x"), mgClosePrompt(op, [], "x")]) assert.doesNotMatch(t, /\{\{\w+\}\}/);
});

test("닫기 관례(F2, 2026-10-17): 엄격이 아니면 기본은 대주제 마지막 절 하나의 공용 추진성과 — 중간 절은 추진성과 행 없이 끝나도 되고, 절이 하나뿐인 대주제는 그 절이 닫음(구성안·집필 요청 둘 다)", () => {
  const dp = reportDraftPromptsMg().prompts;
  for (const set of [reportOutlinePromptsMg().prompts, dp]) {
    for (const prior of [PRIOR, []]) {
      const t = mgClosePrompt(set, prior, "지표");
      assert.match(t, /대주제에 절이 둘 이상이면 기본은 그 대주제 마지막 절 하나가 공용 「추진성과」로 닫고/, set.feature);
      assert.match(t, /중간 절은 추진성과 행 없이 .*실행 내용.*끝나도/, set.feature);
      assert.match(t, /절이 하나뿐인 대주제는 그 절이/, set.feature);
      assert.doesNotMatch(t, /\{\{\w+\}\}/);
    }
    assert.doesNotMatch(mgClosePrompt(set, [sec(1, 2, "가", "가 절", "추진성과 | 결과"), sec(1, 2, "나", "나 절", "추진성과 | 결과")], "지표"), /중간 절은/, "엄격 지표는 절마다 닫음 — 중간 절 면제 문구 없음");
  }
});

test("성과로 닫기(기본): 같은 대주제의 중간 절은 추진성과 없이도 경고하지 않고 마지막 절이 닫지 않으면 둘 다 경고, 절이 하나뿐인 대주제는 그 절이 닫아야 함", () => {
  const part = (themeNo: number, mark: string) => ({ key: `1.${themeNo}.${mark}`, evalNo: 1, evalTitle: "", themeNo, themeTitle: "", mark, title: `${mark} 절`, story: "" as const, why: "" });
  const parts = [part(1, "가"), part(1, "나"), part(1, "다"), part(2, "가")];
  const blocks = [
    { at: "1.1.가", label: "추진내용" },
    { at: "1.1.나", label: "추진내용", kind: "table", variant: "" },
    { at: "1.1.다", label: "추진성과" },
    { at: "1.2.가", label: "추진내용" },
  ];
  assert.deepEqual(unclosedPartKeys(parts, blocks), ["1.2.가"], "1.1은 마지막 절(다)이 닫아 중간 절(가·나)은 통과, 하나뿐인 1.2의 가는 경고");
  assert.deepEqual(unclosedPartKeys(parts, blocks.map((b) => (b.at === "1.1.다" ? { ...b, label: "추진내용" } : b))), ["1.1.가", "1.1.나", "1.1.다", "1.2.가"], "마지막 절이 안 닫으면 그 대주제 모든 절 경고");
});

test("성과로 닫기(엄격): 마지막 블록 라벨이 「추진성과」여야 함 — 「추진실적」 표·대주제 공용 추진성과는 인정하지 않음, 대주제 본문은 예외", () => {
  const parts = [
    { key: "1.2.가", evalNo: 1, evalTitle: "", themeNo: 2, themeTitle: "", mark: "가", title: "첫 절", story: "" as const, why: "" },
    { key: "1.2.나", evalNo: 1, evalTitle: "", themeNo: 2, themeTitle: "", mark: "나", title: "둘째 절", story: "" as const, why: "" },
    { key: "1.3.0", evalNo: 1, evalTitle: "", themeNo: 3, themeTitle: "본문", mark: "", title: "", story: "" as const, why: "" },
  ];
  const blocks = [
    { at: "1.2.가", label: "추진성과" },
    { at: "1.2.가", label: "추진실적" },
    { at: "1.2.나", label: "추진 성과" },
    { at: "1.3.0", label: "추진내용" },
  ];
  assert.deepEqual(unclosedPartKeys(parts, blocks, true), ["1.2.가"], "가는 「추진성과」 뒤에 「추진실적」 표로 끝남, 나는 띄어쓰기 무시");
  assert.deepEqual(unclosedPartKeys(parts, blocks), [], "기본 규칙은 그대로(「추진실적」·「성과」 라벨 인정)");
  // 공용 추진성과: 가는 추진내용뿐, 같은 대주제 마지막 절(나)이 추진성과 — 기본은 덮이고 엄격은 아님
  const shared = [{ at: "1.2.가", label: "추진내용" }, { at: "1.2.나", label: "추진성과" }];
  assert.deepEqual(unclosedPartKeys(parts, shared), []);
  assert.deepEqual(unclosedPartKeys(parts, shared, true), ["1.2.가"]);
});

test("구성안(엄격 지표): 정리할 때 전년 골격으로 strictClose를 남기고, 점검이 같은 규칙으로 「마지막 블록 추진성과」 경고 — 사람 편집·절 다시 짜기에도 남음", () => {
  const strictPrior = [sec(1, 2, "가", "가 절", "추진성과 | 결과"), sec(1, 2, "나", "나 절", "추진성과 | 결과")];
  const { composition: c } = cleanMgComposition(out(), "", new Set(), { indicator: "AI 활용 혁신", prior: strictPrior });
  assert.equal(c.mg?.strictClose, true);
  assert.equal(cleanMgComposition(out(), "", new Set(), { indicator: "지표", prior: PRIOR }).composition.mg?.strictClose, undefined, "기본 지표는 남기지 않음");
  // out(): 가 절은 추진내용(cards)뿐, 나 절은 추진배경 → 추진성과 — 기본이면 공용으로 덮였지만 엄격이면 가 절 경고
  const issues = mgCompositionIssues(c);
  const w = issues.filter((x) => x.startsWith("절:"));
  assert.equal(w.length, 1, issues.join("\n"));
  assert.match(w[0], /가\. 첫 절의 마지막 블록이 라벨 「추진성과」가 아닙니다/);
  assert.equal(applyMgCompositionEdit(c, editOf(c)).composition.mg?.strictClose, true, "사람 편집 뒤에도 남음");
});

const CHUNK_DIR = resolve(import.meta.dirname, "../../resources/knowledge/_chunks");
const chunkFiles = existsSync(CHUNK_DIR) ? readdirSync(CHUNK_DIR).filter((f) => /^rpt25-mg-\d+\.jsonl$/.test(f)) : [];
test("실제 2025 조각: 14개 지표 중 엄격 닫기는 MG-12(안전한 일터 조성)·MG-13(AI 활용 혁신)뿐 — 육안 판정(분석 §8.7·§8.8)과 같음", { skip: chunkFiles.length !== 14 && "2025 경영관리 보고서 조각(resources/knowledge/_chunks/rpt25-mg-*.jsonl — git 밖) 14개가 없음" }, () => {
  const strict: string[] = [];
  for (const f of chunkFiles) {
    const rows = readFileSync(resolve(CHUNK_DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const prior = rows.flatMap((r) => {
      const x = toMgPriorSection(r);
      return x ? [x] : [];
    });
    if (mgCloseRule(prior).strict) strict.push(String(rows[0]?.business));
  }
  assert.deepEqual(strict.sort(), ["MG-12", "MG-13"]);
});

// ---------------------------------------------------------------------------
// 주 틀 + 보조 틀(2026-10-12 C5 — 섞음 대신, 주요사업과 같게)·재료 상한(C6)·평가내용 번호 확인(C11)

test("이야기 틀(경영관리): 스키마는 문자열로 받아 파싱이 실패하지 않고(2026-10-12 — 가운뎃점 변형 하나로 답 전체가 실패하던 enum 대신), 정리가 12종으로 맞춤 — 섞음·모르는 틀은 빈 글, 보조 틀은 주 틀과 다를 때만 남김", () => {
  const ok = out();
  assert.equal(MgOutlineOut.safeParse(ok).success, true);
  const mixed = { ...ok, parts: ok.parts.map((x, i) => (i === 0 ? { ...x, story: "섞음" } : x)) };
  assert.equal(MgOutlineOut.safeParse(mixed).success, true, "섞음도 파싱은 통과(정리에서 버림)");
  const withSub = { ...ok, parts: ok.parts.map((x, i) => (i === 0 ? { ...x, subStory: "단계·연도 로드맵형" } : i === 1 ? { ...x, subStory: "" } : x)) };
  assert.equal(MgOutlineOut.safeParse(withSub).success, true, "보조 틀은 문자열");
  const c = cleanMgComposition(mixed as unknown as MgOutlineOutput, "", new Set(), { indicator: "지표", prior: PRIOR }).composition;
  assert.equal(c.mg?.parts.find((p) => p.key === "1.2.나")?.story, "", "섞음은 정리에서 빈 글");
  const variant = { ...ok, parts: ok.parts.map((x, i) => (i === 0 ? { ...x, story: "기존ㆍ개선형", subStory: "단계･연도 로드맵형" } : i === 1 ? { ...x, story: " 배경 · 내용 · 성과형 " } : x)) };
  const vc = cleanMgComposition(variant, "", new Set(), { indicator: "지표", prior: PRIOR }).composition;
  assert.deepEqual(vc.mg?.parts.map((p) => [p.key, p.story, p.subStory]), [["1.2.가", "배경·내용·성과형", undefined], ["1.2.나", "기존·개선형", "단계·연도 로드맵형"]], "가운뎃점 변형·띄어쓰기를 정식 이름으로");
  const same = { ...ok, parts: ok.parts.map((x, i) => (i === 0 ? { ...x, subStory: "기존·개선형" as const } : i === 1 ? { ...x, subStory: "문제·해결형" as const } : x)) };
  const sc = cleanMgComposition(same, "", new Set(), { indicator: "지표", prior: PRIOR }).composition;
  assert.equal(sc.mg?.parts.find((p) => p.key === "1.2.나")?.subStory, undefined, "보조 틀 = 주 틀이면 버림");
  assert.equal(sc.mg?.parts.find((p) => p.key === "1.2.가")?.subStory, "문제·해결형");
});

test("이야기 틀(경영관리) 사람 편집: 주 틀을 바꾸면 보조 틀은 지우고(옛 값을 그대로 보내도), 새로 고른 보조 틀은 받음, 빈 글은 지움, 보조 틀 = 주 틀이면 안 받음", () => {
  const base = cleanMgComposition({ ...out(), parts: out().parts.map((x, i) => (i === 1 ? { ...x, subStory: "단계·연도 로드맵형" as const } : x)) }, "", new Set(), { indicator: "지표", prior: PRIOR }).composition;
  const e = editOf(base);
  assert.deepEqual(e.parts?.map((p) => [p.key, p.story, p.subStory]), [["1.2.가", "배경·내용·성과형", "단계·연도 로드맵형"], ["1.2.나", "기존·개선형", ""]], "편집 시작 값에 보조 틀(없으면 빈 글)");
  const edited = (parts: NonNullable<typeof e.parts>) => applyMgCompositionEdit(base, { ...e, parts }).composition.mg!.parts[0];
  const [ga, na] = e.parts!;
  assert.equal(edited([ga, na]).subStory, "단계·연도 로드맵형", "그대로 두면 그대로");
  assert.equal(edited([{ ...ga, story: "문제·해결형" }, na]).subStory, undefined, "주 틀을 바꾸면 옛 보조 틀은 지움");
  assert.equal(edited([{ ...ga, story: "문제·해결형", subStory: "계량 모니터링형" }, na]).subStory, "계량 모니터링형", "주 틀을 바꾸며 새로 고른 보조 틀은 받음");
  assert.equal(edited([{ ...ga, subStory: "" }, na]).subStory, undefined, "빈 글이면 지움");
  assert.equal(edited([{ ...ga, subStory: "배경·내용·성과형" }, na]).subStory, undefined, "주 틀과 같으면 안 받음");
  assert.equal(edited([{ ...ga, story: "섞음" }, na]).story, "배경·내용·성과형", "새로 섞음을 고를 수는 없음");
  const noKey = { key: ga.key, title: ga.title, story: ga.story };
  assert.equal(edited([noKey, na]).subStory, "단계·연도 로드맵형", "보조 틀을 빠뜨린 옛 화면 값은 그대로");
});

test("이야기 틀(경영관리) 읽기 호환: 옛 구성안의 「섞음」 절은 편집·형제 짜임·집필 요청에서 그대로 읽히고, 다시 짜기는 섞음을 받지 않음", () => {
  const base = cleanMgComposition(out(), sourceKey("원문 구절 하나 둘 셋"), new Set(), { indicator: "지표", prior: PRIOR }).composition;
  const old = { ...base, mg: { ...base.mg!, parts: base.mg!.parts.map((p, i) => (i === 0 ? { ...p, story: "섞음" as const } : p)) } };
  const e = editOf(old);
  assert.equal(e.parts?.[0].story, "섞음");
  assert.equal(applyMgCompositionEdit(old, e).composition.mg?.parts[0].story, "섞음", "옛 섞음은 그대로 둠");
  assert.equal(applyMgCompositionEdit(old, { ...e, parts: e.parts!.map((p, i) => (i === 0 ? { ...p, subStory: "문제·해결형" } : p)) }).composition.mg?.parts[0].subStory, undefined, "섞음 절에는 보조 틀을 안 붙임");
  assert.equal(mgSiblingOf("9-1", old)?.parts[0].story, "섞음");
  assert.equal(isMgStory("섞음"), true, "읽기는 받음");
  assert.equal(isMgMainStory("섞음"), false, "절 다시 짜기(regenerateMgPart)·AI 답은 주 틀 12종만");
  const plan = mgPlanPrompt(reportDraftPromptsMg().prompts, old, { indicator: "지표", prior: PRIOR });
  assert.match(plan, /이야기 틀 섞음\(옛 구성안/);
  assert.doesNotMatch(plan, /\{\{\w+\}\}/);
  // 주 + 보조는 「주 + 보조」로
  const sub = { ...base, mg: { ...base.mg!, parts: base.mg!.parts.map((p, i) => (i === 0 ? { ...p, subStory: "문제·해결형" as const } : p)) } };
  assert.match(mgPlanPrompt(reportDraftPromptsMg().prompts, sub, { indicator: "지표", prior: PRIOR }), /이야기 틀 배경·내용·성과형 \+ 문제·해결형/);
  const op = reportOutlinePromptsMg().prompts;
  assert.match(mgSiblingsPrompt(op, [mgSiblingOf("9-1", sub)!]), /배경·내용·성과형 \+ 문제·해결형/);
  assert.match(mgPartPrompt(op, mgPartRedo(sub, "1.2.나", "문제·해결형")!), /다른 절 \[1\.2\.가\] [^\n]* · 배경·내용·성과형 \+ 문제·해결형/);
});

test("절 다시 짜기(경영관리): 고른 주 틀로 짜고 그 절의 보조 틀은 지움(다른 절의 보조 틀은 그대로)", () => {
  const cur = current();
  const both = { ...cur, mg: { ...cur.mg!, parts: cur.mg!.parts.map((p) => ({ ...p, subStory: "단계·연도 로드맵형" as const })) } };
  const next = cleanMgComposition(redoOut(), sourceKey("원문 구절 하나 둘 셋"), new Set(), { indicator: "조직 및 인적자원관리", prior: PRIOR }).composition;
  const c = replaceMgPart(both, next, "1.2.가", "문제·해결형").composition;
  const ga = c.mg!.parts.find((p) => p.key === "1.2.가")!;
  assert.equal(ga.story, "문제·해결형");
  assert.ok(!("subStory" in ga), "다시 짠 절의 보조 틀은 지움");
  assert.equal(c.mg!.parts.find((p) => p.key === "1.2.나")!.subStory, "단계·연도 로드맵형");
});

test("재료 상한(경영관리): 절 수 × 6개, 최소 20개(주요사업과 같음)·최대 40개 — 절 1개 20·4개 24·10개(절 상한 8) 40", () => {
  const mats = Array.from({ length: 60 }, (_, i) => ({ id: `m${i + 1}`, kind: "fact" as const, text: `사실 ${i + 1}`, when: "", source: "카드", quote: "" }));
  const withParts = (n: number): MgOutlineOutput => ({
    ...out(),
    parts: Array.from({ length: n }, (_, i) => ({ evalNo: 1, themeNo: 2, themeTitle: "", mark: "가나다라마바사아자차"[i], title: `절 ${i + 1}`, story: "배경·내용·성과형" as const, why: "" })),
    materials: mats,
    blocks: Array.from({ length: n }, (_, i) => ({ part: i + 1, kind: "stats" as const, variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m1"], figures: [], alts: [] })),
  });
  const count = (n: number) => cleanMgComposition(withParts(n), "", new Set(), { indicator: "지표", prior: PRIOR }).composition.materials.length;
  assert.equal(count(1), 20);
  assert.equal(count(4), 24);
  assert.equal(count(10), 40);
});

test("평가내용 번호 확인(경영관리): 2025 골격에 없는 평가내용 번호는 버리지 않고 경고, 골격에 있으면·골격이 없으면 경고 없음", () => {
  const ask = (evalNo: number, prior: MgPriorSection[]) =>
    cleanMgComposition({ ...out(), parts: [{ evalNo, themeNo: 1, themeTitle: "새 대주제", mark: "가", title: "새 절", story: "배경·내용·성과형", why: "" }], blocks: [{ part: 1, kind: "stats", variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m1"], figures: [], alts: [] }] }, "", new Set(), { indicator: "지표", prior });
  const r = ask(7, PRIOR);
  assert.deepEqual(r.composition.mg?.parts.map((p) => [p.key, p.evalTitle]), [["7.1.가", ""]], "절은 남김(조용히 버리지 않음)");
  const w = r.warnings.filter((x) => x.startsWith("평가내용:"));
  assert.equal(w.length, 1);
  assert.match(w[0], /7번은 2025 보고서에 없는 번호입니다\(2025: 1·3·4·5\)/);
  assert.ok(!ask(3, PRIOR).warnings.some((x) => x.startsWith("평가내용:")), "골격에 있는 번호");
  assert.ok(!ask(7, []).warnings.some((x) => x.startsWith("평가내용:")), "2025 골격이 없으면 판단하지 않음");
});
