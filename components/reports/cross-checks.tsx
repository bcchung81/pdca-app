import Link from "next/link";
import { Empty, Panel, Tag } from "../ui/kit";
import { withReturn } from "../../lib/nav/return-to.ts";
import type { DuplicateCandidate } from "../../lib/reports/cross-card.ts";
import type { OrphanFinding } from "../../lib/reports/finding-orphans.ts";

/** 카드 id → 카드 화면 주소(uid) */
export type CardHref = (cardId: string) => string | null;

const LINK = "font-semibold text-navy no-underline hover:underline";

/**
 * 성과관리팀 「카드 간 점검(참고)」 — 여러 카드를 함께 봐야 보이는 두 가지: 실적 중복 계상 후보(C2) · 소관 카드 없는 ’25 지적(C3, 경영관리만).
 * 막힘이 아닌 참고이며 글을 바꾸지 않음. 두 목록은 접어 둠. 부서 담당자는 다른 카드를 읽을 수 없어 부서 화면에는 두지 않음
 */
export function CrossChecksPanel({ mg, duplicates, orphans, unitName, cardHref, from }: { mg: boolean; duplicates: DuplicateCandidate[]; orphans: OrphanFinding[]; unitName: (unit: string) => string; cardHref: CardHref; from: string }) {
  return (
    <Panel
      title="카드 간 점검(참고)"
      aside={
        <span className="truncate" title="참고 등급 — 글을 바꾸지 않습니다. 두 카드를 열어 같은 실적을 두 번 세는지·’25 지적이 빠졌는지 사람이 확인하세요.">
          실적 중복 후보 {duplicates.length}{mg ? ` · 소관 없는 ’25 지적 ${orphans.length}` : ""}
        </span>
      }
    >
      <details className="border-b border-line" open={false}>
        <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-navy">같은 실적이 여러 카드에 적힌 후보 {duplicates.length}건</summary>
        {duplicates.length === 0 ? (
          <Empty title="후보가 없습니다.">같은 날짜·닮은 이름의 실적 줄이 서로 다른 카드에 함께 적힌 곳이 없습니다.</Empty>
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {duplicates.map((d) => (
              <li key={`${d.date}|${d.lines.map((l) => l.cardId).join(",")}`} className="min-w-0 px-5 py-3">
                <div className="mb-1 flex min-w-0 items-center gap-2 text-xs text-muted-2">
                  <Tag tone="warn">{d.date}</Tag>
                  <span>닮음 {d.score.toFixed(2)}</span>
                </div>
                {d.lines.map((l) => {
                  const href = cardHref(l.cardId);
                  return (
                    <div key={`${l.cardId}|${l.text}`} className="flex min-w-0 gap-2 py-0.5 text-sm">
                      <span className="w-[140px] shrink-0 truncate">{href ? <Link href={withReturn(href, from)} className={LINK}>{l.taskNo}</Link> : l.taskNo}</span>
                      <span className="min-w-0 break-keep text-ink" title={l.text}>{l.text}</span>
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        )}
      </details>
      <details>
        <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-navy">소관 카드 없는 ’25 지적{mg ? ` ${orphans.length}건` : ""}</summary>
        {!mg ? (
          <Empty title="경영관리 지표만 점검합니다.">주요사업은 지적 연결표가 따로 있어 이 점검의 대상이 아닙니다.</Empty>
        ) : orphans.length === 0 ? (
          <Empty title="소관 없는 지적이 없습니다.">’25 평가위원 지적이 모두 어느 카드의 「지적 및 개선방안」 행과 겹칩니다.</Empty>
        ) : (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {orphans.map((o) => {
              const href = o.nearest ? cardHref(o.nearest.cardId) : null;
              return (
                <li key={`${o.unit}|${o.finding.chunkKey}|${o.finding.no}`} className="min-w-0 px-5 py-3 text-sm">
                  <div className="mb-1 flex min-w-0 items-center gap-2 text-xs text-muted-2">
                    <span className="truncate font-semibold text-ink">{unitName(o.unit)}</span>
                    {o.finding.label && o.finding.label !== unitName(o.unit) && <span className="truncate">{o.finding.label}</span>}
                    <span>지적 {o.finding.no}</span>
                  </div>
                  <p className="m-0 min-w-0 break-keep text-ink">{o.finding.text}</p>
                  <p className="m-0 mt-1 text-xs text-muted-2">
                    {o.nearest ? (
                      <>
                        가장 가까운 카드{" "}
                        {href ? <Link href={withReturn(href, from)} className={LINK}>{o.nearest.taskNo}</Link> : o.nearest.taskNo} · 겹침 {o.nearest.score.toFixed(2)}
                      </>
                    ) : (
                      "이 지표 카드에 지적 행이 없음"
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </details>
    </Panel>
  );
}
