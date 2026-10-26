"use client";

import { INSPECT_EXPECT, rangeText } from "../../lib/ai/progress.ts";
import { BATCH_CONCURRENCY, runPool } from "../../lib/ai/pool.ts";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { runInspectionDraft } from "../../app/(app)/inspections/actions";
import { T } from "../ui/kit";

type Target = { uid: string; taskNo: string; title: string };

/**
 * AI 일괄 점검(지침 14 <일괄점검모드>): 미작성 과제를 동시에 BATCH_CONCURRENCY건씩(2026-10-10 B5 — 예전 한 건씩은 59장 ≈ 6.5시간) AI 초안으로 만듭니다.
 * 과제당 몇 분(INSPECT_EXPECT) — 이 창을 열어 두는 동안 진행하고, 실패한 건은 건너뛰고 끝에 사유를 모읍니다(다시 돌려도 안전: 초안만 씀,
 * 대상이 미작성뿐이라 멈춘 뒤 다시 누르면 남은 것부터 이어짐). 동시 수는 서버의 AI 동시 실행 제한과 같아 그동안 다른 AI 요청은 「이미 N건」으로 기다림.
 */
export function AiBatchButton({ period, targets }: { period: string; targets: Target[] }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [run, setRun] = useState<{ done: number; ok: number; total: number; current: string[]; stopped: boolean; failed: Array<{ t: Target; message: string }> } | null>(null);
  const stop = useRef(false);
  useEffect(
    () => () => {
      stop.current = true;
    },
    [],
  );

  const start = async () => {
    setAsking(false);
    stop.current = false;
    const list = [...targets];
    const failed: Array<{ t: Target; message: string }> = [];
    const live = new Set<string>();
    let ok = 0;
    const show = () => setRun({ done: ok + failed.length, ok, total: list.length, current: [...live], stopped: false, failed: [...failed] });
    await runPool(
      list,
      BATCH_CONCURRENCY,
      async (t) => {
        const name = `${t.taskNo} ${t.title}`;
        live.add(name);
        show();
        try {
          const out = await runInspectionDraft(t.uid, period);
          if (out.ok) ok += 1;
          else failed.push({ t, message: out.message });
        } catch {
          failed.push({ t, message: "요청이 끊겼습니다." });
        } finally {
          live.delete(name);
          show();
          if ((ok + failed.length) % 5 === 0) router.refresh();
        }
      },
      { stopped: () => stop.current },
    );
    setRun({ done: ok + failed.length, ok, total: list.length, current: [], stopped: stop.current, failed });
    router.refresh();
  };

  const running = Boolean(run?.current.length);
  return (
    <span className="relative flex items-center gap-2">
      {run && (
        <span role="status" className="max-w-[340px] truncate text-xs text-muted-2" title={run.failed.map((f) => `${f.t.taskNo} ${f.t.title}: ${f.message}`).join("\n")}>
          {running ? `AI 점검 ${run.done}/${run.total} 끝 · 지금 ${run.current.join(" · ")}` : `AI 일괄 점검 끝: 완료 ${run.ok} · 실패 ${run.failed.length}${run.stopped ? ` · 멈춤(${run.total - run.done}건 남음)` : ""}`}
        </span>
      )}
      {running ? (
        <button
          type="button"
          onClick={() => {
            stop.current = true;
          }}
          className={T.btn}>
          멈추기(도는 건까지)
        </button>
      ) : (
        <button
          type="button"
          disabled={targets.length === 0}
          onClick={() => setAsking(true)}
          title={`미작성 과제를 동시에 ${BATCH_CONCURRENCY}건씩 AI 초안으로 만듭니다(보내기는 확인 뒤)`}
          className={`flex h-8 items-center rounded-md border border-navy bg-paper px-3 text-xs font-semibold whitespace-nowrap text-navy ${T.off}`}
        >
          AI 일괄 점검 ({targets.length})
        </button>
      )}
      {asking && (
        <span role="alertdialog" aria-label="AI 일괄 점검" className="absolute top-10 right-0 z-pop flex w-[340px] flex-col gap-2 rounded-md border border-line-strong bg-paper p-3 text-xs text-ink shadow-lg">
          <span>
            미작성 {targets.length}건을 동시에 {BATCH_CONCURRENCY}건씩 AI 점검 초안으로 만듭니다. 과제당 {rangeText(INSPECT_EXPECT)}이며, 이 창을 열어 두는 동안 진행합니다(그동안 다른 AI 요청은 기다림). 멈춘 뒤 다시 누르면 남은 과제부터 이어서 합니다. 초안은 확인한 뒤 부서에 보내세요.
          </span>
          <span className="flex justify-end gap-2">
            <button type="button" onClick={() => setAsking(false)} className={T.btnSm}>
              취소
            </button>
            <button type="button" onClick={start} className={T.btnPrimarySm}>
              시작
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
