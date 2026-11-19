// 외부 컨설팅 의견 파서 시험 — 표 모양만 본뜬 가상 자료입니다(실제 기관 의견·이름 아님). 실제 파일 시험은 원본 산출물이 이 컴퓨터에 있을 때만 돕니다(resources/knowledge는 git 밖).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { layerOf } from "../bundle.ts";
import { cellText } from "../normalize.ts";
import { CONSULT_NOTE, whereWithNote } from "../revision-note.ts";
import type { SourceBlock } from "../source.ts";
import { loadKordocChunks } from "../source.ts";
import { parseHtmlTables } from "../table.ts";
import { CONFIRMED_BASIS, CONSULT_MG_EXPECTED, CONSULT_R1_CONFIRMED, CONSULT_R1_SPLIT, SEPT_BASIS, SPLIT_BASIS, matchCurrentCard, parseConsultMg, readConsultSheets } from "./consult-mg.ts";

const block = (text: string, page = 1): SourceBlock => ({ id: "c", type: "text", text, page, breadcrumb: [] });
/** 담당자 칸에 넣는 가상 이름 — 조각 어디에도 나오면 안 됨 */
const PEOPLE = ["가상관리자갑", "가상작성자을"];
const row = (dept: string, team: string, no: string, name: string, body: string, status = "") =>
  `<tr><td></td><td>${dept}</td><td>${team}</td><td>${no}</td><td>${name}</td><td>${body}</td><td>${status}</td><td>${PEOPLE[0]}</td><td>${PEOPLE[1]}</td></tr>`;
const sheet = (title: string, rows: string[]) =>
  `<table>\n<tr><th></th><th colspan="6">&lt; 가상 컨설팅 의견 &gt;</th><th></th><th></th></tr>\n<tr><td></td><td>부서</td><td>팀</td><td>과제번호</td><td>추진과제명</td><td>과제관리카드 보완사항</td><td>이행여부(미이행시사유)</td><td>관리자</td><td>작성자</td></tr>\n${rows.join("\n")}\n</table>`.replace("가상 컨설팅 의견", title);

/** 1차: 같은 이름(1-1) · 번호가 바뀐 이름(7-2 → 지금 7-3) · 품는 이름(7-3 → 지금 7-4) · 둘로 나뉜 과제(7-1) · 이름이 바뀐 과제(8-1) */
const SAMPLE: SourceBlock[] = [
  block("## 1차 컨설팅(9.7\\~8)"),
  block(
    sheet("1차", [
      row("가본부", "가팀", "전략기획 1-1", "가상 전략 과제", "▶ 첫 의견<br>▶ 둘째 의견은<br>두 줄"),
      row("나본부", "나팀", "상생·협력 및 지역발전 7-1", "가상 상생 및 공정 과제", "▶ 상생 의견"),
      row("나본부", "나팀", "상생·협력 및 지역발전 7-2", "가상 소상공인 지원", "▶ 소상공인 의견"),
      row("나본부", "나팀", "상생·협력 및 지역발전 7-3", "가상 장학금·멘토링", "▶ 장학 의견", "1"),
      row("다본부", "다팀", "재무예산관리 8-1", "가상 재무 안정 유지", "▶ 재무 의견"),
    ]),
  ),
  block("## 2차 컨설팅(11.11\\~12)", 2),
  block(
    sheet("2차", [
      row("가본부", "가팀", "전략기획 1-1", "가상 전략 과제", "▶ (완료 실적) 이사회 의결 3건<br>▶ (지표) 산식 정리"),
      row("나본부", "나팀", "상생·협력 및 지역발전 7-1", "가상 상생 기반", "▶ 상생 기반 의견"),
      row("나본부", "나팀", "상생·협력 및 지역발전 7-2", "가상 공정 거래", "▶ 공정 의견"),
      row("나본부", "나팀", "상생·협력 및 지역발전 7-3", "가상 소상공인 지원", "▶ 소상공인 2차"),
      row("나본부", "나팀", "상생·협력 및 지역발전 7-4", "가상 장학금·멘토링 지원", "▶ 장학 2차"),
      row("다본부<br>라본부", "다팀<br>라팀", "재무예산관리 8-1", "가상 재무 안정 강화", "▶ 재무 2차"),
    ]),
    2,
  ),
  block("## 데이터 차트", 3),
  block("| 행 레이블 | 개수 |\n| --- | --- |\n| 가본부 | 1 |", 3),
];

test("시트 두 개만 읽고(데이터 차트는 뺌), 이행여부 열까지만 — 담당자 칸 글은 행 어디에도 없음", () => {
  const rows = readConsultSheets(SAMPLE);
  assert.deepEqual(rows.map((r) => `${r.round}:${r.no}`), ["1:1-1", "1:7-1", "1:7-2", "1:7-3", "1:8-1", "2:1-1", "2:7-1", "2:7-2", "2:7-3", "2:7-4", "2:8-1"]);
  for (const p of PEOPLE) assert.ok(!JSON.stringify(rows).includes(p), "담당자 칸을 읽지 않음");
  assert.deepEqual(rows[0].opinions, ["▶ 첫 의견", "▶ 둘째 의견은 두 줄"], "의견 안 줄바꿈은 한 칸으로, 의견마다 「▶ 」");
  assert.deepEqual(rows[10].dept, ["다본부", "라본부"]);
  assert.equal(rows[3].status, "1");
});

test("1차 과제 대응: 같은 이름 → 그 번호, 한 이름이 다른 이름을 품으면 하나뿐일 때만, 없거나 둘 이상이면 맞추지 않음(번호로 짐작 안 함)", () => {
  const cur = [
    { indicator: 7, no: "7-1", name: "가상 상생 기반" },
    { indicator: 7, no: "7-2", name: "가상 공정 거래" },
    { indicator: 7, no: "7-3", name: "가상 소상공인 지원" },
    { indicator: 7, no: "7-4", name: "가상 장학금·멘토링 지원" },
    { indicator: 8, no: "8-1", name: "가상 재무 안정 강화" },
  ];
  assert.deepEqual(matchCurrentCard({ indicator: 7, name: "가상 소상공인 지원" }, cur), { no: "7-3", how: "same" });
  assert.deepEqual(matchCurrentCard({ indicator: 7, name: "가상 장학금·멘토링" }, cur), { no: "7-4", how: "contains" });
  assert.deepEqual(matchCurrentCard({ indicator: 8, name: "가상 재무 안정 유지" }, cur), { no: null, why: "없음", candidates: [] }, "번호가 같아도 이름이 다르면 맞추지 않음");
  assert.deepEqual(matchCurrentCard({ indicator: 7, name: "가상" }, cur), { no: null, why: "둘 이상", candidates: ["7-1", "7-2", "7-3", "7-4"] });
  assert.equal(matchCurrentCard({ indicator: 1, name: "가상 소상공인 지원" }, cur).no, null, "다른 지표 카드와는 맞추지 않음");
});

test("조각: 카드 1장 × 차수 1개, 경영관리 지표 단위, 머리에 차수·과제번호(지금 번호, 바뀌었으면 9월 번호도)·과제명, 의견 1개 = 인용 단위 1개, 지금 카드는 늘 목록(card_ids)", () => {
  const { chunks } = parseConsultMg(SAMPLE);
  assert.equal(chunks.length, 11);
  const by = (k: string) => chunks.find((c) => c.chunk_key === `consult26-mg/${k}`)!;
  const now = by("r2/1-1");
  assert.equal(now.unit_type, "consult_comment");
  assert.equal(now.track, "경영관리");
  assert.equal(now.business, "MG-1");
  assert.equal(now.context_prefix, "외부 컨설팅 2차('26.11.11~12) · 전략기획 1-1 가상 전략 과제");
  assert.deepEqual(now.blocks, ["▶ (완료 실적) 이사회 의결 3건", "▶ (지표) 산식 정리"]);
  assert.deepEqual(now.meta, { round: 2, period: "'26.11.11~12", task_nos: ["1-1"], task_no_sheet: "1-1", task_name: "가상 전략 과제", card_ids: ["경영관리1/1-1"], opinions: 2, dept: ["가본부"], team: ["가팀"], page_basis: "xlsx-sheet" });
  const moved = by("r1/7-2");
  assert.equal(moved.context_prefix, "외부 컨설팅 1차('26.9.7~8) · 상생·협력 및 지역발전 7-3(9월 카드 7-2) 가상 소상공인 지원");
  assert.deepEqual(moved.meta.card_ids, ["경영관리7/7-3"]);
  assert.equal(by("r1/7-3").meta.name_match, "contains");
  assert.equal(by("r1/7-3").meta.status_cell, "1");
  // 9월 7-1은 지금 7-1·7-2로 나뉨 — 두 카드 모두의 의견(기본 나뉜 과제 표, 2026-11-20)
  const split = by("r1/7-1");
  assert.deepEqual(split.meta.card_ids, ["경영관리7/7-1", "경영관리7/7-2"]);
  assert.deepEqual(split.meta.task_nos, ["7-1", "7-2"]);
  assert.equal(split.meta.card_basis, SPLIT_BASIS);
  assert.equal(split.context_prefix, "외부 컨설팅 1차('26.9.7~8) · 상생·협력 및 지역발전 7-1·7-2(9월 카드 7-1 — 지금 카드 2개로 나뉨) 가상 상생 및 공정 과제");
  assert.deepEqual(by("r1/8-1").meta.task_nos, ["8-1"], "기본 확정 표(8-1 → 8-1)로 맞춤");
  for (const p of PEOPLE) assert.ok(!JSON.stringify(chunks).includes(p), "담당자 이름이 조각에 없음");
});

test("확정 표·나뉜 과제 표: 과제명으로 못 맞춘 1차 과제만 표대로 지금 카드(들)에 맞추고(이름으로 맞춘 것은 표보다 앞), 표에 없으면 9월 카드 기준·빈 목록, 대상 카드가 없으면 검산 실패", () => {
  assert.deepEqual(CONSULT_R1_CONFIRMED, { "8-1": "8-1", "8-2": "8-2", "13-1": "13-1", "13-2": "13-2", "13-3": "13-3" }, "사용자 확정(2026-11-19) — 7-1은 없음");
  assert.deepEqual(CONSULT_R1_SPLIT, { "7-1": ["7-1", "7-2"] }, "사용자 확정(2026-11-20) — 9월 7-1은 지금 7-1·7-2 둘 다");
  const on = parseConsultMg(SAMPLE, "consult26-mg", { "8-1": "8-1", "7-2": "7-1" });
  const by = (k: string) => on.chunks.find((c) => c.chunk_key === `consult26-mg/${k}`)!;
  assert.deepEqual(by("r1/8-1").meta.card_ids, ["경영관리8/8-1"]);
  assert.equal(by("r1/8-1").meta.card_basis, CONFIRMED_BASIS);
  assert.equal(by("r1/8-1").context_prefix, "외부 컨설팅 1차('26.9.7~8) · 재무예산관리 8-1 가상 재무 안정 유지");
  assert.deepEqual(by("r1/7-2").meta.task_nos, ["7-3"], "이름으로 맞춘 것은 표를 안 봄");
  assert.equal(by("r1/7-1").meta.card_basis, SPLIT_BASIS);
  assert.deepEqual(on.extras, { renumbered: { "7-2": "7-3", "7-3": "7-4" }, confirmed: ["8-1"], split: ["7-1"], unmatched: [] });
  // 두 표가 모두 비면 못 맞춘 과제는 9월 카드 기준·빈 목록(어느 카드 요청에도 안 들어감 — 범위 검산이 막음)
  const off = parseConsultMg(SAMPLE, "consult26-mg", {}, {});
  const offBy = (k: string) => off.chunks.find((c) => c.chunk_key === `consult26-mg/${k}`)!;
  assert.equal(offBy("r1/8-1").meta.card_basis, SEPT_BASIS);
  assert.deepEqual(offBy("r1/7-1").meta.card_ids, []);
  assert.match(offBy("r1/7-1").context_prefix, /7-1\(9월 카드 기준 번호 — 지금 카드와 못 맞춤\)/);
  assert.deepEqual((off.extras?.unmatched as Array<{ no: string }>).map((u) => u.no), ["7-1", "8-1"]);
  const name = "외부 컨설팅 1차 확정 표·나뉜 과제 표의 대상 카드가 2차 시트(같은 지표)에 있음";
  const bad = parseConsultMg(SAMPLE, "consult26-mg", { "8-1": "8-9" });
  assert.equal(bad.checks.find((c) => c.name === name)!.ok, false);
  assert.deepEqual(bad.chunks.find((c) => c.chunk_key === "consult26-mg/r1/8-1")!.meta.card_ids, []);
  const badSplit = parseConsultMg(SAMPLE, "consult26-mg", CONSULT_R1_CONFIRMED, { "7-1": ["7-1", "7-9"] });
  assert.equal(badSplit.checks.find((c) => c.name === name)!.ok, false, "나뉜 카드 하나라도 없으면 실패");
  assert.deepEqual(badSplit.chunks.find((c) => c.chunk_key === "consult26-mg/r1/7-1")!.meta.card_ids, []);
});

test("요청 때 위치 글에 「근거 아님」 표지가 붙고, 공유 층(①②③)에는 어느 목적·지표에도 안 들어감 — 그 카드의 덩이로만(bundle.ts consult, consult-paths.test.ts)", () => {
  const c = parseConsultMg(SAMPLE).chunks[0];
  assert.equal(whereWithNote(c), `외부 컨설팅 1차('26.9.7~8) · 전략기획 1-1 가상 전략 과제 · ※ ${CONSULT_NOTE}`);
  assert.match(CONSULT_NOTE, /사실·숫자의 근거가 아님/);
  for (const unit of ["MG-1", "MG-2", "BZ-1"]) for (const p of ["card", "report"] as const) assert.equal(layerOf(c, unit, p), null, `${unit} ${p}`);
});

test("검산: 기대값과 다르면 실패로 남음(가상 자료는 카드·의견 수가 실제와 달라 실패)", () => {
  const { checks } = parseConsultMg(SAMPLE);
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  assert.ok(failed.includes("외부 컨설팅 1차 카드 수") && failed.includes("외부 컨설팅 2차 의견(▶) 수"));
  assert.ok(!failed.includes("외부 컨설팅 의견 글 손실 없음(「▶」·줄 나눔만 정리)"));
});

test("모양이 다르면 멈춤: 시트가 없거나 머리가 다르면 던짐", () => {
  assert.throws(() => parseConsultMg(SAMPLE.slice(0, 2)), /2차 컨설팅/);
  const bad = SAMPLE.map((b) => ({ ...b, text: b.text.replace("과제관리카드 보완사항", "비고") }));
  assert.throws(() => parseConsultMg(bad), /표 머리가 예상과 다릅니다/);
});

// ---------------------------------------------------------------------------
// 실제 파일(원본 산출물이 이 컴퓨터에 있을 때만)
const PARSED = join(import.meta.dirname, "../../../resources/knowledge/_parsed/consult26-mg.chunks.json");
const HAVE = existsSync(PARSED);

test("실제 파일: 검산 전부 통과(카드 44·47, 의견 108·266, 1차 대응), 조각에 담당자 실명 0건", { skip: !HAVE && "resources/knowledge/_parsed/consult26-mg.chunks.json이 없음" }, () => {
  const blocks = loadKordocChunks(JSON.parse(readFileSync(PARSED, "utf8")));
  const { chunks, checks } = parseConsultMg(blocks);
  const bad = checks.filter((c) => c.level === "error" && !c.ok);
  assert.deepEqual(bad, []);
  assert.equal(chunks.filter((c) => c.meta.round === 1).length, CONSULT_MG_EXPECTED.cards[1]);
  assert.equal(chunks.filter((c) => c.meta.round === 2).length, CONSULT_MG_EXPECTED.cards[2]);
  assert.ok(chunks.every((c) => c.track === "경영관리" && /^MG-(?:[1-9]|1[0-4])$/.test(String(c.business))));
  // 모든 조각이 지금 카드를 1개 이상 가리키고(9월 7-1만 7-1·7-2 둘), 카드 id는 그 지표 묶음
  const cardIds = (c: (typeof chunks)[number]) => c.meta.card_ids as string[];
  assert.ok(chunks.every((c) => Array.isArray(cardIds(c)) && cardIds(c).length > 0 && cardIds(c).every((id) => id.startsWith(`경영관리${String(c.business).slice(3)}/`))));
  assert.deepEqual(chunks.filter((c) => cardIds(c).length > 1).map((c) => [c.chunk_key, cardIds(c)]), [["consult26-mg/r1/7-1", ["경영관리7/7-1", "경영관리7/7-2"]]]);
  // 담당자 칸(관리자·작성자 머리 아래) 글은 비교에만 쓰고 시험·출력 어디에도 적지 않음
  const people = new Set<string>();
  for (const b of blocks)
    for (const t of parseHtmlTables(b.text)) {
      const head = t.rows.findIndex((r) => r.cells.some((c) => cellText(c.html) === "관리자"));
      if (head < 0) continue;
      const at = t.rows[head].cells.findIndex((c) => cellText(c.html) === "관리자");
      for (const r of t.rows.slice(head + 1)) for (const c of r.cells.slice(at, at + 2)) for (const n of cellText(c.html, "\n").split(/[\n,·/ ]+/)) if (n.trim().length >= 2) people.add(n.trim());
    }
  assert.ok(people.size > 0, "담당자 칸을 찾음");
  const all = JSON.stringify(chunks);
  assert.equal([...people].filter((n) => all.includes(n)).length, 0, "조각에 담당자 이름이 없음");
});
