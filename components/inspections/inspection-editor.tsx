"use client";

import { INSPECT_EXPECT, rangeText } from "../../lib/ai/progress.ts";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { runInspectionDraft, saveInspection } from "../../app/(app)/inspections/actions";
import { fmtDateTime } from "../../lib/format.ts";
import { T } from "../ui/kit";
import {
  CHECKLIST_RESULTS,
  CHECKLIST_TITLE,
  type ChecklistRow,
  type Evidence,
  type InspectionResult,
  type InspectionStatus,
  JUDGMENTS,
  type Judgment,
  MGMT_FORM_ID,
  PRE_MONTH_ITEMS,
  type RowResult,
  TABLE_KEYS,
  type TableKey,
  caseFootnote,
  checklistIntro,
  directionLines,
  formTablesOf,
  linkText,
  sendProblems,
  tally,
  unverifiedCount,
} from "../../lib/inspections/model.ts";
import { InspectionSheet, TallyLine, isStarRow } from "./inspection-sheet";

const JUDGE_ON: Record<Judgment, string> = {
  충족: "border-link bg-link text-white",
  미흡: "border-warn bg-warn text-white",
  "기준 미확인": "border-muted-2 bg-muted-2 text-white",
  "해당 없음": "border-muted-2 bg-muted-2 text-white",
};
const area = "w-full min-w-0 rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-ui leading-6 text-ink disabled:cursor-not-allowed disabled:bg-thead disabled:text-muted";
const input = "h-8 w-full min-w-0 rounded-md border border-field-line bg-paper px-2.5 text-ui text-ink disabled:cursor-not-allowed disabled:bg-thead disabled:text-muted";
const fieldLabel = "w-16 shrink-0 pt-1.5 text-xs font-semibold text-muted";

const hasContent = (r: InspectionResult) => Boolean(r.overview.status || r.overview.direction || TABLE_KEYS.some((k) => r[k].some((x) => x.judgment)));

function EvidenceBadge({ e }: { e: Evidence }) {
  if (e.verified === true) return <span className="shrink-0 rounded-chip border border-link px-1 text-xs leading-[18px] text-link">원문 확인</span>;
  if (e.verified === false)
    return (
      <span className="shrink-0 rounded-chip border border-warn bg-warn-bg px-1 text-xs leading-[18px] text-warn" title="지식 조각에서 이 글을 찾지 못했습니다. 원문대로 고치거나 판단을 기준 미확인으로 바꾸세요.">
        원문 다름
      </span>
    );
  return (
    <span className="shrink-0 rounded-chip border border-field-line px-1 text-xs leading-[18px] text-muted-2" title="저장할 때 공통 지식 원문과 대조합니다">
      대조 전
    </span>
  );
}

/**
 * 성과관리팀 점검표 편집(종합점검 지침 14·13 양식): □ AI 점검 총평 · 7대 축 · 질의 패턴 8 · 정합성 5(경영관리는 □ 자가진단 체크리스트 대조가 더해짐).
 * 구분·항목·정의는 양식 문구 그대로 두고, 행마다 판단과 「미흡 시 보완방안」의 재료(예상 질의·보완·근거 원문·카드)만 씁니다.
 * AI 점검 초안은 확정 카드 + 관리계획 발췌로 만든 초안이며, 확인한 뒤 부서에 보냅니다.
 */
export function InspectionEditor({
  uid,
  period,
  initial,
  status,
  preMonth,
  peerReady,
  updatedAt,
}: {
  uid: string;
  period: string;
  initial: InspectionResult;
  status: InspectionStatus | "none";
  preMonth: boolean;
  peerReady: boolean;
  /** 점검표를 마지막으로 고친 때(보기 양식의 날짜 줄) */
  updatedAt?: string | null;
}) {
  const router = useRouter();
  const [res, setRes] = useState<InspectionResult>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [aiBusy, setAiBusy] = useState(false);
  const [askAi, setAskAi] = useState(false);
  const before = useRef<InspectionResult | null>(null);
  const [canUndoAi, setCanUndoAi] = useState(false);
  const locked = status === "sent" || status === "acknowledged";
  const busy = pending || aiBusy;
  // 보기(부서와 같은 「AI 컨설팅 결과」 양식) · 고치기(입력). 보낸·확인한 점검표는 보기만, 내용이 있으면 보기부터
  const [mode, setMode] = useState<"view" | "edit">(() => (locked || hasContent(initial) ? "view" : "edit"));
  const viewing = locked || mode === "view";
  const issues = sendProblems(res);
  const t = tally(res);
  const tables = formTablesOf(res.form);
  const unverified = unverifiedCount(res);

  const setOverview = (key: keyof InspectionResult["overview"], v: string) => setRes((r) => ({ ...r, overview: { ...r.overview, [key]: v } }));
  const setRow = (k: TableKey, i: number, patch: Partial<RowResult>) => setRes((r) => ({ ...r, [k]: r[k].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setChecklistRow = (i: number, patch: Partial<ChecklistRow>) => setRes((r) => (r.checklist ? { ...r, checklist: { ...r.checklist, rows: r.checklist.rows.map((x, j) => (j === i ? { ...x, ...patch } : x)) } } : r));
  const dropChecklistRow = (i: number) => setRes((r) => (r.checklist ? { ...r, checklist: { ...r.checklist, rows: r.checklist.rows.filter((_, j) => j !== i), others: r.checklist.others + 1 } } : r));
  const setEvidence = (k: TableKey, i: number, ei: number, patch: Partial<Evidence>) =>
    setRes((r) => ({ ...r, [k]: r[k].map((x, j) => (j === i ? { ...x, evidence: x.evidence.map((e, n) => (n === ei ? { ...e, ...patch, verified: null } : e)) } : x)) }));

  const save = (intent: "save" | "send" | "unsend") =>
    start(async () => {
      const out = await saveInspection(uid, period, res, intent);
      if (out.status === "ok") {
        setRes(out.result);
        setCanUndoAi(false);
        router.refresh();
      }
      setMsg(out.status === "ok" ? { ok: true, text: out.message } : { ok: false, text: out.status === "error" ? out.message : "" });
    });

  const runAi = async () => {
    setAskAi(false);
    setAiBusy(true);
    setMsg({ ok: true, text: `카드와 관리계획 발췌로 AI 점검 중입니다(${rangeText(INSPECT_EXPECT)}) — 이 창을 열어 두세요. 끝나면 초안으로 저장됩니다.` });
    before.current = res;
    try {
      const out = await runInspectionDraft(uid, period);
      if (out.ok) {
        setRes(out.result);
        setCanUndoAi(hasContent(before.current));
        setMode("view");
        router.refresh();
      }
      setMsg({ ok: out.ok, text: out.message });
    } catch {
      setMsg({ ok: false, text: "AI 점검 요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex grow flex-col gap-6 px-6 py-5">
        <div className="flex min-w-0 flex-col gap-2">
          {!locked && (
            <span role="group" aria-label="점검표 보기·고치기" className="inline-flex self-start overflow-hidden rounded-md border border-field-line text-xs font-semibold">
              {(
                [
                  ["view", "점검표 보기"],
                  ["edit", "고치기"],
                ] as const
              ).map(([m, label]) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`h-7 px-3 whitespace-nowrap ${mode === m ? "bg-navy text-white" : "bg-paper text-ink hover:text-navy"}`}>
                  {label}
                </button>
              ))}
            </span>
          )}
          <TallyLine result={res} showStatus />
          {res.ai && (
            <p className="text-xs text-muted">
              AI 초안 · {res.ai.model} · {res.ai.at ? fmtDateTime(res.ai.at) : ""} · 근거 조각 {res.ai.sources}개 — 성과관리팀이 확인·수정한 뒤 보냅니다.
            </p>
          )}
          {preMonth && <p className="text-xs text-warn">사전점검(점검월 미도래): 7대축 2·4, 질의패턴 5는 「해당 없음 — 점검월 미도래(사전점검)」로 둡니다.</p>}
          {res.notices.length > 0 && (
            <div className="rounded-md border border-line bg-thead px-3 py-2">
              <p className="text-xs font-bold text-muted">운영 알림(성과관리팀만 보임)</p>
              <ul className="mt-0.5 flex flex-col text-xs leading-5 text-muted-2">
                {res.notices.map((n, i) => (
                  <li key={i}>▸ {n}</li>
                ))}
              </ul>
            </div>
          )}
          {t.focusNote && <p className="text-xs text-muted">▸ {t.focusNote}</p>}
        </div>

        {viewing && <InspectionSheet result={res} idPrefix="pmo" date={updatedAt} />}

        {!viewing && (
        <>
        <section aria-label="AI 점검 총평" className="flex flex-col gap-2.5">
          <h3 className="text-sm font-bold text-navy">□ AI 점검 총평</h3>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            추진현황 — 평가 기준상 현재 단계 + 연말까지의 관건(2~3줄, 활동·수치 나열 없이)
            <textarea value={res.overview.status} disabled={locked || aiBusy} onChange={(e) => setOverview("status", e.target.value)} rows={3} className={area} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            <span>
              개선방향 — 줄마다 ★로 시작, 3~4줄 이내(★항목명: 향후 방향 → 기대 변화)
              {directionLines(res.overview.direction).length > 4 && <span className="ml-2 font-normal text-warn">4줄을 넘었습니다</span>}
              {directionLines(res.overview.direction).some((l) => !l.startsWith("★")) && <span className="ml-2 font-normal text-warn">★로 시작하지 않는 줄이 있습니다</span>}
            </span>
            <textarea value={res.overview.direction} disabled={locked || aiBusy} onChange={(e) => setOverview("direction", e.target.value)} rows={4} placeholder="★OutCome 연결·계량 수치의 함정: … → …" className={area} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            {peerReady
              ? "★ 사례제안 — 기관명 — 사업명(등급): 잘한 점 요약(2~3줄) / 다음 줄 ▸ 인사이트: 1문장. 맞는 사례가 없으면 「해당 없음 — 붙임2에 유사 유형 사례 없음」"
              : "★ 사례제안 — 붙임2(유관기관 평가보고서 정리)가 들어오기 전에는 「기준 미확인 — 붙임2 미확보」"}
            <textarea value={res.overview.case} disabled={locked || aiBusy} onChange={(e) => setOverview("case", e.target.value)} rows={2} className={area} />
          </label>
          <p className="text-xs text-muted">{caseFootnote(res.form)}</p>
        </section>

        {TABLE_KEYS.map((k) => (
          <section key={k} aria-label={tables[k].title} className="flex flex-col gap-2">
            <div className="flex min-w-0 items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-navy">□ {tables[k].title}</h3>
              <span className="text-xs whitespace-nowrap text-muted-2">
                충족 {t.tables[k].met}/{t.tables[k].total}
                {t.tables[k].weak.length > 0 && <span className="text-warn"> · 미흡 {t.tables[k].weak.length}</span>}
              </span>
            </div>
            <ol className="flex flex-col gap-2">
              {tables[k].rows.map((f, i) => {
                const r = res[k][i];
                const pre = preMonth && PRE_MONTH_ITEMS.some((p) => p.table === k && p.no === f.no);
                return (
                  <li key={f.no} className={`flex min-w-0 flex-col gap-2 rounded-md border px-3 py-2.5 ${r.judgment === "미흡" ? "border-warn/60 bg-warn-bg/40" : "border-line"}`}>
                    <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5">
                      <span className="w-4 shrink-0 font-mono text-xs leading-7 text-muted-2">{f.no}</span>
                      <div className="flex min-w-0 grow basis-60 flex-col">
                        <span className="text-ui leading-7 font-semibold text-ink">
                          {f.name}
                          {isStarRow(k, f.no) && (
                            <span className="ml-1 text-warn" title="★핵심 항목(집중보완 판정)">
                              ★
                            </span>
                          )}
                        </span>
                        <span className="text-xs leading-5 text-muted-2">{f.definition}</span>
                        {pre && <span className="text-xs text-warn">사전점검 — 해당 없음(점검월 미도래)</span>}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1" role="radiogroup" aria-label={`판단: ${tables[k].short} ${f.no} ${f.name}`}>
                        {JUDGMENTS.map((j) => {
                          const on = r.judgment === j;
                          return (
                            <button
                              key={j}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              disabled={locked || busy}
                              onClick={() => setRow(k, i, { judgment: on ? null : j })}
                              className={`h-7 rounded-md border px-2 text-xs font-semibold whitespace-nowrap ${on ? `${JUDGE_ON[j]} disabled:cursor-not-allowed disabled:text-white/60` : `border-field-line bg-paper text-muted-2 hover:border-navy ${T.off}`}`}
                            >
                              {j}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {r.judgment === "미흡" ? (
                      <div className="flex flex-col gap-1.5 pl-6">
                        {k === "patterns" && (
                          <div className="flex min-w-0 gap-2">
                            <span className={fieldLabel}>예상 질의</span>
                            <input value={r.question} disabled={busy} onChange={(e) => setRow(k, i, { question: e.target.value })} placeholder="위원이 이 카드에 던질 질문 1문장 …?" aria-label={`예상 질의: ${f.name}`} className={input} />
                          </div>
                        )}
                        <div className="flex min-w-0 gap-2">
                          <span className={fieldLabel}>보완</span>
                          <textarea value={r.fix} disabled={busy} onChange={(e) => setRow(k, i, { fix: e.target.value })} rows={2} placeholder="'칸 이름'에 무엇을 추가·보완" aria-label={`보완: ${f.name}`} className={area} />
                        </div>
                        <div className="flex min-w-0 gap-2">
                          <span className={fieldLabel}>근거</span>
                          <div className="flex min-w-0 grow flex-col gap-1.5">
                            {r.evidence.map((e, ei) => (
                              <div key={ei} className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-paper px-2 py-1.5">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <input value={e.source} disabled={busy} onChange={(ev) => setEvidence(k, i, ei, { source: ev.target.value })} placeholder="지식파일명+위치(예: 관리계획 '26 자가진단 · …)" aria-label="근거 출처" className={`${input} h-7 text-xs`} />
                                  <EvidenceBadge e={e} />
                                  <button type="button" disabled={busy} onClick={() => setRow(k, i, { evidence: r.evidence.filter((_, n) => n !== ei) })} aria-label="근거 지우기" className="size-7 shrink-0 rounded-md border border-field-line text-xs text-muted hover:border-navy">
                                    ✕
                                  </button>
                                </div>
                                <textarea value={e.quote} disabled={busy} onChange={(ev) => setEvidence(k, i, ei, { quote: ev.target.value })} rows={2} placeholder="「원문 인용」 — 지식파일 원문 그대로 한 문장 이내" aria-label="근거 원문" className={`${area} text-xs leading-5`} />
                              </div>
                            ))}
                            {r.evidence.length < 3 && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setRow(k, i, { evidence: [...r.evidence, { source: "", quote: "", key: null, verified: null }] })}
                                className="self-start text-xs font-semibold text-link"
                              >
                                + 근거 원문
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex min-w-0 gap-2">
                          <span className={fieldLabel}>카드</span>
                          <input value={r.card} disabled={busy} onChange={(e) => setRow(k, i, { card: e.target.value })} placeholder="'칸 이름' — 현재 상태(비었음·약함)" aria-label={`카드 근거: ${f.name}`} className={input} />
                        </div>
                        {r.links?.length ? (
                          <div className="flex min-w-0 gap-2">
                            <span className={fieldLabel}>연계 후보</span>
                            {/* 읽기 전용: AI가 원장 주요사업 카드 발췌에서 고르고 과제명·원장 시점은 코드가 채움(lib/ai/inspect-mg.ts) — 판정·집계에 안 들어감 */}
                            <ul aria-label={`주요사업 연계 후보: ${f.name}`} className="flex min-w-0 grow flex-col gap-1 pt-1.5 text-xs leading-5 break-keep text-ink">
                              {r.links.map((l) => (
                                <li key={l.id} className="min-w-0">
                                  {linkText(l)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ) : r.judgment ? (
                      <div className="flex min-w-0 gap-2 pl-6">
                        <span className={fieldLabel}>{r.judgment === "기준 미확인" ? "필요 자료" : r.judgment === "해당 없음" ? "사유" : "메모"}</span>
                        <input
                          value={r.note}
                          disabled={busy}
                          onChange={(e) => setRow(k, i, { note: e.target.value })}
                          placeholder={r.judgment === "기준 미확인" ? "예: 관리계획 Ⅱ 착안사항(Do)" : r.judgment === "해당 없음" ? "예: 계량지표 없음 / 점검월 미도래(사전점검)" : "(선택) 일부 요소만 기준 미확인일 때"}
                          aria-label={`${r.judgment} 사유: ${f.name}`}
                          className={input}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        {res.checklist && (
          <section aria-label={CHECKLIST_TITLE} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-navy">□ {CHECKLIST_TITLE}</h3>
            <p className="text-xs leading-5 text-muted-2">{checklistIntro(res.checklist)}</p>
            <p className="text-xs text-muted">판정·집계(충족 수·미흡·보완 건수·집중보완)에는 들어가지 않습니다. 소관이 아닌 행은 「이 점검표에서 빼기」로 지웁니다(나머지 항목 수에 더해짐).</p>
            <ol className="flex flex-col gap-2">
              {res.checklist.rows.map((row, i) => (
                <li key={i} className={`flex min-w-0 flex-col gap-2 rounded-md border px-3 py-2.5 ${row.result === "아니오" ? "border-warn/60 bg-warn-bg/40" : "border-line"}`}>
                  <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5">
                    <span className="w-14 shrink-0 font-mono text-xs leading-7 text-muted-2">{row.label}</span>
                    <input value={row.point} disabled={busy} onChange={(e) => setChecklistRow(i, { point: e.target.value })} aria-label={`점검사항 요지: ${row.label}`} className={`${input} min-w-48 grow basis-60`} />
                    <div className="flex shrink-0 flex-wrap gap-1" role="radiogroup" aria-label={`결과: ${row.label}`}>
                      {CHECKLIST_RESULTS.map((v) => {
                        const on = row.result === v;
                        return (
                          <button key={v} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => setChecklistRow(i, { result: on ? null : v })} className={`h-7 rounded-md border px-2 text-xs font-semibold whitespace-nowrap ${on ? `disabled:cursor-not-allowed disabled:text-white/60 ${v === "아니오" ? "border-warn bg-warn text-white" : v === "해당 없음" ? "border-muted-2 bg-muted-2 text-white" : "border-link bg-link text-white"}` : `border-field-line bg-paper text-muted-2 hover:border-navy ${T.off}`}`}>
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2 pl-14">
                    <span className={fieldLabel}>반영과제</span>
                    <input value={row.task} disabled={busy} onChange={(e) => setChecklistRow(i, { task: e.target.value })} placeholder="과제번호 또는 —" aria-label={`반영과제: ${row.label}`} className={`${input} w-28`} />
                    <span className={fieldLabel}>비고</span>
                    <input value={row.note} disabled={busy} onChange={(e) => setChecklistRow(i, { note: e.target.value })} placeholder="예: 근거 카드 내용 한 줄 / 보완: 어느 칸에 무엇" aria-label={`비고: ${row.label}`} className={`${input} min-w-48 grow basis-60`} />
                    <button type="button" disabled={busy} onClick={() => dropChecklistRow(i)} className="h-8 shrink-0 rounded-md border border-field-line px-2 text-xs text-muted hover:border-navy">
                      이 점검표에서 빼기
                    </button>
                  </div>
                </li>
              ))}
              {res.checklist.rows.length === 0 && <li className="rounded-md border border-line px-3 py-3 text-center text-xs text-muted">대조한 항목이 없습니다. AI 점검 초안을 만들면 이 지표의 체크리스트 항목이 채워집니다.</li>}
            </ol>
          </section>
        )}
        </>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-thead px-6 py-3">
        {askAi && (
          <div role="alertdialog" aria-label="AI 초안으로 바꾸기" className="flex flex-wrap items-center gap-2 rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-xs text-ink">
            <span className="min-w-0 grow">지금 점검표를 AI 초안으로 바꿔 저장합니다. 바꾼 뒤에도 이 창에서 「AI 전 내용으로」로 되돌릴 수 있습니다.</span>
            <button type="button" onClick={runAi} className={T.btnPrimarySm}>
              바꾸기
            </button>
            <button type="button" onClick={() => setAskAi(false)} className={T.btnSm}>
              취소
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-2" title={issues.join("\n")}>
            {locked ? `보완 ${t.needs}건` : issues.length ? `보내기 전 확인 ${issues.length}곳` : "보낼 수 있음"}
            {unverified > 0 && <span className="ml-1 text-warn">· 원문 다름 {unverified}</span>}
          </span>
          {msg && (
            <span role={msg.ok ? "status" : "alert"} className={`min-w-0 truncate text-xs ${msg.ok ? "text-muted-2" : "text-error"}`} title={msg.text}>
              {msg.text}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {canUndoAi && !locked && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (before.current) setRes(before.current);
                  setCanUndoAi(false);
                  setMsg({ ok: true, text: "AI 전 내용으로 되돌렸습니다(저장해야 반영)." });
                }}
                className={T.btn}
              >
                AI 전 내용으로
              </button>
            )}
            {!locked && (
              <button
                type="button"
                disabled={busy}
                onClick={() => (hasContent(res) ? setAskAi(true) : runAi())}
                title={`확정 카드 + 관리계획 발췌(공통 지식)로 종합점검 지침 ${res.form === MGMT_FORM_ID ? "13(경영관리)" : "14"}의 점검표 초안을 만듭니다`}
                className={`h-8 rounded-md border border-navy bg-paper px-3 text-xs font-semibold text-navy hover:bg-row-hover ${T.off}`}
              >
                {aiBusy ? "AI 점검 중…" : "AI 점검 초안"}
              </button>
            )}
            {status === "sent" ? (
              <button type="button" disabled={busy} onClick={() => save("unsend")} className={T.btn}>
                보내기 취소
              </button>
            ) : status === "acknowledged" ? (
              <span className="text-xs font-semibold text-link">부서가 확인함</span>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => save("save")} className={`h-8 rounded-md border border-navy bg-paper px-3 text-xs font-semibold text-navy ${T.off}`}>
                  초안 저장
                </button>
                <button type="button" disabled={busy || issues.length > 0} title={issues[0] ?? "부서 담당자에게 보냅니다"} onClick={() => save("send")} className={T.btnPrimary}>
                  부서에 보내기
                </button>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
