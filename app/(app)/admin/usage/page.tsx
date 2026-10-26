import type { Metadata } from "next";
import Link from "next/link";
import { Empty, NoAccess, PageHeader, Panel, Screen, StatPanel, T, Tag } from "../../../../components/ui/kit";
import { aiProvider } from "../../../../lib/ai/run.ts";
import { estimateUsd, isCliModel } from "../../../../lib/ai/pricing.ts";
import { tierOf } from "../../../../lib/ai/models.ts";
import { medianMs, requestState } from "../../../../lib/ai/request-log.ts";
import { requireAtLeast } from "../../../../lib/auth/dal.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { fmtDateTime, fmtInt, isPeriod, periodLabel, shiftPeriod } from "../../../../lib/format.ts";
import { withReturn } from "../../../../lib/nav/return-to.ts";
import { createClient } from "../../../../lib/supabase/server.ts";

/** 1달러 → 원 환산(어림, 화면 표시용 상수) */
const USD_KRW = 1400;
const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtKrw = (usd: number) => `약 ${fmtInt(Math.round(usd * USD_KRW))}원`;

type UsageRow = {
  id: number;
  user_id: string;
  card_id: string | null;
  feature: string;
  mode: string | null;
  model: string | null;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cache_write_1h_tokens: number | null;
  error: string | null;
  created_at: string;
  /** 호출 시작부터 끝맺기까지 ms(2026-10-10 — 그 전 기록은 null) */
  duration_ms: number | null;
};

/** 걸린 시간 표기(초 — 1분 넘으면 분·초) */
const fmtDur = (ms: number | null) => (ms == null ? "—" : ms < 60_000 ? `${Math.round(ms / 1000)}초` : `${Math.floor(ms / 60_000)}분 ${Math.round((ms % 60_000) / 1000)}초`);

/** 기록 한 건의 추정 비용(USD) — 모르는 모델이면 null(합계에서는 0으로 셈, 「모름」 건수로 따로 셈) */
const usdOf = (r: UsageRow) =>
  estimateUsd(r.model, {
    input: r.input_tokens ?? 0,
    output: r.output_tokens ?? 0,
    cacheRead: r.cache_read_tokens ?? 0,
    cacheWrite: r.cache_write_tokens ?? 0,
    cacheWrite1h: r.cache_write_1h_tokens ?? 0,
  });

/** 진행 중·끊김 판단 기준 시각(읽을 때 — 그리기 중에는 시각을 부르지 않음) */
async function readNow(): Promise<number> {
  return Date.now();
}

/** ai_requests 읽기(최근 달). 읽기 실패는 0건으로 숨기지 않고 화면에 알림(예: 운영 DB에 마이그레이션 20261010100000이 없으면 duration_ms 열이 없어 실패) */
async function loadUsageRows(supabase: Awaited<ReturnType<typeof createClient>>, period: string, next: string): Promise<{ rows: UsageRow[]; error: string | null }> {
  const from = `${period}-01T00:00:00+09:00`;
  const to = `${next}-01T00:00:00+09:00`;
  const { data, error } = await supabase
    .from("ai_requests")
    .select("id, user_id, card_id, feature, mode, model, status, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens, error, created_at, duration_ms")
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at", { ascending: false })
    .limit(2000);
  return { rows: data ?? [], error: error?.message ?? null };
}

export const metadata: Metadata = { title: "AI 사용량 · 경영평가 Sherpa" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const MODE_LABEL: Record<string, string> = {
  improve: "개선 제안",
  review: "점검 대비 리뷰(이전)",
  discover: "실적 발굴",
  reflect: "실적 반영",
  followup: "보완 점검",
  polish: "칸 다듬기(이전)",
  month: "점검월 점검",
  pre: "사전점검",
  "0.5p": "0.5쪽 소항목",
  "1p": "1쪽 소항목",
};
const FEATURE_LABEL: Record<string, string> = { card_assist: "카드 작성지원", card_comment: "카드 코멘트", card_chat: "카드 작성지원 · 질문", inspection: "월간 점검 AI 초안", report_section: "보고서 과제별 초안", report_outline: "보고서 구성안", report_block: "보고서 블록 고치기", report_fix: "보고서 과제별 초안 · 자동 고치기", report_unit_mg: "보고서 지표 단위 부분 · 문장 채우기", material_describe: "첨부 그림 설명", prep_match: "과제 매칭(백그라운드)" };
/** 코멘트 묶음의 mode는 "edit:2,ask:1"(종류별 개수) */
const modeText = (r: { feature: string; mode: string | null }) =>
  r.feature === "card_comment"
    ? `코멘트 ${(r.mode ?? "").replace(/edit:(\d+)/, "수정 $1").replace(/ask:(\d+)/, "질문 $1").replace(",", " · ")}`
    : r.feature === "card_chat"
      ? `질문 ${(r.mode ?? "").replace(/^turn:?/, "") || "1"}번째`
      : r.feature === "report_block"
        ? `블록 ${(r.mode ?? "").startsWith("ask") ? "질문" : "고치기"}`
        : (MODE_LABEL[r.mode ?? ""] ?? r.mode ?? FEATURE_LABEL[r.feature] ?? r.feature);

/** 관리자 · AI 사용량: 달마다 호출·토큰·오류(본문은 저장하지 않음) */
export default async function UsagePage({ searchParams }: PageProps<"/admin/usage">) {
  const me = await requireAtLeast("admin", "/admin/usage");
  if (!me) return <NoAccess title="AI 사용량" need="관리자" />;
  const sp = await searchParams;
  const period = isPeriod(one(sp.period)) ? one(sp.period) : currentPeriod();
  const next = shiftPeriod(period, 1);
  const supabase = await createClient();
  const [{ rows: list, error: loadError }, { data: people }, { data: cards }] = await Promise.all([loadUsageRows(supabase, period, next), supabase.from("profiles").select("id, display_name, email, role"), supabase.from("cards").select("id, uid, task_no, title")]);
  const provider = aiProvider();
  const who = new Map((people ?? []).map((p) => [p.id, p.display_name || p.email || "—"]));
  const card = new Map((cards ?? []).map((c) => [c.id, c]));
  const sum = (k: "input_tokens" | "output_tokens" | "cache_read_tokens" | "cache_write_tokens") => list.reduce((n, r) => n + (r[k] ?? 0), 0);
  const totalUsd = list.reduce((n, r) => n + (usdOf(r) ?? 0), 0);
  const unknownModelCount = list.filter((r) => r.status !== "error" && usdOf(r) == null).length;
  const errors = list.filter((r) => r.status === "error").length;
  // 진행 중(running)·끊긴 것(끝맺지 못한 오래된 running — lib/ai/request-log.ts requestState)
  const now = await readNow();
  const running = list.filter((r) => requestState(r, now) === "running").length;
  const stalled = list.filter((r) => requestState(r, now) === "stalled").length;
  const group = <K extends string>(key: (r: UsageRow) => K) => {
    const m = new Map<K, { n: number; input: number; output: number; usd: number; errors: number; rows: UsageRow[] }>();
    for (const r of list) {
      const k = key(r);
      const g = m.get(k) ?? { n: 0, input: 0, output: 0, usd: 0, errors: 0, rows: [] };
      g.n += 1;
      g.input += r.input_tokens ?? 0;
      g.output += r.output_tokens ?? 0;
      g.usd += usdOf(r) ?? 0;
      g.errors += r.status === "error" ? 1 : 0;
      g.rows.push(r);
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  };
  // 코멘트 묶음은 개수가 달라도 한 줄로
  // 블록 고치기는 mode(edit+b3+1f)에 블록 번호가 있어 고치기·질문 두 줄로만
  const byMode = group((r) => `${r.feature}|${r.feature === "card_comment" || r.feature === "card_chat" ? "" : r.feature === "report_block" ? (r.mode ?? "").split("+")[0] : (r.mode ?? "")}`);
  const byUser = group((r) => r.user_id);

  // 이름 칸: 기능 이름(위 줄) + 모드(아래 작은 줄)로 나눠 — 좁은 칸에서도 서로 다른 행이 「보고서 과제별 초…」로 똑같이 잘리지 않게(줄바꿈은 안 하고 두 줄로만 나눔)
  const small = (title: string, entries: Array<[string, { n: number; input: number; output: number; usd: number; errors: number; rows: UsageRow[] }]>, label: (k: string) => { name: string; sub?: string }) => (
    <Panel title={title}>
      {entries.length === 0 ? (
        <p className="px-5 py-6 text-center text-ui text-muted">기록 없음</p>
      ) : (
        <table className={T.table}>
          <colgroup>
            <col />
            <col className="w-[52px]" />
            <col className="w-[82px]" />
            <col className="w-[82px]" />
            <col className="w-[70px]" />
            <col className="w-[64px]" />
            <col className="w-[44px]" />
          </colgroup>
          <thead>
            <tr className={T.headRow}>
              {["", "요청", "입력 토큰", "출력 토큰", "추정 금액", "시간(중앙)", "오류"].map((h, i) => (
                <th key={i} scope="col" className={T.th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, g]) => {
              const { name, sub } = label(k);
              return (
                <tr key={k} className="hover:bg-row-hover">
                  <td className="border-b border-row-line px-3 py-1.5 align-middle">
                    <span className="block truncate text-ui text-ink" title={sub ? `${name} · ${sub}` : name}>
                      {name}
                    </span>
                    {sub && (
                      <span className="block truncate text-xs text-muted-2" title={sub}>
                        {sub}
                      </span>
                    )}
                  </td>
                  <td className={`${T.td} font-mono text-ui`}>{g.n}</td>
                  <td className={`${T.td} font-mono text-ui text-muted-2`}>{fmtInt(g.input)}</td>
                  <td className={`${T.td} font-mono text-ui text-muted-2`}>{fmtInt(g.output)}</td>
                  <td className={`${T.td} font-mono text-ui text-muted-2`}>{fmtUsd(g.usd)}</td>
                  <td className={`${T.td} font-mono text-ui text-muted-2`} title="끝맺은 호출의 소요 시간 중앙값(2026-10-10부터 기록)">
                    {fmtDur(medianMs(g.rows))}
                  </td>
                  <td className={`${T.td} font-mono text-ui ${g.errors ? "text-warn" : "text-muted"}`}>{g.errors}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );

  return (
    <Screen
      header={
        <PageHeader title="AI 사용량">
          <span>
            <Tag tone={provider === "cli" ? "warn" : "navy"}>AI 연결 · {provider === "cli" ? "Claude Code CLI(임시)" : "Claude API"}</Tag>
          </span>
          <nav aria-label="기간" className="flex items-center gap-1">
            <Link href={`/admin/usage?period=${shiftPeriod(period, -1)}`} className={T.btn} aria-label="이전 달">
              ‹
            </Link>
            <span className="px-2 font-serif text-base font-bold whitespace-nowrap text-navy">{periodLabel(period)}</span>
            <Link href={`/admin/usage?period=${next}`} className={T.btn} aria-label="다음 달">
              ›
            </Link>
          </nav>
        </PageHeader>
      }
    >
      {loadError && (
        <p role="alert" className="rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-ui leading-6 text-warn">
          AI 호출 기록을 읽지 못해 아래 숫자가 비어 있습니다({loadError}). 운영 DB에 마이그레이션 20261010100000(AI 호출 진행 중 기록)이 적용됐는지 확인해 주세요.
        </p>
      )}
      <StatPanel
        metrics={[
          { label: "요청", value: fmtInt(list.length), sub: `사용자 ${byUser.length}명` },
          { label: "입력 토큰", value: fmtInt(sum("input_tokens")), sub: "프롬프트·근거 자료" },
          { label: "캐시 읽기 토큰", value: fmtInt(sum("cache_read_tokens")), sub: "지침 캐시 재사용" },
          { label: "캐시 쓰기 토큰", value: fmtInt(sum("cache_write_tokens")), sub: "지침 캐시 처음 저장" },
          { label: "출력 토큰", value: fmtInt(sum("output_tokens")), sub: "제안·검토 결과" },
          { label: "오류", value: errors, sub: errors ? "아래 최근 기록 확인" : "없음", tone: errors ? "warn" : undefined },
        ]}
      />
      <StatPanel
        metrics={[
          { label: "추정 금액(USD)", value: fmtUsd(totalUsd), sub: fmtKrw(totalUsd), title: `${fmtKrw(totalUsd)} · 1달러 1,400원 가정 · 부가세 별도` },
          { label: "비용 모름", value: fmtInt(unknownModelCount), sub: unknownModelCount ? "단가표에 없는 모델" : "모두 계산됨", tone: unknownModelCount ? "warn" : undefined, title: unknownModelCount ? "단가표에 없는 모델(합계에서 0으로 셈)" : "모두 계산됨" },
          { label: "진행 중", value: fmtInt(running), sub: stalled ? `끊긴 것 ${stalled}` : "끊긴 것 없음", tone: stalled ? "warn" : undefined, title: "진행 중 = 끝나지 않은 호출(1분 5회·동시 2건 제한에 셈), 끊긴 것 = 20분 넘게 끝맺지 못한 호출(함수가 시간 제한에서 끊김 추정 — 쓴 토큰을 모름)" },
        ]}
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {small("기능별", byMode, (k) => {
          const [f, m] = k.split("|");
          if (f === "report_block") return { name: FEATURE_LABEL[f] ?? f, sub: `${m === "ask" ? "질문" : "고치기"} · ${tierOf(f)}` };
          return { name: FEATURE_LABEL[f] ?? f, sub: `${m ? `${MODE_LABEL[m] ?? m} · ` : ""}${tierOf(f)}` };
        })}
        {small("사용자별", byUser, (k) => ({ name: who.get(k) ?? "삭제된 사용자" }))}
      </div>
      <Panel title="최근 기록" aside={list.length > 50 ? "최근 50건" : undefined}>
        {list.length === 0 ? (
          <Empty title={loadError ? "AI 호출 기록을 읽지 못했습니다." : `${periodLabel(period)} AI 호출이 없습니다.`} />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${T.table} min-w-[1210px]`}>
              <colgroup>
                <col className="w-[104px]" />
                <col className="w-[140px]" />
                <col />
                <col className="w-[120px]" />
                <col className="w-[190px]" />
                <col className="w-[150px]" />
                <col className="w-[80px]" />
                <col className="w-[90px]" />
              </colgroup>
              <thead>
                <tr className={T.headRow}>
                  {["시각", "사용자", "과제", "기능", "모델", "토큰(입력/출력/캐시쓰기)", "걸린 시간", "금액"].map((h) => (
                    <th key={h} scope="col" className={T.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 50).map((r) => {
                  const c = r.card_id ? card.get(r.card_id) : undefined;
                  const usd = usdOf(r);
                  return (
                    <tr key={r.id} className={T.row}>
                      <td className={`${T.td} font-mono text-xs text-muted`}>{fmtDateTime(r.created_at)}</td>
                      <td className={`${T.td} truncate`}>{who.get(r.user_id) ?? "—"}</td>
                      <td className={`${T.td} truncate`}>
                        {c ? (
                          <Link href={withReturn(`/cards/${c.uid}`, `/admin/usage?period=${period}`)} className="text-navy no-underline hover:underline" title={c.title}>
                            {c.task_no} {c.title}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${T.td} truncate`}>{modeText(r)}</td>
                      <td className={`${T.td} truncate font-mono text-xs text-muted-2`} title={r.model ?? ""}>
                        {r.model ?? "—"}
                        <span className="ml-1 font-sans" title={`등급 ${tierOf(r.feature)} — lib/ai/models.ts의 기능 → 등급 표`}>
                          <Tag tone="muted">{tierOf(r.feature)}</Tag>
                        </span>
                        {isCliModel(r.model) && (
                          <span className="ml-1">
                            <Tag tone="muted">API 환산</Tag>
                          </span>
                        )}
                      </td>
                      <td className={T.td}>
                        {requestState(r, now) === "running" ? (
                          <Tag tone="link">진행 중</Tag>
                        ) : requestState(r, now) === "stalled" ? (
                          <span title="20분 넘게 끝맺지 못한 호출(시간 제한에서 끊김 추정) — 이 사용자의 다음 호출 때 오류로 닫힘">
                            <Tag tone="warn">끊김</Tag>
                          </span>
                        ) : r.status === "error" ? (
                          <span title={r.error ?? ""}>
                            <Tag tone="warn">오류</Tag>
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-muted-2">
                            {fmtInt(r.input_tokens)} / {fmtInt(r.output_tokens)} / {fmtInt(r.cache_write_tokens)}
                          </span>
                        )}
                      </td>
                      <td className={`${T.td} font-mono text-xs text-muted-2`}>{fmtDur(r.duration_ms)}</td>
                      <td className={`${T.td} font-mono text-xs text-muted-2`}>{r.status !== "ok" ? "—" : usd == null ? "모름" : fmtUsd(usd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Screen>
  );
}
