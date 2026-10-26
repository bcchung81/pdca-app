// 카드 JSON 두 벌의 글 차이(작성본 확정 전 비교). 파생 값(line·raw 등)은 빼고 사람이 쓴 글·체크만 봅니다.

import type { LooseJson } from "../loose-json.ts";

export interface CardChange {
  path: string;
  section: string;
  before: string;
  after: string;
}

const SECTION: Record<string, string> = {
  title: "과제명",
  indexTitle: "과제명",
  overview: "과제 개요",
  kpi: "계량 성과지표",
  strategy: "전략 연계",
  act: "[Act] 지적사항·자체평가",
  feedback: "전년도 환류",
  findings: "지적 및 개선방안",
  plan: "[Plan] 추진 계획",
  do: "[Do] 추진 실적",
  check: "[Check] 점검",
  outcome: "성과",
  axAttachment: "AX 첨부",
  axAttachments: "AX 첨부",
  manager: "담당자",
  writer: "담당자",
  targetBusiness: "대상사업",
  executionTask: "실행과제",
};

// 원문 보관용·파생 키(체크 상자 값은 글 칸의 ☑/□에서 다시 계산되므로 글 칸 차이로 보임)
const SKIP = new Set(["raw", "source", "parseWarnings", "sectionOrder", "periodTokens", "periodLines", "nameRaw", "markerSource", "checks", "categories", "esg"]);

function leaves(o: LooseJson, path: string, out: Map<string, string>) {
  if (o === null || o === undefined) return;
  if (typeof o === "string") {
    out.set(path, o);
    return;
  }
  if (typeof o === "boolean") {
    out.set(path, o ? "☑" : "□");
    return;
  }
  if (typeof o === "number") {
    out.set(path, String(o));
    return;
  }
  if (Array.isArray(o)) {
    o.forEach((v, i) => leaves(v, path ? `${path}.${i}` : String(i), out));
    return;
  }
  if (typeof o === "object") {
    for (const [k, v] of Object.entries(o)) {
      if (SKIP.has(k)) continue;
      leaves(v, path ? `${path}.${k}` : k, out);
    }
  }
}

/** before → after에서 바뀐 글 칸(추가·삭제 포함). 순서는 after의 칸 순서, 삭제는 뒤에 */
export function diffCards(before: LooseJson, after: LooseJson): CardChange[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  leaves(before ?? {}, "", a);
  leaves(after ?? {}, "", b);
  const changes: CardChange[] = [];
  for (const [path, v] of b) {
    const old = a.get(path) ?? "";
    if (old.trim() !== v.trim()) changes.push({ path, section: sectionOf(path), before: old, after: v });
  }
  for (const [path, v] of a) if (!b.has(path) && v.trim()) changes.push({ path, section: sectionOf(path), before: v, after: "" });
  return changes;
}

export function sectionOf(path: string): string {
  return SECTION[path.split(".")[0]] ?? "기타";
}
