"use client";

import { Check, RefreshCw, Save, Sparkles, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { fillUnitPartsAi, refillUnitParts, saveUnitPartEdits, setUnitPartStatus } from "../../app/(app)/reports/business/[unit]/parts/actions";
import type { UnitPartView } from "../../app/(app)/reports/business/[unit]/parts/actions";
import { type ProgressSpec, rangeText, UNIT_AI_EXPECT, unitAiProgress } from "../../lib/ai/progress.ts";
import { fmtDateTime } from "../../lib/format.ts";
import { type EditMap, chunkEdits, editList, linesOverLimit, setEdit } from "../../lib/reports/unit-parts-form.ts";
import type { UnitPartKey } from "../../lib/tracks/index.ts";
import { T, Tag } from "../ui/kit";
import { type PaneTabItem, PaneTabs } from "../workspace/pane-tabs";
import { type StepZoomRange, useFitZoom } from "../workspace/use-fit-zoom.ts";
import { ZoomControl } from "../workspace/zoom-control";
import { AiProgress } from "../workspace/ai-progress";
import { ReportPreview } from "./report-preview";
import { type FormCtx, PartForm } from "./unit-parts-fields";

/** 오른쪽 탭 이름 · 안내 글에 쓰는 부분 이름(화면 글 — lib/reports/unit-parts-edit.ts UNIT_PART_LABEL과 같음, 그쪽은 서버 도구를 끌고 와서 여기서 따로 둠) */
const TAB_NAME: Record<UnitPartKey, string> = { cover: "표지", findings: "지적", prior: "전년 대비", outcome: "성과분석" };
const PART_NAME: Record<UnitPartKey, string> = { cover: "표지", findings: "지적사항 조치실적", prior: "전년 대비 주요 추진실적", outcome: "성과분석 및 환류" };

/** 종이 폭(본문 170mm + 좌우 여백 6mm = 182mm) CSS px — 과제별 초안·사업 조판과 같음 */
const PAPER_PX = (182 * 96) / 25.4;
const FIT_ZOOM = { min: 0.6, max: 1.6 } as const;
const HAND_ZOOM: StepZoomRange = { min: 0.5, max: 2, step: 0.1 };
const ZOOM_KEY = "unit-parts-zoom";

const primary = T.btnPrimary;
const plain = T.btn;

type Msg = { ok: boolean; text: string; /** 버전 충돌이 난 부분 — 「새로 고침」 단추 */ conflict?: UnitPartKey } | null;

/** AI 칸이 있는 부분(표지는 사람 칸·코드 칸뿐 — lib/reports/unit-parts-ai.ts UNIT_AI_PARTS와 같음, 그쪽은 서버 도구를 끌고 와서 여기서 따로 둠) */
const AI_PARTS: UnitPartKey[] = ["findings", "prior", "outcome"];

const filledLines = (v: unknown) => Array.isArray(v) && v.some((x) => typeof x === "string" && x.trim());
/** 부분의 글이 있는 ai 칸 수(덮어쓰기 확인 글 — 계량은 표에 넣기로 고른 행만, 서버 unitAiCells와 같은 범위) */
function filledAiCells(spec: UnitPartView["spec"]): number {
  const count = (rows: Array<{ ai?: Record<string, unknown> }>) => rows.reduce((n, r) => n + Object.values(r.ai ?? {}).filter(filledLines).length, 0);
  if (spec.part === "findings" || spec.part === "prior") return count(spec.rows);
  if (spec.part === "outcome") return count(spec.kpi.filter((k) => k.human.checked)) + count(spec.qual) + count(spec.plan);
  return 0;
}

/**
 * 경영관리 지표 단위 부분 작업 공간(/reports/business/<지표>/parts — 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.5).
 * 왼쪽 = 미리보기 종이(장 순서 — 서버가 unitPartsHtml로 그림, 저장하면 서버가 다시 그려 보냄), 오른쪽 = 부분 탭(표지 · 지적 · 전년 대비 · 성과분석).
 * 입력은 부분마다 「고친 칸」 표(EditMap)에 쌓였다가 「저장」에서 버전 조건으로 서버 액션 saveUnitPartEdits에 보냄(60칸씩).
 * 「재료로 다시 채우기」는 코드 칸만(쓴 글은 남음), 「확정」은 성과관리팀 이상.
 * 「AI로 문장 채우기」(R5c, 성과관리팀 이상): 모든 부분 또는 지금 부분의 빈 ai 칸만(덮어쓰기는 화면 안 확인 뒤), 도는 동안 진행 줄(AiProgress — 경과 시간·보통 걸리는 시간만), 끝나면 없는 숫자·알림.
 */
export function UnitPartsWorkspace(props: {
  unit: string;
  canWrite: boolean;
  canConfirm: boolean;
  parts: UnitPartView[];
  /** 미리보기 종이 HTML과 그 CSS(REPORT_CSS + UNIT_PARTS_CSS) */
  html: string;
  css: string;
  rates: FormCtx["rates"];
  uids: FormCtx["uids"];
  /** 지표 전체 경고(초안 없는 카드) */
  warnings: string[];
  /** 이 화면 주소(과제별 초안에서 돌아올 곳) */
  from: string;
}) {
  const { unit, parts } = props;
  const router = useRouter();
  const id = useId();
  const [tab, setTab] = useState<UnitPartKey>(parts[0]?.part ?? "cover");
  const [edits, setEdits] = useState<Partial<Record<UnitPartKey, EditMap>>>({});
  const [msg, setMsg] = useState<Msg>(null);
  /** 다시 채우기 확인 중인 부분들(저장된 부분이 있을 때만 묻고, 없으면 바로 채움) */
  const [ask, setAsk] = useState<UnitPartKey[] | null>(null);
  /** AI로 문장 채우기: 고르는 줄(범위·빈 칸만/덮어쓰기) · 덮어쓰기 확인 · 도는 중 진행 줄 · 끝난 뒤 알림 */
  const [aiAsk, setAiAsk] = useState<{ all: boolean; overwrite: boolean } | null>(null);
  const [aiRun, setAiRun] = useState<{ spec: ProgressSpec; startedAt: number } | null>(null);
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const paperRef = useRef<HTMLDivElement>(null);
  const { scrollRef, zoom, hand, setZoom } = useFitZoom({ storageKey: ZOOM_KEY, docWidthPx: PAPER_PX, reservePx: 32, fitRange: FIT_ZOOM, handRange: HAND_ZOOM });

  const partOf = (k: UnitPartKey) => parts.find((p) => p.part === k);
  const current = partOf(tab) ?? parts[0];
  const dirtyOf = (k: UnitPartKey) => {
    const p = partOf(k);
    return p ? editList(edits[k] ?? {}, p.spec).length : 0;
  };
  const dirty = current ? dirtyOf(current.part) : 0;
  const editable = props.canWrite;

  const tabs: PaneTabItem<UnitPartKey>[] = parts.map((p) => ({
    key: p.part,
    label: TAB_NAME[p.part],
    badge: dirtyOf(p.part),
    title: dirtyOf(p.part) ? `저장하지 않은 고침 ${dirtyOf(p.part)}칸` : `${PART_NAME[p.part]} · ${p.saved ? (p.status === "confirmed" ? "확정" : "초안") : "저장 전"}`,
  }));

  /** 탭을 옮기면 왼쪽 종이도 그 장으로(효과가 아니라 누른 처리기에서) */
  const goTab = (k: UnitPartKey) => {
    setTab(k);
    const root = paperRef.current;
    if (!root) return;
    const heads = [...root.querySelectorAll<HTMLElement>(".k-up-ch")];
    const order = parts.map((p) => p.part).filter((x) => x !== "cover");
    const el = k === "cover" ? root.querySelector<HTMLElement>(".k-frame") : heads[order.indexOf(k)];
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "start", inline: "nearest", behavior: still ? "auto" : "smooth" });
  };

  const clearEdits = (keys: UnitPartKey[]) =>
    setEdits((prev) => {
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });

  const ctx: FormCtx | null = current
    ? {
        spec: current.spec,
        edits: edits[current.part] ?? {},
        editable,
        busy: pending,
        set: (path, value) => setEdits((prev) => ({ ...prev, [current.part]: setEdit(prev[current.part] ?? {}, current.spec, path, value) })),
        uids: props.uids,
        from: props.from,
        rates: props.rates,
      }
    : null;

  // ── 서버 액션 (모두 누른 처리기에서 — 끝나면 서버가 다시 그린 값을 받으려고 새로 고침)
  const save = () => {
    if (!current) return;
    const key = current.part;
    const list = editList(edits[key] ?? {}, current.spec);
    if (!list.length) {
      clearEdits([key]);
      setMsg({ ok: true, text: "바뀐 칸이 없습니다." });
      return;
    }
    const over = list.map((e) => linesOverLimit(e.value)).find(Boolean);
    if (over) {
      setMsg({ ok: false, text: `저장하지 않았습니다 — ${over}` });
      return;
    }
    start(async () => {
      let version = current.version;
      let changed = 0;
      for (const chunk of chunkEdits(list)) {
        const r = await saveUnitPartEdits(unit, key, { version, edits: chunk });
        if (!r.ok) {
          setMsg({ ok: false, text: r.conflict ? "다른 곳에서 바뀜 — 새로 고침" : r.message, conflict: r.conflict ? key : undefined });
          if (changed) router.refresh();
          return;
        }
        version = r.version;
        changed += r.changed;
      }
      clearEdits([key]);
      setMsg({ ok: true, text: `${PART_NAME[key]}: ${changed}칸을 저장했습니다.` });
      router.refresh();
    });
  };

  const refill = (keys: UnitPartKey[]) => {
    setAsk(null);
    start(async () => {
      const r = await refillUnitParts(unit, Object.fromEntries(keys.map((k) => [k, partOf(k)?.version ?? null])));
      if (!r.ok) {
        setMsg({ ok: false, text: r.message });
        return;
      }
      const done = r.results.filter((x) => x.ok).map((x) => x.part);
      const failed = r.results.filter((x) => !x.ok);
      clearEdits(done);
      setMsg({
        ok: failed.length === 0,
        text: failed.length ? `${r.message} ${failed.map((x) => `${PART_NAME[x.part]}: ${x.message}`).join(" · ")}` : r.message,
        conflict: failed.find((x) => !x.ok && x.conflict)?.part,
      });
      router.refresh();
    });
  };

  /** 다시 채우기 누름: 저장된 부분이 있으면 확인 줄을 먼저 띄움 */
  const askRefill = (keys: UnitPartKey[]) => {
    if (keys.some((k) => partOf(k)?.saved)) setAsk(keys);
    else refill(keys);
  };

  const confirmPart = (status: "draft" | "confirmed") => {
    if (!current?.version) return;
    const key = current.part;
    start(async () => {
      const r = await setUnitPartStatus(unit, key, status, current.version!);
      const conflict = !r.ok && r.conflict === true;
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: conflict ? "다른 곳에서 바뀜 — 새로 고침" : r.message, conflict: conflict ? key : undefined });
      if (r.ok) router.refresh();
    });
  };

  /** 「AI로 문장 채우기」 대상 부분(모든 부분 또는 지금 탭) */
  const aiKeys = (all: boolean) => parts.map((p) => p.part).filter((k) => AI_PARTS.includes(k) && (all || k === tab));
  const runAi = (all: boolean, overwrite: boolean) => {
    const keys = aiKeys(all);
    if (!keys.length) return;
    setAiAsk(null);
    setAiNotes([]);
    setMsg(null);
    setAiRun({ spec: unitAiProgress({ parts: keys.map((k) => TAB_NAME[k]), overwrite, cards: Object.keys(props.uids).length }), startedAt: Date.now() });
    start(async () => {
      try {
        const r = await fillUnitPartsAi(unit, Object.fromEntries(keys.map((k) => [k, partOf(k)?.version ?? null])), { overwrite });
        if (!r.ok) {
          setMsg({ ok: false, text: r.conflict ? "다른 곳에서 바뀜 — 새로 고침" : r.message, conflict: r.conflict ? keys[0] : undefined });
          return;
        }
        const done = r.results.filter((x) => x.ok).map((x) => x.part);
        const failed = r.results.filter((x) => !x.ok);
        clearEdits(done);
        setAiNotes([...(r.unknownNumbers.length ? [`근거에 없는 숫자: ${r.unknownNumbers.slice(0, 12).join(", ")}`] : []), ...r.notes]);
        setMsg({ ok: failed.length === 0, text: failed.length ? `${r.message} ${failed.map((x) => `${PART_NAME[x.part]}: ${x.message}`).join(" · ")}` : r.message, conflict: failed.find((x) => !x.ok && x.conflict)?.part });
        router.refresh();
      } finally {
        setAiRun(null);
      }
    });
  };
  const aiDirty = aiAsk ? aiKeys(aiAsk.all).reduce((n, k) => n + dirtyOf(k), 0) : 0;
  const aiFilled = aiAsk ? aiKeys(aiAsk.all).reduce((n, k) => n + filledAiCells(partOf(k)!.spec), 0) : 0;
  const canAi = editable && props.canConfirm && parts.some((p) => AI_PARTS.includes(p.part));

  const askDirty = ask ? ask.reduce((n, k) => n + dirtyOf(k), 0) : 0;
  const status = current ? (current.saved ? (current.status === "confirmed" ? "확정" : "초안") : "저장 전") : "";

  return (
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      {/* 왼쪽: 미리보기 종이 */}
      <section aria-label="카드 밖 부분 미리보기" className="flex min-w-0 flex-col gap-2">
        <style>{props.css}</style>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 text-xs text-muted-2">저장한 내용 기준 미리보기 · 비어 있는 칸은 점선</span>
          <ZoomControl zoom={zoom} fitted={hand === null} range={HAND_ZOOM} onZoom={setZoom} />
        </div>
        <div ref={scrollRef} className="min-w-0 overflow-x-auto rounded-lg bg-[#e9eae9] p-4">
          <div ref={paperRef}>
            <ReportPreview html={props.html} zoom={zoom} />
          </div>
        </div>
      </section>

      {/* 오른쪽: 부분 탭 — 내려도 따라옴 */}
      <aside aria-label="부분 편집" className="sticky top-0 flex max-h-[calc(100dvh-9rem)] min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-paper">
        <div className="flex h-12 shrink-0 items-stretch justify-between gap-2 border-b border-line px-4">
          <PaneTabs id={id} ariaLabel="카드 밖 부분" tabs={tabs} active={tab} onChange={goTab} />
          <span className="my-auto flex shrink-0 items-center gap-1.5">
            {canAi && (
              <button type="button" disabled={pending} onClick={() => setAiAsk({ all: true, overwrite: false })} title={`AI가 지적·전년 대비·성과분석의 문장 칸을 채움(지표당 1회 호출, ${rangeText(UNIT_AI_EXPECT)})`} className={`flex h-7 shrink-0 items-center gap-1 rounded-md border border-navy bg-paper px-2 text-xs font-semibold text-navy hover:bg-thead ${T.off}`}>
                <Sparkles size={13} aria-hidden /> AI로 문장 채우기
              </button>
            )}
            {editable && parts.length > 1 && (
              <button type="button" disabled={pending} onClick={() => askRefill(parts.map((p) => p.part))} title="모든 부분을 재료로 채움(쓴 글은 남음)" className={T.btnSm}>
                모두 채우기
              </button>
            )}
          </span>
        </div>

        {aiRun && (
          <div className="m-3 mb-0 rounded-md border border-line px-3 py-2">
            <AiProgress spec={aiRun.spec} startedAt={aiRun.startedAt} />
          </div>
        )}

        {aiAsk && !aiRun && (
          <div role="alertdialog" aria-label="AI로 문장 채우기" className="m-3 mb-0 flex min-w-0 flex-col gap-2 rounded-md border border-navy/40 bg-thead px-3 py-2 text-xs text-ink">
            {!aiAsk.overwrite ? (
              <>
                <span className="min-w-0 break-keep">
                  AI가 카드 원장·과제별 초안·계량 실적으로 표의 문장 칸을 채웁니다(지표당 1회 호출, 보통 {rangeText(UNIT_AI_EXPECT)}). 행·숫자·지적 글은 그대로이고, 채운 글은 저장되며 확정은 사람이 합니다.
                </span>
                <span className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="채울 범위">
                  <label className="flex items-center gap-1">
                    <input type="radio" name={`${id}-ai-scope`} checked={aiAsk.all} onChange={() => setAiAsk({ ...aiAsk, all: true })} /> 모든 부분
                  </label>
                  <label className={`flex items-center gap-1 ${AI_PARTS.includes(tab) ? "" : "opacity-50"}`}>
                    <input type="radio" name={`${id}-ai-scope`} disabled={!AI_PARTS.includes(tab)} checked={!aiAsk.all} onChange={() => setAiAsk({ ...aiAsk, all: false })} /> 지금 부분만({AI_PARTS.includes(tab) ? TAB_NAME[tab] : "표지는 AI 칸 없음"})
                  </label>
                </span>
                {aiDirty > 0 && <span className="text-warn">저장하지 않은 고침 {aiDirty}칸은 사라집니다 — 먼저 저장하세요.</span>}
                <span className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => runAi(aiAsk.all, false)} className="h-7 rounded-md border border-navy bg-navy px-2.5 font-semibold text-white">
                    빈 칸만 채우기
                  </button>
                  <button type="button" onClick={() => setAiAsk({ ...aiAsk, overwrite: true })} title="이미 쓴 글도 AI 글로 새로 씀 — 한 번 더 확인합니다" className="h-7 rounded-md border border-field-line bg-paper px-2.5 font-semibold">
                    덮어쓰기…
                  </button>
                  <button type="button" onClick={() => setAiAsk(null)} className="h-7 rounded-md border border-field-line bg-paper px-2.5 font-semibold">
                    취소
                  </button>
                </span>
              </>
            ) : (
              <>
                <span className="min-w-0 break-keep text-warn">
                  덮어쓰기: 이미 쓴 글 {aiFilled}칸(사람이 고친 글 포함)이 AI 글로 바뀝니다. 되돌리기는 없습니다.{aiDirty > 0 ? ` 저장하지 않은 고침 ${aiDirty}칸도 사라집니다.` : ""}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => runAi(aiAsk.all, true)} className="h-7 rounded-md border border-warn bg-warn px-2.5 font-semibold text-white">
                    덮어쓰기
                  </button>
                  <button type="button" onClick={() => setAiAsk({ ...aiAsk, overwrite: false })} className="h-7 rounded-md border border-field-line bg-paper px-2.5 font-semibold">
                    돌아가기
                  </button>
                </span>
              </>
            )}
          </div>
        )}

        {aiNotes.length > 0 && !aiRun && (
          <div className="m-3 mb-0 flex min-w-0 items-start gap-2 rounded-md border border-line px-3 py-2">
            <div className="min-w-0 grow">
              <Warnings title="AI 채우기 알림" list={aiNotes} />
            </div>
            <button type="button" onClick={() => setAiNotes([])} className="h-6 shrink-0 rounded-md border border-field-line bg-paper px-1.5 text-xs" title="알림 닫기">
              닫기
            </button>
          </div>
        )}

        {ask && (
          <div role="alertdialog" aria-label="재료로 다시 채우기 확인" className="m-3 mb-0 flex flex-wrap items-center gap-2 rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-xs text-ink">
            <span className="min-w-0 grow">
              {ask.length > 1 ? "저장된 부분이 있습니다. " : ""}쓴 글은 남고 행 목록·숫자가 재료로 바뀝니다.
              {askDirty > 0 && ` 저장하지 않은 고침 ${askDirty}칸은 사라집니다.`}
            </span>
            <button type="button" onClick={() => refill(ask)} className="h-7 rounded-md border border-navy bg-navy px-2.5 font-semibold text-white">
              다시 채우기
            </button>
            <button type="button" onClick={() => setAsk(null)} className="h-7 rounded-md border border-field-line bg-paper px-2.5 font-semibold">
              취소
            </button>
          </div>
        )}

        {current && ctx && (
          <div id={`${id}-${current.part}`} role="tabpanel" aria-labelledby={`${id}-${current.part}-tab`} className="flex min-h-0 grow flex-col">
            <div className="min-h-0 grow overflow-y-auto px-4 py-3">
              <div className="flex min-w-0 flex-col gap-3">
                {/* 부분 머리: 상태 칩 · 재료가 바뀜 · 다시 채우기 · 확정 */}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="min-w-0 truncate text-sm font-bold text-navy" title={PART_NAME[current.part]}>
                    {PART_NAME[current.part]}
                  </h2>
                  <Tag tone={current.saved ? (current.status === "confirmed" ? "solid" : "link") : "muted"} title={current.saved ? `마지막 저장 ${fmtDateTime(current.updatedAt)}${current.model ? ` · AI ${current.model}` : ""}` : "아직 저장하지 않은 부분 — 재료로 만든 초안을 보고 있습니다"}>
                    {status}
                  </Tag>
                  {current.changes.length > 0 && (
                    <Tag tone="warnSolid" title={current.changes.join("\n")}>
                      재료가 바뀜 {current.changes.length}
                    </Tag>
                  )}
                  {editable && (
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button type="button" disabled={pending} onClick={() => askRefill([current.part])} title="코드 칸(행 목록·숫자·지적 글)만 재료로 새로 채움 — 쓴 글은 남습니다" className={plain}>
                        <RefreshCw size={13} aria-hidden /> 재료로 다시 채우기
                      </button>
                      {props.canConfirm && (
                        <button
                          type="button"
                          disabled={pending || !current.saved || dirty > 0}
                          onClick={() => confirmPart(current.status === "confirmed" ? "draft" : "confirmed")}
                          title={!current.saved ? "먼저 저장(재료로 채우기·칸 고치기)한 뒤 확정합니다" : dirty > 0 ? "저장하지 않은 고침이 있습니다 — 먼저 저장" : "확정은 표시용입니다 — 확정 뒤에도 성과관리팀은 고칠 수 있습니다"}
                          className={current.status === "confirmed" && current.saved ? plain : primary}
                        >
                          <Check size={13} aria-hidden /> {current.status === "confirmed" && current.saved ? "확정 풀기" : "확정"}
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {!editable && <p className="rounded-md bg-thead px-3 py-2 text-xs text-muted-2">읽기 전용입니다 — 성과관리팀·주관 부서가 고칩니다.</p>}
                {current.changes.length > 0 && (
                  <details className="min-w-0 rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-xs text-ink">
                    <summary className="cursor-pointer font-semibold text-warn">재료가 바뀜 {current.changes.length}건 — 저장한 뒤 재료가 달라졌습니다. 「재료로 다시 채우기」로 맞춥니다.</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {current.changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <Warnings title="확인할 것" list={current.warnings} />
                {tab === parts[0]?.part && <Warnings title="지표 확인 사항" list={props.warnings} />}
                <PartForm ctx={ctx} />
              </div>
            </div>

            {/* 아래 줄: 결과 안내 · 저장 */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line bg-thead px-4 py-2.5">
              <span role={msg && !msg.ok ? "alert" : "status"} className={`min-w-0 grow basis-40 text-xs break-keep [overflow-wrap:anywhere] ${msg && !msg.ok ? "text-error" : "text-muted-2"}`}>
                {msg?.text ?? (dirty > 0 ? `고친 칸 ${dirty} — 저장하면 왼쪽 미리보기에 반영됩니다.` : editable ? "고친 칸이 없습니다." : "")}
              </span>
              {msg?.conflict && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    clearEdits([msg.conflict!]);
                    setMsg(null);
                    router.refresh();
                  }}
                  title={`새로 고치면 ${PART_NAME[msg.conflict]}의 저장하지 않은 고침은 사라집니다`}
                  className={plain}
                >
                  <RefreshCw size={13} aria-hidden /> 새로 고침
                </button>
              )}
              {editable && (
                <>
                  <button type="button" disabled={pending || dirty === 0} onClick={() => { clearEdits([current.part]); setMsg(null); }} title="이 부분의 저장하지 않은 고침을 버림" className={plain}>
                    <Undo2 size={13} aria-hidden /> 되돌리기
                  </button>
                  <button type="button" disabled={pending || dirty === 0} onClick={save} className={primary}>
                    <Save size={13} aria-hidden /> 저장{dirty > 0 ? ` ${dirty}` : ""}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

/** 경고 목록(많으면 접음) */
function Warnings({ title, list }: { title: string; list: string[] }) {
  if (!list.length) return null;
  const body = (
    <ul className="flex min-w-0 list-disc flex-col gap-1 pl-5 text-xs leading-5 break-keep text-ink [overflow-wrap:anywhere]">
      {list.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
  return list.length > 3 ? (
    <details className="min-w-0">
      <summary className="cursor-pointer text-xs font-semibold text-warn">
        {title} {list.length}건
      </summary>
      <div className="mt-1">{body}</div>
    </details>
  ) : (
    <section aria-label={title} className="flex min-w-0 flex-col gap-1">
      <h3 className="text-xs font-semibold text-warn">
        {title} {list.length}건
      </h3>
      {body}
    </section>
  );
}
