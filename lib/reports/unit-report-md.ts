// 경영관리 지표 한 파일 한글(HWPX) 원고(R5d, 순수 — 입출력 없음). 설계 §3.8: 표지 표 → Ⅰ 지적사항 조치실적 → Ⅱ 전년 대비 → Ⅲ 세부평가내용별 추진실적 및 성과(= 목차 순 과제별 초안) → Ⅳ 성과분석 및 환류.
// 장 제목·로마 숫자·연도는 unit-parts-mg.ts unitPartsLabels 한 곳(MG-1은 지표관리 방향 자리만큼 한 칸 밀림). 과제별 초안은 sectionMarkdown(경영관리 spec은 평가내용 → 대주제 → 절 머리 표)이고,
// 앞 과제 마지막 절과 같은 평가내용·대주제의 머리는 되풀이하지 않음(사업 조판의 mgContinuations와 같은 규칙). 첫 줄 제목은 파일 제목(draftToKcaHwpx가 제목 박스).
// 장 사이 쪽 나눔 표기는 없음: kordoc markdownToHwpx의 이 공문서(보고서) 옵션에는 마크다운으로 쪽을 나누는 표기가 없어(개조식 장 배너의 쪽 나눔은 kordoc 내부 양식 전용) — 장 사이 쪽 나눔은 한글에서 한다.

import { type BusinessItem, mgContinuations, orderItems } from "./business-layout.ts";
import { mdText, sectionMarkdown } from "./section-md.ts";
import { unitPartsLines } from "./unit-parts-md.ts";
import { type UnitPartsMg, unitPartsLabels } from "./unit-parts-mg.ts";

/**
 * 지표 한 파일 원고. items = 사업 조판과 같은 과제(목차 순서 — 안 넣은 과제는 뺌), remarks = 지적 행 id → 비고(「p.N」).
 * 초안이 없는 과제는 자리표시 한 줄(【확인】)과 경고 — 글을 지어내지 않음. 부분이 없으면(혁신가점 12~14는 표지뿐) 그 장은 쓰지 않고 Ⅲ만 이어 씀
 */
export function unitReportMarkdown(parts: UnitPartsMg, items: BusinessItem[], opts: { remarks?: Record<string, string> } = {}): { md: string; warnings: string[] } {
  const warnings: string[] = [];
  const L = unitPartsLabels(parts.year, parts.unit);
  const lines = unitPartsLines(parts, opts);
  const ordered = orderItems(items);
  const conts = mgContinuations(ordered);
  const out: string[] = [mdText(`${parts.indicator} ${parts.year}년도 경영실적보고서 초안`), "", ...lines.cover, ...lines.findings, ...lines.prior, "", `□ ${mdText(L.detail.title)}`];
  ordered.forEach((it, i) => {
    if (!it.spec) {
      warnings.push(`초안 없음: ${it.taskNo} ${it.title}`);
      out.push("", `ㅇ 【확인: ${mdText(it.taskNo)} ${mdText(it.title)} 과제별 초안 없음】`);
      return;
    }
    const r = sectionMarkdown(it.spec, { mgCont: conts[i] });
    // 첫 줄(과제 제목)과 빈 줄을 뗌 — 지표 한 파일에서는 평가내용·대주제·절 머리 표가 구조
    out.push(...r.md.split("\n").slice(2));
    warnings.push(...r.warnings.map((w) => `${it.taskNo}: ${w}`));
  });
  out.push(...lines.outcome);
  return { md: `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`, warnings };
}
