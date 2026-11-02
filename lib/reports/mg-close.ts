// 경영관리 초안의 닫는 「추진성과」 원장 보강(순수 함수, 2026-10-29).
// 구성안의 절에 라벨 「추진성과」 블록이 있는데 집필이 그 블록을 빼거나 성과 글 없이(비었거나 목표·예정 글뿐) 냈으면,
// 카드 원장(정량 성과 칸·정성 성과 칸·월별 실적의 수치 줄)에 있는 줄만으로 라벨 「추진성과」 블록(구성안·초안 블록과 같은 bullets 또는 stats — 그 밖의 모양은 안 건드림)을 구성안 자리에 넣거나 채움.
// 원장에 없는 말은 만들지 않음(지어내기 없음 — 쓸 줄이 없으면 아무것도 안 함). 표본 카드·지표별 분기 없음.
// 2026-10-29 후속: ① 추진성과 행에 막대(chart)만 남았으면 막대 앞에 원장 줄 글 블록을 넣어 [성과 문장 | 막대]로(렌더러 k-row2) ② 원장 줄 하나는 한 절에만 —
// 다른 절 글에 같은 수치·같은 문장이 있는 줄은 건너뛰고, 절마다 그 절 글과 수치·낱말이 겹치는 줄을 먼저 고름(절마다 똑같은 보강 상자를 막음).
// 2026-10-29 절 성과 배정: 구성안이 그 절 추진성과 블록에 배정한 재료가 가리키는 원장 줄(outcomeRefs)을 먼저 고르고, 다른 보강 절에 배정된 줄은 그 절에 남겨 둠.

import type { LooseJson as Json } from "../loose-json.ts";
import { hasFigure, needsIn, yearActuals } from "./actuals.ts";
import { type Block, blockTexts } from "./blocks.ts";
import { SAME_TEXT_MIN, SAME_TEXT_MIN_BIGRAMS } from "./business-layout.ts";
import type { Composition } from "./composition.ts";
import { bigramSet, overlapScore, textSimilarity } from "./ground.ts";
import { type LayoutBlock, layoutFields, layoutGroups } from "./layout.ts";
import { CLOSE_LABEL, outcomeRefs } from "./mg-outcomes.ts";
import type { MgOutcome } from "./mg-types.ts";
import { figureKeys } from "./repeat-figures.ts";

// 닫는 성과 행의 라벨(CLOSE_LABEL)·재료 → 원장 줄 잇기(outcomeRefs)는 순환 없는 잎 모듈 mg-outcomes.ts에 둠(mg-outline.ts도 씀 — 2026-10-29 순환 import 오류)
export { CLOSE_LABEL, outcomeRefs } from "./mg-outcomes.ts";
/** 2025 보고서 추진성과 행은 2~4줄 */
export const CLOSE_ITEMS_MAX = 4;

const PLAN_WORD = /예정|예상|목표|계획|전망/;
/** 계획·목표 줄인가 — 「계획 대비 3배」·「목표 대비 120%」는 견준 결과라 계획 낱말로 안 셈(2026-10-29: 원장 정량 성과 「…31건(계획대비 3배)」가 빠졌음) */
export const isPlanLine = (l: string) => PLAN_WORD.test(l.replace(/(계획|목표)\s*대비/g, ""));
const BULLET = /^[∙·•\-－○◦▪□■◆※*]\s*/;
const isHead = (s: string) => BULLET.test(s);

/** 칸의 줄들 → 글머리 하나가 한 줄(글머리 없이 이어지는 줄은 앞 줄에 붙임), 글머리 기호는 뗌 */
function itemsOf(raw: unknown): string[] {
  const out: string[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (typeof r !== "string" || !r.trim()) continue;
    const line = r.trim();
    if (out.length && !isHead(line)) out[out.length - 1] += ` ${line}`;
    else out.push(line);
  }
  return out.map((l) => l.replace(BULLET, "").trim());
}

/**
 * 원장 성과 재료(수치 든 줄 → 정성 줄 순, 중복 뺌, 최대 max — 기본 CLOSE_ITEMS_MAX): 정량 성과 칸 · 월별 실적의 수치 줄(표 칸 포함 — actuals.ts yearActuals wide) · 정성 성과 칸.
 * 예정·예상·목표·계획·전망 줄(「계획·목표 대비」는 결과라 남김 — isPlanLine)과 【확인】 줄은 뺌. 구성안 요청 「절 성과 재료」·구성안 점검 「성과 배정」·추진성과 보강이 같은 목록을 씀(2026-10-29)
 */
export function ledgerOutcomeItems(card: Json, clean: (s: unknown, max?: number) => string, max = CLOSE_ITEMS_MAX): MgOutcome[] {
  const usable = (l: string) => l.length >= 4 && /[0-9가-힣]/.test(l) && !isPlanLine(l) && !needsIn(l).length;
  const tag = (from: MgOutcome["from"]) => (text: string) => ({ text, from, figure: hasFigure(text) });
  const quant = itemsOf(card?.outcome?.quantitative).filter(usable).map(tag("quantitative"));
  const qual = itemsOf(card?.outcome?.qualitative).filter(usable).map(tag("qualitative"));
  const monthly = yearActuals(card, "", { wide: true }).monthly.map((m) => m.line.replace(BULLET, "").trim()).filter(usable).map(tag("monthly"));
  const figured = [...quant, ...monthly, ...qual].filter((x) => x.figure);
  const rest = [...quant, ...qual].filter((x) => !x.figure);
  const seen = new Set<string>();
  const out: MgOutcome[] = [];
  for (const x of [...figured, ...rest]) {
    const line = clean(x.text, 200);
    const key = line.replace(/\s+/g, "");
    if (!line || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...x, text: line });
    if (out.length >= max) break;
  }
  return out;
}

/** 원장 성과 줄(ledgerOutcomeItems의 글만) */
export function ledgerOutcomeLines(card: Json, clean: (s: unknown, max?: number) => string, max = CLOSE_ITEMS_MAX): string[] {
  return ledgerOutcomeItems(card, clean, max).map((x) => x.text);
}

const isClose = (b: { label: string }) => b.label.trim() === CLOSE_LABEL;
/** 막대(시각 블록) — 글 블록 옆 오른쪽 칸에만 놓이는 블록 */
const isChart = (b: { kind: string }) => b.kind === "chart";

/** 이 블록에 성과 글(라벨 빼고, 목표·예정 낱말이 없는 글)이 하나라도 있는가 */
function hasResultText(b: Block): boolean {
  const own = blockTexts({ ...b, label: "" });
  return own.some((t) => t.trim() && !isPlanLine(t));
}

export interface CloseFill {
  /** 보강한 절 열쇠 */
  keys: string[];
  /** 넣은 원장 줄 수(절마다 합) */
  lines: number;
  /** 새로 넣거나 바꿔 세운 블록의 모양 — 앱이 정리하며 뺐다고 센 같은 모양은 되살린 것이라 셈에서 되돌려야 함(planAdherence) */
  shapes: Array<{ kind: string; variant: string }>;
  warnings: string[];
}

/** 보강할 자리 하나: 넣기(insert — at 자리 앞)·바꾸기(replace — at 블록), 모양, 그 자리에서 뺄 옛 블록(바꾸기면 그 블록 — 겹침 셈에서 뺌) */
interface CloseSlot {
  key: string;
  mode: "insert" | "replace";
  at: number;
  kind: "bullets" | "stats";
  variant: string;
  /** 막대만 남은 추진성과 행을 채우는 자리인가(경고 문구) */
  chart: boolean;
}

/** 보강 자리 찾기(절 하나): 막대만 남은 추진성과 행 → 막대 앞에 넣기, 빠지거나 성과 글 없는 추진성과 → 구성안 자리 넣기·바꾸기. 없으면 null */
function slotOf(key: string, plan: Composition, blocks: Block[]): CloseSlot | null {
  if (!blocks.length) return null;
  const planned = plan.blocks.filter((b) => b.at === key);
  const plannedText = planned.find((b) => isClose(b) && !isChart(b));
  const close = blocks.map((b, i) => (isClose(b) ? i : -1)).filter((i) => i >= 0);
  // ① 추진성과 행에 글 블록 없이 막대만: 구성안 그 절 추진성과 글 블록의 모양(bullets·stats), 없거나 그 밖이면 stats
  if (close.length && close.every((i) => isChart(blocks[i]))) {
    const kind = plannedText?.kind === "bullets" ? "bullets" : "stats";
    return { key, mode: "insert", at: close[0], kind, variant: plannedText?.kind === kind ? plannedText.variant : "", chart: true };
  }
  // ② 구성안에 추진성과가 있는데 초안이 빼거나 성과 글 없이 냄 — 모양은 원래 블록(초안에 있으면 그것, 없으면 구성안의 것)을 따름, bullets·stats만
  const k = planned.findIndex(isClose);
  if (k < 0) return null;
  const have = close.find((i) => !isChart(blocks[i]));
  if (have !== undefined && hasResultText(blocks[have])) return null;
  const from = have !== undefined ? blocks[have] : planned[k];
  if (from.kind !== "bullets" && from.kind !== "stats") return null;
  return have !== undefined ? { key, mode: "replace", at: have, kind: from.kind, variant: from.variant, chart: false } : { key, mode: "insert", at: Math.min(k, blocks.length), kind: from.kind, variant: from.variant, chart: false };
}

/** 문장 겹침 판정에 쓸 글(라벨·짧은 이름 뺀 글) */
const sentencesOf = (b: Block) => blockTexts({ ...b, label: "" });

/**
 * 절마다 블록 목록(got)을 제자리에서 보강. (a) 구성안 그 절에 라벨 「추진성과」 블록이 있고 초안 그 절에 라벨 「추진성과」 블록이 없으면 구성안과 같은 순서 자리에 넣고,
 * (b) 있는데 성과 글이 없으면 그 블록을 원장 줄 블록으로 바꾸고, (c) 라벨 「추진성과」 행에 막대만 있으면 막대 앞에 같은 라벨 글 블록을 넣음.
 * 이미 성과 글이 있으면 그대로. 절 자체가 없거나 비어 있으면(절을 안 쓴 것) 건드리지 않음.
 * 원장 줄 나누기: 한 줄은 한 절에만. 다른 절 글(블록·이미 나눈 줄)에 같은 수치(figureKeys)나 같은 문장(textSimilarity ≥ SAME_TEXT_MIN)이 있는 줄, 그 절 글에 같은 문장이 있는 줄은 그 절에 안 줌.
 * 절을 돌아가며 한 줄씩(절마다 CLOSE_ITEMS_MAX까지) — 구성안이 그 절 추진성과에 배정한 줄(재료 → 원장 줄, outcomeRefs) → 그 절 글과 같은 수치 수 → 글자 두 개 묶음 겹침(overlapScore) → 원장 순서로 고름.
 * 다른 보강 절에만 배정된 줄은 그 절에 남겨 둠(배정 줄도 다른 절 글과 겹치면 쓰지 않음 — 위 규칙이 앞섬). 남은 줄이 없는 절은 보강하지 않고 경고만
 * (빈 상자를 만들지 않음 — 닫지 않은 절은 「절:」 경고가 따로 알림)
 */
export function fillClosingOutcome(plan: Composition, got: Map<string, { blocks: Block[] }>, card: Json, clean: (s: unknown, max?: number) => string): CloseFill {
  const res: CloseFill = { keys: [], lines: 0, shapes: [], warnings: [] };
  const order = new Map((plan.mg?.parts ?? []).map((p, i) => [p.key, i]));
  const keys = [...got.keys()].sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  const slots = keys.map((key) => slotOf(key, plan, got.get(key)!.blocks)).filter((x): x is CloseSlot => x !== null);
  if (slots.length) {
    const pool = ledgerOutcomeLines(card, clean, Infinity);
    // 구성안이 절마다 닫는 「추진성과」 블록에 배정한 원장 줄(그 블록 재료가 가리키는 줄 — outcomeRefs)
    const refs = outcomeRefs(plan.materials, pool);
    const assigned = new Map(slots.map((x) => [x.key, new Set(plan.blocks.filter((b) => b.at === x.key && isClose(b)).flatMap((b) => b.materials.flatMap((id) => refs.get(id) ?? [])))]));
    // 다른 보강 절에만 배정된 줄은 그 절 몫(이 절이 먼저 집어 가지 않음)
    const reserved = (key: string, i: number) => !assigned.get(key)!.has(i) && slots.some((x) => x.key !== key && assigned.get(x.key)!.has(i));
    // 절마다 이미 있는 글(바꿀 블록은 뺌)
    const texts = new Map(keys.map((key) => {
      const g = got.get(key)!;
      const slot = slots.find((x) => x.key === key);
      return [key, g.blocks.filter((_, i) => !(slot?.mode === "replace" && slot.at === i)).flatMap(sentencesOf)];
    }));
    const picked = new Map<string, number[]>(slots.map((x) => [x.key, []]));
    const othersOf = (key: string) => [...keys.filter((k) => k !== key).flatMap((k) => texts.get(k) ?? []), ...[...picked].filter(([k]) => k !== key).flatMap(([, xs]) => xs.map((i) => pool[i]))];
    const taken = new Set<number>();
    const scoreOf = (line: string, own: string[]) => {
      const mine = figureKeys(own.join("\n"));
      return { figs: [...figureKeys(line).keys()].filter((f) => mine.has(f)).length, overlap: overlapScore(line, bigramSet(own.join("\n"))) ?? 0 };
    };
    // 다른 절 글과는 같은 수치·같은 문장 모두 안 됨, 그 절 글과는 같은 문장만 안 됨(같은 수치는 그 절 성과로 닫는 줄이라 먼저 고름)
    const usable = (line: string, others: string[], own: string[]) => {
      const theirs = figureKeys(others.join("\n"));
      if ([...figureKeys(line).keys()].some((f) => theirs.has(f))) return false;
      // 같은 문장 판정은 양쪽 다 글자 두 개 묶음 SAME_TEXT_MIN_BIGRAMS 이상일 때만(사업 조판의 같은 문장 찾기와 같은 규칙 — 「개방 기준」 같은 짧은 이름이 긴 줄에 들어 1이 되는 것을 막음)
      const long = (t: string) => bigramSet(t).size >= SAME_TEXT_MIN_BIGRAMS;
      return !long(line) || ![...others, ...own].some((t) => long(t) && textSimilarity(line, t) >= SAME_TEXT_MIN);
    };
    for (let progress = true; progress; ) {
      progress = false;
      for (const slot of slots) {
        const mine = picked.get(slot.key)!;
        if (mine.length >= CLOSE_ITEMS_MAX) continue;
        const others = othersOf(slot.key);
        const own = texts.get(slot.key) ?? [];
        let best = -1;
        let bestScore = { mine: -1, figs: -1, overlap: -1 };
        pool.forEach((line, i) => {
          if (taken.has(i) || reserved(slot.key, i) || !usable(line, others, own)) return;
          // 구성안이 이 절에 배정한 줄 먼저, 그다음 그 절 글과 같은 수치 수 → 글자 두 개 묶음 겹침
          const sc = { mine: assigned.get(slot.key)!.has(i) ? 1 : 0, ...scoreOf(line, own) };
          if (sc.mine > bestScore.mine || (sc.mine === bestScore.mine && (sc.figs > bestScore.figs || (sc.figs === bestScore.figs && sc.overlap > bestScore.overlap)))) {
            best = i;
            bestScore = sc;
          }
        });
        if (best < 0) continue;
        mine.push(best);
        taken.add(best);
        progress = true;
      }
    }
    const skipped: string[] = [];
    let chartFilled = 0;
    // 넣기는 뒤 자리부터 해도 절마다 자리가 하나라 순번이 어긋나지 않음
    for (const slot of slots) {
      const items = picked.get(slot.key)!.sort((a, b) => a - b).map((i) => pool[i]);
      if (!items.length) {
        skipped.push(slot.key);
        continue;
      }
      const g = got.get(slot.key)!;
      const block: Block = {
        kind: slot.kind, label: CLOSE_LABEL, title: "", variant: slot.variant, text: "", rows: [], series: [], badge: "",
        items: slot.kind === "bullets" ? [...items] : [],
        cells: slot.kind === "stats" ? items.map((l) => ({ head: "", tag: "", bullets: [l], note: "" })) : [],
      };
      if (slot.mode === "replace") {
        const old = g.blocks[slot.at];
        g.blocks[slot.at] = { ...block, ...(old.layout ? { layout: old.layout } : {}), ...(old.span ? { span: old.span } : {}) };
      } else {
        // 막대 앞에 넣는 글 블록은 막대와 같은 그릇(배치)에 — 같은 사다리 행이 되어 [글 | 막대]로 그려짐
        const chartLayout = slot.chart ? layoutFields({ kind: slot.kind, layout: g.blocks[slot.at].layout }) : {};
        g.blocks.splice(slot.at, 0, { ...block, ...chartLayout });
      }
      if (slot.chart) chartFilled += 1;
      res.shapes.push({ kind: slot.kind, variant: slot.variant });
      res.keys.push(slot.key);
      res.lines += items.length;
    }
    const filled = slots.filter((x) => res.keys.includes(x.key));
    const plainLines = filled.filter((x) => !x.chart).reduce((n, x) => n + picked.get(x.key)!.length, 0);
    if (filled.some((x) => !x.chart)) res.warnings.push(`추진성과 보강: 집필이 비운 추진성과를 원장 성과 줄 ${plainLines}개로 채움 — 문장을 다듬어 주세요`);
    if (chartFilled) res.warnings.push(`추진성과 보강: 막대만 남은 추진성과 행 ${chartFilled}곳의 왼쪽을 원장 성과 줄 ${res.lines - plainLines}개로 채움 — 문장을 다듬어 주세요`);
    if (skipped.length && pool.length) res.warnings.push(`추진성과 보강: 원장 성과 줄이 다른 절 글에 이미 쓰여(같은 수치·같은 문장) 절 ${skipped.length}개는 채우지 않음 — 그 절의 근거로 추진성과를 써 주세요`);
  }
  res.warnings.push(...loneChartWarnings(got));
  return res;
}

/**
 * 막대만 있는 사다리 행(라벨 「추진성과」 밖 — 근거 문장을 지어낼 수 없어 바꾸지 않음): 렌더러가 막대를 행 가운데 혼자 그려 좌우가 빔 → 참고 경고.
 * 라벨 「추진성과」 행은 fillClosingOutcome이 원장 줄로 채우고, 못 채웠으면 보강 경고가 알림
 */
function loneChartWarnings(got: Map<string, { blocks: Block[] }>): string[] {
  const labels: string[] = [];
  for (const { blocks } of got.values()) {
    for (const g of layoutGroups(blocks as LayoutBlock[])) {
      if (g.type !== "row" || g.label.trim() === CLOSE_LABEL) continue;
      if (g.units.flat().every((i) => isChart(blocks[i]))) labels.push(g.label);
    }
  }
  return labels.length ? [`막대: 글 블록 없이 막대만 있는 행 ${labels.length}곳(${labels.join("·")}) — 막대는 같은 라벨 글 블록의 오른쪽에 놓입니다. 같은 라벨에 근거 있는 글 블록을 더하거나 막대를 다른 행으로 옮겨 주세요`] : [];
}
