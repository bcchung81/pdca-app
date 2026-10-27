import type { Metadata } from "next";
import Link from "next/link";
import { BuildOutlineButton, OutlineCell } from "../../../../components/reports/outline-controls";
import { Empty, NoAccess, PageHeader, Panel, Screen, T, Tag } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { withReturn } from "../../../../lib/nav/return-to.ts";
import { PAGE_BUDGET, budgetState, halfPageTasks } from "../../../../lib/reports/outline.ts";
import { type MgEvalPages, type MgPageRef, buildMgOutline, evalNoOf, halfPage, mgBudgetState, mgCardPages } from "../../../../lib/reports/mg-page-plan.ts";
import { loadMgPageRefs } from "../../../../lib/reports/mg-queries.ts";
import { MG_VOLUME, mgVolumeLabel } from "../../../../lib/reports/mg-volume.ts";
import { compareUnitId } from "../../../../lib/cards/view.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { DEFAULT_TRACK } from "../../../../lib/tracks/index.ts";
import { getTrack } from "../../../../lib/tracks/current.ts";

export const metadata: Metadata = { title: "목차·쪽 배정 · 경평AI비서" };

/** report_outline select 한 행(card·team 조인은 객체로도 배열로도 옴) */
interface OutlineDbRow {
  card_id: string;
  eval_unit_id: string;
  section: string;
  subsection: string | null;
  sort: number;
  pages: number | string;
  included: boolean;
  card: OutlineCardJoin | OutlineCardJoin[] | null;
}
interface OutlineCardJoin {
  uid: string;
  task_no: string;
  title: string;
  team: { name: string } | Array<{ name: string }> | null;
}

const first = <X,>(v: X | X[] | null): X | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const STATE = { under: ["모자람", "warn"], ok: ["예산 안", "link"], over: ["넘침", "warnSolid"] } as const;
// 경영관리: 카드가 맡은 본문 예산(작성분량 − 본문 아닌 내용 장 — lib/reports/mg-page-plan.ts)과 비교
const MG_STATE = { under: ["예산보다 적음", "warn"], ok: ["예산 수준", "link"], over: ["예산보다 많음", "warn"] } as const;

/**
 * 성과관리팀 · 경평 초안 목차·쪽 배정(6월 셋업, 카드↔목차 연결) — 머리띠에서 고른 트랙. 주요사업: 평가내용2 = 대상사업 → 실행과제 → 과제, 사업마다 15±1쪽.
 * 경영관리: 지표마다 평가내용 → 과제, 지표 총량은 작성분량(규정 — mg-volume.ts, 2026-10-12), 평가내용·과제 몫은 2025 지표별 보고서 쪽 비율로 어림한 배정안(2026-10-10 사용자 결정)
 */
export default async function OutlinePage() {
  const me = await requireAtLeast("pmo", "/reports/outline");
  if (!me) return <NoAccess title="목차·쪽 배정" need="성과관리팀" />;
  const track = await getTrack();
  const mg = track !== DEFAULT_TRACK.id;
  const year = Number(currentPeriod().slice(0, 4));
  const supabase = await createClient();
  const [{ data: rows }, { data: unitRows }, { count: cardCount }, refs] = await Promise.all([
    supabase.from("report_outline").select("card_id, eval_unit_id, section, subsection, sort, pages, included, unit:eval_units!inner(track), card:cards!inner(uid, task_no, title, team:teams(name))").eq("year", year).eq("unit.track", track).eq("card.status", "active").order("eval_unit_id").order("sort"),
    supabase.from("eval_units").select("id, name, card_group").eq("track", track).not("card_group", "is", null),
    supabase.from("cards").select("id, unit:eval_units!inner(track)", { count: "exact", head: true }).eq("status", "active").eq("unit.track", track),
    mg ? loadMgPageRefs(supabase) : Promise.resolve(new Map<string, MgPageRef>()),
  ]);
  const units = [...(unitRows ?? [])].sort((a, b) => compareUnitId(a.id, b.id));
  const list = (rows ?? []) as OutlineDbRow[];
  const missing = (cardCount ?? 0) - list.length;

  return (
    <Screen
      header={
        <PageHeader title="경평 초안">
          {list.length === 0 ? (
            <BuildOutlineButton year={year} refresh={false} label="카드로 목차 만들기" />
          ) : (
            <>
              {missing > 0 && <BuildOutlineButton year={year} refresh={false} label={`빠진 과제 ${missing}개 넣기`} />}
              <BuildOutlineButton year={year} refresh label="카드에 다시 맞추기(쪽 배정 유지)" />
            </>
          )}
        </PageHeader>
      }
    >
      {list.length === 0 ? (
        <Panel>
          <Empty title="아직 목차가 없습니다.">
            {mg ? "「카드로 목차 만들기」를 누르면 지표마다 평가내용 → 과제 순서로, 작성분량의 본문 예산을 2025 보고서 쪽 비율로 나눈 배정안이 만들어집니다." : "「카드로 목차 만들기」를 누르면 대상사업 → 실행과제 → 과제 순서로 만들어집니다."}
          </Empty>
        </Panel>
      ) : (
        <>
          {mg && (
            <p className="text-ui text-muted">
              경영관리 지표 총 쪽수는 작성분량(규정)이고, 그중 지적사항 조치실적·전년 대비·성과분석 및 환류 같은 장(2025 보고서 쪽 수)을 뺀 본문 예산을 2025 지표별 보고서 「세부평가내용별」 장의 쪽 비율로 평가내용 → 과제에 나눈 값은 앱이 어림한 배정입니다(성과관리팀이 고침). 카드 ↔ 평가내용 대응은 추천 기본값이고, 경영관리 초안은 이 쪽수를 집필의 분량 목표로 알리고 벗어나면 경고합니다(자동으로 맞추지는 않음).
            </p>
          )}
          {units.map((u) => {
          const items = list.filter((r) => r.eval_unit_id === u.id);
          if (!items.length) return null;
          const sum = items.filter((r) => r.included).reduce((n, r) => n + Number(r.pages), 0);
          const ref = refs.get(u.id);
          // 경영관리: 카드가 대응하지 않는 평가내용(2025에 있던 자리 — 성과관리팀·주관 부서가 쓰는 부분)은 참고 줄로
          const orphan: MgEvalPages[] = mg && ref ? buildMgOutline(u.id, ref, items.map((r) => ({ id: r.card_id, taskNo: first(r.card)?.task_no ?? "" }))).orphan : [];
          const st = mg && ref ? mgBudgetState(sum, ref, orphan) : budgetState(sum);
          const sections = [...new Set(items.map((r) => r.section))];
          // 실행과제는 새 쪽에서 시작(2025 관행) — 배정 합이 X.5쪽이면 반쪽이 빔(주요사업만 — 경영관리 절은 쪽당 2~3개)
          const halves = mg ? [] : halfPageTasks(items);
          return (
            <Panel
              key={u.id}
              title={mg ? u.name : `${u.card_group} · ${u.name}`}
              aside={
                <>
                  {mg ? (
                    <span
                      className="font-mono text-ui text-navy"
                      title={
                        ref
                          ? `${MG_VOLUME[u.id] ? `작성분량 ${mgVolumeLabel(MG_VOLUME[u.id])} − 본문 아닌 내용 장(2025 지표관리 방향·지적사항 조치실적·전년 대비·성과분석 및 환류) ${ref.content}쪽 → ` : ""}본문 예산 ${ref.body}쪽(2025 세부평가내용별 ${ref.body2025 ?? ref.body}쪽${(ref.body2025 ?? ref.body) > ref.body ? "보다 작아 평가내용 쪽을 비례로 줄임" : ""})${orphan.length ? ` · 카드 없는 평가내용 ${orphan.map((e) => e.no).join("·")} 빼면 ${mgCardPages(ref, orphan)}쪽` : ""}`
                          : "2025 보고서 쪽 정보 없음"
                      }
                    >
                      {sum}쪽 / {ref?.volume !== undefined ? `작성분량 ${ref.volume}쪽(본문 예산 ${mgCardPages(ref, orphan)}쪽)` : `2025 ${ref ? mgCardPages(ref, orphan) : "—"}쪽`}
                    </span>
                  ) : (
                    <span className="font-mono text-ui text-navy">
                      {sum}쪽 / {PAGE_BUDGET.target}±{PAGE_BUDGET.tolerance}쪽
                    </span>
                  )}
                  {mg ? ref && <Tag tone={MG_STATE[st][1]}>{MG_STATE[st][0]}</Tag> : <Tag tone={STATE[st][1]}>{STATE[st][0]}</Tag>}
                  {halves.length > 0 && (
                    <Tag tone="warn" title={`실행과제는 새 쪽에서 시작합니다(2025 최종본 관행) — 배정 합이 반쪽으로 끝나면 그 쪽 반이 비어 조판 쪽 수가 늘어납니다: ${halves.map((h) => `${h.subsection || h.section} ${h.sum}쪽`).join(" · ")}`}>
                      실행과제 {halves.length}곳 반쪽 빔
                    </Tag>
                  )}
                </>
              }
            >
              <div className="overflow-x-auto">
                <table className={`${T.table} min-w-[820px]`}>
                  <colgroup>
                    <col className="w-[72px]" />
                    <col />
                    <col className="w-[150px]" />
                    <col className="w-[190px]" />
                  </colgroup>
                  <thead>
                    <tr className={T.headRow}>
                      {["번호", "과제(소항목)", "부서", "쪽 배정"].map((h) => (
                        <th key={h} scope="col" className={T.th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {sections.map((sec, si) => {
                    const inSec = items.filter((r) => r.section === sec);
                    const subs = [...new Set(inSec.map((r) => r.subsection ?? ""))];
                    const secSum = inSec.filter((r) => r.included).reduce((n, r) => n + Number(r.pages), 0);
                    const evalRef = mg ? ref?.evals.find((e) => e.no === evalNoOf(sec)) : undefined;
                    return (
                      <tbody key={sec}>
                        <tr className="h-9 bg-desk/60">
                          <th colSpan={3} scope="rowgroup" className="min-w-0 truncate border-b border-line px-3 text-left text-xs font-bold text-navy" title={sec}>
                            {mg ? sec : `대상사업 ${si + 1}. ${sec}`}
                          </th>
                          <td className="border-b border-line px-3 font-mono text-xs text-muted-2">
                            {secSum}쪽
                            {evalRef && (
                              <span title={`본문 예산 중 이 평가내용 몫 — 2025 보고서에서 이 평가내용이 차지한 쪽(한 쪽에 평가내용이 둘이면 반씩) ${halfPage(evalRef.pages2025 ?? evalRef.pages)}쪽${evalRef.pages2025 !== undefined ? "을 본문 예산에 맞게 비례로 줄임" : ""}`}> · 예산 {halfPage(evalRef.pages)}쪽</span>
                            )}
                          </td>
                        </tr>
                        {subs.map((sub) => (
                          <SubRows key={sub || "-"} sub={sub} rows={inSec.filter((r) => (r.subsection ?? "") === sub)} year={year} half={halves.some((h) => h.section === sec && h.subsection === sub)} maxPages={mg ? 10 : 3} />
                        ))}
                      </tbody>
                    );
                  })}
                  {orphan.length > 0 && (
                    <tbody>
                      {orphan.map((e) => (
                        <tr key={e.no} className="h-9 opacity-70">
                          <th colSpan={3} scope="row" className="min-w-0 truncate border-b border-line px-3 text-left text-xs font-semibold text-muted-2" title={`평가내용 ${e.no}. ${e.title} — 대응하는 카드가 없음(카드 ↔ 평가내용 대응은 구성안에서 고름)`}>
                            평가내용 {e.no}. {e.title} — 대응 카드 없음
                          </th>
                          <td className="border-b border-line px-3 font-mono text-xs text-muted-2" title={`본문 예산 중 이 평가내용 몫(2025 ${halfPage(e.pages2025 ?? e.pages)}쪽)`}>예산 {halfPage(e.pages)}쪽</td>
                        </tr>
                      ))}
                    </tbody>
                  )}
                </table>
              </div>
            </Panel>
          );
          })}
        </>
      )}
      {list.length > 0 && (
        <p className="text-ui text-muted">
          <Link href="/reports">보고서 현황으로 →</Link>
        </p>
      )}
    </Screen>
  );
}

function SubRows({ sub, rows, year, half, maxPages }: { sub: string; rows: OutlineDbRow[]; year: number; half: boolean; maxPages: number }) {
  const subSum = rows.filter((r) => r.included).reduce((n, r) => n + Number(r.pages), 0);
  return (
    <>
      {sub && (
        <tr className="h-8">
          <td colSpan={3} className="min-w-0 truncate border-b border-row-line px-3 pl-6 text-xs font-semibold text-muted-2" title={sub}>
            {sub}
          </td>
          <td className="border-b border-row-line px-3 font-mono text-xs text-muted-2">
            {subSum}쪽{" "}
            {half && (
              <Tag tone="warn" title="실행과제는 새 쪽에서 시작 — 배정 합이 반쪽으로 끝나면 그 쪽 반이 빔. 이 실행과제 안에서 0.5쪽을 더하거나 빼 정수 쪽으로 맞춥니다">
                반쪽 빔
              </Tag>
            )}
          </td>
        </tr>
      )}
      {rows.map((r) => {
        const c = first(r.card);
        return (
          <tr key={r.card_id} className={`${T.row} ${r.included ? "" : "opacity-60"}`}>
            <td className={`${T.td} pl-6 font-mono text-ui text-navy`}>{c?.task_no}</td>
            <td className={`${T.td} truncate`}>
              <Link href={withReturn(`/cards/${c?.uid}`, "/reports/outline")} className="font-semibold text-navy no-underline hover:underline" title={c?.title}>
                {c?.title}
              </Link>
            </td>
            <td className={`${T.td} truncate text-muted-2`}>{first(c?.team)?.name ?? "—"}</td>
            <td className={T.td}>
              <OutlineCell cardId={r.card_id} year={year} pages={Number(r.pages)} included={r.included} title={c?.title ?? r.card_id} max={maxPages} />
            </td>
          </tr>
        );
      })}
    </>
  );
}
