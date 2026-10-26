import type { Metadata } from "next";
import Link from "next/link";
import { KpiInputs, MaterialUploader, ReportStatusButtons } from "../../../../components/reports/report-controls";
import { MaterialRequestsPanel } from "../../../../components/reports/material-requests";
import { ClickableRow } from "../../../../components/reports/row-link";
import { FIT_TAG, REPORT_STATUS_TONE } from "../../../../components/ui/status-tone.ts";
import { TodoBoardPanel } from "../../../../components/reports/todo-board";
import { Empty, PageHeader, Panel, PreviewBanner, Screen, T, Tag, type Tone } from "../../../../components/ui/kit";
import { NextSteps, StatusMark } from "../../../../components/ui/next-steps";
import { TeamPicker } from "../../../../components/ui/team-picker";
import { requireUser } from "../../../../lib/auth/dal.ts";
import { deptScope } from "../../../../lib/auth/scope.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { fmtDateTime } from "../../../../lib/format.ts";
import { withReturn } from "../../../../lib/nav/return-to.ts";
import { FIT_RANGE_TEXT, fitVerdict } from "../../../../lib/reports/fit.ts";
import { buildMaterialRequests } from "../../../../lib/reports/material-requests.ts";
import { type HubSteps, hubSteps } from "../../../../lib/reports/hub-steps.ts";
import { REPORT_STATUS_LABEL, kpiKey, kpiRowsOf } from "../../../../lib/reports/model.ts";
import { listMaterials, listReports, loadSubmitCards, openCommentCounts, submitKey } from "../../../../lib/reports/queries.ts";
import { DRAFT_STATE_LABEL, SUBMIT_OVER, type CardSubmitRow, type DraftState, type SubmitCard, submitBlockedReason, submitReadiness } from "../../../../lib/reports/submission.ts";
import { buildTodoBoard } from "../../../../lib/reports/todo-board.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { getTrack } from "../../../../lib/tracks/current.ts";

export const metadata: Metadata = { title: "경평 초안 · 경영평가 Sherpa" };

const DRAFT_TONE: Record<DraftState, Tone> = { none: "muted", outline: "warn", draft: "navy", stale: "warnSolid" };
/** 판면 칸(판정은 lib/reports/fit.ts fitVerdict 하나 — 뜻을 먼저, %는 뒤에) */
const fitTag = (pct: number) => {
  const v = fitVerdict(pct);
  return (
    <Tag tone={FIT_TAG[v.tone]} title={`${v.hint} · ${FIT_RANGE_TEXT}`}>
      {v.label} · {pct}%
    </Tag>
  );
};

/** 단계 번호(단계 띠 NextSteps inset의 번호와 같은 모양) */
function StepNo({ n }: { n: number }) {
  return <span className="shrink-0 font-mono text-ui font-semibold text-muted">{n}</span>;
}

/** 번호 붙은 단계 절(10-13 시안 section.step — 과제별 초안·제출): 머리(번호 + 제목 + 상태) + 본문 */
function Step({ n, title, id, aside, children }: { n: number; title: string; id?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="flex min-w-0 flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="flex shrink-0 items-center gap-2 text-sm font-bold text-navy">
          <StepNo n={n} />
          {title}
        </h3>
        {aside && <div className="flex min-w-0 items-center gap-2 text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** 과제별 초안 주소(부서 화면 보기면 그 부서로 읽기 전용 — team 쿼리) */
const draftHref = (uid: string, teamQs: string, from: string) => withReturn(`/reports/cards/${uid}${teamQs ? `?${teamQs.slice(0, -1)}` : ""}`, from);

/** 사업마다 단계 띠(패널 머리 아래 인셋) — 셈은 lib/reports/hub-steps.ts, 주 행동은 그 패널의 근거·제출 절 앵커 또는 첫 초안 없는 과제 */
function HubBand({ label, hub, anchor, teamQs, from }: { label: string; hub: HubSteps; anchor: string; teamQs: string; from: string }) {
  const a = hub.action;
  const action = !a ? null : { label: a.label, href: a.step === "draft" ? draftHref(a.uid, teamQs, from) : `#${anchor}-${a.step}` };
  return <NextSteps id={`${anchor}-steps`} inset title={`${label} 경평 초안 단계`} steps={hub.steps} action={action} />;
}

/** 표 머리 풀이(머리 title과 표 아래 한 줄) — 열 이름은 「입력할 것」 모음·성과관리팀 화면과 같은 말 그대로 */
const HEAD_TITLE: Record<string, string> = {
  쪽: "목차·쪽 배정에서 이 과제가 받은 쪽",
  판면: `배정 쪽에 들어가는지(초안 어림 ÷ 배정 쪽) — ${Math.round(SUBMIT_OVER * 100)}%를 넘으면 넘침`,
  "채울 자료": "올해 값을 확인해 채울 【확인】 자리 + 사진·삽화를 넣을 그림 자리",
  "없는 숫자": "근거 자료(카드·첨부·전년 보고서·실사 답변 등)에 없는 숫자 — 초안에서 붉은 점선으로 보임",
  "고친 블록": "초안에서 사람이 직접 고친 블록 수",
};

/** 「과제별 초안」 표(제출 준비된 보고서·보고서 준비 전 사업 공용): 과제번호·과제명·배정 쪽·초안 상태·판면·채울 자료·없는 숫자·고친 블록·초안 열기(쓰기)·카드 */
function DraftTable({ rows, teamQs, from, preview }: { rows: CardSubmitRow[]; teamQs: string; from: string; preview: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="overflow-x-auto rounded-md border border-line">
        <table className={`${T.table} min-w-[900px]`}>
          <colgroup>
            <col className="w-[64px]" />
            <col />
            <col className="w-[64px]" />
            <col className="w-[92px]" />
            {/* 판면: 뜻 + %(「분량 맞음 · 101%」) 한 칩 */}
            <col className="w-[128px]" />
            <col className="w-[80px]" />
            <col className="w-[80px]" />
            <col className="w-[80px]" />
            <col className="w-[136px]" />
          </colgroup>
          <thead>
            <tr className={T.headRow}>
              {["과제", "과제명", "쪽", "초안 상태", "판면", "채울 자료", "없는 숫자", "고친 블록"].map((h) => (
                <th key={h} scope="col" className={T.th} title={HEAD_TITLE[h]}>
                  {h}
                </th>
              ))}
              {/* relative: sr-only(absolute)가 스크롤 상자 안에 머물게 */}
              <th scope="col" className={`${T.th} relative`}>
                <span className="sr-only">행동</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = draftHref(r.uid, teamQs, from);
              // 초안(spec)이 있는 과제만 수치를 적음(0은 0) — 초안 없음·구성안만은 시작 전이라 빈칸
              const has = r.state === "draft" || r.state === "stale";
              return (
                <ClickableRow key={r.id} href={href} className={T.row}>
                  <td className={`${T.td} font-mono text-ui text-navy`}>{r.taskNo}</td>
                  <td className={`${T.td} truncate`} title={r.title}>
                    {r.title}
                  </td>
                  <td className={`${T.td} font-mono text-xs text-muted-2`}>{r.included ? (r.pages !== null ? `${r.pages}쪽` : "—") : "제외"}</td>
                  <td className={T.td}>
                    <Tag tone={DRAFT_TONE[r.state]}>{DRAFT_STATE_LABEL[r.state]}</Tag>
                  </td>
                  <td className={T.td}>{!has ? null : r.fitPct === null ? <span className="text-xs text-muted-2">—</span> : fitTag(r.fitPct)}</td>
                  <td className={`${T.td} text-center font-mono text-xs`}>{has ? r.needs + r.figures : null}</td>
                  <td className={`${T.td} text-center font-mono text-xs ${r.unknown ? "text-warn" : ""}`}>{has ? r.unknown : null}</td>
                  <td className={`${T.td} text-center font-mono text-xs`}>{has ? r.humanEdits : null}</td>
                  <td className={T.td}>
                    <div className="flex items-center gap-1.5">
                      <Link href={href} className={T.btnSm} title={has ? "과제별 초안 열기" : "카드와 첨부 자료로 초안 쓰기"}>
                        {has ? "초안 열기" : preview ? "초안 보기" : "초안 쓰기"}
                      </Link>
                      <Link href={withReturn(`/my?${teamQs}peek=${r.uid}`, from)} className={T.btnQuiet} title={`${r.taskNo} 과제관리카드 보기`}>
                        카드
                      </Link>
                    </div>
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-4 text-muted-2">
        <b className="font-semibold text-ink">판면</b> 배정 쪽에 들어가는지({Math.round(SUBMIT_OVER * 100)}% 넘으면 넘침) · <b className="font-semibold text-ink">채울 자료</b> 올해 값 【확인】 자리 + 그림 자리 · <b className="font-semibold text-ink">없는 숫자</b> 근거 자료에 없는 숫자 · <b className="font-semibold text-ink">고친 블록</b> 사람이 직접 고친 블록 · 빈칸은 아직 초안 없음
      </p>
    </div>
  );
}

/** rpc report_outline_context 한 줄 — 같은 평가단위 목차 줄(다른 부서 과제는 과제번호·과제명·부서·쪽만) */
interface OutlineCtxRow {
  task_no: string;
  title: string;
  team_name: string | null;
  section: string;
  subsection: string | null;
  sort: number;
  pages: number | string;
  included: boolean;
  mine: boolean;
}

/** 이 화면이 읽는 활성 카드(select 열 그대로 — kpi는 data->kpi->rows 원자료) */
interface HubCardRow {
  id: string;
  eval_unit_id: string;
  task_no: string;
  title: string;
  kpi: unknown;
}

/** 사업(경영관리는 지표) 목차에서 내 자리(rpc report_outline_context — 같은 평가단위 목차 줄만, 다른 부서 과제는 과제번호·과제명·부서·쪽만) */
function OutlineContext({ rows, lead, unitWord }: { rows: OutlineCtxRow[]; lead: boolean; unitWord: "사업" | "지표" }) {
  if (!rows.length && !lead) return null;
  const sections = [...new Set(rows.map((x) => x.section))];
  return (
    <details className="border-t border-line">
      <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-navy">{unitWord} 목차에서 내 자리</summary>
      <div className="flex min-w-0 flex-col gap-3 px-5 pb-4">
        {rows.length === 0 ? (
          <p className="text-ui text-muted">아직 이 {unitWord}의 목차가 없습니다.</p>
        ) : (
          sections.map((sec) => {
            const inSec = rows.filter((x) => x.section === sec);
            const subs = [...new Set(inSec.map((x) => x.subsection ?? ""))];
            return (
              <div key={sec} className="flex min-w-0 flex-col rounded-md border border-line">
                <div className="border-b border-line bg-desk/60 px-3 py-1.5 text-xs font-bold text-navy">{sec}</div>
                {subs.map((sub) => (
                  <div key={sub || "-"} className="flex flex-col">
                    {sub && (
                      <div className="min-w-0 truncate border-b border-row-line px-3 py-1 pl-6 text-xs font-semibold text-muted-2" title={sub}>
                        {sub}
                      </div>
                    )}
                    {inSec
                      .filter((x) => (x.subsection ?? "") === sub)
                      .map((x) => (
                        <div key={`${x.task_no}-${x.sort}`} className={`flex min-w-0 items-center gap-2 border-b border-row-line px-3 py-1.5 pl-6 last:border-b-0 ${x.mine ? "bg-row-hover" : ""}`}>
                          <span className={`w-10 shrink-0 font-mono text-ui ${x.mine ? "font-bold text-navy" : "text-muted-2"}`}>{x.task_no}</span>
                          <span className={`min-w-0 flex-1 truncate text-ui ${x.mine ? "font-semibold text-ink" : "text-muted-2"}`} title={x.title}>
                            {x.title}
                          </span>
                          {!x.mine && (
                            <span className="shrink-0 truncate text-xs text-muted-2" title={x.team_name ?? undefined}>
                              {x.team_name ?? "—"}
                            </span>
                          )}
                          <span className="shrink-0 font-mono text-xs text-muted-2">{x.included ? `${Number(x.pages)}쪽` : "제외"}</span>
                          {x.mine && <Tag tone="link">내 과제</Tag>}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}

/** 부서 담당자 · 경평 초안 허브: 사업마다 근거 넣기 → 과제별 초안 → 제출, 성과관리팀 검토 메모·미해결 코멘트·사업 목차에서 내 자리 */
export default async function MyReportPage({ searchParams }: PageProps<"/my/report">) {
  const user = await requireUser("/my/report");
  // 트랙(2026-10-09 R3): 머리띠에서 고른 트랙의 보고서·과제만(주요사업 사업 · 경영관리 지표)
  const track = await getTrack();
  const sp = await searchParams;
  const scope = await deptScope(user, sp);
  const period = currentPeriod();
  const year = Number(period.slice(0, 4));
  const supabase = await createClient();
  const { data: units } = await supabase.from("eval_units").select("id, name, card_group").eq("track", track).order("sort").order("id");
  const unitIds = new Set((units ?? []).map((u) => u.id as string));
  const reports = scope.team ? (await listReports(supabase, year, scope.team.id)).filter((r) => unitIds.has(r.evalUnitId)) : [];
  const [materials, cardMap, openComments, { data: cards }] = await Promise.all([
    listMaterials(
      supabase,
      reports.map((r) => r.id),
    ),
    scope.team ? loadSubmitCards(supabase, year, { teamId: scope.team.id, track }) : Promise.resolve(new Map<string, SubmitCard[]>()),
    openCommentCounts(
      supabase,
      reports.map((r) => r.id),
    ),
    scope.team ? supabase.from("cards").select("id, eval_unit_id, task_no, title, kpi:data->kpi->rows").eq("team_id", scope.team.id).eq("status", "active").order("task_no") : Promise.resolve({ data: [] as HubCardRow[] }),
  ]);
  const teamQs = scope.preview && scope.team ? `team=${scope.team.id}&` : "";
  // 이 화면 주소(부서 화면 보기면 team 쿼리 포함) — 과제별 초안·카드로 가는 링크가 돌아올 곳
  const selfHref = scope.preview && scope.team ? `/my/report?team=${scope.team.id}` : "/my/report";
  // 사업 목차에서 내 자리(rpc) — 준비된 보고서마다 그 사업의 목차 줄(같은 사업에 카드가 있으면 받음, RLS)
  const outlineCtx = new Map<number, OutlineCtxRow[]>(
    await Promise.all(
      reports.map(async (r): Promise<readonly [number, OutlineCtxRow[]]> => {
        const { data } = await supabase.rpc("report_outline_context", { p_eval_unit: r.evalUnitId, p_year: year });
        // rpc의 mine은 로그인한 사람의 부서로 셈 — 성과관리팀·관리자가 부서 화면 보기(?team=)로 볼 때는 부서가 없어 늘 거짓이므로 보는 부서 이름으로도 맞춤
        return [r.id, ((data ?? []) as OutlineCtxRow[]).map((x) => ({ ...x, mine: x.mine || (scope.preview && x.team_name === scope.team?.name) }))] as const;
      }),
    ),
  );
  // 보고서가 아직 준비되지 않은 사업(과제는 있지만 reports 행이 없음) — 과제별 초안 표만
  const waiting = (units ?? [])
    .map((u) => ({ unit: u, cs: cardMap.get(submitKey(u.id, scope.team?.id ?? -1)) ?? [] }))
    .filter((g) => g.cs.length && !reports.some((r) => r.evalUnitId === g.unit.id));

  // 입력할 것 모음 — 이 부서 것만(계량 실적 미입력·【확인】·초안 없음·근거에 없는 숫자). 부서 화면 보기에서도 같은 내용 읽기 전용
  const submitById = new Map([...cardMap.values()].flat().map((c) => [c.id, c]));
  const todo = buildTodoBoard({
    units: (units ?? []).map((u) => ({ id: u.id as string, name: u.name as string, cardGroup: (u.card_group as string | null) ?? null })),
    teams: scope.team ? [{ id: scope.team.id, name: scope.team.name }] : [],
    cards: scope.team
      ? ((cards ?? []) as HubCardRow[]).flatMap((c) => {
          const submit = submitById.get(c.id);
          return submit ? [{ unitId: c.eval_unit_id, teamId: scope.team!.id, kpi: c.kpi, submit }] : [];
        })
      : [],
    reports: reports.map((r) => ({ id: r.id, unitId: r.evalUnitId, teamId: r.teamId, inputs: r.inputs })),
  });

  // 자료 요청 — 구성안 재료표의 「자료 필요」(이 부서 과제만, 목차에서 뺀 과제 제외)
  const requests = scope.team
    ? buildMaterialRequests(
        [...cardMap].flatMap(([k, cs]) => cs.map((c) => ({ unitId: k.split("|")[0], teamId: scope.team!.id, uid: c.uid, taskNo: c.taskNo, title: c.title, included: c.included, outline: c.draft?.outline }))),
        [{ id: scope.team.id, name: scope.team.name }],
      )[0] ?? null
    : null;

  return (
    <Screen header={<PageHeader title="경평 초안" />}>
      {scope.preview && (
        <PreviewBanner teamName={scope.team?.name ?? null}>
          <span className="ml-auto">
            <TeamPicker teams={scope.teams} value={scope.team?.id ?? null} />
          </span>
        </PreviewBanner>
      )}
      {/* 팀 없음: 부서 담당자는 부서 미지정, 부서 화면 보기(성과관리팀·관리자)는 아직 부서를 안 고름 */}
      {!scope.team && <p className="text-ui text-muted-2">{scope.preview ? "부서를 고르세요 — 고른 부서 담당자에게 보이는 보고서가 보입니다" : "부서가 지정되지 않았습니다 — 관리자가 지정하면 보고서가 보입니다"}</p>}

      {scope.team && reports.length === 0 && !waiting.length && (
        <Panel>
          <Empty title="아직 준비된 보고서가 없습니다." />
        </Panel>
      )}

      {todo.rows.length > 0 && <TodoBoardPanel board={todo} title="입력할 것" mg={track === "경영관리"} staff={false} from={selfHref} />}
      {requests && <MaterialRequestsPanel dept={requests} from={selfHref} teamQs={teamQs} year={year} />}

      {waiting.map(({ unit, cs }) => {
        const readiness = submitReadiness(cs);
        const rows = readiness.rows;
        const label = track === "경영관리" ? unit.name : `${unit.card_group ?? unit.id} · ${unit.name}`;
        // 보고서 준비 전: 근거(계량 실적·추가자료)·제출은 보고서에 붙어 준비 뒤 — 띠는 과제별 초안만 지금 단계가 될 수 있음
        const hub = hubSteps({ status: null, returned: false, readiness, kpiTotal: 0, kpiMissing: 0, materials: 0, preview: scope.preview });
        return (
          <Panel key={unit.id} title={label} aside={<Tag>보고서 준비 전</Tag>}>
            <p className="border-b border-line px-5 py-2.5 text-ui text-muted-2">성과관리팀이 보고서를 준비하고 있습니다 — 과제별 초안은 먼저 쓸 수 있습니다</p>
            <HubBand label={label} hub={hub} anchor={`unit-${unit.id}`} teamQs={teamQs} from={selfHref} />
            <Step n={2} title="과제별 초안" aside={`${rows.length}개 · 초안 있음 ${rows.filter((r) => r.state === "draft" || r.state === "stale").length}/${rows.length}`}>
              <DraftTable rows={rows} teamQs={teamQs} from={selfHref} preview={scope.preview} />
            </Step>
          </Panel>
        );
      })}

      {reports.map((r) => {
        const cs = (cardMap.get(submitKey(r.evalUnitId, r.teamId)) ?? []);
        const readiness = submitReadiness(cs);
        const kpiRows = ((cards ?? []) as HubCardRow[])
          .filter((c) => c.eval_unit_id === r.evalUnitId)
          .flatMap((c) => kpiRowsOf(c.kpi).map((k) => ({ key: kpiKey(c.id, k.i), card: c.task_no, name: k.name, unit: k.unit, target: k.target, prev: k.prev })));
        const lead = r.leadTeamId === r.teamId;
        const canEdit = !scope.preview && r.status !== "approved" && r.status !== "submitted";
        const openN = openComments.get(r.id) ?? 0;
        const ctxRows = outlineCtx.get(r.id) ?? [];
        const matCount = materials.filter((m) => m.reportId === r.id).length;
        const kpiMissing = kpiRows.filter((k) => !((r.inputs?.kpi as Record<string, string> | undefined)?.[k.key] ?? "").trim()).length;
        // 경영관리는 지표명만(묶음 id 경영관리N은 식별자라 화면 글자로 쓰지 않음)
        const label = track === "경영관리" ? r.unitName : `${r.cardGroup ?? r.evalUnitId} · ${r.unitName}`;
        const returned = r.status !== "approved" && !!r.reviewNote;
        const hub = hubSteps({ status: r.status, returned, readiness, kpiTotal: kpiRows.length, kpiMissing, materials: matCount, preview: scope.preview });
        const anchor = `report-${r.id}`;
        const closed = r.status === "submitted" || r.status === "approved";
        // 제출할 수 없는 까닭(제출 단추 옆 글) — 서버 제출 검사와 같은 문구(submitBlockedReason). 「자료 준비」는 제출 전이가 없음(canMove)
        const why = submitBlockedReason(readiness) ?? (r.status === "preparing" ? "보고서가 「자료 준비」 상태라 아직 제출할 수 없습니다 — 과제별 초안이 저장되면 「초안 작성」으로 바뀝니다" : !scope.preview && readiness.checks.length ? "확인할 것은 제출을 막지 않습니다 — 제출하면 확인 창에 한 번 더 보입니다" : null);
        const previewLink = (
          <Link href={withReturn(`/reports/${r.id}${teamQs ? `?${teamQs.slice(0, -1)}` : ""}`, selfHref)} className={`${T.btnQuiet} ml-auto`} title="제출물 미리보기·성과관리팀 코멘트 보기">
            제출물 미리보기
          </Link>
        );
        const statusButtons = !scope.preview && (
          <ReportStatusButtons
            id={r.id}
            status={r.status}
            staff={false}
            readiness={{
              ready: readiness.ready,
              total: readiness.total,
              drafted: readiness.drafted,
              missing: readiness.missing.map((m) => `${m.taskNo}${m.state === "outline" ? "(구성안만)" : ""}`),
              checks: readiness.checks,
            }}
          />
        );
        return (
          <Panel
            key={r.id}
            title={`${label}${lead ? " · 주관 부서" : ""}`}
            aside={
              <>
                <Tag tone={REPORT_STATUS_TONE[r.status].tag}>{REPORT_STATUS_LABEL[r.status]}</Tag>
                {openN > 0 && (
                  <Tag tone="warnSolid" title="성과관리팀이 남긴 코멘트 중 아직 해결되지 않은 것">
                    미해결 코멘트 {openN}
                  </Tag>
                )}
              </>
            }
          >
            <HubBand label={label} hub={hub} anchor={anchor} teamQs={teamQs} from={selfHref} />
            {r.reviewNote && (
              <div className={`m-5 mb-0 flex min-w-0 flex-col gap-1 rounded-md border px-3 py-2 text-ui leading-6 ${r.status === "approved" ? "border-link/40 bg-info-bg text-ink" : "border-warn bg-warn-bg text-warn"}`}>
                <span>
                  <b>{r.status === "approved" ? "성과관리팀 검토 메모" : "돌려보냄"}</b>: {r.reviewNote}
                </span>
                {r.reviewedAt && <span className="text-xs text-muted-2">{fmtDateTime(r.reviewedAt)}</span>}
              </div>
            )}
            <details id={`${anchor}-evidence`} open={hub.steps[0].now} className="border-b border-line px-5 last:border-b-0">
              <summary className="flex min-w-0 cursor-pointer flex-wrap items-center gap-2 py-3 text-sm font-bold text-navy">
                <StepNo n={1} />
                근거 넣기 <span className="text-xs font-normal text-muted-2">· 추가자료 {matCount}건</span>
                {/* 계량 실적 미입력은 제출을 막지 않음 — 경고색 대신 우리 차례 톤(10-18 「경고색은 막힘에만」) */}
                {kpiMissing > 0 && <Tag tone="link">계량 실적 입력 필요 {kpiMissing}건</Tag>}
              </summary>
              <div className="flex min-w-0 flex-col gap-5 pb-5">
                <div className="flex min-w-0 flex-col gap-2">
                  <h4 className="text-xs font-semibold text-muted">보고서 추가자료</h4>
                  <MaterialUploader reportId={r.id} items={materials.filter((m) => m.reportId === r.id)} cards={(cardMap.get(submitKey(r.evalUnitId, r.teamId)) ?? []).map((c) => ({ id: c.id, taskNo: c.taskNo, title: c.title }))} canEdit={canEdit} />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-muted">계량 실적 입력</h4>
                    <span className="text-xs text-muted-2">AI는 수치를 만들지 않음 — 입력값 그대로</span>
                  </div>
                  {kpiRows.length ? <KpiInputs reportId={r.id} rows={kpiRows} initial={(r.inputs?.kpi ?? {}) as Record<string, string>} canEdit={canEdit} /> : <p className="text-ui text-muted">연결된 카드에 계량 성과지표가 없습니다.</p>}
                </div>
              </div>
            </details>
            <Step n={2} title="과제별 초안" aside={`${cs.length}개 · 초안 있음 ${readiness.drafted}/${readiness.total}`}>
              {readiness.rows.length ? <DraftTable rows={readiness.rows} teamQs={teamQs} from={selfHref} preview={scope.preview} /> : <p className="text-ui text-muted">연결된 과제가 없습니다.</p>}
            </Step>
            <Step n={3} title="제출" id={`${anchor}-submit`}>
              <p className="text-ui text-muted-2">
                {scope.team?.name} · {r.unitName} 보고서 전체를 제출합니다 · 성과관리팀이 검토하고 승인합니다
              </p>
              {closed ? (
                // 제출함·승인: 조건 목록 대신 상태 한 줄(+ 제출 취소는 기존 상태 단추)
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex items-center gap-2 text-ui font-semibold text-ink">
                    <StatusMark tone={hub.steps[2].tone} />
                    {hub.steps[2].state}
                  </span>
                  {r.status === "submitted" && statusButtons}
                  {previewLink}
                </div>
              ) : (
                <>
                  <ul aria-label={`${label} 제출 조건`} className="m-0 flex list-none flex-col gap-1.5 p-0">
                    <li className="flex min-w-0 items-center gap-2.5 text-ui leading-5 text-ink">
                      <span className="w-[92px] shrink-0 text-xs font-semibold text-muted">필수</span>
                      <StatusMark tone={readiness.ready ? "done" : "alert"} />
                      <span className="min-w-0 truncate">
                        과제별 초안 — 목차에 든 과제 모두 초안{readiness.ready ? " 있음" : "이 있어야 함"}{" "}
                        <span className="font-mono text-muted-2">
                          {readiness.drafted}/{readiness.total}
                        </span>
                      </span>
                    </li>
                    {readiness.checks.map((c) => (
                      <li key={c} className="flex min-w-0 items-center gap-2.5 text-ui leading-5 text-ink">
                        <span className="w-[92px] shrink-0 text-xs font-semibold text-muted" title="제출을 막지 않음">
                          확인할 것
                        </span>
                        <StatusMark tone="idle" />
                        <span className="min-w-0 truncate" title={c}>
                          {c}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                    {/* 「자료 준비」는 상태 단추가 제출 단추를 그리지 않음(canMove) — 같은 자리에 끈 단추(T.off 모양)만 */}
                    {!scope.preview &&
                      (r.status === "preparing" ? (
                        <button type="button" disabled className={T.btnPrimary} aria-describedby={`${anchor}-why`}>
                          성과관리팀에 제출
                        </button>
                      ) : (
                        statusButtons
                      ))}
                    {why && (
                      <p id={`${anchor}-why`} className="min-w-0 text-ui text-muted-2">
                        {why}
                      </p>
                    )}
                    {previewLink}
                  </div>
                </>
              )}
            </Step>
            <OutlineContext rows={ctxRows} lead={lead} unitWord={track === "경영관리" ? "지표" : "사업"} />
          </Panel>
        );
      })}
    </Screen>
  );
}
