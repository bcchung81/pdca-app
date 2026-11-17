import { ReportPreview } from "../../../../../components/reports/report-preview";
import { Empty, T } from "../../../../../components/ui/kit";
import { RECOUNT_FAIL_HEAD } from "../../../../../lib/reports/draft-recount.ts";
import { REPORT_CSS } from "../../../../../lib/reports/section-css.ts";
import { sectionHtml } from "../../../../../lib/reports/section-html.ts";
import type { ReportSectionSpec } from "../../../../../lib/reports/section.ts";

/**
 * 왼쪽 미리보기: 회색 바탕에 종이(작업 공간이 가운데에 두고 남는 폭에 맞춰 확대, 좁으면 가로 스크롤).
 * 블록마다 data-block(여백 메모 자리), 추진성과 상자는 data-result(블록 고치기 대상 -1)
 */
export function ReportCardPreview({ spec, unknown, weak, canWrite, hasOutline, broken }: { spec: ReportSectionSpec | null; unknown: string[]; weak: string[]; canWrite: boolean; hasOutline: boolean; /** 저장된 초안이 모양 검사에 걸린 까닭(lib/reports/draft-recount.ts readDraftSpec) — 있으면 그리지 않고 안내 */ broken?: string | null }) {
  if (!spec && broken) return <BrokenDraft reason={broken} canWrite={canWrite} />;
  if (!spec) {
    return (
      <div className="w-[182mm]">
        <section className={T.wrap}>
          <Empty title="아직 초안이 없습니다.">
            {canWrite ? (
              <>
                {/* 휴대폰(md 미만)은 옆 창 대신 아래 「AI」 단추로 여는 시트(components/workspace/narrow-sheet.tsx) */}
                <span className="max-md:hidden">{hasOutline ? "오른쪽에서 구성안을 확인하고 「승인하고 집필」을 누르세요." : "오른쪽 아래 요청 칸에서 시작하세요."}</span>
                <span className="md:hidden">{hasOutline ? "아래 「AI」 단추로 구성안을 확인하고 「승인하고 집필」을 누르세요." : "아래 「AI」 단추를 눌러 시작하세요."}</span>
              </>
            ) : (
              "이 과제를 맡은 부서나 성과관리팀이 만듭니다."
            )}
          </Empty>
        </section>
      </div>
    );
  }
  // 모양 검사를 지났는데도 그리기가 던지면(검사 빈틈) 화면 전체 오류 대신 같은 안내(2026-11-17 3차)
  let html: string;
  try {
    // 두 번 눌러 고치기 표지(editMarks)는 고칠 수 있을 때만(canWrite는 보관·부서 잠금·권한을 이미 반영)
    html = sectionHtml(spec, unknown, { weak, repeats: true, blockMarks: true, resultMark: true, editMarks: canWrite && spec.version === 3 });
  } catch (e) {
    console.error("ReportCardPreview", spec.card?.id, e);
    return <BrokenDraft reason="초안을 그리지 못함" canWrite={canWrite} />;
  }
  return (
    <section aria-label="보고서 초안 미리보기" className="min-w-0">
      <style>{REPORT_CSS}</style>
      <ReportPreview html={html} />
    </section>
  );
}

/** 저장된 초안을 그릴 수 없을 때(모양이 앱이 쓰는 꼴이 아님) — 무엇이 막혔고 무엇을 하면 되는지 */
function BrokenDraft({ reason, canWrite }: { reason: string; canWrite: boolean }) {
  return (
    <div className="w-[182mm]">
      <section className={T.wrap}>
        <Empty title="저장된 초안을 그릴 수 없습니다.">
          {`${RECOUNT_FAIL_HEAD}: ${reason}. 초안이 앱 밖에서 바뀌었거나 손상돼 미리보기와 숫자 확인을 하지 않았습니다. `}
          {canWrite ? "다시 만들면 새 초안으로 바뀝니다." : "이 과제를 맡은 부서나 성과관리팀이 다시 만들어야 합니다."}
        </Empty>
      </section>
    </div>
  );
}
