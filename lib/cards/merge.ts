// 작성본 병합 확정(3-way, 구역 단위): 작성본을 시작할 때의 원장(base)과 비교해 부서가 바꾼 구역만 지금 원장에 반영합니다.
// 같은 구역을 원장(성과관리팀)도 바꿨으면 충돌로 알려 확정 전에 비교하게 합니다. 구역 = 카드 JSON의 맨 위 키.

import { sectionOf } from "./diff.ts";
import { canonicalJson } from "./fixed.ts";
import type { LooseJson } from "../loose-json.ts";

export interface MergeResult {
  merged: LooseJson;
  /** 부서가 바꾼 구역(맨 위 키) */
  changed: string[];
  /** 원장도 따로 바뀐 구역(작성본 쪽을 반영하면 원장 쪽 변경이 사라짐) */
  conflicts: string[];
}

const same = (a: LooseJson, b: LooseJson) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

/** base가 없으면(예전 작성본) 원장을 base로 봄 = 작성본과 다른 구역을 모두 반영 */
export function mergeDraft(ledger: LooseJson, base: LooseJson | null | undefined, draft: LooseJson): MergeResult {
  const from = base ?? ledger;
  const merged: LooseJson = { ...ledger };
  const changed: string[] = [];
  const conflicts: string[] = [];
  for (const k of new Set([...Object.keys(from ?? {}), ...Object.keys(draft ?? {})])) {
    if (same(draft?.[k], from?.[k])) continue;
    changed.push(k);
    if (!same(ledger?.[k], from?.[k]) && !same(ledger?.[k], draft?.[k])) conflicts.push(k);
    if (draft && k in draft) merged[k] = draft[k];
    else delete merged[k];
  }
  return { merged, changed, conflicts };
}

/** 충돌 구역 이름(화면용, 중복 제거) */
export function conflictLabels(keys: string[]): string[] {
  return [...new Set(keys.map((k) => sectionOf(k)))];
}
