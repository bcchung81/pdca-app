// 경영관리 경평 초안의 「주요사업 초안 참고」(순수 — 2026-11-12 사용자 결정): 사람이 고른 주요사업 경평 초안과 그 원장·붙임을 경영관리 초안(구성안·집필·분량 보강·블록 고치기)의 참고 자료로.
// 읽기는 lib/reports/mg-biz-queries.ts(DB 함수 mg_biz_ref_texts — 그 경영관리 카드를 읽을 수 있는 사람만), 여기서는 그 결과를 요청 자료·숫자 근거·초안 근거 목록으로 바꿈.
// - AI가 보는 글은 원문 그대로(원장 → 경평 초안 → 붙임, 주요사업마다). 이 경영관리 과제의 첨부와 섞이지 않게 docs는 MaterialDoc(kind card·report)이 아님 —
//   초안 근거 목록(spec.sources)에는 주요사업 하나당 biz 한 줄만 적고(붙임은 따로 적지 않음), 이 카드의 자료로 착각하지 않게 함(draft-sources.ts specSources·withFileSources)
// - 숫자 근거: 원장·붙임·초안 글 모두 인정. 단 그 주요사업 초안에서 이미 「없는 숫자」(card_report_drafts.unknown_numbers)는 숫자 근거 글에서 가려 경영관리 초안에서도 「없는 숫자」로 남김
// - 인용 대조: 초안 원문(가린 숫자가 든 구절도 원문에서 찾음)

import { inspectionCardText } from "../ai/inspect.ts";
import { stripNeeds } from "./actuals.ts";
import type { BizRefText } from "./mg-biz-queries.ts";
import { type ReportFile, type ReportSource, readSection, sectionText } from "./section.ts";
import { sectionMarkdown } from "./section-md.ts";

/** AI에 넣을 주요사업 자료 하나(요청 「첨부 자료」 뒤에 이어 붙음 — relation이 문구를 가름) */
export interface BizDoc {
  /** 「<주요사업 카드 id>#card」·「#draft」·「#card:<자료 id>」·「#report:<자료 id>」 — 요청 안에서만 쓰는 열쇠(DB id 아님) */
  id: string;
  name: string;
  text: string;
  relation: Extract<ReportFile["relation"], "biz" | "biz-draft">;
  numberEvidence: true;
}

export interface BizMaterials {
  /** AI에 넣을 자료(원문 그대로) */
  docs: BizDoc[];
  /** 숫자 근거 글 — 초안 글은 그 초안의 없는 숫자를 가린 사본 */
  known: string;
  /** 인용 대조에만 더하는 글(초안 원문) */
  quote: string;
  /** 블록 고치기·분량 보강의 근거 글(「근거 — 첨부·전년 보고서 절·실사 답변」)에 붙일 원문 — 이름 머리 포함 */
  prompt: string;
  /** 초안 근거 목록(spec.sources)에 넣을 biz 항목(주요사업 하나당 한 줄) */
  sources: ReportSource[];
}

/** 가린 자리(숫자가 아님 — 숫자 대조에 안 잡힘) */
export const BIZ_MASK = "▒";

/** section.ts numberTokens와 같은 숫자 조각(자리까지 — 가리기용) */
const NUM_RE = /(?<![’'\d.,])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(%|퍼센트|배)?/g;
/** section.ts numKey와 같은 열쇠 */
const numKey = (tok: string) => tok.replace(/,/g, "").replace(/\s+/g, "").replace(/퍼센트/, "%");

/** 글에서 unknown(그 초안의 없는 숫자)과 같은 숫자 조각만 가림 — 다른 숫자의 일부(「12」 속 「1,234」 등)는 안 건드림 */
export function maskNumbers(text: string, unknown: readonly string[]): string {
  const bad = new Set(unknown.map((t) => numKey(t.trim())).filter(Boolean));
  if (!bad.size) return text;
  return text.replace(NUM_RE, (m) => (bad.has(numKey(m.trim())) ? `${BIZ_MASK}${m.slice(m.trimEnd().length)}` : m));
}

/** 주요사업 초안 → 읽기 좋은 글(개조식 마크다운 — 한글 내려받기와 같은 풀이). 못 풀면 글 모음 */
function draftText(spec: NonNullable<ReturnType<typeof readSection>>): string {
  try {
    const md = sectionMarkdown(spec).md.trim();
    if (md) return md;
  } catch {
    // 옛 판 초안 등 — 글 모음으로
  }
  return sectionText(spec);
}

/** 주요사업 자료인가(relation biz·biz-draft) */
export const isBizFile = (f: { relation?: string }) => f.relation === "biz" || f.relation === "biz-draft";

/**
 * 신호 계산(이야기 틀 후보·도식 후보 등)에 쓰는 첨부 — 주요사업 자료를 뺌(이 카드 글·이 카드 첨부만, 주요사업 초안 낱말이 경영관리 후보에 섞이지 않게).
 * AI에 보여 주는 첨부 목록·재료 번호([첨부 N])에는 쓰지 않음(그쪽은 전체 그대로)
 */
export const withoutBizFiles = <T extends { relation?: string }>(files: readonly T[]): T[] => files.filter((f) => !isBizFile(f));

/** 초안 근거 목록 이름 */
export const bizSourceName = (taskId: string) => `${taskId} 경평 초안`;

/** 읽은 주요사업 초안들 → 요청 자료·숫자 근거·인용 대조 글·초안 근거 목록 */
export function bizMaterials(refs: readonly BizRefText[]): BizMaterials {
  const docs: BizDoc[] = [];
  const known: string[] = [];
  const quote: string[] = [];
  const sources: ReportSource[] = [];
  for (const ref of refs) {
    const label = [ref.taskId, ref.title].filter(Boolean).join(" ");
    const ledger = inspectionCardText(ref.data);
    if (ledger.trim()) {
      docs.push({ id: `${ref.cardId}#card`, name: `${label} — 원장`, text: ledger, relation: "biz", numberEvidence: true });
      known.push(ledger);
    }
    const spec = readSection(ref.spec);
    if (spec) {
      const text = draftText(spec);
      docs.push({ id: `${ref.cardId}#draft`, name: `${label} — 경평 초안`, text, relation: "biz-draft", numberEvidence: true });
      // 숫자 근거 = 그 초안의 숫자 대조와 같은 글(【확인】 자리표시를 걷은 sectionText(spec, true)) − 그 초안의 없는 숫자
      known.push(maskNumbers(stripNeeds(sectionText(spec, true)), ref.unknownNumbers));
      quote.push(text);
    }
    for (const f of ref.files) {
      if (!f.text.trim()) continue;
      docs.push({ id: `${ref.cardId}#${f.kind}:${f.id}`, name: `${label} — 붙임 ${f.name}`, text: f.text, relation: "biz", numberEvidence: true });
      known.push(f.text);
    }
    sources.push({ kind: "biz", id: ref.cardId, name: bizSourceName(ref.taskId), stamp: ref.stamp, at: ref.updatedAt });
  }
  return { docs, known: known.join("\n"), quote: quote.join("\n"), prompt: docs.map((d) => `[주요사업 자료] ${d.name}\n${d.text}`).join("\n\n"), sources };
}

/** 주요사업 카드 id(「주요사업9/9-가」) → 표기(「주요사업9 9-가」 — biz-links.ts bizTaskId와 같은 모양). 모양이 다르면 id 그대로 */
export const bizIdLabel = (id: string) => (/^주요사업\d+\/\d{1,2}-[가-힣]$/.test(id) ? id.replace("/", " ") : id);

/** 고른 주요사업 중 읽지 못한 것(권한 없음·초안 없음·보관) — 초안 경고(「「주요사업9 9-가 경평 초안」(찾을 수 없음)」) */
export function bizMissing(want: readonly string[], refs: readonly Pick<BizRefText, "cardId">[]): string[] {
  const got = new Set(refs.map((r) => r.cardId));
  return [...new Set(want)].filter((id) => !got.has(id)).map((id) => `「${bizSourceName(bizIdLabel(id))}」(찾을 수 없음)`);
}

/**
 * 블록 고치기로 새로 고른 주요사업 초안을 쓰면 초안 근거 목록에도 더함(첨부 뒤 — 이미 있는 주요사업은 그때 지문 그대로: 나머지 블록은 그때 초안으로 쓴 것).
 * 새 항목이 없으면 같은 배열
 */
export function withBizSources<T extends { kind: string; id: string; name: string }>(sources: T[] | undefined, biz: readonly ReportSource[]): T[] | undefined {
  const s = sources ?? [];
  const have = new Set(s.filter((x) => x.kind === "biz").map((x) => x.id));
  const extra = biz.filter((b) => !have.has(b.id)).map((b) => ({ ...b }) as unknown as T);
  if (!extra.length) return sources;
  const lastFile = s.reduce((at, x, i) => (x.kind === "card" || x.kind === "report" || x.kind === "biz" ? i : at), -1);
  return [...s.slice(0, lastFile + 1), ...extra, ...s.slice(lastFile + 1)];
}
