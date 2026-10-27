import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader, Panel, Screen, StatPanel, T, Tag, Toolbar } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { compareTaskNo, currentPeriod } from "../../../../lib/cards/view.ts";
import { fmtDate } from "../../../../lib/format.ts";
import { withReturn } from "../../../../lib/nav/return-to.ts";
import { readSection } from "../../../../lib/reports/section.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { getTrack } from "../../../../lib/tracks/current.ts";
import type { LooseJson } from "../../../../lib/loose-json.ts";

export const metadata: Metadata = { title: "과제별 초안 · 경평 초안 · 경영AI비서" };


/** 이 화면이 읽는 활성 카드(select 열 그대로) */
interface ListCardRow {
  id: string;
  uid: string;
  task_no: string;
  title: string;
  eval_unit_id: string;
  team_id: number;
  data_rev: number | null;
}
/** card_report_drafts select 한 행 */
interface ListDraftRow {
  card_id: string;
  spec: unknown;
  unknown_numbers: unknown[] | null;
  source_rev: number | null;
  updated_at: string;
}

type Filter = "all" | "none" | "done" | "stale";
const FILTER_KEYS: Filter[] = ["all", "none", "done", "stale"];

/**
 * 성과관리팀 · 경평 초안 과제별 초안: 과제관리카드 1장 = 평가내용2 소항목 1건. 사업마다 카드와 초안 상태를 보고,
 * 누르면 카드별 작성 화면(근거 자료 고르기·AI 초안·미리보기)으로 갑니다.
 */
export default async function ReportCardsPage({ searchParams }: PageProps<"/reports/cards">) {
  const me = await requireAtLeast("pmo", "/reports/cards");
  if (!me) return <NoAccess title="경평 초안 · 과제별 초안" need="성과관리팀" />;
  // 트랙(2026-10-09 R3): 머리띠에서 고른 트랙의 과제(주요사업 사업별 · 경영관리 지표별) — 같은 틀
  const track = await getTrack();
  const sp = await searchParams;
  const filter = (FILTER_KEYS.find((k) => k === sp.state) ?? "all") as Filter;
  const year = Number(currentPeriod().slice(0, 4));
  const supabase = await createClient();
  const [{ data: units }, { data: cards }, { data: teams }, { data: drafts }, { data: mats }, { data: reports }, { data: repMats }] = await Promise.all([
    supabase.from("eval_units").select("id, name, card_group").eq("track", track).order("sort").order("id"),
    supabase.from("cards").select("id, uid, task_no, title, eval_unit_id, team_id, data_rev, unit:eval_units!inner(track)").eq("status", "active").eq("unit.track", track),
    supabase.from("teams").select("id, name"),
    supabase.from("card_report_drafts").select("card_id, spec, unknown_numbers, source_rev, updated_at").eq("year", year).not("spec", "is", null),
    supabase.from("card_materials").select("card_id"),
    supabase.from("reports").select("id, eval_unit_id, team_id").eq("year", year),
    supabase.from("report_materials").select("report_id"),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id as number, t.name as string]));
  const draftOf = new Map(((drafts ?? []) as ListDraftRow[]).map((d) => [d.card_id, d]));
  const matCount = new Map<string, number>();
  for (const m of mats ?? []) matCount.set(m.card_id as string, (matCount.get(m.card_id as string) ?? 0) + 1);
  // 그 카드가 속한 보고서(같은 사업·부서·연도)의 추가자료 수
  const repOf = new Map((reports ?? []).map((r) => [String(r.id), `${r.eval_unit_id}|${r.team_id}`]));
  const repMatCount = new Map<string, number>();
  for (const m of repMats ?? []) {
    const k = repOf.get(String(m.report_id));
    if (k) repMatCount.set(k, (repMatCount.get(k) ?? 0) + 1);
  }
  const pickable = (c: ListCardRow) => ({ card: matCount.get(c.id) ?? 0, report: repMatCount.get(`${c.eval_unit_id}|${c.team_id}`) ?? 0 });
  const state = (c: LooseJson): Exclude<Filter, "all"> => {
    const d = draftOf.get(c.id);
    if (!d || !readSection(d.spec)) return "none";
    return d.source_rev !== null && d.source_rev !== c.data_rev ? "stale" : "done";
  };
  const all = (cards ?? []) as ListCardRow[];
  const n = { none: all.filter((c) => state(c) === "none").length, done: all.filter((c) => state(c) !== "none").length, stale: all.filter((c) => state(c) === "stale").length };
  const warned = all.filter((c) => (draftOf.get(c.id)?.unknown_numbers?.length ?? 0) > 0).length;
  const shown = (c: ListCardRow) => filter === "all" || state(c) === filter || (filter === "done" && state(c) === "stale");
  // 지금 이 목록 주소(필터 포함) — 과제별 초안 화면의 목록 아이콘이 돌아올 자리
  const listHref = filter === "all" ? "/reports/cards" : `/reports/cards?state=${filter}`;

  return (
    <Screen header={<PageHeader title="경평 초안" />}>
      <StatPanel
        title="과제관리카드"
        total={all.length}
        allHref="/reports/cards"
        allOn={filter === "all"}
        segments={[
          { label: "초안 있음", n: n.done - n.stale, tone: "navy", href: filter === "done" ? "/reports/cards" : "/reports/cards?state=done", on: filter === "done", title: "초안 있음(다시 만들기 권장 포함해 거름)" },
          { label: "다시 만들기 권장", n: n.stale, tone: "warn", href: filter === "stale" ? "/reports/cards" : "/reports/cards?state=stale", on: filter === "stale", title: "초안 뒤 원장이 바뀜" },
          { label: "초안 없음", n: n.none, tone: "line", href: filter === "none" ? "/reports/cards" : "/reports/cards?state=none", on: filter === "none" },
        ]}
        metrics={[{ label: "숫자 확인", value: warned, tone: warned ? "warn" : undefined, sub: "초안", title: "근거에 없는 숫자가 있는 초안" }]}
      />
      <Toolbar>
        <span className="text-xs text-muted">첨부 = 초안에 넣은 자료 / 고를 수 있는 자료(카드 전용 자료 + 그 보고서 추가자료)</span>
      </Toolbar>
      {(units ?? []).map((u) => {
        const list = all.filter((c) => c.eval_unit_id === u.id && shown(c)).sort((a, b) => compareTaskNo(a.task_no, b.task_no));
        if (!list.length) return null;
        return (
          <Panel key={u.id} title={track === "경영관리" ? u.name : `${u.card_group ?? ""} · ${u.name}`} aside={<span>{list.length}개</span>}>
            <div className="overflow-x-auto">
              <table className={`${T.table} min-w-[820px]`}>
                <colgroup>
                  <col className="w-[72px]" />
                  <col />
                  <col className="w-[150px]" />
                  <col className="w-[132px]" />
                  <col className="w-[76px]" />
                  <col className="w-[88px]" />
                  <col className="w-[92px]" />
                </colgroup>
                <thead>
                  <tr className={T.headRow}>
                    {["과제", "과제명", "부서", "초안", "첨부", "숫자 확인", "만든 날"].map((h) => (
                      <th key={h} scope="col" className={T.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => {
                    const d = draftOf.get(c.id);
                    const spec = readSection(d?.spec);
                    const st = state(c);
                    const unknown = d?.unknown_numbers?.length ?? 0;
                    // 첨부 = 카드 전용 자료·보고서 추가자료만(전년 절·평가 근거는 sources에 함께 남지만 첨부가 아님)
                    const attached = (spec?.sources ?? []).filter((x) => x.kind === "card" || x.kind === "report").length;
                    const can = pickable(c);
                    return (
                      <tr key={c.id} className={T.row}>
                        <td className={`${T.td} font-mono text-ui text-navy`}>{c.task_no}</td>
                        <td className={`${T.td} truncate`}>
                          <Link href={withReturn(`/reports/cards/${c.uid}`, listHref)} className="font-semibold text-navy no-underline hover:underline" title={c.title}>
                            {c.title}
                          </Link>
                        </td>
                        <td className={`${T.td} truncate text-ui text-muted-2`} title={teamName.get(c.team_id) ?? ""}>
                          {teamName.get(c.team_id) ?? "—"}
                        </td>
                        <td className={T.td}>{st === "none" ? <Tag>초안 없음</Tag> : st === "stale" ? <Tag tone="warnSolid">다시 만들기 권장</Tag> : <Tag tone="navy">초안 있음</Tag>}</td>
                        <td className={`${T.td} font-mono text-ui text-muted-2`} title={`초안에 넣은 첨부 ${spec ? `${attached}건` : "—"} / 고를 수 있는 자료 ${can.card + can.report}건(카드 전용 ${can.card} · 보고서 추가자료 ${can.report})`}>
                          {spec ? attached : "—"}/{can.card + can.report}
                        </td>
                        <td className={`${T.td} font-mono text-ui ${unknown ? "text-warn" : "text-muted"}`}>{spec ? unknown : "—"}</td>
                        <td className={`${T.td} font-mono text-xs text-muted`}>{d ? fmtDate(d.updated_at) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </Screen>
  );
}
