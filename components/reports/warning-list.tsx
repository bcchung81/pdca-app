import { Tag } from "../ui/kit";
import { type GradedWarning, warningView } from "../../lib/reports/warning-levels.ts";

const LEVEL = {
  block: { tone: "warn", label: "막힘", title: "제출 전에 꼭 확인할 사실·판면 문제" },
  info: { tone: "muted", label: "참고", title: "문장·표현·짜임 다듬기 신호" },
} as const;

function Items({ list }: { list: GradedWarning[] }) {
  return (
    <ul className="flex min-w-0 flex-col gap-1.5">
      {list.map((w) => (
        <li key={w.text} className="flex min-w-0 items-start gap-1.5">
          <span className="mt-0.5 shrink-0">
            <Tag tone={LEVEL[w.level].tone} title={LEVEL[w.level].title}>
              {LEVEL[w.level].label}
            </Tag>
          </span>
          <span className="min-w-0 break-keep [overflow-wrap:anywhere]">{w.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 초안 경고 목록(과제별 초안 「점검 결과」 탭·사업 조판 검사 레일 공용).
 * 막힘은 전부, 참고는 막힘과 합쳐 3개까지 보이고 나머지 참고는 「참고 N개 더 보기」로 접음(등급·개수 규칙은 lib/reports/warning-levels.ts)
 */
export function WarningList({ list, title = "확인할 것", headingClass = "text-xs font-semibold text-muted" }: { list: string[]; title?: string; headingClass?: string }) {
  if (!list.length) return null;
  const v = warningView(list);
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-1.5">
      <h3 className={headingClass}>
        {title} {list.length}건 <span className="font-normal text-muted-2">막힘 {v.blockCount} · 참고 {v.infoCount}</span>
      </h3>
      <Items list={v.shown} />
      {v.folded.length > 0 && (
        <details className="min-w-0">
          <summary className="cursor-pointer text-xs font-semibold text-muted">참고 {v.folded.length}개 더 보기</summary>
          <div className="mt-1.5">
            <Items list={v.folded} />
          </div>
        </details>
      )}
    </section>
  );
}
