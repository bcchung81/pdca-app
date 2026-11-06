"use client";

// AI 백그라운드 작업 상태 저장소(브라우저 한 탭에 하나 — 머리띠 「AI 작업 N건」·과제원장 AI 작성지원·카드 리뷰어·경평 초안 대화가 함께 씀).
// 진행 상태는 서버 액션이 아닌 GET /api/ai/requests로 읽음(서버 액션은 한 번에 하나씩 줄을 서서 자동 저장을 막음 — Next 07-mutating-data.md).
// 진행 중 작업이 있거나 막 시작한 작업을 아직 서버에서 못 봤을 때만, 창이 보일 때만 JOB_POLL_MS마다 다시 읽고(lib/ai/jobs.ts shouldPoll), 끝나면 멈춤.
// 창이 다시 보이면 한 번 읽음(다른 탭·다른 PC에서 시작한 작업도 이때 잡힘).

import { useEffect, useSyncExternalStore } from "react";
import { type AiJob, JOB_KINDS, JOB_POLL_MS, type JobKind, type JobResultRow, finishedSince, shouldPoll } from "../../lib/ai/jobs.ts";

const EMPTY: AiJob[] = [];
let jobs: AiJob[] = EMPTY;
/** 이 탭에서 시작했거나 기다리는 작업 id(창 밖이어도 그 id는 함께 물음) */
const watch = new Set<number>();
const listeners = new Set<() => void>();
const doneListeners = new Set<(done: AiJob[]) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;
let booted = false;

const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
const emit = () => {
  for (const l of listeners) l();
};

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  const unseen = [...watch].filter((id) => !jobs.some((j) => j.id === id && j.state !== "running"));
  if (shouldPoll(jobs, unseen, visible())) timer = setTimeout(() => void refreshAiJobs(), JOB_POLL_MS);
}

/** 서버에서 다시 읽음(겹쳐 부르면 진행 중인 읽기를 기다림). 끝난 작업은 끝 알림 구독자에게 */
export function refreshAiJobs(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ids = [...watch];
      const res = await fetch(`/api/ai/requests${ids.length ? `?ids=${ids.join(",")}` : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { jobs?: AiJob[] };
      const fresh = Array.isArray(body.jobs) ? body.jobs : [];
      // 막 시작해 아직 서버 목록에 안 보이는 작업(자리 표시)은 1분까지 남김
      const keep = jobs.filter((j) => j.state === "running" && !fresh.some((f) => f.id === j.id) && watch.has(j.id) && Date.now() - Date.parse(j.at) < 60_000);
      const next = [...fresh, ...keep];
      const done = finishedSince(jobs, next);
      for (const j of next) if (j.state !== "running") watch.delete(j.id);
      jobs = next;
      emit();
      if (done.length) for (const l of doneListeners) l(done);
    } catch {
      // 연결이 끊기면 다음 차례에 다시
    } finally {
      inflight = null;
      schedule();
    }
  })();
  return inflight;
}

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  const onShow = () => {
    if (visible()) void refreshAiJobs();
    else schedule();
  };
  document.addEventListener("visibilitychange", onShow);
  window.addEventListener("focus", onShow);
  void refreshAiJobs();
}

/** 이 탭에서 작업을 시작함(서버 액션이 requestId를 돌려준 직후) — 자리 표시를 넣고 곧바로 읽기 시작 */
export function trackAiJob(id: number, kind: JobKind, card?: { uid: string; taskNo?: string; title?: string } | null) {
  watch.add(id);
  if (!jobs.some((j) => j.id === id)) {
    jobs = [{ id, kind, feature: JOB_KINDS[kind].feature, mode: null, state: "running", message: "", at: new Date().toISOString(), endAt: null, card: card ? { uid: card.uid, taskNo: card.taskNo ?? "", title: card.title ?? "" } : null }, ...jobs];
    emit();
  }
  boot();
  void refreshAiJobs();
}

/** 작업 하나가 끝날 때까지(끝난 작업을 돌려줌) — 부르는 화면이 사라져도 폴링은 저장소가 계속함 */
export function waitAiJob(id: number): Promise<AiJob> {
  watch.add(id);
  boot();
  return new Promise((resolve) => {
    const check = () => {
      const j = jobs.find((x) => x.id === id);
      if (j && j.state !== "running") {
        listeners.delete(check);
        resolve(j);
      }
    };
    listeners.add(check);
    check();
    void refreshAiJobs();
  });
}

/** 끝난 작업 결과(ai_results — 본인만). 못 읽으면 빈 목록 */
export async function fetchAiResults(q: { ids?: number[]; card?: string; features?: readonly string[] }): Promise<JobResultRow[]> {
  const p = new URLSearchParams();
  if (q.ids?.length) p.set("ids", q.ids.join(","));
  if (q.card) p.set("card", q.card);
  if (q.features?.length) p.set("feature", q.features.join(","));
  try {
    const res = await fetch(`/api/ai/results?${p}`, { cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { results?: JobResultRow[] };
    return Array.isArray(body.results) ? body.results : [];
  } catch {
    return [];
  }
}

/**
 * 서버 액션의 시작 결과를 끝까지 기다림(경평 초안 단추들 — 예전 동기 액션과 같은 { ok, message }를 돌려줌). requestId가 없으면(검증 거절·결정론 저장) 그대로.
 * onStart = 작업 id를 받자마자(진행 줄이 그 작업을 이어받게)
 */
export async function settleAiJob<T extends { ok: boolean; message: string; requestId?: number }>(started: Promise<T>, kind: JobKind, o: { card?: { uid: string } | null; onStart?: (id: number) => void } = {}): Promise<{ ok: boolean; message: string; requestId?: number }> {
  const r = await started;
  if (!r.ok || !r.requestId) return r;
  trackAiJob(r.requestId, kind, o.card);
  o.onStart?.(r.requestId);
  const j = await waitAiJob(r.requestId);
  return { ok: j.state === "ok", message: j.message, requestId: r.requestId };
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => jobs;
const serverSnapshot = () => EMPTY;

/** 이 사용자의 최근 작업(진행 중 + 30분 안에 끝난 것). 붙으면 한 번 읽기 시작 */
export function useAiJobs(): AiJob[] {
  useEffect(() => boot(), []);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** 작업이 끝날 때마다(이 탭에서 진행 중으로 본 것) */
export function useAiJobsDone(fn: (done: AiJob[]) => void) {
  useEffect(() => {
    doneListeners.add(fn);
    return () => {
      doneListeners.delete(fn);
    };
  }, [fn]);
}

/** 한 번 본 끝난 작업(실패 알림·여러 안 보기를 다시 띄우지 않게 — 이 탭 sessionStorage) */
const SEEN_KEY = "ai-jobs-seen";
export function seenAiJob(id: number): boolean {
  try {
    return (JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as number[]).includes(id);
  } catch {
    return false;
  }
}
export function markAiJobSeen(id: number) {
  try {
    const list = (JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as number[]).filter((x) => x !== id);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...list, id].slice(-50)));
  } catch {
    // 저장 공간이 없으면 이 화면에서만
  }
}
