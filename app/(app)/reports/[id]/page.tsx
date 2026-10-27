import { List } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportStatusButtons } from "../../../../components/reports/report-controls";
import { type ReviewCard, ReviewBoard } from "../../../../components/reports/review-board";
import { REPORT_STATUS_TONE } from "../../../../components/ui/status-tone.ts";
import { T, Tag } from "../../../../components/ui/kit";
import { requireUser } from "../../../../lib/auth/dal.ts";
import { deptScope } from "../../../../lib/auth/scope.ts";
import { fmtDateTime } from "../../../../lib/format.ts";
import { returnTarget, withReturn } from "../../../../lib/nav/return-to.ts";
import { REPORT_STATUS_LABEL, readBlocks } from "../../../../lib/reports/model.ts";
import { getReport, listComments, loadSubmitCards, submitKey } from "../../../../lib/reports/queries.ts";
import { REPORT_CSS } from "../../../../lib/reports/section-css.ts";
import { sectionHtml } from "../../../../lib/reports/section-html.ts";
import { submitReadiness } from "../../../../lib/reports/submission.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "경평 초안 검토 · 경영AI비서" };

/**
 * 경평 초안 검토(사업 × 부서 보고서 하나): 목차에 든 과제를 과제별 초안(카드 1장 → 평가내용2 소항목) 순서로 모아 보여 줍니다.
 * 성과관리팀은 과제·블록 단위로 코멘트를 달고 돌려보내기(메모 필수)·승인, 부서는 자기 보고서를 읽고 코멘트를 「해결」로 표시합니다.
 * 원고(사업 공통 부분 자리)는 읽기만 합니다 — 제출 단위는 과제별 초안입니다(submitReadiness). 직접 쓰기 편집기는 다음 단계(사업 공통 부분)에서 다시 엽니다.
 * ?from은 연 목록으로 돌아갈 주소(머리 오른쪽 위 목록 아이콘).
 * 성과관리팀·관리자가 ?team=으로 오면 부서 화면 보기(읽기 전용 — 부서 경평 초안의 「모아 보기」): 팀을 못 찾아도 읽기 전용(상태 단추·코멘트 없음).
 */
export default async function ReportReviewPage({ params, searchParams }: PageProps<"/reports/[id]">) {
  const { id: raw } = await params;
  const sp = await searchParams;
  const id = Number(raw);
  const me = await requireUser(`/reports/${raw}`);
  if (!Number.isInteger(id)) notFound();
  const supabase = await createClient();
  const report = await getReport(supabase, id);
  if (!report) notFound();
  const staff = me.role !== "dept_user";
  // 부서 화면 보기: ?team=이 있으면 팀을 못 찾아도 읽기 전용(fail-closed)
  const teamParam = (Array.isArray(sp.team) ? sp.team[0] : sp.team) ?? "";
  const scope = staff && teamParam ? await deptScope(me, sp) : null;
  const deptView = Boolean(scope);
  const viewTeam = scope?.team ?? null;
  const teamQ = deptView ? `team=${encodeURIComponent(teamParam)}` : "";
  const [comments, cardsForReport] = await Promise.all([
    listComments(supabase, id),
    loadSubmitCards(supabase, report.year, { evalUnitId: report.evalUnitId, teamId: report.teamId }).then((m) => m.get(submitKey(report.evalUnitId, report.teamId)) ?? []),
  ]);
  const readiness = submitReadiness(cardsForReport);
  const rowOf = new Map(readiness.rows.map((r) => [r.id, r]));
  // 카드 보기·과제별 초안은 다른 화면이라 지금 이 검토 화면 주소로 되돌아오게(from)
  const selfHref = `/reports/${id}${teamQ ? `?${teamQ}` : ""}`;
  const cards: ReviewCard[] = cardsForReport.map((c) => {
    const row = rowOf.get(c.id);
    const spec = c.draft?.spec ?? null;
    return {
      id: c.id,
      uid: c.uid,
      taskNo: c.taskNo,
      title: c.title,
      included: c.included,
      state: row?.state ?? "none",
      fitPct: row?.fitPct ?? null,
      needs: row?.needs ?? 0,
      figures: row?.figures ?? 0,
      unknown: row?.unknown ?? 0,
      html: spec ? sectionHtml(spec, c.draft?.unknownNumbers ?? [], { blockMarks: true }) : null,
      cardHref: withReturn(deptView ? `/my?${teamQ}&peek=${c.uid}` : staff ? `/cards?peek=${c.uid}` : `/my?peek=${c.uid}`, selfHref),
      draftHref: withReturn(`/reports/cards/${c.uid}${teamQ ? `?${teamQ}` : ""}`, selfHref),
    };
  });
  const blocks = readBlocks(report.blocks);
  const legacyBlocks = blocks.map((b, i) => ({ id: b.id, label: `원고 ${i + 1}. ${(b.text ?? (b.type === "table" ? "표" : b.id)).slice(0, 24)}` }));
  const canResolve = !deptView && (staff || me.team?.id === report.teamId);
  const canComment = staff && !deptView;
  const target = returnTarget(sp.from, deptView ? (viewTeam ? `/my/report?team=${viewTeam.id}` : "/my/report") : staff ? "/reports" : "/my/report");

  return (
    <div className="flex min-h-0 min-w-0 grow flex-col">
      <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line-strong bg-paper px-8 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="min-w-0 truncate font-serif text-title leading-8 font-bold tracking-[-0.3px] text-navy" title={report.unitName}>
            {report.unitName}
          </h1>
          <Tag title={`${report.year}년도 · ${report.cardGroup ?? report.evalUnitId}${report.hq ? ` · ${report.hq}` : ""}`}>{report.teamName}</Tag>
          {report.leadTeamId === report.teamId && <Tag tone="solid">주관 부서</Tag>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Tag tone={REPORT_STATUS_TONE[report.status].tag}>{REPORT_STATUS_LABEL[report.status]}</Tag>
          {report.reviewNote && (
            <span className="max-w-[280px] truncate rounded-md border border-warn/40 bg-warn-bg px-2 py-1 text-xs text-warn" title={`${report.reviewNote}${report.reviewedAt ? ` (${fmtDateTime(report.reviewedAt)})` : ""}`}>
              검토 메모: {report.reviewNote}
            </span>
          )}
          {deptView && <span className="shrink-0 text-xs text-muted">부서 화면 보기 · 읽기 전용</span>}
          {!deptView && <ReportStatusButtons id={report.id} status={report.status} staff={staff} readiness={{ ready: readiness.ready, total: readiness.total, drafted: readiness.drafted, missing: readiness.missing.map((m) => m.taskNo), checks: readiness.checks }} />}
          <Link href={target.href} aria-label={`목록으로 — ${target.label}`} title={`목록으로 — ${target.label}`} className={`${T.iconBtn} border-field-line text-ink hover:border-navy`}>
            <List size={16} aria-hidden />
          </Link>
        </div>
      </div>

      <style>{REPORT_CSS}</style>
      <ReviewBoard reportId={report.id} cards={cards} comments={comments} canComment={canComment} canResolve={canResolve} meId={deptView ? null : me.id} legacyBlocks={legacyBlocks} />
      {blocks.length > 0 && (
        <details className="shrink-0 border-t border-line-strong bg-paper px-8 py-4">
          <summary className="cursor-pointer text-sm font-bold text-navy">원고 — 사업 공통 부분 {blocks.length}블록</summary>
          <article aria-label="보고서 원고" className="mx-auto mt-4 flex w-full max-w-[794px] flex-col gap-4 bg-desk px-10 py-8">
            {blocks.map((b) =>
              b.type === "heading" ? (
                <h2 key={b.id} id={b.id} className={`font-serif font-bold text-navy ${b.level && b.level > 1 ? "text-base" : "text-lg"}`}>
                  {b.text}
                </h2>
              ) : b.type === "table" ? (
                <table key={b.id} id={b.id} className="w-full border-collapse text-ui">
                  <tbody>
                    {(b.rows ?? []).map((row, i) => (
                      <tr key={i}>
                        {row.map((c, j) => (
                          <td key={j} className="border border-line px-2 py-1">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p key={b.id} id={b.id} className="text-sm leading-7 text-ink">
                  {b.text}
                </p>
              ),
            )}
          </article>
        </details>
      )}
    </div>
  );
}
