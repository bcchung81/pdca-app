// AI 가점 실사(사업 미지정 가점 트랙 실사 조각 — 지금은 att3-2604 「AI 활용을 통한 혁신(가점)」)를 관련 카드의 묶음에만 넣는 판정. 순수 함수.
// 예전에는 두 트랙 모든 카드의 ② 층에 들어갔습니다(layerOf). 2026-11-21 사용자 결정(docs/reference-materials.md D21)으로 다음 중 하나일 때만 넣습니다:
//  ① 과제 대응표(auto·confirmed)에 가점 실사 조각이 하나라도 연결됨 — 매칭기가 찾은 것은 빼지 않음
//  ② 주요사업 카드 전략 연계성의 AI활용 칸이 채워짐(지침 09: AX 검토과제는 카드의 AI활용 칸 대조에 씀)
//  ③ 경영관리 지표 13(AI 활용 혁신) — 가점 실사가 곧 이 지표의 실사
// 거르기는 공통 지식 묶음(buildBundle)과 경평 평가 관점의 선별 자리(lib/reports/lens-queries.ts)에서 같은 판정(bonusDrop)으로 합니다.
// layerOf는 그대로라 과제 매칭 후보·크기 보호·규칙 문서 범위는 최대 범위를 봅니다.

import { BIZ_TRACK, trackSpecOfUnit } from "../tracks/index.ts";
import { chunkRole } from "./chunk-role.ts";

/** 가점 조각의 knowledge_chunks.track */
export const BONUS_TRACK = "가점";
/** 경영관리 AI 활용 혁신 지표 */
export const BONUS_MG_UNIT = "MG-13";
/** AI활용 칸의 「없음」 표기(공백을 빼고 견줌) */
const NONE_MARKS = new Set(["해당사항없음", "해당없음", "없음", "-"]);

/** 관련 판정의 갈래 — linked = 대응표 연결, ai = 주요사업 AI활용 칸, mg13 = 경영관리 지표 13 */
export type BonusReason = "linked" | "ai" | "mg13";

/** 판정에 쓰는 조각 칸 */
type BonusChunk = { chunk_key: string; track: string; business: string | null; doc_id: string; unit_type: string; meta?: Record<string, unknown> | null };

/** 거르기 대상 조각: 가점 트랙 · 사업 미지정 · 실사 성격(chunkRole survey). 가점 트랙의 다른 성격 조각은 대상이 아님(지금처럼 넣음) */
export function isBonusSurvey(c: Omit<BonusChunk, "chunk_key">): boolean {
  return c.track === BONUS_TRACK && c.business == null && chunkRole(c) === "survey";
}

/** 카드 전략 연계성의 AI활용 칸(data.strategy.ai)이 채워졌는지 — 체크했거나, 글이 비지 않고 「없음」 표기가 아님 */
export function aiFieldFilled(data: unknown): boolean {
  const ai = (data as { strategy?: { ai?: { text?: unknown; checked?: unknown } } } | null)?.strategy?.ai;
  if (!ai || typeof ai !== "object") return false;
  if (ai.checked === true) return true;
  const text = typeof ai.text === "string" ? ai.text.replace(/\s+/g, "") : "";
  return text !== "" && !NONE_MARKS.has(text);
}

/** 이 카드가 가점 실사와 관련 있는 갈래(겹치면 모두). 비면 관련 없음 — unit = 공통 지식 ③을 읽는 단위(경영관리는 지표 MG-n), linkedBonus = 대응표에 가점 실사 조각이 연결됨 */
export function bonusReasons(o: { unit: string; data: unknown; linkedBonus: boolean }): BonusReason[] {
  const out: BonusReason[] = [];
  if (o.linkedBonus) out.push("linked");
  if (trackSpecOfUnit(o.unit).id === BIZ_TRACK.id && aiFieldFilled(o.data)) out.push("ai");
  if (o.unit === BONUS_MG_UNIT) out.push("mg13");
  return out;
}

/**
 * 이 카드 요청에서 뺄 조각인지 가르는 판정 — 무관 카드(bonusReasons가 빔)면 가점 실사, 관련 카드면 아무것도 안 뺌.
 * chunks = 이 트랙 조각 전부(연결된 키가 가점 실사인지 보려고), linked = 과제 대응표 auto·confirmed 키 전부(유형으로 거르지 않은 것)
 */
export function bonusDrop(chunks: readonly BonusChunk[], o: { unit: string; data: unknown; linked: readonly string[] }): (c: BonusChunk) => boolean {
  const linked = new Set(o.linked);
  const relevant = bonusReasons({ unit: o.unit, data: o.data, linkedBonus: chunks.some((c) => isBonusSurvey(c) && linked.has(c.chunk_key)) }).length > 0;
  return (c) => !relevant && isBonusSurvey(c);
}
