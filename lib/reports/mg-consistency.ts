// 경영관리 경평 초안 「값 충돌」·「제목 완료형」 결정론 점검(순수, 2026-10-30 한 카드 재생성 평가 후속).
// ① 값 충돌: 카드 원장(구판)과 첨부(신판)처럼 근거끼리 같은 항목 값이 다를 때, 구성안이 절 why에 「값 어긋남 → 쓴 값」을 적고 집필 요청에도
//    「버린 값은 다른 블록에도 쓰지 않습니다」가 있었지만 집필이 버린 값을 두 블록에 그대로 씀 — 프롬프트만으로는 안 지켜져 구성안 답에 구조(conflicts)를 두고
//    코드가 근거 수치로 거른 뒤(cleanConflicts) 초안 줄에서 버린 값을 찾음(conflictHits — 막힘 경고 「값 충돌」, 분량 보강 mg-fill.ts가 고칠 대상으로도 씀).
// ② 제목 완료형: 절 제목은 「…확정」·「…정착으로 …상승」인데 같은 절 줄은 「(12월 예정)」·「추진 중」 — 제목 결과 쪽의 완료 끝말과 같은 절 계획 줄(result-plan.ts planMarker)이
//    같은 대상을 말하면 참고 경고 「제목 완료형」.
// 과제·지표·카드 문장으로 가르는 분기 없음 — 모든 경영관리 카드에 같은 규칙.

import { stripNeeds } from "./actuals.ts";
import { type Block, blockTexts } from "./blocks.ts";
import { plainText } from "./fit.ts";
import { bigramSet, textSimilarity } from "./ground.ts";
import type { MgConflict, MgPart } from "./mg-types.ts";
import { figureKeys } from "./repeat-figures.ts";
import { PLAN_OVERLAP_MIN, planMarker, refMonthOf } from "./result-plan.ts";
import { type ReportSectionSpec, cleanLine, numberTokens, quoteFoundIn } from "./section.ts";

// ---------------------------------------------------------------------------
// ① 값 충돌

/** 값 충돌 상한 — 예전에는 절마다 why에 한 줄(「값 어긋남: …」)로 적던 것이라 절 상한(mg-outline.ts MG_LIMITS.parts 8 — 순환 import를 피해 값만 같게 둠)만큼 */
export const MG_CONFLICT_MAX = 8;

/** 구성안 답의 값 충돌 한 건(모두 문자열 — enum·literal로 묶지 않음) */
export interface ConflictOut {
  item?: unknown;
  drop?: unknown;
  keep?: unknown;
  why?: unknown;
}

/** 수치 열쇠(값 + 단위 — 흔한 값도 셈: 한 자리 건수·유형 수의 어긋남이 흔함) */
const keysOf = (s: string) => new Set(figureKeys(s, true).keys());

/** 쓰지 않을 값에만 있는 수치 열쇠(쓸 값에도 있는 수치는 빼 — 그 수치가 든 줄은 쓸 값을 쓴 줄일 수 있음) */
export const dropOnlyKeys = (c: Pick<MgConflict, "drop" | "keep">) => {
  const keep = keysOf(c.keep);
  return new Set([...keysOf(c.drop)].filter((k) => !keep.has(k)));
};

/** 숫자 대조 열쇠(composition.ts cleanMaterials의 num과 같은 정규화 — 쉼표·빈칸 뺌, 끝 %·배는 뗀 것도 봄) */
const num = (tok: string) => tok.replace(/,/g, "").replace(/\s+/g, "");

/**
 * 구성안 답의 값 충돌 정리(결정론 — 지어낸 충돌 방지): 항목·두 값이 있고, 두 값 모두 수치 열쇠(값 + 단위)가 있고, 쓰지 않을 값에만 있는 수치가 있고(두 값의 수치가 같으면 버림),
 * 두 값의 숫자가 모두 근거 수치(known — 구성안 재료 대조와 같은 knownNumbers)에 있을 때만 남김. 근거 수치 목록은 한 자리 수를 담지 않으므로(section.ts numberTokens 규칙)
 * 숫자 토막이 없는 값(한 자리 건수만)은 그 구절이 근거 원문에 있을 때(quoteFoundIn)만. 같은 항목·같은 두 값은 한 번, MG_CONFLICT_MAX건까지.
 * 길이: 두 값은 절 제목과 같은 80자, 출처·시점은 핵심 메시지와 같은 120자, 항목 이름은 40자(라벨 24자보다 넉넉한 명사구)
 */
export function cleanConflicts(raw: readonly ConflictOut[] | undefined, hayKey: string, known: Set<string>): MgConflict[] {
  const isKnown = (t: string) => known.has(num(t)) || known.has(num(t).replace(/(%|배)$/, ""));
  const grounded = (s: string) => {
    const toks = numberTokens(s);
    return toks.length ? toks.every(isKnown) : quoteFoundIn(hayKey, s);
  };
  const out: MgConflict[] = [];
  for (const x of (raw ?? []).slice(0, MG_CONFLICT_MAX * 2)) {
    const c: MgConflict = { item: cleanLine(x?.item, 40), drop: cleanLine(x?.drop, 80), keep: cleanLine(x?.keep, 80), why: cleanLine(x?.why, 120) };
    if (!c.item || !c.drop || !c.keep) continue;
    if (!keysOf(c.keep).size || !dropOnlyKeys(c).size) continue;
    if (!grounded(c.drop) || !grounded(c.keep)) continue;
    if (out.some((y) => y.item === c.item && y.drop === c.drop && y.keep === c.keep)) continue;
    out.push(c);
    if (out.length >= MG_CONFLICT_MAX) break;
  }
  return out;
}

/** 두 충돌이 같은지(사람 편집·절 다시 짜기에서 합칠 때) */
export const sameConflict = (a: MgConflict, b: MgConflict) => a.item === b.item && a.drop === b.drop && a.keep === b.keep;

/** 글의 주제 글자 두 개 묶음(숫자는 뺌 — 값이 아니라 대상으로 견줌) */
const subject = (s: string) => bigramSet(plainText(stripNeeds(s)).replace(/\d+/g, " "));

/** 묶음 a 중 b에 있는 비율(a가 비면 0) */
const share = (a: Set<string>, b: Set<string>) => {
  if (!a.size) return 0;
  let hit = 0;
  for (const g of a) if (b.has(g)) hit += 1;
  return hit / a.size;
};

/**
 * 줄 하나가 이 충돌의 버린 값을 쓴 줄인지: 쓰지 않을 값에만 있는 수치 열쇠(dropOnlyKeys)가 줄에 있고, 그 줄이 같은 대상을 말함 —
 * 항목 이름 또는 쓰지 않을 값 구절(숫자 뺀 글자 두 개 묶음)의 PLAN_OVERLAP_MIN(0.5) 이상이 그 줄(+ topic — 블록 라벨: 라벨 사다리의 왼쪽 칸이 그 행의 주제 이름)에 있음.
 * 문턱은 result-plan.ts의 「줄이 카드 계획 줄 하나와 많이 겹침」과 같은 값을 다시 씀(초안 줄 ↔ 짧은 근거 구절이 같은 대상인지 가르는 같은 뜻) —
 * 같은 「N건」이라도 다른 대상의 줄(항목 낱말이 절반도 없음)은 안 걸림. 항목·구절 모두 글자 두 개 묶음이 없으면(대상을 못 가림) 걸지 않음
 */
export function conflictLine(line: string, c: Pick<MgConflict, "item" | "drop" | "keep">, topic = ""): boolean {
  const drop = dropOnlyKeys(c);
  const have = keysOf(line);
  if (![...drop].some((k) => have.has(k))) return false;
  const lb = bigramSet(plainText(stripNeeds(`${topic} ${line}`)));
  return Math.max(share(subject(c.item), lb), share(subject(c.drop), lb)) >= PLAN_OVERLAP_MIN;
}

/**
 * 블록의 줄 단위: 제목·본문·불릿은 한 줄씩, 칸은 머리·꼬리표·불릿·결과 줄을 이은 한 줄(표 행은 머리 = 행 이름, 불릿 = 열 값이라 값과 대상이 다른 글에 있음 — 수치 띠도 머리 = 값),
 * 전후 행·막대도 한 줄씩. 라벨은 줄 단위가 아니라 대상 글(topic)로만 봄
 */
const unitLines = (b: Block) =>
  [b.title, b.text, ...b.items, ...b.cells.map((c) => [c.head, c.tag, ...c.bullets, c.note].join(" ")), ...b.rows.map((r) => [r.key, ...r.before, ...r.after].join(" ")), ...b.series.map((x) => `${x.label} ${x.value}`), b.badge].filter((x) => x.trim());

/** 블록 하나에서 버린 값을 쓴 줄 */
const blockHits = (b: Block, c: MgConflict) => [...new Set(unitLines(b))].filter((line) => conflictLine(line, c, b.label));

/** 초안의 버린 값 줄 하나 — 블록 번호·충돌·줄 */
export interface ConflictHit {
  index: number;
  conflict: MgConflict;
  line: string;
}

/** 초안 블록 줄(unitLines) 중 버린 값을 쓴 줄(spec.mg.conflicts — 없으면 빈 목록). 충돌 순 → 블록 순, 같은 블록의 같은 글은 한 번 */
export function conflictHits(spec: Pick<ReportSectionSpec, "blocks" | "mg">): ConflictHit[] {
  const out: ConflictHit[] = [];
  for (const c of spec.mg?.conflicts ?? []) (spec.blocks ?? []).forEach((b, index) => out.push(...blockHits(b, c).map((line) => ({ index, conflict: c, line }))));
  return out;
}

/** 블록 하나에서 버린 값이 남은 충돌(분량 보강 받기 셈 — mg-fill.ts acceptFill) */
export const conflictsInBlock = (b: Block, conflicts: readonly MgConflict[]) => conflicts.filter((c) => blockHits(b, c).length > 0);

const blockName = (index: number, label: string) => `${index + 1}번${label.trim() ? ` 「${label.trim()}」` : ""}`;

/**
 * 경고(막힘 — warning-levels.ts 「값 충돌」: 사실 어긋남): 충돌마다 한 줄 — 버린 값이 남은 블록(3개까지 이름, 넘으면 「외 N개」). 집필 점검(verifyMgDraft)·다시 점검(recheckMgSection)이
 * 같은 spec에서 같은 글을 냄(구성안이 아니라 spec.mg.conflicts만 봄)
 */
export function conflictWarnings(spec: Pick<ReportSectionSpec, "blocks" | "mg">): string[] {
  const hits = conflictHits(spec);
  const blocks = spec.blocks ?? [];
  return (spec.mg?.conflicts ?? []).flatMap((c) => {
    const at = [...new Set(hits.filter((h) => h.conflict === c).map((h) => h.index))];
    if (!at.length) return [];
    const where = at.slice(0, 3).map((i) => blockName(i, blocks[i].label)).join("·") + (at.length > 3 ? ` 외 ${at.length - 3}개` : "");
    return [`값 충돌: 「${c.item}」의 쓰지 않을 값 「${c.drop}」이 ${where} 블록에 남음 — 더 최근 근거의 값 「${c.keep}」으로 고치거나 그 줄을 빼 주세요${c.why ? `(${c.why})` : ""}.`];
  });
}

// ---------------------------------------------------------------------------
// ② 제목 완료형

/**
 * 완료(이미 이룬 상태)를 뜻하는 절 제목 끝말: report-draft-mg/process.md 5번이 센 2025 경영관리 절 제목 끝말(강화·제고·확보·확대·구축) 중 완료형인 「구축」,
 * report-draft-mg/inputs.md가 작성일 뒤 일에 쓰지 말라고 한 완료형(마련·반영)과 같은 계열(확정·정착·확립·완료·완성·달성·실현),
 * 「A로 B 상승」 같은 인과의 결과 쪽 변화 낱말(상승·향상·증가·감소·단축·절감). 방향 낱말(강화·제고·확대·확보·고도화)은 진행 중에도 쓰는 말이라 넣지 않음.
 * 뒤에 끝·빈칸·문장부호·조사(으로·로·및·과·와)가 올 때만(낱말 안의 같은 글자는 아님)
 */
const DONE_RE = /(확정|정착|확립|완료|완성|달성|구축|마련|반영|실현|상승|향상|증가|감소|단축|절감)(?=$|[\s,·.)」』]|으로|로|및|과|와)/;

/** 제목을 수단·결과 마디로 나누는 이음(「…을 통한/통해 …」·「…을 위한 …」·「…으로/로 …」·쉼표 — process.md 5번이 센 2025 제목의 이음 꼴) */
const LINK_RE = /\s*(?:을|를)?\s?통(?:한|해)\s+|\s*(?:을|를)?\s?위한\s+|(?<=[가-힣%\d])(?:으로|로)\s+|\s*[,，]\s*/;

/** 제목의 완료 주장 마디(완료 끝말이 든 마디 — 「A 정착으로 B 상승」이면 둘 다) */
export const doneClaims = (title: string) => title.split(LINK_RE).map((s) => s.trim()).filter((s) => DONE_RE.test(s));

/**
 * 제목 완료형(결정론): 절 표지가 있는 절마다 제목의 완료 주장 마디(doneClaims)가 있고, 같은 절 블록 글(blockTexts) 중 계획 표지(result-plan.ts planMarker — 예정·할 계획·향후,
 * 작성일 기준 아직 안 온 연·월)가 든 줄이 그 마디와 같은 대상을 말하면 [절, 마디, 줄]. 같은 대상 = 줄에서 계획 표지·숫자를 뺀 글과 마디의 닮은 정도(ground.ts textSimilarity —
 * 짧은 쪽 묶음 기준)가 PLAN_OVERLAP_MIN(0.5 — result-plan.ts 「줄이 계획 줄과 많이 겹침」과 같은 값) 이상. 절마다 첫 줄 하나만
 */
export function titleDoneHits(spec: Pick<ReportSectionSpec, "blocks" | "mg">, today?: string): Array<{ part: MgPart; claim: string; line: string; mark: string }> {
  const ref = refMonthOf(today);
  const at = spec.mg?.at ?? [];
  const blocks = spec.blocks ?? [];
  const out: Array<{ part: MgPart; claim: string; line: string; mark: string }> = [];
  for (const p of spec.mg?.parts ?? []) {
    const claims = p.mark ? doneClaims(p.title) : [];
    if (!claims.length) continue;
    const lines = blocks.flatMap((b, i) => (at[i] === p.key ? blockTexts(b) : [])).filter((x) => x.trim());
    let found: { claim: string; line: string; mark: string } | null = null;
    for (const line of lines) {
      const mark = planMarker(line, ref);
      if (!mark) continue;
      const content = stripNeeds(line).replace(mark, " ").replace(/\d+/g, " ");
      const claim = claims.find((c) => textSimilarity(content, c) >= PLAN_OVERLAP_MIN);
      if (claim) {
        found = { claim, line, mark };
        break;
      }
    }
    if (found) out.push({ part: p, ...found });
  }
  return out;
}

const clip = (s: string, n = 30) => {
  const t = plainText(s).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
};

/** 경고 한 줄(참고 — warning-levels.ts 「제목 완료형」). 없으면 null. 절 3개까지 보임 */
export function titleDoneWarning(spec: Pick<ReportSectionSpec, "blocks" | "mg">, today?: string): string | null {
  const hits = titleDoneHits(spec, today);
  if (!hits.length) return null;
  const shown = hits.slice(0, 3).map((h) => `${h.part.mark}. 「${clip(h.claim)}」 ↔ 「${clip(h.line)}」`);
  const more = hits.length > 3 ? ` 외 ${hits.length - 3}개` : "";
  return `제목 완료형: ${shown.join(" / ")}${more} — 절 제목은 완료로 썼는데 같은 절 줄은 계획(${[...new Set(hits.map((h) => `「${h.mark}」`))].slice(0, 3).join("·")}) — 끝나지 않은 일은 제목도 진행형(…추진·착수)으로, 인과(「A로 B 상승」)는 근거에 있을 때만`;
}
