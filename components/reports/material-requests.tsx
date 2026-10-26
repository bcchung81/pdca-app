import Link from "next/link";
import { Panel } from "../ui/kit";
import { withReturn } from "../../lib/nav/return-to.ts";
import { type DeptRequests, requestsText } from "../../lib/reports/material-requests.ts";
import { CopyTextButton } from "./copy-text-button";

/**
 * 부서 「경평 초안」 자료 요청(lib/reports/material-requests.ts) — 구성안 재료표의 「자료 필요」를 과제별로 모음.
 * 맨 위 「입력할 것」 아래에 놓이고 접어 둠(펼치면 과제별 요청 + 과제별 초안 링크), 복사 단추는 메일·메신저에 붙일 글.
 * 부서 화면 보기(?team=)에서도 읽기만 하므로 그대로 보임
 */
export function MaterialRequestsPanel({ dept, from, teamQs, year }: { dept: DeptRequests; from: string; teamQs: string; year: number }) {
  return (
    <Panel
      title="자료 요청"
      aside={
        <>
          <span className="truncate" title="구성안 재료표에서 근거가 없어 못 채운 「자료 필요」 — 과제마다 같은 문구는 한 번">
            {dept.cards.length}개 과제 · {dept.total}건
          </span>
          <CopyTextButton text={requestsText(dept, year)} label="요청 글 복사" title="메일·메신저에 붙일 글로 복사" />
        </>
      }
    >
      <details className="min-w-0">
        <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-navy">과제별 요청 보기</summary>
        <div className="flex min-w-0 flex-col gap-3 px-5 pb-4">
          {dept.cards.map((c) => (
            <div key={c.uid} className="flex min-w-0 flex-col rounded-md border border-line">
              <div className="flex min-w-0 items-center gap-2 border-b border-line bg-desk/60 px-3 py-1.5">
                <span className="shrink-0 font-mono text-ui font-bold text-navy">{c.taskNo}</span>
                <span className="min-w-0 flex-1 truncate text-ui text-ink" title={c.title}>
                  {c.title}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-2">{c.total}건</span>
                <Link href={withReturn(`/reports/cards/${c.uid}${teamQs ? `?${teamQs.slice(0, -1)}` : ""}`, from)} className="shrink-0 text-xs font-semibold text-link no-underline hover:underline" title="이 과제의 구성안·초안 화면으로">
                  열기
                </Link>
              </div>
              <ul className="flex flex-col">
                {c.items.map((r, i) => (
                  <li key={i} className="flex min-w-0 items-baseline gap-2 border-b border-row-line px-3 py-1.5 text-ui last:border-b-0">
                    <span className="min-w-0 flex-1 break-keep text-ink">{r.text}</span>
                    {r.where && (
                      <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-2" title={`쓰일 곳: ${r.where}`}>
                        {r.where}
                      </span>
                    )}
                  </li>
                ))}
                {c.more > 0 && <li className="px-3 py-1.5 text-xs text-muted-2">외 {c.more}건 — 과제별 초안 화면에서 확인</li>}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </Panel>
  );
}
