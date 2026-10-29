// 경영관리 구성안 「데이터 블록 넣기」(순수, 2026-10-29 스타일 규칙 S2 보장 — docs/plan/경평초안-스타일-메타프롬프트.md).
// S2(수치 묶음을 다루는 절에 데이터 블록 하나)는 구성안 지침·요청 「수치 묶음 재료」와 참고 경고(mg-outline.ts mgBundleIssues)뿐이라 AI가 빠뜨리면 생성 운에 기댔음.
// 구성안 정리(cleanMgComposition) 직후 그 경고와 같은 판정(mgBundleGaps — 절의 블록이 쓰는 재료 중 수치 묶음 재료가 있는데 데이터 블록이 없음)으로 그 절에 데이터 블록 하나를 코드가 넣음.
// 근거 없는 표 금지: 재료는 그 절 블록이 이미 쓰는 묶음 재료(구성안 재료표 — 근거 원문 대조를 거친 것)만, 재료표에 묶음이 없으면(AI가 재료로 안 뽑음) 넣지 않음.
// 블록 상한(MG_LIMITS.blocks)·분량 어림(보통 모양 높이 > 배정 × (1 + MG_VOLUME_BAND))을 넘으면 넣지 않고 경고(mgBundleIssues)를 그대로 둠.
// 서버(outline-actions.ts runReportOutlineMg·mgPartMerge)와 연기 시험(scripts/smoke/ai-report-mg-smoke.ts)이 같은 함수를 부름. 사람 편집(applyMgCompositionEdit)에는 쓰지 않음(사람이 지운 표를 다시 넣지 않음).

import { tableBars } from "./blocks.ts";
import { mgSpecHeight } from "./business-layout.ts";
import { type Composition, type PlanBlock, planBlocks } from "./composition.ts";
import { PAGE_MM } from "./fit.ts";
import { LABEL_SUGGESTIONS, defaultCells, shapeName } from "./frameworks.ts";
import { layoutGroups } from "./layout.ts";
import type { FigureBundle } from "./mg-bundles.ts";
import { MG_VOLUME_BAND, headOnly } from "./mg-draft.ts";
import { CLOSE_LABEL } from "./mg-outcomes.ts";
import { MG_LIMITS, mgBundleGaps, mgPartLabel, sortByParts } from "./mg-outline.ts";
import { figureKeys } from "./repeat-figures.ts";

/** 넣는 블록의 라벨 — 짜임 사전의 라벨 제안(frameworks.ts LABEL_SUGGESTIONS) 「추진내용」(경영관리 짜임 사전 frameworks-mg.ts의 표 블록 라벨과 같음). 닫는 라벨(추진성과·추진실적·성과)은 쓰지 않음(성과로 닫기 판정이 바뀜) */
const DATA_LABEL: (typeof LABEL_SUGGESTIONS)[number] = "추진내용";

/**
 * 막대 든 수치 표(table:bars)가 맞는 묶음인가: 재료의 한 줄(글·원문 구절을 줄바꿈으로 가름)에 그 단위 값이 둘 이상이고 막대가 그려짐 —
 * 막대는 같은 행·같은 단위 값끼리 견주므로(blocks.ts tableBars) 값이 한 줄에 하나씩이면(순위표 행처럼) 막대가 하나도 안 그려짐 → 수치 표(table)
 */
function barsFit(m: { text: string; quote: string }, bundle: FigureBundle): boolean {
  return `${m.text}\n${m.quote}`.split("\n").some((line) => {
    // 수치 열쇠(값 + 단위) 중 그 단위만 — mg-bundles.ts unitOf와 같은 셈
    const values = [...figureKeys(line)].filter(([key]) => key.replace(/^\d+(?:\.\d+)?/, "") === bundle.unit).map(([, shown]) => shown);
    return values.length >= 2 && tableBars(values).filter((x) => x !== null).length >= 2;
  });
}

/** 구성안 보통 모양 높이(mm) — 블록마다 보통 모양(planBlocks)을 절 머리 위에 얹어 초안과 같은 셈(mgSpecHeight) */
const planHeight = (c: Composition) => mgSpecHeight({ ...headOnly(c.mg!.parts), blocks: planBlocks(c), mg: { indicator: "", parts: c.mg!.parts, at: c.blocks.map((b) => b.at ?? "") } });

/** 넣을 자리: 그 절 끝에 이어진 닫는 「추진성과」 블록들 바로 앞, 없으면 그 절 끝. 가로 반씩 짝 가운데면 짝 앞으로 */
function insertAt(blocks: PlanBlock[], key: string): number {
  const idx = blocks.flatMap((b, i) => (b.at === key ? [i] : []));
  let k = idx.length;
  while (k > 0 && blocks[idx[k - 1]].label.trim() === CLOSE_LABEL) k -= 1;
  const pos = k < idx.length ? idx[k] : idx[idx.length - 1] + 1;
  const pairs = layoutGroups(blocks.map((b) => ({ kind: b.kind, label: b.label, layout: b.layout, span: b.span })), blocks.map((b) => b.at ?? "")).flatMap((g) => g.units.filter((u) => u.length === 2));
  return pairs.some((u) => u[0] === pos - 1 && u[1] === pos) ? pos - 1 : pos;
}

/**
 * 데이터 블록 넣기(결정론): mgBundleGaps의 절마다(only를 주면 그 절만 — 절 다시 짜기) 그 절의 묶음 재료 중 값이 가장 많은 것(같으면 먼저 쓴 것) 하나로
 * 막대 든 수치 표(barsFit), 아니면 수치 표 블록 하나를 닫는 「추진성과」 앞에 넣음. 칸 수는 새로 넣는 블록의 보통 칸 수(defaultCells), 그림 자리 없음.
 * 블록 수가 상한이면 넣지 않음. pages(배정 쪽)가 있으면 넣은 뒤 보통 모양 높이가 배정 × (1 + MG_VOLUME_BAND)(분량 보강 받기와 같은 위 끝)를 넘을 때 넣지 않음.
 * 넣은 절마다 참고 경고 「데이터 블록: … 넣었습니다」(warning-levels.ts 「데이터 블록」 — info)
 */
export function addMgDataBlocks(c: Composition, pages: number | null | undefined, only?: string): { composition: Composition; notes: string[] } {
  if (!c.mg) return { composition: c, notes: [] };
  const limit = typeof pages === "number" && pages > 0 ? pages * PAGE_MM.height * (1 + MG_VOLUME_BAND) : null;
  const notes: string[] = [];
  let cur = c;
  for (const gap of mgBundleGaps(c).filter((g) => only === undefined || g.part.key === only)) {
    if (cur.blocks.length >= MG_LIMITS.blocks) break;
    const pick = gap.bundles.reduce((a, b) => (b.bundle.values.length > a.bundle.values.length ? b : a));
    const m = cur.materials.find((x) => x.id === pick.id)!;
    const variant = barsFit(m, pick.bundle) ? "bars" : "";
    const shape = shapeName("table", variant);
    const block: PlanBlock = { kind: "table", variant, label: DATA_LABEL, purpose: `${shape}: 수치 묶음 재료 ${pick.id}(${pick.bundle.unit} 값 ${pick.bundle.values.length}개)를 근거 값 그대로 보임`, cells: defaultCells("table", variant), materials: [pick.id], figures: [], at: gap.part.key };
    const blocks = [...cur.blocks];
    const at = insertAt(blocks, gap.part.key);
    const where = blocks[at]?.at === gap.part.key ? `닫는 「${CLOSE_LABEL}」 앞` : "절 끝";
    blocks.splice(at, 0, block);
    const next: Composition = { ...cur, blocks: sortByParts(blocks, cur.mg!.parts) };
    if (limit !== null && planHeight(next) > limit) continue;
    cur = next;
    notes.push(`데이터 블록: ${mgPartLabel(gap.part)}에 수치 묶음 재료 ${pick.id}(${pick.bundle.unit} 값 ${pick.bundle.values.length}개)로 ${shape} 블록(라벨 「${DATA_LABEL}」)을 ${where}에 넣었습니다 — 구성안에 데이터 블록이 없어 앱이 넣은 것입니다. 맞지 않으면 모양을 바꾸거나 지워 주세요.`);
  }
  return { composition: cur, notes };
}
