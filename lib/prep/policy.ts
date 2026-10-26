// 서버 액션 뒤 after()가 자동으로 돌릴 작업 종류(결정 P5). 입출력 없음.

import type { PrepKind } from "./types.ts";

/** 처리기가 있는 종류(3-5 재정의로 자료 매칭·목록표 작업은 없앰) */
export const ALL_PREP_KINDS: readonly PrepKind[] = ["match_knowledge"];

/**
 * - Vercel 운영: 자동(2026-09-30 사용자 결정 — 카드 저장 뒤 after()로 공통 지식 매칭을 돌림)
 * - PREP_AUTORUN=all: 자동(로컬에서도) / off: 자동 처리 없음(Vercel에서도 끔 — 수동 `pnpm prep run --ai`)
 * - 그 밖(로컬 개발): 자동 처리 없음 — 처리기가 모두 AI 호출이라 `pnpm prep run --ai`로 직접 돌려 CLI 사용량을 모르게 쓰지 않는다
 */
export function prepAutoKinds(env: Record<string, string | undefined>): PrepKind[] {
  if (env.PREP_AUTORUN === "off") return [];
  if (env.VERCEL || env.PREP_AUTORUN === "all") return [...ALL_PREP_KINDS];
  return [];
}
