"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type AiJob, elapsedLabel, jobHref, jobNotice, jobTitle } from "../../lib/ai/jobs.ts";
import { useAiJobs, useAiJobsDone } from "../workspace/ai-jobs";
import { DropMenu } from "../ui/drop-menu";

/** 끝 알림이 떠 있는 시간 */
const NOTICE_MS = 8_000;

/**
 * 머리띠 「AI 작업 N건」(2026-11-06 — AI 요청 백그라운드화): 로그인 사용자의 진행 중 AI 작업이 있을 때만 보임(없으면 아무것도 그리지 않음).
 * 누르면 목록(카드 · 종류 · 경과 · 「화면으로」), 이 탭에서 진행 중으로 본 작업이 끝나면 오른쪽 위 알림(「1-가 경평 초안 · 구성안 만들기 — 끝났어요 [보기]」).
 * 휴대폰 폭은 글 없이 아이콘 + 수만(머리띠 높이·줄 수 그대로)
 */
export function AiJobsMenu() {
  const jobs = useAiJobs();
  const running = jobs.filter((j) => j.state === "running");
  const [notices, setNotices] = useState<AiJob[]>([]);
  // 지금 그 작업 화면에 있으면 알리지 않음(답이 바로 그 화면에 보임)
  const path = usePathname();
  const onDone = useCallback((done: AiJob[]) => {
    const away = done.filter((j) => jobHref(j) !== path);
    if (away.length) setNotices((n) => [...n.filter((x) => !away.some((d) => d.id === x.id)), ...away].slice(-3));
  }, [path]);
  useAiJobsDone(onDone);
  useEffect(() => {
    if (!notices.length) return;
    const t = setTimeout(() => setNotices((n) => n.slice(1)), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notices]);
  // 경과 시간은 진행 중일 때만 초마다
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running.length) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running.length]);

  return (
    <>
      {running.length > 0 && (
        <DropMenu
          label={
            <>
              <Sparkles size={15} aria-hidden="true" className="shrink-0 animate-pulse" />
              <span className="max-md:hidden">AI 작업 {running.length}건</span>
              <span className="md:hidden">{running.length}</span>
            </>
          }
          ariaLabel={`진행 중인 AI 작업 ${running.length}건`}
          title="진행 중인 AI 작업 — 다른 화면으로 가도 서버에서 끝까지 돕니다"
          width={320}
          buttonClass="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-navy/40 px-2 text-xs font-semibold whitespace-nowrap text-navy hover:bg-thead max-md:gap-1 max-md:px-1.5"
        >
          {(close) => (
            <ul className="flex min-w-0 flex-col py-1">
              {running.map((j) => {
                const href = jobHref(j);
                return (
                  <li key={j.id} className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="min-w-0 grow">
                      <span className="block truncate font-semibold text-ink" title={j.card?.title ?? ""}>
                        {jobTitle(j)}
                      </span>
                      <span className="block truncate text-muted-2">
                        {j.card?.title ?? ""} · <span className="font-mono tabular-nums">{elapsedLabel(j.at, now)}</span>
                      </span>
                    </span>
                    {href && (
                      <Link href={href} onClick={close} className="shrink-0 text-link hover:underline">
                        화면으로
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DropMenu>
      )}
      {notices.length > 0 && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed top-14 right-4 z-float flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
          {notices.map((j) => {
            const href = jobHref(j);
            return (
              <div key={j.id} className={`pointer-events-auto flex min-w-0 items-start gap-2 rounded-lg px-3 py-2 text-ui text-white shadow-pop ${j.state === "ok" ? "bg-navy" : "bg-warn"}`}>
                <span className="min-w-0 grow break-keep">
                  {jobNotice(j)}
                  {j.state !== "ok" && j.message && <span className="block text-xs opacity-90">{j.message}</span>}
                </span>
                {href && (
                  <Link href={href} onClick={() => setNotices((n) => n.filter((x) => x.id !== j.id))} className="shrink-0 rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold text-white no-underline hover:bg-white/25">
                    보기
                  </Link>
                )}
                <button type="button" onClick={() => setNotices((n) => n.filter((x) => x.id !== j.id))} aria-label="알림 닫기" className="flex size-5 shrink-0 items-center justify-center rounded text-white/80 hover:text-white">
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
