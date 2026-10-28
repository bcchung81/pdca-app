// 경평 초안 제목 점검(lib/reports/title-checks.ts — 2026-10-28) 시험: 소항목 제목 한 줄 폭(fit.ts subTitleMm·titleMm과 같은 모델)·글자 한도,
// 요청 머리·고치기 요청의 제목 한도, 블록 제목 화살표 경고(공유 낱말 있음·없음). 2025 제목 원문은 기관 자료라 쓰지 않고 같은 글자 구성(한글·빈칸·영문)의 가상 제목으로 셈.

import assert from "node:assert/strict";
import { test } from "node:test";
import { reportDraftPrompts } from "../prompts/sets.ts";
import { PAGE_MM, fitReport, subTitleMax, subTitleMm, textEm, titleMm } from "./fit.ts";
import { type SectionContext, type SectionOutput, fitPrompt, sectionPrompt } from "./section.ts";
import { arrowTitleWarnings, arrowWithoutSharedNoun, bareBoxWarnings, isBareBox, subTitleIssues } from "./title-checks.ts";
import { warningLevel } from "./warning-levels.ts";

const PT = 25.4 / 72;
const LINE = 14 * 1.3 * PT;
/** 글자 구성만 같은 가상 제목: 낱말마다 한글 글자 수(영문 낱말은 문자열 그대로) */
const fake = (words: Array<number | string>) => words.map((w) => (typeof w === "number" ? "가".repeat(w) : w)).join(" ");

// 2025 최종본에서 가장 긴 축의 제목 꼴(38자 — 영문 낱말 하나 + 한글 낱말 9개, 2025 인쇄본 마커 지적개선·BP로 166mm 한 줄).
// 앱은 BP를 소항목이 아니라 실행과제 띠에 붙이므로(section.ts 소항목 마커는 지적개선·신규·AI뿐) 앱 화면 꼴은 지적개선만 — BP까지 소항목에 붙이면
// 앱 BP 칩(좌우 27px)이 2025 인쇄본보다 넓어 화면 실측도 170.9mm로 넘침(2026-10-28 크롬)
const LONG_2025 = fake(["ICT", 2, 2, 4, 4, 4, 4, 2, 2, 2]);
// 2025 소항목 제목 중 앱 화면(마커 칩 포함) 기준 가장 긴 두 꼴 — 화면 실측 168.5mm(신규)·166.9mm(영문 「AI」 두 번, 마커 AI)
const WIDE_2025 = fake([3, 2, 2, 6, 4, 5, 3, 3, 2, 2]);
const AI_2025 = fake([3, 3, 3, 3, 3, 2, "가가,", "‘가가가", "AI", "가가가가’가가", 2]);
// 운영 초안 1-다 꼴(48자, 마커 지적개선·AI — 실측 198mm로 두 줄)
const BIZ_1DA = fake([3, 4, 3, 4, 2, 5, 3, 4, 3, 4, 3]);
// 운영 초안(2026-10-28) 중 화면 실측으로 한 줄을 넘는 넷의 꼴(가운데점 ･ 포함): 1-다 198mm·1-라 183mm·1-가 176mm·1-나 170.5mm
const OVER_2026: Array<[string, string, string[]]> = [
  ["다", fake([8, "가가･가가", 3, 4, 2, 1, 2, 2, 2, 4, 2, 2]), ["지적개선"]],
  ["라", fake([8, 4, 3, 2, 2, 4, 2, 2, 4, 2, 2]), ["신규"]],
  ["가", fake([2, 2, 2, 3, 2, "가가･가가", 4, 2, 1, 3, 2, 2]), ["지적개선", "AI"]],
  ["나", fake([2, "가가･가가가", 2, 4, "가가가･가가가가", 2, "가가･가가가", 2, 2]), ["신규"]],
];

test("subTitleMm: 「표지. 」 + 갈래 칩 + 제목 + 마커 칩 — 칩·마커를 더하면 넓어지고, 표지는 한글 한 자라 무엇이든 같은 폭", () => {
  const base = subTitleMm("가가가", { mark: "가" });
  assert.equal(subTitleMm("가가가", { mark: "다" }), base);
  assert.ok(subTitleMm("가가가", { mark: "가", chip: "고속철도" }) > base);
  assert.ok(subTitleMm("가가가", { mark: "가", markers: ["지적개선"] }) > base + 15, "지적개선 칩 약 17.7mm(실측)");
});

test("subTitleMm ↔ titleMm(판면 어림): 한 줄 폭이 판면 폭 안이면 titleMm도 한 줄, 넘으면 두 줄 이상 — 같은 글 폭 모델이라 모순이 없음", () => {
  const markersSet: string[][] = [[], ["지적개선"], ["지적개선", "AI"], ["BP", "신규"]];
  for (let n = 20; n <= 60; n++) {
    for (const markers of markersSet) {
      const title = fake(Array.from({ length: Math.ceil(n / 4) }, (_, i) => (i === Math.ceil(n / 4) - 1 ? n - 4 * i || 4 : 4)));
      const one = subTitleMm(title, { mark: "가", markers }) <= PAGE_MM.width;
      const lines = Math.round(titleMm(title, markers) / LINE);
      assert.equal(lines === 1, one, `${[...title].length}자 ${markers.join("·")}: ${subTitleMm(title, { mark: "가", markers }).toFixed(1)}mm · titleMm ${lines}줄`);
    }
  }
});

test("subTitleIssues: 2025 가장 긴 제목 꼴은 한 줄(경고 없음), 1-다 꼴은 넘쳐 「제목 폭:」(막힘) — 한도 글자 수와 지금 글자 수를 적음", () => {
  assert.deepEqual(subTitleIssues({ mark: "가", title: LONG_2025, markers: ["지적개선"] }), []);
  assert.deepEqual(subTitleIssues({ mark: "가", title: WIDE_2025, markers: ["신규"] }), []);
  assert.deepEqual(subTitleIssues({ mark: "가", title: AI_2025, markers: ["AI"] }), []);
  for (const [mark, title, markers] of OVER_2026) assert.equal(subTitleIssues({ mark, title, markers }).length, 1, `${mark} ${markers.join("·")} ${subTitleMm(title, { mark, markers }).toFixed(1)}mm`);
  const w = subTitleIssues({ mark: "다", title: BIZ_1DA, markers: ["지적개선", "AI"] });
  assert.equal(w.length, 1);
  assert.match(w[0], /^제목 폭: 소항목 제목 한 줄이 약 \d+mm\(「다\. 」·마커 지적개선·AI 포함\)로 판면 폭 170mm를 넘습니다 — 제목을 한글 \d+자 안\(지금 빈칸 포함 48자\)/);
  assert.equal(warningLevel(w[0]), "block");
  // 갈래 칩이 붙으면 한도가 줄어듦
  assert.ok(subTitleMax({ mark: "다", chip: "고속철도", markers: ["지적개선"] }) < subTitleMax({ mark: "다", markers: ["지적개선"] }));
  assert.ok(subTitleMax({ mark: "다", markers: ["지적개선", "AI"] }) < subTitleMax({ mark: "다" }));
});

// 글 폭 모델 대조(2026-10-28 크롬 실측 — KoPub돋움체 Bold 14pt 「디지털」 36.62pt = 2025 PDF, 한글 한 자 ≈ 0.872em).
// 같은 날 사용자 결정으로 판면 어림의 돋움 한글 폭을 0.745 → 0.872em(fit.ts GLYPH·HANGUL_EM)으로 바꿈
test("글 폭 모델 ↔ 실측: 14pt 돋움 굵게 「디지털」 = 36.62pt(한글 ≈ 0.872em)", () => {
  const pt = textEm("디지털", true) * 14;
  assert.ok(Math.abs(pt - 36.62) / 36.62 < 0.02, `모델 ${pt.toFixed(2)}pt`);
});

const CTX: SectionContext = { business: { no: 1, name: "사업" }, task: { no: "1-1", title: "실행과제" }, mark: "다", markers: ["지적개선", "AI"], module: 1, head: "all" };

test("요청 머리: 소항목 제목 한도를 숫자로(표지·갈래 칩·마커 칩 수에 맞춘 subTitleMax), 자리표시가 남지 않음", () => {
  const p = reportDraftPrompts().prompts;
  const card = { id: "x", taskNo: "1-1", title: "과제" };
  const head = sectionPrompt(p, card, CTX, 2026).split("\n").find((l) => l.startsWith("소항목 제목:"))!;
  assert.equal(head, `소항목 제목: 앱이 앞에 「다. 」, 뒤에 마커 칩을 붙여 판면 폭 170mm 한 줄에 놓습니다 — 제목(title)은 한글 ${subTitleMax(CTX)}자 안(빈칸·숫자·영문은 한글보다 좁음, 2025 소항목 제목은 모두 한 줄)`);
  const chip = sectionPrompt(p, card, { ...CTX, chip: "고속철도" }, 2026);
  assert.match(chip, new RegExp(`앞에 「다\\. \\[고속철도\\] 」[^\\n]*한글 ${subTitleMax({ ...CTX, chip: "고속철도" })}자 안`));
  assert.doesNotMatch(head, /\{\{/);
});

test("고치기 요청(fitPrompt): 제목 폭 문제가 있으면 「제목만 한글 N자 안으로」 절, 없으면 없음", () => {
  const p = reportDraftPrompts().prompts;
  const draft = { title: BIZ_1DA, story: "", blocks: [], results: ["결과"], resultCards: [], caption: "" } as SectionOutput;
  const spec = { sub: { title: BIZ_1DA, markers: CTX.markers }, blocks: [], results: ["결과"], module: 1 };
  const report = fitReport(spec);
  const issues = subTitleIssues({ mark: "다", title: BIZ_1DA, markers: CTX.markers });
  const withTitle = fitPrompt(p, CTX, draft, report, null, [], [], [], [], issues);
  assert.match(withTitle, new RegExp(`제목\\(title\\)만 한글 ${subTitleMax(CTX)}자 안으로 줄여 한 줄로 씀`));
  assert.ok(withTitle.includes(issues[0]));
  assert.doesNotMatch(fitPrompt(p, CTX, draft, report, null), /제목\(title\)만/);
});

test("arrowWithoutSharedNoun: 양쪽이 같은 대상(낱말)을 가리키면 괜찮고, 대상이 다르면 걸림 — 시점·수치 화살표·괄호 안 화살표는 넘김", () => {
  // 걸림: 대상 명사 없이 서로 다른 두 말을 잇는 것(2026-10-28 7-가)
  for (const t of ["사후 확인 → AI 사전예방 전환", "종이 서류 → 전자 문서", "현장 방문 → 온라인 접수 체계"]) assert.equal(arrowWithoutSharedNoun(t), true, t);
  // 괜찮음: 같은 대상(영문·한글 낱말·낱말 조각 공유)
  for (const t of ["고정형 OTA → 이동형 OTA", "수기 검토 → 자동 검토", "방문 신청 → 온라인 신청서 접수", "안테나 판독: 육안 판독 → AI 판독", "전파 측정 3단계 → 5단계 측정"]) assert.equal(arrowWithoutSharedNoun(t), false, t);
  // 넘김: 한쪽이 시점·수치뿐, 괄호 안 화살표, 화살표 없음
  for (const t of ["’25년 → ’26년", "처리 시간(’25 → ’26)", "1대 → 5대", "기지국 에너지 인증제 마련", "판독 정확도 → 93.9%"]) assert.equal(arrowWithoutSharedNoun(t), false, t);
});

test("arrowTitleWarnings: 걸린 블록 제목을 한 줄 「블록 제목:」(참고)으로 — 빈 제목·괜찮은 제목은 안 셈", () => {
  const blocks = [{ title: "" }, { title: "고정형 OTA → 이동형 OTA" }, { title: "사후 확인 → AI 사전예방 전환" }];
  const w = arrowTitleWarnings(blocks);
  assert.equal(w.length, 1);
  assert.match(w[0], /^블록 제목: 「사후 확인 → AI 사전예방 전환」 — 화살표 양쪽에 같은 대상/);
  assert.equal(warningLevel(w[0]), "info");
  assert.deepEqual(arrowTitleWarnings([{ title: "고정형 OTA → 이동형 OTA" }]), []);
});

test("표기 없는 상자: 상자형 도식에 라벨·제목·칸 머리·칩이 모두 없으면 「표기 없는 상자:」(참고) — 하나라도 보이면 괜찮음, 상자형이 아닌 종류는 안 셈", () => {
  const cell = (head = "", tag = "") => ({ head, tag, bullets: ["글"], note: "" });
  const b = (kind: string, over: Record<string, unknown> = {}) => ({ kind, label: "", title: "", layout: undefined, cells: [cell(), cell()], ...over }) as unknown as Parameters<typeof isBareBox>[0];
  // 맨 상자: 수치 띠(큰 수치 head는 표기가 아님)·카드·시기 흐름·협업·인용·정의·띠
  for (const k of ["stats", "cards", "timeline", "hub", "quotes", "define", "band"]) assert.equal(isBareBox(b(k)), true, k);
  assert.equal(isBareBox(b("stats", { cells: [cell("97%"), cell("3만국")] })), true, "수치 띠의 head는 큰 수치");
  // 표기가 하나라도 보임: 사다리 라벨·블록 제목·칸 머리·칩
  assert.equal(isBareBox(b("stats", { label: "핵심 성과" })), false);
  assert.equal(isBareBox(b("stats", { title: "올해 실적" })), false);
  assert.equal(isBareBox(b("stats", { cells: [cell("97%", "정확도"), cell("3만국")] })), false);
  assert.equal(isBareBox(b("cards", { cells: [cell("현장"), cell()] })), false);
  // 전폭 배치(layout full)·전폭 종류의 라벨은 그리지 않으므로 표기가 아님(band는 띠 안 라벨 칸에 그림), quotes·band는 제목을 그리지 않음
  assert.equal(isBareBox(b("cards", { label: "추진내용", layout: "full" })), true);
  assert.equal(isBareBox(b("quotes", { label: "현장 목소리", title: "제목" })), true);
  assert.equal(isBareBox(b("band", { label: "핵심 가치" })), false);
  assert.equal(isBareBox(b("band", { title: "제목" })), true);
  // 상자형이 아닌 종류
  for (const k of ["bullets", "compare", "steps", "table", "qa", "banner"]) assert.equal(isBareBox(b(k)), false, k);
  const w = bareBoxWarnings([b("bullets"), b("stats"), b("cards", { title: "제목" }), b("hub")]);
  assert.equal(w.length, 1);
  assert.match(w[0], /^표기 없는 상자: 2번째 stats·4번째 hub 블록에 라벨·제목·칸 머리·칩이 하나도 없어/);
  assert.equal(warningLevel(w[0]), "info");
  assert.deepEqual(bareBoxWarnings([b("cards", { title: "제목" })]), []);
});
