// 경평 초안 「채울 것」 모음(순수) — 재료 결손(올해 계량 실적 미입력·【확인: …】 자리표시·초안 없음·근거에 없는 숫자)을
// 평가단위(주요사업은 사업, 경영관리는 지표) × 부서별로 모아 할 일 많은 순으로 줄 세움. 2026-10-17 운영 측정: 보고서 47행 모두 계량 실적 0건,
// 【확인】이 경영관리 초안 43장 모두·주요사업 7/8장·카드 밖 부분에 102개 — 과제별 초안 화면 하나하나에서만 보여 한눈에 못 봤음.
// 성과관리팀 「보고서 현황」과 부서 「경평 초안」 위쪽이 같은 모음을 씀(부서는 자기 팀 줄만 넘겨 받음).

import { needsIn } from "./actuals.ts";
import { needRequestsOf } from "./material-requests.ts";
import { kpiKey, kpiRowsOf } from "./model.ts";
import { sectionText } from "./section.ts";
import { type SubmitCard, cardSubmitRow } from "./submission.ts";


/** 견본 한 개의 글자 수(자리표시 글 앞부분) */
export const SAMPLE_CHARS = 40;
/** 줄마다 보여 줄 견본 수 */
export const SAMPLE_MAX = 3;

/** 카드 밖 부분 이름(eval_unit_report_parts.part) — 견본 앞에 붙임 */
export const UNIT_PART_LABEL: Record<string, string> = { cover: "표지", findings: "지적사항", prior: "전년 대비", outcome: "성과분석·환류" };

export interface TodoCard {
  unitId: string;
  teamId: number;
  /** 카드 계량 성과지표 원자료(cards.data->kpi->rows) */
  kpi: unknown;
  submit: SubmitCard;
}

export interface TodoInput {
  /** 평가단위(정렬 순서 = 보여 줄 순서). 모음은 여기 있는 단위만 */
  units: Array<{ id: string; name: string; cardGroup: string | null }>;
  teams: Array<{ id: number; name: string }>;
  cards: TodoCard[];
  /** 보고서 행(평가단위 × 부서) — inputs.kpi[카드 id#지표 순번] = 부서가 넣은 올해 실적 */
  reports: Array<{ id: number; unitId: string; teamId: number; inputs: unknown }>;
  /** 지표 단위 카드 밖 부분 행(경영관리 — 없으면 빈 목록) */
  parts?: Array<{ unitId: string; part: string; spec: unknown }>;
}

export interface TodoRow {
  unitId: string;
  unitName: string;
  cardGroup: string | null;
  /** null = 지표 단위 카드 밖 부분 줄(부서에 속하지 않음 — 성과관리팀이 채움) */
  teamId: number | null;
  teamName: string;
  reportId: number | null;
  /** 활성 카드 수 */
  cards: number;
  /** 목차에 든 과제 중 초안(과제별 초안)이 없거나 구성안뿐인 수 */
  noDraft: number;
  /** 【확인: …】 자리표시 수(과제·부분마다 같은 이름은 한 번) */
  needs: number;
  /** 자리표시 글 앞 40자 견본(앞에서 3개, 「과제번호 글」) */
  samples: string[];
  /** 카드 계량 성과지표 행 수 · 그중 부서가 올해 실적을 안 넣은 수 */
  kpiTotal: number;
  kpiMissing: number;
  /** 근거에 없는 숫자(과제별 초안 합) */
  unknown: number;
  /** 구성안 재료표의 「자료 필요」 수(과제마다 같은 문구는 한 번, 목차에서 뺀 과제 제외) — 할 일 합에는 안 넣음(부서 「자료 요청」 목록과 같은 셈) */
  requests: number;
  /** 할 일 합 = 계량 미입력 + 【확인】 + 초안 없는 과제 + 근거에 없는 숫자 (정렬 기준) */
  todo: number;
}

export interface TodoTotals {
  requests: number;
  needs: number;
  kpiMissing: number;
  noDraft: number;
  unknown: number;
  todo: number;
}

export interface TodoBoard {
  rows: TodoRow[];
  totals: TodoTotals;
}

/** 견본 한 개: 줄바꿈·겹공백을 한 칸으로 접고 앞 40자 */
const sample = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, SAMPLE_CHARS);

/** 값 안의 모든 글(문자열)을 줄바꿈으로 이은 글 — 카드 밖 부분 spec에서 자리표시를 찾으려고 */
export function stringsOf(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsOf(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) stringsOf(x, out);
  return out;
}

const filled = (inputs: unknown, key: string): boolean => {
  const kpi = (inputs as { kpi?: Record<string, unknown> } | null | undefined)?.kpi;
  const v = kpi && typeof kpi === "object" ? kpi[key] : undefined;
  return typeof v === "string" ? v.trim() !== "" : typeof v === "number";
};

/**
 * 평가단위 × 부서 줄을 모아 할 일 많은 순(같으면 단위 순서·부서 이름 순)으로 돌려줌.
 * 카드나 보고서가 없는 단위·부서는 줄이 없고, 카드 밖 부분 줄(teamId null)은 자리표시가 있을 때만 생김.
 * 줄은 할 일이 0이어도 카드가 있으면 넣음(화면이 0을 걸러 보여 줌 — 「다 채움」 건수도 알리려고)
 */
export function buildTodoBoard(input: TodoInput): TodoBoard {
  const unitOrder = new Map(input.units.map((u, i) => [u.id, i]));
  const unitOf = new Map(input.units.map((u) => [u.id, u]));
  const teamName = new Map(input.teams.map((t) => [t.id, t.name]));
  const reportOf = new Map(input.reports.map((r) => [`${r.unitId}|${r.teamId}`, r]));
  const groups = new Map<string, TodoCard[]>();
  for (const c of input.cards) {
    if (!unitOf.has(c.unitId)) continue;
    const k = `${c.unitId}|${c.teamId}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  const rows: TodoRow[] = [];
  for (const [k, cs] of groups) {
    const { unitId, teamId } = { unitId: cs[0].unitId, teamId: cs[0].teamId };
    const u = unitOf.get(unitId)!;
    const report = reportOf.get(k) ?? null;
    let noDraft = 0;
    let needs = 0;
    let unknown = 0;
    let requests = 0;
    let kpiTotal = 0;
    let kpiMissing = 0;
    const samples: string[] = [];
    for (const c of cs) {
      const rows2 = kpiRowsOf(c.kpi);
      kpiTotal += rows2.length;
      kpiMissing += rows2.filter((r) => !filled(report?.inputs, kpiKey(c.submit.id, r.i))).length;
      if (!c.submit.included) continue; // 목차에서 뺀 과제는 초안·자리표시를 따지지 않음(제출 조건과 같음)
      requests += needRequestsOf(c.submit.draft?.outline).length;
      const row = cardSubmitRow(c.submit);
      if (row.state === "none" || row.state === "outline") {
        noDraft++;
        continue;
      }
      unknown += row.unknown;
      const names = c.submit.draft?.spec ? needsIn(sectionText(c.submit.draft.spec)) : [];
      needs += names.length;
      for (const n of names) samples.push(`${c.submit.taskNo} ${sample(n)}`);
    }
    rows.push({
      unitId,
      unitName: u.name,
      cardGroup: u.cardGroup,
      teamId,
      teamName: teamName.get(teamId) ?? String(teamId),
      reportId: report?.id ?? null,
      cards: cs.length,
      noDraft,
      needs,
      samples: samples.slice(0, SAMPLE_MAX),
      kpiTotal,
      kpiMissing,
      unknown,
      requests,
      todo: kpiMissing + needs + noDraft + unknown,
    });
  }

  // 지표 단위 카드 밖 부분 — 부분마다 같은 이름은 한 번, 지표 하나에 한 줄
  const partsByUnit = new Map<string, Array<{ part: string; spec: unknown }>>();
  for (const p of input.parts ?? []) if (unitOf.has(p.unitId)) partsByUnit.set(p.unitId, [...(partsByUnit.get(p.unitId) ?? []), p]);
  for (const [unitId, ps] of partsByUnit) {
    let needs = 0;
    const samples: string[] = [];
    for (const p of ps) {
      const names = needsIn(stringsOf(p.spec).join("\n"));
      needs += names.length;
      for (const n of names) samples.push(`${UNIT_PART_LABEL[p.part] ?? p.part} ${sample(n)}`);
    }
    if (!needs) continue;
    const u = unitOf.get(unitId)!;
    rows.push({ unitId, unitName: u.name, cardGroup: u.cardGroup, teamId: null, teamName: "카드 밖 부분", reportId: null, cards: 0, noDraft: 0, needs, samples: samples.slice(0, SAMPLE_MAX), kpiTotal: 0, kpiMissing: 0, unknown: 0, requests: 0, todo: needs });
  }

  rows.sort((a, b) => b.todo - a.todo || (unitOrder.get(a.unitId) ?? 0) - (unitOrder.get(b.unitId) ?? 0) || a.teamName.localeCompare(b.teamName, "ko"));
  const sum = (f: (r: TodoRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  return { rows, totals: { requests: sum((r) => r.requests), needs: sum((r) => r.needs), kpiMissing: sum((r) => r.kpiMissing), noDraft: sum((r) => r.noDraft), unknown: sum((r) => r.unknown), todo: sum((r) => r.todo) } };
}
