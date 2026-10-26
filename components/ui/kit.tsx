import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { GroupSeg } from "../shell/group-seg";
import { PeekEscape } from "../shell/peek-escape";

// C3 교정쇄 스튜디오 공용 부품(서버 컴포넌트). 한 화면 한 가지 일 · 글자 넘침 없음(min-w-0, truncate + title).

/**
 * 한 줄 머리(2026-10-01 「H1」): 제목은 왼쪽, 화면 선택(세그먼트)과 버튼은 같은 줄 오른쪽. 56px.
 * 부제(설명 글)는 두지 않음 — 화면이 무엇인지는 제목·메뉴가 말하고, 쓰는 법은 도움말에.
 * Screen의 header 슬롯에 넣어 스크롤 영역 밖에 고정합니다.
 */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line-strong px-8 py-2">
      <h1 className="min-w-0 truncate font-serif text-title leading-8 font-bold tracking-[-0.3px] text-navy" title={title}>
        {title}
      </h1>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <Suspense fallback={null}>
          <GroupSeg />
        </Suspense>
        {children}
      </div>
    </header>
  );
}

/** 화면 본문 틀: 머리(header 슬롯, 고정) + 세로 스크롤 본문 + 옆 창이 겹쳐 뜰 자리 */
export function Screen({ children, peek, header }: { children: ReactNode; peek?: ReactNode; header?: ReactNode }) {
  return (
    <div className="relative flex min-h-0 min-w-0 grow flex-col">
      {header}
      <div className="relative flex min-h-0 min-w-0 grow">
        {/* 세로 flex 스크롤 상자 안에서 표·탭(overflow 상자)이 화면 높이에 눌려 잘리지 않게 직계 요소는 줄이지 않음 */}
        <main className="flex min-w-0 grow flex-col gap-3 overflow-y-auto px-8 pt-3 pb-4 [&>*]:shrink-0">{children}</main>
        {peek}
      </div>
    </div>
  );
}

/** 머리 아래 도구 줄: 검색·필터 칩·건수를 한 줄에(2026-10-01) */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">{children}</div>;
}

export function NoAccess({ title, need }: { title: string; need: string }) {
  return (
    <Screen header={<PageHeader title={title} />}>
      <p className="text-sm text-muted-2">{need} 이상만 볼 수 있는 화면입니다. 역할은 관리자가 「사용자·권한」에서 정합니다.</p>
    </Screen>
  );
}

const TONE = {
  navy: "border-navy text-navy",
  link: "border-link text-link",
  handoff: "border-st-handoff text-st-handoff",
  warn: "border-warn text-warn",
  muted: "border-field-line text-muted-2",
  solid: "border-navy bg-navy text-white",
  warnSolid: "border-warn bg-warn-bg text-warn",
} as const;
export type Tone = keyof typeof TONE;

export function Tag({ tone = "muted", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-5 shrink-0 items-center rounded-chip border px-[5px] text-xs leading-5 whitespace-nowrap ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** 진행 막대 한 칸의 색 — 색만으로 가르지 않게 범례에 라벨과 숫자를 함께 적음. 어두움 순서: navy > warn > handoff > accent > line */
const SEG_TONE = { navy: "bg-navy", accent: "bg-accent", handoff: "bg-st-handoff", warn: "bg-warn", line: "bg-line" } as const;
export type SegTone = keyof typeof SEG_TONE;

export interface StatSegment {
  label: string;
  n: number;
  tone: SegTone;
  /** 누르면 그 상태만 보임(막대와 범례 둘 다 누를 수 있음) */
  href?: string;
  /** 지금 걸러 보는 상태 */
  on?: boolean;
  title?: string;
  /** 범례 숫자 뒤에 붙는 짧은 보충(예: 「변경 1 · 변경 없음 0」) — 막대에는 안 나옴 */
  sub?: string;
}

export interface StatMetric {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "warn";
  href?: string;
  /** 값 옆 작은 진행 막대(n / of) */
  bar?: { n: number; of: number };
  title?: string;
}

/**
 * 통계 패널(2026-10-01 「S3」): 통계 카드 여러 장 대신 한 줄 패널 하나.
 * - segments가 있으면 상태 분포를 누적 막대 하나로 보이고, 범례(라벨·숫자)가 필터를 겸함 — 상태 탭 줄을 따로 두지 않음.
 * - metrics는 막대에 안 들어가는 독립 지표(작성본 31/59, 집중보완 3 등). segments가 없으면 지표 칸만 나열(AI 사용량 등).
 */
export function StatPanel({ title, total, unit = "건", segments, allHref, allOn, allLabel = "전체", metrics }: { title?: string; total?: ReactNode; unit?: string; segments?: StatSegment[]; allHref?: string; allOn?: boolean; allLabel?: string; metrics?: StatMetric[] }) {
  const shown = (segments ?? []).filter((s) => s.n > 0);
  const sum = (segments ?? []).reduce((n, s) => n + s.n, 0);
  const metricBody = (m: StatMetric) => (
    <>
      <span className="truncate text-xs font-semibold text-muted">{m.label}</span>
      <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-2">
        <b className={`font-serif text-title leading-7 font-bold ${m.tone === "warn" ? "text-warn" : "text-navy"}`}>{m.value}</b>
        {m.sub && <span className={`truncate ${typeof m.sub === "string" && m.sub.startsWith("/") ? "-ml-1.5" : ""}`}>{m.sub}</span>}
        {m.bar && (
          <span className="h-1.5 w-[72px] shrink-0 overflow-hidden rounded-full bg-row-line" aria-hidden="true">
            <span className="block h-full bg-navy" style={{ width: `${m.bar.of ? Math.min(100, Math.round((m.bar.n / m.bar.of) * 100)) : 0}%` }} />
          </span>
        )}
      </span>
    </>
  );
  const metricCls = "flex min-w-0 flex-col gap-0.5";
  return (
    <section aria-label={title ?? "요약"} className="flex min-h-14 min-w-0 flex-wrap items-center gap-x-7 gap-y-3 rounded-lg border border-line bg-paper px-5 py-2">
      {title !== undefined && (
        <div className="flex shrink-0 flex-col">
          <span className="text-xs font-semibold text-muted">{title}</span>
          <span className="text-xs leading-5 text-muted-2">
            <b className="mr-0.5 font-serif text-title font-bold text-navy">{total}</b>
            {unit}
          </span>
        </div>
      )}
      {segments && (
        <div className="flex min-w-[260px] grow basis-[320px] flex-col gap-1.5">
          <div role="group" aria-label={`${title ?? "상태"} 분포`} className="flex h-2.5 gap-0.5">
            {shown.map((s) => {
              const cls = `block h-2.5 min-w-[3px] rounded-chip ${SEG_TONE[s.tone]}`;
              const style = { flexGrow: s.n, flexBasis: 0 };
              return s.href ? <Link key={s.label} href={s.href} scroll={false} aria-label={`${s.label} ${s.n}${unit}`} title={s.title ?? `${s.label} ${s.n}`} style={style} className={cls} /> : <span key={s.label} title={s.title ?? `${s.label} ${s.n}`} style={style} className={cls} />;
            })}
            {sum === 0 && <span className="block h-2.5 grow rounded-chip bg-line" />}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs leading-4 text-muted-2">
            {allHref && (
              <Link href={allHref} scroll={false} aria-current={allOn ? "true" : undefined} className={`flex items-center gap-1.5 no-underline hover:text-navy ${allOn ? "font-bold text-navy" : ""}`}>
                {allLabel} <b className="font-mono font-medium text-navy">{total ?? sum}</b>
              </Link>
            )}
            {(segments ?? []).map((s) => {
              const body = (
                <>
                  <i className={`block size-2 rounded-[2px] ${SEG_TONE[s.tone]}`} aria-hidden="true" />
                  {s.label} <b className="font-mono font-medium text-navy">{s.n}</b>
                  {s.sub && <span className="font-normal text-muted"> {s.sub}</span>}
                </>
              );
              const cls = `flex items-center gap-1.5 whitespace-nowrap ${s.on ? "font-bold text-navy" : ""}`;
              return s.href ? (
                <Link key={s.label} href={s.href} scroll={false} aria-current={s.on ? "true" : undefined} title={s.title} className={`${cls} no-underline hover:text-navy`}>
                  {body}
                </Link>
              ) : (
                <span key={s.label} title={s.title} className={cls}>
                  {body}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {metrics && metrics.length > 0 &&
        (segments ? (
          metrics.map((m) => {
            const cls = `${metricCls} shrink-0 border-l border-row-line pl-7`;
            return m.href ? (
              <Link key={m.label} href={m.href} title={m.title} className={`${cls} no-underline hover:text-navy`}>
                {metricBody(m)}
              </Link>
            ) : (
              <div key={m.label} title={m.title} className={cls}>
                {metricBody(m)}
              </div>
            );
          })
        ) : (
          <div className="grid min-w-0 grow grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-7 gap-y-3">
            {metrics.map((m) =>
              m.href ? (
                <Link key={m.label} href={m.href} title={m.title} className={`${metricCls} no-underline hover:text-navy`}>
                  {metricBody(m)}
                </Link>
              ) : (
                <div key={m.label} title={m.title} className={metricCls}>
                  {metricBody(m)}
                </div>
              ),
            )}
          </div>
        ))}
    </section>
  );
}

export function Panel({ title, aside, children, className = "", dense }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; /** 머리를 36px로 낮춤(현황 대시보드처럼 한 화면에 여러 패널을 넣을 때) */ dense?: boolean }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-lg border border-line bg-paper ${className}`}>
      {(title || aside) && (
        <div className={`flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-line ${dense ? "h-9 px-4" : "px-5 py-3"}`}>
          <h2 className="min-w-0 truncate text-sm font-bold text-navy">{title}</h2>
          {aside && <div className="flex shrink-0 items-center gap-2 text-xs text-muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-navy">{title}</p>
      {children && <div className="max-w-[560px] text-ui leading-6 text-muted-2">{children}</div>}
    </div>
  );
}

/** 도구 줄의 필터 칩 묶음(2026-10-01 — 예전 전폭 밑줄 탭 줄 대신 검색 옆에 놓는 작은 칩). 화면 종류 전환은 머리의 세그먼트(GroupSeg), 상태 분포는 StatPanel 범례가 맡음 */
export function LinkTabs({ label, tabs }: { label: string; tabs: Array<{ href: string; label: string; n?: number; on: boolean }> }) {
  return (
    <nav className="flex min-w-0 shrink-0 gap-0.5 overflow-x-auto rounded-lg border border-line-strong bg-paper p-0.5 [scrollbar-width:none]" aria-label={label}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          aria-current={t.on ? "page" : undefined}
          href={t.href}
          scroll={false}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ui whitespace-nowrap no-underline ${t.on ? "bg-desk font-bold text-navy shadow-[inset_0_0_0_1px_var(--line)]" : "font-medium text-muted-2 hover:text-navy"}`}
        >
          {t.label}
          {t.n !== undefined && <span className="font-mono text-xs">{t.n}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** 오른쪽에서 밀려 나와 머리띠까지 덮는 옆 창(✕·Esc로 닫힘). 뒤 목록 폭을 줄이지 않습니다 */
export function Peek({ label, title, eyebrow, closeHref, width = 560, actions, fill, children }: { label: string; title: string; eyebrow?: ReactNode; closeHref: string; width?: number; actions?: ReactNode; /** 몸통을 스크롤 없는 가로 배치로(안쪽 영역이 각자 스크롤 — 월간 점검의 원문 | 점검표) */ fill?: boolean; children: ReactNode }) {
  return (
    <aside
      role="dialog"
      aria-label={label}
      style={{ maxWidth: width }}
      className="peek-sheet flex w-full flex-col border-l border-line-strong bg-paper shadow-peek"
    >
      <PeekEscape closeHref={closeHref} />
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 pt-4 pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && <span className="truncate font-mono text-xs text-muted">{eyebrow}</span>}
          <h2 className="truncate font-serif text-lg font-bold text-navy" title={title}>
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Link href={closeHref} scroll={false} aria-label="닫기 (Esc)" title="닫기 (Esc)" className="flex size-8 shrink-0 items-center justify-center rounded-md border border-field-line text-muted no-underline hover:border-navy">
            ✕
          </Link>
        </div>
      </div>
      <div className={fill ? "flex min-h-0 grow overflow-hidden" : "min-h-0 grow overflow-y-auto"}>{children}</div>
    </aside>
  );
}

/** 끈 단추: 주 단추라도 칠하지 않음(점선 줄 + 흐린 글자) — 칠한 끈 단추가 주 단추로 보이지 않게(10-13 정제 언어 규칙 D) */
const OFF = "disabled:cursor-not-allowed disabled:border-dashed disabled:border-field-line disabled:bg-paper disabled:text-muted";
const BTN = "flex shrink-0 items-center gap-1.5 rounded-md border text-xs font-semibold whitespace-nowrap no-underline";

/** 표·단추 공용 클래스. 단추는 크기별 완성 문자열을 씀(h-7·h-8을 이어 붙여 덮으면 CSS 순서에 따라 결과가 갈림) */
export const T = {
  wrap: "min-w-0 overflow-hidden rounded-lg border border-line bg-paper",
  table: "w-full table-fixed border-collapse text-sm",
  headRow: "h-10 bg-thead text-left text-xs font-semibold text-muted",
  th: "border-b border-line px-3 whitespace-nowrap",
  td: "border-b border-row-line px-3 whitespace-nowrap",
  row: "h-12 hover:bg-row-hover",
  rowOn: "h-12 bg-row-hover",
  /** 보조 단추 32px */
  btn: `${BTN} h-8 border-field-line bg-paper px-3 text-ink hover:border-navy ${OFF}`,
  /** 주 단추 32px — 한 영역에 하나 */
  btnPrimary: `${BTN} h-8 border-navy bg-navy px-3 text-white ${OFF}`,
  /** 표 안·작은 영역의 보조 단추 28px */
  btnSm: `${BTN} h-7 border-field-line bg-paper px-2.5 text-ink hover:border-navy ${OFF}`,
  /** 표 안·작은 영역의 주 단추 28px */
  btnPrimarySm: `${BTN} h-7 border-navy bg-navy px-2.5 text-white ${OFF}`,
  /** 조용한 단추(글자만, 링크 색) */
  btnQuiet: "flex shrink-0 items-center gap-1 rounded-md px-1 text-xs font-medium whitespace-nowrap text-link no-underline hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline",
  /** 아이콘만 있는 단추 32×32 — 모양만, 줄·글자 색은 쓰는 곳이 더함(켜짐 border-navy text-navy 등). aria-label·title 필수 */
  iconBtn: `flex size-8 shrink-0 items-center justify-center rounded-md border no-underline ${OFF}`,
  /** 모양을 따로 둔 단추(둥근 칩·큰 로그인 단추 등)의 끈 상태 */
  off: OFF,
  field: "h-9 w-full min-w-0 rounded-md border border-field-line bg-paper px-2.5 text-sm text-ink",
  label: "flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted",
};

/** 부서 화면을 성과관리팀·관리자가 볼 때 위에 띄우는 안내. all = 부서를 안 골라도 모든 과제가 보이는 화면(내 과제) */
export function PreviewBanner({ teamName, all, children }: { teamName: string | null; all?: boolean; children?: ReactNode }) {
  const text = teamName
    ? `${teamName} 담당자에게 보이는 화면입니다(읽기 전용).`
    : all
      ? "모든 부서의 과제가 보입니다(읽기 전용). 부서를 고르면 그 부서 과제만 보입니다."
      : "부서를 고르면 그 부서 담당자에게 보이는 화면을 그대로 봅니다.";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-link/40 bg-info-bg px-4 py-2.5 text-ui text-ink">
      <Tag tone="link">{all && !teamName ? "전체 과제" : "부서 화면 보기"}</Tag>
      <span className="min-w-0 truncate">{text}</span>
      {children}
    </div>
  );
}
