import type { Metadata } from "next";
import Link from "next/link";
import { Empty, NoAccess, PageHeader, Panel, Screen, T, Tag } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { listCards } from "../../../../lib/cards/queries.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { isPeriod, periodLabel, shiftPeriod } from "../../../../lib/format.ts";
import { TABLE_KEYS, formTablesOf, readResult } from "../../../../lib/inspections/model.ts";
import { inspectionsForPeriod } from "../../../../lib/inspections/queries.ts";
import { type GroupRow, MGMT_LINK_NOTE, type SummaryInput, bizLinkLine, summarize } from "../../../../lib/inspections/summary.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { getTrack } from "../../../../lib/tracks/current.ts";
import { TRACK_SPECS } from "../../../../lib/tracks/index.ts";

export const metadata: Metadata = { title: "월간 점검 취합 보고 · 경영AI비서" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function GroupTable({ label, rows, form }: { label: string; rows: GroupRow[]; form: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`${T.table} min-w-[640px]`}>
        <colgroup>
          <col />
          <col className="w-[72px]" />
          <col className="w-[96px]" />
          <col className="w-[104px]" />
          <col className="w-[96px]" />
          <col className="w-[84px]" />
        </colgroup>
        <thead>
          <tr className={T.headRow}>
            {[label, "점검수", "평균 7대축", "평균 질의패턴", "평균 정합성", "집중보완"].map((h) => (
              <th key={h} scope="col" className={T.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={T.row}>
              <td className={`${T.td} truncate`} title={r.name}>
                {r.name}
              </td>
              <td className={`${T.td} font-mono text-ui`}>{r.count}건</td>
              {TABLE_KEYS.map((k) => (
                <td key={k} className={`${T.td} font-mono text-ui text-muted-2`}>
                  {r.avg[k]}/{formTablesOf(form)[k].rows.length}
                </td>
              ))}
              <td className={`${T.td} font-mono text-ui ${r.focus ? "text-warn" : "text-muted"}`}>{r.focus}건</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 성과관리팀 · 월간 점검 취합 결과보고서(종합점검 지침 14 주요사업·13 경영관리 <취합 보고> — 머리띠에서 고른 트랙): 그 달 점검표의 판정만 집계합니다(재판정·창작 없음).
 * 보완 건수·집중보완은 미흡 항목과 ★핵심 3항목 규칙으로 계산합니다.
 */
export default async function InspectionSummaryPage({ searchParams }: PageProps<"/inspections/summary">) {
  const me = await requireAtLeast("pmo", "/inspections/summary");
  if (!me) return <NoAccess title="월간 점검 취합 보고" need="성과관리팀" />;
  const track = await getTrack();
  const sp = await searchParams;
  const period = isPeriod(one(sp.period)) ? one(sp.period) : currentPeriod();
  const supabase = await createClient();
  const [rows, inspections] = await Promise.all([listCards({ track }), inspectionsForPeriod(supabase, period)]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const list: SummaryInput[] = [...inspections.values()].flatMap((ins) => {
    const c = byId.get(ins.cardId);
    return c ? [{ card: { taskNo: c.taskNo, title: c.title, business: c.business, department: c.department, team: c.team }, status: ins.status, result: readResult(ins.result) }] : [];
  });
  const s = summarize(list, TRACK_SPECS[track].inspectionForm);
  const mgmt = track === "경영관리";
  const trackLabel = mgmt ? "경영관리" : "주요사업";
  const [y, m] = period.split("-");

  return (
    <Screen
      header={
        <PageHeader title="월간 점검 취합 보고">
          <nav aria-label="점검 기간" className="flex items-center gap-1">
            <Link href={`/inspections/summary?period=${shiftPeriod(period, -1)}`} className={T.btn} aria-label="이전 달">
              ‹
            </Link>
            <span className="px-2 font-serif text-base font-bold whitespace-nowrap text-navy">{periodLabel(period)}</span>
            <Link href={`/inspections/summary?period=${shiftPeriod(period, 1)}`} className={T.btn} aria-label="다음 달">
              ›
            </Link>
          </nav>
          <a href={`/inspections/export?period=${period}`} className={T.btn} download>
            점검 결과 내려받기(CSV)
          </a>
          {s.count > 0 && (
            <a href={`/inspections/summary/md?period=${period}`} className={T.btn} download>
              보고서 내려받기(.md)
            </a>
          )}
        </PageHeader>
      }
    >
      {s.count === 0 ? (
        <section className={T.wrap}>
          <Empty title={`${Number(m)}월 ${trackLabel} 점검이 아직 없습니다.`} />
        </section>
      ) : (
        <article aria-label="취합 결과보고서" className="flex flex-col gap-4">
          <h2 className="font-serif text-lg font-bold text-navy">
            [{y}-{m}월] KCA 경영평가 월간 점검 취합 결과보고서 — {trackLabel}
          </h2>
          <p className="rounded-md border border-line bg-paper px-4 py-3 text-sm leading-7 text-ink">
            {`◆ 총괄 현황 : 점검 ${s.count}건 / 평균 7대축 ${s.avg.axes}/7 · 질의패턴 ${s.avg.patterns}/8 · 정합성 ${s.avg.coherence}/5 / 집중보완 ${s.focus}건 / 상태(완료 ${s.judge.점검완료}건·보완요청 ${s.judge.보완요청}건·재점검 ${s.judge.재점검필요}건)`}
            <span className="ml-2 text-xs text-muted">{`점검표 초안 ${s.sent.draft}건 · 보냄 ${s.sent.sent}건 · 부서 확인 ${s.sent.acknowledged}건 · 보완 ${s.needs}건`}</span>
          </p>

          {!mgmt && (
            <Panel title="□ 대상사업별 집계">
              <GroupTable label="대상사업" rows={s.byBusiness} form={s.form} />
            </Panel>
          )}
          <Panel title="□ 부서별 집계">
            <GroupTable label="본부·단" rows={s.byDept} form={s.form} />
          </Panel>

          <Panel title="□ 집중보완 과제 (회의 핵심 안건)" aside="★핵심 3항목(OutCome 연결·계량 수치의 함정·성과확산·지속성) 중 2개 이상 미흡">
            {s.focusList.length === 0 ? (
              <p className="px-5 py-5 text-ui text-muted">집중보완 과제가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={`${T.table} min-w-[760px]`}>
                  <colgroup>
                    <col className="w-[260px]" />
                    <col className="w-[220px]" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className={T.headRow}>
                      {["과제(부서·팀)", "★핵심 미흡", "개선방향"].map((h) => (
                        <th key={h} scope="col" className={T.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.focusList.map((f) => (
                      <tr key={f.taskNo} className="align-top">
                        <td className="border-b border-row-line px-3 py-2.5 text-ui leading-5">
                          <span className="font-mono text-navy">{f.taskNo}</span> {f.title}
                          <span className="block text-xs text-muted-2">{f.dept}</span>
                        </td>
                        <td className="border-b border-row-line px-3 py-2.5 text-ui leading-5 break-keep">{f.stars.join(" · ")}</td>
                        <td className="border-b border-row-line px-3 py-2.5 text-ui leading-5 break-keep">
                          {f.direction.map((l, i) => (
                            <p key={i}>{l}</p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="□ 공통 미흡 패턴 Top">
            {s.weakTop.length === 0 ? (
              <p className="px-5 py-5 text-ui text-muted">미흡 판정이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-1 px-5 py-4 text-ui leading-6">
                {s.weakTop.slice(0, 10).map((w) => (
                  <li key={w.label}>
                    {`▸ ${formTablesOf(s.form)[w.table].short} '${w.name}' 미흡 ${w.count}건`} {w.star && <Tag tone="warn">★핵심</Tag>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="□ 사례제안 종합">
            {s.cases.length === 0 ? (
              <p className="px-5 py-5 text-ui text-muted">사례제안이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-1 px-5 py-4 text-ui leading-6">
                {s.cases.map((c) => (
                  <li key={c.key}>{`▸ ${c.key} ${c.count}건 제안${c.count >= 2 ? " → 전사 벤치마킹 후보" : ""}`}</li>
                ))}
              </ul>
            )}
          </Panel>

          {mgmt && (
            <Panel title="□ 주요사업 연계 후보 종합 (부서 간 협의 안건)">
              {s.bizLinks.length === 0 ? (
                <p className="px-5 py-5 text-ui text-muted">{MGMT_LINK_NOTE}</p>
              ) : (
                <ul className="flex flex-col gap-1 px-5 py-4 text-ui leading-6 break-keep">
                  {s.bizLinks.map((l) => (
                    <li key={l.id} className="min-w-0">
                      {bizLinkLine(l)}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          <Panel title="□ 기준 미확인·해당 없음 종합 (지식파일 보완 신호)">
            {s.unknowns.length + s.nas.length === 0 ? (
              <p className="px-5 py-5 text-ui text-muted">기준 미확인·해당 없음 판단이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-1 px-5 py-4 text-ui leading-6 break-keep">
                {s.unknowns.map((u) => (
                  <li key={`u-${u.label}`}>{`▸ 기준 미확인 · ${u.label} ${u.count}건${u.notes.length ? ` — 필요 자료: ${u.notes.join(" / ")}` : ""}`}</li>
                ))}
                {s.nas.map((u) => (
                  <li key={`n-${u.label}`} className="text-muted-2">
                    {`▸ 해당 없음 · ${u.label} ${u.count}건${u.notes.length ? ` — ${u.notes.join(" / ")}` : ""}`}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="○ 기관장 보고 1면">
            <div className="flex flex-col gap-2 px-5 py-4 text-ui leading-6">
              <p className="font-semibold text-ink">{s.headline}</p>
              {s.top3.length > 0 && (
                <>
                  <p className="text-xs font-bold text-navy">이번 달 최우선 보완 {s.top3.length}가지</p>
                  <ol className="list-decimal pl-5">
                    {s.top3.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          </Panel>
        </article>
      )}
    </Screen>
  );
}
