import type { InspectionResult } from "../../lib/inspections/model.ts";
import { InspectionSheet, TallyLine } from "./inspection-sheet";

/** 받은 점검표 읽기(부서 담당자) — 「AI 컨설팅 결과」 양식 그대로, 점검 수치·보완할 것 바로가기를 위에 */
export function InspectionView({ result, date }: { result: InspectionResult; date?: string | null }) {
  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <TallyLine result={result} />
      <InspectionSheet result={result} date={date} />
    </div>
  );
}
