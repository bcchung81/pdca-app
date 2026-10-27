import Link from "next/link";
import { Panel } from "../ui/kit";

// 현황 대시보드 패널들(두 트랙 공통 틀) — 한 화면에 스크롤 없이 들어가도록 머리를 낮추고(dense) 표 대신 막대·타일로 압축.
// 서버 컴포넌트(상호작용 없음). 높이는 호출하는 쪽(dashboard/page.tsx)의 flex가 나눠 줌.

/** 창 높이 880px 이상이면 평가단위 줄(24 → 32px)과 목록 위아래에 여백을 더 줌 — 낮은 창은 촘촘하게 두어 한 화면을 지킴 */
const TALL_ROW = "[@media(min-height:880px)]:h-8";
const TALL_PAD_LIST = "[@media(min-height:880px)]:py-1";

const pctOf = (n: number, of: number) => (of ? Math.min(100, Math.round((n / of) * 100)) : 0);

function MiniBar({ n, of, text, tone = "navy" }: { n: number; of: number; text: string; tone?: "navy" | "warn" }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="h-1.5 min-w-0 grow overflow-hidden rounded-full bg-row-line" aria-hidden="true">
        <span className={`block h-full ${tone === "warn" ? "bg-warn" : "bg-navy"}`} style={{ width: `${pctOf(n, of)}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-2">{text}</span>
    </span>
  );
}

export interface TodoItem {
  n: number;
  label: string;
  hint: string;
  href: string;
  /** 숫자 옆 「/전체」 — 전체 중 몇 개가 남았는지 */
  of?: number;
  /** 남은 일이 어디에 몰려 있는지 같은 구체적인 보충(없으면 줄을 안 그림) */
  detail?: string;
  /** 다른 사람이 일을 못 하는 막힘일 때만(남은 일·진행 중은 경고가 아님) */
  alert?: boolean;
}

/** 이달 할 일: 남은 높이를 줄마다 나눠 가짐. 0건 항목은 맨 아래 접이식 하나로 모음(0건에 빈 이동을 강요하지 않음) */
export function TodoPanel({ items }: { items: TodoItem[] }) {
  const open = items.filter((t) => t.n > 0);
  const empty = items.filter((t) => t.n === 0);
  return (
    <Panel title="이달 할 일" dense className="min-h-0 grow">
      <ul className="flex min-h-0 grow flex-col">
        {open.map((t) => (
          <li key={t.label} className="flex min-h-[38px] grow basis-auto xl:basis-0 border-b border-row-line last:border-b-0">
            <Link href={t.href} className="flex min-w-0 grow items-center gap-3.5 px-4 no-underline hover:bg-row-hover">
              <span className="flex w-10 shrink-0 flex-col items-end">
                <span className={`font-serif text-title leading-6 font-bold ${t.alert ? "text-warn" : "text-navy"}`}>{t.n}</span>
                {t.of !== undefined && <span className="font-mono text-xs leading-4 text-muted">/{t.of}</span>}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-ui leading-[18px] font-semibold text-navy">{t.label}</span>
                <span className="truncate text-xs leading-4 text-muted-2" title={t.hint}>
                  {t.hint}
                </span>
                {t.detail && (
                  <span className="truncate text-xs leading-4 font-medium text-ink" title={t.detail}>
                    {t.detail}
                  </span>
                )}
              </span>
              <span className="ml-auto shrink-0 text-xs text-link" aria-hidden="true">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {empty.length > 0 && (
        <details className="shrink-0 border-t border-row-line">
          <summary className="cursor-pointer px-4 py-2 text-xs text-muted-2 hover:bg-row-hover">처리할 것 없음 {empty.length}개</summary>
          <ul>
            {empty.map((t) => (
              <li key={t.label} className="flex items-center gap-3.5 border-t border-row-line px-4 py-1.5">
                <span className="w-10 shrink-0 text-right font-serif text-title leading-6 font-bold text-muted">0</span>
                <span className="truncate text-ui font-semibold text-muted-2" title={t.hint}>
                  {t.label}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

export interface UnitRow {
  id: string;
  name: string;
  n: number;
  submitted: number;
  sent: number;
}

/** 대상사업별(경영관리는 지표별): 마다 작성본(확정 — 예전 제출 포함)·점검(보냄·확인) 진행 막대 두 개. inspection={false}면 작성본 막대만 */
export function UnitsPanel({ units, title = "대상사업별", inspection = true, columns = 1 }: { units: UnitRow[]; title?: string; inspection?: boolean; columns?: 1 | 2 }) {
  const two = columns === 2;
  // 2열(xl 이상)이면 한 줄이 ≈400px라 넓은 막대 열을 두면 이름 칸이 0폭으로 접힘(경영관리 지표 14개) — 막대 열을 좁히고 작은 라벨은 숨김(머리 오른쪽 설명이 같은 말)
  const grid = inspection
    ? `grid-cols-[minmax(0,1fr)_32px_minmax(0,176px)_minmax(0,176px)] ${two ? "xl:grid-cols-[minmax(0,1fr)_24px_minmax(0,96px)_minmax(0,96px)] xl:gap-2" : ""}`
    : `grid-cols-[minmax(0,1fr)_32px_minmax(0,176px)] ${two ? "xl:grid-cols-[minmax(0,1fr)_24px_minmax(0,96px)] xl:gap-2" : ""}`;
  const barLabel = `w-9 shrink-0 text-xs whitespace-nowrap text-muted ${two ? "xl:hidden" : ""}`;
  return (
    <Panel title={title} aside={inspection ? "이달 작성본(확정) · 점검(보냄·확인)" : "이달 작성본(확정)"} dense className="shrink-0">
      <ul className={`${TALL_PAD_LIST} ${columns === 2 ? "grid grid-cols-1 gap-x-6 xl:grid-cols-2" : "flex flex-col"}`}>
        {units.map((u) => (
          <li key={u.id} className={`grid h-6 ${TALL_ROW} ${grid} items-center gap-3 border-b border-row-line px-4 text-ui last:border-b-0`}>
            <Link href={`/cards?unit=${u.id}`} className="truncate font-semibold text-navy no-underline hover:underline" title={u.name}>
              {u.name}
            </Link>
            <span className="font-mono text-xs text-muted-2" title="과제 수">
              {u.n}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className={barLabel}>작성본</span>
              <MiniBar n={u.submitted} of={u.n} text={`${u.submitted}/${u.n}`} />
            </span>
            {inspection && (
              <span className="flex min-w-0 items-center gap-2">
                <span className={barLabel}>점검</span>
                <MiniBar n={u.sent} of={u.n} text={`${u.sent}/${u.n}`} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export interface DeptTile {
  key: string;
  name: string;
  teamId: number | null;
  hq: string;
  n: number;
  submitted: number;
  unacked: number;
  accounts: number;
}

/** 부서 타일 한 칸 — 막대 = 작성본 확정(예전 제출 포함), 주황 점 = 미확인 점검 수, 점선 테두리 = 담당자 계정 없음 */
function DeptTileView({ t }: { t: DeptTile }) {
  const detail = `${t.name} · ${t.hq} · 과제 ${t.n} · 작성본 ${t.submitted}/${t.n} · 미확인 점검 ${t.unacked} · ${t.accounts ? `담당자 ${t.accounts}명` : "담당자 계정 없음"}`;
  const cls = `flex min-w-0 flex-col justify-center gap-0.5 rounded-md border bg-paper px-2 ${t.accounts ? "border-line" : "border-dashed border-warn"}`;
  const body = (
    <>
      <span className="flex min-w-0 items-center justify-between gap-1.5 text-xs leading-4 text-navy">
        <b className="truncate font-semibold">{t.name}</b>
        {t.unacked > 0 && <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-warn px-1 font-mono text-xs leading-4 font-semibold text-white">{t.unacked}</span>}
      </span>
      <MiniBar n={t.submitted} of={t.n} text={`${t.submitted}/${t.n}`} />
    </>
  );
  return t.teamId ? (
    <Link href={`/my?team=${t.teamId}`} title={`${detail} — 이 부서 담당자 화면 보기`} className={`${cls} no-underline hover:border-navy`}>
      {body}
    </Link>
  ) : (
    <div title={detail} className={cls}>
      {body}
    </div>
  );
}

export interface HqGroup {
  hq: string;
  n: number;
  submitted: number;
  tiles: DeptTile[];
}

/** 본부·실·단 → 부서(팀)별(두 트랙 공통): 본부마다 작성본 진행 막대 + 그 아래 부서 타일. 감사실처럼 팀이 없는 곳은 타일이 본부 이름 하나. 남는 세로 공간은 본부 줄이 나눠 갖고 타일이 그 높이만큼 늘어남(최소 34px) */
export function HqDeptPanel({ groups }: { groups: HqGroup[] }) {
  return (
    <Panel
      title={`본부·실·단별 · 부서 ${groups.reduce((n, g) => n + g.tiles.length, 0)}개`}
      aside={<span>막대 = 이달 작성본 확정 · 점선 = 담당자 계정 없음 · 타일을 누르면 그 부서 담당자 화면</span>}
      dense
      className="grow"
    >
      <ul className="flex grow flex-col">
        {groups.map((g) => (
          <li key={g.hq} className="grid grow grid-cols-[176px_minmax(0,1fr)] items-center gap-3 border-b border-row-line px-3 py-1 last:border-b-0 [@media(min-height:880px)]:py-2">
            <span className="flex min-w-0 flex-col gap-0.5">
              <b className="truncate text-ui leading-4 font-semibold text-navy" title={g.hq}>
                {g.hq}
              </b>
              <MiniBar n={g.submitted} of={g.n} text={`${g.submitted}/${g.n}`} />
            </span>
            <div className="grid h-full gap-1.5 [grid-auto-rows:minmax(34px,1fr)] [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))]">
              {g.tiles.map((t) => (
                <DeptTileView key={t.key} t={t} />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
