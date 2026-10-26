// 고정 영역(6월 셋업에서 성과관리팀이 확정): 주요사업은 Act(전년도 환류)·Plan(조치 및 개선방향)·계량 성과지표,
// 경영관리는 지침 08의 「고정영역」인 전년도 환류·지적 및 개선방안·계량 성과지표(2026-10-09).
// 확정 뒤 부서 작성본은 이 영역을 바꾸지 못합니다(DB 트리거 guard_card_version이 최종 판정 — 카드 종류를 같은 기준(묶음 id)으로 가름).

import { isMgmtCard } from "./mgmt-card.ts";
import type { LooseJson } from "../loose-json.ts";

export const FIXED_SECTIONS = ["act", "plan", "kpi"] as const;
export const FIXED_LABEL = "Act·Plan·계량지표";
export const MGMT_FIXED_SECTIONS = ["feedback", "findings", "kpi"] as const;
export const MGMT_FIXED_LABEL = "전년도 환류·지적 및 개선방안·계량지표";

/** 카드 종류별 고정 영역 구역 키 */
export const fixedSectionsOf = (card: LooseJson): readonly string[] => (isMgmtCard(card) ? MGMT_FIXED_SECTIONS : FIXED_SECTIONS);
/** 카드 종류별 고정 영역 이름(안내 문구용) */
export const fixedLabelOf = (card: LooseJson): string => (isMgmtCard(card) ? MGMT_FIXED_LABEL : FIXED_LABEL);
/** 트랙별 고정 영역 이름(목록·현황처럼 카드 한 장이 손에 없는 곳) */
export const fixedLabelOfTrack = (track: string): string => (track === "경영관리" ? MGMT_FIXED_LABEL : FIXED_LABEL);

/** 키 순서와 상관없는 JSON 글자(Postgres jsonb는 키 순서를 바꿔 저장하므로 비교에 씀) */
export function canonicalJson(v: LooseJson): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** before → after에서 고정 영역이 바뀌었나(DB 트리거의 jsonb 비교와 같게 키 순서 무시) */
export function fixedChanged(before: LooseJson, after: LooseJson): boolean {
  return FIXED_SECTIONS.some((k) => canonicalJson(before?.[k] ?? null) !== canonicalJson(after?.[k] ?? null));
}

/** AI 제안 등 경로가 고정 영역 안인가 */
export function inFixed(path: string | null | undefined): boolean {
  return Boolean(path) && FIXED_SECTIONS.some((k) => path === k || path!.startsWith(`${k}.`));
}
