// 공통지표(BZ-4) 조각이 어느 주요사업 지표의 이야기인지 판별(순수).
// 공통지표 조각은 사업마다 한 덩어리로 적재돼(실사 질의응답·지적·평가위원 의견) 예전에는 모든 과제에 같이 줬지만, 다른 사업 지표의 조각은 이 과제와 무관합니다.
// 1순위는 적재 때 지표 사전(dictionaries.ts METRICS_2025)으로 기록한 `meta.related_business`입니다(실사·중간보고서 지적·평가위원 의견 파서가 적고 지적 연결도 같은 값을 씀).
// 그 값이 없는 조각만 조각에 이미 있는 글로 보조 판별합니다: 키(`…/BZ-4/BZ-n/…`)·`meta.metric_tag`·`meta.metric_2025`·질문 머리 괄호의 지표명·위치 글의 「질문 N: (지표명)」(증빙 그림).
// 판별 못 하면 null — 총평·편람처럼 사업에 속하지 않거나 모르는 조각은 모든 과제에 그대로 둡니다(빼지 않음).

import type { BusinessId } from "./types.ts";

/** (보조) 2025 지표명(조각에 적힌 이름)이 가리키는 주요사업. 지표 이름이 연도마다 달라 낱말 조각으로 견줌 — 2026 개선(안)에서도 소속이 바뀌지 않은 지표만 둠(근로자 무사고 달성 노력은 주요사업2→1로 옮겨져 일부러 뺌) */
const INDICATOR_OWNER: Array<[RegExp, BusinessId]> = [
  [/전파품질/, "BZ-1"],
  [/공공용/, "BZ-1"],
  [/인명구조|인명안전|재난경보|재난\s*관리/, "BZ-2"],
  [/전자파/, "BZ-2"],
  [/방송콘텐츠|OTT|방송/, "BZ-3"],
  [/ICT\s*기금|기금/, "BZ-3"],
];

/** 글에 든 지표명으로 소속 사업 — 한 사업으로만 모이면 그 사업, 아니면 null */
function ownerOfName(s: string | null | undefined): BusinessId | null {
  const hit = new Set<BusinessId>();
  for (const [re, biz] of INDICATOR_OWNER) if (re.test(s ?? "")) hit.add(biz);
  return hit.size === 1 ? [...hit][0] : null;
}

/** 「질문: (지표명) …」·「요청: (지표명) …」 머리의 괄호 글 */
function leadingIndicator(s: unknown): string | null {
  const m = /^\s*(?:질문|요청)?\s*:?\s*[(（]([^)）]{2,40})[)）]/.exec(String(s ?? ""));
  return m ? m[1] : null;
}

interface OwnerInput {
  chunk_key: string;
  text?: string | null;
  context_prefix?: string | null;
  meta?: Record<string, unknown> | null;
}

/** 공통지표(BZ-4) 조각의 소속 주요사업(모르면 null). 호출하는 쪽이 조각이 BZ-4인지 먼저 확인함 */
export function commonKpiOwner(c: OwnerInput): BusinessId | null {
  const m = c.meta ?? {};
  // 1순위: 적재 때 기록한 소속 사업(지표 사전). 주요사업 BZ-1~3만 인정 — 공통지표(BZ-4) 자신이나 모르는 값은 건너뜀
  if (typeof m.related_business === "string" && /^BZ-[123]$/.test(m.related_business)) return m.related_business as BusinessId;
  const byKey = /\/BZ-4\/(BZ-[123])\//.exec(c.chunk_key);
  if (byKey) return byKey[1] as BusinessId;
  const tagged = ownerOfName(typeof m.metric_tag === "string" ? m.metric_tag : null) ?? ownerOfName(typeof m.metric_2025 === "string" ? m.metric_2025 : null);
  if (tagged) return tagged;
  const lead = leadingIndicator(m.question) ?? leadingIndicator(String(c.text ?? "").split("\n", 1)[0]);
  if (lead) return ownerOfName(lead);
  // 증빙 그림 조각: 위치 글에 부모 질문이 「질문 11: (지표명) …」로 적혀 있음
  const parent = /질문\s*\d+\s*:\s*[(（]([^)）]{2,40})[)）]/.exec(c.context_prefix ?? "");
  return parent ? ownerOfName(parent[1]) : null;
}
