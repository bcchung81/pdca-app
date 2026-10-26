"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { approveReportOutline, previewReportOutline, regenerateMgPart, runReportOutline, saveReportOutline } from "../../app/(app)/reports/cards/outline-actions";
import type { BlockEdit, Composition, CompositionEdit } from "../../lib/reports/composition.ts";
import type { OutlineText } from "../../lib/reports/outline-text.ts";
import type { OutlineView, ShapeRow } from "../../lib/reports/outline-view.ts";
import { MG_MAIN_STORIES } from "../../lib/reports/frameworks-mg.ts";
import { storyLabel } from "../../lib/reports/frameworks.ts";
import type { FrameChoice } from "../../lib/reports/framework-pick.ts";
import { patternOf } from "../../lib/reports/framework-patterns.ts";
import { draftExpect, rangeText } from "../../lib/ai/progress.ts";
import type { MgPart } from "../../lib/reports/mg-types.ts";
import { LAYOUT_LABEL, LAYOUT_USE, layoutName } from "../../lib/reports/layout.ts";
import { FIT_RANGE_TEXT, fitVerdict } from "../../lib/reports/fit.ts";
import { T, Tag } from "../ui/kit";
import { FIT_TAG } from "../ui/status-tone.ts";
import { useAsk } from "../ui/confirm-dialog";
import { askBody, overwriteSteps } from "./draft-review";
import { BlockEditor } from "./outline-block";

/** 이름표·모양 표(서버가 넘김 — 클라이언트 번들에 판면 계산·스키마 모듈을 싣지 않게) */
export interface OutlineNames {
  figures: Array<{ kind: string; label: string }>;
  materials: Record<string, string>;
  /** 추진성과 모양 */
  results: Array<{ key: string; label: string }>;
  /** 블록 모양 25가지(이름·무리·칸 범위·보통 칸 수) */
  table: ShapeRow[];
  /** 라벨 후보 */
  labels: string[];
  /** 갈래 축 사전(이 트랙에서 쓰는 축 — 이름·정의·표준 값, lib/reports/split-axes.ts) */
  axes: Array<{ name: string; def: string; values: string[] }>;
}

/** 구성안 화면 재료(서버가 셈) */
export interface OutlineData {
  outline: Composition;
  status: "draft" | "approved";
  model: string | null;
  at: string | null;
  /** 초안이 이미 있는지(승인하면 다시 씀) */
  hasDraft: boolean;
  names: OutlineNames;
  /** 편집 시작 값(저장된 구성안 그대로 — lib/reports/composition.ts editOf) */
  edit: CompositionEdit;
  /** 저장된 구성안의 판면·예산·판면 HTML·경고 */
  view: OutlineView;
  /** 구성안 판면 CSS(REPORT_CSS + SHEET_CSS) */
  sheetCss: string;
  /** 화면에 보일 글(재료 출처를 읽는 이름으로, 영문 도식 코드를 쉬운 이름으로 — lib/reports/outline-text.ts) */
  text: OutlineText;
}

const EMPTY_EDIT: CompositionEdit = { blocks: [], story: "", resultShape: "bullets", memo: "" };
const NO_SPLIT = { axis: "", chip: "" };
/** 칩 글자 한도(서버 lib/reports/split-axes.ts CHIP_MAX와 같은 값 — 클라이언트 번들에 정리 모듈을 싣지 않게 따로) */
const CHIP_MAX = 12;

/** 블록 한 줄 + 화면 열쇠(순서가 바뀌어도 같은 블록 — 메모 자리 이동이 부드럽게) */
interface Item {
  key: string;
  block: BlockEdit;
}
const itemsOf = (e: CompositionEdit): Item[] => e.blocks.map((block, i) => ({ key: `o${i}`, block }));

/** 경영관리 절 편집 한 줄(열쇠·제목·이야기 틀) */
type PartEdit = NonNullable<CompositionEdit["parts"]>[number];

/** 경영관리 절 이름(화면): 「평가내용 1 · 대주제 2 · 가. 제목」 — lib/reports/mg-outline.ts mgPartLabel과 같은 모양(클라이언트 번들에 스키마 모듈을 싣지 않게 따로) */
export function partName(p: Pick<MgPart, "evalNo" | "themeNo" | "mark" | "themeTitle">, title: string): string {
  return `평가내용 ${p.evalNo} · 대주제 ${p.themeNo}${p.mark ? ` · ${p.mark}. ${title}` : p.themeTitle ? ` ${p.themeTitle}` : ""}`;
}

/** 모양 표에서 한 줄(모양이 없는 종류는 variant 빈 글) */
export function rowOf(table: ShapeRow[], kind: string, variant: string): ShapeRow | null {
  return table.find((r) => r.kind === kind && r.variant === (variant ?? "")) ?? table.find((r) => r.kind === kind) ?? null;
}

/**
 * 구성안 편집 상태(2026-09-28 — 블록 도식·라벨·목적·칸·재료·메모·더하기·복제·순서·빼기, 이야기 틀·그림·추진성과 모양·메모)와 저장 흐름.
 * 오른쪽 구성안 패널·왼쪽 여백 메모·도식 목록·틀 갤러리가 함께 씀. 고치면 0.35초 뒤 서버가 판면·예산·구성안 판면을 다시 셈(저장 안 함 — previewReportOutline).
 * 저장·줄이기·다시 만들기 뒤 서버가 새 구성안을 내려주면 편집 상태를 새 구성안으로 다시 시작
 */
export function useOutlineEdit(uid: string, data: OutlineData | null) {
  const router = useRouter();
  const { ask, dialog: askDialog } = useAsk();
  const c = data?.outline ?? null;
  const init = data?.edit ?? EMPTY_EDIT;
  const [items, setItems] = useState<Item[]>(() => itemsOf(init));
  const [story, setStory] = useState(init.story);
  const [resultShape, setResultShape] = useState(init.resultShape ?? "bullets");
  const [memo, setMemo] = useState(init.memo);
  // 경영관리: 절 순서·제목·이야기 틀(저장된 구성안 mg.parts 안에서만 — 서버 applyMgCompositionEdit가 다시 검증)
  const [parts, setParts] = useState<PartEdit[]>(init.parts ?? []);
  // 갈래 축·칩(주요사업 — 경영관리는 축만, 칩은 절마다 parts[].chip). 서버가 사전·근거로 다시 검증(applyCompositionEdit·applyMgCompositionEdit)
  const [split, setSplit] = useState(init.split ?? NO_SPLIT);
  const mg = Boolean(c?.mg);
  // 블록 상한(주요사업 10 · 경영관리 32 — lib/reports/composition.ts EDIT_LIMITS·mg-outline.ts MG_LIMITS)
  const maxBlocks = mg ? 32 : 10;
  const [view, setView] = useState<OutlineView | null>(data?.view ?? null);
  const [notes, setNotes] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // 지금 도는 요청을 시작한 시각(ms) — AI 초안 탭의 진행 줄이 경과 시간을 셈
  const [busyAt, setBusyAt] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 확인 전(draft) 구성안은 펼쳐 보임 — 처음 열 때뿐 아니라 이 화면에서 구성안이 새로 생기거나(없음 → 확인 전) 다시 만들어 확인 전이 될 때도.
  // 처음 열 때만 정하면 구성안이 없던 과제에서 「구성안 만들기」 뒤 접힌 채로 남아 이야기 틀·절 목록이 안 보였음(2026-10-10)
  const status = data?.status ?? null;
  const [open, setOpen] = useState(status === "draft");
  const [seenStatus, setSeenStatus] = useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    if (status === "draft") setOpen(true);
  }
  const [picker, setPicker] = useState<{ pos: number; mode: "change" | "add" } | null>(null);
  // 펼친 블록(한 번에 하나 — 블록 열쇠): 여백 메모·좁은 창 목록·종이 블록 누르기가 함께 씀
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  // 경영관리: 짜임 고르기를 연 절 열쇠(절별 「짜임 고르기」 — 이야기 틀·구성 패턴·2025 예시 절·요청 글)
  const [partGallery, setPartGallery] = useState<string | null>(null);
  // 지금 도는 다시 짜기에 넣은 구성 패턴·예시 절 이름(진행 줄 「넣은 근거」 — 실제로 요청에 넣는 것)
  const [busyFrame, setBusyFrame] = useState<{ pattern?: string; example?: string } | null>(null);
  // 경영관리: 다시 짜는 중인 절 열쇠(그 절 단추에만 「다시 짜는 중…」)
  const [redoKey, setRedoKey] = useState<string | null>(null);
  // 재료 짚기(여백 메모·블록 편집의 재료 → 구성안 재료 목록의 그 재료): 번호 + 요청 순번(같은 재료를 다시 눌러도 다시 짚음)
  const [matFocus, setMatFocus] = useState<{ id: string; n: number } | null>(null);
  const counter = useRef(0);
  const seq = useRef(0);

  // 서버가 새 구성안을 내려주면(저장·줄이기·다시 만들기) 처음부터
  const sig = data ? JSON.stringify(data.edit) + data.status + data.view.sheetHtml.length : "";
  const [seen, setSeen] = useState(sig);
  if (seen !== sig) {
    setSeen(sig);
    setItems(itemsOf(init));
    setStory(init.story);
    setResultShape(init.resultShape ?? "bullets");
    setMemo(init.memo);
    setParts(init.parts ?? []);
    setSplit(init.split ?? NO_SPLIT);
    setView(data?.view ?? null);
    setNotes([]);
  }

  const edit: CompositionEdit = useMemo(() => ({ blocks: items.map((x) => x.block), story, resultShape, memo, ...(mg ? { parts } : {}), ...(init.split ? { split } : {}) }), [items, story, resultShape, memo, mg, parts, split, init.split]);
  const dirty = useMemo(() => JSON.stringify(edit) !== JSON.stringify(init), [edit, init]);

  // 고친 뒤 판면 미리보기(0.35초 모아서 — 마지막 요청만 받음)
  useEffect(() => {
    if (!data || !dirty) return;
    const my = ++seq.current;
    const t = setTimeout(() => {
      setPreviewing(true);
      previewReportOutline(uid, edit)
        .then((r) => {
          if (my !== seq.current) return;
          if (r.ok) {
            setView(r.view);
            setNotes(r.notes);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (my === seq.current) setPreviewing(false);
        });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, dirty]);

  const run = async (label: string, fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(label);
    setBusyAt(Date.now());
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    } catch {
      setMsg({ ok: false, text: "요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." });
    } finally {
      setBusy(null);
    }
  };

  const newKey = () => `n${++counter.current}`;
  const setBlock = (pos: number, patch: Partial<BlockEdit>) => setItems((xs) => xs.map((x, i) => (i === pos ? { ...x, block: { ...x.block, ...patch } } : x)));
  /** 도식 바꾸기(칸 수는 같은 종류면 그대로, 다른 종류면 주는 값) */
  const setShape = (pos: number, row: ShapeRow, cells?: number) =>
    setItems((xs) =>
      xs.map((x, i) => {
        if (i !== pos) return x;
        const same = x.block.kind === row.kind;
        const n = cells ?? (same ? Math.max(row.min, Math.min(row.max, x.block.cells)) : row.def);
        return { ...x, block: { ...x.block, kind: row.kind, variant: row.variant, cells: n } };
      }),
    );
  const move = (pos: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = pos + d;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[pos], n[j]] = [n[j], n[pos]];
      return n;
    });
  /** 끌어서 순서 바꾸기: from 자리의 블록을 to 자리로 */
  const moveTo = (from: number, to: number) =>
    setItems((xs) => {
      if (from === to || from < 0 || to < 0 || from >= xs.length || to >= xs.length) return xs;
      const n = [...xs];
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x);
      return n;
    });
  const remove = (pos: number) => setItems((xs) => (xs.length <= 1 ? xs : xs.filter((_, i) => i !== pos)));
  /** 복제: 바로 뒤에(그림은 빼고 — 서버도 복제본의 그림은 버림) */
  const duplicate = (pos: number) => setItems((xs) => (xs.length >= maxBlocks ? xs : [...xs.slice(0, pos + 1), { key: newKey(), block: { ...xs[pos].block, figures: [] } }, ...xs.slice(pos + 1)]));
  /** 새 블록: pos 뒤에(라벨은 앞 블록 것 — 같은 사다리 행으로 이어짐, 목적·재료는 사람이 채움) */
  const add = (pos: number, row: ShapeRow, cells?: number) =>
    setItems((xs) => {
      if (xs.length >= maxBlocks) return xs;
      // 경영관리: 새 블록은 앞 블록과 같은 절에
      const at = xs[pos]?.block.at;
      const block: BlockEdit = { from: null, kind: row.kind, variant: row.variant, label: row.full ? "" : (xs[pos]?.block.label ?? ""), purpose: "", cells: cells ?? row.def, materials: [], memo: "", figures: [], ...(at ? { at } : {}) };
      return [...xs.slice(0, pos + 1), { key: newKey(), block }, ...xs.slice(pos + 1)];
    });
  /** 도식 목록에서 고름(바꾸기·더하기) */
  const pick = (row: ShapeRow, cells: number) => {
    if (!picker) return;
    if (picker.mode === "change") setShape(picker.pos, row, cells);
    else add(picker.pos, row, cells);
    setPicker(null);
  };
  /** 저장된 구성안에서 지금 목록에 없는 블록(되살리기 후보) */
  const dropped = init.blocks.map((_, i) => i).filter((i) => !items.some((x) => x.block.from === i));
  const restore = (from: number) =>
    setItems((xs) => {
      if (xs.some((x) => x.block.from === from) || !init.blocks[from]) return xs;
      const at = xs.findIndex((x) => x.block.from !== null && x.block.from > from);
      const item = { key: `o${from}`, block: init.blocks[from] };
      return at < 0 ? [...xs, item] : [...xs.slice(0, at), item, ...xs.slice(at)];
    });
  const toggleMaterial = (pos: number, id: string) => setBlock(pos, { materials: items[pos]?.block.materials.includes(id) ? items[pos].block.materials.filter((m) => m !== id) : [...(items[pos]?.block.materials ?? []), id] });
  const setFigureKind = (pos: number, k: number, kind: string) => setBlock(pos, { figures: (items[pos]?.block.figures ?? []).map((f, j) => (j === k ? { ...f, kind } : f)) });
  const dropFigure = (pos: number, k: number) => setBlock(pos, { figures: (items[pos]?.block.figures ?? []).filter((_, j) => j !== k) });
  /**
   * 골격 한 번에(2026-10-12 배치): 라벨 있는 블록의 배치를 라벨 사다리 ↔ 단 띠로(전폭으로 고른 블록은 그대로). at을 주면 그 절(경영관리)만.
   * 블록마다 고르는 것은 블록 편집 칸의 「배치」
   */
  const setSkeleton = (to: "" | "stage", at?: string) =>
    setItems((xs) => xs.map((x) => ((at !== undefined && x.block.at !== at) || !x.block.label || x.block.layout === "full" ? x : { ...x, block: { ...x.block, layout: to || undefined } })));
  /** 지금 골격: 라벨 있는 블록(전폭 제외)이 모두 단 띠면 stage, 하나도 아니면 "", 섞였으면 mixed */
  const skeletonOf = (at?: string): "" | "stage" | "mixed" => {
    const bs = items.filter((x) => (at === undefined || x.block.at === at) && x.block.label && x.block.layout !== "full");
    const n = bs.filter((x) => x.block.layout === "stage").length;
    return n === 0 ? "" : n === bs.length ? "stage" : "mixed";
  };
  /** 경영관리 절 하나 고치기(제목·이야기 틀) */
  const setPart = (key: string, patch: Partial<PartEdit>) => setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const reset = () => {
    setItems(itemsOf(init));
    setStory(init.story);
    setResultShape(init.resultShape ?? "bullets");
    setMemo(init.memo);
    setParts(init.parts ?? []);
    setSplit(init.split ?? NO_SPLIT);
    setView(data?.view ?? null);
    setNotes([]);
  };
  const save = () => run("save", () => saveReportOutline(uid, { edit }));
  /** 사람이 고친 블록 수(저장된 것 + 저장 안 한 고침) — 다시 만들기 전 확인 */
  const humanCount = (data?.view.human ?? 0) + (dirty ? 1 : 0);
  /** 다시 만들기(여러 안에서 고르기 포함) 전에 물을 글 — 사람이 고친 것이 없으면 null */
  const regenWarning = humanCount === 0 ? null : `사람이 고른 도식·목적·재료가 있는 구성안입니다${dirty ? "(저장하지 않은 고침 포함)" : ""}. 다시 만들면 AI가 새로 짜고 고친 내용은 사라집니다. 계속할까요?`;
  /** 진행 줄에 적을 고른 구성 패턴·예시 절 이름 */
  const frameNames = (f?: FrameChoice) => (f && (f.pattern || f.example) ? { ...(f.pattern ? { pattern: patternOf(f.pattern)?.name ?? f.pattern } : {}), ...(f.example ? { example: f.example.title } : {}) } : null);
  /** 짜임(이야기 틀·구성 패턴·2025 예시 절)을 골라 구성안 다시 만들기 — request는 짜임 고르기 창의 요청 글(없으면 지금 메모) */
  const regenerate = (frame?: FrameChoice, request?: string) => {
    if (!c) return;
    // 사람이 고친 것이 있으면 먼저 묻고, 확인하면(없으면 바로) 보냄 — 보내는 값(짜임·요청 글·메모)은 누른 때의 것
    ask(
      regenWarning ? [{ title: "구성안을 다시 만들까요?", body: [askBody(regenWarning)], confirmLabel: "다시 만들기" }] : [],
      () => {
        setGallery(false);
        setBusyFrame(frameNames(frame));
        void run(frame ? "story" : "again", () => runReportOutline(uid, c.sources, request ?? memo, frame));
      },
    );
  };
  /**
   * 경영관리 절 하나를 다시 짤 때 물을 글: 저장된 구성안에서 이 절에 사람이 고른 블록이 있거나 저장하지 않은 다른 고침이 있으면 — 다시 짤 그 절의 틀 고르기는 이 요청의 입력이라 고침으로 안 셈
   */
  const partWarning = (key: string): string | null => {
    if (!c) return null;
    const humanHere = c.blocks.some((b) => b.at === key && b.by === "human");
    const saved = init.parts?.find((x) => x.key === key);
    const otherDirty = JSON.stringify({ ...edit, ...(edit.parts ? { parts: edit.parts.map((x) => (x.key === key ? { ...x, story: saved?.story ?? "", subStory: saved?.subStory ?? "" } : x)) } : {}) }) !== JSON.stringify(init);
    return otherDirty || humanHere ? `${humanHere ? "이 절에 사람이 고른 블록이 있습니다. " : ""}다시 짜면 이 절의 블록은 AI가 새로 짭니다${otherDirty ? "(저장하지 않은 다른 고침은 사라짐)" : ""}. 계속할까요?` : null;
  };
  /** 경영관리: 절 하나를 고른 이야기 틀(또는 짜임·요청 글)로 AI가 다시 짬(그 절 블록만 바뀌고 다른 절은 그대로 — regenerateMgPart) */
  const regeneratePart = (key: string, pick: string | FrameChoice, request?: string) => {
    if (!c || !pick) return;
    const warn = partWarning(key);
    ask(warn ? [{ title: "이 절을 다시 짤까요?", body: [askBody(warn)], confirmLabel: "다시 짜기" }] : [], () => {
      setPartGallery(null);
      setRedoKey(key);
      setBusyFrame(typeof pick === "string" ? null : frameNames(pick));
      void run("story", () => regenerateMgPart(uid, key, pick, request)).finally(() => setRedoKey(null));
    });
  };
  const focusMaterial = (id: string) => {
    setOpen(true);
    setMatFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };

  return {
    c,
    data,
    items,
    edit,
    view,
    notes,
    previewing,
    story,
    setStory,
    resultShape,
    setResultShape,
    memo,
    setMemo,
    mg,
    parts,
    setPart,
    split,
    setSplit,
    maxBlocks,
    busy,
    busyAt,
    msg,
    open,
    setOpen,
    dirty,
    run,
    setBlock,
    setSkeleton,
    skeletonOf,
    setShape,
    move,
    moveTo,
    openKey,
    setOpenKey,
    remove,
    duplicate,
    add,
    pick,
    picker,
    setPicker,
    gallery,
    setGallery,
    partGallery,
    setPartGallery,
    busyFrame,
    regenWarning,
    partWarning,
    ask,
    askDialog,
    dropped,
    restore,
    toggleMaterial,
    setFigureKind,
    dropFigure,
    reset,
    save,
    regenerate,
    regeneratePart,
    redoKey,
    matFocus,
    focusMaterial,
  };
}
export type OutlineEdit = ReturnType<typeof useOutlineEdit>;


/** 골격 고르기(라벨 사다리 ↔ 단 띠 — 라벨 있는 블록 모두, 전폭 블록은 그대로). at = 경영관리 절 */
function SkeletonSelect({ ed, can, at, className }: { ed: OutlineEdit; can: boolean; at?: string; className: string }) {
  const cur = ed.skeletonOf(at);
  return (
    <select aria-label="골격" title={`골격 — ${LAYOUT_USE[""]} / ${LAYOUT_USE.stage}`} value={cur} disabled={!can} onChange={(e) => e.target.value !== "mixed" && ed.setSkeleton(e.target.value as "" | "stage", at)} className={className}>
      <option value="">{LAYOUT_LABEL[""]}</option>
      <option value="stage">{LAYOUT_LABEL.stage}</option>
      {cur === "mixed" && <option value="mixed">섞임(블록마다)</option>}
    </select>
  );
}

/** 구성안 패널 절 머리 글 */
const SEC = "text-xs font-semibold tracking-wide text-muted-2";

const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 블록 하나 펼치고 그 자리로(여백 메모가 있으면 그 메모, 좁은 창이면 패널의 블록 목록) */
function revealBlock(ed: OutlineEdit, key: string, pos: number, margin: boolean) {
  ed.setOpenKey(key);
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(margin ? `[data-note="${pos}"]:not([data-drop])` : `[data-oblock="${pos}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: still() ? "auto" : "smooth" });
  });
}

/** 「판면: …」 → 머리 「판면」 + 글(머리가 짧을 때만) */
function headOf(w: string): { tag: string; text: string } {
  const m = /^([^:—[]{1,10}?)\s*(?::|—)\s*([\s\S]+)$/.exec(w);
  return m ? { tag: m[1].trim(), text: m[2].trim() } : { tag: "", text: w };
}

/**
 * 경평 초안 구성안(구현 계획 2단계): 재료표 → 구성안 → 담당자가 보고 고친 뒤 승인 → 그 짜임대로 집필.
 * 고칠 수 있는 것(2026-09-28 사용자 결정): 블록마다 도식(AI 추천·대안·도식 목록)·라벨·목적·칸 수·재료·메모, 블록 더하기·복제·순서·빼기,
 * 이야기 틀(틀 갤러리에서 고르면 AI가 그 틀로 다시 짬), 그림 자리(빼기·종류), 추진성과 모양, 메모. 칸 글은 집필 단계에서.
 * 「판면에 맞게 줄이기」는 서버의 결정론 함수(lib/reports/composition.ts fitComposition).
 * margin이면 블록 편집은 왼쪽 여백 메모(components/reports/outline-notes.tsx)에 있고 여기에는 블록 칩만 — 좁은 창이면 여기 목록으로 돌아옴.
 * 읽는 차례(2026-09-28 가독성 개선): 결론(핵심 메시지) → 근거(평가 논점) → 짜임(이야기 틀·블록) → 추진성과 → 재료 → 확인할 것 → 할 일.
 * 좁은 패널이라 재료는 표가 아니라 카드 목록(예전 표는 칸이 좁아 글이 옆 칸으로 넘쳐 겹쳤음)
 */
export function OutlinePanel(props: { uid: string; canWrite: boolean; ed: OutlineEdit; margin: boolean; /** 사람이 고친 초안 블록 순번(집필 전 확인) */ humanEdits: number[]; onShowMaterial: (id: string) => void }) {
  const { ed } = props;
  const data = ed.data!;
  const c = data.outline;
  const tx = data.text;
  const view = ed.view ?? data.view;
  const { busy, dirty } = ed;
  const ratio = view.fit.budget ? Math.round((view.fit.total / view.fit.budget) * 100) : 0;
  // 판면 판정 하나(lib/reports/fit.ts fitVerdict — 도구줄·부서 허브와 같은 문턱)
  const fitV = fitVerdict(ratio);
  const editable = props.canWrite && !busy;
  const shapeOf = (b: BlockEdit) => rowOf(data.names.table, b.kind, b.variant)?.name ?? b.kind;

  // 확인할 것: 틀 경고(이야기 틀 아래)·원문 못 찾은 재료·자료 필요(재료 목록)와 겹치는 것은 빼고 머리를 떼어 굵게
  const checks = [
    ...ed.notes.map((w) => ({ tag: "바꾸지 않음", text: w })),
    ...view.warnings.filter((w) => !w.startsWith("틀:") && !w.startsWith("재료: 근거 원문에서 구절을") && !/^자료 필요 \d+건/.test(w)).map(headOf),
  ];
  const needN = c.materials.filter((m) => m.kind === "need").length;
  const unfoundN = c.materials.filter((m) => m.kind !== "need" && !m.found).length;
  // 줄여 보이기(2026-09-29 사용자 결정 — 펼치면 패널 3~4배 길이였음): 평가 논점은 한 줄씩(누르면 그 논점 전부), 이야기 틀은 이름만(「이유 보기」로 고른 이유·차선·틀 경고)
  const [pointOpen, setPointOpen] = useState<Record<number, boolean>>({});
  const [storyOpen, setStoryOpen] = useState(false);
  const storyWarnings = view.warnings.filter((w) => w.startsWith("틀:"));
  const hasStoryMore = storyWarnings.length > 0 || Boolean(tx.storyWhy) || Boolean(tx.alternative);

  return (
    <section aria-label="구성안" className={`${T.wrap} flex flex-col`}>
      <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="font-serif text-base font-bold text-navy">구성안</h2>
        <Tag tone={data.status === "approved" && !dirty ? "navy" : "warn"}>{dirty ? "고치는 중 · 저장 전" : data.status === "approved" ? "승인 · 집필함" : "확인 전"}</Tag>
        {/* 경영관리는 판면을 어림하지 않음(2026 서식 자료 전 — fit 0/0) */}
        {view.fit.budget > 0 && (
          <Tag tone={FIT_TAG[fitV.tone]} title={`${fitV.hint} — 판면 어림 ${view.fit.total}/${view.fit.budget}mm · ${ratio}%(구성안 블록을 칸을 채운 보통 모양으로 어림, 집필 결과와 약 2% 차이 — 고치면 바로 다시 셈) · ${FIT_RANGE_TEXT}`}>
            {fitV.label} · {ratio}%{ed.previewing ? " …" : ""}
          </Tag>
        )}
        <span className="min-w-0 truncate text-xs text-muted-2">
          {data.model ?? "AI"} · {data.at ? new Date(data.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
        </span>
        <button type="button" onClick={() => ed.setOpen((o) => !o)} className={`${T.btn} ml-auto`} aria-expanded={ed.open}>
          {ed.open ? "접기" : "구성안 보기"}
        </button>
        {/* 만들 때 담당자가 고른 짜임(2026-10-12 — 경영관리는 절마다 절 목록에) */}
        {tx.frame && (
          <span className="max-w-full min-w-0 basis-full truncate text-xs text-muted" title={`짜임: ${tx.frame}${tx.frameRequest ? `\n요청: ${tx.frameRequest}` : ""}`}>
            <b className="font-semibold text-navy">짜임</b> {tx.frame}
          </span>
        )}
      </header>

      {ed.open && (
        <div className="flex min-w-0 flex-col divide-y divide-line px-4 text-ui leading-[1.6] text-ink">
          {/* 결론: 핵심 메시지 */}
          <div className="py-3">
            <div className="rounded-md border-l-[3px] border-navy bg-thead px-3 py-2.5">
              <p className={SEC}>핵심 메시지</p>
              <p className="mt-0.5 text-sm leading-[1.55] font-semibold break-keep text-navy">{c.message || "—"}</p>
            </div>
          </div>

          {/* 근거: 평가 논점(머리 = 편람 항목 등) */}
          {tx.points.length > 0 && (
            <section aria-label="평가 논점" className="flex min-w-0 flex-col gap-2 py-3">
              <h3 className={SEC}>평가 논점 {tx.points.length}</h3>
              <ol className="flex min-w-0 flex-col gap-1">
                {tx.points.map((p, i) => {
                  const on = Boolean(pointOpen[i]);
                  return (
                    <li key={i} className="flex min-w-0">
                      <button type="button" aria-expanded={on} onClick={() => setPointOpen((o) => ({ ...o, [i]: !on }))} title={on ? "한 줄로 접기" : `${p.tag ? `${p.tag} ` : ""}${p.text}`} className="flex w-full min-w-0 items-start gap-2 rounded px-0.5 text-left hover:bg-thead">
                        <span aria-hidden="true" className="mt-[2px] flex size-[18px] shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        {on ? (
                          <span className="min-w-0 grow text-ui leading-[1.6] break-keep">
                            {p.tag && <b className="block font-semibold text-navy">{p.tag}</b>}
                            {p.text}
                          </span>
                        ) : (
                          <span className="min-w-0 grow truncate text-ui leading-[1.6]">
                            {p.tag && <b className="font-semibold text-navy">{p.tag} </b>}
                            {p.text}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {/* 짜임: 이야기 틀(이유·차선) + 블록 */}
          <section aria-label="이야기 틀과 블록" className="flex min-w-0 flex-col gap-2 py-3">
            {ed.mg && <PartList ed={ed} canWrite={props.canWrite} />}
            <div className={`${ed.mg ? "hidden" : "flex"} min-w-0 items-center gap-2`}>
              <h3 className={`${SEC} shrink-0`}>이야기 틀</h3>
              <span className="min-w-0 truncate rounded-full bg-navy px-2.5 text-ui leading-6 font-semibold text-white" title={c.subStory ? `주 틀 ${c.story} · 보조 틀 ${c.subStory}(한 행·한 블록만 빌려 옴)` : c.story}>
                {storyLabel(c.story, c.subStory) || "—"}
              </span>
              {hasStoryMore && (
                // 고른 이유·차선·틀 경고는 접어 둠 — 틀 경고가 있으면 단추에 ⚠ 수로 알림
                <button type="button" aria-expanded={storyOpen} onClick={() => setStoryOpen((o) => !o)} className={`shrink-0 text-xs font-semibold hover:underline ${storyWarnings.length ? "text-warn" : "text-link"}`} title={storyWarnings.length ? `틀 경고 ${storyWarnings.length}건 — 고른 틀의 핵심 도식이 근거 부족으로 빠짐` : "AI가 이 틀을 고른 이유와 차선"}>
                  {storyOpen ? "이유 접기" : `이유 보기${storyWarnings.length ? ` · ⚠${storyWarnings.length}` : ""}`}
                </button>
              )}
              <SkeletonSelect ed={ed} can={editable} className="ml-auto h-7 w-[7.5rem] shrink-0 rounded-md border border-field-line bg-paper px-1.5 text-xs text-ink disabled:bg-thead" />
              {props.canWrite && (
                <button type="button" disabled={Boolean(busy)} onClick={() => ed.setGallery(true)} className={`${T.btn} shrink-0`} title="이야기 틀 12종 + 섞음 · 구성 패턴(도식 Pool·표준보고서) · 2025 예시 절 중에서 고르면 AI가 그 짜임으로 구성안을 다시 짭니다 — 여러 안을 만들어 견줄 수도 있음">
                  {busy === "story" ? `그 짜임으로 짜는 중…(${rangeText(draftExpect("story", ed.mg))})` : "짜임 바꾸기"}
                </button>
              )}
            </div>
            {!ed.mg && <SplitRow ed={ed} can={editable} />}
            {storyOpen && (
              <>
                {/* 고른 틀의 핵심 도식이 근거 부족으로 빠졌으면(compositionIssues 「틀:」) */}
                {storyWarnings.map((w) => (
                  <p key={w} role="note" className="rounded-md border border-warn/40 bg-warn-bg px-2.5 py-1.5 text-xs leading-5 break-keep text-warn">
                    {w.replace(/^틀:\s*/, "")}
                  </p>
                ))}
                {tx.storyWhy && <p className="min-w-0 text-ui leading-[1.6] break-keep text-muted">{tx.storyWhy}</p>}
                {tx.alternative && (
                  <p className="min-w-0 text-xs leading-5 break-keep text-muted-2">
                    <span className="mr-1 rounded-chip border border-field-line px-1 text-xs">차선</span>
                    {tx.alternative.name && <b className="font-semibold text-muted">{tx.alternative.name} — </b>}
                    {tx.alternative.why}
                  </p>
                )}
              </>
            )}

            {props.margin ? (
              // 블록 칩(여백 메모가 편집 자리): 누르면 그 블록 메모를 펼치고 그 자리로
              <div className="flex min-w-0 flex-col gap-1.5 pt-1">
                <h3 className={SEC}>
                  블록 {ed.items.length}
                  {ed.dropped.length ? ` · ${ed.dropped.length}개 뺌` : ""}
                </h3>
                <ol aria-label="블록 짜임" className="flex min-w-0 flex-wrap gap-1">
                  {ed.items.map((x, pos) => (
                    <li key={x.key} className={`min-w-0 ${partStarts(ed, pos) ? "basis-full" : ""}`}>
                      {partStarts(ed, pos) && <p className="mt-1 mb-0.5 truncate text-xs font-semibold text-navy">{partOf(ed, pos)}</p>}
                      <button
                        type="button"
                        onClick={() => revealBlock(ed, x.key, pos, true)}
                        aria-pressed={ed.openKey === x.key}
                        title={`${pos + 1}. ${x.block.label || "전폭"} · ${shapeOf(x.block)} · 배치 ${layoutName(x.block)}${x.block.purpose ? ` — ${x.block.purpose}` : ""}\n누르면 왼쪽 여백 메모에서 도식·목적·재료·배치를 고릅니다`}
                        className={`flex h-7 max-w-[210px] min-w-0 items-center gap-1 rounded-md border px-2 text-xs ${ed.openKey === x.key ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-ink hover:border-navy"}`}
                      >
                        <span className={`font-mono text-xs ${ed.openKey === x.key ? "text-white/70" : "text-muted-2"}`}>{pos + 1}</span>
                        <span className="min-w-0 truncate font-semibold">{x.block.label || "전폭"}</span>
                        {shapeOf(x.block) !== x.block.label && <span className={`min-w-0 truncate ${ed.openKey === x.key ? "text-white/80" : "text-muted-2"}`}>{shapeOf(x.block)}</span>}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              // 블록 목록(좁은 창 — 여백 메모 대신): 블록마다 한 칸, 누르면 편집 칸
              <ol aria-label="블록 목록" className="flex min-w-0 flex-col gap-2 pt-1">
                {ed.items.map((x, pos) => (
                  <li key={x.key} data-oblock={pos} className="min-w-0 rounded-md border border-line bg-paper px-3 py-2">
                    {partStarts(ed, pos) && <p className="mb-1 truncate text-xs font-semibold text-navy">{partOf(ed, pos)}</p>}
                    <button type="button" onClick={() => ed.setOpenKey((o) => (o === x.key ? null : x.key))} aria-expanded={ed.openKey === x.key} className="flex w-full min-w-0 items-center gap-2 text-left">
                      <span className="font-mono text-xs text-muted-2">{pos + 1}</span>
                      <b className="min-w-0 truncate" title={x.block.label || "전폭"}>
                        {x.block.label || <span className="font-normal text-muted-2">전폭</span>}
                      </b>
                      <span className="shrink-0 text-xs text-muted">{shapeOf(x.block)}</span>
                      {(x.block.layout || x.block.span) && <span className="shrink-0 rounded-chip border border-field-line px-1 text-xs text-muted">{layoutName(x.block)}</span>}
                      <span className="ml-auto shrink-0 text-xs text-muted-2">{view.budgets[pos] ? `약 ${view.budgets[pos]}mm` : ""}</span>
                    </button>
                    {ed.openKey === x.key ? <BlockEditor ed={ed} pos={pos} canEdit={props.canWrite} onShowMaterial={props.onShowMaterial} /> : x.block.purpose && <p className="mt-1 min-w-0 truncate text-xs text-muted">{x.block.purpose}</p>}
                  </li>
                ))}
                {ed.dropped.map((from) => (
                  <li key={`d${from}`} className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-line px-3 py-1.5 text-xs text-muted-2">
                    <span className="min-w-0 truncate line-through">
                      {ed.data!.edit.blocks[from]?.label || "전폭"} · {rowOf(data.names.table, ed.data!.edit.blocks[from]?.kind ?? "", ed.data!.edit.blocks[from]?.variant ?? "")?.name}
                    </span>
                    {props.canWrite && (
                      <button type="button" disabled={Boolean(busy)} onClick={() => ed.restore(from)} className="ml-auto shrink-0 font-semibold text-link hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
                        되살리기
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* 추진성과: 주 모양 + AI가 제안한 짜임 — 경영관리는 절마다 「추진성과」 블록이라 없음 */}
          <section aria-label="추진성과" className={`${ed.mg ? "hidden" : "flex"} min-w-0 flex-col gap-1.5 py-3`}>
            <div className="flex min-w-0 items-center gap-2">
              <h3 className={`${SEC} shrink-0`}>추진성과</h3>
              <select aria-label="추진성과 모양" disabled={!editable} value={ed.resultShape} onChange={(e) => ed.setResultShape(e.target.value)} className="ml-auto h-8 w-auto max-w-[60%] min-w-0 rounded-md border border-field-line bg-paper px-2 text-ui text-ink disabled:bg-thead" title="주 모양 하나 — 막대는 시점별 값이 모두 근거에 있을 때만 그려짐">
                {data.names.results.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            {tx.results && <p className="min-w-0 text-ui leading-[1.6] break-keep text-muted">{tx.results}</p>}
          </section>

          <MaterialList ed={ed} margin={props.margin} />

          {/* 확인할 것(결정론 점검) */}
          {(checks.length > 0 || needN > 0 || unfoundN > 0) && (
            <section aria-label="확인할 것" className="flex min-w-0 flex-col gap-1.5 py-3">
              <h3 className={SEC}>확인할 것 {checks.length + (needN || unfoundN ? 1 : 0)}</h3>
              <ul className="flex min-w-0 flex-col gap-1.5">
                {(needN > 0 || unfoundN > 0) && (
                  <li className="flex min-w-0 items-start gap-2 text-ui leading-[1.55]">
                    <span className="mt-[2px] shrink-0 rounded-chip bg-warn-bg px-1.5 text-xs leading-[18px] font-semibold text-warn">재료</span>
                    <span className="min-w-0 break-keep">
                      {needN > 0 && `자료 필요 ${needN}건 — 근거에 없어 채울 자료`}
                      {needN > 0 && unfoundN > 0 && " · "}
                      {unfoundN > 0 && `원문 못 찾음 ${unfoundN}개 — 집필에서 쓰지 않음`}{" "}
                      <button type="button" onClick={() => ed.focusMaterial(c.materials.find((m) => m.kind === "need" || !m.found)!.id)} className="font-semibold whitespace-nowrap text-link hover:underline">
                        재료 보기
                      </button>
                    </span>
                  </li>
                )}
                {checks.map((x, i) => (
                  <li key={i} className="flex min-w-0 items-start gap-2 text-ui leading-[1.55]">
                    <span className="mt-[2px] shrink-0 rounded-chip bg-warn-bg px-1.5 text-xs leading-[18px] font-semibold whitespace-nowrap text-warn">{x.tag || "확인"}</span>
                    <span className="min-w-0 break-keep">{x.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 할 일: 메모 + 저장·줄이기·다시 만들기·승인 */}
          {props.canWrite && (
            <div className="flex min-w-0 flex-col gap-2 py-3">
              <label className={T.label}>
                메모(다시 만들기·집필에 함께 보냄)
                <textarea value={ed.memo} maxLength={500} onChange={(e) => ed.setMemo(e.target.value)} disabled={Boolean(busy)} rows={2} className="min-w-0 rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-sm text-ink" placeholder="예: 추진배경은 한 줄로, 지적 해소를 앞에" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!dirty || Boolean(busy)} onClick={ed.save} className={T.btn}>
                  {busy === "save" ? "저장 중…" : "고친 내용 저장"}
                </button>
                {dirty && (
                  <button type="button" disabled={Boolean(busy)} onClick={ed.reset} className={T.btn} title="저장하지 않은 고침을 버리고 저장된 구성안으로">
                    고침 되돌리기
                  </button>
                )}
                {!ed.mg && (
                  <button type="button" disabled={dirty || Boolean(busy)} title={dirty ? "고친 내용을 먼저 저장해 주세요" : "블록 영역에 들게 두 번째 이후 불릿·띠를 빼고 칸을 줄입니다(결정론)"} onClick={() => ed.run("fit", () => saveReportOutline(props.uid, { fit: true }))} className={T.btn}>
                    {busy === "fit" ? "줄이는 중…" : "판면에 맞게 줄이기"}
                  </button>
                )}
                <button type="button" disabled={Boolean(busy)} onClick={() => ed.regenerate()} className={T.btn}>
                  {busy === "again" ? `다시 만드는 중…(${rangeText(draftExpect("again", ed.mg))})` : "메모 반영해 다시 만들기"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    ed.ask(data.hasDraft ? overwriteSteps(props.humanEdits) : [], () =>
                      ed.run("approve", async () => {
                        if (dirty) {
                          const saved = await saveReportOutline(props.uid, { edit: ed.edit });
                          if (!saved.ok) return saved;
                        }
                        return approveReportOutline(props.uid);
                      }),
                    )
                  }
                  className={`${T.btnPrimary} ml-auto`}
                >
                  {busy === "approve" ? `집필 중…(${rangeText(draftExpect("plan", ed.mg))})` : data.hasDraft ? "승인하고 다시 집필" : "승인하고 집필"}
                </button>
              </div>
              {ed.msg && (
                <p data-outline-msg role={ed.msg.ok ? "status" : "alert"} className={`text-xs leading-5 ${ed.msg.ok ? "text-muted-2" : "text-error"}`}>
                  {ed.msg.text}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {ed.askDialog}
    </section>
  );
}

/** 경영관리: 이 자리(목록 순번)에서 절이 바뀌는지 — 블록 칩·목록에 절 머리를 끼움 */
const partStarts = (ed: OutlineEdit, pos: number) => ed.mg && (pos === 0 || ed.items[pos - 1]?.block.at !== ed.items[pos]?.block.at);
/** 경영관리: 이 블록이 놓인 절 이름 */
function partOf(ed: OutlineEdit, pos: number): string {
  const at = ed.items[pos]?.block.at;
  const meta = ed.data?.outline.mg?.parts.find((p) => p.key === at);
  if (!meta) return "절 없음 — 블록을 열어 절을 고르세요";
  return partName(meta, ed.parts.find((p) => p.key === at)?.title ?? meta.title);
}

/** 고른 갈래 축의 사전 줄(정의·표준 값) */
const axisOf = (ed: OutlineEdit) => ed.data?.names.axes.find((a) => a.name === ed.split.axis) ?? null;

/** 갈래 축 고르기(사전 + 「없음」 — 축을 지우면 칩도 저장 때 빠짐) */
function AxisSelect({ ed, can, className }: { ed: OutlineEdit; can: boolean; className: string }) {
  const axes = ed.data?.names.axes ?? [];
  const cur = axisOf(ed);
  return (
    <select
      aria-label="갈래 축"
      title={cur ? `${cur.name} — ${cur.def}${cur.values.length ? ` · 표준 값: ${cur.values.join("·")}` : ""}` : "가·나·다를 나누는 축(타기관 2025 관례 — 제목 앞 [값] 칩). 실제로 갈릴 때만 고릅니다"}
      value={ed.split.axis}
      disabled={!can}
      onChange={(e) => ed.setSplit((x) => ({ ...x, axis: e.target.value }))}
      className={className}
    >
      <option value="">갈래 축 없음</option>
      {ed.split.axis && !cur && <option value={ed.split.axis}>{ed.split.axis}</option>}
      {axes.map((a) => (
        <option key={a.name} value={a.name}>
          {a.name}
        </option>
      ))}
    </select>
  );
}

/** 갈래 칩 입력(12자 — 표준 값은 목록에서 고름, 그 밖은 카드·근거에 있는 낱말만 서버가 받음) */
function ChipInput({ ed, can, label, value, onChange, className }: { ed: OutlineEdit; can: boolean; label: string; value: string; onChange: (v: string) => void; className: string }) {
  const cur = axisOf(ed);
  const list = `chip-values-${(cur?.name ?? "").replace(/[^가-힣A-Za-z0-9]/g, "")}`;
  return (
    <>
      <input
        aria-label={label}
        value={value}
        maxLength={CHIP_MAX}
        disabled={!can || !ed.split.axis}
        placeholder="[칩]"
        list={cur?.values.length ? list : undefined}
        title={`제목 앞 [값] 칩(${CHIP_MAX}자) — ${cur?.values.length ? `표준 값(${cur.values.join("·")}) 또는 ` : ""}카드·근거에 있는 낱말만(근거에서 못 찾으면 저장 때 빠짐)`}
        onChange={(e) => onChange(e.target.value.replace(/[[\]]/g, ""))}
        className={className}
      />
      {cur?.values.length ? (
        <datalist id={list}>
          {cur.values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

/** 주요사업 갈래 축·칩 한 줄(같은 실행과제 형제와 같은 축 — 칩은 이 소항목 제목 앞) */
function SplitRow({ ed, can }: { ed: OutlineEdit; can: boolean }) {
  const field = "h-7 min-w-0 rounded-md border border-field-line bg-paper px-2 text-ui text-ink disabled:bg-thead";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h3 className={`${SEC} shrink-0`}>갈래 축 · 칩</h3>
      <AxisSelect ed={ed} can={can} className={`${field} w-[9rem] min-w-0`} />
      <ChipInput ed={ed} can={can} label="갈래 칩" value={ed.split.chip} onChange={(v) => ed.setSplit((x) => ({ ...x, chip: v }))} className={`${field} w-[8rem] min-w-0`} />
    </div>
  );
}

/**
 * 경영관리 절 목록(평가내용 → 대주제 → 절): 절마다 이름·이야기 틀(주 틀 + 보조 틀 고름 — 주 틀을 바꾸면 보조 틀은 지움, 옛 구성안의 섞음은 그대로 보임)·제목(절 표지가 있을 때 — 고침)·빼기(블록이 없는 절만)·둔 이유.
 * 블록을 다른 절로 옮기는 것은 블록 편집의 「절」 고르기. 바꾸면 서버가 절 순서로 블록을 다시 세움(applyMgCompositionEdit)
 */
function PartList({ ed, canWrite }: { ed: OutlineEdit; canWrite: boolean }) {
  const meta = ed.data?.outline.mg?.parts ?? [];
  const can = canWrite && !ed.busy;
  const field = "h-7 min-w-0 rounded-md border border-field-line bg-paper px-2 text-ui text-ink disabled:bg-thead";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3 className={SEC}>절 {ed.parts.length} · 평가내용 {[...new Set(meta.map((p) => p.evalNo))].join("·") || "—"}</h3>
      <AxisSelect ed={ed} can={can} className={`${field} w-full`} />
      <ol aria-label="절 목록" className="flex min-w-0 flex-col gap-1.5">
        {ed.parts.map((p) => {
          const m = meta.find((x) => x.key === p.key);
          if (!m) return null;
          const used = ed.items.filter((x) => x.block.at === p.key).length;
          const main = (MG_MAIN_STORIES as readonly string[]).includes(p.story);
          return (
            <li key={p.key} className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-paper px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-xs font-semibold text-navy" title={partName(m, p.title)}>
                  평가내용 {m.evalNo} · 대주제 {m.themeNo} {m.themeTitle}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-2">블록 {used}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                {m.mark ? (
                  <>
                    <span className="shrink-0 text-ui font-semibold text-ink">{m.mark}.</span>
                    {ed.split.axis && <ChipInput ed={ed} can={can} label={`${m.mark}. 절 갈래 칩`} value={p.chip ?? ""} onChange={(v) => ed.setPart(p.key, { chip: v })} className={`${field} w-[6.5rem] shrink-0`} />}
                    <input aria-label={`${m.mark}. 절 제목`} value={p.title} maxLength={80} disabled={!can} onChange={(e) => ed.setPart(p.key, { title: e.target.value })} className={`${field} grow`} />
                  </>
                ) : (
                  <span className="grow text-xs text-muted-2">대주제 본문(절 없음)</span>
                )}
                <select aria-label="주 틀" title="주 틀(뼈대)" value={p.story} disabled={!can} onChange={(e) => ed.setPart(p.key, { story: e.target.value, subStory: "" })} className={`${field} w-[8.5rem] shrink-0`}>
                  <option value="">틀 —</option>
                  {p.story && !main && <option value={p.story}>{p.story}(옛 구성안)</option>}
                  {MG_MAIN_STORIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                <SkeletonSelect ed={ed} can={can} at={p.key} className={`${field} w-[7rem] shrink-0`} />
                <select aria-label="보조 틀" title="보조 틀(한 행·한 블록만 빌려 오는 틀 — 주 틀을 바꾸면 지움)" value={p.subStory ?? ""} disabled={!can || !main} onChange={(e) => ed.setPart(p.key, { subStory: e.target.value })} className={`${field} w-[8.5rem] shrink-0`}>
                  <option value="">보조 틀 —</option>
                  {MG_MAIN_STORIES.filter((s) => s !== p.story).map((s) => (
                    <option key={s} value={s}>
                      + {s}
                    </option>
                  ))}
                </select>
                {canWrite && (
                  <button
                    type="button"
                    disabled={!can || !main}
                    onClick={() => ed.regeneratePart(p.key, p.story)}
                    title={main ? `「${p.story}」 틀로 이 절의 블록을 AI가 다시 짭니다(보조 틀은 지움) — 다른 절은 그대로(${rangeText(draftExpect("story", true))})` : "먼저 주 틀을 골라 주세요"}
                    className={T.btnSm}
                  >
                    {ed.redoKey === p.key ? "다시 짜는 중…" : "이 틀로 다시 짜기"}
                  </button>
                )}
                {canWrite && (
                  <button
                    type="button"
                    disabled={!can}
                    onClick={() => ed.setPartGallery(p.key)}
                    title={`이 절을 이야기 틀·구성 패턴·2025 예시 절·요청 글로 다시 짜거나, 여러 안을 만들어 견줌(${rangeText(draftExpect("story", true))})`}
                    className={T.btnSm}
                  >
                    짜임 고르기
                  </button>
                )}
              </div>
              {ed.data?.text.partFrames[p.key] && (
                <p className="min-w-0 truncate text-xs leading-[1.5] text-muted" title={ed.data.text.partFrames[p.key]}>
                  <b className="font-semibold text-navy">짜임</b> {ed.data.text.partFrames[p.key]}
                </p>
              )}
              {m.why && <p className="min-w-0 text-xs leading-[1.5] break-keep text-muted-2">{m.why}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type MatFilter = "all" | "need" | "unfound" | "unused";

/** 재료 종류 칩 색 */
const KIND_CHIP: Record<string, string> = {
  fact: "bg-thead text-muted",
  figure: "bg-navy/10 text-navy",
  quote: "bg-link/10 text-link",
  case: "bg-accent/10 text-navy",
  need: "bg-warn/15 text-warn",
};

/**
 * 재료 목록(좁은 패널용 카드 — 2026-09-28, 예전 6칸 표는 글이 옆 칸으로 넘쳐 겹쳤음): 종류·시점·원문 확인 한 줄 + 재료 글(두 줄, 누르면 전부와 근거 원문)
 * + 출처(읽는 이름)·쓰는 블록(누르면 그 블록). 위에 거르기(자료 필요·원문 못 찾음·안 쓰는 재료).
 * 여백 메모·블록 편집에서 재료를 짚으면(ed.focusMaterial) 펼치고 거르기를 풀고 그 재료로 — draft-workspace도 data-materials·data-mat으로 찾음
 */
function MaterialList({ ed, margin }: { ed: OutlineEdit; margin: boolean }) {
  const data = ed.data!;
  const mats = data.outline.materials;
  const labels = data.names.materials;
  const sources = data.text.sources;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<MatFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  // 재료 짚기: 그리는 중에 상태를 맞추고(펼침·거르기 풀기·그 재료 펼침), 그린 뒤 그 자리로 스크롤·강조
  const focus = ed.matFocus;
  const [seen, setSeen] = useState(0);
  if (focus && focus.n !== seen) {
    setSeen(focus.n);
    setOpen(true);
    setFilter("all");
    setExpanded(focus.id);
  }
  useEffect(() => {
    if (!focus) return;
    const row = list.current?.querySelector<HTMLElement>(`[data-mat="${CSS.escape(focus.id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: still() ? "auto" : "smooth" });
    row.animate([{ background: "rgba(255,214,90,0.6)" }, { background: "rgba(255,214,90,0.6)", offset: 0.45 }, { background: "transparent" }], { duration: 2400, easing: "ease-out" });
  }, [focus]);

  if (!mats.length) return null;

  // 재료 → 쓰는 블록(지금 편집 순서)
  const uses = new Map<string, Array<{ key: string; pos: number; name: string }>>();
  ed.items.forEach((x, pos) => {
    for (const id of x.block.materials) uses.set(id, [...(uses.get(id) ?? []), { key: x.key, pos, name: x.block.label || (rowOf(data.names.table, x.block.kind, x.block.variant)?.name ?? "전폭") }]);
  });
  const test: Record<MatFilter, (m: (typeof mats)[number]) => boolean> = {
    all: () => true,
    need: (m) => m.kind === "need",
    unfound: (m) => m.kind !== "need" && !m.found,
    unused: (m) => !uses.has(m.id),
  };
  const count = (f: MatFilter) => mats.filter(test[f]).length;
  const chips: Array<[MatFilter, string]> = [
    ["all", "전체"],
    ["need", "자료 필요"],
    ["unfound", "원문 못 찾음"],
    ["unused", "안 쓰는 재료"],
  ];
  const shown = mats.filter(test[filter]);
  const found = mats.filter((m) => m.kind !== "need" && m.found).length;

  return (
    <details data-materials open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group min-w-0 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted-2 transition-transform group-open:rotate-90" />
        <h3 className={SEC}>재료 {mats.length}</h3>
        <span className="min-w-0 truncate text-xs text-muted-2">
          원문 확인 {found}
          {count("need") > 0 && <b className="ml-1.5 font-semibold text-warn">자료 필요 {count("need")}</b>}
          {count("unfound") > 0 && <b className="ml-1.5 font-semibold text-error">원문 못 찾음 {count("unfound")}</b>}
        </span>
      </summary>

      <div className="mt-2 flex min-w-0 flex-col gap-2">
        <div role="group" aria-label="재료 거르기" className="flex min-w-0 flex-wrap gap-1">
          {chips
            .filter(([k]) => k === "all" || count(k) > 0)
            .map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`h-6 rounded-full border px-2 text-xs whitespace-nowrap ${filter === k ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-ink hover:border-navy"}`}>
                {label} {count(k)}
              </button>
            ))}
        </div>

        <ul ref={list} className="flex min-w-0 flex-col gap-1.5">
          {shown.map((m) => {
            const isOpen = expanded === m.id;
            const u = uses.get(m.id) ?? [];
            const src = sources[m.id] || m.source;
            return (
              <li key={m.id} data-mat={m.id} className={`min-w-0 rounded-md border px-2.5 py-2 ${m.kind === "need" ? "border-warn/40 bg-warn-bg" : "border-line bg-paper"}`}>
                <button type="button" onClick={() => setExpanded((e) => (e === m.id ? null : m.id))} aria-expanded={isOpen} title={isOpen ? "접기" : m.quote ? "누르면 재료 전부와 근거 원문" : "누르면 재료 전부"} className="block w-full min-w-0 text-left">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs leading-5">
                    <span className="font-mono text-muted-2">{m.id}</span>
                    <span className={`shrink-0 rounded-chip px-1 font-semibold ${KIND_CHIP[m.kind] ?? KIND_CHIP.fact}`}>{labels[m.kind] ?? m.kind}</span>
                    {m.when && <span className="min-w-0 truncate text-muted">{m.when}</span>}
                    <span className={`ml-auto shrink-0 ${m.kind === "need" ? "font-semibold text-warn" : m.found ? "text-muted-2" : "font-semibold text-error"}`}>{m.kind === "need" ? "자료 필요" : m.found ? "✓ 원문 확인" : "원문 못 찾음"}</span>
                  </span>
                  <span className={`mt-0.5 block text-ui leading-[1.55] break-keep ${m.kind !== "need" && !m.found ? "text-muted" : "text-ink"} ${isOpen ? "" : "line-clamp-2"}`}>{m.text}</span>
                </button>
                {isOpen && m.quote && <blockquote className="mt-1.5 border-l-2 border-line-strong pl-2 text-xs leading-[1.55] break-keep text-muted">“{m.quote}”</blockquote>}
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-5 text-muted-2">
                  {src && (
                    <span className="max-w-full min-w-0 truncate" title={m.source}>
                      {src}
                    </span>
                  )}
                  {u.length ? (
                    u.map((x) => (
                      <button key={x.key} type="button" onClick={() => revealBlock(ed, x.key, x.pos, margin)} title={`${x.pos + 1}번 블록(${x.name})에 씀 — 누르면 그 블록`} className="flex h-6 max-w-[150px] min-w-0 items-center gap-0.5 rounded-chip border border-field-line bg-paper px-1 text-ink hover:border-navy">
                        <span className="text-muted-2">→</span>
                        <span className="font-mono text-muted-2">{x.pos + 1}</span>
                        <span className="min-w-0 truncate">{x.name}</span>
                      </button>
                    ))
                  ) : (
                    <span className="rounded-chip border border-dashed border-field-line px-1">안 씀</span>
                  )}
                </div>
              </li>
            );
          })}
          {!shown.length && <li className="text-xs text-muted-2">해당 재료가 없습니다.</li>}
        </ul>
      </div>
    </details>
  );
}
