"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { runCardComments } from "../../../app/(app)/cards/actions";
import type { VerifiedEdit } from "../../../lib/ai/comments.ts";
import { type CommentBatch, type TaggedEdit, editTargets, mergeEdits, toggleComment } from "../../../lib/cards/patch.ts";
import type { LooseJson } from "../../../lib/loose-json.ts";


/**
 * 카드 리뷰어 코멘트 흐름(report-harness 리뷰어를 카드에 옮긴 것):
 *  보냄(5초 안에 되돌리기) → AI 처리 중(모은 코멘트를 한 번에) → 반영됨·답변·반영 안 함·충돌.
 * AI 편집은 보낼 때 카드 기준이고, 기다리는 동안 사용자가 고친 묶음은 덮지 않습니다(lib/cards/patch.ts).
 * 코멘트 목록은 이 브라우저 탭에만 둡니다(sessionStorage) — 카드 수정 기록은 평소처럼 수정 이력에 남습니다.
 */

export type NoteKind = "edit" | "ask" | "keep";
export type NoteStatus = "grace" | "queued" | "sending" | "applied" | "partial" | "answered" | "declined" | "conflict" | "error" | "kept" | "undone";

export interface ReviewTarget {
  /** 고른 글이 있는 첫 칸 */
  path: string | null;
  /** 고른 글이 걸친 칸들 */
  paths: string[];
  quote: string;
}

export interface ReviewNote extends ReviewTarget {
  id: string;
  kind: NoteKind;
  text: string;
  at: number;
  status: NoteStatus;
  reply?: string;
  edits?: VerifiedEdit[];
  /** 그사이 사용자가 고쳐 반영하지 않은 묶음 */
  conflicts?: string[];
  batchId?: string;
  error?: string;
}

export interface ToastSpec {
  text: string;
  /** 초읽기(글의 {n}을 남은 초로) */
  countdown?: number;
  action?: { label: string; run: () => void };
  tone?: "warn";
  ms?: number;
}

export const GRACE_MS = 5_000;
const MAX_BATCH = 12;
const TRANSIENT: NoteStatus[] = ["grace", "queued", "sending"];

const storeKey = (uid: string) => `card-review|${uid}`;
function load(uid: string): ReviewNote[] {
  try {
    const raw = sessionStorage.getItem(storeKey(uid));
    const list = raw ? (JSON.parse(raw) as ReviewNote[]) : [];
    // 창을 닫는 사이 끊긴 요청은 다시 보내기로
    return list.map((n) => (TRANSIENT.includes(n.status) ? { ...n, status: "error", error: "창을 닫아 결과를 받지 못했습니다. 다시 보내 주세요." } : n));
  } catch {
    return [];
  }
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

export function useCardReview(opts: {
  uid: string;
  readOnly: boolean;
  locked?: string[];
  getCard: () => LooseJson;
  /** AI 편집을 합친 카드를 편집기에 넣음(다시 그리기·바뀐 곳 표시·자동 저장) */
  applyCard: (next: LooseJson) => void;
  toast: (t: ToastSpec | null) => void;
}) {
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const notesRef = useRef<ReviewNote[]>([]);
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });
  const batches = useRef(new Map<string, CommentBatch>());
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const loaded = useRef(false);

  const commit = useCallback((next: ReviewNote[]) => {
    notesRef.current = next;
    setNotes(next);
    try {
      sessionStorage.setItem(storeKey(optsRef.current.uid), JSON.stringify(next.slice(-60)));
    } catch {
      // 저장 공간이 없어도 화면은 그대로
    }
  }, []);
  const update = useCallback((fn: (n: ReviewNote) => ReviewNote) => commit(notesRef.current.map(fn)), [commit]);

  useEffect(() => {
    alive.current = true;
    if (!loaded.current) {
      loaded.current = true;
      commit(load(opts.uid));
    }
    return () => {
      alive.current = false;
      if (graceTimer.current) clearTimeout(graceTimer.current);
    };
  }, [opts.uid, commit]);

  const sendBatch = useCallback(async (queued: ReviewNote[]): Promise<void> => {
    const ids = new Set(queued.map((n) => n.id));
    update((n) => (ids.has(n.id) ? { ...n, status: "sending", error: undefined } : n));
    const o = optsRef.current;
    const snapshot = structuredClone(o.getCard());
    const keeps = notesRef.current.filter((n) => n.kind === "keep" && n.status === "kept" && n.path).map((n) => ({ path: n.path!, quote: n.quote }));
    const payload = JSON.stringify({
      card: snapshot,
      comments: queued.map((n) => ({ id: n.id, kind: n.kind, path: n.path, paths: n.paths, quote: n.quote, text: n.text })),
      keeps,
    });
    let res: Awaited<ReturnType<typeof runCardComments>>;
    try {
      res = await runCardComments(o.uid, payload);
    } catch {
      res = { ok: false, message: "AI에 보내지 못했습니다(연결이 끊겼습니다). 다시 보내 주세요." };
    }
    if (!alive.current) return;
    if (!res.ok) {
      const message = res.message;
      update((n) => (ids.has(n.id) ? { ...n, status: "error", error: message } : n));
      optsRef.current.toast({ text: message, tone: "warn", ms: 6000 });
      return;
    }
    const batchId = newId();
    const tagged: TaggedEdit[] = res.comments.flatMap((c) => c.edits.map((e) => ({ commentId: c.id, path: e.path, op: e.op, lines: e.lines })));
    let applied: Record<string, string[]> = {};
    let conflicts: Record<string, string[]> = {};
    if (tagged.length && !optsRef.current.readOnly) {
      const targets = editTargets(snapshot, optsRef.current.locked);
      const m = mergeEdits(optsRef.current.getCard(), snapshot, tagged, targets);
      applied = m.applied;
      conflicts = m.conflicts;
      if (Object.keys(applied).length) optsRef.current.applyCard(m.card);
      batches.current.set(batchId, { snapshot, edits: tagged, targets, state: Object.fromEntries(Object.entries(applied).map(([id, containers]) => [id, { containers, applied: true }])) });
    }
    const byId = new Map(res.comments.map((c) => [c.id, c]));
    update((n) => {
      const c = byId.get(n.id);
      if (!c) return n;
      if (c.outcome !== "edited") return { ...n, status: c.outcome, reply: c.reply, edits: [], batchId };
      const a = applied[n.id] ?? [];
      const cf = conflicts[n.id] ?? [];
      const status: NoteStatus = a.length ? (cf.length ? "partial" : "applied") : cf.length ? "conflict" : "declined";
      const reply = status === "declined" ? `${c.reply} (바뀐 글이 없어 반영하지 않았습니다.)`.trim() : c.reply;
      return { ...n, status, reply, edits: c.edits, conflicts: cf, batchId };
    });
    const done = res.comments;
    const nApplied = done.filter((c) => applied[c.id]?.length).length;
    const nAnswered = done.filter((c) => c.outcome === "answered").length;
    const nConflict = done.filter((c) => conflicts[c.id]?.length).length;
    const parts = [nApplied ? `카드에 반영 ${nApplied}` : "", nAnswered ? `답변 ${nAnswered}` : "", nConflict ? `충돌 ${nConflict}` : ""].filter(Boolean);
    optsRef.current.toast({ text: `AI가 코멘트 ${done.length}개를 처리했습니다${parts.length ? ` — ${parts.join(" · ")}` : ""}.`, ms: 5000 });
  }, [update]);

  /** 보낼 차례인 코멘트를 한 번에(최대 12개) — 처리하는 동안 쌓인 코멘트는 이어서 다음 묶음으로 */
  const dispatch = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      for (;;) {
        if (!alive.current) return;
        const queued = notesRef.current.filter((n) => n.status === "queued").slice(0, MAX_BATCH);
        if (!queued.length) return;
        await sendBatch(queued);
      }
    } finally {
      inFlight.current = false;
    }
  }, [sendBatch]);

  /** 보냄 상태 코멘트를 모두 넘김(마지막 코멘트 뒤 5초) */
  const release = useCallback(() => {
    graceTimer.current = null;
    update((n) => (n.status === "grace" ? { ...n, status: "queued" } : n));
    void dispatch();
  }, [update, dispatch]);

  const add = useCallback(
    (target: ReviewTarget, kind: NoteKind, text: string): ReviewNote => {
      const note: ReviewNote = { ...target, id: newId(), kind, text: text.trim(), at: Date.now(), status: kind === "keep" ? "kept" : "grace" };
      commit([...notesRef.current, note]);
      if (kind !== "keep") {
        if (graceTimer.current) clearTimeout(graceTimer.current);
        graceTimer.current = setTimeout(release, GRACE_MS);
      }
      return note;
    },
    [commit, release],
  );

  /** 보냄(5초 안) 코멘트 거두기 — 쓰던 글을 돌려줌 */
  const cancel = useCallback(
    (id: string): ReviewNote | null => {
      const note = notesRef.current.find((n) => n.id === id);
      if (!note || note.status !== "grace") return null;
      commit(notesRef.current.filter((n) => n.id !== id));
      if (!notesRef.current.some((n) => n.status === "grace") && graceTimer.current) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
      return note;
    },
    [commit],
  );

  const retry = useCallback(
    (id: string) => {
      update((n) => (n.id === id && (n.status === "error" || n.status === "conflict" || n.status === "declined") ? { ...n, status: "queued", error: undefined, reply: undefined, edits: undefined, conflicts: undefined } : n));
      void dispatch();
    },
    [update, dispatch],
  );

  const remove = useCallback((id: string) => commit(notesRef.current.filter((n) => n.id !== id || TRANSIENT.includes(n.status))), [commit]);

  /** 코멘트 하나의 AI 반영 되돌리기·다시 반영 */
  const toggle = useCallback(
    (id: string): boolean => {
      const note = notesRef.current.find((n) => n.id === id);
      const batch = note?.batchId ? batches.current.get(note.batchId) : undefined;
      if (!note || !batch || !batch.state[id]) {
        optsRef.current.toast({ text: "이 반영은 되돌릴 수 없습니다(창을 다시 열었거나 오래된 반영). 수정 이력에서 확인해 주세요.", tone: "warn", ms: 6000 });
        return false;
      }
      const on = !batch.state[id].applied;
      const r = toggleComment(optsRef.current.getCard(), batch, id, on);
      if (!r.ok) {
        optsRef.current.toast({ text: "그 뒤 같은 곳을 다시 고쳐 되돌릴 수 없습니다. 필요하면 직접 고치거나 수정 이력을 보세요.", tone: "warn", ms: 6000 });
        return false;
      }
      batch.state[id] = { ...batch.state[id], applied: on };
      optsRef.current.applyCard(r.card);
      update((n) => (n.id === id ? { ...n, status: on ? (n.conflicts?.length ? "partial" : "applied") : "undone" } : n));
      return true;
    },
    [update],
  );

  const canToggle = useCallback((n: ReviewNote) => Boolean(n.batchId && batches.current.get(n.batchId)?.state[n.id]), []);

  /** 보냄·처리 중인 코멘트가 있나(창을 닫으면 결과를 못 받음) */
  const busy = useCallback(() => notesRef.current.some((n) => TRANSIENT.includes(n.status)), []);

  return { notes, add, cancel, retry, remove, toggle, canToggle, busy };
}
