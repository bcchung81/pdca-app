// 경영관리 지표 단위 카드 밖 부분 → 개조식 마크다운(결정론, 순수). 한글(HWPX) 내려받기 입력 — lib/hwpx/generate.ts draftToKcaHwpx(md-profile 서브셋).
// 표기는 과제별 초안 원고(section-md.ts)와 같음: 장 제목 □, 대주제 ㅇ 굵게, 표 위 캡션 [ … ], 평가내용 띠는 2열 머리 표, GFM 표 칸의 「|」는 이스케이프,
// 계량 표 머리는 2단 머리(「’26년 > 목표」 — md-profile §1-2), 칸 안 불릿은 「∙ … / ∙ …」 한 칸, 【확인: …】은 그대로. 장 사이 쪽 나눔 표기는 없음(설계 §3.8 — 한글에서).
// 지표 한 파일로 과제별 초안과 이어 붙이는 일(R5d)은 unit-report-md.ts — 여기서는 장마다 줄(unitPartsLines)만 내놓음.

import { mdCaption, mdTable, mdText } from "./section-md.ts";
import { type UnitPartsMg, kpiRate, unitPartsLabels } from "./unit-parts-mg.ts";

/** 칸 안 불릿: 「∙ 가 / ∙ 나」(비어 있으면 빈 칸) */
const cellBullets = (items: string[]) => items.map((x) => `∙ ${mdText(x)}`).join(" / ");

/** 장 하나의 줄들(앞 빈 줄 포함 — 이어 붙여 쓰는 쪽이 그대로 이음). 없는 부분이면 빈 목록 */
export type UnitChapterLines = { cover: string[]; findings: string[]; prior: string[]; outcome: string[] };

/** 부분마다 개조식 줄(unitPartsMarkdown과 지표 한 파일 이어 붙이기 — unit-report-md.ts — 가 같은 줄을 씀). remarks = 지적 행 id → 비고(「p.N」 — findingRemark) */
export function unitPartsLines(p: UnitPartsMg, opts: { remarks?: Record<string, string> } = {}): UnitChapterLines {
  const L = unitPartsLabels(p.year, p.unit);
  const out: UnitChapterLines = { cover: [], findings: [], prior: [], outcome: [] };
  if (p.cover) {
    const many = p.cover.code.components.length > 1;
    for (const c of p.cover.code.components) {
      out.cover.push(
        ...(many ? mdCaption(`${p.cover.code.indicator} · ${c.label}`) : []),
        ...mdTable([
          [L.cover.method, c.method],
          [L.cover.weight, c.weight !== null ? `${c.weight}점${c.weightBasis ? `(${c.weightBasis})` : ""}` : "【확인: 가중치】"],
          [L.cover.definition, c.definition],
          [L.cover.criteria, c.criteria.map((x, i) => `${String(i + 1).padStart(2, "0")} ${x}`).join(" / ")],
        ]),
        ...(c.note ? [`※ ${mdText(c.note)}`] : []),
      );
    }
    const contacts = p.cover.human.contacts.map((r) => [r.role, r.name, r.phone, r.email]);
    out.cover.push(...mdTable([L.cover.contacts, ...(contacts.length ? contacts : [L.cover.contacts.map(() => "")])]));
  }
  if (p.findings) {
    out.findings.push("", `□ ${mdText(L.findings.title)}`, ...mdTable([L.findings.cols, ...p.findings.rows.map((r) => [cellBullets(r.code.finding), cellBullets(r.ai.actions), opts.remarks?.[r.id] ?? ""])]));
  }
  if (p.prior) {
    out.prior.push("", `□ ${mdText(L.prior.title)}`);
    for (const r of p.prior.rows) out.prior.push(...mdTable([[L.prior.evalLabel(r.code.evalNo), r.code.title]]), ...mdTable([L.prior.cols, [cellBullets(r.human.upTo), cellBullets(r.ai.now), cellBullets(r.ai.effect)]]));
  }
  if (p.outcome) {
    const O = L.outcome;
    const K = O.kpiCols;
    const kpi = p.outcome.kpi
      .filter((k) => k.human.checked)
      .map((k) => {
        const actual = k.code.actual.trim();
        return [`${k.code.name}${k.code.unit ? `(${k.code.unit})` : ""}`, k.code.prev, k.code.target, actual || "【확인: 실적 미입력】", actual ? kpiRate(k).text : "", cellBullets(k.ai.analysis)];
      });
    out.outcome.push(
      "",
      `□ ${mdText(O.title)}`,
      `ㅇ **1. ${mdText(O.theme1)}**`,
      ...mdCaption(O.kpiTitle),
      ...mdTable([[K.name, K.prev, `${K.year} > ${K.target}`, `${K.year} > ${K.actual}`, `${K.year} > ${K.rate}`, K.analysis], ...kpi]),
      ...mdCaption(O.qualTitle),
      ...mdTable([O.qualCols, ...p.outcome.qual.map((r) => [r.human.label, cellBullets(r.ai.result), cellBullets(r.ai.analysis)])]),
      `ㅇ **2. ${mdText(O.theme2)}**`,
      ...mdTable([O.planCols, ...p.outcome.plan.map((r) => [r.human.label, cellBullets(r.ai.self), cellBullets(r.ai.plan)])]),
    );
  }
  return out;
}

/** 카드 밖 부분 → 개조식 마크다운(첫 줄 제목, 있는 부분만 장 순서대로). remarks = 지적 행 id → 비고(「p.N」 — findingRemark) */
export function unitPartsMarkdown(p: UnitPartsMg, opts: { remarks?: Record<string, string> } = {}): string {
  const l = unitPartsLines(p, opts);
  const out: string[] = [mdText(`${p.indicator} ${p.year}년도 경영실적보고서 카드 밖 부분 초안`), "", ...l.cover, ...l.findings, ...l.prior, ...l.outcome];
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
