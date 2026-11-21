// 작성지원(개선 제안·실적 발굴·실적 반영)에 주는 최근 점검표 요약(순수). 질문과 같은 요약(chat.ts inspectionBrief — 수치·추진현황·개선방향·미흡 항목 보완방안)에
// ★사례제안(지침 09 모드 B·절대원칙 3 예외의 유일한 타기관 사례 원천)과 경영관리 체크리스트 대조의 '부분'·'아니오' 행(지침 08 모드 A·B)을 더합니다. 점검표 문장은 바꾸지 않습니다.
// writer.ts에 두지 않는 까닭: chat.ts가 writer.ts를 import해 writer.ts → chat.ts는 순환이 됨

import { inspectionBrief } from "./chat.ts";
import { type InspectionResult, overviewLines } from "../inspections/model.ts";

/** 최종 점검표(보낸·확인한 것 중 점검월이 가장 늦은 1건) → 작성지원 요청 글의 「최근 점검표」 글 */
export function assistInspectionBrief(ins: { period: string; status: string; result: InspectionResult }): string {
  const cases = overviewLines(ins.result).find((x) => x.mark === "★")?.lines ?? [];
  const lines = [inspectionBrief(ins), `★사례제안: ${cases.join(" / ") || "—"}`];
  for (const row of ins.result.checklist?.rows ?? []) {
    if (row.result === "부분" || row.result === "아니오") lines.push(`[체크리스트 대조 ${row.label} — ${row.result}] ${row.point}${row.note ? ` / ${row.note}` : ""}`);
  }
  return lines.join("\n");
}
