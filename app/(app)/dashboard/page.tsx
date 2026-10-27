import type { Metadata } from "next";
import Link from "next/link";
import { type DeptTile, type HqGroup, HqDeptPanel, type TodoItem, TodoPanel, UnitsPanel } from "../../../components/dashboard/dash-panels";
import { NoAccess, PageHeader, Screen, StatPanel, T } from "../../../components/ui/kit";
import { INSPECTION_STATUS_TONE } from "../../../components/ui/status-tone.ts";
import { requireAtLeast } from "../../../lib/auth/dal.ts";
import { EMPTY_VIEW, viewParams } from "../../../lib/cards/board-view.ts";
import { fixedLabelOfTrack } from "../../../lib/cards/fixed.ts";
import { listCards } from "../../../lib/cards/queries.ts";
import { versionStates } from "../../../lib/cards/versions.ts";
import { compareUnitId, currentPeriod } from "../../../lib/cards/view.ts";
import { oldestDaysAgo, spreadText } from "../../../lib/dashboard/spread.ts";
import { monthLabel, shiftPeriod } from "../../../lib/format.ts";
import { inspectionsForPeriod } from "../../../lib/inspections/queries.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { getTrack } from "../../../lib/tracks/current.ts";
import { DEFAULT_TRACK } from "../../../lib/tracks/index.ts";

export const metadata: Metadata = { title: "현황 · 경평AI비서" };

/**
 * 성과관리팀·관리자 첫 화면. 경영관리 ↔ 주요사업을 오가도 같은 틀(통계 한 줄 · 이달 할 일 · 평가단위별 · 본부→부서별)이고
 * 트랙은 데이터(과제·평가단위 이름·연간 준비 할 일)만 가름. 스크롤 없이 한 화면에 들어가도록 표 대신 막대·타일로 압축.
 * 화면 높이 약 760px 이상에서 페이지 스크롤이 없고, 그보다 낮거나 부서가 많으면 안전망으로 스크롤됨.
 */
export default async function DashboardPage() {
  const me = await requireAtLeast("pmo", "/dashboard");
  if (!me) return <NoAccess title="현황" need="성과관리팀" />;
  const track = await getTrack();
  // 연간 준비: 고정 영역 확정·보고서 목차는 두 트랙 모두(경영관리 목차는 2025 쪽 수 기준 배정안 — 2026-10-10), 목차 행은 고른 트랙 것만 셈
  const period = currentPeriod();
  const prev = shiftPeriod(period, -1);
  const supabase = await createClient();
  const [rows, versions, allInspections, allPrevInspections, { data: profiles }, { data: assigned }, { count: unlocked }, { count: outlined }] = await Promise.all([
    listCards({ track }),
    versionStates(supabase, period),
    inspectionsForPeriod(supabase, period),
    inspectionsForPeriod(supabase, prev),
    supabase.from("profiles").select("id, role, team_id, active"),
    supabase.from("card_assignees").select("card_id"),
    supabase.from("cards").select("id, unit:eval_units!inner(track)", { count: "exact", head: true }).eq("status", "active").eq("unit.track", track).is("fixed_locked_at", null),
    supabase.from("report_outline").select("card_id, unit:eval_units!inner(track)", { count: "exact", head: true }).eq("year", Number(period.slice(0, 4))).eq("unit.track", track),
  ]);

  // 이 현황은 고른 트랙의 과제만 — 다른 트랙 과제의 점검표(다른 양식)는 세지 않음
  const mine = new Set(rows.map((r) => r.id));
  const onlyMine = <T,>(m: Map<string, T>) => new Map([...m].filter(([id]) => mine.has(id)));
  const inspections = onlyMine(allInspections);
  const prevInspections = onlyMine(allPrevInspections);
  const insp = { draft: 0, sent: 0, acknowledged: 0 };
  for (const i of inspections.values()) insp[i.status] += 1;
  const prevUnacked = [...prevInspections.values()].filter((i) => i.status === "sent").length;

  const status = (id: string) => versions.get(id)?.status ?? "none";
  const done = (id: string) => ["submitted", "confirmed"].includes(status(id));
  const submitted = rows.filter((r) => status(r.id) === "submitted").length;
  // 부서가 이달 직접 확정(원장 반영)한 과제 — 성과관리팀은 수정 이력에서 보고 필요하면 원장을 고침(2026-10-27)
  const confirmed = rows.filter((r) => status(r.id) === "confirmed");
  const started = rows.filter((r) => versions.has(r.id)).length;

  // 평가단위별(주요사업 = 대상사업 3개, 경영관리 = 지표 1~14)
  const unitMap = new Map<string, { id: string; name: string; n: number; submitted: number; sent: number }>();
  for (const r of rows) {
    const u = unitMap.get(r.evalUnitId) ?? { id: r.evalUnitId, name: r.business, n: 0, submitted: 0, sent: 0 };
    u.n += 1;
    if (done(r.id)) u.submitted += 1;
    if (["sent", "acknowledged"].includes(inspections.get(r.id)?.status ?? "")) u.sent += 1;
    unitMap.set(r.evalUnitId, u);
  }
  const mgmt = track !== DEFAULT_TRACK.id;
  const units = [...unitMap.values()]
    .sort((a, b) => compareUnitId(a.id, b.id))
    .map((u) => ({ ...u, name: mgmt ? `${u.id.replace("MG-", "")}. ${u.name}` : u.name }));

  // 부서(팀) 타일 → 본부·실·단으로 묶음
  const accounts = new Map<number, number>();
  for (const p of profiles ?? []) if (p.team_id && p.role === "dept_user" && p.active) accounts.set(p.team_id, (accounts.get(p.team_id) ?? 0) + 1);
  const assignedIds = new Set((assigned ?? []).map((a) => a.card_id));
  const teamMap = new Map<string, { team: string; teamId: number | null; hq: string; cards: typeof rows }>();
  for (const r of rows) {
    const key = r.team ?? r.department;
    const t = teamMap.get(key) ?? { team: key, teamId: r.teamId, hq: r.department, cards: [] };
    t.cards.push(r);
    teamMap.set(key, t);
  }
  const tiles: DeptTile[] = [...teamMap.values()].map((t) => ({
    key: t.team,
    name: t.team,
    teamId: t.teamId,
    hq: t.hq,
    n: t.cards.length,
    submitted: t.cards.filter((r) => done(r.id)).length,
    unacked: t.cards.filter((r) => inspections.get(r.id)?.status === "sent" || prevInspections.get(r.id)?.status === "sent").length,
    accounts: t.teamId ? (accounts.get(t.teamId) ?? 0) : 0,
  }));
  const hqMap = new Map<string, HqGroup>();
  for (const t of tiles) {
    const g = hqMap.get(t.hq) ?? { hq: t.hq, n: 0, submitted: 0, tiles: [] };
    g.n += t.n;
    g.submitted += t.submitted;
    g.tiles.push(t);
    hqMap.set(t.hq, g);
  }
  const groups = [...hqMap.values()].map((g) => ({ ...g, tiles: g.tiles.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "ko")) })).sort((a, b) => b.n - a.n || a.hq.localeCompare(b.hq, "ko"));

  const noAccount = tiles.filter((t) => !t.accounts);
  const unassigned = rows.filter((r) => !assignedIds.has(r.id));
  // 줄마다 「어디에 몰려 있는지」 보충: 과제는 본부·실·단별, 제출·미확인은 부서(팀)별
  const hqOf = (list: typeof rows) => spreadText(list.map((r) => r.department));
  const teamOf = (list: typeof rows) => spreadText(list.map((r) => r.team ?? r.department));
  const waiting = rows.filter((r) => status(r.id) === "submitted");
  const waitDays = oldestDaysAgo(waiting.map((r) => versions.get(r.id)?.submittedAt), new Date());
  // 할 일 숫자 → 같은 대상이 걸러진 과제 목록(/cards는 같은 versionStates·같은 트랙 카드로 칩을 만듦)
  const draftHref = (value: string) => `/cards?${viewParams({ ...EMPTY_VIEW, filters: { ...EMPTY_VIEW.filters, draft: [value] } })}`;
  const noAccountTeams = new Set(noAccount.map((t) => t.key));
  const todo: TodoItem[] = [
    { n: confirmed.length, of: rows.length, label: `${monthLabel(period)} 부서 확정 작성본`, hint: "부서가 원장에 바로 반영한 과제 — 수정 이력에서 보고 필요하면 원장을 고침", detail: confirmed.length ? teamOf(confirmed) : undefined, href: draftHref("확정") },
    // 2026-10-27 전에 제출된 작성본이 남아 있을 때만(부서는 이제 제출하지 않고 확정)
    ...(submitted ? [{ n: submitted, of: rows.length, label: "확정 대기 작성본", hint: "예전에 부서가 제출한 작성본 — 원장에서 비교하고 확정", detail: `${waitDays !== null ? `가장 오래된 제출 ${waitDays}일 전 · ` : ""}${teamOf(waiting)}`, href: draftHref("제출") }] : []),
    { n: rows.length - started, of: rows.length, label: `${monthLabel(period)} 작성본 시작 전`, hint: "부서가 이달 실적을 아직 반영하지 않은 과제", detail: hqOf(rows.filter((r) => !versions.has(r.id))), href: draftHref("시작 전") },
    { n: noAccount.length, of: tiles.length, label: "담당자 계정이 없는 부서", alert: true, hint: "「사용자」에서 계정을 등록", detail: noAccount.length ? `과제 수 ${spreadText(rows.filter((r) => noAccountTeams.has(r.team ?? r.department)).map((r) => r.team ?? r.department), 4)}` : undefined, href: "/users/import" },
    { n: unassigned.length, of: rows.length, label: "담당 과제로 지정되지 않은 과제", alert: true, hint: "담당자가 지정돼야 부서 담당자가 과제를 봄(팀이 정해지면 자동 매칭)", detail: hqOf(unassigned), href: "/users" },
    { n: rows.length - inspections.size, of: rows.length, label: `${monthLabel(period)} 점검 미작성`, hint: "과제별 점검표(AI 초안·직접 판단)를 쓰고 부서에 보내기", detail: hqOf(rows.filter((r) => !inspections.has(r.id))), href: `/inspections?period=${period}&status=none` },
    { n: insp.draft, of: rows.length, label: "보내지 않은 점검 초안", hint: "모든 항목 판단·미흡 근거 확인 뒤 보내기", detail: insp.draft ? hqOf(rows.filter((r) => inspections.get(r.id)?.status === "draft")) : undefined, href: `/inspections?period=${period}&status=draft` },
    { n: prevUnacked, of: prevInspections.size || undefined, label: `${monthLabel(prev)} 점검 부서 미확인`, hint: "보냈지만 담당자가 아직 확인하지 않음", detail: prevUnacked ? teamOf(rows.filter((r) => prevInspections.get(r.id)?.status === "sent")) : undefined, href: `/inspections?period=${prev}&status=sent` },
    // 연간 준비(남아 있을 때만)
    ...(unlocked ? [{ n: unlocked, of: rows.length, label: "고정 영역 미확정 과제", hint: `${fixedLabelOfTrack(track)}를 확정하면 부서 작성본에서 잠김`, href: "/cards" }] : []),
    ...(!outlined ? [{ n: rows.length, of: rows.length, label: "보고서 목차·쪽 배정 전", hint: track === DEFAULT_TRACK.id ? "카드로 평가내용2 목차를 만들고 과제별 쪽수 배정" : "카드로 지표별 평가내용 목차를 만들고 2025 쪽 수 기준으로 과제별 쪽수 배정", href: "/reports/outline" }] : []),
  ];

  const inspBase = `/inspections?period=${period}`;
  return (
    <Screen
      header={
        <PageHeader title="현황">
          <Link href="/cards" className={T.btn}>
            과제 원장
          </Link>
          <Link href="/inspections" className={T.btnPrimary}>
            월간 점검
          </Link>
        </PageHeader>
      }
    >
      {/* 한 화면 틀: 바깥 상자가 남는 높이를 채우고(grow), 안쪽 패널은 flex로 높이를 나눠 가짐. 낮은 창에서는 min-h에서 멈추고 본문이 스크롤(안전망) */}
      <div className="flex min-h-[540px] grow flex-col gap-3">
        <StatPanel
          title={`${monthLabel(period)} 점검`}
          total={rows.length}
          unit={`과제 · 부서 ${tiles.length}곳 · 본부·실·단 ${groups.length}곳`}
          allHref={inspBase}
          segments={[
            { label: "확인함", n: insp.acknowledged, tone: INSPECTION_STATUS_TONE.acknowledged.seg, href: `${inspBase}&status=acknowledged`, title: "부서가 확인" },
            { label: "보냄", n: insp.sent, tone: INSPECTION_STATUS_TONE.sent.seg, href: `${inspBase}&status=sent`, title: "부서 확인 대기" },
            { label: "초안", n: insp.draft, tone: INSPECTION_STATUS_TONE.draft.seg, href: `${inspBase}&status=draft`, title: "보내기 전" },
            { label: "미작성", n: rows.length - inspections.size, tone: INSPECTION_STATUS_TONE.none.seg, href: `${inspBase}&status=none`, title: "점검표 없음" },
          ]}
          metrics={[
            { label: `${monthLabel(period)} 작성본`, value: started, sub: `/${rows.length}`, bar: { n: started, of: rows.length }, href: "/cards", title: `부서 확정 ${confirmed.length}건` },
            { label: "담당자 계정이 있는 부서", value: tiles.length - noAccount.length, sub: `/${tiles.length}`, bar: { n: tiles.length - noAccount.length, of: tiles.length }, tone: noAccount.length ? "warn" : undefined, href: "/users" },
            { label: "담당 과제로 지정됨", value: rows.length - unassigned.length, sub: `/${rows.length}`, bar: { n: rows.length - unassigned.length, of: rows.length }, tone: unassigned.length ? "warn" : undefined, href: "/users" },
          ]}
        />
        <div className="flex min-h-0 grow flex-col gap-3 xl:flex-row">
          <div className="flex shrink-0 flex-col gap-3 xl:w-[372px]">
            <TodoPanel items={todo} />
          </div>
          <div className="flex min-w-0 grow flex-col gap-3">
            <UnitsPanel units={units} title={mgmt ? "지표별" : "대상사업별"} columns={units.length > 6 ? 2 : 1} />
            <HqDeptPanel groups={groups} />
          </div>
        </div>
      </div>
    </Screen>
  );
}
