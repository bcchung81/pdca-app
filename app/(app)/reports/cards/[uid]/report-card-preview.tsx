import { ReportPreview } from "../../../../../components/reports/report-preview";
import { Empty, T } from "../../../../../components/ui/kit";
import { REPORT_CSS } from "../../../../../lib/reports/section-css.ts";
import { sectionHtml } from "../../../../../lib/reports/section-html.ts";
import type { ReportSectionSpec } from "../../../../../lib/reports/section.ts";

/**
 * 왼쪽 미리보기: 회색 바탕에 종이(작업 공간이 가운데에 두고 남는 폭에 맞춰 확대, 좁으면 가로 스크롤).
 * 블록마다 data-block(여백 메모 자리), 추진성과 상자는 data-result(블록 고치기 대상 -1)
 */
export function ReportCardPreview({ spec, unknown, weak, canWrite, hasOutline }: { spec: ReportSectionSpec | null; unknown: string[]; weak: string[]; canWrite: boolean; hasOutline: boolean }) {
  if (!spec) {
    return (
      <div className="w-[182mm]">
        <section className={T.wrap}>
          <Empty title="아직 초안이 없습니다.">
            {canWrite
              ? hasOutline
                ? "오른쪽에서 구성안을 확인하고 「승인하고 집필」을 누르세요."
                : "오른쪽 아래 요청 칸에서 시작하세요."
              : "이 과제를 맡은 부서나 성과관리팀이 만듭니다."}
          </Empty>
        </section>
      </div>
    );
  }
  return (
    <section aria-label="보고서 초안 미리보기" className="min-w-0">
      <style>{REPORT_CSS}</style>
      {/* 두 번 눌러 고치기 표지(editMarks)는 고칠 수 있을 때만(canWrite는 보관·부서 잠금·권한을 이미 반영) */}
      <ReportPreview html={sectionHtml(spec, unknown, { weak, blockMarks: true, resultMark: true, editMarks: canWrite && spec.version === 3 })} />
    </section>
  );
}
