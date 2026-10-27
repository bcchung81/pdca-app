import type { Metadata } from "next";
import Link from "next/link";
import { LeadTeamSelect, PrepareButton } from "../../../components/reports/report-controls";
import { REPORT_STATUS_TONE } from "../../../components/ui/status-tone.ts";
import { TodoBoardPanel } from "../../../components/reports/todo-board";
import { Empty, NoAccess, PageHeader, Panel, Screen, StatPanel, T, Tag } from "../../../components/ui/kit";
import { requireAtLeast } from "../../../lib/auth/dal.ts";
import { currentPeriod } from "../../../lib/cards/view.ts";
import { fmtDate } from "../../../lib/format.ts";
import { withReturn } from "../../../lib/nav/return-to.ts";
import { REPORT_STATUS_LABEL, type ReportStatus, kpiRowsOf } from "../../../lib/reports/model.ts";
import { listReports, loadSubmitCards, materialCounts, openCommentCounts, submitKey } from "../../../lib/reports/queries.ts";
import { submitReadiness } from "../../../lib/reports/submission.ts";
import { buildTodoBoard } from "../../../lib/reports/todo-board.ts";
import { loadUnitPartSpecs } from "../../../lib/reports/unit-parts-queries.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { getTrack } from "../../../lib/tracks/current.ts";

export const metadata: Metadata = { title: "경평 초안 · 경영평가 Sherpa" };

const STATUSES: ReportStatus[] = ["preparing", "drafting", "submitted", "approved"];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** 성과관리팀 · 경평 초안 관리판: 사업×부서 보고서마다 과제별 초안 진행·확인할 것·계량 실적·상태(부서 확정 = 승인)를 보고 검토 화면으로 들어갑니다 */
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const me = await requireAtLeast("pmo", "/reports");
  if (!me) return <NoAccess title="경평 초안" need="성과관리팀" />;
  // 트랙(2026-10-09 R3): 주요사업 = 사업 × 부서, 경영관리 = 지표 × 부서 — 같은 틀, 데이터만 가름
  const track = await getTrack();
  const mg = track === "경영관리";
  const sp = await searchParams;
  const status = STATUSES.includes(one(sp.status) as ReportStatus) ? (one(sp.status) as ReportStatus) : null;
  const year = Number(currentPeriod().slice(0, 4));
  const supabase = await createClient();
  const [allReports, { data: units }, { data: cards }, { data: teams }, submitCards, unitParts] = await Promise.all([
    listReports(supabase, year),
    supabase.from("eval_units").select("id, name, card_group, lead_team_id").eq("track", track).order("sort").order("id"),
    supabase.from("cards").select("id, eval_unit_id, team_id, kpi:data->kpi->rows, unit:eval_units!inner(track)").eq("status", "active").eq("unit.track", track),
    supabase.from("teams").select("id, name").order("name"),
    loadSubmitCards(supabase, year, { track }),
    // 카드 밖 부분은 경영관리 지표에만 있음(주요사업은 부분 키 허용 목록이 비어 있어 빈 목록)
    mg ? loadUnitPartSpecs(supabase, year) : Promise.resolve([]),
  ]);
  const unitIds = new Set((units ?? []).map((u) => u.id as string));
  const reports = allReports.filter((r) => unitIds.has(r.evalUnitId));
  const ids = reports.map((r) => r.id);
  const [materials, open] = await Promise.all([materialCounts(supabase, ids), openCommentCounts(supabase, ids)]);
  const count = (s: ReportStatus) => reports.filter((r) => r.status === s).length;
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const cardsOf = (unit: string, team: number) => (cards ?? []).filter((c) => c.eval_unit_id === unit && c.team_id === team);
  const pairs = new Set((cards ?? []).filter((c) => c.team_id).map((c) => `${c.eval_unit_id}|${c.team_id}`));
  const missingReports = [...pairs].filter((p) => !reports.some((r) => `${r.evalUnitId}|${r.teamId}` === p)).length;
  const filtered = status ? reports.filter((r) => r.status === status) : reports;
  const visibleUnits = (units ?? []).filter((u) => filtered.some((r) => r.evalUnitId === u.id));
  // 채울 것 모음(재료 결손: 계량 실적·【확인】·초안 없음·근거에 없는 숫자) — 상태 필터와 무관하게 이 트랙 전체
  const submitById = new Map([...submitCards.values()].flat().map((c) => [c.id, c]));
  const todo = buildTodoBoard({
    units: (units ?? []).map((u) => ({ id: u.id as string, name: u.name as string, cardGroup: (u.card_group as string | null) ?? null })),
    teams: (teams ?? []).map((t) => ({ id: t.id as number, name: t.name as string })),
    cards: (cards ?? []).flatMap((c) => {
      const submit = submitById.get(c.id as string);
      return submit && c.team_id ? [{ unitId: c.eval_unit_id as string, teamId: c.team_id as number, kpi: c.kpi, submit }] : [];
    }),
    reports: reports.map((r) => ({ id: r.id, unitId: r.evalUnitId, teamId: r.teamId, inputs: r.inputs })),
    parts: unitParts,
  });
  // 검토 화면으로 가는 링크가 돌아올 이 목록 주소(상태 필터 포함)
  const selfHref = status ? `/reports?status=${status}` : "/reports";

  return (
    <Screen
      header={
        <PageHeader title="경평 초안">
          {(reports.length === 0 || missingReports > 0) && <PrepareButton year={year} label={reports.length ? `빠진 부서 보고서 ${missingReports}개 추가` : `${year} 보고서 준비`} />}
        </PageHeader>
      }
    >
      {reports.length === 0 ? (
        <Panel>
          <Empty title={`${year}년도 보고서가 아직 준비되지 않았습니다.`}>「{year} 보고서 준비」를 누르면 ({mg ? "경영관리 지표" : "주요사업"} × 부서)마다 보고서가 만들어집니다.</Empty>
        </Panel>
      ) : (
        <>
          <StatPanel
            title={`${year}년도 보고서`}
            total={reports.length}
            allHref="/reports"
            allOn={!status}
            segments={[
              { label: "승인", n: count("approved"), tone: REPORT_STATUS_TONE.approved.seg, href: status === "approved" ? "/reports" : "/reports?status=approved", on: status === "approved", title: "부서가 확정(바로 승인 상태) — 필요하면 검토 화면에서 메모와 함께 승인을 풂" },
              { label: "제출 · 검토 중", n: count("submitted"), tone: REPORT_STATUS_TONE.submitted.seg, href: status === "submitted" ? "/reports" : "/reports?status=submitted", on: status === "submitted", title: "2026-10-27 전에 제출된 보고서 — 승인하거나 돌려보냄(부서는 이제 제출 대신 확정)" },
              { label: "초안 작성", n: count("drafting"), tone: REPORT_STATUS_TONE.drafting.seg, href: status === "drafting" ? "/reports" : "/reports?status=drafting", on: status === "drafting", title: "부서가 과제별 초안을 쓰는 중" },
              { label: "자료 준비", n: count("preparing"), tone: REPORT_STATUS_TONE.preparing.seg, href: status === "preparing" ? "/reports" : "/reports?status=preparing", on: status === "preparing", title: "추가자료·계량 실적 입력" },
            ]}
          />

          <TodoBoardPanel board={todo} title="채울 것 모아 보기" mg={mg} staff from={selfHref} />

          {visibleUnits.length === 0 ? (
            <Panel>
              <Empty title="이 상태의 보고서가 없습니다.">다른 상태를 골라 보세요.</Empty>
            </Panel>
          ) : (
            visibleUnits.map((u) => {
              const list = filtered.filter((r) => r.evalUnitId === u.id);
              const unitTeams = [...new Set((cards ?? []).filter((c) => c.eval_unit_id === u.id && c.team_id).map((c) => c.team_id as number))].map((id) => ({ id, name: teamName.get(id) ?? String(id) }));
              return (
                <Panel
                  key={u.id}
                  title={mg ? u.name : `${u.card_group ?? "공통지표"} · ${u.name}`}
                  aside={unitTeams.length ? <LeadTeamSelect unitId={u.id} value={u.lead_team_id} teams={unitTeams.sort((a, b) => a.name.localeCompare(b.name, "ko"))} /> : <span>과제관리카드 없음{mg ? "" : " — 주요사업 공통 계량지표"}</span>}
                >
                  <div className="overflow-x-auto">
                    <table className={`${T.table} min-w-[1220px]`}>
                      <colgroup>
                        <col className="w-[140px]" />
                        <col className="w-[64px]" />
                        <col className="w-[104px]" />
                        <col className="w-[104px]" />
                        <col className="w-[96px]" />
                        <col className="w-[80px]" />
                        <col className="w-[120px]" />
                        <col className="w-[92px]" />
                        <col className="w-[92px]" />
                        <col className="w-[96px]" />
                        <col className="w-[76px]" />
                      </colgroup>
                      <thead>
                        <tr className={T.headRow}>
                          {["부서", "과제", "과제별 초안", "확인할 것", "계량 실적", "추가자료", "상태", "확정일", "미해결 코멘트", "검토 메모", ""].map((h) => (
                            <th key={h} scope="col" className={T.th}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => {
                          const cs = cardsOf(r.evalUnitId, r.teamId);
                          const kpiTotal = cs.reduce((n, c) => n + kpiRowsOf(c.kpi).length, 0);
                          const kpiDone = Object.values((r.inputs?.kpi ?? {}) as Record<string, string>).filter((v) => String(v).trim()).length;
                          const ready = submitReadiness(submitCards.get(submitKey(r.evalUnitId, r.teamId)) ?? []);
                          return (
                            <tr key={r.id} className={T.row}>
                              <td className={`${T.td} truncate`}>
                                <Link href={withReturn(`/reports/${r.id}`, selfHref)} className="font-semibold text-navy no-underline hover:underline" title={`${r.hq ?? ""} ${r.teamName}`}>
                                  {r.teamName}
                                </Link>
                                {r.leadTeamId === r.teamId && (
                                  <span className="ml-2">
                                    <Tag tone="solid">주관</Tag>
                                  </span>
                                )}
                              </td>
                              <td className={`${T.td} font-mono text-ui text-muted-2`}>{cs.length}</td>
                              <td className={`${T.td} font-mono text-ui ${ready.total && ready.drafted < ready.total ? "text-warn" : "text-muted-2"}`}>
                                <Link href={withReturn(`/reports/${r.id}`, selfHref)} className="text-inherit no-underline hover:underline" title="과제별 초안(카드마다) 진행 — 눌러 검토 화면으로">
                                  {ready.drafted}/{ready.total}
                                </Link>
                              </td>
                              <td className={`${T.td} font-mono text-ui ${ready.checks.length ? "text-ink" : "text-muted-2"}`} title={ready.checks.length ? ready.checks.join("\n") : "확인할 것 없음"}>
                                {ready.checks.length || "—"}
                              </td>
                              <td className={`${T.td} font-mono text-ui ${kpiTotal && kpiDone < kpiTotal ? "text-ink" : "text-muted-2"}`}>
                                {kpiDone}/{kpiTotal}
                              </td>
                              <td className={`${T.td} font-mono text-ui text-muted-2`}>{materials.get(r.id) ?? 0}</td>
                              <td className={T.td}>
                                {/* 자료 준비(시작 전)는 빈칸 — 정제 언어 규칙 E */}
                                {r.status === "preparing" ? null : <Tag tone={REPORT_STATUS_TONE[r.status].tag}>{REPORT_STATUS_LABEL[r.status]}</Tag>}
                              </td>
                              {/* 확정일 = 부서가 확정한(승인 상태가 된) 날, 남은 제출 행은 제출한 날 */}
                              <td className={`${T.td} font-mono text-xs text-muted`}>{r.status === "approved" && r.approvedAt ? fmtDate(r.approvedAt) : r.status === "submitted" && r.submittedAt ? fmtDate(r.submittedAt) : "—"}</td>
                              <td className={`${T.td} font-mono text-ui ${open.get(r.id) ? "text-ink" : "text-muted"}`}>{open.get(r.id) ?? 0}</td>
                              <td className={T.td}>{r.reviewNote ? <Tag tone="warn" title={r.reviewNote}>있음</Tag> : <span className="text-muted">—</span>}</td>
                              <td className={T.td}>
                                <Link href={withReturn(`/reports/${r.id}`, selfHref)} className={T.btn}>
                                  검토
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}
