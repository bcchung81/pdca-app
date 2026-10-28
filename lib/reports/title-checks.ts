// 경평 초안 제목 점검(순수, 2026-10-28 사용자 결정 — 2025 주요사업 최종본 대조).
//  - 소항목 제목 한 줄 폭(주요사업): 2025 소항목 제목 62개는 모두 한 줄(가장 긴 것 166mm)인데 운영 초안 8장 중 4장이 판면 폭 170mm를 넘었음 —
//    「표지. 」 + 갈래 칩 + 제목 + 마커 칩의 폭을 판면 어림과 같은 글 폭 모델(fit.ts subTitleMm)로 재고, 넘치면 자동 고치기 사유(제목만 줄임)
//  - 블록 제목의 화살표(두 트랙, 참고): 「사후 확인 → AI 사전예방 전환」처럼 화살표 양쪽이 같은 대상을 가리키지 않으면 무엇이 바뀌었는지 안 보임 —
//    양쪽에 공유하는 낱말(두 글자 이상 한글 낱말의 두 글자 조각 또는 영문·숫자 낱말)이 없으면 알림(판정이 아니라 신호, 글은 바꾸지 않음)
//  - 표기 없는 상자(두 트랙, 참고): 상자형 도식이 라벨·제목·칸 머리·칩 없이 그려지면 무엇을 말하는 상자인지 안 보임(2026-10-28 표본 8장 중 4장 수치 띠)

import type { Block } from "./blocks.ts";
import { PAGE_MM, subTitleMax, subTitleMm } from "./fit.ts";
import { containerOf } from "./layout.ts";

export interface SubTitle {
  mark: string;
  title: string;
  chip?: string;
  markers?: readonly string[];
}

/** 소항목 제목이 한 줄(판면 폭)을 넘으면 경고 한 줄 — 자동 고치기 사유(lib/ai/fix-policy.ts shouldFix title). 맞으면 빈 배열 */
export function subTitleIssues(sub: SubTitle): string[] {
  const mm = subTitleMm(sub.title, sub);
  if (mm <= PAGE_MM.width) return [];
  const parts = [`「${sub.mark}. 」`, sub.chip ? `갈래 칩 [${sub.chip}]` : "", sub.markers?.length ? `마커 ${sub.markers.join("·")}` : ""].filter(Boolean).join("·");
  return [`제목 폭: 소항목 제목 한 줄이 약 ${Math.round(mm)}mm(${parts} 포함)로 판면 폭 ${PAGE_MM.width}mm를 넘습니다 — 제목을 한글 ${subTitleMax(sub)}자 안(지금 빈칸 포함 ${[...sub.title].length}자)으로 줄여 한 줄로 씁니다(2025 소항목 제목은 모두 한 줄)`];
}

/** 화살표 표기(→ 와 그 변형) */
const ARROW = /\s*(?:→|->|⇒|➔|➜|⟶)\s*/;

/** 화살표 한쪽 글의 낱말 조각: 한글 낱말(두 글자 이상)의 두 글자 조각 · 영문·숫자 낱말(두 글자 이상, 대소문자 무시) */
function pieces(side: string): { hangul: Set<string>; latin: Set<string> } {
  const hangul = new Set<string>();
  for (const [w] of side.matchAll(/[가-힣]{2,}/g)) for (let i = 0; i + 2 <= w.length; i++) hangul.add(w.slice(i, i + 2));
  const latin = new Set([...side.matchAll(/[A-Za-z0-9]{2,}/g)].map(([w]) => w.toLowerCase()));
  return { hangul, latin };
}

/**
 * 블록 제목이 화살표로 서로 다른 대상을 잇는지: 괄호 안(시점 비교 「(’25 → ’26)」 등)은 걷고, 이웃한 두 쪽이 모두 한글 낱말을 갖는데 공유하는 조각이 하나도 없으면 true.
 * 한쪽이 시점·수치뿐(한글 낱말 없음)이면 대상 비교가 아니라 보고 넘김
 */
export function arrowWithoutSharedNoun(title: string): boolean {
  const sides = title.replace(/\([^()]*\)|（[^（）]*）/g, " ").split(ARROW);
  for (let i = 0; i + 1 < sides.length; i++) {
    const a = pieces(sides[i]);
    const b = pieces(sides[i + 1]);
    if (!a.hangul.size || !b.hangul.size) continue;
    const shared = [...a.hangul].some((x) => b.hangul.has(x)) || [...a.latin].some((x) => b.latin.has(x));
    if (!shared) return true;
  }
  return false;
}

/** 블록 제목 화살표 경고(참고) — 걸린 제목을 3개까지 한 줄로. 없으면 빈 배열 */
export function arrowTitleWarnings(blocks: readonly Pick<Block, "title">[]): string[] {
  const bad = [...new Set(blocks.map((b) => b.title.trim()).filter((t) => t && arrowWithoutSharedNoun(t)))];
  if (!bad.length) return [];
  return [`블록 제목: ${bad.slice(0, 3).map((t) => `「${t}」`).join("·")} — 화살표 양쪽에 같은 대상(낱말)이 없어 무엇이 바뀌었는지 안 보입니다. 대상 명사가 든 한 줄로 쓰거나(「…을 A에서 B로」), 라벨·표 머리가 이미 전후를 말하면 제목을 비웁니다`];
}

/** 상자형 도식(렌더러가 상자로 그리는 종류) — 라벨·제목·칸 머리·칩이 모두 없으면 맨 상자 */
const BOX_KINDS: ReadonlySet<string> = new Set(["cards", "timeline", "hub", "quotes", "define", "band", "stats"]);

/**
 * 화면에 보이는 표기가 하나도 없는 상자형 블록인지(section-html.ts blockCore와 같은 규칙): 라벨은 사다리 행·단 띠일 때(band는 띠 안 라벨 칸), 제목은 quotes·band가 그리지 않음,
 * 칸 머리는 수치 띠(stats)에서는 큰 수치라 표기로 치지 않고 칩(tag)만 셈
 */
export function isBareBox(b: Pick<Block, "kind" | "label" | "title" | "layout" | "cells">): boolean {
  if (!BOX_KINDS.has(b.kind)) return false;
  const label = b.label.trim() && (b.kind === "band" || containerOf(b) !== "full");
  const title = b.title.trim() && b.kind !== "quotes" && b.kind !== "band";
  const heads = b.cells.some((c) => c.tag.trim() || (b.kind !== "stats" && c.head.trim()));
  return !label && !title && !heads;
}

/** 표기 없는 상자 경고(참고) — 걸린 블록 종류를 한 줄로. 없으면 빈 배열 */
export function bareBoxWarnings(blocks: readonly Pick<Block, "kind" | "label" | "title" | "layout" | "cells">[]): string[] {
  const bad = blocks.map((b, i) => (isBareBox(b) ? `${i + 1}번째 ${b.kind}` : "")).filter(Boolean);
  if (!bad.length) return [];
  return [`표기 없는 상자: ${bad.join("·")} 블록에 라벨·제목·칸 머리·칩이 하나도 없어 무엇을 말하는 상자인지 안 보입니다 — 라벨(사다리 행)이나 블록 제목을 붙여 주세요`];
}
