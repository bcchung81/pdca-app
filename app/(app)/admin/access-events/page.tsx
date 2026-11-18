import type { Metadata } from "next";
import Link from "next/link";
import { Empty, NoAccess, PageHeader, Panel, Screen, T, Toolbar } from "../../../../components/ui/kit";
import { ACTION_LABEL, DEFAULT_PERIOD, EVENT_MAX, EVENT_PERIODS, PERIOD_NAME, actionLabel, asUserId, eventLimit, isEventPeriod, periodRange, summarizeDetail, type EventPeriod } from "../../../../lib/admin/access-events.ts";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { fmtDateTime } from "../../../../lib/format.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "권한 변경 기록 · 경평AI비서" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const field = "h-8 min-w-0 rounded-md border border-field-line bg-paper px-2 text-sm text-ink";

/** 성과관리팀·관리자 · 권한 변경 기록: 누가 누구의 계정·역할·팀·사용 여부·담당 과제를 바꿨나(DB 트리거가 남긴 access_events, 읽기 전용) */
export default async function AccessEventsPage({ searchParams }: PageProps<"/admin/access-events">) {
  const me = await requireAtLeast("pmo", "/admin/access-events");
  if (!me) return <NoAccess title="권한 변경 기록" need="성과관리팀" />;
  const sp = await searchParams;
  const periodRaw = one(sp.period);
  const period: EventPeriod = isEventPeriod(periodRaw) ? periodRaw : DEFAULT_PERIOD;
  const actionRaw = one(sp.action);
  const action = actionRaw in ACTION_LABEL ? actionRaw : "";
  const userId = asUserId(one(sp.user));
  const limit = eventLimit(one(sp.n));
  const range = periodRange(period, new Date());

  const supabase = await createClient();
  let q = supabase.from("access_events").select("id, actor_id, target_user_id, action, detail, created_at").gte("created_at", range.from).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (range.to) q = q.lt("created_at", range.to);
  if (action) q = q.eq("action", action);
  if (userId) q = q.or(`actor_id.eq.${userId},target_user_id.eq.${userId}`);
  const [{ data: events, error }, { data: people }, { data: teams }, { data: cards }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, display_name, email, team_id").order("display_name"),
    supabase.from("teams").select("id, name"),
    supabase.from("cards").select("id, task_no"),
  ]);
  const rows = events ?? [];
  const more = rows.length > limit;
  const shown = rows.slice(0, limit);
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const taskNo = new Map((cards ?? []).map((c) => [c.id, c.task_no]));
  const nameOf = (id: string | null) => (id ? (person.get(id)?.display_name || person.get(id)?.email || "삭제된 계정") : null);
  const lookup = { team: (id: number) => teamName.get(id), taskNo: (id: string) => taskNo.get(id) };

  const href = (over: { n?: number }) => {
    const p = new URLSearchParams();
    if (period !== DEFAULT_PERIOD) p.set("period", period);
    if (action) p.set("action", action);
    if (userId) p.set("user", userId);
    if (over.n) p.set("n", String(over.n));
    const s = p.toString();
    return `/admin/access-events${s ? `?${s}` : ""}`;
  };
  const filtered = Boolean(action || userId || period !== DEFAULT_PERIOD);
  const userName = userId ? (nameOf(userId) ?? "알 수 없는 사용자") : "";

  return (
    <Screen
      header={
        <PageHeader title="권한 변경 기록">
          <form method="get" action="/admin/access-events" className="flex min-w-0 flex-wrap items-center gap-2">
            <select name="period" defaultValue={period} aria-label="기간" className={field}>
              {EVENT_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {PERIOD_NAME[p]}
                </option>
              ))}
            </select>
            <select name="action" defaultValue={action} aria-label="무엇을" className={field}>
              <option value="">모든 종류</option>
              {Object.entries(ACTION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select name="user" defaultValue={userId ?? ""} aria-label="사용자" className={`${field} max-w-[200px]`}>
              <option value="">모든 사용자</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name || p.email}
                </option>
              ))}
            </select>
            <button type="submit" className={T.btn}>
              거르기
            </button>
          </form>
        </PageHeader>
      }
    >
      {error && (
        <p role="alert" className="rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-ui leading-6 text-warn">
          권한 변경 기록을 읽지 못했습니다({error.message}).
        </p>
      )}
      <Panel
        title="최근 변경"
        aside={
          <Toolbar>
            <span>
              {PERIOD_NAME[period]}
              {action ? ` · ${actionLabel(action)}` : ""}
              {userId ? ` · ${userName}` : ""} · {shown.length}건{more ? " 이상" : ""}
            </span>
            {filtered && (
              <Link href="/admin/access-events" className="text-link no-underline hover:underline">
                거르기 해제
              </Link>
            )}
          </Toolbar>
        }
        className="min-h-0 lg:flex-1"
      >
        {shown.length === 0 ? (
          <Empty title={error ? "권한 변경 기록을 읽지 못했습니다." : filtered ? "조건에 맞는 기록이 없습니다." : `${PERIOD_NAME[period]} 권한 변경 기록이 없습니다.`} />
        ) : (
          <div className="max-h-[70vh] min-h-0 flex-1 overflow-auto lg:max-h-none">
            <table className={`${T.table} min-w-[960px]`}>
              <colgroup>
                <col className="w-[104px]" />
                <col className="w-[150px]" />
                <col className="w-[200px]" />
                <col className="w-[150px]" />
                <col />
              </colgroup>
              <thead>
                <tr className={T.headRow}>
                  {["일시", "한 사람", "대상", "무엇을", "내용"].map((h) => (
                    <th key={h} scope="col" className={`${T.th} sticky top-0 z-10 bg-thead`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const target = e.target_user_id ? person.get(e.target_user_id) : undefined;
                  const targetTeam = target?.team_id ? teamName.get(target.team_id) : undefined;
                  const summary = summarizeDetail(e.action, e.detail, lookup);
                  const actor = nameOf(e.actor_id);
                  return (
                    <tr key={e.id} className={T.row}>
                      <td className={`${T.td} font-mono text-xs text-muted`}>{fmtDateTime(e.created_at)}</td>
                      <td className={`${T.td} truncate`} title={actor ?? undefined}>
                        {actor ?? <span className="text-muted-2">시스템</span>}
                      </td>
                      <td className={`${T.td} truncate`} title={e.target_user_id ? `${nameOf(e.target_user_id)}${targetTeam ? ` · ${targetTeam}` : ""}` : undefined}>
                        {e.target_user_id ? (
                          <>
                            {nameOf(e.target_user_id)}
                            {targetTeam && <span className="ml-1 text-xs text-muted-2">{targetTeam}</span>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${T.td} truncate`}>{actionLabel(e.action)}</td>
                      <td className={`${T.td} truncate text-muted-2`} title={summary}>
                        {summary || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {more && (
              <div className="px-5 py-3 text-center">
                {limit < EVENT_MAX ? (
                  <Link href={href({ n: limit + 200 })} className={T.btn}>
                    더 보기
                  </Link>
                ) : (
                  <span className="text-xs text-muted">최근 {EVENT_MAX.toLocaleString("ko-KR")}건까지만 보입니다. 기간·종류·사용자로 좁혀 주세요.</span>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>
    </Screen>
  );
}
