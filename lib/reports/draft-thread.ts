// 경평 초안 과제별 초안(/reports/cards/<uid>) 오른쪽 「AI 초안」 대화(순수 — 2026-11-04 사용자 결정 「ChatGPT처럼 요청 → 짧은 답」).
// 대화 기록은 DB에 이미 있는 값으로만 다시 그림: card_report_drafts(구성안·outline_at·outline_status·outline_approved_at·초안 spec·updated_at)와
// report_draft_edits(블록 고치기 이력) — 다른 PC·다른 사람에게도 같은 차례. 지금 도는 요청·실패 알림은 화면 상태(components/reports/draft-compose.tsx).
// 할 일(「채울 자료」)은 예전 「점검 결과」 탭(채울 자료·확인할 것·근거 약한 문장·성과관리팀 코멘트)을 행동별로 묶은 목록 하나 — 마지막 답에 붙음.
// 경고를 만드는 코드(compositionIssues·verifySection·warning-levels.ts)는 그대로 두고 여기서는 묶고 보이는 글만 정함.

import { type FitTone, LINE_MM, fitVerdict } from "./fit.ts";
import { warningHead, warningLevel } from "./warning-levels.ts";

/** 판면 한 마디(mm 대신 — 판정은 fitVerdict 하나, 문턱·mm는 title) */
export interface FitWord {
  text: string;
  title: string;
  tone: FitTone;
}

/**
 * 판면 어림 → 한 마디: 「1쪽에 맞음」 · 「N줄쯤 빔」 · 「조금 넘침」 · 「넘침」. 판정은 lib/reports/fit.ts fitVerdict(95~102% 맞음) 그대로,
 * 빈 줄 수는 남은 mm ÷ 본문 한 줄 높이(LINE_MM). 예산이 없으면(경영관리 — 판면 어림 없음) null
 */
export function fitWord(fit: { total: number; budget: number } | null | undefined, module: number): FitWord | null {
  if (!fit || !fit.budget) return null;
  const pct = Math.round((fit.total / fit.budget) * 100);
  const v = fitVerdict(pct);
  const text = v.level === "ok" ? `${module}쪽에 맞음` : v.level === "under" ? `${Math.max(1, Math.round((fit.budget - fit.total) / LINE_MM))}줄쯤 빔` : v.level === "slight" ? "조금 넘침" : "넘침";
  return { text, title: `${v.hint} · 판면 어림 ${pct}%`, tone: v.tone };
}

/** 저장된 구성안(없으면 null) — 화면 글은 부르는 쪽이 읽는 이름으로 만들어 넘김(lib/reports/outline-text.ts) */
export interface ThreadOutlineIn {
  /** outline_at(구성안을 AI가 만든 때 — 고쳐 저장해도 그대로) */
  at: string | null;
  /** outline_status = approved */
  approved: boolean;
  /** outline_approved_at(구성안대로 집필·자료 반영 고치기가 초안을 저장할 때 같이 찍힘) */
  approvedAt: string | null;
  /** 이야기 틀 이름(주요사업 — 경영관리는 절마다라 빈 글) */
  story: string;
  blocks: number;
  /** 경영관리 절(이름 · 틀) */
  parts: Array<{ name: string; story: string }>;
  /** 구성안 판면 어림(주요사업 — 경영관리는 null) */
  fit: { total: number; budget: number } | null;
  module: number;
  message: string;
  points: Array<{ tag: string; text: string }>;
  /** 자료 필요 재료 글 */
  needs: string[];
  /** 만들 때 고른 짜임 · 요청 글 */
  frame: string;
  memo: string;
}

/** 지금 초안(없으면 null) */
export interface ThreadDraftIn {
  updatedAt: string | null;
  /** 구성안대로 쓴 초안(spec.plan) */
  plan: boolean;
  /** 자료 반영 고치기로 쓴 초안(spec.plan.revise) */
  revise?: boolean;
  fit: { total: number; budget: number } | null;
  module: number;
  /** 초안을 만든 뒤 원장이 바뀜 */
  stale: boolean;
  /** 답 첫 줄의 title(편람 논점 낱말 신호 등 — 판정이 아닌 덧말) */
  note?: string;
}

/** 블록 고치기 이력 한 줄(report_draft_edits) */
export interface ThreadEditIn {
  id: number;
  /** -1 = 추진성과 상자 */
  blockIndex: number;
  kind: "edit" | "undo";
  request: string;
  at: string;
  refId: number | null;
}

interface TurnBase {
  key: string;
  /** 보인 시각(모르면 null — 집필 뒤 고친 구성안 등) */
  at: string | null;
  /** 요청 말풍선 머리 · 아래 줄 */
  ask: string;
  askLines: string[];
  /** 답 첫 줄 */
  headline: string;
}

export type ThreadTurn =
  | (TurnBase & {
      kind: "outline";
      /** 한 줄 요약(「AX 전환형 · 블록 6 · 1쪽에 맞음」) */
      summary: string;
      fit: FitWord | null;
      approved: boolean;
      message: string;
      points: Array<{ tag: string; text: string }>;
      parts: Array<{ name: string; story: string }>;
      needs: string[];
    })
  | (TurnBase & {
      kind: "draft";
      plan: boolean;
      fit: FitWord | null;
      stale: boolean;
      /** 목록에 다 싣지 않은 앞선 블록 고치기 수(수정 이력에서 봄) */
      olderEdits: number;
      note: string;
    })
  | (TurnBase & { kind: "edit"; edit: "edit" | "shape" | "undo"; blockIndex: number });

/** 대화에 싣는 블록 고치기 최대 수(나머지는 수정 이력) */
export const THREAD_EDIT_MAX = 10;
/** 직접 고침(글을 두 번 눌러 고침 — AI 요청이 아님, 자동 저장마다 한 줄)은 대화에 싣지 않음 */
const DIRECT = "직접 고침";
const SHAPE_HEAD = /^모양 바꾸기\s*—\s*/;

const time = (s: string | null | undefined) => (s ? Date.parse(s) : Number.NaN);

/** 블록 자리 이름과 목적격(「3번 블록을」 · 「추진성과를」) */
function where(blockIndex: number) {
  return blockIndex < 0 ? { name: "추진성과", obj: "추진성과를" } : { name: `${blockIndex + 1}번 블록`, obj: `${blockIndex + 1}번 블록을` };
}

function editTurn(e: ThreadEditIn): ThreadTurn {
  const w = where(e.blockIndex);
  const edit = e.kind === "undo" ? "undo" : SHAPE_HEAD.test(e.request) ? "shape" : "edit";
  const req = e.request.replace(SHAPE_HEAD, "").trim();
  return {
    kind: "edit",
    key: `e${e.id}`,
    at: e.at,
    edit,
    blockIndex: e.blockIndex,
    ask: edit === "undo" ? `${w.name} 되돌리기` : edit === "shape" ? `${w.name} 모양 바꾸기` : `${w.name} 고치기`,
    askLines: edit === "undo" || !req ? [] : [req],
    headline: edit === "undo" ? `${w.obj} 되돌렸어요` : edit === "shape" ? `${w.name} 모양을 바꿨어요` : `${w.obj} 고쳤어요`,
  };
}

/**
 * 저장된 값 → 대화 차례(오래된 것 위). 순서 규칙:
 *  - 승인된 구성안(또는 구성안 뒤 바로 만들기): 구성안 → 초안 → 그 뒤 블록 고치기
 *  - 승인 전 구성안인데 초안이 있음(초안 뒤 다시 만든 구성안 · 구성안대로 쓴 뒤 고쳐 저장한 구성안): 초안 → 블록 고치기 → 구성안(마지막 차례)
 * 초안 시각: 구성안대로 쓴 초안은 outline_approved_at(쓴 때), 그 밖은 updated_at(마지막 저장 — 블록 고치기도 바꿈).
 * 블록 고치기: 직접 고침과 그 되돌리기는 뺌, 구성안대로 쓴 초안은 쓴 때 뒤만, 바로 만들기 초안은 구성안 시각 뒤만(구성안이 없으면 남은 이력 전부 —
 * 바로 만들기를 여러 번 했으면 앞 초안의 고치기도 섞일 수 있음, 쓴 때를 저장하지 않아서), 최근 THREAD_EDIT_MAX개.
 */
export function draftThread(i: { outline: ThreadOutlineIn | null; draft: ThreadDraftIn | null; edits: ThreadEditIn[] }): ThreadTurn[] {
  const { outline: o, draft: d } = i;
  const draftFirst = Boolean(o && d && !o.approved && (d.plan || time(o.at) > time(d.updatedAt)));
  // 구성안대로 쓴 뒤 고쳐 저장한 구성안(만든 때는 초안보다 앞) — 시각을 보이지 않음
  const edited = Boolean(draftFirst && d?.plan && !(time(o?.at) > time(d?.updatedAt)));
  const draftAt = d?.plan && o?.approved && o.approvedAt ? o.approvedAt : null;
  const since = draftAt ?? (o && !draftFirst ? o.at : null);

  const byId = new Map(i.edits.map((e) => [e.id, e] as const));
  const picked = i.edits
    .filter((e) => (e.kind === "undo" ? byId.get(e.refId ?? -1)?.request !== DIRECT : e.request !== DIRECT))
    .filter((e) => since === null || time(e.at) > time(since))
    .sort((a, b) => time(a.at) - time(b.at) || a.id - b.id);
  const shown = picked.slice(-THREAD_EDIT_MAX);
  const olderEdits = picked.length - shown.length;

  const outlineTurn = (): ThreadTurn | null => {
    if (!o) return null;
    const fit = fitWord(o.fit, o.module);
    const head = o.parts.length ? `절 ${o.parts.length}` : o.story;
    return {
      kind: "outline",
      key: `o${o.at ?? ""}`,
      at: edited ? null : o.at,
      ask: "구성안 만들기",
      askLines: [o.frame ? `짜임: ${o.frame}` : "", o.memo].filter(Boolean),
      headline: edited ? "구성안을 고쳤어요(아직 승인 전)" : "구성안을 만들었어요",
      summary: [head, `블록 ${o.blocks}`, fit?.text ?? ""].filter(Boolean).join(" · "),
      fit,
      approved: o.approved,
      message: o.message,
      points: o.points,
      parts: o.parts,
      needs: o.needs,
    };
  };
  const draftTurn = (): ThreadTurn | null =>
    d
      ? {
          kind: "draft",
          key: `d${d.updatedAt ?? ""}`,
          at: draftAt ?? d.updatedAt,
          ask: d.revise ? "자료 반영 고치기" : d.plan ? "구성안대로 집필" : "바로 만들기",
          askLines: [],
          headline: d.revise ? "자료를 반영해 다시 썼어요(왼쪽 종이)" : d.plan ? "초안을 썼어요(왼쪽 종이)" : "구성안 없이 초안을 썼어요(왼쪽 종이)",
          plan: d.plan,
          fit: fitWord(d.fit, d.module),
          stale: d.stale,
          olderEdits,
          note: d.note ?? "",
        }
      : null;

  const out: Array<ThreadTurn | null> = [];
  if (draftFirst) {
    const cut = edited ? Number.POSITIVE_INFINITY : time(o?.at);
    out.push(draftTurn(), ...shown.filter((e) => !(time(e.at) > cut)).map(editTurn), outlineTurn(), ...shown.filter((e) => time(e.at) > cut).map(editTurn));
  } else {
    out.push(outlineTurn(), draftTurn(), ...(d ? shown.map(editTurn) : []));
  }
  return out.filter((t): t is ThreadTurn => t !== null);
}

/** 할 일 한 줄 — jump가 있으면 누르면 왼쪽 종이의 그 자리(components/reports/draft-workspace.tsx onJump — data-jump와 같은 값) */
export interface TodoItem {
  text: string;
  /** 회색 덧말 */
  note?: string;
  /** 글이 바뀐 줄의 원문(title) */
  title?: string;
  jump?: { kind: "need" | "fig" | "weak" | "comment"; text?: string; nth?: number; block?: number };
  /** 카드 화면으로(원장에 올해 실적 넣기 — AI 작성지원 「실적 반영」) */
  card?: boolean;
  /** 경고 등급(문장 고치기 — 막힘이면 앞) */
  level?: "block" | "info";
  /** 성과관리팀 코멘트가 미해결 */
  open?: boolean;
}

export type TodoKey = "comment" | "card" | "upload" | "text";
export interface TodoGroup {
  key: TodoKey;
  title: string;
  hint: string;
  items: TodoItem[];
}

export interface TodoInput {
  year: number;
  /** 원장에 올해 실적이 없는 계량 지표(lib/reports/actuals.ts kpiGaps) */
  kpi: Array<{ name: string; unit?: string; target?: string; prev?: string }>;
  /** 초안의 【확인: …】 자리표시 */
  needs: string[];
  /** 그림 자리표시(종류 이름 · 설명 · 같은 설명 중 몇 번째) */
  figures: Array<{ label: string; desc: string; nth: number }>;
  /** 초안 경고(card_report_drafts.warnings) */
  warnings: string[];
  /** 근거 약한 문장 */
  weak: string[];
  /** 아직 집필하지 않은 구성안의 자료 필요 재료 */
  outlineNeeds: string[];
  /** 성과관리팀 코멘트(이 과제) — meta = 「종류 · 쓴 사람 · 때」 */
  comments: Array<{ body: string; meta: string; blockIndex: number | null; open: boolean }>;
}

const GROUP: Record<TodoKey, { title: string; hint: string }> = {
  comment: { title: "성과관리팀 코멘트", hint: "블록 번호를 누르면 왼쪽 종이의 그 블록으로" },
  card: { title: "카드에 실적 넣기", hint: "원장 카드에 올해 실적을 넣고 다시 쓰면 노란 칸이 채워집니다" },
  upload: { title: "자료 올리기", hint: "근거 자료(📎)나 사진을 넣을 자리입니다" },
  text: { title: "문장 고치기", hint: "누르면 왼쪽 종이의 그 자리로 — 글을 두 번 눌러 고치거나 끌어 골라 AI에 고쳐 달라고 합니다" },
};

/** 경고 앞머리 → 행동 묶음(나머지는 문장 고치기) */
const HEAD_GROUP: Record<string, TodoKey> = { "올해 실적": "card", 첨부: "upload", 그림: "upload", "그림 자리": "upload" };

/** 판면 경고는 mm 대신 뜻으로(원문은 title) */
function plainWarning(w: string): { text: string; title?: string } {
  if (/^판면: .*넘칩니다/.test(w)) return { text: "판면: 배정 쪽을 넘침 — 칸 글·블록을 줄여 주세요", title: w };
  if (/^판면: .*빕니다/.test(w)) return { text: "판면: 배정 쪽에 빈 곳이 남음 — 채울 곳이 있으면 채움", title: w };
  return { text: w };
}

/**
 * 할 일 묶음(빈 묶음은 뺌): 성과관리팀 코멘트 → 카드에 실적 넣기(원장 실적 없음·【확인】·올해 실적 경고) → 자료 올리기(구성안 자료 필요·그림 자리·첨부·그림 경고)
 * → 문장 고치기(막힘 경고 → 근거 약한 문장 → 참고 경고). count는 코멘트 중 미해결만 셈.
 */
export function draftTodo(i: TodoInput): { groups: TodoGroup[]; count: number } {
  const g: Record<TodoKey, TodoItem[]> = { comment: [], card: [], upload: [], text: [] };
  for (const c of i.comments) g.comment.push({ text: c.body, note: c.meta, open: c.open, ...(c.blockIndex !== null ? { jump: { kind: "comment", block: c.blockIndex } } : {}) });
  for (const k of i.kpi) g.card.push({ text: `${k.name}${k.unit ? `(${k.unit})` : ""} ${i.year}년 실적이 원장에 없음`, note: `목표 ${k.target || "—"} · 전년 ${k.prev || "—"}`, card: true });
  for (const n of i.needs) g.card.push({ text: n, note: "초안의 노란 칸", jump: { kind: "need", text: n } });
  for (const n of i.outlineNeeds) g.upload.push({ text: n, note: "구성안이 근거에서 찾지 못한 재료" });
  for (const f of i.figures) g.upload.push({ text: `${f.label} — ${f.desc}`, note: "초안의 빗금 칸(사진·그림 자리)", jump: { kind: "fig", text: f.desc, nth: f.nth } });
  const textBlock: TodoItem[] = [];
  const textInfo: TodoItem[] = [];
  for (const w of i.warnings) {
    const level = warningLevel(w);
    const key = HEAD_GROUP[warningHead(w)] ?? "text";
    const item: TodoItem = { ...plainWarning(w), level };
    if (key !== "text") g[key].push(item);
    else (level === "block" ? textBlock : textInfo).push(item);
  }
  const weak = i.weak.map((w): TodoItem => ({ text: w.replace(/\*\*/g, ""), note: "근거와 겹치는 말이 적은 문장 — 원자료로 확인", jump: { kind: "weak", text: w } }));
  g.text.push(...textBlock, ...weak, ...textInfo);
  const groups = (Object.keys(GROUP) as TodoKey[]).filter((k) => g[k].length).map((k) => ({ key: k, ...GROUP[k], items: g[k] }));
  const count = g.card.length + g.upload.length + g.text.length + g.comment.filter((x) => x.open).length;
  return { groups, count };
}

/** 화면에 넘기는 대화 재료(app/(app)/reports/cards/[uid]/derive.ts threadOf) */
export interface DraftThreadData {
  turns: ThreadTurn[];
  todo: { groups: TodoGroup[]; count: number };
  /** 머리 한 줄 상태 */
  status: string;
  /** 「확정은 경평 초안 허브에서」 등(없으면 null) */
  submit: { href: string; label: string } | null;
}

/** 머리 한 줄 상태(예전 단계 레일 자리): 「초안 있음 · 채울 자료 4」 · 「구성안 확인 전」 등 */
export function threadStatus(i: { hasOutline: boolean; approved: boolean; hasDraft: boolean; stale: boolean; todo: number; locked: boolean }): string {
  if (i.locked) return "확정한 보고서 · 읽기만";
  const todo = i.todo ? `채울 자료 ${i.todo}` : "";
  if (i.hasDraft) return [i.stale ? "원장이 바뀜 · 다시 쓰기 권장" : "초안 있음", i.hasOutline && !i.approved ? "새 구성안 확인 전" : "", todo].filter(Boolean).join(" · ");
  if (i.hasOutline) return [i.approved ? "구성안 승인 · 집필 전" : "구성안 확인 전", todo].filter(Boolean).join(" · ");
  return ["구성안부터", todo].filter(Boolean).join(" · ");
}
