"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmtDateTime } from "../../lib/format.ts";
import type { DraftThreadData, ThreadTurn, TodoGroup, TodoItem } from "../../lib/reports/draft-thread.ts";
import { Tag } from "../ui/kit";
import { FIT_TAG } from "../ui/status-tone.ts";

/**
 * 경평 초안 「AI 초안」 대화의 차례 하나(요청 말풍선 → 짧은 답) — 차례 목록은 lib/reports/draft-thread.ts draftThread가 저장된 값으로 만듦.
 * 모양은 과제원장 「AI 작성지원」(components/cards/ai-assist.tsx)과 같음: 오른쪽 말풍선(요청 종류 · 아래 줄) → AI 동그라미 + 답.
 * 마지막 차례에만 할 일(「채울 자료 N건 ▸」)과 다음 단추가 붙음(state — 부르는 쪽이 그림).
 */
export function TurnView(props: { turn: ThreadTurn; state?: ReactNode; onGotoBlock: (j: number) => void; onOpenOutline: () => void; showOutlineLink: boolean; /** 참고한 주요사업 초안이 바뀜(경영관리 — 마지막 초안 차례에만) */ bizStale?: { text: string; title: string } | null }) {
  const t = props.turn;
  return (
    <li data-turn={t.key} className="flex min-w-0 flex-col gap-2.5">
      <AskBubble label={t.ask} lines={t.askLines} />
      <div data-answer className="flex min-w-0 flex-col gap-2">
        <AnswerHead at={t.at} />
        <p className="text-sm leading-[1.55] font-bold break-keep text-navy" title={t.kind === "draft" && t.note ? t.note : undefined}>
          {t.headline}
        </p>
        {t.kind === "outline" && <OutlineSummary turn={t} onOpenOutline={props.onOpenOutline} showOutlineLink={props.showOutlineLink} />}
        {t.kind === "draft" && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-ui">
            {t.fit && (
              <Tag tone={FIT_TAG[t.fit.tone]} title={t.fit.title}>
                {t.fit.text}
              </Tag>
            )}
            {t.stale && (
              <Tag tone="warnSolid" title="초안을 만든 뒤 원장 카드가 바뀌었습니다">
                원장이 바뀜 — 다시 쓰기 권장
              </Tag>
            )}
            {props.bizStale && (
              <Tag tone="warnSolid" title={props.bizStale.title}>
                {props.bizStale.text}
              </Tag>
            )}
            {t.olderEdits > 0 && <span className="text-xs text-muted-2">앞선 블록 고치기 {t.olderEdits}건은 「수정 이력」에</span>}
          </div>
        )}
        {t.kind === "edit" && (
          <button type="button" onClick={() => props.onGotoBlock(t.blockIndex)} className="self-start text-xs text-link hover:underline" title="왼쪽 종이의 그 블록으로">
            {t.blockIndex < 0 ? "추진성과 보기" : `${t.blockIndex + 1}번 블록 보기`}
          </button>
        )}
        {props.state}
      </div>
    </li>
  );
}

/** 요청 말풍선(오른쪽) */
export function AskBubble({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="flex max-w-[88%] flex-col gap-0.5 self-end rounded-2xl rounded-br-md bg-navy/[0.07] px-3.5 py-2">
      <span className="text-xs font-semibold text-navy">{label}</span>
      {lines.map((a, i) => (
        <p key={i} className="line-clamp-3 text-sm leading-[1.6] break-keep whitespace-pre-wrap text-ink">
          {a}
        </p>
      ))}
    </div>
  );
}

/** 답 머리: AI 동그라미 + 때(모델 이름은 보이지 않음 — 2026-11-04) */
export function AnswerHead({ at, children }: { at: string | null; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">AI</span>
      {at && <span className="min-w-0 truncate text-xs text-muted">{fmtDateTime(at)}</span>}
      {children}
    </div>
  );
}

/** 구성안 답: 한 줄 요약 + 승인 여부 · 핵심 메시지와 평가 논점(접힘)을 한 상자 · 경영관리 절 목록 */
function OutlineSummary({ turn: t, onOpenOutline, showOutlineLink }: { turn: Extract<ThreadTurn, { kind: "outline" }>; onOpenOutline: () => void; showOutlineLink: boolean }) {
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-ui text-ink">
        <span className="min-w-0 break-keep" title={t.fit?.title}>
          {t.summary}
        </span>
        <Tag tone={t.approved ? "navy" : "link"}>{t.approved ? "승인함" : "확인 전"}</Tag>
        {showOutlineLink && (
          <button type="button" onClick={onOpenOutline} className="text-xs text-link hover:underline">
            구성안 보기
          </button>
        )}
      </div>
      {(t.message || t.points.length > 0) && (
        <div className="rounded-md border-l-[3px] border-navy bg-thead px-3 py-2">
          {t.message && <p className="text-sm leading-[1.55] font-semibold break-keep text-navy">{t.message}</p>}
          {t.points.length > 0 && (
            <details className="group mt-1 min-w-0">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-muted-2 [&::-webkit-details-marker]:hidden">
                <ChevronRight size={13} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-90" />
                평가 논점 {t.points.length}
              </summary>
              <ol className="mt-1 flex min-w-0 list-decimal flex-col gap-0.5 pl-5 text-ui leading-[1.6] break-keep">
                {t.points.map((p, i) => (
                  <li key={i}>
                    {p.tag && <b className="font-semibold text-navy">{p.tag} </b>}
                    {p.text}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}
      {t.parts.length > 0 && (
        <ol aria-label="절" className="flex min-w-0 flex-col gap-0.5 text-xs leading-5">
          {t.parts.map((p, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate text-ink" title={p.name}>
                {p.name}
              </span>
              {p.story && <span className="shrink-0 rounded-full bg-thead px-1.5 text-navy">{p.story}</span>}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** 묶음마다 먼저 보이는 줄 수(나머지는 「N개 더 보기」) */
const TODO_FIRST = 4;

/**
 * 할 일(「채울 자료 N건 ▸」 — 예전 「점검 결과」 탭을 행동별로 묶은 목록 하나, lib/reports/draft-thread.ts draftTodo).
 * 자리가 있는 줄은 data-jump 단추(누르면 작업 공간 onJump가 왼쪽 종이의 그 자리로), 원장 실적 없음은 카드 화면 링크
 */
export function TodoList({ todo, cardHref, open, onToggle }: { todo: DraftThreadData["todo"]; cardHref: string; open: boolean; onToggle: (on: boolean) => void }) {
  if (!todo.groups.length) return <p className="text-xs text-muted-2">채울 자료가 없어요.</p>;
  return (
    <details data-todo open={open} onToggle={(e) => onToggle(e.currentTarget.open)} className="group min-w-0 rounded-lg border border-line">
      <summary className="flex cursor-pointer list-none items-center gap-1 px-3 py-2 text-ui font-semibold text-ink [&::-webkit-details-marker]:hidden" title="누르면 행동별로 펼침 — 항목을 누르면 왼쪽 종이의 그 자리로">
        채울 자료 {todo.count}건
        <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-muted-2 transition-transform group-open:rotate-90" />
      </summary>
      <div className="flex min-w-0 flex-col gap-3 border-t border-line px-3 py-2.5">
        {todo.groups.map((g) => (
          <TodoSection key={g.key} g={g} cardHref={cardHref} />
        ))}
      </div>
    </details>
  );
}

function TodoSection({ g, cardHref }: { g: TodoGroup; cardHref: string }) {
  const first = g.items.slice(0, TODO_FIRST);
  const rest = g.items.slice(TODO_FIRST);
  return (
    <section aria-label={g.title} className="flex min-w-0 flex-col gap-1">
      <h4 className="text-xs font-semibold text-muted" title={g.hint}>
        {g.title} {g.items.length}
      </h4>
      <ul className="flex min-w-0 flex-col gap-0.5">
        {first.map((x, i) => (
          <TodoRow key={i} x={x} cardHref={cardHref} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="min-w-0">
          <summary className="cursor-pointer text-xs font-semibold text-muted">{rest.length}개 더 보기</summary>
          <ul className="mt-0.5 flex min-w-0 flex-col gap-0.5">
            {rest.map((x, i) => (
              <TodoRow key={i} x={x} cardHref={cardHref} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const rowCls = "flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 py-1 text-left text-ui leading-[1.55] break-keep [overflow-wrap:anywhere]";

function TodoRow({ x, cardHref }: { x: TodoItem; cardHref: string }) {
  const dot = <span className={`mt-2 size-1.5 shrink-0 rounded-full ${x.level === "block" || x.open ? "bg-warn" : "bg-muted"}`} aria-hidden />;
  const body = (
    <span className="min-w-0">
      {x.text}
      {x.note && <span className="text-xs text-muted"> — {x.note}</span>}
    </span>
  );
  if (x.jump?.kind === "comment")
    return (
      <li className={rowCls}>
        {dot}
        <span className="min-w-0">
          <button type="button" data-jump="comment" data-block={x.jump.block} className="mr-1 rounded-md bg-target-bg px-1.5 text-xs leading-[1.6] font-semibold text-navy hover:underline">
            {(x.jump.block ?? 0) + 1}번 블록
          </button>
          {x.open && <span className="mr-1 text-xs font-semibold text-warn">미해결</span>}
          <span className="whitespace-pre-wrap">{x.text}</span>
          {x.note && <span className="block text-xs text-muted">{x.note}</span>}
        </span>
      </li>
    );
  if (x.jump)
    return (
      <li>
        <button type="button" data-jump={x.jump.kind} data-text={x.jump.text} data-nth={x.jump.nth} title={x.title ?? "왼쪽 초안의 그 자리로"} className={`${rowCls} hover:bg-row-hover`}>
          {dot}
          {body}
        </button>
      </li>
    );
  return (
    <li className={rowCls} title={x.title}>
      {dot}
      <span className="min-w-0">
        {x.open !== undefined && x.open && <span className="mr-1 text-xs font-semibold text-warn">미해결</span>}
        {body}
        {x.card && (
          <>
            {" "}
            <Link href={cardHref} className="text-xs text-link no-underline hover:underline">
              카드에서 실적 반영
            </Link>
          </>
        )}
      </span>
    </li>
  );
}
