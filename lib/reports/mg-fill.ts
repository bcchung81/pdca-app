// 경영관리 경평 초안 「분량 채움 보강」(판정·고르기·검증은 순수, AI 호출은 주입 — 2026-10-29 사용자 승인).
// 예전(2026-10-12 결정 「경영관리는 판면 맞추기·자동 고치기 없음 — 경고까지만」): 집필이 한 번 쓰고 끝나 분량(어림 높이)이 배정의 −31~−52%로 모자라고
// 나란한 칸의 빈 곳(fit.ts hollowBoxes)·안 쓴 원장 성과가 남았음. 사용자 요구 「경평보고서의 모든 내용은 여백이 없도록 꽉 채워서 1개의 성과라도 더」
// (docs/plan/경평초안-요구사항-메타프롬프트.md R5·R6, 개선 방향 3)로 집필 검증(mg-draft.ts verifyMgDraft) 뒤, 고른 블록만 블록 고치기 경로로 다시 씀.
// 2026-10-29 오후 「초안에는 r6처럼 내용이 많은 게 나아, 수작업으로 수정하는 안이 있더라도」 — 라운드 최대 2회·블록 수 상한 없음·블록 몫까지 늘림·반복 수치를 안 쓴 원장 사실로 바꿈.
//  0. 빠진 구성안 블록 되살리기(missingBlocks → runMgFill 맨 앞, 2026-10-29): 집필이 구성안 블록을 통째로 빠뜨리면(6-2 r3·r5·r6s·r8b 「N블록 중 N−1블록」 — r8b는 데이터 블록)
//     구성안의 라벨·모양·칸 수로 빈 모양을 구성안 자리에 끼워 fill.missing 요청으로 채움 — 받기 조건(acceptMissing)을 넘으면 넣고, 아니면 빈 모양을 빼 원래 초안 그대로. 데이터 블록 먼저(S2).
//     되살린 뒤 1~3의 사유를 다시 잼(블록 번호가 바뀌므로 되살리기를 라운드 앞에 다 끝냄). 성공하면 「구성안: N블록 중 M블록」 경고를 다시 셈(mgFillPatch)
//  1. 판정(mgFillReasons): ① 분량 부족(어림 < 배정 × MG_FILL.low) ② 빈 칸(hollowBoxes) ③ 수치가 초안 어디에도 없는 원장 성과 줄
//     ④ 반복 수치(repeat-figures.ts repeatedFigures의 경영관리 기준 — 블록 3개 이상 또는 절 2개 이상, 수치마다 남길 자리 하나 — repeatsOf)
//     ⑤ 반복 문장(repeat-figures.ts repeatedSentences — 「반복 문장」 경고·화면 하이라이트와 같은 쌍, 쌍마다 남길 자리 하나 — sentencesOf, 2026-10-29 S7) — 하나도 없으면 보강 안 함
//  2. 고르기(pickFillTargets): 빈 칸 블록(모자란 줄 많은 순) → 반복 수치를 뺄 블록(블록 순) → 반복 문장을 바꿀 블록(블록 순) → 분량이 모자란 절의 칸 글 블록(절 몫보다 많이 모자란 절 먼저, 절 안은 블록 순) — 보강할 수 있는 블록 전부.
//     막대·띠·소제목·인용·말풍선·추진성과 원장 보강 블록은 뺌. 블록 몫(mm) = 남은 분량(배정 − 어림) ÷ 고른 블록 수
//  3. 다시 쓰기(runMgFill): 요청 글은 코드가 resources/prompts/report-block-mg/request.md fill.* 조각으로 만들고(사람 글 아님 — 늘릴 mm·줄·불릿 수와 뺄 반복 수치를 코드가 셈)
//     block-edit.ts blockEditPrompt(글 한도 = 블록 몫 — 「지금 줄 + 4줄」 상한 없음)로 보냄. 답은 블록 고치기 검증(verifyBlockEdit — 같은 종류·원문 대조)에 더해 같은 모양·칸 수,
//     새 근거 밖 숫자 없음, 높이가 줄지 않고 분량 상한(배정 × (1 + MG_VOLUME_BAND)) 안일 때만 받음 — 반복 수치·문장을 하나도 못 고쳤으면 분량이 늘었을 때만 받음, 못 받은 블록은 그 전 글 그대로.
//     라운드: 1회차 뒤 다시 재서 아직 배정 × MG_FILL.low 미만이면 2회차(MG_FILL.rounds) — 보강할 수 있는 블록 전부를 다시 고름(1회차에 몫을 다 쓴 블록·못 받은 블록도, 몫은 남은 분량을 다시 나눔).
//     멈춤: 블록마다 시작 전 기한(canFixAgain — Vercel fixDeadlineMs, 로컬은 MG_FILL.maxSec), 호출 한도(startAiRequest 거절)면 그 라운드를 끝냄(기다리지 않음)
//  4. 저장(saveFirstThenFill): 1차 초안 먼저 저장 → 보강 → 1차 저장의 updated_at 조건으로만 갱신(그 사이 사람이 고쳤으면 덮지 않고 건너뜀)
// 2026-10-29 저녁(6-2 r9·r9b 흔들림 — 분량 88%·보강이 만든 반복 문장 5쌍·빠진 데이터 블록): ③ 보탤 사실에 연결 근거 조각(relevantRefs)의 문장·표 행을 더하고(linkedFacts — 사유는 아님, 재료만),
//   블록 몫은 MG_FILL.shareMin 이상이 되는 최소 개수에 모으고(줄 수 적은 블록 먼저), 요청 글에 다른 블록의 수치·문장(되풀이 금지)을 주고, 새 반복을 만드는 판은 받지 않고,
//   보강 뒤 반복이 남으면 「반복 정리」 한 라운드, 빠진 데이터 블록은 그 절의 짝 없는 블록에 재료 값이 없을 때 되살림(missingSlot)
// 2026-10-30 값 충돌(mg-consistency.ts): ⑥ 버린 값(spec.mg.conflicts의 쓰지 않을 값)이 남은 블록도 고칠 대상(반복 수치와 같은 방식 — fill.conflict 요청, 받은 뒤 남으면 kept로 보고),
//   보탤 사실(원장·연결 근거)에서 버린 값을 쓴 줄은 뺌, 받은 판이 버린 값을 새로 쓰면 받지 않음
// 서버 app/(app)/reports/cards/draft-write.ts writeMgDraft와 연기 시험 scripts/smoke/ai-report-mg-smoke.ts --app이 같은 함수를 부름. 표본 카드·지표·라벨 문구로 가르는 분기 없음.

import type { SupabaseClient } from "@supabase/supabase-js";
import { canFixAgain } from "../ai/fix-policy.ts";
import { inspectionCardText } from "../ai/inspect.ts";
import { cardOutline } from "../ai/writer.ts";
import { canonicalJson } from "../cards/fixed.ts";
import type { LooseJson } from "../loose-json.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";
import { type BlockEditOutput, type BlockRoom, applyBlockEdit, blockEditPrompt, blockRoom, verifyBlockEdit } from "./block-edit.ts";
import { blockShapeCode } from "./block-shape.ts";
import { type Block, type BlockOutput, blockTexts, isGridTable } from "./blocks.ts";
import { mgSpecHeight } from "./business-layout.ts";
import { type Composition, type PlanBlock, planAdherence, planMatch } from "./composition.ts";
import { saveDraftRow } from "./draft-store.ts";
import { type HollowBox, PAGE_MM, canonicalBlock, hollowBoxes, isBoxBlock, plainText } from "./fit.ts";
import { shapeCode, shapeName } from "./frameworks.ts";
import { bigramSet, overlapScore } from "./ground.ts";
import { layoutFields } from "./layout.ts";
import { parseChunkBlocks } from "../knowledge/rich-text.ts";
import { BUNDLE_MIN, readTable } from "./mg-bundles.ts";
import { isPlanLine, ledgerOutcomeItems } from "./mg-close.ts";
import { MG_VOLUME_BAND, mgSpecText, recheckMgSection } from "./mg-draft.ts";
import { MG_FILL } from "./mg-fill-limits.ts";
import { CLOSE_LABEL, outcomeRefs } from "./mg-outcomes.ts";
import { isDataBlock } from "./mg-outline.ts";
import { conflictHits, conflictLine, conflictsInBlock } from "./mg-consistency.ts";
import type { MgConflict, MgPart } from "./mg-types.ts";
import { REPEAT_MIN_BLOCKS, REPEAT_MIN_PARTS, figureKeys, figureUnits, repeatedFigures, repeatedSentences } from "./repeat-figures.ts";
import { LINKED_NUMBER_TYPES, type ReportSectionSpec, cleanLine, evidenceKey, quoteFoundIn } from "./section.ts";
import type { KnowledgeRef } from "../ai/writer.ts";

export { MG_FILL } from "./mg-fill-limits.ts";

type Json = LooseJson;
type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number };

/** 반복 수치의 남길 자리를 고를 때 보는 구성안(성과 배정 — 닫는 「추진성과」 블록의 재료 → mg.outcomes 원장 성과 재료). 없으면 배정을 보지 않음 */
export type FillPlan = Pick<Composition, "materials" | "blocks" | "mg">;

const blockName = (index: number, label: string) => `${index + 1}번${label.trim() ? ` 「${label.trim()}」` : ""}`;

/** 경고에 보일 문장 앞부분(「반복 문장」 경고 repeat-figures.ts sentenceRepeatWarning과 같은 24자) */
const clipText = (t: string) => {
  const c = plainText(t).replace(/\s+/g, " ").trim();
  return `「${c.length > 24 ? `${c.slice(0, 24).trimEnd()}…` : c}」`;
};

// ---------------------------------------------------------------------------
// 1. 판정

/** 반복 수치 하나 — 남길 자리(keep) 밖의 블록(others)에서 빼고 아직 안 쓴 원장 사실로 바꿈 */
export interface FillRepeat {
  /** 처음 쓴 모양(figureKeys 값 — 「1,922곳」) */
  figure: string;
  /** 수치 열쇠(값 쉼표 뺌 + 단위 — figureKeys) */
  key: string;
  /** 남길 블록 번호 */
  keep: number;
  /** 그 수치가 든 나머지 블록(블록 순 — 보강할 수 있는지는 고르기가 가름) */
  others: number[];
}

/** 반복 문장 쌍 하나 — 남길 자리(keep) 밖의 블록(index)의 그 글을 아직 안 쓴 사실이나 그 블록 고유의 구체로 바꿈 */
export interface FillSentence {
  /** 바꿀 블록 번호 */
  index: number;
  /** 그 블록의 글(원래 글) */
  text: string;
  /** 남길 블록 번호(추진성과 상자는 -1) */
  keep: number;
  /** 남길 쪽 글(원래 글) */
  other: string;
  /** 남길 쪽 이름(「3번 「추진성과」」·「추진성과 상자」) */
  at: string;
}

export interface MgFillReasons {
  /** 어림 높이(mm — mgSpecHeight, 사업 조판과 같은 셈) */
  height: number;
  /** 분량 목표(mm) = 배정 쪽(spec.mg.pages) × 판면 높이. 배정이 없으면 null(① 사유 없음·여유를 셈하지 않음) */
  target: number | null;
  /** ① 분량 부족: 어림 < 목표 × MG_FILL.low */
  short: boolean;
  /** ② 빈 칸이 있는 블록(블록 순) */
  hollow: Array<{ index: number; boxes: HollowBox[] }>;
  /** ③ 수치가 초안 어디에도 없는 원장 성과 줄(원장 순) */
  facts: string[];
  /** 보탤 재료(사유 아님 — hasFillReason에 안 셈): 연결 근거 조각의 아직 안 쓴 사실(linkedFacts — 조각 순) */
  refFacts: RefFact[];
  /** ④ 반복 수치(repeatedFigures 순 — 블록 수 많은 순) */
  repeats: FillRepeat[];
  /** ⑤ 반복 문장(repeatedSentences 순 — 닮음 큰 순) */
  sentences: FillSentence[];
  /** ⑥ 값 충돌 — 버린 값이 남은 블록과 그 충돌(mg-consistency.ts conflictHits 순, 블록·충돌 짝마다 한 번) */
  conflicts: Array<{ index: number; conflict: MgConflict }>;
}

export const hasFillReason = (r: MgFillReasons) => r.short || r.hollow.length > 0 || r.facts.length > 0 || r.repeats.length > 0 || r.sentences.length > 0 || r.conflicts.length > 0;

const targetOf = (spec: ReportSectionSpec) => (spec.mg?.pages && spec.mg.pages > 0 ? Math.round(spec.mg.pages * PAGE_MM.height) : null);

/**
 * 블록마다 빈 칸(fit.ts hollowBoxes를 블록별로 가름 — hollowBoxes는 어느 블록인지 번호를 주지 않음). 칸 폭은 배치(라벨·그릇·가로 반씩)로만 정해져(fit.ts blockRooms)
 * 다른 블록의 칸을 비워도 이 블록 폭은 같으므로, 이 블록만 두고 나머지 블록의 칸·행을 비워 잼 — 블록별 합은 초안 전체 hollowBoxes와 같음
 */
export function hollowByBlock(spec: ReportSectionSpec): MgFillReasons["hollow"] {
  const blocks = spec.blocks ?? [];
  const out: MgFillReasons["hollow"] = [];
  blocks.forEach((b, i) => {
    if (!isBoxBlock(b)) return;
    const boxes = hollowBoxes(blocks.map((x, j) => (j === i ? x : { ...x, cells: [], rows: [] })), spec.mg?.at);
    if (boxes.length) out.push({ index: i, boxes });
  });
  return out;
}

/**
 * ③ 아직 안 쓴 원장 사실: 원장 성과 재료(mg-close.ts ledgerOutcomeItems — 정량 성과 칸 · 월별 실적의 수치 줄(actuals.ts yearActuals wide) · 정성 성과 칸, 계획·【확인】 줄은 뺌) 중
 * 수치 열쇠(repeat-figures.ts figureKeys — 값 + 단위, 흔한 값·날짜는 뺌)가 있고 그 수치가 하나도 초안 글(절 제목 포함 — mgSpecText)에 없는 줄. 수치 없는 줄은 쓰였는지 셀 수 없어 넣지 않음.
 * PDCA 뼈대(mg-pdca.ts)의 P 재료(전년도 환류·지적의 개선방안·계량지표 목표)는 넣지 않음(2026-10-30): 보강 대상이 칸 글 블록이라 계획 글이 실적 칸에 들어가 「실적 칸」 막힘 경고를 부름
 */
export function unusedLedgerFacts(spec: ReportSectionSpec, card: Json): string[] {
  const used = figureKeys(mgSpecText(spec));
  return ledgerOutcomeItems(card, cleanLine, Infinity)
    .map((x) => x.text)
    .filter((t) => {
      const keys = [...figureKeys(t).keys()];
      return keys.length > 0 && !keys.some((k) => used.has(k));
    });
}

/** 연결 근거 조각의 사실 하나 — 글(문장·표 행, MG_FILL.refFactChars에서 자름)과 어디서(조각 이름, 표 행이면 표 머리) */
export interface RefFact {
  text: string;
  from: string;
}

/** 보강 재료로 읽는 연결 조각 — relevantRefs(kb)(lib/knowledge/bundle.ts)의 조각 */
export type FillRef = Pick<KnowledgeRef, "key" | "title" | "unitType" | "text">;

const clipFact = (t: string) => (t.length > MG_FILL.refFactChars ? `${t.slice(0, MG_FILL.refFactChars - 1).trimEnd()}…` : t);
/** 문단 → 문장(줄바꿈, 한글·닫는 괄호 뒤 마침표에서 나눔 — 「3.5」·「’25.11.」 같은 숫자 뒤 점은 안 나눔), 앞 불릿 표지는 뗌 */
const splitSentences = (text: string) =>
  text
    .split(/\n+|(?<=[가-힣)]\.)\s+/)
    .map((x) => x.replace(/^[\s∙·•\-－–○◦●▪□■◆▸►※*]+/, "").trim())
    .filter(Boolean);

/**
 * 보탤 재료 — 연결 근거 조각의 아직 안 쓴 사실(결정론, 2026-10-29 저녁): 이 카드에 연결된 조각(relevantRefs(kb) — 경평 숫자 근거 draftEvidence linked와 같은 범위) 중
 * 숫자 근거로 인정하는 유형(section.ts LINKED_NUMBER_TYPES — 2025 보고서 절·실사 답변. 보강 답의 숫자 대조 known에 그 글이 들어 있어 보탠 숫자가 「근거 밖」이 안 됨)만,
 * 문단은 문장으로, 표는 행으로(mg-bundles.ts readTable — 맨 숫자 칸에 열 머리 단위를 붙인 「칸 | 칸」 줄, 출처에 표 머리) 읽어
 * ③ 안 쓴 원장 사실과 같은 기준으로 고름: 수치 열쇠(figureKeys)가 있고 그 수치가 하나도 초안 글에 없음(taken — 같은 라운드의 안 쓴 원장 사실 — 의 수치와도 안 겹침),
 * 계획·예정 줄(mg-close.ts isPlanLine)이 아님, 8자 이상, 같은 글은 한 번. 수치 없는 문장(고유명사만)은 쓰였는지 셀 수 없어 원장 사실처럼 넣지 않음
 */
export function linkedFacts(spec: ReportSectionSpec, refs: readonly FillRef[], taken: readonly string[] = []): RefFact[] {
  const used = new Set([...figureKeys(mgSpecText(spec)).keys(), ...taken.flatMap((t) => [...figureKeys(t).keys()])]);
  const seen = new Set<string>();
  const out: RefFact[] = [];
  for (const r of refs) {
    if (!LINKED_NUMBER_TYPES.includes(r.unitType)) continue;
    const name = r.title.split(" · ").slice(0, 2).join(" · ");
    for (const b of parseChunkBlocks(r.text)) {
      const items =
        b.kind === "para"
          ? splitSentences(b.text).map((text) => ({ text, from: name }))
          : b.kind === "table"
            ? (({ head, rows }) => rows.map((x) => ({ text: x.line, from: head ? `${name} 표 「${head.length > 40 ? `${head.slice(0, 39)}…` : head}」` : name })))(readTable(b.rows))
            : [];
      for (const x of items) {
        const text = clipFact(x.text);
        const keys = [...figureKeys(text).keys()];
        const id = text.replace(/\s+/g, "");
        if (text.length < 8 || !keys.length || keys.some((k) => used.has(k)) || isPlanLine(text) || seen.has(id)) continue;
        seen.add(id);
        out.push({ text, from: x.from });
      }
    }
  }
  return out;
}

/** 구성안이 그 수치를 담은 원장 성과 재료(mg.outcomes)를 닫는 「추진성과」 블록에 배정한 절 열쇠 — mg-outline.ts mgOutcomeIssues와 같은 잇기(outcomeRefs) */
function assignedParts(plan: FillPlan | undefined, key: string): Set<string> {
  const items = plan?.mg?.outcomes ?? [];
  if (!plan || !items.length) return new Set();
  const refs = outcomeRefs(plan.materials, items.map((x) => x.text));
  const hit = new Set(items.flatMap((x, i) => (figureKeys(x.text).has(key) ? [i] : [])));
  return new Set(plan.blocks.filter((b) => b.at && b.label.trim() === CLOSE_LABEL && b.materials.some((id) => (refs.get(id) ?? []).some((i) => hit.has(i)))).map((b) => b.at!));
}

/**
 * ④ 반복 수치와 남길 자리(결정론): 반복 기준은 「반복 수치」 경고와 같음(repeatedFigures — 셈 단위 figureUnits, 블록 REPEAT_MIN_BLOCKS개 이상 또는 절 REPEAT_MIN_PARTS개 이상).
 * 남길 자리 = 그 수치가 든 라벨 「추진성과」(닫는 성과 행) 블록 — 구성안이 그 수치의 원장 성과 재료를 배정한 절(assignedParts)의 것 먼저, 아니면 블록 순 첫째.
 * 닫는 블록에 없으면 처음 나온 블록. 나머지 블록이 보강 후보(others)
 */
export function repeatsOf(spec: ReportSectionSpec, plan?: FillPlan): FillRepeat[] {
  const blocks = spec.blocks ?? [];
  const at = spec.mg?.at ?? [];
  const units = figureUnits(spec);
  const keysOf = blocks.map((_, i) => figureKeys(units[i].texts.join("\n")));
  return repeatedFigures(units, REPEAT_MIN_BLOCKS, REPEAT_MIN_PARTS).flatMap(([figure]): FillRepeat[] => {
    const key = [...figureKeys(figure).keys()][0];
    const holders = blocks.flatMap((_, i) => (key && keysOf[i].has(key) ? [i] : []));
    if (holders.length < 2) return [];
    const closes = holders.filter((i) => blocks[i].label.trim() === CLOSE_LABEL);
    const mine = assignedParts(plan, key);
    const keep = closes.find((i) => mine.has(at[i] ?? "")) ?? closes[0] ?? holders[0];
    return [{ figure, key, keep, others: holders.filter((i) => i !== keep) }];
  });
}

/** 띠 블록(강조 띠·메시지 띠·수치 띠) — 반복 문장의 남길 자리를 고를 때 추진성과와 함께 먼저 */
const BAND_KINDS = new Set<Block["kind"]>(["band", "banner", "stats"]);

/**
 * ⑤ 반복 문장과 남길 자리(결정론, 2026-10-29 S7): 쌍은 「반복 문장」 경고·화면 하이라이트와 같은 repeatedSentences(서로 다른 블록, 닮음 SAME_TEXT_MIN 이상).
 * 쌍마다 남길 쪽 = 반복 수치(repeatsOf)와 같은 원칙 — ① 추진성과(라벨 「추진성과」 블록·추진성과 상자)·띠 쪽 ② 다시 쓸 수 없는 쪽(인용·말풍선 등 — fillable 아님, 바꿀 수 없으니 남김)
 * ③ 처음 나온 블록. 다른 쪽이 바꿀 블록(보강할 수 있는지는 고르기가 가름 — 추진성과 상자는 바꾸지 않음)
 */
export function sentencesOf(spec: ReportSectionSpec): FillSentence[] {
  const blocks = spec.blocks ?? [];
  const rank = (at: number) => (at < 0 || blocks[at].label.trim() === CLOSE_LABEL || BAND_KINDS.has(blocks[at].kind) ? 0 : fillable(spec, at, new Set()) ? 2 : 1);
  const name = (at: number) => (at < 0 ? `${CLOSE_LABEL} 상자` : blockName(at, blocks[at].label));
  return repeatedSentences(spec).flatMap(({ a, b }): FillSentence[] => {
    const [keep, other] = rank(a.at) < rank(b.at) || (rank(a.at) === rank(b.at) && a.at < b.at) ? [a, b] : [b, a];
    return other.at < 0 ? [] : [{ index: other.at, text: other.text, keep: keep.at, other: keep.text, at: name(keep.at) }];
  });
}

/**
 * 초안의 보강 사유(결정론)와 보탤 재료. plan = 반복 수치 남길 자리의 성과 배정(없으면 블록 순), refs = 연결 근거 조각(없으면 원장 사실만).
 * 보탤 사실(원장·연결 근거) 중 값 충돌의 버린 값을 쓴 줄(conflictLine)은 뺌 — 카드 원장이 구판이면 원장 사실이 바로 그 버린 값일 수 있음(2026-10-30)
 */
export function mgFillReasons(spec: ReportSectionSpec, card: Json, plan?: FillPlan, refs: readonly FillRef[] = []): MgFillReasons {
  const height = Math.round(mgSpecHeight(spec));
  const target = targetOf(spec);
  const dropped = spec.mg?.conflicts ?? [];
  const clean = (t: string) => !dropped.some((c) => conflictLine(t, c));
  const facts = unusedLedgerFacts(spec, card).filter(clean);
  const seen = new Set<string>();
  const conflicts = conflictHits(spec).filter((h) => {
    const id = `${h.index}\u0001${h.conflict.item}\u0001${h.conflict.drop}`;
    return !seen.has(id) && Boolean(seen.add(id));
  }).map(({ index, conflict }) => ({ index, conflict }));
  return { height, target, short: target !== null && height < target * MG_FILL.low, hollow: hollowByBlock(spec), facts, refFacts: linkedFacts(spec, refs, facts).filter((x) => clean(x.text)), repeats: repeatsOf(spec, plan), sentences: sentencesOf(spec), conflicts };
}

// ---------------------------------------------------------------------------
// 0. 빠진 구성안 블록

/** 구성안에는 있는데 초안에 대응 블록이 없는 블록 하나 */
export interface FillMissing {
  /** 구성안 블록 번호(plan.blocks) */
  plan: number;
  label: string;
  /** 모양 코드(block-shape.ts blockShapeCode — 「table:bars」) */
  shape: string;
  /** 절 열쇠 */
  at: string;
  /** 데이터 블록(mg-outline.ts isDataBlock — 수치 표·막대 표·추진실적 열 표·막대) — 다른 빠진 블록보다 먼저 되살림(S2) */
  data: boolean;
}

/**
 * 한 절의 구성안 블록 ↔ 초안 블록 짝(composition.ts planMatch — 구성안 지킴 셈 planAdherence와 같은 종류·모양 순서의 가장 긴 공통 부분열을 절 안에서만 —
 * 초안 전체로 맞추면 같은 모양 블록이 다른 절 블록과 짝지어짐). pi·di = 그 절의 구성안·초안 블록 번호, m[k] = 구성안 pi[k]의 짝(di 안 순번) 또는 null
 */
function partPairs(spec: ReportSectionSpec, plan: Pick<Composition, "blocks">, key: string): { pi: number[]; di: number[]; m: Array<number | null> } {
  const pi = plan.blocks.flatMap((b, j) => (b.at === key ? [j] : []));
  const di = (spec.mg?.at ?? []).flatMap((k, j) => (k === key ? [j] : []));
  return { pi, di, m: planMatch({ blocks: pi.map((j) => plan.blocks[j]) }, di.map((j) => spec.blocks![j])) };
}

/**
 * 구성안 블록 i를 끼울 초안 자리(결정론): 그 절 안 짝(partPairs)이 없는 블록이면 앞쪽 가장 가까운 짝 블록 바로 뒤, 앞에 짝이 없으면 그 절 첫 블록 앞. null:
 * 짝이 있음(빠진 것이 아님) · 초안에 그 절이 없음(절째 빠짐은 「구성안: 승인한 절」 경고가 알리고, 블록 하나로는 절 제목을 못 세움) ·
 * 그 절에 짝 없는 초안 블록이 있음 — 집필이 그 절을 다른 모양으로 쓰거나 더 넣은 것이라 어느 블록이 빠진 블록 대신인지 모양 순서만으로 못 가림(되살리면 같은 내용이 둘이 될 수 있음).
 * 단 빠진 블록이 데이터 블록(isDataBlock)이면 그 절 초안 블록 글에 그 재료 값이 들어 있는지로 가름(dataElsewhere, 2026-10-29 저녁) — 들어 있으면(다른 모양으로 이미 씀) null, 없으면 자리를 줌
 */
export function missingSlot(spec: ReportSectionSpec, plan: Pick<Composition, "blocks" | "materials">, i: number): number | null {
  const key = plan.blocks[i]?.at;
  if (!key) return null;
  const { pi, di, m } = partPairs(spec, plan, key);
  const k = pi.indexOf(i);
  if (!di.length || m[k] !== null) return null;
  if (m.filter((x) => x !== null).length < di.length && dataElsewhere(spec, plan, i, di)) return null;
  for (let p = k - 1; p >= 0; p--) if (m[p] !== null) return di[m[p]!] + 1;
  return di[0];
}

/**
 * 그 절에 짝 없는 초안 블록이 있을 때 빠진 구성안 블록 i의 내용이 그 절 초안 블록(part — 초안 번호)에 이미 있다고 볼지(결정론): 데이터 블록이 아니면 늘 있다고 봄(예전처럼 보수적 — 글 블록은 같은 내용을 수치로 못 가림).
 * 데이터 블록이면 그 블록 재료(자료 필요 뺌)의 글·원문 구절의 수치 열쇠(figureKeys — 수치 묶음 값)가 그 절 초안 블록 하나에 BUNDLE_MIN개(열쇠가 그보다 적으면 전부) 이상 들어 있으면 있다고 봄
 * (수치 묶음 = 같은 단위 값 3개 이상 — S2, 그만큼 옮겼으면 그 묶음을 다른 모양으로 씀). 짝 없는 블록만이 아니라 그 절 블록 전부를 봄 — 짝(planMatch)은 종류·모양 순서로만 맞춰
 * 값을 옮긴 불릿이 다른 불릿 자리의 짝이 되고 남는 불릿이 짝 없는 블록이 될 수 있음. 재료에 수치가 없으면 가늠할 수 없어 있다고 봄(되살리지 않음)
 */
function dataElsewhere(spec: ReportSectionSpec, plan: Pick<Composition, "blocks" | "materials">, i: number, part: number[]): boolean {
  const b = plan.blocks[i];
  if (!isDataBlock(b)) return true;
  const keys = new Set(b.materials.flatMap((id) => plan.materials.filter((x) => x.id === id && x.kind !== "need")).flatMap((x) => [...figureKeys(`${x.text}\n${x.quote}`).keys()]));
  if (!keys.size) return true;
  const need = Math.min(BUNDLE_MIN, keys.size);
  return part.some((j) => {
    const have = figureKeys(blockTexts(spec.blocks![j]).join("\n"));
    return [...keys].filter((x) => have.has(x)).length >= need;
  });
}

/**
 * 빠진 구성안 블록(결정론): 그 절 안 짝(partPairs)이 없고 끼울 자리(missingSlot)가 있는 구성안 블록. 빼는 것:
 * ① 앱이 정리하며 뺀 블록(cleanBlocks droppedShapes — 원문 없는 인용·사례·정의 등): 집필은 썼는데 앱이 근거 없다고 일부러 뺀 것이라 되살리지 않음 — 짝 없는 블록 중
 *    같은 모양을 하나씩 덜어냄(planAdherence가 구성안 셈에서 덜어내는 것과 같은 뜻). 단 데이터 블록(S2 — isDataBlock)은 앱이 모양 조건(표 행·열 수 등)으로 뺐어도 되살림:
 *    6-2 11회차에서 집필이 쓴 막대 표를 앱이 빼 절에 데이터 블록이 없어졌음. 되살린 판도 받기 검사(근거 밖 숫자·모양·빈 칸)를 거치므로 근거 없는 표는 들어가지 않음
 * ② 추진성과 원장 보강(mg-close.ts fillClosingOutcome)이 이미 채운 절(closed)의 「추진성과」 — 코드가 원장 줄로 되살렸음(막대 행 글 블록처럼 모양이 달라 짝이 안 맞아도 같은 자리)
 * 순서: 데이터 블록 먼저(S2 — 수치 묶음을 담는 블록), 그다음 PDCA 단계가 P·C·A인 블록(FILL_FIRST_STAGES), 그다음 구성안 순
 */
/**
 * 빠진 블록 되살리기에서 데이터 블록 다음으로 먼저 되살릴 PDCA 단계(2026-10-30 — 구성안 블록 stage, mg-pdca.ts): P(문제·계획)·C(점검)·A(보완)는 카드 전체에 한두 블록뿐이라
 * 빠지면 사이클이 끊기고(「결과만 나열」), D(실행)는 보통 블록이 여럿이라 하나 빠져도 이어짐. stage가 없는 옛 구성안은 예전 순서(데이터 블록 → 구성안 순) 그대로
 */
const FILL_FIRST_STAGES: readonly string[] = ["P", "C", "A"];

export function missingBlocks(spec: ReportSectionSpec, plan: Pick<Composition, "blocks" | "materials">, dropped: Array<{ kind: string; variant: string }> = [], closed: string[] = []): FillMissing[] {
  const pairs = new Map<string, ReturnType<typeof partPairs>>();
  const free = dropped.map((d) => shapeCode(d.kind, d.variant));
  const out: FillMissing[] = [];
  plan.blocks.forEach((b, i) => {
    if (!b.at) return;
    if (!pairs.has(b.at)) pairs.set(b.at, partPairs(spec, plan, b.at));
    const p = pairs.get(b.at)!;
    if (p.m[p.pi.indexOf(i)] !== null) return;
    const k = free.indexOf(blockShapeCode(b));
    if (k >= 0) {
      free.splice(k, 1);
      if (!isDataBlock(b)) return;
    }
    if (b.label.trim() === CLOSE_LABEL && closed.includes(b.at)) return;
    if (missingSlot(spec, plan, i) === null) return;
    out.push({ plan: i, label: b.label, shape: blockShapeCode(b), at: b.at, data: isDataBlock(b) });
  });
  const rank = (m: FillMissing) => (m.data ? 0 : FILL_FIRST_STAGES.includes(plan.blocks[m.plan].stage ?? "") ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.plan - b.plan);
}

/**
 * 빈 모양(되살릴 자리에 끼우는 블록): 구성안 블록의 종류·모양·칸 수·라벨·그림 자리·배치로 판면 어림의 보통 모양(fit.ts canonicalBlock — composition.ts planBlocks와 같은 셈)을 만들고
 * 글은 모두 비움(보통 모양의 채움 글·견본 값 「’24년」·「12,345건」을 AI에 보이지 않게 — 칸 구조만 남김)
 */
export function emptyBlock(b: PlanBlock): Block {
  const c = canonicalBlock(b.kind, b.variant, b.cells, b.label, b.figures, undefined, layoutFields(b), true);
  const blank = (xs: string[]) => xs.map(() => "");
  return { ...c, title: "", text: "", badge: "", items: blank(c.items), cells: c.cells.map((x) => ({ ...x, head: "", tag: "", bullets: blank(x.bullets), note: "" })), rows: c.rows.map((r) => ({ key: "", before: blank(r.before), after: blank(r.after) })), series: c.series.map(() => ({ label: "", value: "" })) };
}

/** 초안 pos 자리에 블록 하나를 끼움(절 열쇠 mg.at도 같은 자리에, 사람이 고친 블록 번호 humanEdits는 뒤로 밂) */
function insertBlock(spec: ReportSectionSpec, pos: number, block: Block, key: string): ReportSectionSpec {
  const blocks = [...(spec.blocks ?? [])];
  blocks.splice(pos, 0, block);
  const at = [...(spec.mg?.at ?? [])];
  at.splice(pos, 0, key);
  const next: ReportSectionSpec = { ...spec, blocks, mg: { ...spec.mg!, at } };
  if (spec.humanEdits) next.humanEdits = spec.humanEdits.map((i) => (i >= pos ? i + 1 : i));
  return next;
}

/** 빈 곳 수: 불릿 블록의 빈 줄, 값 열 표(isGridTable)의 빈 값 칸(「빈 칸」 경고와 같은 자리), 그 밖 칸(머리·꼬리표·불릿 모두 빈 칸), 행(전후 모두 빈 행), 막대(값 없는 막대) */
function blankParts(b: Block): number {
  const blank = (xs: string[]) => xs.every((x) => !x.trim());
  const cells = isGridTable(b) ? b.cells.flatMap((c) => c.bullets).filter((x) => !x.trim()).length : b.cells.filter((c) => blank([c.head, c.tag, ...c.bullets])).length;
  return (b.kind === "bullets" || b.kind === "case" ? b.items.filter((x) => !x.trim()).length : 0) + cells + b.rows.filter((r) => blank([...r.before, ...r.after])).length + b.series.filter((x) => !x.value.trim()).length;
}

// ---------------------------------------------------------------------------
// 2. 고르기

export interface FillTarget {
  index: number;
  /** 고른 까닭 — conflict: 값 충돌의 버린 값이 남은 블록 · hollow: 빈 칸이 있는 블록 · repeat: 반복 수치를 뺄 블록 · sentence: 반복 문장을 바꿀 블록 · short: 분량이 모자란 절의 칸 글 블록(2회차는 카드 분량이 모자라 고른 나머지 블록도 — part 없음) · missing: 되살릴 빠진 구성안 블록(빈 모양을 끼운 자리) */
  why: "conflict" | "hollow" | "repeat" | "sentence" | "short" | "missing";
  /** 빈 칸(why hollow) */
  boxes: HollowBox[];
  /** 이 블록이 든 절의 몫·모자람(mm, why short) */
  part?: { share: number; short: number };
  /** 이 블록 몫(mm) — 몫을 모은 블록은 남은 분량 ÷ 모은 블록 수, 나머지(빈 칸·반복만 고칠 블록·반복 정리)는 0(지금 높이 안에서). 배정이 없으면 null(지금 줄 수 안팎) */
  share: number | null;
  /** 이 블록에 나눈 아직 안 쓴 원장 사실 */
  facts: string[];
  /** 이 블록에 나눈 연결 근거 사실(MG_FILL.refFacts개까지) */
  refFacts: RefFact[];
  /** 이 블록에서 뺄 반복 수치와 남길 자리(블록 이름 — 「3번 「추진성과」」). 고른 까닭과 상관없이 이 블록이 든 반복 수치 전부 */
  repeats: Array<{ figure: string; key: string; at: string }>;
  /** 이 블록에서 바꿀 반복 문장(이 블록의 글·남길 쪽 블록 번호·글·이름). 고른 까닭과 상관없이 이 블록이 바꿀 쪽인 쌍 전부 */
  sentences: Array<Omit<FillSentence, "index">>;
  /** 이 블록에서 고칠 값 충돌(버린 값 → 쓸 값). 고른 까닭과 상관없이 이 블록에 버린 값이 남은 충돌 전부 */
  conflicts: MgConflict[];
  /** 빠진 구성안 블록(why missing) — 라벨·모양 이름·목적과 그 블록 재료(자료 필요 재료는 뺌 — 근거가 아니라 요청) */
  missing?: { label: string; shape: string; purpose: string; materials: Array<{ id: string; text: string; quote: string }> };
}

/**
 * 보강하지 않는 블록 종류: 막대(chart)·띠(강조 띠 band·banner, 수치 띠 stats)·소제목(subhead) — 늘릴 글 칸이 아니거나 수치 자리,
 * 인용·말풍선(quotes·voices) — 원문 그대로여야 해(blocks.ts cleanBlocks가 원문을 못 찾은 인용을 버림) 늘릴 글이 근거 원문에 묶임
 */
const SKIP_KINDS = new Set<Block["kind"]>(["chart", "band", "banner", "stats", "subhead", "quotes", "voices"]);

/** 보강할 수 있는 블록: 위 종류가 아니고, 칸·불릿 글 한도가 있으며(block-edit.ts blockRoom — 칸 글·불릿 블록), 추진성과 원장 보강(코드가 채운 절의 「추진성과」 블록 — verifyMgDraft closed)이 아님 */
function fillable(spec: ReportSectionSpec, i: number, closed: Set<string>): boolean {
  const b = spec.blocks?.[i];
  if (!b || SKIP_KINDS.has(b.kind)) return false;
  if (b.label.trim() === CLOSE_LABEL && closed.has(spec.mg?.at[i] ?? "")) return false;
  return blockRoom(spec, i) !== null;
}

/**
 * 절마다 몫·모자람(mm): 절 몫 = (목표 − 절 머리 높이) ÷ 절 수(집필 요청 「분량 목표」의 절당 분량과 같은 셈 — mg-draft.ts mgPlanPrompt),
 * 절 높이 = 그 절 블록만 둔 높이 − 그 절 머리만 둔 높이(둘 다 mgSpecHeight)
 */
function partVolumes(spec: ReportSectionSpec, target: number): Map<string, { share: number; short: number }> {
  const out = new Map<string, { share: number; short: number }>();
  const mg = spec.mg;
  if (!mg?.parts.length) return out;
  const blocks = spec.blocks ?? [];
  const sub = (parts: MgPart[], keep: (i: number) => boolean): ReportSectionSpec => ({ ...spec, blocks: blocks.filter((_, i) => keep(i)), mg: { ...mg, parts, at: mg.at.filter((_, i) => keep(i)) } });
  const share = (target - mgSpecHeight(sub(mg.parts, () => false))) / mg.parts.length;
  for (const p of mg.parts) {
    const own = mgSpecHeight(sub([p], (i) => mg.at[i] === p.key)) - mgSpecHeight(sub([p], () => false));
    out.set(p.key, { share: Math.round(share), short: Math.round(share - own) });
  }
  return out;
}

/** 고르기 선택 — all: 2회차(절 몫을 채운 절의 블록까지) · repeat: 「반복 정리」 라운드(반복 수치·문장 블록만, 몫 없음) */
export interface PickOptions {
  all?: boolean;
  repeat?: boolean;
}

/**
 * 보강할 블록 고르기(결정론): ⑥ 값 충돌의 버린 값이 남은 블록(블록 순 — 사실 어긋남이라 먼저) → ② 빈 칸 블록(모자란 줄 합이 큰 순 → 블록 순) → ④ 반복 수치를 뺄 블록(블록 순) → ⑤ 반복 문장을 바꿀 블록(블록 순) → ①·③이 있고 늘릴 높이(배정 − 어림)가 남았으면
 * 절 몫보다 모자란 절의 칸 글 블록(많이 모자란 절 먼저, 절 안은 블록 순). 블록 수 상한 없음(호출 한도는 블록마다 startAiRequest가 막음).
 * all(2회차 — 1회차 뒤에도 카드 분량이 배정 × MG_FILL.low 미만): 위 순서 뒤에 절 몫을 채운 절의 블록까지 블록 순으로 더함(2026-10-29 「초안에는 내용이 많은 게 낫다」).
 * repeat(「반복 정리」): ⑥·④·⑤ 블록만, 몫 0.
 * 몫 모으기(2026-10-29 저녁 — 6-2 r9 몫 10~15mm를 블록 9개에 고르게 나눠 덜 늘었음): 남은 분량을 빈 칸 블록 밖의 고른 블록 중 줄 수(blockRoom now)가 적은 블록부터
 * MG_FILL.shareMin 이상이 되는 최소 개수(남은 분량 ÷ shareMin, 적어도 1개)에만 똑같이 나누고 나머지는 몫 0 — 늘리려고만 고른 블록(short)은 몫이 없으면 뺌.
 * 빈 칸 블록은 따로 둠(몫 0 — 짧은 칸을 긴 칸 줄 수까지 채우는 것이라 블록 높이를 늘리지 않음). 배정이 없으면 몫 null.
 * 반복 수치·문장은 그 블록이 든 것 전부, 안 쓴 원장 사실은 assignFacts로, 연결 근거 사실은 assignRefFacts로 나눔
 */
export function pickFillTargets(spec: ReportSectionSpec, reasons: MgFillReasons, closed: string[] = [], opts: PickOptions = {}): FillTarget[] {
  if (!hasFillReason(reasons)) return [];
  const shut = new Set(closed);
  const blocks = spec.blocks ?? [];
  const ok = (i: number) => fillable(spec, i, shut);
  const room = reasons.target === null ? null : Math.max(0, reasons.target - reasons.height);
  const deficit = (bs: HollowBox[]) => bs.reduce((n, x) => n + x.most - x.used, 0);
  const make = (index: number, why: FillTarget["why"], more: Partial<FillTarget> = {}): FillTarget => ({ index, why, boxes: [], share: null, facts: [], refFacts: [], repeats: [], sentences: [], conflicts: [], ...more });
  const conflictAt = new Map<number, MgConflict[]>();
  for (const c of reasons.conflicts) if (ok(c.index)) conflictAt.set(c.index, [...(conflictAt.get(c.index) ?? []), c.conflict]);
  let picked: FillTarget[] = [...conflictAt.keys()].sort((a, b) => a - b).map((i) => make(i, "conflict"));
  const has = (i: number) => picked.some((t) => t.index === i);
  if (!opts.repeat)
    for (const h of reasons.hollow.filter((x) => ok(x.index)).sort((a, b) => deficit(b.boxes) - deficit(a.boxes) || a.index - b.index)) {
      const t = picked.find((x) => x.index === h.index);
      if (t) t.boxes = h.boxes;
      else picked.push(make(h.index, "hollow", { boxes: h.boxes }));
    }
  const repeatAt = new Map<number, FillTarget["repeats"]>();
  for (const r of reasons.repeats) for (const i of r.others) if (ok(i)) repeatAt.set(i, [...(repeatAt.get(i) ?? []), { figure: r.figure, key: r.key, at: blockName(r.keep, blocks[r.keep].label) }]);
  for (const i of [...repeatAt.keys()].sort((a, b) => a - b)) if (!has(i)) picked.push(make(i, "repeat"));
  const sentenceAt = new Map<number, FillTarget["sentences"]>();
  for (const { index, ...x } of reasons.sentences) if (ok(index)) sentenceAt.set(index, [...(sentenceAt.get(index) ?? []), x]);
  for (const i of [...sentenceAt.keys()].sort((a, b) => a - b)) if (!has(i)) picked.push(make(i, "sentence"));
  if (!opts.repeat && (reasons.short || reasons.facts.length) && room && reasons.target !== null) {
    const at = spec.mg?.at ?? [];
    const parts = [...partVolumes(spec, reasons.target)].filter(([, v]) => v.short > 0).sort((a, b) => b[1].short - a[1].short);
    for (const [key, v] of parts)
      blocks.forEach((_, i) => {
        if (at[i] === key && !has(i) && ok(i)) picked.push(make(i, "short", { part: v }));
      });
    if (opts.all && reasons.short) blocks.forEach((_, i) => {
      if (!has(i) && ok(i)) picked.push(make(i, "short"));
    });
  }
  for (const t of picked) {
    t.repeats = repeatAt.get(t.index) ?? [];
    t.sentences = sentenceAt.get(t.index) ?? [];
    t.conflicts = conflictAt.get(t.index) ?? [];
  }
  if (room !== null) {
    for (const t of picked) t.share = 0;
    const grow = opts.repeat
      ? []
      : picked
          .filter((t) => t.why !== "hollow")
          .map((t, k) => ({ t, k, lines: blockRoom(spec, t.index)?.now ?? 0 }))
          .sort((a, b) => a.lines - b.lines || a.k - b.k);
    const n = Math.min(grow.length, Math.max(1, Math.floor(room / MG_FILL.shareMin)));
    for (const g of grow.slice(0, n)) g.t.share = Math.floor(room / n);
    picked = picked.filter((t) => t.why !== "short" || (t.share ?? 0) > 0);
  }
  assignFacts(spec, picked, reasons.facts);
  assignRefFacts(spec, picked, reasons.refFacts);
  return picked;
}

/** 대상 블록이 든 절 글의 글자 두 개 묶음(사실 나누기 겹침 셈 — ground.ts overlapScore) */
const partBigrams = (spec: ReportSectionSpec, targets: FillTarget[]) => {
  const at = spec.mg?.at ?? [];
  const blocks = spec.blocks ?? [];
  return new Map(targets.map((t) => [t.index, bigramSet(blocks.filter((_, i) => at[i] === at[t.index]).flatMap(blockTexts).join("\n"))]));
};

/**
 * 안 쓴 원장 사실 나누기 — 사실 하나는 블록 하나에만(같은 성과를 여러 블록에 되풀이하지 않게). 반복 수치를 빼거나 반복 문장·값 충돌을 바꿀 블록부터 하나씩(그 자리를 채울 사실) 먼저 주고,
 * 남은 사실은 그 블록이 든 절 글과 글자 두 개 묶음이 가장 많이 겹치는 블록(ground.ts overlapScore — mg-close.ts 추진성과 보강 줄 고르기와 같은 셈) → 받은 사실이 적은 블록 → 먼저 고른 블록
 */
function assignFacts(spec: ReportSectionSpec, targets: FillTarget[], facts: string[]): void {
  if (!targets.length) return;
  const partText = partBigrams(spec, targets);
  const pool = [...facts];
  for (const t of targets.filter((x) => x.repeats.length || x.sentences.length || x.conflicts.length)) {
    if (!pool.length) break;
    let pick = 0;
    let score = -1;
    pool.forEach((f, i) => {
      const s = overlapScore(f, partText.get(t.index)!) ?? 0;
      if (s > score) {
        pick = i;
        score = s;
      }
    });
    t.facts.push(pool.splice(pick, 1)[0]);
  }
  for (const f of pool) {
    let best = targets[0];
    let score = -1;
    for (const t of targets) {
      const s = overlapScore(f, partText.get(t.index)!) ?? 0;
      if (s > score || (s === score && t.facts.length < best.facts.length)) {
        best = t;
        score = s;
      }
    }
    best.facts.push(f);
  }
}

/**
 * 연결 근거 사실 나누기(결정론): 고른 순서대로 블록마다 그 블록이 든 절 글과 글자 두 개 묶음이 가장 많이 겹치는 사실(겹침 0은 주지 않음 — 이 블록 주제와 무관)을
 * MG_FILL.refFacts개까지. 사실 하나는 블록 하나에만, 준 사실과 수치 열쇠가 하나라도 같은 사실도 다른 블록에 주지 않음(같은 수치를 두 블록에 보태 반복 수치가 생기지 않게)
 */
function assignRefFacts(spec: ReportSectionSpec, targets: FillTarget[], facts: RefFact[]): void {
  if (!targets.length || !facts.length) return;
  const partText = partBigrams(spec, targets);
  let pool = facts.map((f) => ({ f, keys: [...figureKeys(f.text).keys()] }));
  for (const t of targets) {
    while (t.refFacts.length < MG_FILL.refFacts && pool.length) {
      let pick = -1;
      let score = 0;
      pool.forEach((x, i) => {
        const s = overlapScore(x.f.text, partText.get(t.index)!) ?? 0;
        if (s > score) {
          pick = i;
          score = s;
        }
      });
      if (pick < 0) break;
      const got = pool[pick];
      t.refFacts.push(got.f);
      pool = pool.filter((x) => x !== got && !x.keys.some((k) => got.keys.includes(k)));
    }
  }
}

// ---------------------------------------------------------------------------
// 3. 다시 쓰기

/**
 * 다른 블록에 이미 있는 것(보강 요청 「되풀이 금지」 목록, 결정론 — 블록 고치기 요청에는 이 블록 JSON만 들어가 AI가 다른 블록 글을 못 봄):
 * 수치 = 다른 블록 글의 수치(figureKeys, 블록 순, 이 블록에도 있는 수치는 뺌 — 그것은 fill.repeat가 다룸) MG_FILL.avoidFigures개까지,
 * 문장 = 다른 블록의 문장 중 이 블록 글·준 사실과 글자 두 개 묶음이 겹치는 것(겹침 큰 순 — 되풀이될 만한 것) MG_FILL.avoidSentences개, 앞 24자
 */
export function avoidList(spec: ReportSectionSpec, t: FillTarget): { figures: string[]; sentences: string[] } {
  const blocks = spec.blocks ?? [];
  const mine = blocks[t.index] ? figureKeys(blockTexts(blocks[t.index]).join("\n")) : new Map<string, string>();
  const figures = new Map<string, string>();
  blocks.forEach((b, j) => {
    if (j === t.index) return;
    for (const [k, shown] of figureKeys(blockTexts(b).join("\n"))) if (!mine.has(k) && !figures.has(k)) figures.set(k, shown);
  });
  const near = bigramSet([...(blocks[t.index] ? blockTexts(blocks[t.index]) : []), ...t.facts, ...t.refFacts.map((x) => x.text)].join("\n"));
  const sentences = blocks
    .flatMap((b, j) => (j === t.index ? [] : [b.text, ...b.items, ...b.cells.flatMap((c) => [...c.bullets, c.note]), ...b.rows.flatMap((r) => [...r.before, ...r.after])].filter((x) => plainText(x).trim().length >= 8)))
    .map((text, k) => ({ text, k, score: overlapScore(text, near) ?? 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.k - b.k)
    .slice(0, MG_FILL.avoidSentences)
    .map((x) => clipText(x.text));
  return { figures: [...figures.values()].slice(0, MG_FILL.avoidFigures), sentences: [...new Set(sentences)] };
}

/**
 * 보강 요청 글(블록 고치기 edit 절의 「요청」 자리 — 코드가 report-block-mg/request.md fill.* 조각으로 만듦, 사람 글이 아님).
 * room = 이 블록의 글 한도(blockRoom(spec, i, 블록 몫)) — 늘릴 줄 = room.max − room.now, 불릿 수 = 줄 ÷ 불릿 하나의 줄 수(올림 — room.bullet). 몫이 없거나 한 줄도 못 늘리면 fill.keep.
 * 값 충돌(t.conflicts)은 까닭 맨 앞에 fill.conflict(+ fill.conflict.item — 버린 값 → 쓸 값). 연결 근거 사실은 fill.refs(+ fill.refs.item — 시점 표지·계획 금지), spec을 주면 다른 블록에 이미 있는 수치·문장(avoidList)을 fill.avoid로(되풀이 금지).
 * 빠진 구성안 블록(t.missing)은 fill.missing 하나 — 라벨·모양 이름·목적·재료(fill.missing.item, 앱이 찾은 원문 구절은 fill.missing.quote, 재료가 없으면 fill.missing.none)
 */
export function fillRequestText(p: PromptSet, t: FillTarget, room?: BlockRoom | null, spec?: ReportSectionSpec): string {
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  if (t.missing) {
    const items = t.missing.materials.map((m) => r("fill.missing.item", { id: m.id, text: m.text, quote: m.quote ? r("fill.missing.quote", { quote: m.quote }) : "" }));
    return r("fill.missing", { label: t.missing.label, shape: t.missing.shape, purpose: t.missing.purpose || "—", materials: items.length ? items.join(" · ") : r("fill.missing.none") });
  }
  const repeat = t.repeats.length ? r("fill.repeat", { items: t.repeats.map((x) => r("fill.repeat.item", { figure: x.figure, at: x.at })).join(" · ") }) : "";
  const sentence = t.sentences.length ? r("fill.sentence", { items: t.sentences.map((x) => r("fill.sentence.item", { text: plainText(x.text).replace(/\s+/g, " ").trim(), at: x.at })).join(" · ") }) : "";
  const conflict = t.conflicts.length ? r("fill.conflict", { items: t.conflicts.map((x) => r("fill.conflict.item", { item: x.item, drop: x.drop, keep: x.keep, why: x.why || "—" })).join(" · ") }) : "";
  const why = [conflict, t.boxes.length ? r("fill.hollow", { boxes: t.boxes.map((x) => `[${x.where}] 지금 ${x.used}/${x.most}줄`).join(" · ") }) : "", t.part ? r("fill.short", { share: t.part.share, short: t.part.short }) : "", repeat, sentence].filter(Boolean).join(" ");
  const lines = room && t.share ? room.max - room.now : 0;
  const more = !room || lines <= 0 ? "" : room.unit === "line" ? r("fill.room.line", { lines }) : room.bullet ? r("fill.room.bullet", { lines, bullets: Math.ceil(lines / room.bullet) }) : r("fill.room.cell", { lines });
  const refs = t.refFacts.length ? r("fill.refs", { items: t.refFacts.map((x) => r("fill.refs.item", { text: x.text, from: x.from })).join(" · ") }) : "";
  const a = spec ? avoidList(spec, t) : { figures: [], sentences: [] };
  const avoid = a.figures.length || a.sentences.length ? r("fill.avoid", { figures: a.figures.join(", ") || "없음", sentences: a.sentences.join(" · ") || "없음" }) : "";
  return r("fill", { why, facts: t.facts.length ? t.facts.map((f) => `「${f}」`).join(" · ") : r("fill.none"), refs, avoid, height: more ? r("fill.room", { mm: t.share!, lines: more }) : r("fill.keep") });
}

/** 블록 하나 AI 호출 결과 — ok가 아니면 message(실패 까닭), stop = 호출 한도에 걸려 그 라운드의 남은 블록은 시작하지 않음 */
export type FillCall = { ok: true; output: BlockEditOutput; usage: Usage; model: string } | { ok: false; stop: boolean; message: string };

export interface MgFillDeps {
  /** report-block-mg 묶음(lib/prompts/sets.ts reportBlockPromptsMg().prompts) */
  prompts: PromptSet;
  /** 블록 하나 AI 호출(서버: 호출 기록 + lib/ai/run.ts callReportBlock edit·경영관리, 연기 시험: callReportBlock만). 던지면 그 블록만 실패 */
  call: (prompt: string, target: FillTarget) => Promise<FillCall>;
  /** 집필 호출을 시작한 시각(ms) — 기한 셈의 기준(주요사업 자동 고치기와 같음) */
  t0: number;
  /** 1차(집필) 호출 ms — 첫 보강 블록의 시간 어림(그 뒤는 직전 블록 호출 ms) */
  firstMs: number;
  /** 기한(lib/ai/fix-policy.ts fixDeadlineMs — Vercel만 690초, 그 밖은 Infinity). 보강 시작 + MG_FILL.maxSec가 더 이르면 그것 */
  deadlineMs: number;
  /** 시험용 시계 */
  now?: () => number;
}

export interface MgFillInput {
  card: Json;
  /** 숫자 대조 근거 글(집필 검증과 같은 known — 첨부·실사 답변·계량 실적 입력·그 지표 2025 보고서·핵심공통항목) */
  known: string;
  /** 인용 대조에만 쓰는 글(평가 기준·지적) */
  quoteOnly: string;
  year?: number;
  today?: string;
  /** 추진성과 원장 보강으로 채운 절 열쇠(verifyMgDraft closed) */
  closed?: string[];
  /** 승인한 구성안(반복 수치 남길 자리의 성과 배정 — repeatsOf, 빠진 블록 되살리기 — missingBlocks). 없으면 블록 순이고 되살리지 않음 */
  plan?: FillPlan;
  /** 앱이 정리하며 뺀 블록의 종류·모양(verifyMgDraft droppedShapes) — 빠진 블록에서 덜고 구성안 지킴을 다시 셀 때 씀 */
  dropped?: Array<{ kind: string; variant: string }>;
  /** 이 카드에 연결된 공통 지식 조각(relevantRefs(kb) — 숫자 근거 known과 같은 묶음) — 보탤 재료(linkedFacts). 없으면 원장 사실만 */
  refs?: readonly FillRef[];
}

export interface FillResult {
  /** 몇 회차(1부터, 빠진 블록 되살리기는 0) */
  round: number;
  /** 「반복 정리」 라운드의 결과 */
  cleanup?: boolean;
  /** 되살린 구성안 블록 번호(round 0만). index는 받았으면 보강을 마친 초안의 블록 번호, 못 받았으면 끼우려던 자리 */
  plan?: number;
  index: number;
  label: string;
  ok: boolean;
  /** 이 블록 몫(mm — FillTarget.share) */
  share: number | null;
  /** 받은 블록으로 바뀐 어림 높이(mm) */
  mm?: number;
  /** 반복 수치 — removed: 이 블록에서 빠짐 · kept: 그대로 남음(받은 블록만) */
  repeats?: { removed: string[]; kept: string[] };
  /** 반복 문장(이 블록의 원래 글) — fixed: 남길 쪽과 더는 같은 문장이 아님 · kept: 아직 같은 문장(받은 블록만) */
  sentences?: { fixed: string[]; kept: string[] };
  /** 값 충돌(버린 값) — fixed: 이 블록에서 빠짐 · kept: 아직 남음(받은 블록만) */
  conflicts?: { fixed: string[]; kept: string[] };
  /** 못 받은 까닭 */
  reason?: string;
  ms?: number;
  usage?: Usage;
  model?: string;
}

/** 보강 한 라운드 */
export interface FillRound {
  round: number;
  /** 「반복 정리」 라운드(보강 라운드 뒤 반복 수치·문장이 남았을 때 반복 블록만, 몫 0) */
  cleanup?: boolean;
  /** 이 라운드를 시작할 때 초안의 사유 */
  reasons: MgFillReasons;
  targets: FillTarget[];
  results: FillResult[];
  /** 남은 블록을 시작하지 않은 까닭 — time: 기한 안에 한 번 더 부를 시간이 없음(canFixAgain — 뒤 라운드도 없음) · limit: 호출 한도(1분 5회·동시 2건)에 걸림(이 라운드만 끝냄) */
  skipped: { why: "time" | "limit"; blocks: number[]; message?: string } | null;
  /** 라운드 전후 어림 높이(mm) */
  before: number;
  after: number;
  ms: number;
}

export interface MgFillRun {
  /** 보강한 초안(받은 블록만 바뀜 — 다시 점검 전) */
  spec: ReportSectionSpec;
  /** 1회차 사유(보강 전 초안 — 빠진 블록을 되살렸으면 1회차 라운드의 reasons는 되살린 뒤 다시 잰 것) */
  reasons: MgFillReasons;
  /** 빠진 구성안 블록(되살리기 전 초안 — missingBlocks 순) */
  missing: FillMissing[];
  /** 빠진 블록 되살리기 결과(round 0 — 시간·호출 한도로 시작하지 않은 블록도 ok false와 까닭으로) */
  revived: FillResult[];
  rounds: FillRound[];
  /** 보강 전후 어림 높이(mm) */
  before: number;
  after: number;
  usage: Usage;
}

/** 내용 개수(같은 모양 안의 칸·행·막대·표 열) — 불릿·사례는 줄을 늘리는 블록이라 셈하지 않음(null) */
const countOf = (b: Block) => (b.kind === "bullets" || b.kind === "case" ? null : `${b.cells.length}/${b.rows.length}/${b.series.length}/${isGridTable(b) ? b.items.length : "-"}`);

/**
 * 보강 답 한 블록 받기(결정론): 블록 고치기 검증(verifyBlockEdit — 모양 규칙 없이 같은 종류만·원문 못 찾은 인용 버림) → 라벨·그림 자리는 원래 값(짜임 그대로) →
 * 모양·칸 수가 같고 → 바뀐 글이 있고 → 새로 생긴 근거 밖 숫자가 없고(recheckMgSection — 블록 고치기 저장과 같은 숫자 대조) → 높이가 줄지 않고(반복 수치를 빼며 줄이면 안 됨) →
 * 늘었다면 분량 상한(배정 × (1 + MG_VOLUME_BAND)) 안 → 새 반복 수치·반복 문장 쌍을 만들지 않음(newRepeats — 반복 사유 블록은 반복 수가 줄면 받음) → 뺄 반복 수치(repeats)가 하나도 안 빠지고 바꿀 반복 문장(sentences)도 하나도 안 바뀌었으면 분량이 늘었을 때만
 * (남은 수치·문장은 결과의 kept — 경고 「반복 그대로」). 반복 문장은 받은 판에서 repeatedSentences가 이 블록과 남길 쪽의 그 글을 아직 쌍으로 내면 그대로 남은 것.
 * 값 충돌(2026-10-30 — 초안 spec.mg.conflicts): 받은 판이 이 블록에 버린 값을 새로 쓰면 받지 않고, 고칠 충돌(conflicts)은 반복 수치처럼 빠짐(fixed)·남음(kept)으로 셈 —
 * 반복·충돌 모두 하나도 못 고쳤으면 분량이 늘었을 때만 받음(남은 충돌은 다시 점검의 「값 충돌」 경고로 남아 사람이 봄).
 * 적용은 applyBlockEdit(짝 잃은 「가로 반씩」 정리 포함)이되 사람이 고친 블록 표시(humanEdits — 다시 만들기 경고)에는 넣지 않음(AI 글)
 */
export function acceptFill(cur: ReportSectionSpec, index: number, out: BlockOutput, input: MgFillInput, found: (q: string) => boolean, target: number | null, repeats: FillTarget["repeats"] = [], sentences: FillTarget["sentences"] = [], conflicts: FillTarget["conflicts"] = []): { ok: true; spec: ReportSectionSpec; mm: number; repeats?: { removed: string[]; kept: string[] }; sentences?: { fixed: string[]; kept: string[] }; conflicts?: { fixed: string[]; kept: string[] } } | { ok: false; reason: string } {
  const before = cur.blocks![index];
  const v = settle(before, out, found);
  if (!v.ok) return v;
  const block = v.block;
  if (blockShapeCode(block) !== blockShapeCode(before) || countOf(block) !== countOf(before)) return { ok: false, reason: "모양이나 칸 수가 바뀜" };
  if (canonicalJson(block) === canonicalJson(before)) return { ok: false, reason: "AI가 블록을 바꾸지 않음" };
  const next: ReportSectionSpec = { ...applyBlockEdit(cur, index, block) };
  if (cur.humanEdits) next.humanEdits = cur.humanEdits;
  else delete next.humanEdits;
  const fresh = freshNumbers(cur, next, input);
  if (fresh) return { ok: false, reason: fresh };
  const h0 = mgSpecHeight(cur);
  const h1 = mgSpecHeight(next);
  if (h1 < h0) return { ok: false, reason: `높이가 줄어듦(${Math.round(h1 - h0)}mm)` };
  if (target !== null && h1 > h0 && h1 > target * (1 + MG_VOLUME_BAND)) return { ok: false, reason: `분량이 배정의 ${Math.round((1 + MG_VOLUME_BAND) * 100)}%를 넘음` };
  const mm = Math.round(h1 - h0);
  const made = newRepeats(cur, next, repeats.length > 0 || sentences.length > 0);
  if (made) return { ok: false, reason: made };
  const all = cur.mg?.conflicts ?? [];
  const was = conflictsInBlock(before, all);
  const now = conflictsInBlock(block, all);
  const wrote = now.filter((c) => !was.includes(c));
  if (wrote.length) return { ok: false, reason: `값 충돌의 쓰지 않을 값을 새로 씀(${wrote.map((c) => `「${c.drop}」`).join(", ")})` };
  if (!repeats.length && !sentences.length && !conflicts.length) return { ok: true, spec: next, mm };
  const left = figureKeys(blockTexts(block).join("\n"));
  const kept = repeats.filter((x) => left.has(x.key)).map((x) => x.figure);
  const removed = repeats.filter((x) => !left.has(x.key)).map((x) => x.figure);
  const pairs = sentences.length ? repeatedSentences(next) : [];
  const still = (x: FillTarget["sentences"][number]) => pairs.some((p) => (p.a.at === index && p.b.at === x.keep && p.b.text === x.other) || (p.b.at === index && p.a.at === x.keep && p.a.text === x.other));
  const same = sentences.filter(still).map((x) => x.text);
  const fixed = sentences.filter((x) => !still(x)).map((x) => x.text);
  const stays = conflicts.filter((c) => now.some((x) => x.item === c.item && x.drop === c.drop)).map((c) => c.drop);
  const gone = conflicts.filter((c) => !now.some((x) => x.item === c.item && x.drop === c.drop)).map((c) => c.drop);
  if (!removed.length && !fixed.length && !gone.length && h1 <= h0) {
    const what = [kept.length ? `반복 수치(${kept.join(", ")})를 빼지 않았고` : "", same.length ? `반복 문장 ${same.length}개를 바꾸지 않았고` : "", stays.length ? `값 충돌(${stays.map((x) => `「${x}」`).join(", ")})을 고치지 않았고` : ""].filter(Boolean).join(" ");
    return { ok: false, reason: `${what} 분량도 늘지 않음` };
  }
  return { ok: true, spec: next, mm, ...(repeats.length ? { repeats: { removed, kept } } : {}), ...(sentences.length ? { sentences: { fixed, kept: same } } : {}), ...(conflicts.length ? { conflicts: { fixed: gone, kept: stays } } : {}) };
}

/** 반복 수치(「반복 수치」 경고와 같은 기준 — 열쇠 → 모양)와 반복 문장 쌍(「반복 문장」 경고와 같은 쌍 — 블록 번호·글로 가름) */
function repeatState(spec: ReportSectionSpec): { figures: Map<string, string>; sentences: Set<string> } {
  const figures = new Map(repeatedFigures(figureUnits(spec), REPEAT_MIN_BLOCKS, REPEAT_MIN_PARTS).flatMap(([f]): Array<[string, string]> => {
    const k = [...figureKeys(f).keys()][0];
    return k ? [[k, f]] : [];
  }));
  const sentences = new Set(repeatedSentences(spec).map(({ a, b }) => [a, b].map((x) => `${x.at}\u0001${x.text}`).sort().join("\u0002")));
  return { figures, sentences };
}

/**
 * 받은 판이 새로 만든 반복(2026-10-29 저녁 — 6-2 r9b는 보강 전 반복 문장 0이 보강 뒤 5쌍): 보강 전(cur)에 없던 반복 수치·반복 문장 쌍이 생기면 못 받는 까닭.
 * 반복을 줄이는 것이 목적인 블록(fix — 반복 수치·문장 사유)은 새 쌍이 생겨도 반복 수(수치 + 문장 쌍)가 줄면 받음. 없으면 null
 */
function newRepeats(cur: ReportSectionSpec, next: ReportSectionSpec, fix: boolean): string | null {
  const was = repeatState(cur);
  const now = repeatState(next);
  const figs = [...now.figures].filter(([k]) => !was.figures.has(k)).map(([, f]) => f);
  const pairs = [...now.sentences].filter((x) => !was.sentences.has(x)).length;
  if (!figs.length && !pairs) return null;
  if (fix && now.figures.size + now.sentences.size < was.figures.size + was.sentences.size) return null;
  return `새 반복(${[figs.length ? `수치 ${figs.slice(0, 3).join(", ")}` : "", pairs ? `문장 ${pairs}쌍` : ""].filter(Boolean).join("·")})`;
}

/** 답 블록 정리: 블록 고치기 검증(verifyBlockEdit — 모양 규칙 없이 같은 종류만·원문 못 찾은 인용 버림) → 라벨·그림 자리는 원래 값(짜임 그대로) */
function settle(before: Block, out: BlockOutput, found: (q: string) => boolean): { ok: true; block: Block } | { ok: false; reason: string } {
  const v = verifyBlockEdit(before, out, cleanLine, found);
  if (!v.ok) return { ok: false, reason: v.message };
  const block: Block = { ...v.block, label: before.label };
  if (before.figures === undefined) delete block.figures;
  else block.figures = before.figures;
  return { ok: true, block };
}

/** 새로 생긴 근거 밖 숫자(recheckMgSection — 블록 고치기 저장과 같은 숫자 대조) — 있으면 못 받는 까닭, 없으면 null */
function freshNumbers(cur: ReportSectionSpec, next: ReportSectionSpec, input: MgFillInput): string | null {
  const recheck = (s: ReportSectionSpec) => recheckMgSection(s, input.card, input.known, input.year, input.today).unknownNumbers;
  const was = new Set(recheck(cur));
  const fresh = recheck(next).filter((x) => !was.has(x));
  return fresh.length ? `근거 밖 숫자 ${fresh.length}개(${fresh.slice(0, 3).join(", ")})` : null;
}

/**
 * 되살린 블록 받기(결정론): trial = cur의 pos 자리에 빈 모양을 끼운 초안. 블록 정리(settle — 같은 종류·원문 대조·라벨·그림 자리 원래 값) → 모양이 빈 모양(구성안 모양)과 같고 →
 * 빈 곳(blankParts)이 없고 → 새 근거 밖 숫자가 없고(cur와 견줌) → 배정이 있으면 받은 뒤 어림이 배정 × (1 + MG_VOLUME_BAND) 안일 때만.
 * 칸 수는 보지 않음(acceptFill과 다름): 빈 모양의 칸 수는 구성안 어림이고 지킬 원래 글이 없으며(표의 행·열은 근거 값 수대로), 구성안 지킴 셈(planAdherence)도 종류·모양만 봄.
 * 사람이 고친 블록 표시(humanEdits)에는 넣지 않음(AI 글). mm = cur 대비 늘어난 어림(블록 하나가 통째로 더해짐)
 */
export function acceptMissing(cur: ReportSectionSpec, trial: ReportSectionSpec, pos: number, out: BlockOutput, input: MgFillInput, found: (q: string) => boolean, target: number | null): { ok: true; spec: ReportSectionSpec; mm: number } | { ok: false; reason: string } {
  const before = trial.blocks![pos];
  const v = settle(before, out, found);
  if (!v.ok) return v;
  if (blockShapeCode(v.block) !== blockShapeCode(before)) return { ok: false, reason: "모양이 바뀜" };
  const blank = blankParts(v.block);
  if (blank || !blockTexts({ ...v.block, label: "" }).some((t) => t.trim())) return { ok: false, reason: `빈 칸이 남음${blank ? `(${blank}곳)` : ""}` };
  const next: ReportSectionSpec = { ...applyBlockEdit(trial, pos, v.block) };
  if (trial.humanEdits) next.humanEdits = trial.humanEdits;
  else delete next.humanEdits;
  const fresh = freshNumbers(cur, next, input);
  if (fresh) return { ok: false, reason: fresh };
  const h1 = mgSpecHeight(next);
  if (target !== null && h1 > target * (1 + MG_VOLUME_BAND)) return { ok: false, reason: `분량이 배정의 ${Math.round((1 + MG_VOLUME_BAND) * 100)}%를 넘음` };
  return { ok: true, spec: next, mm: Math.round(h1 - mgSpecHeight(cur)) };
}

const addUsage = (a: Usage, b: Usage) => {
  a.input += b.input;
  a.output += b.output;
  a.cacheRead += b.cacheRead;
  a.cacheWrite += b.cacheWrite;
  a.cacheWrite1h += b.cacheWrite1h;
};

/**
 * 분량 채움 보강: 빠진 구성안 블록도 1회차 사유·고를 블록도 없으면 null(보강 안 함). 먼저 빠진 블록(missingBlocks — 데이터 블록 먼저)마다 빈 모양을 구성안 자리에 끼워
 * fill.missing 요청으로 채우고 acceptMissing을 넘으면 넣음(못 받으면 끼우지 않은 초안 그대로 — 빈 모양이 남지 않음, 시간·호출 한도 멈춤은 라운드와 같음, 시간이면 라운드도 없음). 라운드(MG_FILL.rounds까지)마다 고른 블록을 하나씩 차례로(동시 2건 중 한 자리만 씀) — 블록마다 시작 전에
 * 기한 안에 한 번 더 부를 시간이 있는지(canFixAgain: 지금까지 + 직전 호출 ms × 1.1 ≤ 기한, 첫 블록은 1차 집필 ms로 어림. 기한 = deps.deadlineMs와 보강 시작 + MG_FILL.maxSec 중 이른 것) 보고,
 * 시간이 없으면 보강을 끝내고, 호출 한도에 걸리면 그 라운드를 끝냄(기다리지 않음). 앞 블록을 받은 초안 위에서 다음 블록 요청 글을 만듦.
 * 2회차는 1회차 뒤 다시 잰 어림이 아직 배정 × MG_FILL.low 미만일 때만 — 보강할 수 있는 블록 전부(pickFillTargets all: 1회차에 몫을 다 쓴 블록·못 받은 블록 포함)를
 * 남은 분량을 다시 나눈 새 몫으로 고름. 받기 조건(acceptFill — 높이 감소·배정 125% 초과·새 반복 거절)은 라운드마다 같음.
 * 보강 라운드 뒤(시간이 모자라 끝나지 않았으면) 반복 수치·문장이 남았으면 「반복 정리」 한 라운드(pickFillTargets repeat — 반복 블록만, 몫 0)
 */
export async function runMgFill(spec: ReportSectionSpec, input: MgFillInput, deps: MgFillDeps): Promise<MgFillRun | null> {
  const now = deps.now ?? Date.now;
  const deadline = Math.min(deps.deadlineMs, now() - deps.t0 + MG_FILL.maxSec * 1000);
  const outline = `${cardOutline(input.card)}\n${inspectionCardText(input.card)}`;
  // 원문 대조 글·근거 글은 블록 고치기(edit-actions.ts quoteHay·runDraftBlockEdit)와 같음
  const hay = evidenceKey(input.card, input.known, input.quoteOnly);
  const found = (q: string) => quoteFoundIn(hay, q);
  const evidence = { card: outline, extra: input.known };
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };
  const first = mgFillReasons(spec, input.card, input.plan, input.refs);
  const rounds: FillRound[] = [];
  let cur = spec;
  let last = deps.firstMs;
  // 0. 빠진 구성안 블록 되살리기 — 라운드 앞에 다 끝냄(끼우면 뒤 블록 번호가 바뀌므로 1~3의 사유·고르기는 되살린 초안에서 다시 잼)
  const plan = input.plan;
  const missing = plan ? missingBlocks(spec, plan, input.dropped, input.closed) : [];
  const revived: FillResult[] = [];
  let timeUp = false;
  for (const [k, m] of missing.entries()) {
    const pb = plan!.blocks[m.plan];
    const head = { round: 0, plan: m.plan, label: m.label, share: null };
    // 시작하지 않은 블록(이것부터 끝까지) — 자리는 지금 초안 기준
    const rest = (reason: string) => missing.slice(k).forEach((x) => revived.push({ round: 0, plan: x.plan, label: x.label, share: null, index: missingSlot(cur, plan!, x.plan) ?? -1, ok: false, reason }));
    if (!canFixAgain(now() - deps.t0, last, deadline)) {
      rest("시간이 모자라 시작하지 않음");
      timeUp = true;
      break;
    }
    const pos = missingSlot(cur, plan!, m.plan);
    if (pos === null) {
      revived.push({ ...head, index: -1, ok: false, reason: "끼울 자리가 없어짐" });
      continue;
    }
    const trial = insertBlock(cur, pos, emptyBlock(pb), m.at);
    // 재료는 그 블록이 가리키는 구성안 재료(자료 필요는 뺌), 원문 구절은 앱이 근거에서 찾은 것만
    const materials = pb.materials.flatMap((id) => plan!.materials.filter((x) => x.id === id && x.kind !== "need").map((x) => ({ id: x.id, text: x.text, quote: x.found ? x.quote : "" })));
    const t: FillTarget = { index: pos, why: "missing", boxes: [], share: null, facts: [], refFacts: [], repeats: [], sentences: [], conflicts: [], missing: { label: m.label, shape: shapeName(pb.kind, pb.variant), purpose: pb.purpose, materials } };
    // 글 한도는 블록 몫 없이(사람 블록 고치기와 같은 「지금 줄 + 4줄」 — 빈 모양이라 지금 줄은 1줄 안팎)
    const prompt = blockEditPrompt(deps.prompts, trial, { blockIndex: pos, kind: "edit", request: fillRequestText(deps.prompts, t), quote: "" }, evidence);
    const t1 = now();
    let got: FillCall;
    try {
      got = await deps.call(prompt, t);
    } catch (e) {
      got = { ok: false, stop: false, message: e instanceof Error ? e.message : String(e) };
    }
    const ms = now() - t1;
    last = ms;
    if (!got.ok && got.stop) {
      rest(`호출 한도(${got.message})`);
      break;
    }
    if (!got.ok) {
      revived.push({ ...head, index: pos, ok: false, ms, reason: got.message });
      continue;
    }
    addUsage(usage, got.usage);
    const a = acceptMissing(cur, trial, pos, got.output.block, input, found, first.target);
    if (a.ok) {
      // 앞서 되살린 블록 중 이 자리 뒤의 것은 한 칸 밀림(결과 번호 = 보강을 마친 초안의 번호 — 라운드는 블록을 끼우거나 빼지 않음)
      for (const r of revived) if (r.ok && r.index >= pos) r.index += 1;
      cur = a.spec;
    }
    revived.push({ ...head, index: pos, ms, usage: got.usage, model: got.model, ...(a.ok ? { ok: true, mm: a.mm } : { ok: false, reason: a.reason }) });
  }
  // 한 라운드: 고른 블록을 하나씩 차례로 — 앞 블록을 받은 초안 위에서 다음 블록 요청 글(다른 블록에 이미 있는 것 목록 포함)을 만듦
  const runRound = async (round: number, reasons: MgFillReasons, targets: FillTarget[], cleanup: boolean): Promise<FillRound> => {
    const start = now();
    const before = Math.round(mgSpecHeight(cur));
    const results: FillResult[] = [];
    let skipped: FillRound["skipped"] = null;
    for (const [k, t] of targets.entries()) {
      const rest = () => targets.slice(k).map((x) => x.index);
      if (!canFixAgain(now() - deps.t0, last, deadline)) {
        skipped = { why: "time", blocks: rest() };
        break;
      }
      const label = cur.blocks![t.index].label;
      const share = t.share ?? undefined;
      const req = { blockIndex: t.index, kind: "edit" as const, request: fillRequestText(deps.prompts, t, blockRoom(cur, t.index, share), cur), quote: "" };
      // 글 한도의 여유는 블록 몫(배정이 없으면 블록 고치기와 같은 「지금 줄 수 안팎」)
      const prompt = blockEditPrompt(deps.prompts, cur, req, evidence, undefined, share);
      const t1 = now();
      let got: FillCall;
      try {
        got = await deps.call(prompt, t);
      } catch (e) {
        got = { ok: false, stop: false, message: e instanceof Error ? e.message : String(e) };
      }
      const ms = now() - t1;
      last = ms;
      if (!got.ok && got.stop) {
        skipped = { why: "limit", blocks: rest(), message: got.message };
        break;
      }
      const head = { round, ...(cleanup ? { cleanup } : {}), index: t.index, label, share: t.share, ms };
      if (!got.ok) {
        results.push({ ...head, ok: false, reason: got.message });
        continue;
      }
      addUsage(usage, got.usage);
      const a = acceptFill(cur, t.index, got.output.block, input, found, reasons.target, t.repeats, t.sentences, t.conflicts);
      results.push({ ...head, usage: got.usage, model: got.model, ...(a.ok ? { ok: true, mm: a.mm, ...(a.repeats ? { repeats: a.repeats } : {}), ...(a.sentences ? { sentences: a.sentences } : {}), ...(a.conflicts ? { conflicts: a.conflicts } : {}) } : { ok: false, reason: a.reason }) });
      if (!a.ok) continue;
      cur = a.spec;
    }
    return { round, ...(cleanup ? { cleanup } : {}), reasons, targets, results, skipped, before, after: Math.round(mgSpecHeight(cur)), ms: now() - start };
  };
  for (let round = 1; !timeUp && round <= MG_FILL.rounds; round++) {
    const reasons = round === 1 && cur === spec ? first : mgFillReasons(cur, input.card, input.plan, input.refs);
    if (round > 1 && !reasons.short) break;
    const targets = pickFillTargets(cur, reasons, input.closed, { all: round > 1 });
    if (!targets.length) break;
    const r = await runRound(round, reasons, targets, false);
    rounds.push(r);
    if (r.skipped?.why === "time") timeUp = true;
  }
  // 반복 정리(2026-10-29 저녁): 보강 라운드 뒤 반복 수치·문장(2026-10-30 — 값 충돌도)이 남았고 시간이 있으면 그 블록만 한 라운드 더(몫 0 — 늘리지 않고 바꿈)
  if (!timeUp) {
    const reasons = mgFillReasons(cur, input.card, input.plan, input.refs);
    const targets = reasons.repeats.length || reasons.sentences.length || reasons.conflicts.length ? pickFillTargets(cur, reasons, input.closed, { repeat: true }) : [];
    if (targets.length) rounds.push(await runRound(rounds.length + 1, reasons, targets, true));
  }
  if (!rounds.length && !revived.length) return null;
  return { spec: cur, reasons: first, missing, revived, rounds, before: first.height, after: Math.round(mgSpecHeight(cur)), usage };
}

/** 블록별로 모은 결과 — 고른 블록(라운드 순 첫 등장), 한 번이라도 받은 블록, 끝내 못 받은 블록의 마지막 까닭 */
function byBlock(run: MgFillRun): { picked: number[]; ok: Set<number>; failed: Array<{ index: number; why: string }> } {
  const picked = [...new Set(run.rounds.flatMap((r) => r.targets.map((t) => t.index)))];
  const results = run.rounds.flatMap((r) => r.results);
  const ok = new Set(results.filter((r) => r.ok).map((r) => r.index));
  const why = new Map<number, string>();
  for (const r of run.rounds) {
    for (const x of r.results) if (!x.ok) why.set(x.index, x.reason ?? "까닭 모름");
    for (const i of r.skipped?.blocks ?? []) why.set(i, r.skipped!.why === "time" ? "시간이 모자라 시작하지 않음" : `호출 한도(${r.skipped!.message ?? "1분 5회·동시 2건"})`);
  }
  return { picked, ok, failed: picked.filter((i) => !ok.has(i) && why.has(i)).map((i) => ({ index: i, why: why.get(i)! })) };
}

/**
 * 보강 경고(참고 — warning-levels.ts 「분량 보강」·「분량 보강 실패」): 받은 블록·채운 mm(2회차면 「2회차」, 반복 정리 라운드면 「반복 정리」)·반복 수치 결과(「반복 뺌 …」·「반복 그대로 …」)·
 * 반복 문장 결과(「반복 문장 바꿈 n개」·「반복 그대로 「글 앞부분…」」)와 분량 전후, 되살린 빠진 블록은 앞에 「빠진 블록 되살림: 번호 「라벨」 +mm」,
 * 어느 라운드에서도 못 받거나 시작하지 않은 블록은 「1차 글 유지」와 마지막 까닭, 못 되살린 빠진 블록은 「「라벨」(모양) — 까닭」
 */
export function fillWarnings(run: MgFillRun): string[] {
  const out: string[] = [];
  const ok = run.rounds.flatMap((r) => r.results).filter((r) => r.ok);
  const labelAt = (i: number) => run.spec.blocks?.[i]?.label ?? "";
  const back = run.revived.filter((r) => r.ok);
  const lost = run.revived.filter((r) => !r.ok);
  const missingName = (r: FillResult) => `「${r.label.trim() || "전폭"}」(${run.missing.find((m) => m.plan === r.plan)?.shape ?? ""})`;
  if (ok.length || back.length) {
    const mm = (n = 0) => `${n >= 0 ? "+" : ""}${n}mm`;
    const one = (r: FillResult) =>
      [
        `${blockName(r.index, r.label)} ${mm(r.mm)}`,
        r.cleanup ? "반복 정리" : r.round > 1 ? `${r.round}회차` : "",
        r.repeats?.removed.length ? `반복 뺌 ${r.repeats.removed.join(", ")}` : "",
        r.repeats?.kept.length ? `반복 그대로 ${r.repeats.kept.join(", ")}` : "",
        r.sentences?.fixed.length ? `반복 문장 바꿈 ${r.sentences.fixed.length}개` : "",
        r.sentences?.kept.length ? `반복 그대로 ${r.sentences.kept.map(clipText).join(", ")}` : "",
        r.conflicts?.fixed.length ? `충돌 값 뺌 ${r.conflicts.fixed.map((x) => `「${x}」`).join(", ")}` : "",
        r.conflicts?.kept.length ? `충돌 값 그대로 ${r.conflicts.kept.map((x) => `「${x}」`).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("·");
    const blocks = new Set(ok.map((r) => r.index)).size;
    // 빠진 블록 되살림은 「분량 보강」 경고 안의 한 마디(새 앞머리 아님 — warning-levels.ts 그대로)
    const what = [back.length ? `빠진 블록 되살림: ${back.map((r) => `${blockName(r.index, r.label)} ${mm(r.mm)}`).join(" · ")}(구성안이 정한 블록을 집필이 빠뜨려 구성안 재료로 채움)` : "", ok.length ? `블록 ${blocks}개(${ok.map(one).join(" · ")})에 원장·근거 사실을 보탰습니다` : ""].filter(Boolean).join(" · ");
    out.push(`분량 보강: ${what} — 분량 어림 ${run.before} → ${run.after}${run.reasons.target ? `/${run.reasons.target}` : ""}mm. 보탠 글을 원자료로 확인해 주세요.`);
  }
  const { failed } = byBlock(run);
  const lostText = lost.length ? `빠진 블록 ${lost.length}개는 되살리지 못했습니다(${lost.map((r) => `${missingName(r)} — ${r.reason ?? "까닭 모름"}`).join(" / ")})` : "";
  const failedText = failed.length ? `블록 ${failed.length}개는 1차 글을 유지했습니다(${failed.map((x) => `${blockName(x.index, labelAt(x.index))} — ${x.why}`).join(" / ")})` : "";
  if (failedText || lostText) out.push(`분량 보강 실패: ${[failedText, lostText].filter(Boolean).join(" · ")}.`);
  return out;
}

/**
 * 보강 뒤 저장할 값: 초안 = 다시 점검(recheckMgSection — 블록 고치기 저장과 같은 셈)한 것, 숫자 = 그 다시 점검의 근거 밖 숫자,
 * 경고 = 1차 경고 중 다시 점검이 만들지 않는 것(구성안 지킴·뺀 블록·추진성과 보강·첨부 등 집필 때만 셈하는 경고 — 1차 초안을 다시 점검한 경고와 견줘 가름)
 * + 보강한 초안의 다시 점검 경고 + 보강 경고(fillWarnings)
 */
export function mgFillPatch(first: { spec: ReportSectionSpec; warnings: string[] }, run: MgFillRun, input: MgFillInput): { spec: ReportSectionSpec; warnings: string[]; unknownNumbers: string[] } {
  const recheck = (s: ReportSectionSpec) => recheckMgSection(s, input.card, input.known, input.year, input.today);
  const again = new Set(recheck(first.spec).warnings);
  const after = recheck(run.spec);
  let kept = first.warnings.filter((w) => !again.has(w));
  let spec = after.spec;
  // 빠진 블록을 되살렸으면 구성안 지킴을 다시 셈(서버 writeMgDraft와 같은 planAdherence·같은 글) — 1차의 그 경고를 새 셈으로 바꾸고(다 맞으면 뺌) 초안의 짜임 칩(spec.plan)도
  if (input.plan && run.revived.some((r) => r.ok)) {
    const a = planAdherence(input.plan, spec.blocks ?? [], input.dropped);
    const w = mgAdherenceWarning(a);
    kept = kept.flatMap((x) => (x.startsWith(ADHERENCE_HEAD) ? (w ? [w] : []) : [x]));
    if (spec.plan) spec = { ...spec, plan: { ...spec.plan, matched: a.matched, total: a.total } };
  }
  return { spec, warnings: [...kept, ...after.warnings, ...fillWarnings(run)], unknownNumbers: after.unknownNumbers };
}

/** 구성안 지킴 경고의 앞부분(mgAdherenceWarning — 되살린 뒤 다시 셀 때 1차의 그 경고를 찾음) */
const ADHERENCE_HEAD = "구성안: 승인한 짜임 ";

/** 경영관리 구성안 지킴 경고(서버 draft-write.ts writeMgDraft·연기 시험이 같은 글) — 짜임이 같으면 null */
export function mgAdherenceWarning(a: { matched: number; total: number; same: boolean }): string | null {
  return a.same ? null : `${ADHERENCE_HEAD}${a.total}블록 중 ${a.matched}블록만 같은 순서로 썼습니다 — 다시 만들거나 구성안을 고쳐 주세요.`;
}

/** 집필 결과 알림 끝에 붙는 보강 한 줄(앞에 빈칸 — 알림 글에 이어 붙임). 보강하지 않았으면 빈 글 */
export function fillMessage(run: MgFillRun | null, second: FirstThenFillSecond, error: string | null = null): string {
  if (second === "conflict") return " 그사이 초안이 바뀌어 분량 보강 결과는 저장하지 않았습니다(1차 초안은 저장됨).";
  if (second === "error") return ` 분량 보강을 저장하지 못했습니다(1차 초안은 저장됨${error ? ` — ${error}` : ""}).`;
  if (second !== "saved" || !run) return "";
  const b = byBlock(run);
  const back = run.revived.length ? `·빠진 블록 ${run.revived.filter((r) => r.ok).length}/${run.revived.length}개 되살림` : "";
  return ` 분량 보강 블록 ${b.ok.size}/${b.picked.length}개${run.rounds.length > 1 ? `·${run.rounds.length}회` : ""}${back}(분량 어림 ${run.before} → ${run.after}${run.reasons.target ? `/${run.reasons.target}` : ""}mm).`;
}

// ---------------------------------------------------------------------------
// 4. 저장

/** 보강 결과 저장 — none: 보강 결과 없음(저장 안 함) · saved · conflict: 그 사이 초안이 바뀌어 건너뜀 · error: 보강 중 오류나 저장 실패 */
export type FirstThenFillSecond = "none" | "saved" | "conflict" | "error";

export type FirstThenFill<T> = { ok: false; conflict: boolean; message: string } | { ok: true; version: string; second: FirstThenFillSecond; value: T | null; message: string | null };

/**
 * 1차 초안 저장 → 보강 → 조건 갱신(draft-store.ts saveDraftRow 두 번): 1차는 base(시작할 때 읽은 버전) 조건으로 먼저 저장(보강이 실패하거나 오래 걸려도 1차가 남음 —
 * 주요사업 자동 고치기 onFirst와 같은 뜻), 1차 저장이 실패하면 보강하지 않음. 보강(fill)이 값을 주면 1차 저장이 돌려준 updated_at 조건으로만 갱신 — 그 사이 사람이
 * 고쳤으면(조건 불일치) 덮지 않고 건너뜀. fill이 던지면 1차만 남기고 error
 */
export async function saveFirstThenFill<T>(db: SupabaseClient, key: { cardId: string; year: number }, row: Record<string, unknown>, base: string | null, fill: () => Promise<{ patch: Record<string, unknown>; value: T } | null>): Promise<FirstThenFill<T>> {
  const first = await saveDraftRow(db, key, row, base);
  if (!first.ok) return { ok: false, conflict: first.conflict, message: first.message };
  let got: { patch: Record<string, unknown>; value: T } | null;
  try {
    got = await fill();
  } catch (e) {
    console.error("saveFirstThenFill fill", e);
    return { ok: true, version: first.version, second: "error", value: null, message: e instanceof Error ? e.message : String(e) };
  }
  if (!got) return { ok: true, version: first.version, second: "none", value: null, message: null };
  const second = await saveDraftRow(db, key, got.patch, first.version);
  if (second.ok) return { ok: true, version: second.version, second: "saved", value: got.value, message: null };
  return { ok: true, version: first.version, second: second.conflict ? "conflict" : "error", value: got.value, message: second.message };
}
