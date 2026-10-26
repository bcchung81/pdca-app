"use client";

import { ChevronUp, LayoutTemplate, LoaderCircle, MessageCircleQuestionMark, RefreshCw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type DraftEditItem, listDraftEdits, runDraftBlockEdit, undoDraftBlockEdit } from "../../app/(app)/reports/cards/edit-actions";
import { fmtDateTime } from "../../lib/format.ts";
import type { ResultBox } from "../../lib/reports/block-edit.ts";
import { type Block, blockTexts } from "../../lib/reports/blocks.ts";
import type { ToastSpec } from "../cards/review/use-card-review";
import { Clamp } from "../ui/clamp";
import type { AskStep } from "../ui/confirm-dialog";
import { T } from "../ui/kit";
import { Markdown } from "../ui/markdown";

// 경평 초안 과제별 초안 「블록 고치기」 화면 부품(과제원장 카드 리뷰어 — components/cards/review/와 같은 쓰임새):
// 초안 판에서 글을 끌어 고르면 도구줄(「AI 수정 요청」·「질문」) → 여백 작성 카드 → 5초 뒤 서버가 그 글이 든 블록 하나를 고침(runDraftBlockEdit).
// 여러 요청은 차례로 하나씩(블록마다 AI 한 번, 약 30~60초), 성공하면 받은 version으로 다음 요청. 결과 메모는 이 브라우저 탭에(sessionStorage), 이력은 DB(수정 이력 패널).
// 추진성과 상자(2026-10-13): 종이의 data-result 상자를 대상 번호 RESULT_AT(-1)로 — 「AI 수정 요청」·「질문」만(「다른 모양」 없음), 화면 글은 「추진성과」.

/** 추진성과 상자의 대상 번호(서버 lib/reports/block-edit.ts RESULT_INDEX와 같음) */
export const RESULT_AT = -1;
/** 대상 이름(메모·작성 카드·이력): 「3번 블록」 또는 「추진성과」 */
export const targetName = (j: number) => (j === RESULT_AT ? "추진성과" : `${j + 1}번 블록`);
/** 짧은 이름(접은 메모·걸침 안내): 「3번」 또는 「추진성과」 */
const targetShort = (j: number) => (j === RESULT_AT ? "추진성과" : `${j + 1}번`);

/** 여백 메모 질문 답을 보이는 높이: 6줄 × 13px × 1.6 */
const ANSWER_CLAMP_PX = Math.round(6 * 13 * 1.6);

export type DraftNoteStatus = "grace" | "queued" | "sending" | "applied" | "unchanged" | "answered" | "error" | "conflict" | "undone";
export interface DraftNote {
  id: string;
  at: number;
  /** spec.blocks 순번(종이의 data-block) — 추진성과 상자면 RESULT_AT(종이의 data-result) */
  blockIndex: number;
  kind: "edit" | "ask";
  request: string;
  quote: string;
  status: DraftNoteStatus;
  reply?: string;
  changed?: number;
  message?: string;
  answer?: string;
  editId?: number | null;
  /** 되돌리기 실패 글(서버 메시지 그대로) */
  undoError?: string;
  undoConflict?: boolean;
}

export interface DraftComposerState {
  blockIndex: number;
  /** 고른 글이 걸친 다른 블록(안내만 — 첫 블록만 고침) */
  others: number[];
  quote: string;
  kind: "edit" | "ask";
  text: string;
}

const KEY = (uid: string) => `draft-review|${uid}`;
/** 결과 메모 보관 수(이 탭) */
const KEEP = 20;
/** 보낸 뒤 되돌릴 수 있는 시간 */
const GRACE_MS = 5_000;
/** 요청 글 상한(서버 BLOCK_EDIT_LIMITS와 같음) */
export const REQUEST_MAX = 2000;
const QUOTE_MAX = 400;
/** 고치기 요청을 비워 보내면 쓰는 글(서버는 빈 요청을 받지 않음) */
const DEFAULT_EDIT = "고른 글을 문체 기준에 맞게 다듬어 주세요(사실·수치는 그대로).";

/** 작성 카드를 쓰는 동안 고른 글을 계속 칠해 둠(CSS Custom Highlight — 없는 브라우저는 그냥 지나감) */
function markPick(range: Range | null) {
  try {
    const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    if (!reg) return;
    if (range && typeof Highlight !== "undefined") reg.set("kc-pick", new Highlight(range));
    else reg.delete("kc-pick");
  } catch {
    // 표시만 못 함
  }
}

function loadNotes(uid: string): DraftNote[] {
  try {
    const raw = sessionStorage.getItem(KEY(uid));
    const xs: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(xs)) return [];
    return xs
      .filter((n): n is DraftNote => Boolean(n) && typeof n.id === "string" && Number.isInteger(n.blockIndex) && (n.kind === "edit" || n.kind === "ask") && typeof n.status === "string")
      .map((n) =>
        // 결과를 받기 전에 화면을 떠난 요청: 보내지 않았거나(보냄·차례 기다림) 결과를 모름(고치는 중)
        n.status === "sending"
          ? { ...n, status: "error" as const, message: "결과를 받기 전에 화면을 떠났습니다 — 「수정 이력」에서 반영됐는지 확인해 주세요." }
          : n.status === "grace" || n.status === "queued"
            ? { ...n, status: "error" as const, message: "보내기 전에 화면을 떠나 보내지 않았습니다." }
            : n,
      )
      .slice(-KEEP);
  } catch {
    return [];
  }
}
function saveNotes(uid: string, notes: DraftNote[]) {
  try {
    sessionStorage.setItem(KEY(uid), JSON.stringify(notes.slice(-KEEP)));
  } catch {
    // 저장 공간이 없으면 이 화면에서만
  }
}

/** 종이에서 블록 j의 요소들(블록 하나가 여러 요소일 수 있음 — 렌더러가 맨 위 요소마다 data-block을 담). j가 RESULT_AT이면 추진성과 상자(data-result) */
export function blockEls(box: HTMLElement | null, j: number): HTMLElement[] {
  if (!box) return [];
  return [...box.querySelectorAll<HTMLElement>(j === RESULT_AT ? "[data-result]" : `[data-block="${j}"]`)];
}
/** 블록으로 옮겨 깜박임(kc-flash — 작업 공간 PAPER_MARK_CSS) */
export function flashBlock(box: HTMLElement | null, j: number, scroll = true) {
  const els = blockEls(box, j);
  if (!els.length) return;
  if (scroll) els[0].scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  for (const el of els) {
    el.classList.remove("kc-flash");
    void el.offsetWidth;
    el.classList.add("kc-flash");
    setTimeout(() => el.classList.remove("kc-flash"), 2600);
  }
}
/** 블록 강조(kc-anchor-hot) — j가 null이면 지움 */
export function hoverBlock(box: HTMLElement | null, j: number | null) {
  if (!box) return;
  box.querySelectorAll(".kc-anchor-hot").forEach((x) => x.classList.remove("kc-anchor-hot"));
  if (j !== null) blockEls(box, j).forEach((x) => x.classList.add("kc-anchor-hot"));
}

/** 「…계속할까요?」로 끝나는 확인 글에서 질문을 떼고 설명만 남김(제목은 부르는 쪽이 정함) */
export const askBody = (w: string) => w.replace(/\s*계속할까요\?$/, "");

/** 사람이 고친 블록이 있으면 다시 만들기 전에 물을 단계(덮이면 수정 이력에만 남음) — 없으면 빈 목록 */
export function overwriteSteps(humanEdits: number[]): AskStep[] {
  if (!humanEdits.length) return [];
  return [
    {
      title: "다시 만들까요?",
      body: [`사람이 고친 블록 ${humanEdits.length}개(${humanEdits.map((i) => i + 1).join("·")}번)가 있습니다. 다시 만들면 새 초안으로 덮이고 고친 내용은 수정 이력에만 남습니다.`],
      confirmLabel: "다시 만들기",
    },
  ];
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * 블록 고치기 상태: 고른 글(도구줄 자리) · 작성 카드 · 결과 메모(이 탭 sessionStorage `draft-review|<uid>`, 최근 20개) · 차례 보내기.
 * version = 초안 행 updated_at(서버가 동시 편집 확인) — 성공하면 받은 값으로 다음 요청, 충돌이면 새로 고칠 때까지 멈춤.
 */
export function useDraftReview(p: {
  uid: string;
  /** 초안 행 updated_at(블록 목록 초안일 때만 — 없으면 끔) */
  version: string | null;
  /** 도구줄을 띄울지(초안 판에서만) */
  enabled: boolean;
  /** 고치기까지(아니면 질문만) */
  canEdit: boolean;
  /** 종이 상자(블록 data-block이 든 곳) */
  paper: RefObject<HTMLDivElement | null>;
  /** 도구줄을 놓는 상자(position: relative) */
  content: RefObject<HTMLDivElement | null>;
}) {
  const { uid } = p;
  const router = useRouter();
  const [notes, setNotes] = useState<DraftNote[]>([]);
  // 불러온 뒤에만 저장(개발 모드의 효과 두 번 실행에서 빈 목록이 저장소를 덮지 않게 — 상태로 둠)
  const [loaded, setLoaded] = useState(false);
  const [pick, setPick] = useState<{ top: number; left: number; blockIndex: number; others: number[]; quote: string; range: Range } | null>(null);
  const [composer, setComposer] = useState<DraftComposerState | null>(null);
  const [toast, setToast] = useState<{ key: number; spec: ToastSpec } | null>(null);
  // 충돌이 난 version — 새로 고쳐 version이 바뀌면 다시 보냄
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  const paused = pausedAt !== null && pausedAt === p.version;
  const versionRef = useRef(p.version);
  const sending = useRef(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const flashAfter = useRef<number | null>(null);
  const pressed = useRef(false);
  const composing = useRef(false);

  useEffect(() => {
    // 이 탭에 남긴 결과 메모 — 서버 렌더에는 없는 값이라 붙은 뒤에 읽음
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotes(loadNotes(uid));
    setLoaded(true);
  }, [uid]);
  useEffect(() => {
    if (loaded) saveNotes(uid, notes);
  }, [uid, notes, loaded]);
  useEffect(() => {
    versionRef.current = p.version;
    // 고친 뒤 새로 그려진 종이에서 그 블록을 깜박임
    const j = flashAfter.current;
    if (j === null) return;
    flashAfter.current = null;
    const t = setTimeout(() => flashBlock(p.paper.current, j), 80);
    return () => clearTimeout(t);
  }, [p.version, p.paper]);
  useEffect(() => {
    const timersNow = timers.current;
    return () => timersNow.forEach((t) => clearTimeout(t));
  }, []);

  const patch = useCallback((id: string, x: Partial<DraftNote>) => setNotes((xs) => xs.map((n) => (n.id === id ? { ...n, ...x } : n))), []);

  const run = useCallback(
    async (n: DraftNote) => {
      const version = versionRef.current;
      if (!version) return;
      sending.current = true;
      patch(n.id, { status: "sending" });
      try {
        const r = await runDraftBlockEdit(uid, { blockIndex: n.blockIndex, kind: n.kind, request: n.request || DEFAULT_EDIT, quote: n.quote, version });
        if (r.ok && r.kind === "edit") {
          versionRef.current = r.version;
          patch(n.id, { status: r.changed ? "applied" : "unchanged", reply: r.reply, changed: r.changed, message: r.message, editId: r.editId });
          if (r.changed) {
            flashAfter.current = r.blockIndex;
            router.refresh();
          }
        } else if (r.ok) patch(n.id, { status: "answered", answer: r.answer });
        else if (r.conflict) {
          patch(n.id, { status: "conflict", message: r.message });
          setPausedAt(version);
        } else patch(n.id, { status: "error", message: r.message });
      } catch {
        patch(n.id, { status: "error", message: "요청이 끊겼습니다. 잠시 뒤 다시 보내 주세요." });
      } finally {
        sending.current = false;
      }
    },
    [uid, patch, router],
  );

  // 차례 보내기: 보내는 중이 아니고 멈춤이 아니면 차례를 기다리는 첫 요청
  useEffect(() => {
    if (sending.current || paused || !p.version) return;
    const next = notes.find((n) => n.status === "queued");
    if (next) void run(next);
  }, [notes, paused, p.version, run]);

  const add = (s: DraftComposerState): DraftNote => {
    const n: DraftNote = { id: newId(), at: Date.now(), blockIndex: s.blockIndex, kind: s.kind, request: s.text.trim().slice(0, REQUEST_MAX), quote: s.quote.slice(0, QUOTE_MAX), status: "grace" };
    setNotes((xs) => [...xs, n].slice(-KEEP));
    timers.current.set(
      n.id,
      setTimeout(() => {
        timers.current.delete(n.id);
        setNotes((xs) => xs.map((x) => (x.id === n.id && x.status === "grace" ? { ...x, status: "queued" } : x)));
      }, GRACE_MS),
    );
    return n;
  };
  /** 5초 안 되돌리기(보내지 않음) — 작성 카드로 다시 열 수 있게 메모를 돌려줌 */
  const cancel = (id: string): DraftNote | null => {
    const n = notes.find((x) => x.id === id);
    const t = timers.current.get(id);
    if (!n || n.status !== "grace" || !t) return null;
    clearTimeout(t);
    timers.current.delete(id);
    setNotes((xs) => xs.filter((x) => x.id !== id));
    return n;
  };
  const remove = (id: string) => setNotes((xs) => xs.filter((x) => x.id !== id));
  const retry = (id: string) => setNotes((xs) => xs.map((x) => (x.id === id ? { ...x, status: "queued", message: undefined } : x)));
  const undo = async (n: DraftNote) => {
    const version = versionRef.current;
    if (!n.editId || !version) return;
    patch(n.id, { undoError: undefined, undoConflict: undefined });
    try {
      const r = await undoDraftBlockEdit(uid, n.editId, version);
      if (r.ok && r.kind === "edit") {
        versionRef.current = r.version;
        patch(n.id, { status: "undone", message: r.message });
        flashAfter.current = r.blockIndex;
        router.refresh();
      } else if (!r.ok) patch(n.id, { undoError: r.message, undoConflict: r.conflict });
    } catch {
      patch(n.id, { undoError: "요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    }
  };

  // ── 고른 글 → 도구줄(카드 리뷰어와 같은 판정: 창의 mouseup, setTimeout 0, 한글 조합 중·클릭만이면 안 뜸)
  const { enabled, canEdit, paper, content } = p;
  const check = useCallback(() => {
    if (composing.current) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const box = paper.current;
      const wrap = content.current;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !box || !wrap) return setPick(null);
      const range = sel.getRangeAt(0);
      if (!box.contains(range.commonAncestorContainer)) return setPick(null);
      // 고른 글이 걸친 블록(차례대로) — 첫 블록 = 고른 글이 시작한 블록(블록 밖에서 시작했으면 걸친 첫 블록). 추진성과 상자(data-result)는 맨 끝 RESULT_AT
      const startEl = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>("[data-block],[data-result]");
      const hit = [...new Set([...box.querySelectorAll<HTMLElement>("[data-block]")].filter((el) => range.intersectsNode(el)).map((el) => Number(el.dataset.block)))];
      if ([...box.querySelectorAll("[data-result]")].some((el) => range.intersectsNode(el))) hit.push(RESULT_AT);
      const first = startEl && box.contains(startEl) ? (startEl.dataset.block === undefined ? RESULT_AT : Number(startEl.dataset.block)) : hit[0];
      const quote = sel.toString().replace(/\s+/g, " ").trim();
      if (first === undefined || !Number.isInteger(first) || !quote) return setPick(null);
      const r = range.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      // 도구줄 폭: 「AI 수정 요청」·「다른 모양」·「질문」(추진성과는 「다른 모양」 없음) — 읽기 전용이면 「질문」만
      const barW = !canEdit ? 80 : first === RESULT_AT ? 200 : 290;
      setPick({
        top: Math.max(0, r.top - wr.top - 44),
        left: Math.max(8, Math.min(r.left - wr.left + r.width / 2 - barW / 2, wrap.scrollWidth - barW - 8)),
        blockIndex: first,
        others: hit.filter((j) => j !== first),
        quote: quote.slice(0, QUOTE_MAX),
        range: range.cloneRange(),
      });
    });
  }, [paper, content, canEdit]);
  useEffect(() => {
    if (!enabled) return;
    const up = () => {
      if (!pressed.current) return;
      pressed.current = false;
      check();
    };
    const down = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-review-ui]")) setPick(null);
    };
    const cs = () => (composing.current = true);
    const ce = () => (composing.current = false);
    window.addEventListener("mouseup", up);
    document.addEventListener("mousedown", down);
    window.addEventListener("compositionstart", cs);
    window.addEventListener("compositionend", ce);
    return () => {
      window.removeEventListener("mouseup", up);
      document.removeEventListener("mousedown", down);
      window.removeEventListener("compositionstart", cs);
      window.removeEventListener("compositionend", ce);
    };
  }, [enabled, check]);

  const onPaperMouseDown = (e: React.MouseEvent) => {
    if (enabled && e.button === 0) pressed.current = true;
  };
  const onPick = (kind: "edit" | "ask") => {
    if (!pick) return;
    markPick(pick.range);
    window.getSelection()?.removeAllRanges();
    // 쓰던 요청 글은 새로 고른 글로 옮겨도 남김
    setComposer((c) => ({ blockIndex: pick.blockIndex, others: pick.others, quote: pick.quote, kind: canEdit ? kind : "ask", text: c?.text ?? "" }));
    setPick(null);
  };
  const closeComposer = () => {
    markPick(null);
    setComposer(null);
  };
  /** 도구줄의 「다른 모양」: 고른 블록을 돌려주고 도구줄·고른 글을 지움(모양 고르기는 오른쪽 패널 — components/reports/block-shapes.tsx) */
  const takePick = (): { blockIndex: number; quote: string } | null => {
    if (!pick) return null;
    window.getSelection()?.removeAllRanges();
    setPick(null);
    return { blockIndex: pick.blockIndex, quote: pick.quote };
  };
  /** 서버에서 이미 반영한 고치기(「다른 모양으로」 적용)를 결과 메모로 남김 — 메모의 「되돌리기」가 그대로 됨. 받은 version으로 다음 요청 */
  const record = (r: { blockIndex: number; request: string; reply: string; message: string; editId: number | null; changed: number; version: string }) => {
    versionRef.current = r.version;
    flashAfter.current = r.blockIndex;
    setNotes((xs) => [...xs, { id: newId(), at: Date.now(), blockIndex: r.blockIndex, kind: "edit" as const, request: r.request, quote: "", status: "applied" as const, reply: r.reply, changed: r.changed, message: r.message, editId: r.editId }].slice(-KEEP));
    router.refresh();
  };
  const say = (spec: ToastSpec) => setToast({ key: Date.now(), spec });
  const clearToast = useCallback(() => setToast(null), []);
  const sendComposer = () => {
    if (!composer) return;
    if (composer.kind === "ask" && !composer.text.trim()) return;
    const n = add(composer);
    const back = composer;
    closeComposer();
    say({
      text: "보냈습니다 · {n}초 뒤 AI에 넘어갑니다",
      countdown: 5,
      action: {
        label: "되돌리기(보내지 않음)",
        run: () => {
          if (cancel(n.id)) setComposer(back);
          else say({ text: "이미 AI에 넘어가 되돌릴 수 없습니다.", tone: "warn" });
        },
      },
    });
  };
  // 판이 바뀌거나 끄면 도구줄·작성 카드를 닫음(작성 카드 글은 버림)
  const [seenEnabled, setSeenEnabled] = useState(enabled);
  if (seenEnabled !== enabled) {
    setSeenEnabled(enabled);
    if (!enabled) {
      setPick(null);
      setComposer(null);
    }
  }
  useEffect(() => {
    if (!enabled) markPick(null);
  }, [enabled]);

  return {
    notes,
    pick,
    composer,
    setComposer,
    toast,
    clearToast,
    paused,
    onPaperMouseDown,
    onPick,
    takePick,
    record,
    closeComposer,
    sendComposer,
    cancel,
    remove,
    retry,
    undo,
    refresh: () => router.refresh(),
  };
}
export type DraftReview = ReturnType<typeof useDraftReview>;

const pickBtn = "flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-semibold whitespace-nowrap text-white hover:bg-white/15";

/** 끌어 고른 글 위에 뜨는 도구줄(「AI 수정 요청」·「다른 모양」·「질문」 — 읽기 전용이면 「질문」만) */
export function DraftSelectionBar(props: { top: number; left: number; canEdit: boolean; onPick: (k: "edit" | "ask") => void; /** 「다른 모양」(고칠 수 있을 때만) — 같은 내용을 다른 모양 2~3안으로 미리보기 */ onShape?: () => void }) {
  return (
    <div
      role="toolbar"
      aria-label="고른 글"
      data-review-ui
      // 단추를 눌러도 고른 글이 풀리지 않게
      onMouseDown={(e) => e.preventDefault()}
      style={{ top: props.top, left: props.left }}
      className="absolute z-bar flex items-center gap-0.5 rounded-[10px] bg-navy p-[3px] shadow-[0_6px_16px_rgba(16,24,40,0.28)]"
    >
      {props.canEdit && (
        <button type="button" className={pickBtn} onClick={() => props.onPick("edit")} title="고른 글이 든 블록을 어떻게 고칠지 적으면 AI가 그 블록을 다시 씁니다">
          <Sparkles size={14} aria-hidden="true" />
          AI 수정 요청
        </button>
      )}
      {props.canEdit && props.onShape && (
        <button type="button" className={pickBtn} onClick={props.onShape} title="고른 글이 든 블록의 같은 내용을 다른 모양(도식) 2~3안으로 미리 보고 골라 바꿉니다">
          <LayoutTemplate size={14} aria-hidden="true" />
          다른 모양
        </button>
      )}
      <button type="button" className={pickBtn} onClick={() => props.onPick("ask")} title="고른 글에 대해 AI에 묻습니다(초안은 그대로)">
        <MessageCircleQuestionMark size={14} aria-hidden="true" />
        질문
      </button>
    </div>
  );
}

const PLACEHOLDER = {
  edit: "어떻게 고칠지 적어 주세요 — 비워 두면 문체 기준에 맞게 다듬습니다",
  ask: "궁금한 점을 적어 주세요",
} as const;

/** 여백의 작성 카드(과제원장 코멘트 작성 카드와 같은 모양) — data-composer·data-at(블록 순번)으로 여백 열이 그 블록 높이에 세움 */
export function DraftComposer(props: { state: DraftComposerState; canEdit: boolean; onChange: (s: DraftComposerState) => void; onSend: () => void; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { state } = props;
  useEffect(() => {
    ref.current?.focus();
  }, [state.blockIndex, state.quote]);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(220, t.scrollHeight + 2)}px`;
  }, [state.text]);
  const canSend = state.kind === "edit" || state.text.trim().length > 0;
  return (
    <div
      role="dialog"
      aria-label="블록 고치기 요청"
      data-review-ui
      data-composer
      data-at={state.blockIndex}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          props.onClose();
        }
      }}
      className="absolute right-0 left-0 z-pop flex flex-col gap-2.5 rounded-[14px] border-[1.5px] border-accent bg-paper p-3.5 shadow-[0_10px_28px_rgba(30,28,20,0.14)]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate rounded-md bg-target-bg px-1.5 text-xs leading-[1.6] font-semibold text-navy">{targetName(state.blockIndex)}</span>
        <button type="button" onClick={props.onClose} aria-label="닫기 (Esc)" title="닫기 (Esc)" className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-row-hover">
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {state.quote && <p className="line-clamp-2 rounded-[5px] bg-quote-bg px-2 py-0.5 text-xs break-keep text-quote-ink">{state.quote}</p>}
      {state.others.length > 0 && (
        <p
          className="truncate text-xs leading-[1.5] text-warn"
          title={`고른 글이 ${[state.blockIndex, ...state.others].map(targetShort).join("·")}에 걸쳐 있습니다 — ${targetName(state.blockIndex)}만 고칩니다.`}
        >
          여러 블록에 걸침 — {targetShort(state.blockIndex)}만 고침
        </p>
      )}
      <div role="radiogroup" aria-label="요청 종류" className="flex gap-1.5">
        {(props.canEdit ? (["edit", "ask"] as const) : (["ask"] as const)).map((k) => (
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
        maxLength={REQUEST_MAX}
        onChange={(e) => props.onChange({ ...state, text: e.target.value })}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) props.onSend();
          }
        }}
        rows={3}
        placeholder={PLACEHOLDER[state.kind]}
        aria-label="요청 내용"
        className="min-h-[68px] w-full resize-none rounded-[10px] bg-field px-3 py-2 text-ui leading-[1.55] text-ink outline-none focus:shadow-focus"
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 text-xs leading-4 break-keep text-muted">5초 안 되돌리기</span>
        <button type="button" disabled={!canSend} onClick={props.onSend} className={`ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-navy bg-navy px-3 text-xs font-bold whitespace-nowrap text-white ${T.off}`}>
          AI에 보내기 <kbd className="rounded bg-white/20 px-1 font-mono text-xs">⌘↵</kbd>
        </button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<DraftNoteStatus, string> = {
  grace: "보냄",
  queued: "차례 기다림",
  sending: "고치는 중",
  applied: "반영됨",
  unchanged: "바꾼 곳 없음",
  answered: "답변",
  error: "실패",
  conflict: "충돌",
  undone: "되돌림",
};
// 흰 글자 대비 4.5:1 이상인 바탕만(과제원장 메모와 같은 색)
const STATUS_TONE: Record<DraftNoteStatus, string> = {
  grace: "bg-link",
  queued: "bg-link",
  sending: "bg-sending",
  applied: "bg-ok",
  unchanged: "bg-muted",
  answered: "bg-ai",
  error: "bg-warn",
  conflict: "bg-warn",
  undone: "bg-muted",
};
const hhmm = (t: number) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t));
const linkBtn = "text-xs font-semibold text-link hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline";

/** 결과 메모 한 장 — data-rnote·data-at(블록 순번)으로 여백 열이 그 블록 높이에 세움. 누르면 그 블록으로 */
export function DraftReviewNote(props: { n: DraftNote; paused: boolean; /** 제출·승인된 보고서의 과제(부서 잠금)면 false — 되돌리기를 숨김(질문은 이 메모와 무관하게 늘 남음) */ canEdit: boolean; onGoto: () => void; onHover: (on: boolean) => void; onCancel: () => void; onUndo: () => void; onRetry: () => void; onRemove: () => void; onRefresh: () => void }) {
  const { n } = props;
  const done = !["grace", "queued", "sending"].includes(n.status);
  // 늘 한 줄로 접어 둠(2026-09-28 사용자 요구 — 구성안 여백 메모와 같이) — 누르면 펼침. 보낸 지 5초 안이면 접힌 줄에서도 「취소」
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <div data-rnote={n.id} data-at={n.blockIndex} data-review-ui className="absolute right-0 left-0 transition-[top] duration-200" onMouseEnter={() => props.onHover(true)} onMouseLeave={() => props.onHover(false)}>
        <div className="flex min-w-0 items-center gap-1 rounded-bubble bg-paper px-2 py-1 text-xs shadow-[0_3px_10px_rgba(30,28,20,0.08)] hover:ring-1 hover:ring-navy/25">
          <button type="button" onClick={() => setOpen(true)} aria-expanded={false} title={`${targetName(n.blockIndex)} · ${n.request || n.quote || ""} — 눌러 펼치기`} className="flex min-w-0 grow items-center gap-1.5 text-left">
            <span className={`flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-xs font-bold text-white ${STATUS_TONE[n.status]}`}>
              {n.status === "sending" && <LoaderCircle size={10} className="mr-0.5 animate-spin" aria-hidden="true" />}
              {STATUS_LABEL[n.status]}
            </span>
            <span className="shrink-0 font-semibold text-navy">{targetShort(n.blockIndex)}</span>
            <span className={`shrink-0 rounded px-1 text-xs font-bold ${n.kind === "ask" ? "bg-ai-bg text-ai" : "bg-revise-bg text-link"}`}>{n.kind === "ask" ? "질문" : n.request.startsWith(SHAPE_REQUEST) ? "모양" : "수정"}</span>
            <span className="min-w-0 truncate text-ink">{n.request || n.quote}</span>
          </button>
          {n.status === "grace" && (
            <button type="button" className="shrink-0 px-1 text-xs font-semibold text-link hover:underline" onClick={props.onCancel}>
              취소
            </button>
          )}
        </div>
      </div>
    );
  return (
    <div data-rnote={n.id} data-at={n.blockIndex} data-review-ui className="absolute right-0 left-0 transition-[top] duration-200" onMouseEnter={() => props.onHover(true)} onMouseLeave={() => props.onHover(false)}>
      <div className="flex flex-col gap-1.5 rounded-bubble bg-paper px-3 py-2.5 shadow-note">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-xs font-bold text-white ${STATUS_TONE[n.status]}`}>
            {n.status === "sending" && <LoaderCircle size={10} className="mr-0.5 animate-spin" aria-hidden="true" />}
            {STATUS_LABEL[n.status]}
          </span>
          <button type="button" onClick={props.onGoto} title="종이에서 보기" className="min-w-0 truncate rounded-md bg-target-bg px-1.5 text-xs leading-[1.6] font-semibold text-navy">
            {targetName(n.blockIndex)}
          </button>
          <span className={`shrink-0 rounded-md px-1.5 text-xs font-bold ${n.kind === "ask" ? "bg-ai-bg text-ai" : "bg-revise-bg text-link"}`}>{n.kind === "ask" ? "질문" : n.request.startsWith(SHAPE_REQUEST) ? "모양" : "수정"}</span>
          <span className="ml-auto shrink-0 font-mono text-xs text-muted">{hhmm(n.at)}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="메모 접기" title="접기(한 줄)" className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-row-hover">
            <ChevronUp size={13} aria-hidden="true" />
          </button>
          {done && (
            <button type="button" onClick={props.onRemove} aria-label="메모 지우기" title="메모 지우기(초안·수정 이력은 그대로)" className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-row-hover">
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>
        {n.quote && <p className="line-clamp-2 rounded-[5px] bg-quote-bg px-2 py-0.5 text-xs break-keep text-quote-ink">{n.quote}</p>}
        {n.request && <p className="text-ui leading-[1.5] break-keep whitespace-pre-wrap text-ink">{n.request}</p>}
        {n.status === "sending" && <p className="text-xs text-muted-2">{n.kind === "ask" ? "답을 쓰는 중…" : n.blockIndex === RESULT_AT ? "추진성과를 고치는 중…" : "블록을 고치는 중…"} 보통 30~60초</p>}
        {n.status === "queued" && <p className="text-xs text-muted-2">{props.paused ? "충돌을 풀면(새로 고침) 보냅니다" : "앞 요청이 끝나면 보냅니다"}</p>}
        {(n.status === "applied" || n.status === "unchanged" || n.status === "undone") && (
          <>
            {n.reply && (
              <p className="rounded-md bg-thead px-2.5 py-1.5 text-xs leading-[1.55] break-keep whitespace-pre-wrap text-ink">
                <b className="mr-1 text-navy">AI</b>
                {n.reply}
              </p>
            )}
            {n.message && <p className="text-xs break-keep text-muted-2">{n.message}</p>}
          </>
        )}
        {n.status === "answered" && n.answer && (
          // 좁은 여백 열이라 답은 6줄(13px × 1.6)까지 — 넘치면 「전체 보기」(2026-09-29 사용자 결정)
          <div className="rounded-md bg-thead px-2.5 py-1.5">
            <Clamp maxPx={ANSWER_CLAMP_PX}>
              <Markdown text={n.answer} size="sm" />
            </Clamp>
          </div>
        )}
        {(n.status === "error" || n.status === "conflict") && n.message && <p className="text-xs break-keep text-warn">{n.message}</p>}
        {n.undoError && <p className="text-xs break-keep text-warn">{n.undoError}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {n.status === "grace" && (
            <button type="button" className={linkBtn} onClick={props.onCancel}>
              보내기 취소
            </button>
          )}
          {props.canEdit && n.status === "applied" && n.editId && (
            <button type="button" className={linkBtn} onClick={props.onUndo} title={n.blockIndex === RESULT_AT ? "고치기 전 추진성과로(그 뒤 추진성과가 또 바뀌었으면 안 됨)" : "고치기 전 블록으로(그 뒤 이 블록이 또 바뀌었으면 안 됨)"}>
              되돌리기
            </button>
          )}
          {(n.status === "conflict" || n.undoConflict) && (
            <button type="button" className={`${linkBtn} flex items-center gap-1`} onClick={props.onRefresh}>
              <RefreshCw size={11} aria-hidden="true" />
              새로 고침
            </button>
          )}
          {n.status === "error" && (
            <button type="button" className={linkBtn} onClick={props.onRetry}>
              다시 보내기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 「다른 모양으로」 적용 이력의 요청 글 머리(서버 applyBlockShape와 같은 글) */
const SHAPE_REQUEST = "모양 바꾸기";

/** 블록 글 줄(전후 비교) — 추진성과 이력이면 추진성과 줄 + 강조 띠 */
const lines = (b: Block | ResultBox | null | undefined) => (!b ? [] : "kind" in b ? blockTexts(b) : [...(b.results ?? []), b.resultBand].filter(Boolean));

/** 오른쪽 자리의 「수정 이력」 패널(과제원장 수정 이력처럼 머리 시계 단추로 바꿔 열고 ✕·Esc로 탭에 돌아감): 블록 고치기·되돌리기 이력(DB, 최근 50건) */
export function DraftHistory(props: { uid: string; version: string | null; onClose: () => void; onGoto: (blockIndex: number) => void }) {
  const [state, setState] = useState<{ loading: boolean; items: DraftEditItem[]; error: string | null }>({ loading: true, items: [], error: null });
  useEffect(() => {
    let alive = true;
    listDraftEdits(props.uid)
      .then((items) => alive && setState({ loading: false, items, error: null }))
      .catch(() => alive && setState({ loading: false, items: [], error: "수정 이력을 읽지 못했습니다." }));
    return () => {
      alive = false;
    };
  }, [props.uid, props.version]);
  return (
    <section aria-label="수정 이력" className="flex min-h-0 grow flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-5">
        <h3 className="min-w-0 truncate text-sm font-bold text-navy" title="블록 고치기·되돌리기 이력 — 다시 만들어 덮인 초안의 고친 내용도 여기 남음">
          수정 이력 {state.items.length ? state.items.length : ""}
        </h3>
        <button type="button" onClick={props.onClose} aria-label="수정 이력 닫기" title="닫고 탭으로 (Esc)" className="flex size-7 shrink-0 items-center justify-center rounded-md border border-field-line text-muted hover:border-navy">
          ✕
        </button>
      </div>
      <div className="min-h-0 grow overflow-y-auto px-5 py-4">
        {state.loading ? (
          <p className="py-6 text-center text-ui text-muted">불러오는 중…</p>
        ) : state.error ? (
          <p role="alert" className="py-6 text-center text-ui text-error">
            {state.error}
          </p>
        ) : state.items.length === 0 ? (
          <p className="py-6 text-center text-ui text-muted" title="초안에서 글을 끌어 고르면 「AI 수정 요청」으로 블록을 고칩니다.">
            아직 없습니다
          </p>
        ) : (
          <ol className="flex min-w-0 flex-col gap-3">
            {state.items.map((e) => {
              const before = lines(e.before);
              const after = lines(e.after);
              return (
                <li key={e.id} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5 text-ui leading-6">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <button type="button" onClick={() => props.onGoto(e.blockIndex)} title="종이에서 보기" className="rounded-md bg-target-bg px-1.5 text-xs leading-[1.6] font-semibold text-navy">
                      {targetName(e.blockIndex)}
                    </button>
                    <span className={`rounded-md px-1.5 text-xs font-bold ${e.kind === "undo" ? "bg-thead text-muted-2" : "bg-revise-bg text-link"}`}>{e.kind === "undo" ? "되돌림" : e.request.startsWith(SHAPE_REQUEST) ? "모양" : "수정"}</span>
                    <span className="min-w-0 truncate text-xs text-muted" title={`${e.who} · ${fmtDateTime(e.at)}`}>
                      {e.who} · {fmtDateTime(e.at)}
                    </span>
                  </div>
                  {e.quote && <p className="line-clamp-2 rounded-[5px] bg-quote-bg px-2 py-0.5 text-xs break-keep text-quote-ink">{e.quote}</p>}
                  {e.request && (
                    <p className="break-keep whitespace-pre-wrap text-ink">
                      <b className="mr-1 text-xs text-muted">요청</b>
                      {e.request}
                    </p>
                  )}
                  {e.reply && (
                    <p className="rounded-md bg-thead px-2.5 py-1.5 text-xs leading-[1.55] break-keep whitespace-pre-wrap text-ink">
                      <b className="mr-1 text-navy">AI</b>
                      {e.reply}
                    </p>
                  )}
                  <details className="min-w-0">
                    <summary className="cursor-pointer text-xs font-semibold text-muted">전후 보기</summary>
                    <div className="mt-1.5 grid min-w-0 gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-muted">고치기 전</p>
                        <ul className="flex min-w-0 flex-col gap-0.5 text-xs break-keep [overflow-wrap:anywhere]">
                          {before.map((t, i) => (
                            <li key={i} className={after.includes(t) ? "text-muted-2" : "text-muted line-through decoration-muted/60"}>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-muted">고친 뒤</p>
                        <ul className="flex min-w-0 flex-col gap-0.5 text-xs break-keep [overflow-wrap:anywhere]">
                          {after.map((t, i) => (
                            <li key={i} className={before.includes(t) ? "text-muted-2" : "rounded-sm bg-ok-bg px-1 text-ink"}>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
