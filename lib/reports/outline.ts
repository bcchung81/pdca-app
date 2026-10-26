// 경평 초안 목차·쪽 배정(순수). 목차는 카드의 대상사업 → 실행과제 → 과제에서 만들고, 평가내용2 쪽 예산(15±1)을 셉니다.

// 근거(2026-10-12 확인): 작성분량 표(260211)의 사업 총 26·26·27쪽(「… 사업 성과관리의 적정성」 전체) 중 2025 보고서 평가내용2는 인쇄 17·17·18쪽, 그중 과제 소항목(세부 1·2)이 15·15·16쪽.
export const PAGE_BUDGET = { target: 15, tolerance: 1 } as const;
/**
 * 쪽 배정 선택지: 0~max쪽(0.5쪽 단위, report_outline 한도 10쪽) + 지금 값이 그 밖이면 더함 — 주요사업은 3쪽까지(과제당 관행),
 * 경영관리는 기본 배정(작성분량 기준)이 3쪽을 넘을 수 있어(1-1 6쪽·14-2 8쪽) 10쪽까지. 목록에 없는 값은 선택 상자가 첫 항목(0쪽)으로 보여 잘못 저장될 수 있었음(2026-10-10)
 */
export function pageSteps(max: number, current?: number): number[] {
  const top = Math.min(10, Math.max(0, max));
  const steps = Array.from({ length: Math.floor(top * 2) + 1 }, (_, i) => i / 2);
  return current !== undefined && isPageStep(current) && !steps.includes(current) ? [...steps, current].sort((a, b) => a - b) : steps;
}

export interface OutlineCard {
  id: string;
  evalUnitId: string;
  taskNo: string;
  targetBusiness: string;
  executionTask: string;
  executionTaskNo: string;
}

export interface OutlineRow {
  card_id: string;
  eval_unit_id: string;
  section: string;
  subsection: string | null;
  sort: number;
  pages: number;
}

const taskOrder = (t: string) => {
  const [n, s = ""] = t.split("-");
  return [Number(n) || 0, s] as const;
};

/** 카드 → 목차 행(사업별 과제번호 순, 대상사업·실행과제가 1·2단). 기본 쪽수 = 예산 ÷ 과제 수(0.5쪽 단위, 0.5~3쪽) */
export function buildOutline(cards: OutlineCard[]): OutlineRow[] {
  const rows: OutlineRow[] = [];
  for (const unit of [...new Set(cards.map((c) => c.evalUnitId))].sort()) {
    const list = cards
      .filter((c) => c.evalUnitId === unit)
      .sort((a, b) => {
        const [an, as] = taskOrder(a.taskNo);
        const [bn, bs] = taskOrder(b.taskNo);
        return an - bn || as.localeCompare(bs, "ko");
      });
    const pages = splitBudget(list.length);
    list.forEach((c, i) =>
      rows.push({
        card_id: c.id,
        eval_unit_id: unit,
        section: c.targetBusiness.trim() || "대상사업 미지정",
        subsection: c.executionTask.trim() ? `${c.executionTaskNo ? `${c.executionTaskNo}. ` : ""}${c.executionTask.trim()}` : null,
        sort: i,
        pages: pages[i],
      }),
    );
  }
  return rows;
}

/** 예산(15쪽)을 과제 n개에 0.5쪽 단위로 나눔: 합이 예산에 맞게(앞 과제부터 0.5쪽씩 더), 과제마다 0.5~3쪽 */
export function splitBudget(n: number): number[] {
  if (n <= 0) return [];
  const halves = PAGE_BUDGET.target * 2;
  const base = Math.min(6, Math.max(1, Math.floor(halves / n)));
  let rest = Math.max(0, halves - base * n);
  return Array.from({ length: n }, () => {
    const extra = rest > 0 && base < 6 ? 1 : 0;
    rest -= extra;
    return (base + extra) / 2;
  });
}

/** 쪽 예산 상태: 모자람·맞음·넘침 */
export function budgetState(sum: number): "under" | "ok" | "over" {
  if (sum < PAGE_BUDGET.target - PAGE_BUDGET.tolerance) return "under";
  if (sum > PAGE_BUDGET.target + PAGE_BUDGET.tolerance) return "over";
  return "ok";
}

/**
 * 실행과제마다 쪽 배정 합이 정수 쪽이 아닌 곳(반쪽이 빔) — 2025 최종본은 대상사업·실행과제가 바뀔 때 새 쪽에서 시작하므로(사업 단위 조판 lib/reports/business-layout.ts)
 * 실행과제 배정 합이 X.5쪽이면 마지막 쪽 반이 빔(09.27 호스티드: 배정 합 15쪽이 조판에서 17·18쪽). 넣은 과제만 셈
 */
export function halfPageTasks(rows: Array<{ section: string; subsection: string | null; pages: number | string; included?: boolean }>): Array<{ section: string; subsection: string; sum: number }> {
  const sums = new Map<string, { section: string; subsection: string; sum: number }>();
  for (const r of rows) {
    if (r.included === false) continue;
    const k = `${r.section}\u0000${r.subsection ?? ""}`;
    const cur = sums.get(k) ?? { section: r.section, subsection: r.subsection ?? "", sum: 0 };
    cur.sum += Number(r.pages) || 0;
    sums.set(k, cur);
  }
  return [...sums.values()].filter((x) => x.sum > 0 && Math.round(x.sum * 2) % 2 === 1);
}

export function isPageStep(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 10 && Math.round(v * 2) === v * 2;
}
