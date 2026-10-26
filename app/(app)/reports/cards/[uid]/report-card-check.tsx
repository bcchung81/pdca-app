import Link from "next/link";
import { WarningList } from "../../../../../components/reports/warning-list";
import { Tag } from "../../../../../components/ui/kit";
import { fmtDateTime } from "../../../../../lib/format.ts";
import { FIGURE_LABEL } from "../../../../../lib/reports/blocks.ts";
import { LENS_AXES } from "../../../../../lib/reports/lens-cover.ts";
import type { ReportSectionSpec } from "../../../../../lib/reports/section.ts";
import type { cardCommentsOf, checkNeedsOf } from "./derive.ts";

const h3 = "text-xs font-semibold text-muted";
const listCls = "flex min-w-0 flex-col gap-0.5";
const jumpCls = "flex w-full min-w-0 items-start gap-1.5 rounded px-1.5 py-1 text-left break-keep [overflow-wrap:anywhere] hover:bg-row-hover";

type CardComments = ReturnType<typeof cardCommentsOf>;
type Needs = ReturnType<typeof checkNeedsOf>;

/**
 * 「점검 결과」 탭: 성과관리팀 코멘트 · 편람 논점(낱말 신호) · 근거 약한 문장 · 채울 자료 · 확인할 것.
 * 자리가 있는 항목은 data-jump 단추(누르면 왼쪽 미리보기의 그 자리로)
 */
export function ReportCheck({ spec, needs, cardComments, warnings, year, own, kpiHref }: { spec: ReportSectionSpec | null; needs: Needs; cardComments: CardComments; warnings: string[]; year: number; own: boolean; kpiHref: string | null }) {
  const { cover, weakSentences, draftNeeds, figureNeeds, kpiNeeds } = needs;
  const needCount = draftNeeds.length + kpiNeeds.length + figureNeeds.length;
  const checkCount = needCount + warnings.length;
  return (
    <div className="flex min-w-0 flex-col gap-5 text-ui leading-6 text-ink">
      {cardComments.length > 0 && <CommentsSection cardComments={cardComments} />}
      {spec ? (
        <p className="text-xs text-muted-2" title={draftNeeds.length + figureNeeds.length + weakSentences.length > 0 ? "항목을 누르면 왼쪽 초안의 그 자리로 옮깁니다" : undefined}>
          채울 자료 {needCount}건 · 확인할 것 {warnings.length}건
        </p>
      ) : (
        <p className="text-xs text-muted-2">초안을 만들면 여기에 점검 결과가 보입니다.</p>
      )}
      {cover && (
        <section aria-label="편람 논점" className="flex min-w-0 flex-col gap-1.5">
          <h3 className={h3} title="초안 글에 그 논점의 낱말이 있는지만 봄 — 판정 아님(사람이 논점을 잘 다뤘는지 봄)">
            편람 논점 <span className="font-normal text-muted-2">(낱말 신호 — 판정 아님)</span>
          </h3>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {LENS_AXES.map((k) => (
              <Tag key={k} tone={cover.checks[k] ? "solid" : "muted"}>
                {k}
              </Tag>
            ))}
          </div>
        </section>
      )}
      {weakSentences.length > 0 && (
        <section aria-label="근거 약한 문장" className="flex min-w-0 flex-col gap-1.5">
          <h3 className={h3} title="근거 글과 겹치는 말이 적은 문장 — 원자료로 확인(신호, 판정 아님)">
            근거 약한 문장 {weakSentences.length}개 <span className="font-normal text-muted-2">— 미리보기의 옅은 점선</span>
          </h3>
          <ul className={listCls}>
            {weakSentences.map((w, i) => (
              <li key={`${i}-${w}`}>
                <button type="button" data-jump="weak" data-text={w} title="왼쪽 초안의 그 문장으로" className={jumpCls}>
                  <span className="mt-2.5 size-1 shrink-0 rounded-full bg-muted" aria-hidden />
                  <span className="line-clamp-2 min-w-0">{w.replace(/\*\*/g, "")}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {needCount > 0 && <NeedsSection needs={needs} needCount={needCount} year={year} own={own} kpiHref={kpiHref} />}
      <WarningList list={warnings} headingClass={h3} />
      {spec && checkCount === 0 && weakSentences.length === 0 && <p className="text-muted-2">채울 자료·확인할 것이 없습니다.</p>}
    </div>
  );
}

function CommentsSection({ cardComments }: { cardComments: CardComments }) {
  return (
    <section aria-label="성과관리팀 코멘트" className="flex min-w-0 flex-col gap-1.5">
      <h3 className={h3}>
        성과관리팀 코멘트 {cardComments.length}건 <span className="font-normal text-muted-2">미해결 {cardComments.filter((c) => c.status === "open").length}</span>
      </h3>
      <ul className={listCls}>
        {cardComments.map((c) => (
          <li key={c.id} className={`min-w-0 rounded-md border px-2.5 py-1.5 ${c.status === "open" ? "border-warn/50 bg-warn-bg" : "border-line"}`}>
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <span className="shrink-0 font-semibold text-navy">{c.kind}</span>
              {c.blockIndex !== null ? (
                <button type="button" data-jump="comment" data-block={c.blockIndex} className="shrink-0 rounded-md bg-target-bg px-1.5 text-xs leading-[1.6] font-semibold text-navy hover:underline">
                  {c.blockIndex + 1}번 블록
                </button>
              ) : (
                <span className="shrink-0 text-muted-2">과제 전체</span>
              )}
              <span className={`ml-auto shrink-0 ${c.status === "open" ? "text-warn" : "text-muted-2"}`}>{c.status === "open" ? "미해결" : "해결됨"}</span>
            </div>
            <p className="mt-1 min-w-0 leading-5 break-keep whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">{c.body}</p>
            <p className="mt-1 text-xs text-muted-2">
              {c.author} · {fmtDateTime(c.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NeedsSection({ needs, needCount, year, own, kpiHref }: { needs: Needs; needCount: number; year: number; own: boolean; kpiHref: string | null }) {
  const { draftNeeds, figureNeeds, kpiNeeds } = needs;
  return (
    <section aria-label="채울 자료" className="flex min-w-0 flex-col gap-1.5">
      <h3 className={h3}>채울 자료 {needCount}건</h3>
      <ul className={listCls}>
        {draftNeeds.map((n) => (
          <li key={`need-${n}`}>
            <button type="button" data-jump="need" data-text={n} title="왼쪽 초안의 노란 칸으로" className={jumpCls}>
              <span className="min-w-0">
                <span className="rounded-sm bg-[#fff1b8] px-1 text-[#4d3a00] shadow-[inset_0_0_0_1px_#c79a00]">{n}</span> <span className="text-muted">— 초안의 노란 칸</span>
              </span>
            </button>
          </li>
        ))}
        {figureNeeds.map((f, i) => (
          <li key={`fig-${i}`}>
            <button type="button" data-jump="fig" data-text={f.desc} data-nth={f.nth} title="왼쪽 초안의 빗금 칸으로" className={jumpCls}>
              <span className="min-w-0">
                <span className="rounded-sm border border-dashed border-muted px-1 text-xs text-muted">{FIGURE_LABEL[f.kind]}</span> {f.desc} <span className="text-muted">— 초안의 빗금 칸</span>
              </span>
            </button>
          </li>
        ))}
        {kpiNeeds.map((k) => (
          <li key={`kpi-${k.name}`} className="px-1.5 py-1 break-keep [overflow-wrap:anywhere]">
            계량 실적 <b>{k.name}</b>
            {k.unit ? `(${k.unit})` : ""} {year}년 실적 <span className="text-muted">— 목표 {k.target || "—"} · 전년 {k.prev || "—"}</span>
            {kpiHref && (
              <>
                {" "}
                <Link href={kpiHref} className="text-link no-underline hover:underline">
                  {own ? "계량 실적 넣기" : "보고서에서 보기"}
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
