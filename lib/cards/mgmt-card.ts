// 경영관리 카드인지(카드 JSON의 묶음 id가 `경영관리N`) — 주요사업 카드와 칸 이름이 달라 렌더러·저장 검증·AI 요청이 갈린다(순수).

import type { LooseJson } from "../loose-json.ts";

export const MGMT_GROUP_RE = /^경영관리\d+$/;

export function isMgmtCard(card: LooseJson): boolean {
  return MGMT_GROUP_RE.test(String(card?.group ?? ""));
}

/** 경영관리 카드가 가진 구역(저장 검증용) — 주요사업은 overview·kpi·strategy·act·plan·do·check·outcome */
export const MGMT_SECTIONS = ["overview", "feedback", "findings", "do", "kpi", "outcome"] as const;
