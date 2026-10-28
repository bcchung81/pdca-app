// 경평 초안 「블록 고치기」(lib/reports/block-edit.ts) 테스트 — 과제원장 드래그 「AI 수정 요청」·「질문」과 같은 쓰임새의 블록 단위 판.

import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { BLOCK_EDIT_LIMITS, type BlockEditRequest, RESULT_INDEX, RESULT_LIMITS, applyBlockEdit, applyResultEdit, blockAskSchema, blockEditPrompt, blockEditSchema, blockRoom, changedTexts, readBlockEditRequest, resultBoxOf, resultEditPrompt, resultEditSchema, resultUndoable, roomText, verifyBlockEdit, verifyResultEdit } from "./block-edit.ts";
import { canonicalJson } from "../cards/fixed.ts";
import { type Block, type BlockOutput } from "./blocks.ts";
import type { ReportSectionSpec } from "./section.ts";
import { reportBlockPrompts } from "../prompts/sets.ts";

const P = reportBlockPrompts().prompts;

// v3 블록 목록(3개: 불릿·전후 비교·카드) — spec.blocks 순번으로 골라 고치는 대상
const block = (b: Partial<Block> & Pick<Block, "kind">): Block => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...b });
const outBlock = (b: Partial<BlockOutput> & Pick<BlockOutput, "kind">): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = []) => ({ head, tag: "", bullets, note: "" });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);

function makeSpec(blocks: Block[], module = 1): ReportSectionSpec {
  return {
    version: 3,
    card: { id: "주요사업1/1-가", taskNo: "1-1", title: "AI 안테나 판독" },
    business: { no: 1, name: "전파품질 향상" },
    task: { no: "1-1", title: "실행과제", bp: false },
    sub: { mark: "가", title: "소항목 제목", markers: [] },
    rows: [],
    results: ["검사 소요시간 절감"],
    caption: "",
    blocks,
    story: "단계 전개형",
    module,
  };
}

const spec3 = makeSpec([
  block({ kind: "bullets", label: "추진배경", items: ["고소 작업 위험 해소 필요"] }),
  block({ kind: "compare", label: "추진내용", variant: "table", rows: [{ key: "판독", before: ["현장 확인"], after: ["AI 판독"] }] }),
  block({ kind: "cards", label: "추진성과", variant: "plain", cells: [cell("a", ["x"]), cell("b", ["y"])] }),
]);

// ---------------------------------------------------------------------------
// readBlockEditRequest

test("readBlockEditRequest: 범위 밖·정수 아닌 blockIndex는 글", () => {
  assert.match(readBlockEditRequest({ blockIndex: -2, kind: "edit", request: "요청" }, spec3) as string, /찾지 못했습니다/, "-1(추진성과) 밖의 음수");
  assert.match(readBlockEditRequest({ blockIndex: 3, kind: "edit", request: "요청" }, spec3) as string, /찾지 못했습니다/, "블록 3개면 0~2만 유효");
  assert.match(readBlockEditRequest({ blockIndex: 1.5, kind: "edit", request: "요청" }, spec3) as string, /찾지 못했습니다/, "정수 아님");
  assert.match(readBlockEditRequest({ blockIndex: "abc", kind: "edit", request: "요청" }, spec3) as string, /찾지 못했습니다/, "숫자 아님");
});

test("readBlockEditRequest: kind가 edit·ask가 아니면 글, 빈 request는 글", () => {
  assert.match(readBlockEditRequest({ blockIndex: 0, kind: "delete", request: "요청" }, spec3) as string, /요청 종류가 올바르지 않습니다/);
  assert.match(readBlockEditRequest({ blockIndex: 0, kind: "edit", request: "" }, spec3) as string, /요청 내용을 적어 주세요/);
  assert.match(readBlockEditRequest({ blockIndex: 0, kind: "edit", request: "   " }, spec3) as string, /요청 내용을 적어 주세요/, "빈칸만 있어도 빈 것으로 봄");
});

test("readBlockEditRequest: request·quote는 상한으로 자르고 앞뒤 빈칸을 걷음", () => {
  const long = " ".repeat(3) + "가".repeat(BLOCK_EDIT_LIMITS.request + 500) + " ".repeat(3);
  const longQuote = " ".repeat(3) + "나".repeat(BLOCK_EDIT_LIMITS.quote + 200) + " ".repeat(3);
  const r = readBlockEditRequest({ blockIndex: 1, kind: "ask", request: long, quote: longQuote }, spec3) as BlockEditRequest;
  assert.equal(r.blockIndex, 1);
  assert.equal(r.kind, "ask");
  assert.equal(r.request.length, BLOCK_EDIT_LIMITS.request);
  assert.equal(r.request, "가".repeat(BLOCK_EDIT_LIMITS.request));
  assert.equal(r.quote.length, BLOCK_EDIT_LIMITS.quote);
  assert.equal(r.quote, "나".repeat(BLOCK_EDIT_LIMITS.quote));
});

test("readBlockEditRequest: 정상 요청은 그대로 정리해 돌려주고, quote 없으면 빈 글", () => {
  const r = readBlockEditRequest({ blockIndex: 0, kind: "edit", request: " 이 문장을 다듬어 주세요 " }, spec3) as BlockEditRequest;
  assert.deepEqual(r, { blockIndex: 0, kind: "edit", request: "이 문장을 다듬어 주세요", quote: "" });
});

// ---------------------------------------------------------------------------
// blockEditPrompt

test("blockEditPrompt: edit·ask 모두 자리표시가 안 남고, 블록 JSON·요청·고른 글·「← 이 블록」 표지가 들어감", () => {
  for (const kind of ["edit", "ask"] as const) {
    const req: BlockEditRequest = { blockIndex: 1, kind, request: "표를 간단히 해 주세요", quote: "현장 확인" };
    const text = blockEditPrompt(P, spec3, req, { card: "카드 글", extra: "첨부 글" });
    assert.doesNotMatch(text, /\{\{/, `${kind}에 자리표시가 남지 않음`);
    assert.match(text, /"kind":"compare"/, "고친 대상 블록 JSON이 들어감");
    assert.match(text, /표를 간단히 해 주세요/, "요청 글");
    assert.match(text, /현장 확인/, "고른 글");
    assert.match(text, /← 이 블록/, "블록 자리 표지");
    assert.match(text, /카드 글/);
    assert.match(text, /첨부 글/);
  }
});

test("blockEditPrompt: 고른 글이 비면 「(고른 글 없음 — 블록 전체)」", () => {
  const req: BlockEditRequest = { blockIndex: 0, kind: "edit", request: "요청", quote: "" };
  const text = blockEditPrompt(P, spec3, req, { card: "", extra: "" });
  assert.match(text, /\(고른 글 없음 — 블록 전체\)/);
});

test("blockEditPrompt: 근거(extra)는 초안과 같이 자르지 않음 — 6만 자 뒤 글도 들어감(참고자료 1단계)", () => {
  const req: BlockEditRequest = { blockIndex: 0, kind: "edit", request: "요청", quote: "" };
  const big = `${"가".repeat(80_000)}끝 숫자 1,234건`;
  const text = blockEditPrompt(P, spec3, req, { card: "", extra: big });
  assert.ok(text.includes(big));
  assert.doesNotMatch(text, /이하 줄임/);
});

// ---------------------------------------------------------------------------
// changedTexts

test("changedTexts: 같은 블록은 0, 한 줄만 바꾸면 1, 줄을 하나 더하면 1", () => {
  const before = block({ kind: "bullets", items: ["가", "나"] });
  assert.equal(changedTexts(before, before), 0);
  const changedOne = block({ kind: "bullets", items: ["가", "다"] });
  assert.equal(changedTexts(before, changedOne), 1);
  const added = block({ kind: "bullets", items: ["가", "나", "다"] });
  assert.equal(changedTexts(before, added), 1);
});

// ---------------------------------------------------------------------------
// verifyBlockEdit

test("verifyBlockEdit: 같은 종류면 ok, 바뀐 칸 수를 셈", () => {
  const before = block({ kind: "bullets", label: "추진배경", items: ["가", "나"] });
  const out = outBlock({ kind: "bullets", label: "추진배경", items: ["가", "다"] });
  const r = verifyBlockEdit(before, out, line, () => true);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.block.kind, "bullets");
    assert.equal(r.changed, 1);
    assert.deepEqual(r.dropped, []);
  }
});

test("verifyBlockEdit: 종류를 바꾸면 ok:false", () => {
  const before = block({ kind: "bullets", label: "추진배경", items: ["가"] });
  const out = outBlock({ kind: "compare", label: "추진배경", rows: [{ key: "k", before: ["b"], after: ["a"] }] });
  const r = verifyBlockEdit(before, out, line, () => true);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /종류를 바꿨습니다\(bullets → compare\)/);
});

test("verifyBlockEdit: 칸이 모자라 cleanBlocks가 버리면 ok:false", () => {
  const before = block({ kind: "cards", label: "추진성과", cells: [cell("a", ["x"]), cell("b", ["y"])] });
  // cards는 cleanBlocks의 enough()가 칸 2개 이상을 요구 — 1개만 주면 버려짐
  const out = outBlock({ kind: "cards", label: "추진성과", cells: [cell("a", ["x"])] });
  const r = verifyBlockEdit(before, out, line, () => true);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /고친 블록을 쓸 수 없습니다\(칸이 모자라거나 형식이 틀림\)/);
});

test("verifyBlockEdit: AI가 라벨을 비우면 원래 라벨을 지킴", () => {
  const before = block({ kind: "bullets", label: "추진배경", items: ["가"] });
  const out = outBlock({ kind: "bullets", label: "", items: ["고친 글"] });
  const r = verifyBlockEdit(before, out, line, () => true);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.block.label, "추진배경");
});

test("verifyBlockEdit: 원문을 못 찾은 인용(quotes)은 빠지고, 블록이 다 빠지면 ok:false", () => {
  const before = block({ kind: "quotes", cells: [cell("장관", ["“원래 인용”"])] });
  const out = outBlock({ kind: "quotes", cells: [cell("장관", ["“지어낸 인용”"])] });
  const found = (q: string) => q === "원래 인용"; // 「지어낸 인용」은 근거에 없음
  const r = verifyBlockEdit(before, out, line, found);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /찾지 못한 인용/);
});

test("verifyBlockEdit: 인용 중 일부만 원문을 찾으면 그것만 남고 changed에 반영", () => {
  const before = block({ kind: "quotes", cells: [cell("장관", ["“원래 인용”"]), cell("차관", ["“다른 인용”"])] });
  const out = outBlock({ kind: "quotes", cells: [cell("장관", ["“원래 인용”"]), cell("차관", ["“지어낸 인용”"])] });
  const found = (q: string) => q === "원래 인용";
  const r = verifyBlockEdit(before, out, line, found);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.block.cells.length, 1, "근거를 못 찾은 인용은 빠짐");
    assert.match(r.dropped[0] ?? "", /찾지 못한 인용/);
  }
});

// ---------------------------------------------------------------------------
// applyBlockEdit

test("applyBlockEdit: 그 순번만 바뀌고 원 spec은 안 바뀜(불변), humanEdits는 정렬·중복 없이 쌓임", () => {
  const newBlock = block({ kind: "bullets", label: "추진배경", items: ["고친 글"] });
  const s1 = applyBlockEdit(spec3, 0, newBlock);
  assert.deepEqual(s1.blocks?.[0], newBlock);
  assert.deepEqual(s1.blocks?.[1], spec3.blocks?.[1], "고치지 않은 블록은 그대로");
  assert.deepEqual(s1.humanEdits, [0]);
  assert.equal(spec3.humanEdits, undefined, "원 spec은 안 바뀜");
  assert.notDeepEqual(spec3.blocks?.[0], newBlock);

  const s2 = applyBlockEdit(s1, 2, block({ kind: "bullets", items: ["새 글"] }));
  assert.deepEqual(s2.humanEdits, [0, 2]);
  const s3 = applyBlockEdit(s2, 0, block({ kind: "bullets", items: ["또 고침"] }));
  assert.deepEqual(s3.humanEdits, [0, 2], "같은 번호를 또 고쳐도 중복 없음");
});

test("applyBlockEdit: 모양이 바뀌어 짝을 잃은 「가로 반씩」 표시는 지우고 원 spec의 블록은 안 바뀜(2026-10-12)", () => {
  const pair = { ...spec3, blocks: [block({ kind: "cards", label: "추진내용", span: "half" }), block({ kind: "steps", label: "추진내용", span: "half" }), ...(spec3.blocks ?? []).slice(2)] };
  const s = applyBlockEdit(pair, 1, block({ kind: "chart", label: "추진내용", span: "half" }));
  assert.equal(s.blocks?.[0]?.span, undefined, "짝이 반 폭이 안 되는 막대가 되면 남은 쪽 반 폭 표시를 지움");
  assert.equal(pair.blocks[0]?.span, "half", "원 spec은 그대로");
});

// ---------------------------------------------------------------------------
// blockRoom · roomText(글 한도 — 코드가 칸 폭으로 셈, AI가 판면을 넘게 키우지 않도록 요청 글에 적음)

test("blockRoom: bullets·cards 블록은 null이 아니고 perLine>0·now≥1·max≥now, 범위 밖 index는 null", () => {
  const bulletsRoom = blockRoom(spec3, 0);
  assert.ok(bulletsRoom);
  if (bulletsRoom) {
    assert.equal(bulletsRoom.unit, "line");
    assert.ok(bulletsRoom.perLine > 0);
    assert.ok(bulletsRoom.now >= 1);
    assert.ok(bulletsRoom.max >= bulletsRoom.now);
  }
  const cardsRoom = blockRoom(spec3, 2);
  assert.ok(cardsRoom);
  if (cardsRoom) {
    assert.equal(cardsRoom.unit, "cell");
    assert.ok(cardsRoom.perLine > 0);
    assert.ok(cardsRoom.now >= 1);
    assert.ok(cardsRoom.max >= cardsRoom.now);
  }
  assert.equal(blockRoom(spec3, spec3.blocks!.length), null, "범위 밖(뒤)");
  assert.equal(blockRoom(spec3, -1), null, "범위 밖(앞)");
});

test("blockRoom: banner·subhead·chart 블록은 null(칸 글이 없는 블록 — 글 한도를 셈하지 않음)", () => {
  assert.equal(blockRoom(makeSpec([block({ kind: "banner", text: "메시지" })]), 0), null);
  assert.equal(blockRoom(makeSpec([block({ kind: "subhead", text: "제목" })]), 0), null);
  assert.equal(blockRoom(makeSpec([block({ kind: "chart", series: [{ label: "’25년", value: "3건" }, { label: "’26년", value: "5건" }] })]), 0), null);
});

test("blockRoom: 판면이 넘친 spec(fitReport total > budget)이면 max === now이고 roomText에 「넘침」", () => {
  const longLine = (n: number) => `이것은 아주 긴 불릿 문장입니다 ${n} 번째 줄로 판면을 크게 넘치게 만듭니다 글자수를 늘려서 여러 줄로 넘어가게 합니다`;
  const bigItems = Array.from({ length: 8 }, (_, i) => longLine(i));
  const overSpec = makeSpec(
    [
      block({ kind: "bullets", label: "추진배경", items: bigItems }),
      block({ kind: "compare", label: "추진내용", variant: "table", rows: Array.from({ length: 4 }, (_, i) => ({ key: `k${i}`, before: [bigItems[0]], after: [bigItems[1]] })) }),
      block({ kind: "cards", label: "추진성과", variant: "plain", cells: Array.from({ length: 4 }, (_, i) => cell(`h${i}`, [bigItems[2], bigItems[3]])) }),
    ],
    0.5,
  );
  const room = blockRoom(overSpec, 0);
  assert.ok(room);
  if (room) {
    assert.ok(room.slack !== null && room.slack < 0, "판면이 넘쳐 여유가 음수");
    assert.equal(room.max, room.now, "넘친 초안은 줄을 늘리지 않음");
    assert.match(roomText(room), /넘침/);
  }
});

test("blockRoom: 판면 여유가 큰 spec(블록 1개)이면 roomText에 「여유」가 있고 max ≥ now", () => {
  const slackSpec = makeSpec([block({ kind: "bullets", label: "추진배경", items: ["짧은 글"] })], 3);
  const room = blockRoom(slackSpec, 0);
  assert.ok(room);
  if (room) {
    assert.ok(room.slack !== null && room.slack > 0, "판면 여유가 큼");
    assert.ok(room.max >= room.now);
    assert.match(roomText(room), /여유/);
  }
});

test("blockRoom: 주요사업 결과는 경영관리 분기(2026-10-12) 전과 같음 — spec3 세 블록의 값·글 고정", () => {
  // 본문 한글 폭 0.916 → 0.936em(2026-10-28 KoPub바탕 실측)으로 한 줄 한글 글자 수가 줄어듦: 전폭 불릿 42 → 41자, 칸 글 15 → 14자·20 → 19자
  assert.deepEqual(blockRoom(spec3, 0), { unit: "line", perLine: 41, now: 1, max: 5, slack: 159 });
  assert.deepEqual(blockRoom(spec3, 1), { unit: "cell", perLine: 14, now: 1, max: 5, slack: 159 });
  // 칸 카드 본문 안 여백 좌우 5px → 3px(2026-10-21 REPORT_STYLE.boxPadX)로 칸 글 폭이 약 1mm 넓어져 19 → 20자(2026-10-28 한글 폭 실측으로 다시 19자)
  assert.deepEqual(blockRoom(spec3, 2), { unit: "cell", perLine: 19, now: 1, max: 5, slack: 159 });
  assert.equal(roomText(blockRoom(spec3, 0)), "한 줄 약 41자 · 지금 불릿 줄 합 1줄 · 판면 여유 159mm — 불릿 줄 합 최대 5줄까지");
  assert.equal(roomText(blockRoom(spec3, 1)), "한 줄 약 14자 · 지금 가장 긴 칸 1줄 · 판면 여유 159mm — 칸마다 최대 5줄까지");
});

test("blockRoom: 경영관리 초안(spec.mg)은 주요사업 1쪽 예산이 아니라 배정 쪽 × 255mm − 경영관리 높이 어림 — 절 여러 개여도 「넘침」이 아님, 배정이 없으면 여유 문구 없이 「지금 줄 수 안팎」", () => {
  const parts = ["가", "나", "다"].map((mark) => ({ key: `1.1.${mark}`, evalNo: 1, evalTitle: "평가내용 1", themeNo: 1, themeTitle: "대주제 1", mark, title: `${mark} 절 제목`, story: "" as const, why: "" }));
  const blocks = parts.flatMap(() => spec3.blocks!);
  const mgSpec = (pages?: number): ReportSectionSpec => ({ ...makeSpec(blocks), results: [], mg: { indicator: "AI 활용 혁신", parts, at: parts.flatMap((p) => [p.key, p.key, p.key]), ...(pages ? { pages } : {}) } });
  // 예전(주요사업 셈): 블록 9개 + 머리를 1쪽(255mm)에 대 늘 넘침
  const withPages = blockRoom(mgSpec(2), 0);
  assert.ok(withPages && withPages.slack !== null && withPages.slack > 0, "2쪽 배정이면 여유가 있음");
  assert.doesNotMatch(roomText(withPages), /넘침/);
  assert.match(roomText(withPages), /판면 여유 \d+mm/);
  const none = blockRoom(mgSpec(), 0);
  assert.equal(none?.slack, null);
  assert.equal(none?.max, none?.now, "여유를 모르면 늘리지 않음");
  assert.equal(roomText(none), "한 줄 약 41자 · 지금 불릿 줄 합 1줄 — 지금 줄 수 안팎");
  // 배정보다 크게 넘친 경영관리 초안은 그 배정 기준으로 넘침
  assert.match(roomText(blockRoom(mgSpec(0.5), 0)), /넘침/);
});

test("roomText(null): 「한도 없음」을 포함", () => {
  assert.match(roomText(null), /한도 없음/);
});

test("blockEditPrompt 결과에 「글 한도」가 들어감(edit·ask 모두)", () => {
  for (const kind of ["edit", "ask"] as const) {
    const req: BlockEditRequest = { blockIndex: 0, kind, request: "요청", quote: "" };
    const text = blockEditPrompt(P, spec3, req, { card: "", extra: "" });
    assert.match(text, /글 한도/, kind);
  }
});

// ---------------------------------------------------------------------------
// blockEditSchema · blockAskSchema

const validOutBlock = outBlock({ kind: "bullets", items: ["가"] });

test("blockEditSchema(): 올바른 값은 통과, block·reply가 없으면 실패", () => {
  const schema = blockEditSchema();
  assert.ok(schema.safeParse({ block: validOutBlock, reply: "고쳤습니다" }).success);
  assert.equal(schema.safeParse({ block: validOutBlock }).success, false, "reply 없음");
  assert.equal(schema.safeParse({ reply: "고쳤습니다" }).success, false, "block 없음");
  assert.equal(schema.safeParse({ block: { ...validOutBlock, kind: "모르는종류" }, reply: "x" }).success, false, "kind가 목록 밖");
});

test("blockAskSchema(): 올바른 값은 통과, answer가 없거나 타입이 다르면 실패", () => {
  const schema = blockAskSchema();
  assert.ok(schema.safeParse({ answer: "답" }).success);
  assert.equal(schema.safeParse({}).success, false);
  assert.equal(schema.safeParse({ answer: 123 }).success, false);
});

// ---------------------------------------------------------------------------
// 추진성과 상자 고치기(2026-10-13 — 대상 번호 RESULT_INDEX)

test("readBlockEditRequest 추진성과(-1): 주요사업 v3이고 상자에 글이 있을 때만, 경영관리·빈 상자는 「찾지 못했습니다」", () => {
  const r = readBlockEditRequest({ blockIndex: RESULT_INDEX, kind: "edit", request: "다듬기", quote: "소요시간" }, spec3) as BlockEditRequest;
  assert.equal(r.blockIndex, -1);
  assert.equal(r.kind, "edit");
  assert.equal((readBlockEditRequest({ blockIndex: -1, kind: "ask", request: "질문" }, spec3) as BlockEditRequest).kind, "ask");
  const empty = { ...spec3, results: [] };
  assert.match(readBlockEditRequest({ blockIndex: -1, kind: "edit", request: "요청" }, empty) as string, /찾지 못했습니다/, "빈 상자");
  assert.equal((readBlockEditRequest({ blockIndex: -1, kind: "edit", request: "요청" }, { ...empty, resultBand: "50% 단축!" }) as BlockEditRequest).blockIndex, -1, "띠만 있어도 상자");
  assert.equal((readBlockEditRequest({ blockIndex: -1, kind: "ask", request: "요청" }, { ...empty, resultCards: [{ tag: "", headline: "a", figure: "1" }] }) as BlockEditRequest).blockIndex, -1, "3칸만 있어도 상자");
  const mg = { ...spec3, mg: { parts: [], at: ["1.1.0", "1.1.0", "1.1.0"] } } as unknown as ReportSectionSpec;
  assert.match(readBlockEditRequest({ blockIndex: -1, kind: "edit", request: "요청" }, mg) as string, /찾지 못했습니다/, "경영관리 초안은 추진성과 상자가 없음");
});

test("resultEditPrompt: 고치기는 result 절·질문은 resultAsk 절 + 근거, 지금 추진성과 JSON(카드·막대 포함)·줄 상한·띠 유무를 적고 자리표시가 남지 않음", () => {
  const spec = { ...spec3, results: ["검사 소요시간 50% 절감", "【확인: ’26년 실적】"], resultBand: "50% 단축!", resultCards: [{ tag: "효율", headline: "소요시간", figure: "50%" }] };
  const req: BlockEditRequest = { blockIndex: -1, kind: "edit", request: "수치 표현을 다듬어 주세요", quote: "소요시간" };
  const edit = resultEditPrompt(P, spec, req, { card: "카드 글", extra: "" });
  assert.match(edit, /이번 요청 — 추진성과 고치기/);
  assert.ok(edit.includes(JSON.stringify(spec.results)), "추진성과 줄 JSON");
  assert.ok(edit.includes('"resultCards":[{"tag":"효율"'), "3칸도 보여 줌");
  assert.match(edit, new RegExp(`${RESULT_LIMITS.lines}줄까지`));
  assert.match(edit, /있음\(「50% 단축!」/);
  assert.match(edit, /【확인: …】 자리표시는 지우지 않/);
  assert.match(edit, /수치 표현을 다듬어 주세요/);
  assert.match(edit, /카드 글/);
  assert.doesNotMatch(edit, /\{\{\w+\}\}/);
  const ask = resultEditPrompt(P, { ...spec3 }, { ...req, kind: "ask", quote: "" }, { card: "카드 글", extra: "첨부" });
  assert.match(ask, /이번 요청 — 질문/);
  assert.match(ask, /없음 — 새로 만들지 않음/, "띠가 없으면 없다고");
  assert.match(ask, /고른 글 없음/);
  assert.doesNotMatch(ask, /\{\{\w+\}\}/);
});

test("verifyResultEdit: 줄은 3줄·줄당 200자까지(빈 줄 버림), 0줄이면 거절, 바뀐 글 수", () => {
  const before = { results: ["가", "나"], resultBand: "" };
  const r = verifyResultEdit(before, { results: ["가", " ", "다", "라", "마"], band: "", reply: "" }, line);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.box.results, ["가", "다", "라"], "빈 줄을 버리고 3줄까지");
  assert.equal(r.changed, 2, "새 글 다·라");
  assert.match(r.dropped.join(" "), /3줄까지라 뒤 1줄/);
  const long = verifyResultEdit(before, { results: ["가".repeat(250)], band: "", reply: "" }, line);
  assert.ok(long.ok && long.box.results[0].length === RESULT_LIMITS.line);
  const none = verifyResultEdit(before, { results: ["", "  "], band: "", reply: "" }, line);
  assert.ok(!none.ok && /비었습니다/.test(none.message));
  const bad = verifyResultEdit(before, { results: "글" as unknown as string[], band: "", reply: "" }, line);
  assert.ok(!bad.ok, "배열이 아니면 거절");
  const same = verifyResultEdit(before, { results: ["가", "나"], band: "", reply: "" }, line);
  assert.ok(same.ok && same.changed === 0 && canonicalJson(same.box) === canonicalJson(before), "그대로면 바뀐 글 0");
});

test("verifyResultEdit: 강조 띠는 원래 있을 때만 고친 글(24자), 비우면 원래 띠, 없던 띠는 만들지 않음", () => {
  const withBand = { results: ["가"], resultBand: "50% 단축!" };
  const a = verifyResultEdit(withBand, { results: ["가"], band: "소요시간 50% 단축!", reply: "" }, line);
  assert.ok(a.ok && a.box.resultBand === "소요시간 50% 단축!" && a.changed === 1);
  const b = verifyResultEdit(withBand, { results: ["가"], band: "", reply: "" }, line);
  assert.ok(b.ok && b.box.resultBand === "50% 단축!", "비우면 원래 띠");
  const c = verifyResultEdit(withBand, { results: ["가"], band: "가".repeat(40), reply: "" }, line);
  assert.ok(c.ok && c.box.resultBand.length === RESULT_LIMITS.band);
  const d = verifyResultEdit({ results: ["가"], resultBand: "" }, { results: ["가"], band: "새 띠 30%!", reply: "" }, line);
  assert.ok(d.ok && d.box.resultBand === "" && d.changed === 0);
  assert.match(d.dropped.join(" "), /없던 강조 띠는 만들지 않습니다/);
});

test("applyResultEdit: 추진성과 줄·띠만 바꾸고 3칸·막대·블록·humanEdits는 그대로, 띠가 비면 칸을 지움", () => {
  const spec = { ...spec3, resultBand: "50% 단축!", resultCards: [{ tag: "", headline: "h", figure: "1" }], resultChart: { title: "t", series: [{ label: "’25년", value: "1" }, { label: "’26년", value: "2" }], badge: "" }, humanEdits: [1] };
  const next = applyResultEdit(spec, { results: ["새 줄"], resultBand: "60% 단축!" });
  assert.deepEqual(next.results, ["새 줄"]);
  assert.equal(next.resultBand, "60% 단축!");
  assert.deepEqual(next.resultCards, spec.resultCards);
  assert.deepEqual(next.resultChart, spec.resultChart);
  assert.deepEqual(next.blocks, spec.blocks);
  assert.deepEqual(next.humanEdits, [1]);
  const noBand = applyResultEdit(spec, { results: ["새 줄"], resultBand: "" });
  assert.equal("resultBand" in noBand, false);
  assert.deepEqual(resultBoxOf(noBand), { results: ["새 줄"], resultBand: "" });
});

test("resultUndoable: 지금 추진성과 칸 = 그 고치기의 after일 때만(키 순서 무관), 그 뒤 또 바뀌었으면 아님", () => {
  const after = { results: ["새 줄"], resultBand: "" };
  const spec = applyResultEdit(spec3, after);
  assert.equal(resultUndoable(spec, { resultBand: "", results: ["새 줄"] }), true, "jsonb 키 순서가 달라도");
  assert.equal(resultUndoable(applyResultEdit(spec, { results: ["또 고침"], resultBand: "" }), after), false);
  assert.equal(resultUndoable(spec, null), false);
  // 되돌리면 고치기 전 칸
  assert.deepEqual(resultBoxOf(applyResultEdit(spec, resultBoxOf(spec3))), resultBoxOf(spec3));
});

test("resultEditSchema: results·band·reply(한 값 enum·literal 없음), schema.md 설명", () => {
  const json = z.toJSONSchema(resultEditSchema(P.schema)) as { properties: Record<string, { description?: string; enum?: unknown; const?: unknown; type?: string }> };
  assert.deepEqual(Object.keys(json.properties).sort(), ["band", "reply", "results"]);
  assert.equal(json.properties.results.description, P.schema.results);
  assert.equal(json.properties.band.description, P.schema.band);
  assert.equal(json.properties.reply.description, P.schema.reply);
  for (const v of Object.values(json.properties)) assert.ok(v.enum === undefined && v.const === undefined);
  assert.equal(RESULT_INDEX, -1);
});
