import type { Metadata } from "next";
import Link from "next/link";
import { AiBatchButton } from "../../../components/inspections/ai-batch-button";
import { InspectionEditor } from "../../../components/inspections/inspection-editor";
import { InspectionSplit } from "../../../components/inspections/inspection-split";
import { SendAllButton } from "../../../components/inspections/send-all-button";
import { NoAccess, PageHeader, Peek, Screen, StatPanel, T, Tag, Toolbar, type Tone } from "../../../components/ui/kit";
import { INSPECTION_STATUS_TONE } from "../../../components/ui/status-tone.ts";
import { requireAtLeast } from "../../../lib/auth/dal.ts";
import { matchesQuery } from "../../../lib/cards/board-view.ts";
import { getCardForEdit, listCards } from "../../../lib/cards/queries.ts";
import { versionLabel, versionStates } from "../../../lib/cards/versions.ts";
import { currentPeriod } from "../../../lib/cards/view.ts";
import { fmtDate, isPeriod, monthLabel, periodLabel, shiftPeriod } from "../../../lib/format.ts";
import { type InspectionStatus, STATUS_LABEL, isPreMonth, newResult, readResult, tally } from "../../../lib/inspections/model.ts";
import { inspectionsForPeriod, peerCasesReady } from "../../../lib/inspections/queries.ts";
import { withReturn } from "../../../lib/nav/return-to.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { TRACK_SPECS } from "../../../lib/tracks/index.ts";
import { getTrack } from "../../../lib/tracks/current.ts";

export const metadata: Metadata = { title: "월간 점검 · 경영평가 Sherpa" };
// Vercel Pro 최대 800초 — 과제별 초안은 판면 맞추기 두 번까지 돌면 300초에 가까움, Hobby 플랜(최대 300초)에서는 배포가 거절되므로 운영은 Pro
export const maxDuration = 800;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const DRAFT_TONE: Record<string, Tone> = { "작성 중": "warn", 돌려받음: "warnSolid", 제출: "link", 확정: "navy" };

/** 성과관리팀 · 월간 점검(종합점검 지침 14 주요사업·13 경영관리 — 머리띠에서 고른 트랙의 과제): 과제별 점검표를 AI 초안·직접 작성으로 쓰고 부서에 보내면, 부서가 확인합니다 */
export default async function InspectionsPage({ searchParams }: PageProps<"/inspections">) {
  const me = await requireAtLeast("pmo", "/inspections");
  if (!me) return <NoAccess title="월간 점검" need="성과관리팀" />;
  const track = await getTrack();
  const form = TRACK_SPECS[track].inspectionForm;
  const sp = await searchParams;
  const period = isPeriod(one(sp.period)) ? one(sp.period) : currentPeriod();
  const tab = one(sp.status);
  const q = one(sp.q).trim().slice(0, 60);
  const peekUid = one(sp.peek);
  const supabase = await createClient();
  // 붙임2(사례제안 원천)는 주요사업판만 있음 — 경영관리판은 아직 없어 늘 미확보
  const [rows, versions, inspections, peerReady] = await Promise.all([listCards({ track }), versionStates(supabase, period), inspectionsForPeriod(supabase, period), track === "경영관리" ? Promise.resolve(false) : peerCasesReady(supabase)]);
  const ids = new Set(rows.map((r) => r.id));
  // 고른 트랙의 과제 점검만 셈(달마다 두 트랙의 점검표가 한 표에 같이 있음)
  const tallies = new Map([...inspections.entries()].filter(([id]) => ids.has(id)).map(([id, ins]) => [id, tally(readResult(ins.result))]));
  const focusCount = [...tallies.values()].filter((t) => t.focus).length;

  const statusOf = (cardId: string): InspectionStatus | "none" => inspections.get(cardId)?.status ?? "none";
  const counts = { none: 0, draft: 0, sent: 0, acknowledged: 0 } as Record<InspectionStatus | "none", number>;
  for (const r of rows) counts[statusOf(r.id)] += 1;
  const submitted = rows.filter((r) => ["submitted", "confirmed"].includes(versions.get(r.id)?.status ?? "")).length;
  const shown = rows.filter((r) => (!tab || statusOf(r.id) === tab) && matchesQuery(r, q));
  const units = [...new Set(shown.map((r) => r.evalUnitId))];
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ period });
    if (tab) p.set("status", tab);
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return `/inspections?${p}`;
  };
  const closeHref = href({});
  const peek = peekUid ? rows.find((r) => r.uid === peekUid) : undefined;
  const peekInspection = peek ? inspections.get(peek.id) : undefined;
  // 옆 창 왼쪽의 과제 원문 = 확정 카드(원장 — 월간 점검의 근거), 원본 배치·그림 서명 주소까지
  const peekCard = peek ? await getCardForEdit(peek.uid) : null;

  return (
    <Screen
      header={
        <PageHeader title="월간 점검">
          <nav aria-label="점검 기간" className="flex items-center gap-1">
            <Link href={`/inspections?period=${shiftPeriod(period, -1)}`} className={T.btn} aria-label="이전 달">
              ‹
            </Link>
            <span className="px-2 font-serif text-base font-bold whitespace-nowrap text-navy">{periodLabel(period)}</span>
            <Link href={`/inspections?period=${shiftPeriod(period, 1)}`} className={T.btn} aria-label="다음 달">
              ›
            </Link>
          </nav>
          <a href={`/inspections/export?period=${period}`} className={T.btn} download>
            결과 내려받기(CSV)
          </a>
          <AiBatchButton period={period} targets={shown.filter((r) => statusOf(r.id) === "none").map((r) => ({ uid: r.uid, taskNo: r.taskNo, title: r.title }))} />
          <SendAllButton period={period} drafts={counts.draft} />
        </PageHeader>
      }
      peek={
        peek && (
          <Peek
            label="점검표"
            eyebrow={`${peek.business} · ${peek.taskNo} · ${peek.team ?? peek.department} · ${periodLabel(period)}`}
            title={peek.title}
            closeHref={closeHref}
            width={peekCard ? 1720 : 820}
            fill={Boolean(peekCard)}
            actions={
              <Link href={withReturn(`/cards/${peek.uid}?panes=inspection`, href({ peek: peek.uid }))} className={T.btn} title="카드 전체 페이지에서 원장을 고침(오른쪽 점검 결과 탭)">
                원장에서 고치기
              </Link>
            }
          >
            {(() => {
              const strip = (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-6 py-2.5 text-xs text-muted-2">
                  <span>점검 상태</span>
                  <Tag tone={INSPECTION_STATUS_TONE[statusOf(peek.id)].tag}>{STATUS_LABEL[statusOf(peek.id)]}</Tag>
                  <span className="ml-2">이달 작성본</span>
                  {versionLabel(versions.get(peek.id)) ? <Tag tone={DRAFT_TONE[versionLabel(versions.get(peek.id))!]}>{versionLabel(versions.get(peek.id))}</Tag> : <Tag>없음</Tag>}
                  <span className="ml-auto truncate" title="월간 점검 근거: 확정 카드(원장) + 관리계획 발췌 — 카드 전용 자료는 쓰지 않음">
                    근거: 확정 카드 + 관리계획 발췌
                  </span>
                </div>
              );
              const editor = <InspectionEditor key={`${peek.uid}-${period}`} uid={peek.uid} period={period} initial={peekInspection ? readResult(peekInspection.result) : newResult(peerReady, form)} status={statusOf(peek.id)} preMonth={isPreMonth(period, currentPeriod())} peerReady={peerReady} updatedAt={peekInspection?.updatedAt ?? null} />;
              return peekCard ? (
                <InspectionSplit card={{ uid: peekCard.uid, data: peekCard.data, imageUrls: peekCard.imageUrls, layout: peekCard.layout }} defaultPeriod={monthLabel(currentPeriod())} strip={strip}>
                  {editor}
                </InspectionSplit>
              ) : (
                <>
                  {strip}
                  {editor}
                </>
              );
            })()}
          </Peek>
        )
      }
    >
      <StatPanel
        title="점검 대상"
        total={rows.length}
        allHref={`/inspections?period=${period}`}
        allOn={!tab}
        segments={(["acknowledged", "sent", "draft", "none"] as const).map((s) => ({
          label: STATUS_LABEL[s],
          n: counts[s],
          tone: INSPECTION_STATUS_TONE[s].seg,
          href: tab === s ? `/inspections?period=${period}` : `/inspections?period=${period}&status=${s}`,
          on: tab === s,
          title: ({ acknowledged: "부서가 확인", sent: "부서 확인 대기", draft: "보내기 전", none: "점검표 없음" } as const)[s],
        }))}
        metrics={[
          { label: "작성본 확정", value: submitted, sub: `/${rows.length}`, bar: { n: submitted, of: rows.length }, title: `${rows.length - submitted}개 아직` },
          { label: "집중보완", value: focusCount, tone: focusCount ? "warn" : undefined, sub: "과제", title: "★핵심 3항목 중 2개 이상 미흡" },
        ]}
      />

      <Toolbar>
        <form action="/inspections" className="flex min-w-0 items-center gap-2">
          <input type="hidden" name="period" value={period} />
          {tab && <input type="hidden" name="status" value={tab} />}
          <label className="flex h-9 min-w-0 grow items-center gap-2 rounded-md border border-line-strong bg-paper px-3 focus-within:border-navy sm:w-[320px]">
            <span className="sr-only">과제 찾기</span>
            <input name="q" defaultValue={q} placeholder="과제명·번호·부서로 찾기" className="min-w-0 grow border-0 bg-transparent text-sm outline-none" />
          </label>
          <button type="submit" className={T.btn}>
            찾기
          </button>
          {q && (
            <Link href={`/inspections?period=${period}${tab ? `&status=${tab}` : ""}`} className="text-xs text-link">
              지우기
            </Link>
          )}
        </form>
      </Toolbar>

      <section aria-label="점검 목록" className={T.wrap}>
        <div className="overflow-x-auto">
          <table className={`${T.table} min-w-[1000px]`}>
            <colgroup>
              <col className="w-[76px]" />
              <col />
              <col className="w-[150px]" />
              <col className="w-[96px]" />
              <col className="w-[84px]" />
              <col className="w-[128px]" />
              <col className="w-[60px]" />
              <col className="w-[80px]" />
              <col className="w-[84px]" />
            </colgroup>
            <thead>
              <tr className={T.headRow}>
                {["번호", "과제명", "부서", "이달 작성본", "점검", "충족 7·8·5", "보완", "집중보완", "수정일"].map((h) => (
                  <th key={h} scope="col" className={T.th} title={h === "충족 7·8·5" ? "7대축(7)·질의패턴(8)·정합성(5) 충족 행 수" : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {units.map((u) => {
              const list = shown.filter((r) => r.evalUnitId === u);
              return (
                <tbody key={u}>
                  <tr className="h-9 bg-desk/60">
                    <th colSpan={9} scope="rowgroup" className="border-b border-line px-3 text-left text-xs font-bold text-navy">
                      {list[0]?.business} · {list.length}
                    </th>
                  </tr>
                  {list.map((r) => {
                    const ins = inspections.get(r.id);
                    const tl = tallies.get(r.id);
                    const st = statusOf(r.id);
                    const vl = versionLabel(versions.get(r.id));
                    const on = r.uid === peekUid;
                    return (
                      <tr key={r.id} className={on ? T.rowOn : T.row}>
                        <td className={`${T.td} font-mono text-ui text-navy`}>{r.taskNo}</td>
                        <td className={`${T.td} truncate`}>
                          <Link href={href({ peek: r.uid })} scroll={false} title={r.title} className="block truncate font-semibold text-navy no-underline hover:underline">
                            {r.title}
                          </Link>
                        </td>
                        <td className={`${T.td} truncate text-muted-2`} title={r.team ?? ""}>
                          {r.team ?? r.department}
                        </td>
                        <td className={T.td}>{vl ? <Tag tone={DRAFT_TONE[vl]}>{vl}</Tag> : <span className="text-muted">—</span>}</td>
                        <td className={T.td}>
                          {/* 시작 전(미작성)은 빈칸 — 정제 언어 규칙 E */}
                          {st === "none" ? null : <Tag tone={INSPECTION_STATUS_TONE[st].tag}>{STATUS_LABEL[st]}</Tag>}
                        </td>
                        <td className={`${T.td} font-mono text-ui text-muted-2`}>{tl ? `${tl.tables.axes.met}·${tl.tables.patterns.met}·${tl.tables.coherence.met}` : "—"}</td>
                        <td className={`${T.td} font-mono text-ui ${tl?.needs ? "text-warn" : "text-muted"}`}>{tl ? tl.needs : "—"}</td>
                        <td className={T.td}>{tl?.focus ? <Tag tone="warnSolid">집중</Tag> : <span className="text-muted">—</span>}</td>
                        <td className={`${T.td} font-mono text-xs text-muted`}>{ins ? fmtDate(ins.updatedAt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
            {shown.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted">
                    이 상태의 과제가 없습니다.
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </section>
      {!peerReady && (
        <p className="text-ui text-warn">
          {track === "경영관리"
            ? "★사례제안: 붙임2(경영관리 유관기관 평가보고서)는 아직 이 앱에 없어 「기준 미확인 — 붙임2 미확보」로 둡니다. 붙임4(주요사업 과제관리카드)는 원장의 주요사업 카드로 대신합니다."
            : "★사례제안: 붙임2 미적재 — 「관리 › 공통 자료·틀」에서 올리기 전에는 「기준 미확인 — 붙임2 미확보」"}
        </p>
      )}
    </Screen>
  );
}
