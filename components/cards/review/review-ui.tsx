"use client";

import { Check, ChevronUp, LoaderCircle, MessageCircleQuestionMark, Sparkles, ThumbsUp, Trash2, X } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { T } from "../../ui/kit";
import { pathLabel } from "../../../lib/cards/path-label.ts";
import type { NoteKind, NoteStatus, ReviewNote, ReviewTarget, ToastSpec } from "./use-card-review";
import type { LooseJson } from "../../../lib/loose-json.ts";
import { COMMENT_TEXT_MAX } from "../../../lib/cards/limits.ts";


// 리뷰어 화면 부품: 드래그 도구줄 · 작성 카드 · 여백 메모 열 · 알림. 위치는 편집기 스크롤 영역 안에서 잽니다.

export type PickKind = "edit" | "ask" | "delete" | "keep";

const pickBtn = "flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-semibold whitespace-nowrap text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:text-white/50 disabled:hover:bg-transparent";

/** 드래그 직후 고른 글 위에 뜨는 도구줄 */
export function SelectionBar(props: { top: number; left: number; mode: "edit" | "ask"; canDelete: boolean; onPick: (k: PickKind) => void }) {
  // 버튼을 눌러도 고른 글·초점이 풀리지 않게
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div
      role="toolbar"
      aria-label="고른 글"
      data-review-ui
      onMouseDown={keep}
      style={{ top: props.top, left: props.left }}
      className="absolute z-bar flex items-center gap-0.5 rounded-[10px] bg-navy p-[3px] shadow-[0_6px_16px_rgba(16,24,40,0.28)]"
    >
      {props.mode === "edit" && (
        <button type="button" className={pickBtn} onClick={() => props.onPick("edit")} title="고른 글을 어떻게 고칠지 적으면 AI가 카드를 직접 고칩니다">
          <Sparkles size={14} aria-hidden="true" />
          AI 수정 요청
        </button>
      )}
      <button type="button" className={pickBtn} onClick={() => props.onPick("ask")} title="고른 글에 대해 AI에 묻습니다(카드는 그대로)">
        <MessageCircleQuestionMark size={14} aria-hidden="true" />
        질문
      </button>
      {props.mode === "edit" && (
        <>
          <button type="button" className={pickBtn} disabled={!props.canDelete} onClick={() => props.onPick("delete")} title={props.canDelete ? "고른 글을 바로 지웁니다(되돌리기 가능)" : "고정 영역·양식 칸은 지울 수 없습니다"}>
            <Trash2 size={14} aria-hidden="true" />
            삭제
          </button>
          <button type="button" className={pickBtn} onClick={() => props.onPick("keep")} title="좋은 글로 표시합니다 — AI가 이 부분은 바꾸지 않습니다">
            <ThumbsUp size={14} aria-hidden="true" />
            좋음
          </button>
        </>
      )}
    </div>
  );
}

const KIND_LABEL: Record<NoteKind, string> = { edit: "수정", ask: "질문", keep: "좋음" };
const KIND_CHIP: Record<NoteKind, string> = { edit: "bg-revise-bg text-link", ask: "bg-ai-bg text-ai", keep: "bg-ok-bg text-ok" };
const PLACEHOLDER: Record<"edit" | "ask", string> = {
  edit: "어떻게 고칠지 적어 주세요",
  ask: "궁금한 점을 적어 주세요",
};
/** 요청 칸 title(자세한 설명 — placeholder는 짧게) */
const COMPOSER_HINT: Record<"edit" | "ask", string> = {
  edit: "비워 두면 문체 기준에 맞게 다듬습니다",
  ask: "고른 글에 대해 AI에 묻습니다(카드는 그대로)",
};

export interface ComposerState {
  target: ReviewTarget;
  kind: "edit" | "ask";
  text: string;
}

/** 여백 메모 열에 뜨는 코멘트 작성 카드 */
export function Composer(props: { state: ComposerState; mode: "edit" | "ask"; card: LooseJson; onChange: (s: ComposerState) => void; onSend: () => void; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const { state } = props;
  useEffect(() => {
    ref.current?.focus();
  }, [state.target]);
  // 카드 쪽이 좁아 작성 카드가 가로로 가려지면 보이는 곳으로 옮김(옆 창이 자리를 내어 준 뒤 — 카드 쪽 폭이 바뀔 때마다, 연 뒤 잠깐만)
  useEffect(() => {
    const el = root.current;
    const sc = el?.closest<HTMLElement>("[data-card-scroll]");
    if (!el || !sc || typeof ResizeObserver === "undefined") return;
    const show = () => {
      const a = el.getBoundingClientRect();
      const left = sc.getBoundingClientRect().left;
      const right = left + sc.clientWidth;
      if (a.right > right) sc.scrollLeft += Math.min(a.right - right + 16, a.left - left);
      else if (a.left < left) sc.scrollLeft -= left - a.left + 16;
    };
    const ro = new ResizeObserver(show);
    ro.observe(sc);
    const stop = setTimeout(() => ro.disconnect(), 1000);
    return () => {
      clearTimeout(stop);
      ro.disconnect();
    };
  }, [state.target]);
  // 글 길이에 맞춰 늘어남
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(220, t.scrollHeight + 2)}px`;
  }, [state.text]);
  const canSend = state.kind === "edit" || state.text.trim().length > 0;
  return (
    <div
      ref={root}
      role="dialog"
      aria-label="코멘트 작성"
      data-review-ui
      data-composer
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          props.onClose();
        }
      }}
      className="absolute right-0 left-0 z-pop flex flex-col gap-2.5 rounded-[14px] border-[1.5px] border-accent bg-paper p-3.5 shadow-[0_10px_28px_rgba(30,28,20,0.14)]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate rounded-md bg-target-bg px-1.5 text-xs leading-[1.6] font-semibold text-navy" title={state.target.path ?? ""}>
          {pathLabel(state.target.path, props.card)}
        </span>
        <button type="button" onClick={props.onClose} aria-label="닫기 (Esc)" title="닫기 (Esc)" className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-row-hover">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {state.target.quote && <p className="line-clamp-2 rounded-[5px] bg-quote-bg px-2 py-0.5 text-xs text-quote-ink">{state.target.quote}</p>}
      <div role="radiogroup" aria-label="코멘트 종류" className="flex gap-1.5">
        {(props.mode === "edit" ? (["edit", "ask"] as const) : (["ask"] as const)).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={state.kind === k}
            onClick={() => {
              props.onChange({ ...state, kind: k });
              ref.current?.focus();
            }}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${state.kind === k ? "border-navy bg-navy text-white" : "border-line text-muted-2 hover:border-navy"}`}
          >
            {k === "edit" ? "AI 수정 요청" : "질문"}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        value={state.text}
        maxLength={COMMENT_TEXT_MAX}
        onChange={(e) => props.onChange({ ...state, text: e.target.value })}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) props.onSend();
          }
        }}
        rows={3}
        placeholder={PLACEHOLDER[state.kind]}
        title={COMPOSER_HINT[state.kind]}
        aria-label="코멘트 내용"
        className="min-h-[68px] w-full resize-none rounded-[10px] bg-field px-3 py-2 text-ui leading-[1.55] text-ink outline-none focus:shadow-focus"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">5초 안에는 되돌릴 수 있습니다</span>
        <button type="button" disabled={!canSend} onClick={props.onSend} className={`ml-auto flex h-8 items-center gap-1.5 rounded-[10px] bg-navy px-3.5 text-xs font-bold text-white ${T.off}`}>
          AI에 보내기 <kbd className="rounded bg-white/20 px-1 font-mono text-xs">⌘↵</kbd>
        </button>
      </div>
    </div>
  );
}

const STEPS = ["보냄", "AI 처리 중", "반영됨"] as const;
function step(s: NoteStatus): number {
  if (s === "grace" || s === "queued") return 0;
  if (s === "sending") return 1;
  return 2;
}
const DONE_LABEL: Partial<Record<NoteStatus, string>> = {
  applied: "반영됨",
  partial: "일부 반영",
  answered: "답변",
  declined: "반영 안 함",
  conflict: "충돌",
  error: "오류",
  undone: "되돌림",
};
// 흰 글자 대비 4.5:1 이상인 바탕만
/** 접힌 한 줄의 상태 글 */
const STATUS_SHORT: Record<NoteStatus, string> = {
  grace: "보냄",
  queued: "대기",
  sending: "처리 중",
  applied: "반영됨",
  partial: "일부 반영",
  answered: "답변",
  declined: "반영 안 함",
  conflict: "충돌",
  error: "오류",
  kept: "좋음",
  undone: "되돌림",
};
const NUM_TONE: Partial<Record<NoteStatus, string>> = {
  grace: "bg-link",
  queued: "bg-link",
  sending: "bg-sending",
  applied: "bg-ok",
  partial: "bg-ok",
  answered: "bg-ai",
  declined: "bg-muted",
  conflict: "bg-warn",
  error: "bg-warn",
  undone: "bg-muted",
  kept: "bg-ok",
};
const hhmm = (t: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));

function Track({ status }: { status: NoteStatus }) {
  const at = step(status);
  const last = at === 2 ? (DONE_LABEL[status] ?? "반영됨") : STEPS[2];
  const warn = status === "conflict" || status === "error";
  return (
    <div className="flex flex-col gap-1" aria-label={`진행: ${at === 2 ? last : STEPS[at]}`}>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <i key={i} className={`h-[3px] grow rounded-full ${i <= at ? (warn && i === 2 ? "bg-warn" : "bg-accent") : "bg-line"}`} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted">
        {[STEPS[0], STEPS[1], last].map((l, i) =>
          i === at ? (
            <b key={l} className={`flex items-center gap-1 ${warn && i === 2 ? "text-warn" : "text-ink"}`}>
              {i === 1 && <LoaderCircle size={11} className="animate-spin" aria-hidden="true" />}
              {l}
            </b>
          ) : (
            <span key={l}>{l}</span>
          ),
        )}
      </div>
    </div>
  );
}

const linkBtn = "text-xs font-semibold text-link hover:underline disabled:cursor-not-allowed disabled:text-muted";

/** 여백 메모 한 장 */
function Note(props: {
  n: ReviewNote;
  num: number;
  card: LooseJson;
  expanded: boolean;
  canToggle: boolean;
  onExpand: (on: boolean) => void;
  onGoto: (path: string | null) => void;
  onHover: (on: boolean) => void;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onToggle: () => void;
}) {
  const { n } = props;
  // 메모는 늘 한 줄로 접어 둠(2026-09-28 사용자 요구) — 누르면 펼침. 보낸 지 5초 안이면 접힌 줄에서도 「취소」
  const mini = !props.expanded;
  const label = pathLabel(n.path, props.card);
  if (mini) {
    const warn = n.status === "conflict" || n.status === "error" || n.status === "partial" || n.status === "declined";
    return (
      <div onMouseEnter={() => props.onHover(true)} onMouseLeave={() => props.onHover(false)} className={`flex w-full min-w-0 items-center gap-1 rounded-bubble bg-paper px-2 py-1 text-xs shadow-[0_3px_10px_rgba(30,28,20,0.08)] hover:ring-1 hover:ring-navy/25 ${n.status === "undone" ? "opacity-70" : ""}`}>
        <button type="button" onClick={() => props.onExpand(true)} aria-expanded={false} title={`${label} · ${n.text || n.quote || ""} — 눌러 펼치기`} className="flex min-w-0 grow items-center gap-1.5 text-left">
          <span className={`flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-xs font-bold text-white ${NUM_TONE[n.status] ?? "bg-link"}`}>
            {n.status === "sending" ? <LoaderCircle size={10} className="animate-spin" aria-hidden="true" /> : props.num}
          </span>
          <span className={`flex shrink-0 items-center gap-0.5 font-semibold ${warn ? "text-warn" : n.status === "applied" || n.status === "kept" ? "text-ok" : "text-muted"}`}>
            {n.status === "kept" ? <ThumbsUp size={11} aria-hidden="true" /> : n.status === "applied" ? <Check size={11} aria-hidden="true" /> : null}
            {STATUS_SHORT[n.status]}
          </span>
          <span className={`shrink-0 rounded px-1 text-xs font-bold ${KIND_CHIP[n.kind]}`}>{KIND_LABEL[n.kind]}</span>
          <span className="min-w-0 truncate text-ink">{n.text || n.quote || label}</span>
        </button>
        {n.status === "grace" && (
          <button type="button" className="shrink-0 px-1 text-xs font-semibold text-link hover:underline" onClick={props.onCancel}>
            취소
          </button>
        )}
      </div>
    );
  }
  return (
    <div
      onMouseEnter={() => props.onHover(true)}
      onMouseLeave={() => props.onHover(false)}
      className="flex flex-col gap-1.5 rounded-bubble bg-paper px-3 py-2.5 shadow-note"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-xs font-bold text-white ${NUM_TONE[n.status] ?? "bg-link"}`}>{props.num}</span>
        <button type="button" onClick={() => props.onGoto(n.path)} title="카드에서 보기" className="min-w-0 truncate rounded-md bg-target-bg px-1.5 text-xs leading-[1.6] font-semibold text-navy">
          {label}
        </button>
        <span className={`shrink-0 rounded-md px-1.5 text-xs font-bold ${KIND_CHIP[n.kind]}`}>{KIND_LABEL[n.kind]}</span>
        <span className="ml-auto shrink-0 font-mono text-xs text-muted">{hhmm(n.at)}</span>
        <button type="button" onClick={() => props.onExpand(false)} aria-label="메모 접기" title="접기(한 줄)" className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-row-hover">
          <ChevronUp size={13} aria-hidden="true" />
        </button>
        {!["grace", "queued", "sending"].includes(n.status) && (
          <button type="button" onClick={props.onRemove} aria-label="메모 지우기" title="메모 지우기(카드는 그대로)" className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-row-hover">
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      {n.quote && <p className="line-clamp-2 rounded-[5px] bg-quote-bg px-2 py-0.5 text-xs text-quote-ink">{n.quote}</p>}
      {n.text && <p className="text-ui leading-[1.5] whitespace-pre-wrap text-ink">{n.text}</p>}
      {n.kind !== "keep" && <Track status={n.status} />}
      {n.kind === "keep" && (
        <p className="text-xs text-muted-2" title="AI가 이 부분은 바꾸지 않습니다.">
          바꾸지 않음
        </p>
      )}
      {n.reply && (
        <p className="rounded-md bg-thead px-2.5 py-1.5 text-xs leading-[1.55] whitespace-pre-wrap text-ink">
          <b className="mr-1 text-navy">AI</b>
          {n.reply}
        </p>
      )}
      {n.error && <p role="alert" className="text-xs text-warn">{n.error}</p>}
      {n.status === "conflict" || n.status === "partial" ? (
        <p className="text-xs text-warn" title={`기다리는 동안 같은 곳을 고쳐 ${n.status === "partial" ? "일부만" : "카드에"} 반영하지 않았습니다. 아래 제안을 보고 직접 옮기거나 다시 보내 주세요.`}>
          {n.status === "partial" ? "일부만 반영됨" : "충돌 — 반영 안 됨"} · 아래 제안 확인
        </p>
      ) : null}
      {n.edits && n.edits.length > 0 && (
        <ul className="flex flex-col gap-1">
          {n.edits.map((e, i) => (
            <li key={i} className="text-xs">
              <button type="button" onClick={() => props.onGoto(e.path)} className="text-link hover:underline">
                {e.label}
              </button>
              <span className="text-muted"> · {e.op === "delete" ? "줄 지움" : e.op === "insert_after" ? "뒤에 줄 넣음" : "바꿈"}</span>
              {e.op !== "delete" && (n.status === "conflict" || n.status === "partial") && <span className="mt-0.5 block whitespace-pre-wrap text-ink">{e.lines.join("\n")}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {n.status === "grace" && (
          <button type="button" className={linkBtn} onClick={props.onCancel}>
            보내기 취소
          </button>
        )}
        {(n.status === "error" || n.status === "conflict" || n.status === "declined") && n.kind !== "keep" && (
          <button type="button" className={linkBtn} onClick={props.onRetry}>
            다시 보내기
          </button>
        )}
        {props.canToggle && (n.status === "applied" || n.status === "partial" || n.status === "undone") && (
          <button type="button" className={linkBtn} onClick={props.onToggle}>
            {n.status === "undone" ? "다시 반영" : "되돌리기"}
          </button>
        )}
        <button type="button" className="text-xs text-muted hover:underline" onClick={() => props.onExpand(false)}>
          접기
        </button>
      </div>
    </div>
  );
}

const NOTE_GAP = 8;
const norm = (s: string) => s.replace(/\s+/g, "");

/** 메모가 가리키는 카드 칸: 경로의 칸이 고른 글을 담고 있으면 그 칸, 줄이 밀렸으면 고른 글이 든 칸을 찾음 */
function anchorOf(box: HTMLElement, n: { path: string | null; quote: string }): HTMLElement | null {
  if (!n.path) return null;
  const el = box.querySelector<HTMLElement>(`[data-p="${CSS.escape(n.path)}"]`);
  const q = norm(n.quote).slice(0, 16);
  if (!q || (el && norm(el.innerText).includes(q))) return el;
  const found = [...box.querySelectorAll<HTMLElement>("[data-p]")].find((x) => norm(x.innerText).includes(q));
  return found ?? el;
}

/** 여백 메모 열: 카드 칸 높이에 맞춰 세우고 겹치면 아래로, 작성 카드는 제자리 우선 */
export function NotesColumn(props: {
  box: RefObject<HTMLDivElement | null>;
  /** 카드가 다시 그려질 때마다 바뀌는 값(자리 다시 재기) */
  layoutKey: string;
  notes: ReviewNote[];
  card: LooseJson;
  composer: React.ReactNode;
  composerPath: string | null;
  canToggle: (n: ReviewNote) => boolean;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const col = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const { box, notes, composerPath } = props;

  // 카드·메모·작성 카드 크기가 바뀌면 다시 잼(글자를 칠 때마다 재지 않게)
  const hasComposer = Boolean(props.composer);
  useEffect(() => {
    const el = box.current;
    const c = col.current;
    if (!el || !c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(el);
    c.querySelectorAll("[data-note],[data-composer]").forEach((x) => ro.observe(x));
    return () => ro.disconnect();
  }, [box, notes, hasComposer]);

  useLayoutEffect(() => {
    const c = col.current;
    const b = box.current;
    if (!c || !b) return;
    const top0 = c.getBoundingClientRect().top;
    const yOf = (el: HTMLElement | null) => (el ? el.getBoundingClientRect().top - top0 - 4 : 0);
    // 표시: 메모가 걸린 칸(바뀐 것만 고침 — 입력 중인 칸을 건드리지 않게)
    const anchors = new Map<string, HTMLElement | null>();
    const want = new Set<HTMLElement>();
    for (const n of notes) {
      const a = anchorOf(b, n);
      anchors.set(n.id, a);
      if (a && n.status !== "undone") want.add(a);
    }
    b.querySelectorAll<HTMLElement>(".kc-anchor").forEach((x) => want.has(x) || x.classList.remove("kc-anchor"));
    want.forEach((x) => x.classList.contains("kc-anchor") || x.classList.add("kc-anchor"));
    const comp = c.querySelector<HTMLElement>("[data-composer]");
    let cTop: number | null = null;
    let cBot = 0;
    if (comp) {
      cTop = Math.max(0, yOf(composerPath ? b.querySelector<HTMLElement>(`[data-p="${CSS.escape(composerPath)}"]`) : null));
      comp.style.top = `${cTop}px`;
      cBot = cTop + comp.offsetHeight;
    }
    const items = [...c.querySelectorAll<HTMLElement>("[data-note]")].map((el) => ({ el, y: yOf(anchors.get(el.dataset.note!) ?? null) }));
    items.sort((x, y) => x.y - y.y);
    let prev = -1e9;
    let bottom = cBot;
    for (const it of items) {
      const h = it.el.offsetHeight;
      let y = Math.max(it.y, prev + NOTE_GAP);
      if (cTop !== null && y < cBot + NOTE_GAP && y + h > cTop - NOTE_GAP) y = cBot + NOTE_GAP;
      it.el.style.top = `${y}px`;
      prev = y + h;
      bottom = Math.max(bottom, prev);
    }
    c.style.minHeight = `${bottom + 16}px`;
  }, [notes, props.layoutKey, composerPath, hasComposer, expanded, tick, box]);

  const hover = (n: ReviewNote, on: boolean) => {
    const b = box.current;
    if (!b) return;
    b.querySelectorAll(".kc-anchor-hot").forEach((x) => x.classList.remove("kc-anchor-hot"));
    if (on) anchorOf(b, n)?.classList.add("kc-anchor-hot");
  };
  const goto = (n: ReviewNote, path: string | null) => {
    const b = box.current;
    if (!b) return;
    const el = path === n.path ? anchorOf(b, n) : path ? b.querySelector<HTMLElement>(`[data-p="${CSS.escape(path)}"]`) : null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("kc-flash");
    void el.offsetWidth;
    el.classList.add("kc-flash");
    setTimeout(() => el.classList.remove("kc-flash"), 2600);
  };

  const visible = notes;
  return (
    <div ref={col} data-review-ui role="complementary" aria-label="코멘트 메모" className="relative w-[300px] shrink-0">
      {props.composer}
      {visible.map((n, i) => (
        <div key={n.id} data-note={n.id} data-status={n.status} className="absolute right-0 left-0 transition-[top] duration-200">
          <Note
            n={n}
            num={i + 1}
            card={props.card}
            expanded={expanded.has(n.id)}
            canToggle={props.canToggle(n)}
            onExpand={(on) =>
              setExpanded((s) => {
                const next = new Set(s);
                if (on) next.add(n.id);
                else next.delete(n.id);
                return next;
              })
            }
            onGoto={(p) => goto(n, p)}
            onHover={(on) => hover(n, on)}
            onCancel={() => props.onCancel(n.id)}
            onRetry={() => props.onRetry(n.id)}
            onRemove={() => props.onRemove(n.id)}
            onToggle={() => props.onToggle(n.id)}
          />
        </div>
      ))}
    </div>
  );
}

/** 아래쪽 알림(되돌리기 단추·초읽기). 알림마다 key를 바꿔 새로 그립니다 */
export function Toast(props: { spec: ToastSpec | null; onDone: () => void }) {
  const { spec, onDone } = props;
  const [left, setLeft] = useState(spec?.countdown ?? 0);
  useEffect(() => {
    if (!spec) return;
    const ms = spec.ms ?? (spec.countdown ? spec.countdown * 1000 : 4000);
    const done = setTimeout(onDone, ms);
    const iv = spec.countdown ? setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000) : null;
    return () => {
      clearTimeout(done);
      if (iv) clearInterval(iv);
    };
  }, [spec, onDone]);
  if (!spec) return null;
  return (
    <div role="status" aria-live="polite" data-review-ui className="pointer-events-none absolute right-0 bottom-4 left-0 z-menu flex justify-center px-4">
      <div className={`pointer-events-auto flex max-w-[640px] min-w-0 items-center gap-3 rounded-bubble px-4 py-2.5 text-ui text-white shadow-[0_8px_24px_rgba(16,24,40,0.28)] ${spec.tone === "warn" ? "bg-warn" : "bg-navy"}`}>
        <span className="min-w-0">{spec.text.replace("{n}", String(left))}</span>
        {spec.action && (
          <button
            type="button"
            onClick={() => {
              // 먼저 닫고 실행(실행이 새 알림을 띄울 수 있음)
              onDone();
              spec.action!.run();
            }}
            className="shrink-0 rounded-md bg-white/15 px-2.5 py-1 text-xs font-bold hover:bg-white/25"
          >
            {spec.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
