"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { type ProgressSpec, expectLabel, fmtElapsed, overdue } from "../../lib/ai/progress.ts";

/**
 * AI 요청을 기다리는 동안의 진행 줄 — 과제원장 「AI 작성지원」·경평 초안 「AI 초안」 공용(글과 셈은 lib/ai/progress.ts).
 * 예전 한 줄(AI · 점 세 개 · 글) 그대로에 경과 시간(초마다 — 보통 걸리는 시간을 넘기면 「조금 더 걸리고 있습니다」)과
 * 「근거 n ▾」(누르면 이 요청에 넣은 근거를 아래에 펼침)만 더함(2026-09-29 사용자 결정 — 큰 카드는 과했음).
 * 화면 읽기 프로그램에는 제목만 알림(초가 바뀔 때마다 읽지 않게 role="status"는 제목에만).
 */
export function AiProgress(props: { spec: ProgressSpec; startedAt: number }) {
  const { spec } = props;
  const [now, setNow] = useState(props.startedAt);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const sec = Math.max(0, (now - props.startedAt) / 1000);
  const late = overdue(sec, spec.expect);
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2.5 text-sm text-muted-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">AI</span>
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          <span className="size-1.5 animate-pulse rounded-full bg-navy" />
          <span className="size-1.5 animate-pulse rounded-full bg-navy [animation-delay:200ms]" />
          <span className="size-1.5 animate-pulse rounded-full bg-navy [animation-delay:400ms]" />
        </span>
        <span role="status" className="min-w-0 truncate" title={spec.title}>
          {spec.title}
          <span className="sr-only"> · {expectLabel(spec.expect)}</span>
        </span>
        <span aria-hidden="true" className="min-w-0 shrink truncate text-ui whitespace-nowrap" title={expectLabel(spec.expect)}>
          · <span className="font-mono text-navy tabular-nums">{fmtElapsed(sec)}</span> <span className={late ? "text-warn" : "text-muted"}>/ {late ? "조금 더 걸리고 있습니다" : expectLabel(spec.expect)}</span>
        </span>
        {spec.sources.length > 0 && (
          <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)} title={open ? "넣은 근거 접기" : "이 요청에 넣은 근거 보기"} className="ml-auto flex h-6 shrink-0 items-center gap-0.5 rounded-md border border-field-line px-1.5 text-xs text-muted-2 hover:border-navy hover:text-navy">
            근거 {spec.sources.length}
            <ChevronDown size={13} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      <ul id={listId} hidden={!open} className="ml-[38px] flex flex-col gap-0.5 rounded-md bg-thead px-2.5 py-1.5 text-xs leading-5">
        {spec.sources.map((s) => (
          <li key={s.label} className="min-w-0 break-keep">
            <b className="font-semibold text-ink">{s.label}</b> <span className="text-muted-2">— {s.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
