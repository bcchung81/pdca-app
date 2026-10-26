"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addComment,
  deleteMaterial,
  finishMaterialUpload,
  prepareReports,
  saveReportInputs,
  setCommentStatus,
  setLeadTeam,
  setMaterialCards,
  setReportStatus,
  startMaterialUpload,
} from "../../app/(app)/reports/actions";
import { fmtDateTime } from "../../lib/format.ts";
import { type MaterialMatch, initialSelection, materialSummary, suggestCards } from "../../lib/reports/material-match.ts";
import { COMMENT_KINDS, type ReportStatus, canMove } from "../../lib/reports/model.ts";
import { REVIEW_NOTE_MAX } from "../../lib/reports/submission.ts";
import { ConfirmDialog, plain, primary } from "../ui/confirm-dialog";
import { FileDrop, type FileItem } from "../ui/file-drop";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText?: string) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? (okText || res.message ? { ok: true, text: res.message ?? okText! } : null) : { ok: false, text: res.message ?? "처리하지 못했습니다." });
      if (res.ok) router.refresh();
    });
  const note = msg && (
    <span role={msg.ok ? "status" : "alert"} className={`max-w-[360px] truncate text-xs ${msg.ok ? "text-muted-2" : "text-error"}`} title={msg.text}>
      {msg.text}
    </span>
  );
  return { pending, run, note };
}

export function PrepareButton({ year, label }: { year: number; label: string }) {
  const { pending, run, note } = useAction();
  return (
    <span className="flex items-center gap-2">
      {note}
      <button type="button" disabled={pending} onClick={() => run(() => prepareReports(year))} className={primary}>
        {label}
      </button>
    </span>
  );
}

export function LeadTeamSelect({ unitId, value, teams }: { unitId: string; value: number | null; teams: Array<{ id: number; name: string }> }) {
  const { pending, run, note } = useAction();
  return (
    <span className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        주관 부서
        <select
          value={value ?? ""}
          disabled={pending}
          onChange={(e) => run(() => setLeadTeam(unitId, e.target.value ? Number(e.target.value) : null), "주관 부서를 바꿨습니다.")}
          className="h-7 max-w-[200px] rounded-md border border-field-line bg-paper px-1.5 text-xs font-normal text-ink"
        >
          <option value="">지정 안 함</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {note}
    </span>
  );
}

/** 제출 준비 상태(submitReadiness를 화면용으로 줄인 것) — 부서 제출 버튼만 씀 */
export interface ReportReadiness {
  ready: boolean;
  total: number;
  drafted: number;
  /** 초안이 없는 과제(제출을 막는 까닭) */
  missing: string[];
  /** 확인할 것(막지 않음) */
  checks: string[];
}

/**
 * 상태 버튼: 부서(제출 — 준비 상태를 확인 창에서 보이고 제출 · 제출 취소), 성과관리팀(돌려보내기 — 메모 필수 · 승인 — 메모 선택).
 * readiness는 부서 제출 버튼에만 씀(제출 조건 재확인은 서버가 다시 함 — setReportStatus).
 */
export function ReportStatusButtons({ id, status, staff, readiness }: { id: number; status: ReportStatus; staff: boolean; readiness?: ReportReadiness }) {
  const { pending, run, note } = useAction();
  const go = (to: ReportStatus, ok: string, memo?: string) => run(() => setReportStatus(id, to, memo), ok);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [returnMemo, setReturnMemo] = useState("");
  const [approveMemo, setApproveMemo] = useState("");
  const ready = readiness?.ready ?? false;
  const submitTitle = !readiness ? undefined : readiness.ready ? undefined : `과제별 초안이 없는 과제가 있어 제출할 수 없습니다: ${readiness.missing.join("·") || "—"}`;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {note}
      {/* 제출: 작성 중일 때(전이 표 canMove — 첫 과제별 초안이 생기면 DB 트리거가 준비 → 작성 중으로 바꿈) */}
      {!staff && canMove("dept_user", status, "submitted") && (
        <>
          <button type="button" disabled={pending || !ready} title={submitTitle} onClick={() => setSubmitOpen(true)} className={primary}>
            성과관리팀에 제출
          </button>
          {readiness && (
            <ConfirmDialog label="제출 확인" title="성과관리팀에 제출할까요?" open={submitOpen} onOpenChange={setSubmitOpen} pending={pending} confirmLabel="제출" onConfirm={() => run(async () => { setSubmitOpen(false); return setReportStatus(id, "submitted"); }, "제출했습니다.")}>
              <p className="text-ui text-ink">
                과제별 초안 <b>{readiness.drafted}/{readiness.total}</b>건
              </p>
              {readiness.checks.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-muted">확인할 것(제출을 막지 않음)</p>
                  <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-line bg-thead px-3 py-2 text-xs leading-5 text-muted-2">
                    {readiness.checks.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </ConfirmDialog>
          )}
        </>
      )}
      {!staff && status === "submitted" && (
        <button type="button" disabled={pending} onClick={() => go("drafting", "제출을 취소했습니다.")} className={plain}>
          제출 취소
        </button>
      )}
      {staff && status === "submitted" && (
        <>
          <button type="button" disabled={pending} onClick={() => setReturnOpen(true)} className={plain}>
            돌려보내기
          </button>
          <button type="button" disabled={pending} onClick={() => setApproveOpen(true)} className={primary}>
            승인
          </button>
          <ConfirmDialog
            label="돌려보내기"
            title="부서에 돌려보낼까요?"
            open={returnOpen}
            onOpenChange={setReturnOpen}
            pending={pending}
            confirmLabel="돌려보내기"
            confirmDisabled={!returnMemo.trim()}
            onConfirm={() =>
              run(async () => {
                setReturnOpen(false);
                const r = await setReportStatus(id, "drafting", returnMemo);
                if (r.ok) setReturnMemo("");
                return r;
              }, "돌려보냈습니다.")
            }
          >
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              부서가 고칠 점(필수 — 부서 화면에 보입니다)
              <textarea value={returnMemo} maxLength={REVIEW_NOTE_MAX} onChange={(e) => setReturnMemo(e.target.value)} rows={4} className="min-w-0 rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-sm text-ink" placeholder="예: 4-가 과제별 초안이 아직 없습니다." />
            </label>
          </ConfirmDialog>
        </>
      )}
      {staff && status === "approved" && (
        <button type="button" disabled={pending} onClick={() => go("submitted", "승인을 풀었습니다.")} className={plain}>
          승인 풀기
        </button>
      )}
      {staff && status === "submitted" && (
        <ConfirmDialog
          label="승인"
          title="승인할까요?"
          open={approveOpen}
          onOpenChange={setApproveOpen}
          pending={pending}
          confirmLabel="승인"
          onConfirm={() =>
            run(async () => {
              setApproveOpen(false);
              const r = await setReportStatus(id, "approved", approveMemo);
              if (r.ok) setApproveMemo("");
              return r;
            }, "승인했습니다.")
          }
        >
          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            검토 메모(선택 — 부서 화면에 보입니다)
            <textarea value={approveMemo} maxLength={REVIEW_NOTE_MAX} onChange={(e) => setApproveMemo(e.target.value)} rows={3} className="min-w-0 rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-sm text-ink" placeholder="예: 수고하셨습니다." />
          </label>
        </ConfirmDialog>
      )}
    </span>
  );
}

/** 보고서 추가자료 한 건 + 그 자료를 쓰기로 확정한 과제 */
export interface MaterialItem extends FileItem {
  matches: MaterialMatch[];
}

const CONFIRMED_TAG = { text: "확정", cls: "bg-info-bg text-link", title: "사람이 이 과제에 연결해 확정 — 이 자료의 수치를 그 과제 초안의 숫자 근거로 인정합니다" };
const NAME_TAG = { text: "파일 이름", cls: "bg-field text-muted-2", title: "파일 이름에 이 과제번호가 있어 미리 체크했습니다 — 「선택한 과제로 확정」을 눌러야 숫자 근거로 인정합니다" };

/** 자료 한 건: 이 자료를 쓸 과제를 사람이 고름(파일 이름에 과제번호가 있으면 미리 체크 — 저장해야 확정) — 확정한 것만 숫자 근거 */
function MaterialRow({ reportId, item, cards, canEdit }: { reportId: number; item: MaterialItem; cards: Array<{ id: string; taskNo: string; title: string }>; canEdit: boolean }) {
  const router = useRouter();
  const suggested = suggestCards(item.fileName, cards);
  const [sel, setSel] = useState<Set<string>>(() => new Set(initialSelection(item.matches, suggested)));
  const [delPending, startDelete] = useTransition();
  const { pending, run, note } = useAction();
  const sum = materialSummary(item.matches, suggested);
  const confirmedNow = new Set(item.matches.map((m) => m.cardId));
  // 저장할 것이 있는가: 지금 체크가 확정된 연결과 다를 때(미리 체크된 제안을 그대로 확정하는 것도 포함)
  const dirty = sel.size !== confirmedNow.size || [...sel].some((id) => !confirmedNow.has(id));
  const needsAction = sum.state === "suggested";
  const summary =
    sum.state === "confirmed"
      ? `확정 ${sum.confirmed}개`
      : sum.state === "suggested"
        ? `파일 이름의 과제번호로 ${sum.suggested}개를 미리 체크했습니다 — 확인해 확정해 주세요`
        : "연결한 과제 없음 — 「같은 보고서 자료」(초안에는 넣지만 수치는 숫자 근거로 안 씀)";
  return (
    <li className="min-w-0 border-b border-row-line last:border-b-0">
      <details open={needsAction} className="group">
        <summary className="flex min-w-0 cursor-pointer items-center gap-2 px-3 py-2">
          <span className="w-10 shrink-0 font-mono text-xs text-muted uppercase">{(item.fileName.split(".").pop() ?? "").slice(0, 5)}</span>
          {item.url ? (
            <a href={item.url} className="min-w-0 truncate text-ui text-link" title={item.fileName} onClick={(e) => e.stopPropagation()}>
              {item.fileName}
            </a>
          ) : (
            <span className="min-w-0 truncate text-ui">{item.fileName}</span>
          )}
          {item.parseError && (
            <span className="shrink-0 rounded-chip bg-warn-bg px-1 text-xs text-warn" title={item.parseError}>
              AI가 못 읽음
            </span>
          )}
          <span className={`ml-auto max-w-[46%] truncate text-xs ${needsAction ? "font-semibold text-warn" : "text-muted-2"}`} title={summary}>
            {summary}
          </span>
          {canEdit && (
            <button
              type="button"
              disabled={delPending}
              onClick={(e) => {
                e.preventDefault();
                startDelete(async () => {
                  await deleteMaterial(item.id);
                  router.refresh();
                });
              }}
              className="shrink-0 text-xs text-muted underline hover:text-warn"
              aria-label={`${item.fileName} 삭제`}
            >
              삭제
            </button>
          )}
        </summary>
        <div className="flex min-w-0 flex-col gap-2 border-t border-row-line bg-field/40 px-3 py-2.5">
          <p className="text-xs leading-5 text-muted">이 자료를 쓸 과제를 고르세요. <b className="font-semibold text-ink">확정한 과제의 초안에서만</b> 이 자료의 수치를 숫자 근거로 인정합니다.</p>
          {cards.length === 0 ? (
            <p className="text-ui text-muted">이 보고서에 연결된 과제가 없습니다.</p>
          ) : (
            <ul className="grid min-w-0 gap-1 sm:grid-cols-2">
              {cards.map((c) => {
                const tag = confirmedNow.has(c.id) ? CONFIRMED_TAG : sum.state === "suggested" && suggested.includes(c.id) ? NAME_TAG : null;
                return (
                  <li key={c.id} className="min-w-0">
                    <label className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-paper" title={c.title}>
                      <input
                        type="checkbox"
                        checked={sel.has(c.id)}
                        disabled={!canEdit || pending}
                        onChange={() => setSel((prev) => (prev.has(c.id) ? new Set([...prev].filter((x) => x !== c.id)) : new Set([...prev, c.id])))}
                        aria-label={`${c.taskNo} ${c.title}에 쓰기`}
                        className="size-4 shrink-0 accent-navy"
                      />
                      <span className="shrink-0 font-mono text-xs text-navy">{c.taskNo}</span>
                      <span className="min-w-0 truncate text-ui">{c.title}</span>
                      {tag && (
                        <span className={`shrink-0 rounded-chip px-1 text-xs ${tag.cls}`} title={tag.title}>
                          {tag.text}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {note}
              <button type="button" disabled={pending || !dirty} onClick={() => run(() => setMaterialCards(reportId, item.id, [...sel]), sel.size ? "확정했습니다" : "연결을 모두 풀었습니다 — 같은 보고서 자료가 됩니다")} className={`${primary} ml-auto`}>
                {sel.size ? "선택한 과제로 확정" : "연결 모두 풀기"}
              </button>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

/** 보고서 추가자료(이 보고서에서만 씀) — 올린 뒤 사람이 쓸 과제를 고르고(파일 이름에 과제번호가 있으면 미리 체크), 고른 과제에서만 수치를 숫자 근거로 인정 */
export function MaterialUploader({ reportId, items, cards, canEdit }: { reportId: number; items: MaterialItem[]; cards: Array<{ id: string; taskNo: string; title: string }>; canEdit: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FileDrop
        bucket="report-materials"
        items={items}
        list={false}
        canEdit={canEdit}
        hint="사진·수상·언론·공문 등 · 파일당 50MB · 이 보고서에서만 씀 · 이미지·스캔 PDF는 AI가 그림 설명으로 읽음(API 연결일 때) · 올린 뒤 이 자료를 쓸 과제를 고르세요"
        start={(name, size) => startMaterialUpload(reportId, name, size)}
        finish={(path, name, mime, size) => finishMaterialUpload(reportId, path, name, mime, size)}
        remove={(id) => deleteMaterial(id)}
      />
      {items.length === 0 ? (
        <p className="text-ui text-muted">아직 올린 자료가 없습니다.</p>
      ) : (
        <ul className="flex flex-col rounded-md border border-line">
          {items.map((m) => (
            // 연결이 바뀌면 화면 값이 달라지므로 key에 연결 상태를 넣어 체크 상태를 새 값으로 다시 잡음
            <MaterialRow key={`${m.id}:${m.matches.map((x) => x.cardId).join(",")}`} reportId={reportId} item={m} cards={cards} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** 계량 실적(12월 잠정치) 입력 — AI는 수치를 만들지 않음 */
export function KpiInputs({ reportId, rows, initial, canEdit }: { reportId: number; rows: Array<{ key: string; card: string; name: string; unit: string; target: string; prev: string }>; initial: Record<string, string>; canEdit: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>(initial);
  const { pending, run, note } = useAction();
  const missing = rows.filter((r) => !(vals[r.key] ?? "").trim()).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-ui">
          <colgroup>
            <col className="w-[72px]" />
            <col />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead>
            <tr className="h-9 bg-thead text-left text-xs font-semibold text-muted">
              {["과제", "지표", "’25 실적", "’26 목표", "12월 잠정 실적"].map((h) => (
                <th key={h} scope="col" className="border-b border-line px-2.5 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="h-11">
                <td className="border-b border-row-line px-2.5 font-mono text-navy">{r.card}</td>
                <td className="truncate border-b border-row-line px-2.5" title={`${r.name}${r.unit ? ` (${r.unit})` : ""}`}>
                  {r.name}
                  {r.unit ? <span className="text-muted"> ({r.unit})</span> : null}
                </td>
                <td className="truncate border-b border-row-line px-2.5 text-muted-2">{r.prev || "—"}</td>
                <td className="truncate border-b border-row-line px-2.5 text-muted-2">{r.target || "—"}</td>
                <td className="border-b border-row-line px-2.5">
                  <input
                    value={vals[r.key] ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => setVals((v) => ({ ...v, [r.key]: e.target.value }))}
                    placeholder="예: 46,210건"
                    aria-label={`${r.name} 12월 잠정 실적`}
                    className="h-8 w-full rounded-md border border-field-line bg-paper px-2 text-ui disabled:bg-field"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs ${missing ? "text-warn" : "text-muted"}`}>{missing ? `${missing}건 입력 필요` : "모두 입력함"}</span>
        {note}
        {canEdit && (
          <button type="button" disabled={pending} onClick={() => run(() => saveReportInputs(reportId, vals))} className={`${primary} ml-auto`}>
            실적 저장
          </button>
        )}
      </div>
    </div>
  );
}

/** 리뷰 코멘트: 대상(전체·블록) · 종류 · 내용, 해결 처리 */
export function Comments({
  reportId,
  anchors,
  items,
  canResolve,
  meId,
}: {
  reportId: number;
  anchors: Array<{ id: string; label: string }>;
  items: Array<{ id: number; anchor: string; kind: string; body: string; status: "open" | "resolved"; author: string; authorId: string; createdAt: string }>;
  canResolve: boolean;
  meId: string;
}) {
  const [anchor, setAnchor] = useState("all");
  const [kind, setKind] = useState<string>("수정");
  const [body, setBody] = useState("");
  const [show, setShow] = useState<"all" | "open" | "resolved">("all");
  const { pending, run, note } = useAction();
  const label = new Map(anchors.map((a) => [a.id, a.label]));
  const shown = items.filter((c) => show === "all" || c.status === show);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-line p-4">
        <div className="flex gap-2">
          <select value={anchor} onChange={(e) => setAnchor(e.target.value)} aria-label="코멘트 대상" className="h-8 min-w-0 grow rounded-md border border-field-line bg-paper px-2 text-xs">
            <option value="all">보고서 전체</option>
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="코멘트 종류">
            {COMMENT_KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`h-8 rounded-md border px-2 text-xs font-semibold ${kind === k ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-muted-2"}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="코멘트 내용" aria-label="코멘트 내용" className="rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-ui" />
        <div className="flex items-center gap-2">
          {note}
          <button
            type="button"
            disabled={pending || !body.trim()}
            onClick={() =>
              run(async () => {
                const r = await addComment(reportId, anchor, kind, body);
                if (r.ok) setBody("");
                return r;
              })
            }
            className={`${primary} ml-auto`}
          >
            보내기
          </button>
        </div>
      </div>
      <div className="flex gap-1 border-b border-line px-4 py-2 text-xs">
        {(
          [
            ["all", `전체 ${items.length}`],
            ["open", `미해결 ${items.filter((c) => c.status === "open").length}`],
            ["resolved", `해결됨 ${items.filter((c) => c.status === "resolved").length}`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={`rounded-full px-2.5 py-0.5 ${show === k ? "bg-navy text-white" : "text-muted-2 hover:bg-row-hover"}`}>
            {l}
          </button>
        ))}
      </div>
      <ol className="flex min-h-0 grow flex-col overflow-y-auto">
        {shown.length === 0 && <li className="px-4 py-8 text-center text-ui text-muted">코멘트가 없습니다.</li>}
        {shown.map((c) => (
          <li key={c.id} className={`flex flex-col gap-1.5 border-b border-row-line px-4 py-3 ${c.status === "resolved" ? "opacity-70" : ""}`}>
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <span className="truncate font-semibold text-navy">{c.anchor === "all" ? "보고서 전체" : (label.get(c.anchor) ?? c.anchor)}</span>
              <span className="shrink-0 rounded-chip border border-field-line px-1 text-muted-2">{c.kind}</span>
              <span className={`ml-auto shrink-0 ${c.status === "open" ? "text-warn" : "text-link"}`}>{c.status === "open" ? "미해결" : "해결됨"}</span>
            </div>
            <p className="text-ui leading-5 whitespace-pre-wrap text-ink">{c.body}</p>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="truncate">
                {c.author} · {fmtDateTime(c.createdAt)}
              </span>
              {(canResolve || c.authorId === meId) && (
                <button type="button" disabled={pending} onClick={() => run(() => setCommentStatus(c.id, reportId, c.status === "open" ? "resolved" : "open"))} className="ml-auto shrink-0 text-link underline">
                  {c.status === "open" ? "해결로 표시" : "다시 열기"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
