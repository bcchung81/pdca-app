import type { Metadata } from "next";
import Link from "next/link";
import { Empty, NoAccess, PageHeader, Panel, Screen, StatPanel, T, Toolbar } from "../../../../components/ui/kit";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { fmtInt } from "../../../../lib/format.ts";
import { ACTION_NAME, DEFAULT_LOG_PERIOD, LOG_MAX, LOG_PAGE, LOG_PERIODS, LOG_PERIOD_NAME, LOG_STAT_READ, type LogPeriod, actionName, asUuid, detailText, fmtLogTime, isAccessAction, isLogPeriod, logLimit, logRange } from "../../../../lib/ops/access-log-view.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

export const metadata: Metadata = { title: "접속 기록 · 경평AI비서" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const field = "h-8 min-w-0 rounded-md border border-field-line bg-paper px-2 text-sm text-ink";

type LogRow = { id: number; user_id: string; created_at: string; action: string; target: string | null; ip: string | null; ua: string | null; detail: unknown };

/**
 * 관리자 · 접속 기록(고시 제8조 — 마이그레이션 20261118140000): 로그인·하루 첫 접속·내려받기·사용자 관리·AI 스위치. 읽기 전용(기록은 고치거나 지울 수 없음).
 * 읽기는 사용자 권한 클라이언트(RLS가 관리자만 허용 — 성과관리팀은 이 화면에서 NoAccess, 직접 읽어도 0행)
 */
export default async function AccessLogPage({ searchParams }: PageProps<"/admin/access-log">) {
  const me = await requireAtLeast("admin", "/admin/access-log");
  if (!me) return <NoAccess title="접속 기록" need="관리자" />;
  const sp = await searchParams;
  const periodRaw = one(sp.period);
  const period: LogPeriod = isLogPeriod(periodRaw) ? periodRaw : DEFAULT_LOG_PERIOD;
  const actionRaw = one(sp.action);
  const action = isAccessAction(actionRaw) ? actionRaw : "";
  const userId = asUuid(one(sp.user));
  const limit = logLimit(one(sp.n));
  const range = logRange(period, new Date());

  const supabase = await createClient();
  // 목록(거르기 전부) — limit + 1줄로 「더 보기」 판단
  let q = supabase.from("access_logs").select("id, user_id, created_at, action, target, ip, ua, detail").gte("created_at", range.from).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (range.to) q = q.lt("created_at", range.to);
  if (action) q = q.eq("action", action);
  if (userId) q = q.eq("user_id", userId);
  // 통계(기간·사용자 거르기만 — 행위별 수를 함께 보이려고 행위 거르기는 안 씀)
  const statBase = () => {
    let s = supabase.from("access_logs").select("id", { count: "exact", head: true }).gte("created_at", range.from);
    if (range.to) s = s.lt("created_at", range.to);
    if (userId) s = s.eq("user_id", userId);
    return s;
  };
  let people = supabase.from("access_logs").select("user_id").gte("created_at", range.from).limit(LOG_STAT_READ);
  if (range.to) people = people.lt("created_at", range.to);
  if (userId) people = people.eq("user_id", userId);

  const [{ data: logs, error }, { data: who }, login, visit, download, { data: profiles }, { data: teams }, { data: cards }, { data: units }] = await Promise.all([
    q,
    people,
    statBase().eq("action", "login"),
    statBase().eq("action", "visit"),
    statBase().eq("action", "download"),
    supabase.from("profiles").select("id, display_name, email, team_id").order("display_name"),
    supabase.from("teams").select("id, name"),
    supabase.from("cards").select("uid, task_no, title"),
    supabase.from("eval_units").select("id, name"),
  ]);
  const rows = (logs ?? []) as LogRow[];
  const more = rows.length > limit;
  const shown = rows.slice(0, limit);
  const visitors = new Set((who ?? []).map((r) => r.user_id)).size;
  const visitorsCapped = (who ?? []).length >= LOG_STAT_READ;

  const person = new Map((profiles ?? []).map((p) => [p.id, p]));
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const cardByUid = new Map((cards ?? []).map((c) => [c.uid, c]));
  const unitName = new Map((units ?? []).map((u) => [u.id, u.name]));
  const nameOf = (id: string) => person.get(id)?.display_name || person.get(id)?.email || "알 수 없는 계정";
  /** 대상 풀기: 과제 uid → 과제번호·제목, 사용자 id → 이름, 평가단위 → 이름, 못 풀면 원래 값 */
  const targetText = (r: LogRow): string => {
    const t = r.target;
    if (!t) return "—";
    const c = cardByUid.get(t);
    if (c) return `${c.task_no} ${c.title}`;
    const u = asUuid(t);
    if (u && person.has(u)) return nameOf(u);
    const unit = unitName.get(t);
    if (unit) return `${t} ${unit}`;
    return t;
  };

  const href = (over: { n?: number }) => {
    const p = new URLSearchParams();
    if (period !== DEFAULT_LOG_PERIOD) p.set("period", period);
    if (action) p.set("action", action);
    if (userId) p.set("user", userId);
    if (over.n) p.set("n", String(over.n));
    const s = p.toString();
    return `/admin/access-log${s ? `?${s}` : ""}`;
  };
  const filtered = Boolean(action || userId || period !== DEFAULT_LOG_PERIOD);
  const statError = login.error ?? visit.error ?? download.error;

  return (
    <Screen
      header={
        <PageHeader title="접속 기록">
          <form method="get" action="/admin/access-log" className="flex min-w-0 flex-wrap items-center gap-2">
            <select name="period" defaultValue={period} aria-label="기간" className={field}>
              {LOG_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {LOG_PERIOD_NAME[p]}
                </option>
              ))}
            </select>
            <select name="user" defaultValue={userId ?? ""} aria-label="사용자" className={`${field} max-w-[200px]`}>
              <option value="">모든 사용자</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name || p.email}
                </option>
              ))}
            </select>
            <select name="action" defaultValue={action} aria-label="행위" className={field}>
              <option value="">모든 행위</option>
              {Object.entries(ACTION_NAME).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
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
      {(error || statError) && (
        <p role="alert" className="rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-ui leading-6 text-warn">
          접속 기록을 읽지 못했습니다({(error ?? statError)?.message}). 운영 DB에 마이그레이션 20261118140000(접속 기록)이 적용됐는지 확인해 주세요.
        </p>
      )}
      <StatPanel
        metrics={[
          { label: "접속자", value: `${fmtInt(visitors)}${visitorsCapped ? "+" : ""}`, sub: `${LOG_PERIOD_NAME[period]} · 중복 없는 사용자`, title: visitorsCapped ? `앞 ${fmtInt(LOG_STAT_READ)}줄로 셈` : undefined },
          { label: "로그인", value: fmtInt(login.count ?? 0), sub: "메일 링크 로그인 성공" },
          { label: "첫 접속", value: fmtInt(visit.count ?? 0), sub: "사용자별 하루 첫 화면" },
          { label: "내려받기", value: fmtInt(download.count ?? 0), sub: "한글·HTML·CSV·MD" },
        ]}
      />
      <Panel
        title="최근 기록"
        aside={
          <Toolbar>
            <span>
              {LOG_PERIOD_NAME[period]}
              {action ? ` · ${actionName(action)}` : ""}
              {userId ? ` · ${nameOf(userId)}` : ""} · {fmtInt(shown.length)}건{more ? " 이상" : ""}
            </span>
            {filtered && (
              <Link href="/admin/access-log" className="text-link no-underline hover:underline">
                거르기 해제
              </Link>
            )}
          </Toolbar>
        }
        className="min-h-0 lg:flex-1"
      >
        {shown.length === 0 ? (
          <Empty title={error ? "접속 기록을 읽지 못했습니다." : filtered ? "조건에 맞는 기록이 없습니다." : `${LOG_PERIOD_NAME[period]} 접속 기록이 없습니다.`} />
        ) : (
          <div className="max-h-[70vh] min-h-0 flex-1 overflow-auto lg:max-h-none">
            <table className={`${T.table} min-w-[1080px]`}>
              <colgroup>
                <col className="w-[150px]" />
                <col className="w-[170px]" />
                <col className="w-[110px]" />
                <col />
                <col className="w-[130px]" />
                <col className="w-[150px]" />
              </colgroup>
              <thead>
                <tr className={T.headRow}>
                  {["일시", "사용자", "행위", "대상", "IP", "기기"].map((h) => (
                    <th key={h} scope="col" className={`${T.th} sticky top-0 z-10 bg-thead`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const p = person.get(r.user_id);
                  const team = p?.team_id ? teamName.get(p.team_id) : undefined;
                  const target = targetText(r);
                  const extra = detailText(r.action, r.detail);
                  return (
                    <tr key={r.id} className={T.row}>
                      <td className={`${T.td} font-mono text-xs text-muted`}>{fmtLogTime(r.created_at)}</td>
                      <td className={`${T.td} truncate`} title={`${nameOf(r.user_id)}${team ? ` · ${team}` : ""}`}>
                        {nameOf(r.user_id)}
                        {team && <span className="ml-1 text-xs text-muted-2">{team}</span>}
                      </td>
                      <td className={`${T.td} truncate`}>{actionName(r.action)}</td>
                      <td className={`${T.td} truncate`} title={[target, extra].filter((x) => x && x !== "—").join(" · ") || undefined}>
                        {target}
                        {extra && <span className="ml-1 text-xs text-muted-2">{extra}</span>}
                      </td>
                      <td className={`${T.td} truncate font-mono text-xs text-muted-2`} title={r.ip ?? undefined}>
                        {r.ip ?? "—"}
                      </td>
                      <td className={`${T.td} truncate text-xs text-muted-2`}>{r.ua ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {more && (
              <div className="px-5 py-3 text-center">
                {limit < LOG_MAX ? (
                  <Link href={href({ n: limit + LOG_PAGE })} className={T.btn}>
                    더 보기
                  </Link>
                ) : (
                  <span className="text-xs text-muted">최근 {fmtInt(LOG_MAX)}건까지만 보입니다. 기간·사용자·행위로 좁혀 주세요.</span>
                )}
              </div>
            )}
          </div>
        )}
      </Panel>
    </Screen>
  );
}
