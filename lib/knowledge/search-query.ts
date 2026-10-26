// PGroonga 질의(&@~) 조립. 낱말마다 색인과 같은 정규화(foldForSearch)를 한 뒤 큰따옴표로 감쌉니다.
// 전체를 한꺼번에 접으면 연산자 OR가 낱말 'or'가 되므로, 연산자는 정규화 뒤에 붙입니다.

import { foldForSearch } from "./normalize.ts";

/** all: 모든 낱말 포함(AND), any: 하나라도 포함(OR, 점수로 순위) */
export function buildSearchQuery(text: string, mode: "all" | "any" = "any"): string {
  const terms = foldForSearch(text)
    .split(/\s+/)
    .map((t) => t.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ""))
    .filter((t) => t.length > 0);
  const unique = [...new Set(terms)];
  return unique.map((t) => `"${t.replace(/[\\"]/g, "\\$&")}"`).join(mode === "any" ? " OR " : " ");
}
