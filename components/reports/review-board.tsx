"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addComment, setCommentStatus } from "../../app/(app)/reports/actions";
import { fmtDateTime } from "../../lib/format.ts";
import { COMMENT_KINDS } from "../../lib/reports/model.ts";
import { DRAFT_STATE_LABEL, type DraftState } from "../../lib/reports/submission.ts";
import { FIT_RANGE_TEXT, fitVerdict } from "../../lib/reports/fit.ts";
import { T, Tag, type Tone } from "../ui/kit";
import { FIT_TAG } from "../ui/status-tone.ts";

/** 과제 칸 머리의 동작 버튼(카드 보기·과제별 초안 열기·코멘트) — 글자 링크 대신 같은 모양의 작은 버튼 */
const HEAD_BTN = "flex h-7 shrink-0 items-center rounded-md border border-field-line bg-paper px-2.5 text-xs font-semibold whitespace-nowrap text-ink no-underline hover:border-navy";

const primary = T.btnPrimary;

const STATE_TONE: Record<DraftState, Tone> = { none: "muted", outline: "warn", draft: "navy", stale: "warnSolid" };

export interface ReviewCard {
  id: string;
  uid: string;
  taskNo: string;
  title: string;
  included: boolean;
  state: DraftState;
  fitPct: number | null;
  needs: number;
  figures: number;
  unknown: number;
  /** blockMarks를 켠 sectionHtml — data-block마다 클릭해 그 블록에 코멘트를 답니다 */
  html: string | null;
  cardHref: string;
  draftHref: string;
}

export interface ReviewCommentItem {
  id: number;
  anchor: string;
  kind: string;
  body: string;
  status: "open" | "resolved";
  author: string;
  authorId: string;
  createdAt: string;
}

const ANCHOR_RE = /^card:([^#]+)(?:#b(\d+))?$/;

/** 코멘트 앵커(card:<uid> · card:<uid>#b<n> · 옛 원고 블록 id) → 읽기 쉬운 이름 */
function anchorLabel(anchor: string, cards: ReviewCard[], legacy: Array<{ id: string; label: string }>): string {
  if (anchor === "all") return "보고서 전체";
  const m = ANCHOR_RE.exec(anchor);
  if (m) {
    const c = cards.find((x) => x.uid === m[1]);
    const taskNo = c?.taskNo ?? m[1];
    return m[2] !== undefined ? `${taskNo} · ${Number(m[2]) + 1}번 블록` : `${taskNo} 전체`;
  }
  return legacy.find((b) => b.id === anchor)?.label ?? anchor;
}

function elementFor(anchor: string): HTMLElement | null {
  const m = ANCHOR_RE.exec(anchor);
  if (!m) return anchor === "all" ? null : document.getElementById(anchor);
  const root = document.getElementById(`rv-card-${m[1]}`);
  if (!root) return null;
  return m[2] !== undefined ? (root.querySelector<HTMLElement>(`[data-block="${m[2]}"]`) ?? root) : root;
}

function flashTo(anchor: string) {
  const el = elementFor(anchor);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  el.classList.remove("kc-flash");
  void el.offsetWidth;
  el.classList.add("kc-flash");
  setTimeout(() => el.classList.remove("kc-flash"), 2600);
}

/** 미리보기 문서(sectionHtml) — 코멘트를 달 수 있으면 블록을 눌러 그 블록을 코멘트 대상으로 고릅니다 */
function CardDoc({ uid, html, live, onPick }: { uid: string; html: string; live: boolean; onPick: (anchor: string, label: string) => void }) {
  return (
    <div
      id={`rv-card-${uid}`}
      className={`rv-doc min-w-0 overflow-x-auto ${live ? "rv-doc--live" : ""}`}
      onClick={
        live
          ? (e) => {
              const el = (e.target as HTMLElement).closest<HTMLElement>("[data-block]");
              if (!el) return;
              const n = Number(el.dataset.block);
              onPick(`card:${uid}#b${n}`, `${n + 1}번 블록`);
            }
          : undefined
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * 경평 초안 검토 화면 본문: 과제별 초안을 목차 순서로 나열하고, 과제 머리의 「코멘트」나 미리보기의 블록을 눌러 코멘트를 답니다.
 * canComment(성과관리팀)만 새 코멘트를 답니다 — 부서는 읽고 「해결」 표시만.
 */
export function ReviewBoard({
  reportId,
  cards,
  comments,
  canComment,
  canResolve,
  meId,
  legacyBlocks,
}: {
  reportId: number;
  cards: ReviewCard[];
  comments: ReviewCommentItem[];
  canComment: boolean;
  canResolve: boolean;
  /** 지금 사용자(제 코멘트는 해결 표시 가능) — 부서 화면 보기(읽기 전용)면 null */
  meId: string | null;
  legacyBlocks: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [target, setTarget] = useState<{ anchor: string; label: string } | null>(null);
  const [kind, setKind] = useState<string>("수정");
  const [body, setBody] = useState("");
  const [show, setShow] = useState<"all" | "open" | "resolved">("all");

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText?: string) =>
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? (okText || res.message ? { ok: true, text: res.message ?? okText! } : null) : { ok: false, text: res.message ?? "처리하지 못했습니다." });
      if (res.ok) router.refresh();
    });

  const pick = (anchor: string, label: string) => setTarget({ anchor, label });
  const countsOf = (uid: string) => {
    const mine = comments.filter((c) => c.anchor === `card:${uid}` || c.anchor.startsWith(`card:${uid}#`));
    return { total: mine.length, open: mine.filter((c) => c.status === "open").length };
  };
  const shown = comments.filter((c) => show === "all" || c.status === show);

  return (
    <div className="flex min-h-0 grow">
      <style>{`
        .rv-doc [data-block]{border-radius:2px}
        .rv-doc--live [data-block]{cursor:pointer}
        .rv-doc--live [data-block]:hover{outline:1.5px dashed rgba(27,23,96,.4);outline-offset:2px}
      `}</style>
      <main className="min-w-0 grow overflow-auto bg-desk px-8 py-6">
        <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4">
          {cards.length === 0 && <p className="rounded-md border border-dashed border-field-line bg-paper px-4 py-3 text-ui text-muted-2">목차에 든 과제가 없습니다.</p>}
          {cards.map((c) => {
            const cnt = countsOf(c.uid);
            return (
              <section key={c.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-paper p-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="shrink-0 font-mono text-sm text-navy">{c.taskNo}</span>
                  <h3 className="min-w-0 flex-1 truncate text-base font-bold text-ink" title={c.title}>
                    {c.title}
                  </h3>
                  {!c.included && <Tag tone="muted">목차 제외</Tag>}
                  <Tag tone={STATE_TONE[c.state]}>{DRAFT_STATE_LABEL[c.state]}</Tag>
                  {c.fitPct !== null && (
                    <FitTag pct={c.fitPct} />
                  )}
                  {c.needs + c.figures > 0 && <Tag tone="warn">채울 자료 {c.needs + c.figures}</Tag>}
                  {c.unknown > 0 && <Tag tone="warnSolid">근거에 없는 숫자 {c.unknown}</Tag>}
                  {cnt.total > 0 && (
                    <Tag tone={cnt.open ? "warnSolid" : "muted"} title={`코멘트 ${cnt.total}건 · 미해결 ${cnt.open}건`}>
                      코멘트 {cnt.total}
                    </Tag>
                  )}
                  <Link href={c.cardHref} className={HEAD_BTN}>
                    카드 보기
                  </Link>
                  <Link href={c.draftHref} className={HEAD_BTN}>
                    과제별 초안 열기
                  </Link>
                  {canComment && (
                    <button type="button" onClick={() => pick(`card:${c.uid}`, `${c.taskNo} 전체`)} className={HEAD_BTN}>
                      코멘트
                    </button>
                  )}
                </div>
                {c.html ? (
                  <CardDoc uid={c.uid} html={c.html} live={canComment} onPick={pick} />
                ) : (
                  <div id={`rv-card-${c.uid}`} className="flex items-center gap-2 rounded-md border border-dashed border-field-line bg-field px-4 py-6 text-ui text-muted-2">
                    초안 없음
                    <Link href={c.draftHref} className="ml-auto shrink-0 text-xs font-semibold text-link no-underline hover:underline">
                      초안 만들기
                    </Link>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </main>
      <aside aria-label="코멘트" className="flex w-[380px] max-w-[42%] shrink-0 flex-col border-l border-line-strong bg-paper">
        <h2 className="border-b border-line px-4 py-3 text-sm font-bold text-navy">코멘트 {comments.length}</h2>
        {canComment && (
          <div className="flex flex-col gap-2 border-b border-line p-4">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate rounded-md border border-field-line bg-field px-2 py-1.5 text-xs text-ink" title={target?.label ?? "보고서 전체"}>
                대상: {target?.label ?? "보고서 전체"}
              </span>
              {target && (
                <button type="button" onClick={() => setTarget(null)} className="shrink-0 text-xs text-link">
                  초기화
                </button>
              )}
            </div>
            <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="코멘트 종류">
              {COMMENT_KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`h-8 rounded-md border px-2 text-xs font-semibold ${kind === k ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-muted-2"}`}>
                  {k}
                </button>
              ))}
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="코멘트 내용" aria-label="코멘트 내용" className="rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-ui" />
            <div className="flex items-center gap-2">
              {msg && (
                <span role={msg.ok ? "status" : "alert"} className={`max-w-[220px] truncate text-xs ${msg.ok ? "text-muted-2" : "text-error"}`} title={msg.text}>
                  {msg.text}
                </span>
              )}
              <button
                type="button"
                disabled={pending || !body.trim()}
                onClick={() =>
                  run(async () => {
                    const r = await addComment(reportId, target?.anchor ?? "all", kind, body);
                    if (r.ok) setBody("");
                    return r;
                  })
                }
                className={`${primary} ml-auto`}
              >
                보내기
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-1 border-b border-line px-4 py-2 text-xs">
          {(
            [
              ["all", `전체 ${comments.length}`],
              ["open", `미해결 ${comments.filter((c) => c.status === "open").length}`],
              ["resolved", `해결됨 ${comments.filter((c) => c.status === "resolved").length}`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={`rounded-full px-2.5 py-0.5 ${show === k ? "bg-navy text-white" : "text-muted-2 hover:bg-row-hover"}`}>
              {l}
            </button>
          ))}
        </div>
        <ol className="flex min-h-0 grow flex-col overflow-y-auto">
          {shown.length === 0 && <li className="px-4 py-8 text-center text-ui text-muted">코멘트가 없습니다.</li>}
          {shown.map((c) => (
            <li key={c.id} className={`flex flex-col gap-1.5 border-b border-row-line px-4 py-3 ${c.status === "resolved" ? "opacity-70" : ""}`}>
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <button type="button" onClick={() => flashTo(c.anchor)} className="min-w-0 truncate font-semibold text-navy hover:underline" title="눌러 그 자리로">
                  {anchorLabel(c.anchor, cards, legacyBlocks)}
                </button>
                <span className="shrink-0 rounded-chip border border-field-line px-1 text-muted-2">{c.kind}</span>
                <span className={`ml-auto shrink-0 ${c.status === "open" ? "text-warn" : "text-link"}`}>{c.status === "open" ? "미해결" : "해결됨"}</span>
              </div>
              <p className="text-ui leading-5 whitespace-pre-wrap text-ink">{c.body}</p>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="truncate">
                  {c.author} · {fmtDateTime(c.createdAt)}
                </span>
                {(canResolve || c.authorId === meId) && (
                  <button type="button" disabled={pending} onClick={() => run(() => setCommentStatus(c.id, reportId, c.status === "open" ? "resolved" : "open"))} className="ml-auto shrink-0 text-link underline">
                    {c.status === "open" ? "해결로 표시" : "다시 열기"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

/** 판면 칩(판정은 lib/reports/fit.ts fitVerdict 하나 — 뜻을 먼저, %는 뒤에) */
function FitTag({ pct }: { pct: number }) {
  const v = fitVerdict(pct);
  return (
    <Tag tone={FIT_TAG[v.tone]} title={`판면 어림 ÷ 예산 — ${v.hint} · ${FIT_RANGE_TEXT}`}>
      {v.label} · {pct}%
    </Tag>
  );
}
