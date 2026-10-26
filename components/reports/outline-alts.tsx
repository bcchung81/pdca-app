"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type OutlineAltView, type OutlineAltsResult, adoptOutlineAlternative, runOutlineAlternatives } from "../../app/(app)/reports/cards/outline-actions";
import type { DraftSources } from "../../app/(app)/reports/cards/draft-prepare";
import type { ProgressSpec } from "../../lib/ai/progress.ts";
import type { FrameChoice } from "../../lib/reports/framework-pick.ts";
import { FIT_RANGE_TEXT, type FitTone, fitVerdict } from "../../lib/reports/fit.ts";
import { AiProgress } from "../workspace/ai-progress";
import { T } from "../ui/kit";
import { useAsk } from "../ui/confirm-dialog";
import { askBody } from "./draft-review";
import { SampleHtml } from "./outline-sample";

/** 여러 안 요청(짜임 고르기에서 「N안 만들어 비교」) */
export interface AltsRequest {
  alts: FrameChoice[];
  request: string;
  /** 주요사업: 근거(요청 칸에서 고른 것 또는 구성안에 저장된 것) */
  sources?: DraftSources;
  /** 경영관리: 절 열쇠(그 절만 여러 안) */
  part?: string;
  /** 고르기 전에 물을 글(사람이 고친 블록이 덮일 때 — 없으면 묻지 않음) */
  confirm?: string | null;
  /** 진행 줄(실제로 넣는 근거 — 부르는 쪽이 셈) */
  progress: ProgressSpec;
  /** 서버 호출(누른 때 한 번 — 효과에서 부르면 개발 모드에서 두 번 돌아 비용이 두 배) */
  pending: Promise<OutlineAltsResult>;
  startedAt: number;
}

/** 여러 안 시작(단추를 누른 처리기에서 부름 — 서버 호출은 여기서 한 번만) */
export function startAlts(uid: string, r: Omit<AltsRequest, "pending" | "startedAt">): AltsRequest {
  const pending = runOutlineAlternatives(uid, { alts: r.alts, request: r.request, sources: r.sources, part: r.part }).catch((): OutlineAltsResult => ({ ok: false, message: "요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." }));
  return { ...r, pending, startedAt: Date.now() };
}

/**
 * 「다른 짜임 여러 안」 비교 대화 창(2026-10-12 ③): 열리면 서버가 고른 짜임마다 구성안을 동시에 한 번씩 만들고(runOutlineAlternatives — 저장 안 함),
 * 안마다 고른 짜임·AI가 정한 틀·핵심 메시지(경영관리는 절을 둔 이유)·판면 어림·블록 목록(라벨·도식·배치)·구성안 판면 견본·확인할 것을 나란히 보입니다.
 * 「이 안으로 정하기」를 누르면 그 안만 구성안으로 저장(adoptOutlineAlternative — 만들 때 읽은 버전이 그대로일 때만). 도는 동안은 닫지 않음(서버 호출은 끝까지 돌고 비용이 듦)
 */
export function OutlineAlts(props: { uid: string; req: AltsRequest | null; onClose: () => void; onAdopted: (message: string) => void }) {
  const router = useRouter();
  const { ask, dialog: askDialog } = useAsk();
  const ref = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<OutlineAltsResult | null>(null);
  const [adopting, setAdopting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const req = props.req;
  const running = Boolean(req) && !result;

  // 새 요청이면 처음부터(렌더 중에 정리)
  const [seen, setSeen] = useState<AltsRequest | null>(null);
  if (seen !== req) {
    setSeen(req);
    setResult(null);
    setError(null);
    setAdopting(null);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (req && !el.open) el.showModal();
    if (!req && el.open) el.close();
  }, [req]);

  useEffect(() => {
    if (!req) return;
    let live = true;
    void req.pending.then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [req]);

  const adopt = (a: OutlineAltView) => {
    if (!req || !result?.ok || !a.ok) return;
    const save = async () => {
      setAdopting(a.no);
      setError(null);
      try {
        const r = await adoptOutlineAlternative(props.uid, { out: a.out, frame: a.frame, request: req.request, sources: req.sources, part: req.part, model: a.model, version: result.version });
        if (!r.ok) {
          setError(r.message);
          return;
        }
        props.onAdopted(r.message);
        router.refresh();
        ref.current?.close();
      } catch {
        setError("요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요.");
      } finally {
        setAdopting(null);
      }
    };
    // 사람이 고친 블록이 덮이면 먼저 묻고, 확인하면(없으면 바로) 저장 — 저장하는 값은 누른 때의 안·요청·읽은 버전
    ask(req.confirm ? [{ title: "이 안으로 정할까요?", body: [askBody(req.confirm)], confirmLabel: "이 안으로 정하기" }] : [], () => void save());
  };

  const ok = result?.ok ? result : null;
  return (
    <>
      <dialog
        ref={ref}
        aria-label="다른 짜임 여러 안"
        onClose={props.onClose}
        onCancel={(e) => {
          // 도는 동안·저장하는 동안은 Esc로 닫지 않음
          if (running || adopting !== null) e.preventDefault();
        }}
        className="fixed top-1/2 left-1/2 h-[min(860px,92vh)] w-[min(1240px,96vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/30"
      >
        {ok && <style>{ok.css}</style>}
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h3 className="min-w-0 truncate font-serif text-base font-bold text-navy">
              다른 짜임 여러 안{ok?.partLabel ? ` — ${ok.partLabel}` : ""}
            </h3>
            <button type="button" disabled={running || adopting !== null} onClick={() => ref.current?.close()} aria-label="닫기" title={running ? "만드는 동안은 닫을 수 없습니다(서버의 AI 호출은 끝까지 돌고 비용이 듦)" : "닫기 — 고르지 않은 안은 저장되지 않음"} className="shrink-0 rounded-md px-2 py-1 text-lg leading-none text-muted hover:text-navy disabled:cursor-not-allowed disabled:text-field-line disabled:hover:text-field-line">
              ×
            </button>
          </div>
          <div className="min-h-0 grow overflow-auto px-5 py-4">
            {running && req && <AiProgress spec={req.progress} startedAt={req.startedAt} />}
            {result && !result.ok && (
              <p role="alert" className="rounded-md border border-error-line bg-error-bg px-3 py-2 text-ui text-error-strong">
                {result.message}
              </p>
            )}
            {ok && (
              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-xs leading-5 break-keep text-muted-2">
                  안마다 같은 근거로 구성안을 한 번씩 만들었습니다(저장 전). 하나를 고르면 그 안만 {ok.mg ? "이 절에 합쳐" : "구성안으로"} 저장합니다 — 고르지 않은 안은 사라집니다.
                  {ok.dropped > 0 && ` 같은 짜임 ${ok.dropped}개는 한 번만 만들었습니다.`}
                </p>
                {error && (
                  <p role="alert" className="rounded-md border border-error-line bg-error-bg px-3 py-2 text-ui text-error-strong">
                    {error}
                  </p>
                )}
                <div className="grid min-w-0 gap-3" style={{ gridTemplateColumns: `repeat(${ok.alts.length}, minmax(300px, 1fr))` }}>
                  {ok.alts.map((a) => (
                    <AltCard key={a.no} a={a} mg={ok.mg} adopting={adopting} onAdopt={() => adopt(a)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </dialog>
      {askDialog}
    </>
  );
}

/** 판면 판정 톤 → 바탕 칩 색(이 창의 칩 모양 — 넘침만 경고색) */
const FIT_CHIP: Record<FitTone, string> = { done: "bg-thead text-muted", doing: "bg-thead text-st-doing-text", alert: "bg-warn-bg text-warn" };

function AltCard({ a, mg, adopting, onAdopt }: { a: OutlineAltView; mg: boolean; adopting: number | null; onAdopt: () => void }) {
  const ratio = a.fit && a.fit.budget ? Math.round((a.fit.total / a.fit.budget) * 100) : 0;
  const verdict = a.fit && a.fit.budget ? fitVerdict(ratio) : null;
  return (
    <section aria-label={`${a.no}안`} className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-paper p-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-full bg-navy px-2 text-xs leading-6 font-semibold text-white">{a.no}안</span>
        <span className="min-w-0 truncate text-ui font-semibold text-ink" title={a.label || "AI가 다르게"}>
          {a.label || "AI가 다르게"}
        </span>
      </div>
      {!a.ok ? (
        <p role="alert" className="text-ui leading-5 break-keep text-error">
          만들지 못했습니다 — {a.error}
        </p>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            <span className="max-w-full min-w-0 truncate rounded-full bg-thead px-2 leading-5 text-navy" title={`AI가 정한 틀 — ${a.story}`}>
              {a.story}
            </span>
            {/* 판면: 뜻 먼저(판정은 fitVerdict 하나), mm는 title */}
            {!mg && a.fit && a.fit.budget > 0 && verdict && (
              <span className={`shrink-0 rounded-chip px-1.5 leading-5 ${FIT_CHIP[verdict.tone]}`} title={`${verdict.hint} — 판면 어림 ${a.fit.total}/${a.fit.budget}mm · ${ratio}% · ${FIT_RANGE_TEXT}`}>
                {verdict.label} · {ratio}%
              </span>
            )}
            <span className="shrink-0 text-muted-2">
              블록 {a.blocks?.length ?? 0} · 재료 {a.materials ?? 0}
              {a.need ? ` · 자료 필요 ${a.need}` : ""}
              {a.sec ? ` · ${a.sec}초` : ""}
            </span>
            {a.same && <span className="shrink-0 rounded-chip bg-warn-bg px-1.5 leading-5 font-semibold text-warn">{a.same}안과 같은 짜임</span>}
          </div>
          {a.message && <p className="line-clamp-2 text-ui leading-[1.5] font-semibold break-keep text-navy" title={a.message}>{a.message}</p>}
          <ol aria-label="블록" className="flex min-w-0 flex-col gap-0.5 text-xs leading-[1.45]">
            {(a.blocks ?? []).map((b, i) => (
              <li key={i} className="flex min-w-0 gap-1.5">
                <span className="shrink-0 font-mono text-muted-2">{i + 1}</span>
                <span className="min-w-0 truncate" title={`${b.label} · ${b.shape} · ${b.layout}`}>
                  <b className="font-semibold text-ink">{b.label}</b> <span className="text-muted">{b.shape}</span>
                  {b.layout !== "라벨 사다리" && <span className="text-muted-2"> · {b.layout}</span>}
                </span>
              </li>
            ))}
          </ol>
          {a.sheetHtml && (
            <div className="h-[260px] min-h-0 overflow-y-auto rounded-md border border-line bg-thead">
              <SampleHtml html={a.sheetHtml} zoom={0.42} />
            </div>
          )}
          {a.warnings && a.warnings.length > 0 && (
            <details className="min-w-0 text-xs leading-5">
              <summary className="cursor-pointer text-warn">확인할 것 {a.warnings.length}</summary>
              <ul className="mt-1 flex min-w-0 list-disc flex-col gap-0.5 pl-4 break-keep text-muted">
                {a.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <button type="button" disabled={adopting !== null} onClick={onAdopt} className={`${T.btnPrimary} mt-auto justify-center`}>
            {adopting === a.no ? "저장 중…" : "이 안으로 정하기"}
          </button>
        </>
      )}
    </section>
  );
}
