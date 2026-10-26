// 범용 조각기(참고자료 5단계, docs/reference-materials.md §4.1): 전용 파서가 없는 일반 문서를 제목·쪽 경계로 나눠 조각(generic_section)으로 만든다. 입출력 없음.
// 공통 지식은 검색 상위 N이 아니라 규칙 범위 전부를 요청에 넣으므로 조각 크기는 「빠짐」이 아니라 인용 키의 세밀도·닮은 순·매칭·화면 읽기 단위를 정한다.
// 꼬리표는 최소로 둔다(eval_item·measure·q_type·dept는 비움) — 추측해서 채운 틀린 꼬리표가 규칙 범위 판정을 흔들 수 있어서.
// 자르지 않는다: 글은 한 글자도 버리지 않고 블록 경계로만 나눈다(한 블록이 커도 그 블록 하나를 한 조각으로 둠).

import { finalizeChunks, makeChunk } from "./chunk.ts";
import type { SourceBlock } from "./source.ts";
import type { Check, KnowledgeChunk, Track, UnitId } from "./types.ts";
import type { REPORT_METHOD_USAGE } from "./usage.ts";

/** 이보다 작은 구간은 앞 구간에 합침 */
export const GENERIC_MIN_CHARS = 600;
/** 구간 중앙값이 이보다 작으면 더 얕은 제목까지 합쳐 다시 나눔 / 쪽 경계로 나눌 때 한 구간의 최소 목표 */
export const GENERIC_TARGET_CHARS = 1000;
/** 이보다 큰 구간은 블록 경계에서 나눔(한 블록이 이보다 커도 자르지 않음) */
export const GENERIC_MAX_CHARS = 6000;
/** 글이 이보다 적으면 스캔 문서(글자가 안 읽힘)로 보고 멈춤 */
export const GENERIC_MIN_TOTAL_CHARS = 200;

export interface GenericOptions {
  docId: string;
  docTitle: string;
  track: Track;
  business: UnitId | null;
  /** true면 조각 meta.search_only — 화면 검색에만 나오고 AI 근거(규칙 범위)에는 안 들어감(lib/knowledge/bundle.ts layerOf) */
  searchOnly?: boolean;
  /** 조각 meta.usage — 경평 초안 작성 방법론(lib/knowledge/usage.ts). 경평 초안 요청에만 들어감(layerOf) */
  usage?: typeof REPORT_METHOD_USAGE;
}

export interface GenericResult {
  chunks: KnowledgeChunk[];
  checks: Check[];
  stats: { blocks: number; chars: number; sections: number; splitDepth: number | null; byPage: boolean };
}

interface Section {
  title: string;
  path: string[];
  blocks: SourceBlock[];
}

const len = (b: SourceBlock) => b.text.trim().length;
const size = (s: Section) => s.blocks.reduce((a, b) => a + len(b), 0);

/** 제목 블록이면 깊이(#의 개수)와 제목 글 */
function headingOf(b: SourceBlock): { level: number; title: string } | null {
  if (b.type !== "heading") return null;
  const t = b.text.trim();
  const m = /^(#{1,6})\s*([\s\S]*)$/.exec(t);
  return m ? { level: m[1].length, title: m[2].trim() } : { level: 6, title: t };
}

function splitByHeadings(blocks: SourceBlock[], maxLevel: number): Section[] {
  const out: Section[] = [];
  let cur: Section = { title: "", path: [], blocks: [] };
  for (const b of blocks) {
    if (!len(b)) continue;
    const h = headingOf(b);
    if (h && h.level <= maxLevel) {
      if (cur.blocks.length) out.push(cur);
      cur = { title: h.title, path: [...b.breadcrumb, h.title], blocks: [b] };
    } else cur.blocks.push(b);
  }
  if (cur.blocks.length) out.push(cur);
  return out;
}

/** 제목이 없는 문서: 쪽이 바뀌는 곳에서 나누되 한 구간이 목표 크기 이상일 때만, 최대 크기를 넘기 전에 */
function splitByPages(blocks: SourceBlock[]): Section[] {
  const out: Section[] = [];
  let cur: Section = { title: "", path: [], blocks: [] };
  let last = blocks.find((b) => len(b))?.page ?? 1;
  for (const b of blocks) {
    if (!len(b)) continue;
    const s = size(cur);
    if (cur.blocks.length && (s + len(b) > GENERIC_MAX_CHARS || (b.page !== last && s >= GENERIC_TARGET_CHARS))) {
      out.push(cur);
      cur = { title: "", path: [], blocks: [] };
    }
    cur.blocks.push(b);
    last = b.page;
  }
  if (cur.blocks.length) out.push(cur);
  return out;
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[xs.length >> 1] : 0);

/** 작은 구간을 앞 구간에(첫 구간이 작으면 뒤 구간에) 합침 */
function mergeSmall(secs: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of secs) {
    const prev = out[out.length - 1];
    if (prev && (size(s) < GENERIC_MIN_CHARS || size(prev) < GENERIC_MIN_CHARS)) prev.blocks.push(...s.blocks);
    else out.push({ ...s, blocks: [...s.blocks] });
  }
  return out;
}

/** 큰 구간을 블록 경계에서 나눔. 나눈 조각의 제목에 (i/n)을 붙임 */
function splitBig(s: Section): Section[] {
  if (size(s) <= GENERIC_MAX_CHARS) return [s];
  const parts: SourceBlock[][] = [[]];
  let n = 0;
  for (const b of s.blocks) {
    if (parts.at(-1)!.length && n + len(b) > GENERIC_MAX_CHARS) {
      parts.push([]);
      n = 0;
    }
    parts.at(-1)!.push(b);
    n += len(b);
  }
  return parts.map((blocks, i) => ({ title: s.title ? `${s.title} (${i + 1}/${parts.length})` : "", path: s.path, blocks }));
}

const pageLabel = (blocks: SourceBlock[]) => {
  const pages = blocks.map((b) => b.page);
  const a = Math.min(...pages);
  const z = Math.max(...pages);
  return a === z ? `p.${a}` : `p.${a}~${z}`;
};

/** 블록 흐름 → 조각·검산. 같은 입력이면 같은 출력(키 포함) */
export function genericChunks(blocks: SourceBlock[], opts: GenericOptions): GenericResult {
  const usable = blocks.filter((b) => len(b) > 0);
  const chars = usable.reduce((a, b) => a + len(b), 0);

  // 1) 나누기: 제목이 있으면 제목 경계(너무 잘게 나뉘면 더 얕은 제목까지 합침), 없으면 쪽 경계
  const levels = [...new Set(usable.map((b) => headingOf(b)?.level).filter((l): l is number => l !== undefined))].sort((a, b) => b - a);
  let secs: Section[];
  let splitDepth: number | null = null;
  if (levels.length) {
    let chosen = levels[levels.length - 1];
    secs = splitByHeadings(usable, chosen);
    for (const l of levels) {
      const trial = mergeSmall(splitByHeadings(usable, l));
      chosen = l;
      secs = trial;
      if (median(trial.map(size)) >= GENERIC_TARGET_CHARS) break;
    }
    splitDepth = chosen;
  } else secs = mergeSmall(splitByPages(usable));

  // 2) 큰 구간 나누기 → 조각
  const parts = secs.flatMap(splitBig);
  const chunks = finalizeChunks(
    parts.map((p, i) =>
      makeChunk({
        chunk_key: `${opts.docId}/g${String(i).padStart(4, "0")}`,
        doc_id: opts.docId,
        unit_type: "generic_section",
        track: opts.track,
        business: opts.business,
        eval_item: null,
        measure: null,
        title: p.title || pageLabel(p.blocks),
        context_prefix: [opts.docTitle, ...p.path].join(" › "),
        blocks: p.blocks.map((b) => b.text),
        pdf_page_start: Math.min(...p.blocks.map((b) => b.page)),
        pdf_page_end: Math.max(...p.blocks.map((b) => b.page)),
        meta: { generic: true, breadcrumb: p.path, ...(opts.searchOnly ? { search_only: true } : {}), ...(opts.usage ? { usage: opts.usage } : {}) },
      }),
    ),
  );

  // 3) 검산
  const outChars = chunks.reduce((a, c) => a + c.blocks.reduce((x, b) => x + b.length, 0), 0);
  const sizes = chunks.map((c) => c.blocks.reduce((a, b) => a + b.length, 0));
  const over = sizes.filter((n) => n > GENERIC_MAX_CHARS).length;
  const small = sizes.filter((n) => n < GENERIC_MIN_CHARS).length;
  const tableOnly = chunks.filter((c) => c.blocks.every((b) => /^\s*(<table|\|)/.test(b))).length;
  const checks: Check[] = [
    { name: "읽은 글이 충분함(스캔 문서가 아님)", level: "error", ok: chars >= GENERIC_MIN_TOTAL_CHARS, expected: `${GENERIC_MIN_TOTAL_CHARS}자 이상`, actual: `${chars}자`, note: chars < GENERIC_MIN_TOTAL_CHARS ? "글자가 거의 읽히지 않았습니다 — 스캔한 그림 문서면 글자 인식(OCR)이 필요합니다" : undefined },
    { name: "글 손실 없음(블록 글자 합 = 조각 글자 합)", level: "error", ok: chars === outChars, expected: chars, actual: outChars },
    { name: "조각이 한 개 이상", level: "error", ok: chunks.length > 0, actual: chunks.length },
    { name: "조각 키 중복 없음", level: "error", ok: new Set(chunks.map((c) => c.chunk_key)).size === chunks.length, actual: chunks.length },
    { name: `${GENERIC_MAX_CHARS.toLocaleString("ko-KR")}자 넘는 조각(한 블록이 큰 경우 — 자르지 않음)`, level: "warn", ok: over === 0, actual: over },
    { name: `${GENERIC_MIN_CHARS}자 미만 조각(합칠 수 없었던 작은 문서)`, level: "warn", ok: small === 0 || chunks.length === 1, actual: small },
    { name: "표만 있는 조각이 절반 이하", level: "warn", ok: chunks.length === 0 || tableOnly / chunks.length <= 0.5, actual: `${tableOnly}/${chunks.length}` },
  ];
  return { chunks, checks, stats: { blocks: usable.length, chars, sections: chunks.length, splitDepth, byPage: levels.length === 0 } };
}
