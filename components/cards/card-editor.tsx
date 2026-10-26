"use client";

import { Plus, Save } from "lucide-react";
import { type Ref, useActionState, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type SaveState, saveCard } from "../../app/(app)/cards/actions";
import { type PairKey, type SuggestionLike, addMonthly, applySuggestion, applyText, deleteLine, deletePairRow, insertLineAfter, insertPairRow, toggleBox } from "../../lib/cards/edit.ts";
import { canonicalJson, fixedLabelOf } from "../../lib/cards/fixed.ts";
import { isMgmtCard } from "../../lib/cards/mgmt-card.ts";
import { rewriteCardImages } from "../../lib/cards/original-html.ts";
import { CARD_LAYOUT_CSS, renderLayoutCard, renderLayoutPages } from "../../lib/cards/layout-render.ts";
import { renderCard } from "../../lib/cards/render.ts";
import { fitHwpText } from "../../lib/hwp/fit.ts";
import type { CardLayout } from "../../lib/hwp/layout.ts";
import { useFitZoom } from "../workspace/use-fit-zoom.ts";
import { ZoomControl } from "../workspace/zoom-control";
import { PAIR_LABEL, PairRowTools } from "./pair-row-tools";
import { type ComposerState, type PickKind, Composer, NotesColumn, SelectionBar, Toast } from "./review/review-ui";
import { type ReviewTarget, type ToastSpec, useCardReview } from "./review/use-card-review";
import type { LooseJson } from "../../lib/loose-json.ts";
import { PICK_HIGHLIGHT_CSS } from "./pick-highlight.ts";
import { T } from "../ui/kit";


export interface CardEditorHandle {
  /** 남은 변경을 지금 저장(닫기·다른 카드로 이동 전) */
  flush(): Promise<boolean>;
  /** AI 제안 반영 */
  apply(s: SuggestionLike): void;
  /** 마지막으로 고른 칸 */
  selection(): { path: string; text: string } | null;
  /** 바깥에서 내용이 바뀜(작성본 확정 등) — 저장하지 않고 새 내용·원장 개정 번호로 */
  reset(data: LooseJson, rev?: number, opts?: { versionId?: number | null; label?: string }): void;
  /** 지금 편집기의 카드 JSON(AI 작성지원 기준) */
  current(): LooseJson;
  /** AI가 코멘트를 처리 중이거나 보낼 코멘트가 있음(닫으면 결과를 못 받음) */
  busy(): boolean;
}

/** 카드 쪽 좌우 여백(px-6 두 번, wrapRef) */
const CARD_PAD_PX = 48;
/** 여백 메모 열 폭 + 카드와의 간격(gap-5) */
const CARD_NOTES_PX = 300 + 20;
const CARD_ZOOM_KEY = "card-zoom";
const CARD_FIT_ZOOM = { min: 0.6, max: 1.1 } as const;
const CARD_HAND_ZOOM = { min: 0.6, max: 1.1, step: 0.1 } as const;

const BULLET = /^([∙•▪◦●■\-–－※*→⇒☞▶▷➜➛⇨✔✓·‧･・]\s*)/;
const bulletOf = (text: string) => {
  const m = BULLET.exec(text);
  return m ? m[1].trimEnd() + " " : "";
};
const isMultiline = (path: string) => /^kpi\.rows\.\d+\.\w+$/.test(path) || path === "strategy.ai.text";
const AUTOSAVE_MS = 1500;
/** 자동 저장 켜기·끄기 — 이 브라우저에 기억(기본 켜짐). 서버 그림은 켜짐으로(첫 그림이 어긋나지 않게) */
const AUTOSAVE_KEY = "card-autosave";
const AUTOSAVE_EVENT = "card-autosave-change";
const autosaveStore = {
  subscribe(on: () => void) {
    window.addEventListener(AUTOSAVE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(AUTOSAVE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  },
  get(): boolean {
    try {
      return window.localStorage.getItem(AUTOSAVE_KEY) !== "0";
    } catch {
      return true;
    }
  },
  set(on: boolean) {
    try {
      window.localStorage.setItem(AUTOSAVE_KEY, on ? "1" : "0");
    } catch {
      // 기억하지 못하면 이 화면에서만
    }
    window.dispatchEvent(new Event(AUTOSAVE_EVENT));
  },
};

/** 카드 칸 글의 개수(다시 그린 뒤 새로 생긴 글만 노랗게 표시하려고) */
function textCounts(box: HTMLElement | null): Map<string, number> {
  const m = new Map<string, number>();
  box?.querySelectorAll<HTMLElement>("[data-p]").forEach((el) => {
    const t = el.innerText.trim();
    if (t) m.set(t, (m.get(t) ?? 0) + 1);
  });
  return m;
}

/** 코멘트를 쓰는 동안 고른 글을 계속 칠해 둠(CSS Custom Highlight — 없는 브라우저는 그냥 지나감) */
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

/** 화면 좌표의 글자 자리(커서 위치) */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) return { node: p.offsetNode, offset: p.offset };
  const r = document.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

function caretToEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

const hhmm = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/**
 * 원본 양식 위 편집기. 성과관리팀·관리자는 글을 눌러 바로 고치고(자동 저장), 부서 담당자는 읽기 전용으로 칸만 고릅니다.
 * 글자를 치는 동안에는 다시 그리지 않고(한글 입력 보호) JSON만 갱신합니다.
 */
export function CardEditor(props: {
  ref?: Ref<CardEditorHandle>;
  uid: string;
  initial: LooseJson;
  imageUrls: Record<string, string>;
  /** 원본 배치(한글 파일에서 뗀 카드 표). 있으면 원본 그대로 그리고, 없거나 못 맞추면 원본 양식 렌더러 */
  layout?: CardLayout | null;
  /** 과제 속성(PDCA 단계·진도율·상태) — 도구줄 편집 칩은 없앴지만 저장할 때 원장 값을 그대로 실어 보냄(안 넘기면 기본값) */
  readOnly: boolean;
  /** 부서 화면 보기(성과관리팀·관리자가 다른 사람 화면을 미리보기) — 드래그 도구줄(「질문」 포함)을 아예 띄우지 않음(보내면 미리보기 중인 사람 이름으로 AI 호출이 됨) */
  preview?: boolean;
  defaultPeriod: string;
  onSaved?: () => void;
  onSelect?: (sel: { path: string; text: string }) => void;
  /** 저장 대상: 원장(기본, 성과관리팀) 또는 이달 작성본(부서 담당자) */
  saveAction?: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  variant?: "ledger" | "draft";
  /** 잠근 경로 앞부분(확정된 고정 영역) — 고를 수는 있고 고칠 수는 없음 */
  locked?: string[];
  /** 작성본을 새로 시작할 때의 원장(확정 때 부서가 바꾼 구역만 반영하는 기준) */
  base?: LooseJson;
  /** 불러온 열린 작성본 번호(없으면 null) — 그사이 바뀌면 서버가 저장을 거절 */
  versionId?: number | null;
  /** 불러온 원장 개정 번호 — 그사이 원장이 바뀌면 서버가 저장을 거절 */
  rev?: number;
  /** 메타 막대 안에 더 둘 조작(고정 영역 확정 등) */
  metaSlot?: React.ReactNode;
  /** 오른쪽 패널 구분선을 끄는 중 — 그동안 카드 쪽 배율 재계산을 멈춤(useFitZoom paused) */
  zoomPaused?: boolean;
}) {
  const [card, setCard] = useState(props.initial);
  const cardRef = useRef(props.initial);
  // 과제 속성(PDCA 단계·진도율·상태)은 화면에서 뺐음(2026-09-28) — 저장 때 보내지 않아 서버가 원장 stage·progress·work_status를 그대로 둠
  const [period, setPeriod] = useState(props.defaultPeriod);
  const [status, setStatus] = useState<{ kind: "idle" | "dirty" | "saving" | "saved" | "error"; text: string }>({ kind: "idle", text: "" });
  const seq = useRef(0);
  const savedSeq = useRef(0);
  const saving = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  const lastSel = useRef<{ path: string; text: string } | null>(null);
  const payloadRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const flashPrev = useRef<Map<string, number> | null>(null);
  const [pick, setPick] = useState<null | { top: number; left: number; target: ReviewTarget; range: Range; canDelete: boolean }>(null);
  const [lockNote, setLockNote] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [toast, setToastState] = useState<{ spec: ToastSpec; key: number } | null>(null);
  const toastSeq = useRef(0);
  const setToast = useCallback((spec: ToastSpec | null) => setToastState(spec ? { spec, key: ++toastSeq.current } : null), []);
  const clearToast = useCallback(() => setToastState(null), []);
  const reviewMode = props.readOnly ? "ask" : "edit";
  const action = props.saveAction ?? saveCard;
  const actionRef = useRef(action);
  useLayoutEffect(() => {
    actionRef.current = action;
  }, [action]);
  const [formState, formAction, formPending] = useActionState<SaveState, FormData>(action, { status: "idle" });
  const urls = useMemo(() => new Map(Object.entries(props.imageUrls)), [props.imageUrls]);
  // 잠금은 글자 키로 비교(서버가 새로 그려 배열이 바뀌어도 입력 중인 칸을 다시 그리지 않게)
  const lockedKey = (props.locked ?? []).join(",");
  const { layout } = props;
  const { html, exact } = useMemo(() => {
    const opts = props.readOnly ? { selectable: true } : { editable: true, locked: lockedKey ? lockedKey.split(",") : undefined };
    // 원본 배치가 있으면 원본 그대로(글이 바뀐 곳만 같은 모양으로 흘려 그림), 없거나 못 맞추면 원본 양식 렌더러
    if (layout) {
      try {
        const out = renderLayoutCard(card, layout, { ...opts, imageUrl: (key) => urls.get(`hwp:${key}`) ?? null });
        if (out) return { html: rewriteCardImages(out, urls), exact: true };
      } catch (e) {
        console.error("원본 배치로 그리지 못함", e);
      }
    }
    return { html: rewriteCardImages(renderCard(card, opts), urls), exact: false };
  }, [card, urls, props.readOnly, lockedKey, layout]);
  // 쪽 보기(인쇄 모양, 읽기 전용): 한글이 쪽을 나누는 규칙대로 — 원본 배치가 있을 때만
  const [view, setView] = useState<"flow" | "pages">("flow");
  const pagesRef = useRef<HTMLDivElement>(null);
  const pagesView = useMemo(() => {
    if (view !== "pages" || !layout) return null;
    try {
      const out = renderLayoutPages(card, layout, { imageUrl: (key) => urls.get(`hwp:${key}`) ?? null });
      return out ? rewriteCardImages(out, urls) : null;
    } catch (e) {
      console.error("쪽 보기로 그리지 못함", e);
      return null;
    }
  }, [view, card, layout, urls]);
  const showPages = exact && view === "pages" && Boolean(pagesView);
  // 원본 배치: 끌어 고르기를 직접 처리 — 줄 칸(inline-block)·글자 간격으로 맞춘 원본 줄에서는 브라우저의 끌어 고르기가 줄마다 들쭉날쭉하게 멈춤.
  // 누른 자리에서 지금 포인터 자리까지 고름(한 번 누르기만, 두 번 누르기·Shift·보조 키는 브라우저 그대로)
  const dragFrom = useRef<{ node: Node; offset: number } | null>(null);
  useEffect(() => {
    if (!exact) return;
    const move = (e: MouseEvent) => {
      const from = dragFrom.current;
      const box = boxRef.current;
      if (!from || !box || !(e.buttons & 1)) return;
      const to = caretAt(e.clientX, e.clientY);
      if (!to || !box.contains(to.node)) return;
      window.getSelection()?.setBaseAndExtent(from.node, from.offset, to.node, to.offset);
    };
    const up = () => (dragFrom.current = null);
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mouseup", up, true);
    return () => {
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mouseup", up, true);
    };
  }, [exact]);
  const { onSaved, uid } = props;

  const baseRef = useRef(props.base);
  const versionRef = useRef<number | null>(props.versionId ?? null);
  const revRef = useRef<number | undefined>(props.rev);
  const payload = () =>
    JSON.stringify({
      data: cardRef.current,
      base: versionRef.current === null ? baseRef.current : undefined,
      versionId: versionRef.current,
      rev: revRef.current,
    });
  // 저장 결과의 번호로 다음 저장 기준을 옮김
  const track = useCallback((res: SaveState) => {
    if (res.status !== "ok") return;
    // 작성본이 새로 생겼으면 그 번호로 바꾸고, 같은 대상이면 번호는 앞으로만(늦게 온 옛 결과가 되돌리지 않게)
    const switched = res.versionId !== undefined && res.versionId !== versionRef.current;
    if (res.versionId !== undefined) versionRef.current = res.versionId;
    if (res.rev !== undefined) revRef.current = switched || revRef.current === undefined ? res.rev : Math.max(revRef.current, res.rev);
  }, []);
  useEffect(() => track(formState), [formState, track]);

  /** force: 「저장」 단추 — 바뀐 것이 없어도 서버에 저장을 확인하고 시각을 보임(예전에는 아무 일도 없어 누른 반응이 없었음) */
  const save = useCallback(async (force = false): Promise<boolean> => {
    if (saving.current) await saving.current;
    if (!force && savedSeq.current === seq.current) return true;
    const mySeq = seq.current;
    const fd = new FormData();
    fd.set("uid", uid);
    fd.set("payload", payload());
    setStatus({ kind: "saving", text: "저장 중…" });
    const p = actionRef.current({ status: "idle" }, fd).then((res) => {
      track(res);
      if (res.status === "ok") {
        savedSeq.current = Math.max(savedSeq.current, mySeq);
        setStatus(savedSeq.current === seq.current ? { kind: "saved", text: `저장됨 ${hhmm(res.at)}` } : { kind: "dirty", text: "변경됨" });
        onSaved?.();
        return true;
      }
      setStatus({ kind: "error", text: res.status === "error" ? res.message : "저장하지 못했습니다" });
      return false;
    });
    saving.current = p.finally(() => (saving.current = null));
    const ok = await p;
    if (ok && savedSeq.current !== seq.current) schedule();
    return ok;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, onSaved]);

  // 자동 저장(고친 뒤 1.5초). 끄면 고치는 동안에는 저장하지 않고 「저장」 단추·닫기·다른 카드로 옮길 때 저장
  const autosave = useSyncExternalStore(autosaveStore.subscribe, autosaveStore.get, () => true);
  const autosaveRef = useRef(autosave);
  useEffect(() => {
    autosaveRef.current = autosave;
  }, [autosave]);
  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!autosaveRef.current) return;
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
  };
  const changed = () => {
    seq.current += 1;
    setStatus({ kind: "dirty", text: autosaveRef.current ? "변경됨" : "변경됨 · 저장 안 함" });
    schedule();
  };
  const toggleAutosave = () => {
    const on = !autosave;
    autosaveStore.set(on);
    autosaveRef.current = on;
    if (!on) {
      if (timer.current) clearTimeout(timer.current);
      if (savedSeq.current !== seq.current) setStatus({ kind: "dirty", text: "변경됨 · 저장 안 함" });
    } else if (savedSeq.current !== seq.current) schedule();
  };

  // 리뷰어 코멘트: AI 편집을 합친 카드를 넣고, 다시 그린 뒤 새로 생긴 글을 노랗게
  const review = useCardReview({
    uid,
    readOnly: props.readOnly,
    locked: props.locked,
    getCard: () => cardRef.current,
    applyCard: (next) => {
      flashPrev.current = textCounts(boxRef.current);
      restructure(next, null);
    },
    toast: setToast,
  });
  // 여백 메모 열(드래그 「AI 수정 요청」 작성 카드·코멘트 메모)이 보이는지 — 카드 쪽 배율(useFitZoom)이 그 폭만큼 빼고 셈(경평 초안과 같은 방식,
  // 예전에는 이 값을 옆 창(card-workspace)에 올려 보내 옆 창 폭 자체를 늘리는 특수 처리를 했음)
  const wide = Boolean(composer) || review.notes.length > 0;
  // 카드 쪽 배율: 남는 폭에 맞춰 CSS zoom(카드마다 원본 폭이 달라 배율 1일 때 폭을 재서 씀 — docRef)
  const docRef = useRef<HTMLDivElement>(null);
  // 카드 배율 한도 1.1(2026-09-28 실측): 1.2배부터 크롬의 소수 픽셀 반올림으로 흘려 그린 문단(AX 붙임 등)의 줄이 원본보다 한 줄 늘어남
  // (카드 1-가 193문단 — 0.8~1.1배 0개, 1.2배 2개, 1.25배 12개). 원본 줄 배치가 그대로여야 하므로 맞춤·손 조정 모두 1.1까지만
  const { scrollRef, zoom, hand, setZoom, handRange } = useFitZoom({
    storageKey: CARD_ZOOM_KEY,
    measureRef: docRef,
    reservePx: CARD_PAD_PX + (wide ? CARD_NOTES_PX : 0),
    fitRange: CARD_FIT_ZOOM,
    handRange: CARD_HAND_ZOOM,
    paused: props.zoomPaused,
  });
  // 글자 간격(자간) 맞춤은 그린 뒤 한 번만(배율은 deps에 안 넣음): CSS zoom은 자간까지 포함해 통째로 늘리므로 배율마다 다시 재면
  // 오히려 크롬의 sub-pixel 반올림이 배율마다 달라 원본 줄 배치가 없는(흘려 그린) 문단의 줄바꿈이 바뀔 수 있음(실측 — 카드 59장 중 AX 붙임 등)
  useLayoutEffect(() => {
    const box = pagesRef.current;
    if (!showPages || !box) return;
    fitHwpText(box);
    let alive = true;
    const again = () => alive && fitHwpText(box);
    document.fonts?.ready.then(again).catch(() => {});
    document.fonts?.addEventListener?.("loadingdone", again);
    return () => {
      alive = false;
      document.fonts?.removeEventListener?.("loadingdone", again);
    };
  }, [pagesView, showPages]);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!exact || !box) return;
    fitHwpText(box);
    let alive = true;
    const again = () => alive && fitHwpText(box);
    document.fonts?.ready.then(again).catch(() => {});
    document.fonts?.addEventListener?.("loadingdone", again);
    return () => {
      alive = false;
      document.fonts?.removeEventListener?.("loadingdone", again);
    };
  }, [html, exact]);

  useImperativeHandle(props.ref, () => ({
    flush: async () => {
      if (timer.current) clearTimeout(timer.current);
      if (props.readOnly) return true;
      return save();
    },
    apply: (s) => {
      if (props.readOnly) return;
      if (props.locked?.some((p) => s.targetPath === p || s.targetPath?.startsWith(`${p}.`))) {
        setStatus({ kind: "error", text: "고정 영역(확정됨)이라 반영할 수 없습니다" });
        return;
      }
      const { card: next, focus } = applySuggestion(cardRef.current, s);
      restructure(next, focus);
    },
    selection: () => lastSel.current,
    current: () => cardRef.current,
    busy: () => review.busy(),
    reset: (data, rev, opts) => {
      if (timer.current) clearTimeout(timer.current);
      cardRef.current = data;
      // 진행 중이던 저장이 끝나도 「변경됨」으로 되돌아가지 않게 두 번호를 같은 새 값으로
      const next = Math.max(seq.current, savedSeq.current) + 1;
      seq.current = next;
      savedSeq.current = next;
      if (rev !== undefined) revRef.current = rev;
      if (opts?.versionId !== undefined) versionRef.current = opts.versionId;
      setCard(data);
      setStatus({ kind: "saved", text: opts?.label ?? "원장 반영됨" });
    },
  }));

  // 닫힐 때(다른 카드로 옮김 등) 남은 변경 저장
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (!props.readOnly && savedSeq.current !== seq.current) void save();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const { busy } = review;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (savedSeq.current !== seq.current || busy()) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // AI가 바꾼 칸 표시: 다시 그리기 전 글에 없던 글만
  useLayoutEffect(() => {
    const prev = flashPrev.current;
    if (!prev || !boxRef.current) return;
    flashPrev.current = null;
    const hit: HTMLElement[] = [];
    boxRef.current.querySelectorAll<HTMLElement>("[data-p]").forEach((el) => {
      const t = el.innerText.trim();
      const n = prev.get(t) ?? 0;
      if (n > 0) prev.set(t, n - 1);
      else if (t) hit.push(el);
    });
    hit.forEach((el) => el.classList.add("kc-flash"));
    const timer = setTimeout(() => hit.forEach((el) => el.classList.remove("kc-flash")), 2600);
    return () => clearTimeout(timer);
  }, [html]);

  // 고른 글이 풀리면 도구줄을 거둠
  useEffect(() => {
    if (!pick) return;
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setPick(null);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [pick]);

  useLayoutEffect(() => {
    const p = focusNext.current;
    if (!p || !boxRef.current) return;
    focusNext.current = null;
    const el = boxRef.current.querySelector<HTMLElement>(`[data-p="${CSS.escape(p)}"]`);
    if (el) {
      el.focus();
      if (!props.readOnly) caretToEnd(el);
    }
  }, [html, props.readOnly]);

  const commit = (el: HTMLElement) => {
    cardRef.current = applyText(cardRef.current, el.dataset.p!, el.innerText);
  };
  function restructure(next: LooseJson, focus: string | null) {
    cardRef.current = next;
    focusNext.current = focus;
    setCard(next);
    changed();
  }
  // 원본 줄 배치 문단은 고치러 들어오면(초점) 같은 모양으로 흘려 보임 — 줄 칸(inline-block) 안에서는 End·Home·화살표·끌어 고르기가 제대로 안 됨.
  // 글을 고치지 않고 나가면 원본 줄 배치로 되돌림
  const typed = useRef(new WeakSet<HTMLElement>());
  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-p]");
    if (!el) return;
    // 확정된 고정 영역: 고를 수만 있으니 눌렀을 때 이유를 중립 안내로 보임(저장 오류 문구는 덮지 않음 — 아래 상태 줄)
    setLockNote(!props.readOnly && el.hasAttribute("data-locked") ? `확정된 고정 영역(${fixedLabelOf(cardRef.current)})이라 고칠 수 없습니다 — 바꿔야 하면 성과관리팀에 요청하세요` : null);
    if (exact && el.isContentEditable && !el.classList.contains("hw-edit") && el.querySelector(".hw-l")) {
      el.classList.add("hw-edit");
      fitHwpText(el);
    }
    lastSel.current = { path: el.dataset.p!, text: el.innerText };
    props.onSelect?.(lastSel.current);
  };
  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    if (pick) setPick(null);
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-p]");
    if (!el || props.readOnly || !el.isContentEditable) return;
    // 원본 줄 배치로 그린 글: 치는 동안은 같은 모양으로 흘려 보임(원본 줄바꿈에 묶이지 않게). 원본 줄 폭에 맞춰 줄였던 간격은 되돌림
    typed.current.add(el);
    if (exact && !el.classList.contains("hw-edit") && el.querySelector(".hw-l")) {
      el.classList.add("hw-edit");
      fitHwpText(el);
    }
    commit(el);
    lastSel.current = { path: el.dataset.p!, text: el.innerText };
    changed();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && pick) {
      // 옆 창이 닫히지 않게
      e.preventDefault();
      setPick(null);
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-p]");
    if (!el || props.readOnly || !el.isContentEditable || e.nativeEvent.isComposing || e.key === "Process") return;
    // Home·End: 화면 줄의 처음·끝으로(원본 줄 배치 문단에서도 운영체제와 상관없이 같게 — 맥 Chrome의 End는 여기서 커서를 옮기지 못함)
    if ((e.key === "Home" || e.key === "End") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      window.getSelection()?.modify(e.shiftKey ? "extend" : "move", e.key === "End" ? "forward" : "backward", "lineboundary");
      return;
    }
    const path = el.dataset.p!;
    const isLine = el.classList.contains("kc-ln");
    if (e.key === "Enter" && !e.shiftKey) {
      if (isLine) {
        e.preventDefault();
        commit(el);
        const { card: next, path: np } = insertLineAfter(cardRef.current, path, bulletOf(el.innerText));
        restructure(next, np);
      } else if (!isMultiline(path)) {
        e.preventDefault();
        el.blur();
      }
    } else if (e.key === "Backspace" && isLine && el.innerText.replace(/\s/g, "") === "") {
      e.preventDefault();
      const { card: next, focus } = deleteLine(cardRef.current, path);
      restructure(next, focus);
    }
  };
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-toggle]");
    if (!t || props.readOnly || !window.getSelection()?.isCollapsed) return;
    e.preventDefault();
    restructure(toggleBox(cardRef.current, t.dataset.toggle!), null);
  };

  // 드래그로 글을 고르면 도구줄(AI 수정 요청·질문·삭제·좋음). 한글 조합 중에는 띄우지 않음.
  // 카드 안에서 누른 끌기면 어디서 놓든 창의 mouseup으로 엶 — 전체 페이지처럼 카드 밖 여백이 넓으면 줄 끝까지 끌다 카드 밖에서 놓기 쉬움.
  // 판정은 선택이 끝난 뒤(setTimeout 0) — requestAnimationFrame은 그리기가 멈춘 창에서 늦게 불려 도구줄이 뜨지 않을 수 있음
  const pressedInBox = useRef(false);
  const onMouseUp = () => {
    if (composing.current || props.preview) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const b = boxRef.current;
      const w = wrapRef.current;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !b || !w) return setPick(null);
      const range = sel.getRangeAt(0);
      if (!b.contains(range.commonAncestorContainer)) return setPick(null);
      const quote = sel.toString().replace(/\s+/g, " ").trim();
      const els = [...b.querySelectorAll<HTMLElement>("[data-p]")].filter((el) => range.intersectsNode(el) && el.innerText.trim());
      if (!quote || !els.length) return setPick(null);
      const r = range.getBoundingClientRect();
      const wr = w.getBoundingClientRect();
      const barW = reviewMode === "edit" ? 340 : 90;
      setPick({
        top: Math.max(0, r.top - wr.top - 44),
        left: Math.max(8, Math.min(r.left - wr.left + r.width / 2 - barW / 2, w.scrollWidth - barW - 8)),
        range: range.cloneRange(),
        target: { path: els[0].dataset.p!, paths: els.map((el) => el.dataset.p!).slice(0, 30), quote: quote.slice(0, 400) },
        canDelete: !props.readOnly && els.every((el) => el.isContentEditable),
      });
    });
  };

  const onMouseUpRef = useRef(onMouseUp);
  onMouseUpRef.current = onMouseUp;
  useEffect(() => {
    const up = () => {
      if (!pressedInBox.current) return;
      pressedInBox.current = false;
      onMouseUpRef.current();
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  /** 고른 글 바로 지우기(뒤 칸부터 — 줄을 지워도 앞 칸 경로가 밀리지 않게). 되돌리기 알림 */
  const deleteRange = (range: Range) => {
    const b = boxRef.current;
    if (!b) return;
    const els = [...b.querySelectorAll<HTMLElement>("[data-p]")].filter((el) => range.intersectsNode(el) && el.isContentEditable);
    const before = cardRef.current;
    let next = before;
    for (const el of els.reverse()) {
      const r = document.createRange();
      r.selectNodeContents(el);
      if (el.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
      if (el.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
      if (r.collapsed) continue;
      r.deleteContents();
      const text = el.innerText;
      next = el.classList.contains("kc-ln") && !text.replace(/\s/g, "") ? deleteLine(next, el.dataset.p!).card : applyText(next, el.dataset.p!, text);
    }
    if (next === before) return;
    window.getSelection()?.removeAllRanges();
    restructure(next, null);
    const after = next;
    setToast({
      text: "고른 글을 지웠습니다.",
      ms: 6000,
      action: {
        label: "되돌리기",
        run: () => {
          if (canonicalJson(cardRef.current) === canonicalJson(after)) restructure(before, null);
          else setToast({ text: "그 뒤 고친 내용이 있어 되돌리지 않았습니다.", tone: "warn" });
        },
      },
    });
  };

  // 경영관리 원장 편집: 짝 칸 표(전년도 환류·지적 및 개선방안) 행 추가·삭제 — 고정 영역이라 부서 작성본·미리보기·읽기 전용·잠근 구역에서는 없음
  const pairKeys = useMemo<PairKey[]>(
    () =>
      !props.readOnly && !props.preview && (props.variant ?? "ledger") === "ledger" && isMgmtCard(card)
        ? (["feedback", "findings"] as const).filter((k) => !lockedKey.split(",").includes(k))
        : [],
    [props.readOnly, props.preview, props.variant, card, lockedKey],
  );
  const pairCounts = useMemo(() => ({ feedback: card?.feedback?.rows?.length ?? 0, findings: card?.findings?.rows?.length ?? 0 }), [card]);
  const addPairRow = (key: PairKey, after: number) => {
    const { card: next, path } = insertPairRow(cardRef.current, key, after);
    restructure(next, path);
  };
  /** 행 삭제(마지막 행은 글만 비움) — 바로 지우고 「되돌리기」 알림(고른 글 지우기와 같음) */
  const removePairRow = (key: PairKey, row: number) => {
    const before = cardRef.current;
    const only = (before?.[key]?.rows?.length ?? 0) <= 1;
    const { card: next } = deletePairRow(before, key, row);
    restructure(next, null);
    setToast({
      text: `${PAIR_LABEL[key]} ${row + 1}행을 ${only ? "비웠습니다" : "지웠습니다"}.`,
      ms: 6000,
      action: {
        label: "되돌리기",
        run: () => {
          if (canonicalJson(cardRef.current) === canonicalJson(next)) restructure(before, null);
          else setToast({ text: "그 뒤 고친 내용이 있어 되돌리지 않았습니다.", tone: "warn" });
        },
      },
    });
  };

  const onPick = (k: PickKind) => {
    if (!pick) return;
    const { target, range } = pick;
    setPick(null);
    if (k === "delete") return deleteRange(range);
    window.getSelection()?.removeAllRanges();
    if (k === "keep") {
      review.add(target, "keep", "");
      setToast({ text: "좋음으로 표시했습니다 — AI가 이 부분은 바꾸지 않습니다." });
      return;
    }
    markPick(range);
    // 쓰던 코멘트 글은 새로 고른 글로 옮겨도 남김
    setComposer((c) => ({ target, kind: k, text: c?.text ?? "" }));
  };

  const closeComposer = () => {
    markPick(null);
    setComposer(null);
  };
  const sendComposer = () => {
    if (!composer) return;
    const note = review.add(composer.target, composer.kind, composer.text);
    closeComposer();
    setToast({
      text: "보냈습니다 · {n}초 뒤 AI에 넘어갑니다",
      countdown: 5,
      action: {
        label: "되돌리기",
        run: () => {
          const back = review.cancel(note.id);
          if (!back) setToast({ text: "이미 AI에 넘어가 되돌릴 수 없습니다.", tone: "warn" });
          else if (back.kind !== "keep") setComposer({ target: { path: back.path, paths: back.paths, quote: back.quote }, kind: back.kind, text: back.text });
        },
      },
    });
  };

  const statusClass = { idle: "text-muted", dirty: "text-muted-2", saving: "text-muted-2", saved: "text-muted", error: "text-error" }[status.kind];
  return (
    <div className="relative flex min-h-0 grow flex-col">
      {!props.readOnly && (
        <form
          action={formAction}
          onSubmit={(e) => {
            // 화면에서는 자동 저장과 같은 길(save)로 — 두 저장이 같은 번호로 겹치지 않게. 폼 action은 스크립트 없는 환경용
            e.preventDefault();
            if (timer.current) clearTimeout(timer.current);
            void save(true);
          }}
          className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-thead px-5 py-2"
        >
          <input type="hidden" name="uid" value={uid} />
          <input ref={payloadRef} type="hidden" name="payload" defaultValue="" />
          {/* 월별 실적 상자 추가: 기간(기본 이달) + 추가 */}
          <span className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-field-line bg-paper" title="[Do] 월별 실적 상자 추가">
            <input value={period} onChange={(e) => setPeriod(e.target.value)} className="h-8 w-[52px] border-r border-field-line bg-paper px-2 text-ui text-ink" aria-label="추가할 기간" />
            <button
              type="button"
              onClick={() => {
                const p = period.trim();
                if (!p) return;
                const { card: next, path } = addMonthly(cardRef.current, p);
                restructure(next, path);
              }}
              className="flex h-8 items-center gap-1 px-2.5 text-xs font-semibold whitespace-nowrap text-ink hover:text-navy"
            >
              <Plus size={13} aria-hidden="true" />
              월별 실적
            </button>
          </span>
          {props.metaSlot}
          <div className="ml-auto flex items-center gap-2.5">
            {exact && layout?.page && <ViewToggle value={view} onChange={setView} />}
            <ZoomControl zoom={zoom} fitted={hand === null} range={handRange} onZoom={setZoom} />
            <AutosaveSwitch on={autosave} onToggle={toggleAutosave} />
            <span role="status" aria-live="polite" className={`text-xs whitespace-nowrap ${statusClass}`}>
              {formState.status === "error" && status.kind !== "saving" ? formState.message : status.text}
            </span>
            <button
              type="submit"
              onClick={() => payloadRef.current && (payloadRef.current.value = payload())}
              disabled={formPending || status.kind === "saving"}
              aria-label="지금 저장"
              title={autosave ? "지금 저장(자동 저장 켜짐 — 고친 뒤 1.5초면 저장)" : "지금 저장(자동 저장 꺼짐)"}
              className={`${T.iconBtn} border-field-line text-navy hover:border-navy`}
            >
              <Save size={15} aria-hidden="true" />
            </button>
          </div>
          {lockNote && formState.status !== "error" && status.kind !== "error" && (
            <p role="status" className="w-full text-xs text-muted-2">
              {lockNote}
            </p>
          )}
        </form>
      )}
      <div ref={scrollRef} data-card-scroll className="min-h-0 grow overflow-auto">
        <div ref={wrapRef} className="relative flex w-max min-w-full items-start justify-center gap-5 px-6 py-5">
          <div className="shrink-0">
            {props.readOnly && (
              <div className="mb-3 flex items-center justify-end gap-2">
                {exact && layout?.page && <ViewToggle value={view} onChange={setView} />}
                <ZoomControl zoom={zoom} fitted={hand === null} range={handRange} onZoom={setZoom} />
              </div>
            )}
            <div ref={docRef} style={{ zoom }}>
              {showPages && (
                <div className="w-max">
                  <div ref={pagesRef} className="rounded-lg bg-desk p-4" dangerouslySetInnerHTML={{ __html: pagesView ?? "" }} />
                </div>
              )}
              <div hidden={showPages} className={`w-max ${exact ? "" : "min-w-[900px]"} rounded-lg border border-line bg-paper p-6 ${props.readOnly ? "card-reading" : "card-editing"}`}>
                <div
                  ref={boxRef}
                  className={exact ? "w-max" : "w-[852px]"}
                  onFocus={onFocus}
                  onBlur={(e) => {
                    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-p]");
                    if (el?.hasAttribute("data-locked")) setLockNote(null);
                    if (!el || !el.classList.contains("hw-edit") || typed.current.has(el)) return;
                    el.classList.remove("hw-edit");
                    fitHwpText(el);
                  }}
                  onInput={onInput}
                  onKeyDown={onKeyDown}
                  onClick={onClick}
                  onMouseDown={(e) => {
                    if (pick) setPick(null);
                    pressedInBox.current = e.button === 0;
                    const plain = e.button === 0 && e.detail === 1 && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey;
                    const at = exact && plain ? caretAt(e.clientX, e.clientY) : null;
                    dragFrom.current = at && boxRef.current?.contains(at.node) ? at : null;
                  }}
                  onCompositionStart={() => (composing.current = true)}
                  onCompositionEnd={() => (composing.current = false)}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            </div>
          </div>
          {wide && !showPages && (
            <NotesColumn
              box={boxRef}
              layoutKey={html}
              notes={review.notes}
              card={card}
              composerPath={composer?.target.path ?? null}
              composer={composer ? <Composer state={composer} mode={reviewMode} card={card} onChange={setComposer} onSend={sendComposer} onClose={closeComposer} /> : null}
              canToggle={review.canToggle}
              onCancel={(id) => {
                const back = review.cancel(id);
                if (back && back.kind !== "keep") setComposer({ target: { path: back.path, paths: back.paths, quote: back.quote }, kind: back.kind, text: back.text });
              }}
              onRetry={review.retry}
              onRemove={review.remove}
              onToggle={review.toggle}
            />
          )}
          {pairKeys.length > 0 && !showPages && <PairRowTools box={boxRef} layoutKey={html} zoom={zoom} keys={pairKeys} counts={pairCounts} onAdd={addPairRow} onDelete={removePairRow} />}
          {pick && <SelectionBar top={pick.top} left={pick.left} mode={reviewMode} canDelete={pick.canDelete} onPick={onPick} />}
        </div>
      </div>
      <Toast key={toast?.key ?? 0} spec={toast?.spec ?? null} onDone={clearToast} />
      <style>{PICK_HIGHLIGHT_CSS}</style>
      {exact && <style>{CARD_LAYOUT_CSS}</style>}
    </div>
  );
}

/** 자동 저장 켜기·끄기 스위치 */
function AutosaveSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      title={on ? "자동 저장 켜짐 — 고친 뒤 1.5초면 저장합니다" : "자동 저장 꺼짐 — 「저장」 단추를 누르거나 닫을 때 저장합니다"}
      className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-2"
    >
      자동 저장
      <span aria-hidden="true" className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-navy" : "bg-line-strong"}`}>
        <span className={`absolute size-4 rounded-full bg-paper shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

/** 이어 보기(편집) ↔ 쪽 보기(인쇄 모양) */
function ViewToggle({ value, onChange }: { value: "flow" | "pages"; onChange: (v: "flow" | "pages") => void }) {
  const item = (v: "flow" | "pages", label: string) => (
    <button
      type="button"
      aria-pressed={value === v}
      onClick={() => onChange(v)}
      className={`h-7 px-2.5 text-xs font-semibold whitespace-nowrap ${value === v ? "bg-navy text-white" : "bg-paper text-ink hover:text-navy"}`}
    >
      {label}
    </button>
  );
  return (
    <span role="group" aria-label="보기" className="inline-flex shrink-0 overflow-hidden rounded-md border border-field-line">
      {item("flow", "이어 보기")}
      {item("pages", "쪽 보기")}
    </span>
  );
}

