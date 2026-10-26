import Link from "next/link";
import type { ReactNode } from "react";
import { T } from "./kit";

// 「다음 할 일」 띠(서버 컴포넌트, 10-13 정제 시안 section.next): 제목 + 단계 목록(상태 표지 + 이름 + 상태 글) + 오른쪽 주 단추 하나.
// 내 과제 「N월에 할 일」에 쓰고, 경평 초안 허브·초안 화면의 단계 안내도 같은 부품으로 그림.

/** 상태 톤 다섯(components/ui/status-tone.ts 규칙): idle 시작 전 · doing 우리 차례 · handoff 상대 차례 · done 끝 · alert 막힘·예외 */
export type MarkTone = "idle" | "doing" | "handoff" | "done" | "alert";

export interface NextStep {
  tone: MarkTone;
  label: string;
  state: string;
  /** 상태 글을 누르면 갈 곳(같은 범위의 대상 목록) */
  href?: string;
  /** 주 행동과 맞는 단계 */
  now?: boolean;
}

/** 상태 표지(장식 — 뜻은 옆 글자가 말함). 모양으로도 가름: 점선 고리 · 반쯤 찬 원 · 굵은 고리 · 체크 원 · 마름모 */
export function StatusMark({ tone }: { tone: MarkTone }) {
  const svg = (cls: string, body: ReactNode) => (
    <svg viewBox="0 0 10 10" className={`size-2.5 shrink-0 ${cls}`} aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
  if (tone === "idle") return svg("text-muted", <circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />);
  if (tone === "doing")
    return svg(
      "text-st-doing",
      <>
        <circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 .75A4.25 4.25 0 0 0 5 9.25Z" fill="currentColor" />
      </>,
    );
  if (tone === "handoff") return svg("text-st-handoff", <circle cx="5" cy="5" r="3.75" fill="none" stroke="currentColor" strokeWidth="2.5" />);
  if (tone === "done")
    return svg(
      "text-st-done",
      <>
        <circle cx="5" cy="5" r="5" fill="currentColor" />
        <path d="M2.8 5.1 4.4 6.6 7.3 3.5" fill="none" className="stroke-paper" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </>,
    );
  return svg("text-st-alert", <rect x="1.75" y="1.75" width="6.5" height="6.5" rx="1" transform="rotate(45 5 5)" fill="currentColor" />);
}

/**
 * 단계 띠. 주 행동(action)은 한 영역에 하나(T.btnPrimary 모양의 링크), 없으면 empty 글을 그 자리에 둠.
 * 좁은 폭에서는 제목·단계·단추가 줄을 바꿔 내려감(가로 넘침 없음).
 * inset: 패널 안에 붙는 모양(10-13 시안 .next--inset — 경평 초안 허브의 사업마다): 테두리·둥근 모서리 없이 패널 머리 아래 구분선,
 * 단계 앞 번호(1·2·3), 제목은 보이지 않고 접근 이름(aria-label)으로만.
 */
export function NextSteps({ id, title, steps, action, empty, inset }: { id: string; title: string; steps: NextStep[]; action?: { href: string; label: string; title?: string } | null; empty?: string; inset?: boolean }) {
  return (
    <section
      aria-labelledby={inset ? undefined : id}
      aria-label={inset ? title : undefined}
      className={inset ? "flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2.5 border-b border-line bg-paper px-5 py-2.5" : "flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2.5 rounded-lg border border-line bg-paper px-5 py-3"}
    >
      {!inset && (
        <h2 id={id} className="shrink-0 text-base leading-6 font-bold text-navy">
          {title}
        </h2>
      )}
      <ol className="m-0 flex min-w-0 flex-auto list-none flex-wrap items-center gap-x-1.5 gap-y-2 p-0">
        {steps.map((s, i) => (
          <li key={s.label} aria-current={s.now ? "step" : undefined} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            {i > 0 && <span className="mr-1 h-px w-[18px] shrink-0 bg-field-line" aria-hidden="true" />}
            {inset && <span className={`shrink-0 font-mono text-ui font-semibold ${s.now ? "text-navy" : "text-muted"}`}>{i + 1}</span>}
            <StatusMark tone={s.tone} />
            <span className={`text-sm font-semibold whitespace-nowrap ${s.now ? "text-navy" : "text-ink"}`}>{s.label}</span>
            {s.href ? (
              <Link href={s.href} className={`inline-flex min-h-6 items-center text-ui whitespace-nowrap text-link no-underline hover:underline ${s.now ? "font-semibold" : ""}`}>
                {s.state}
              </Link>
            ) : (
              <span className={`text-ui whitespace-nowrap ${s.now ? "font-semibold text-st-doing-text" : "text-muted-2"}`}>{s.state}</span>
            )}
          </li>
        ))}
      </ol>
      {action ? (
        <Link href={action.href} title={action.title} className={`${T.btnPrimary} ml-auto`}>
          {action.label}
        </Link>
      ) : (
        empty && <p className="ml-auto text-ui text-muted-2">{empty}</p>
      )}
    </section>
  );
}
