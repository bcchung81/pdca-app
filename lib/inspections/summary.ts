// 월간 점검 취합 결과보고서(지침 14 주요사업·13 경영관리 <취합 보고>) — 그 달 점검표의 판정만 집계합니다(재판정·창작 없음). 순수 함수.
// 한 번의 취합은 한 트랙의 점검표만 받으므로(화면이 트랙으로 거름) 양식(biz14·mgmt13)은 입력의 첫 점검표에서 정하고, 점검표가 없으면 호출자가 넘긴 트랙 양식을 씀.
// 보완 건수 = 미흡 항목 수 합, 집중보완 = ★핵심 3항목 중 판정 가능한 것 2개 이상 미흡(model.ts의 tally와 같은 규칙).

import { CASE_NO_SOURCE, FORM_ID, type FormId, type InspectionResult, type InspectionStatus, type JudgeStatus, MGMT_FORM_ID, STAR_ITEMS, TABLE_KEYS, type TableKey, directionLines, formTablesOf, judgeStatus, rowLabel, tally } from "./model.ts";

export interface SummaryInput {
  card: { taskNo: string; title: string; business: string; department: string; team: string | null };
  status: InspectionStatus;
  result: InspectionResult;
}

export interface GroupRow {
  name: string;
  count: number;
  avg: Record<TableKey, number>;
  focus: number;
}

export interface MonthlySummary {
  /** 취합한 점검표의 양식(biz14 주요사업·mgmt13 경영관리) — 점검표가 없으면 호출자가 넘긴 트랙 양식(기본 주요사업) */
  form: FormId;
  count: number;
  avg: Record<TableKey, number>;
  focus: number;
  needs: number;
  judge: Record<JudgeStatus, number>;
  sent: Record<InspectionStatus, number>;
  byBusiness: GroupRow[];
  byDept: GroupRow[];
  focusList: Array<{ taskNo: string; title: string; dept: string; stars: string[]; direction: string[] }>;
  weakTop: Array<{ table: TableKey; name: string; label: string; count: number; star: boolean }>;
  cases: Array<{ key: string; count: number }>;
  /** 경영관리: 주요사업 연계 후보 종합(부서 간 협의 안건) — 그 달 점검표 미흡 행의 연계 후보를 주요사업 과제별로 모음(주요사업 취합은 빈 목록) */
  bizLinks: Array<{ id: string; title: string; tasks: string[] }>;
  unknowns: Array<{ label: string; count: number; notes: string[] }>;
  nas: Array<{ label: string; count: number; notes: string[] }>;
  /** 기관장 보고 1면: 트랙 한 문장 + 최우선 보완 3가지 */
  headline: string;
  top3: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const isStar = (table: TableKey, no: number) => STAR_ITEMS.some((s) => s.table === table && s.no === no);

function group(rows: SummaryInput[], keyOf: (r: SummaryInput) => string): GroupRow[] {
  const m = new Map<string, SummaryInput[]>();
  for (const r of rows) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]);
  return [...m.entries()].map(([name, list]) => ({ name, count: list.length, ...averages(list) }));
}

function averages(list: SummaryInput[]): { avg: Record<TableKey, number>; focus: number } {
  const avg = {} as Record<TableKey, number>;
  const ts = list.map((r) => tally(r.result));
  for (const k of TABLE_KEYS) avg[k] = list.length ? round1(ts.reduce((n, t) => n + t.tables[k].met, 0) / list.length) : 0;
  return { avg, focus: ts.filter((t) => t.focus).length };
}

/** 개선방향에서 ★핵심 항목을 다룬 줄(없으면 첫 줄) — 집중보완 안건에 옮김 */
export function focusDirection(direction: string, form?: FormId): string[] {
  const lines = directionLines(direction);
  const names = STAR_ITEMS.map((s) => formTablesOf(form)[s.table].rows[s.no - 1].name);
  const hit = lines.filter((l) => names.some((n) => l.includes(n)));
  return hit.length ? hit : lines.slice(0, 1);
}

/** 사례제안 첫 줄의 「기관명 — 사업명(등급)」(인사이트 줄·기준 미확인·해당 없음 제외) */
export function caseKey(text: string): string | null {
  const first = text.split("\n")[0]?.trim() ?? "";
  if (!first || first.startsWith("해당 없음") || first.startsWith("기준 미확인") || first === CASE_NO_SOURCE) return null;
  const head = first.split(":")[0].trim();
  return head || null;
}

function reasons(list: SummaryInput[], judgment: "기준 미확인" | "해당 없음", form: FormId): Array<{ label: string; count: number; notes: string[] }> {
  const out: Array<{ label: string; count: number; notes: string[] }> = [];
  const tables = formTablesOf(form);
  for (const k of TABLE_KEYS) {
    tables[k].rows.forEach((f, i) => {
      const hits = list.map((r) => r.result[k][i]).filter((r) => r?.judgment === judgment);
      if (hits.length) out.push({ label: rowLabel(k, f.no, form), count: hits.length, notes: [...new Set(hits.map((h) => h.note).filter(Boolean))].slice(0, 5) });
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** fallbackForm: 점검표가 0건일 때의 양식 — 화면이 고른 트랙의 `TrackSpec.inspectionForm` */
export function summarize(list: SummaryInput[], fallbackForm: string = FORM_ID): MonthlySummary {
  const form = (list[0]?.result.form ?? fallbackForm) === MGMT_FORM_ID ? MGMT_FORM_ID : FORM_ID;
  const tables = formTablesOf(form);
  const ts = list.map((r) => tally(r.result));
  const judge: Record<JudgeStatus, number> = { 점검완료: 0, 보완요청: 0, 재점검필요: 0 };
  for (const r of list) judge[judgeStatus(r.result)] += 1;
  const sent: Record<InspectionStatus, number> = { draft: 0, sent: 0, acknowledged: 0 };
  for (const r of list) sent[r.status] += 1;

  const weakTop: MonthlySummary["weakTop"] = [];
  for (const k of TABLE_KEYS)
    tables[k].rows.forEach((f, i) => {
      const count = list.filter((r) => r.result[k][i]?.judgment === "미흡").length;
      if (count) weakTop.push({ table: k, name: f.name, label: rowLabel(k, f.no, form), count, star: isStar(k, f.no) });
    });
  // 건수 많은 순, 같으면 ★ 먼저, 그다음 양식 순서(안정 정렬)
  weakTop.sort((a, b) => b.count - a.count || Number(b.star) - Number(a.star));

  const caseCount = new Map<string, number>();
  for (const r of list) {
    const key = caseKey(r.result.overview.case);
    if (key) caseCount.set(key, (caseCount.get(key) ?? 0) + 1);
  }
  // 주요사업 연계 후보: 과제번호별로 그 후보를 받은 경영관리 과제번호(같은 과제는 한 번) — 과제명은 처음 본 연계 후보의 것(원장에서 코드가 채운 값)
  const links = new Map<string, { id: string; title: string; tasks: string[] }>();
  for (const r of list)
    for (const k of TABLE_KEYS)
      for (const row of r.result[k])
        for (const l of row?.links ?? []) {
          const hit = links.get(l.id) ?? { id: l.id, title: l.title, tasks: [] };
          if (!hit.tasks.includes(r.card.taskNo)) hit.tasks.push(r.card.taskNo);
          links.set(l.id, hit);
        }
  const { avg, focus } = averages(list);
  const top3 = weakTop.slice(0, 3).map((w) => `${tables[w.table].short} '${w.name}' 미흡 ${w.count}건${w.star ? " (★핵심)" : ""}`);
  return {
    form,
    count: list.length,
    avg,
    focus,
    needs: ts.reduce((n, t) => n + t.needs, 0),
    judge,
    sent,
    byBusiness: group(list, (r) => r.card.business || "—"),
    byDept: group(list, (r) => r.card.department || "—"),
    focusList: list
      .map((r, i) => ({ r, t: ts[i] }))
      .filter(({ t }) => t.focus)
      .map(({ r, t }) => ({
        taskNo: r.card.taskNo,
        title: r.card.title,
        dept: r.card.team ? `${r.card.department}(${r.card.team})` : r.card.department,
        stars: t.stars.weak,
        direction: focusDirection(r.result.overview.direction, form),
      })),
    weakTop,
    cases: [...caseCount.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    bizLinks: [...links.values()].sort((a, b) => b.tasks.length - a.tasks.length || a.id.localeCompare(b.id, "ko", { numeric: true })),
    unknowns: reasons(list, "기준 미확인", form),
    nas: reasons(list, "해당 없음", form),
    headline: list.length
      ? `${form === MGMT_FORM_ID ? "경영관리" : "주요사업"} ${list.length}개 과제 점검 결과 평균 7대축 ${avg.axes}/7 · 질의패턴 ${avg.patterns}/8 · 정합성 ${avg.coherence}/5, 보완 ${ts.reduce((n, t) => n + t.needs, 0)}건 · 집중보완 ${focus}건`
      : "",
    top3,
  };
}

/** 경영관리 취합 보고의 「주요사업 연계 후보 종합」이 비었을 때 — 붙임4 자리는 원장 주요사업 카드(2026-10-12), 연계 후보는 미흡 행에만 붙음 */
export const MGMT_LINK_NOTE = "이 달 점검표의 미흡 행에 주요사업 연계 후보가 없습니다.";

/** 「주요사업 연계 후보 종합」 한 줄: 주요사업N N-가 「과제명」 → 경영관리 과제 N건(과제번호들) */
export function bizLinkLine(l: { id: string; title: string; tasks: string[] }): string {
  return `▸ ${l.id} 「${l.title}」 → 경영관리 과제 ${l.tasks.length}건(${l.tasks.join(", ")})`;
}

/** 취합 결과보고서 마크다운(지침 14·13 <출력구조 모드="취합 보고"> 순서) — 화면과 같은 값. 경영관리는 부서별 집계만(대상사업별 없음)이고 「주요사업 연계 후보 종합」이 더해짐 */
export function summaryMarkdown(period: string, s: MonthlySummary): string {
  const [y, m] = period.split("-");
  const avg = (r: { avg: Record<"axes" | "patterns" | "coherence", number> }) => `${r.avg.axes}/7 | ${r.avg.patterns}/8 | ${r.avg.coherence}/5`;
  const group = (label: string, rows: GroupRow[]) => [`| ${label} | 점검수 | 평균 7대축 | 평균 질의패턴 | 평균 정합성 | 집중보완 |`, "|---|---|---|---|---|---|", ...rows.map((r) => `| ${r.name} | ${r.count}건 | ${avg(r)} | ${r.focus}건 |`)];
  const mgmt = s.form === MGMT_FORM_ID;
  const lines = [
    `# [${y}-${m}월] KCA 경영평가 월간 점검 취합 결과보고서 — ${mgmt ? "경영관리" : "주요사업"}`,
    "",
    `◆ 총괄 현황 : 점검 ${s.count}건 / 평균 7대축 ${s.avg.axes}/7 · 질의패턴 ${s.avg.patterns}/8 · 정합성 ${s.avg.coherence}/5 / 집중보완 ${s.focus}건 / 상태(완료 ${s.judge.점검완료}건·보완요청 ${s.judge.보완요청}건·재점검 ${s.judge.재점검필요}건)`,
    "",
    ...(mgmt ? [] : ["## □ 대상사업별 집계", "", ...group("대상사업", s.byBusiness), ""]),
    "## □ 부서별 집계",
    "",
    ...group("본부·단", s.byDept),
    "",
    "## □ 집중보완 과제 (회의 핵심 안건)",
    "",
    ...(s.focusList.length
      ? ["| 과제(부서·팀) | ★핵심 미흡 | 개선방향 |", "|---|---|---|", ...s.focusList.map((f) => `| ${f.taskNo} ${f.title} (${f.dept}) | ${f.stars.join(" · ")} | ${f.direction.join("<br>")} |`)]
      : ["집중보완 과제가 없습니다."]),
    "",
    "## □ 공통 미흡 패턴 Top",
    "",
    ...(s.weakTop.length ? s.weakTop.slice(0, 10).map((w) => `▸ ${formTablesOf(s.form)[w.table].short} '${w.name}' 미흡 ${w.count}건${w.star ? " (★핵심)" : ""}`) : ["미흡 판정이 없습니다."]),
    "",
    "## □ 사례제안 종합",
    "",
    ...(s.cases.length ? s.cases.map((c) => `▸ ${c.key} ${c.count}건 제안${c.count >= 2 ? " → 전사 벤치마킹 후보" : ""}`) : ["사례제안이 없습니다."]),
    "",
    ...(mgmt ? ["## □ 주요사업 연계 후보 종합 (부서 간 협의 안건)", "", ...(s.bizLinks.length ? s.bizLinks.map(bizLinkLine) : [MGMT_LINK_NOTE]), ""] : []),
    "## □ 기준 미확인·해당 없음 종합 (지식파일 보완 신호)",
    "",
    ...s.unknowns.map((u) => `▸ 기준 미확인 · ${u.label} ${u.count}건${u.notes.length ? ` — 필요 자료: ${u.notes.join(" / ")}` : ""}`),
    ...s.nas.map((u) => `▸ 해당 없음 · ${u.label} ${u.count}건${u.notes.length ? ` — ${u.notes.join(" / ")}` : ""}`),
    ...(s.unknowns.length + s.nas.length ? [] : ["기준 미확인·해당 없음 판단이 없습니다."]),
    "",
    "## ○ 기관장 보고 1면",
    "",
    s.headline,
    "",
    ...s.top3.map((t, i) => `${i + 1}. ${t}`),
    "",
  ];
  return lines.join("\n");
}
