// 경평 초안 구성안 「짜임 고르기」·「여러 안」(순수, 2026-10-12 사용자 요구 「같은 양식 찍어내기 — 이야기 틀·개별 수정안이 요청에 따라 다양한 프레임워크로」 ②·③).
// 담당자가 고르는 짜임은 세 갈래이고 함께 고를 수 있습니다: 이야기 틀(무엇을 앞세울지 — frameworks.ts·frameworks-mg.ts) · 구성 패턴(몇 단·어떤 블록 순서·배치 —
// framework-patterns.ts) · 2025 예시 절(「이 절처럼」 — 공통 지식의 2025 경영실적보고서 절 report_section). 고른 것은 구성안 요청 글(report-outline*/request.md frame.*)로 들어가고
// 구성안에 기록됩니다(Composition.frame · 경영관리 절 MgPart.frame). 예시 절 글은 짜임만 본뜨는 참고라 숫자·원문 대조 근거에 넣지 않습니다(부르는 쪽이 근거 글에 더하지 않음 — 시험이 지킴).
// 「여러 안」은 서로 다른 짜임 2~3개로 구성안을 동시에 한 번씩 부르고(저장 안 함) 담당자가 하나를 고르면 그것만 저장합니다 — 여기는 고른 짜임 정리·같은 짜임 걸러내기·비용 어림.
// 클라이언트(틀 갤러리)도 상수·열쇠를 가져다 쓰므로 무거운 모듈(section.ts 등)을 import하지 않습니다.

import { estimateUsd } from "../ai/pricing.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";
import { STORIES } from "./blocks.ts";
import { MG_MAIN_STORIES } from "./frameworks-mg.ts";
import { BIZ_RETIRED_SHAPES, shapeCode, shapeName } from "./frameworks.ts";
import { type FrameworkPattern, type PatternBlock, type PatternClose, patternOf } from "./framework-patterns.ts";

/** 담당자가 고른 짜임 하나(요청 — 화면 → 서버). auto = 여러 안에서 「AI가 서로 다르게」(다른 갈래와 함께 쓰지 않음) */
export interface FrameChoice {
  story?: string;
  pattern?: string;
  example?: { key: string; title: string };
  auto?: boolean;
}

/** 구성안에 남기는 기록(만들 때 고른 짜임 + 요청 글) */
export interface OutlineFrame {
  story?: string;
  pattern?: string;
  example?: { key: string; title: string };
  request?: string;
}

/** 요청 글 상한(주요사업 구성안 메모와 같음 — 화면 maxLength·서버 자르기 공용) */
export const FRAME_REQUEST_MAX = 500;
/** 여러 안 수 */
export const ALT_LIMITS = { min: 2, max: 3 } as const;

const line = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** 2025 예시 절 조각 키(주요사업 rpt25-biz/BZ-N/…, 경영관리 rpt25-mg-NN/MG-N/…) */
export const isExampleKey = (key: string, mg: boolean) => (mg ? /^rpt25-mg-\d{2}\/MG-\d+\//.test(key) : /^rpt25-biz\/BZ-\d+\//.test(key));

/**
 * 화면이 보낸 짜임 하나 검증: 이야기 틀은 그 트랙 목록(주요사업 12종 + 섞음 · 경영관리 12종), 구성 패턴은 카탈로그 id, 예시 절은 그 트랙의 2025 보고서 절 키 모양.
 * auto는 다른 갈래가 없을 때만 남김. 고른 것이 없으면 빈 짜임(ok)
 */
export function cleanFrameChoice(raw: unknown, mg: boolean): { ok: true; frame: FrameChoice } | { ok: false; message: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const frame: FrameChoice = {};
  const story = typeof r.story === "string" ? r.story.trim() : "";
  if (story) {
    if (!(mg ? (MG_MAIN_STORIES as readonly string[]) : (STORIES as readonly string[])).includes(story)) return { ok: false, message: "모르는 이야기 틀입니다." };
    frame.story = story;
  }
  const pattern = typeof r.pattern === "string" ? r.pattern.trim() : "";
  if (pattern) {
    if (!patternOf(pattern)) return { ok: false, message: "모르는 구성 패턴입니다." };
    frame.pattern = pattern;
  }
  const ex = r.example as { key?: unknown; title?: unknown } | undefined;
  if (ex && typeof ex === "object" && typeof ex.key === "string" && ex.key) {
    if (!isExampleKey(ex.key, mg)) return { ok: false, message: "고른 2025 예시 절을 찾을 수 없습니다. 다시 골라 주세요." };
    frame.example = { key: ex.key, title: line(ex.title, 160) };
  }
  if (r.auto === true && !frame.story && !frame.pattern && !frame.example) frame.auto = true;
  return { ok: true, frame };
}

export const isEmptyFrame = (f: FrameChoice) => !f.story && !f.pattern && !f.example && !f.auto;
/** 같은 짜임인지 볼 열쇠 */
export const frameKey = (f: FrameChoice) => JSON.stringify([f.story ?? "", f.pattern ?? "", f.example?.key ?? "", f.auto ? 1 : 0]);

/** 예시 절 이름 줄임(「2025 보고서 」 머리를 걷고 앞 42자) */
const shortTitle = (t: string) => {
  const s = t.replace(/^2025 보고서\s*/, "");
  return s.length > 42 ? `${s.slice(0, 41)}…` : s;
};

/** 화면·요청 글 이름: 「이야기 틀 X · 구성 패턴 Y · 2025 예시 「…」」(고른 것만, 없으면 빈 글) */
export function frameLabel(f: FrameChoice | OutlineFrame): string {
  const parts: string[] = [];
  if (f.story) parts.push(`이야기 틀 ${f.story}`);
  if (f.pattern) parts.push(`구성 패턴 ${patternOf(f.pattern)?.name ?? f.pattern}`);
  if (f.example) parts.push(`2025 예시 「${shortTitle(f.example.title || f.example.key)}」`);
  if ("auto" in f && f.auto) parts.push("AI가 다르게");
  return parts.join(" · ");
}

/** 구성안에 남길 기록(고른 것 + 요청 글 — 아무것도 없으면 undefined) */
export function outlineFrameOf(f: FrameChoice, request?: string): OutlineFrame | undefined {
  const r = line(request, FRAME_REQUEST_MAX);
  const out: OutlineFrame = { ...(f.story ? { story: f.story } : {}), ...(f.pattern ? { pattern: f.pattern } : {}), ...(f.example ? { example: f.example } : {}), ...(r ? { request: r } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/**
 * 여러 안 요청 정리: 짜임마다 검증, 빈 짜임·같은 짜임은 한 번만(「AI가 다르게」는 여러 번 — 안마다 다른 순번을 받음), 2~3안.
 * dropped = 걸러 낸 수(화면이 같은 짜임을 두 번 골랐을 때 — 비용이 드는 호출을 줄임)
 */
export function cleanAltChoices(raw: unknown, mg: boolean): { ok: true; alts: FrameChoice[]; dropped: number } | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: "비교할 짜임을 골라 주세요." };
  const alts: FrameChoice[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const x of raw.slice(0, 10)) {
    const c = cleanFrameChoice(x, mg);
    if (!c.ok) return c;
    const k = frameKey(c.frame);
    if (isEmptyFrame(c.frame) || (!c.frame.auto && seen.has(k))) {
      dropped += 1;
      continue;
    }
    seen.add(k);
    alts.push(c.frame);
  }
  if (alts.length < ALT_LIMITS.min) return { ok: false, message: `서로 다른 짜임을 ${ALT_LIMITS.min}개 이상 골라 주세요(같은 짜임은 한 번만 셉니다).` };
  if (alts.length > ALT_LIMITS.max) return { ok: false, message: `여러 안은 ${ALT_LIMITS.max}안까지입니다.` };
  return { ok: true, alts, dropped };
}

/** 「AI가 다르게」 안의 요청 맥락: 몇 번째 안·다른 안 이름·이 안의 순번(다르게 고를 차례 — AI 안이 둘이면 둘째는 2) */
export interface AltContext {
  no: number;
  total: number;
  others: string;
  rank: number;
}

export function altContext(alts: FrameChoice[], k: number): AltContext | null {
  if (!alts[k]?.auto) return null;
  const others = alts
    .filter((_, i) => i !== k)
    .map((a) => (a.auto ? "AI가 정할 다른 안" : frameLabel(a)))
    .join(" / ");
  return { no: k + 1, total: alts.length, others, rank: alts.slice(0, k + 1).filter((a) => a.auto).length };
}

// ---------------------------------------------------------------------------
// 2025 예시 절(공통 지식 report_section 조각 — lib/reports/example-queries.ts가 읽음)

export interface ExampleSection {
  key: string;
  /** 조각 제목(「2025 보고서 1-1 가. …」) */
  title: string;
  /** 어디 절인지(대상사업·실행과제 / 평가내용·대주제 · 쪽) */
  where: string;
  text: string;
  /** 원문 그림 수(글에 없음) */
  images: number;
}

export interface ExampleItem {
  key: string;
  title: string;
  /** BZ-N · MG-N */
  unit: string;
  page: number | null;
  /** 이 카드와 같은 사업·지표 */
  same: boolean;
}

type ChunkRow = { chunk_key: string; title?: string | null; text?: string | null; business?: string | null; report_page_2025?: number | null; meta?: Record<string, unknown> | null };

/** 조각 한 줄 → 예시 절(요청 글 재료) */
export function exampleOf(row: ChunkRow): ExampleSection {
  const m = row.meta ?? {};
  const page = row.report_page_2025 ? ` · 2025 보고서 p.${row.report_page_2025}` : "";
  const where =
    m.eval_no !== undefined
      ? `평가내용 ${m.eval_no}${m.eval_title ? ` ${line(m.eval_title, 40)}` : ""} · 대주제 ${m.theme_no ?? "—"}${m.theme_title ? ` ${line(m.theme_title, 40)}` : ""}`
      : `${m.target_name ? `대상사업 ${m.target_no ?? ""} ${m.target_name} · ` : ""}실행과제 ${m.task_no ?? "—"}${m.task_title ? ` ${line(m.task_title, 40)}` : ""}`;
  return { key: row.chunk_key, title: line(row.title, 200), where: `${where}${page}`, text: String(row.text ?? ""), images: Array.isArray(m.images) ? m.images.length : 0 };
}

/** 고르기 목록(같은 사업·지표 먼저, 그 안은 받은 순서) */
export function exampleItems(rows: ChunkRow[], unit: string): ExampleItem[] {
  const items = rows.map((r) => ({ key: r.chunk_key, title: line(r.title, 200), unit: String(r.business ?? ""), page: r.report_page_2025 ?? null, same: r.business === unit }));
  return [...items.filter((x) => x.same), ...items.filter((x) => !x.same)];
}

// ---------------------------------------------------------------------------
// 요청 글(report-outline*/request.md frame.* · alt.*)

/** 칸 단위 이름 */
const unitOf = (kind: string) => (kind === "compare" || kind === "table" ? "행" : kind === "bullets" || kind === "case" ? "줄" : kind === "chart" ? "막대" : kind === "qa" ? "쌍" : kind === "strategy" ? "열" : "칸");

/** 패턴 블록 한 줄 글: 「[추진배경] 칸 도식(✚)(cards:plus) 3칸 · 단 띠」 */
export function patternBlockText(b: PatternBlock): string {
  const v = b.variant ?? "";
  const place = `${b.layout === "stage" ? " · 단 띠" : b.layout === "full" ? " · 전폭(라벨 칸 없음)" : ""}${b.span === "half" ? " · 가로 반씩" : ""}`;
  const cells = ["band", "banner", "subhead", "define"].includes(b.kind) ? "" : ` ${b.cells}${unitOf(b.kind)}`;
  return `${b.label ? `[${b.label}]` : "(전폭)"} ${shapeName(b.kind, v)}(${shapeCode(b.kind, v)})${cells}${place}`;
}

const CLOSE_NAME: Record<PatternClose, string> = { bullets: "불릿 1~3줄", cards: "수치가 뚜렷한 세 갈래 3칸", chart: "불릿 + 같은 지표의 시점별 막대(값이 모두 근거에 있을 때만)" };

/** 마무리 글(주요사업은 추진성과 모양 resultShape, 경영관리는 절 끝 라벨 「추진성과」 블록 — 닫기 관례가 앞섬) */
export const patternCloseText = (c: PatternClose, mg: boolean) => (mg ? `절 끝 라벨 「추진성과」 블록(${CLOSE_NAME[c]}) — 아래 「닫기 관례」가 앞섬` : `추진성과(resultShape ${c} — ${CLOSE_NAME[c]})`);

/** 주요사업 구성 패턴의 핵심 수치 띠 자리(2026-10-28 — 주요사업은 수치 띠를 쓰지 않음, frameworks.ts BIZ_RETIRED_SHAPES): 블록 대신 수치를 둘 자리를 적음 */
const bizRetiredText = (b: PatternBlock) => `${b.label ? `[${b.label}]` : "(전폭)"} 수치 띠 자리 — 주요사업은 수치 띠를 쓰지 않고 그 수치는 앞 블록의 단계 칸 결과 줄·표 결과 열·추진성과에`;

export function patternPrompt(p: PromptSet, pat: FrameworkPattern, mg: boolean): string {
  return fillFrom(p, "request", "frame.pattern", {
    name: pat.name,
    source: pat.ref,
    when: `${pat.when}${pat.pages ? ` — 표준 분량 ${pat.pages}쪽` : ""}`,
    stages: pat.stages.map((s) => `${s.name}(${s.role})`).join(" → "),
    blocks: pat.blocks.map((b) => (!mg && BIZ_RETIRED_SHAPES.includes(shapeCode(b.kind, b.variant ?? "")) ? bizRetiredText(b) : patternBlockText(b))).join(" → "),
    close: patternCloseText(pat.close, mg),
  });
}

/** 담당자가 고른 짜임의 요청 글 재료 */
export interface FrameInput {
  pattern?: FrameworkPattern | null;
  example?: ExampleSection | null;
  alt?: AltContext | null;
}

/**
 * 고른 짜임 → 요청 글(구성안 요청의 task·틀 고르기 뒤에 붙음). 구성 패턴·예시 절이 있으면 머리(이야기 틀 자동 판단보다 앞섬 — 근거만·근거 없는 칸 금지),
 * 예시 절은 글 전체를 짜임 참고로(자르지 않음 — 2025 절 조각은 가장 긴 것이 약 2.7천 자), 「AI가 다르게」 안이면 다른 안과 겹치지 않게. 아무것도 없으면 빈 글
 */
export function framePrompt(p: PromptSet, f: FrameInput, mg: boolean): string {
  const out: string[] = [];
  if (f.pattern || f.example) out.push(fillFrom(p, "request", "frame.head", { why: mg ? "그 절의 why" : "storyWhy" }));
  if (f.pattern) out.push(patternPrompt(p, f.pattern, mg));
  if (f.example)
    out.push(
      fillFrom(p, "request", "frame.example", {
        title: f.example.title,
        where: f.example.where,
        images: f.example.images ? fillFrom(p, "request", "frame.images", { n: f.example.images }) : "",
        text: f.example.text.trim() || "(글 없음)",
      }),
    );
  if (f.alt) out.push(fillFrom(p, "request", "alt.auto", { no: f.alt.no, total: f.alt.total, others: f.alt.others || "—", rank: f.alt.rank >= 2 ? fillFrom(p, "request", "alt.rank", { k: f.alt.rank }) : "" }));
  return out.join("\n\n");
}

// ---------------------------------------------------------------------------
// 여러 안 결과 정리

/** 짜임 서명(같은 짜임 걸러내기): 주 틀·보조 틀 + 블록마다 모양·라벨 유무·배치·폭(라벨 글은 안 봄 — 같은 모양 순서면 같은 짜임) */
export function altSignature(blocks: Array<{ kind: string; variant: string; label: string; layout?: string; span?: string }>, story = "", subStory = ""): string {
  return [story, subStory, ...blocks.map((b) => `${shapeCode(b.kind, b.variant)}|${b.label ? "L" : ""}|${b.layout ?? ""}|${b.span ?? ""}`)].join("\n");
}

/** 안마다 앞 안과 같은 짜임이면 그 안 순번(0부터), 아니면 null. 실패한 안(null 서명)은 비교하지 않음 */
export function markDuplicateAlts(sigs: Array<string | null>): Array<number | null> {
  return sigs.map((s, i) => {
    if (s === null) return null;
    const j = sigs.indexOf(s);
    return j < i ? j : null;
  });
}

/**
 * 구성안 한 번의 토큰 어림(2026-10-10 측정 — docs/plan/코드-개선-계획.md §5.1·B4): 입력(공통 지식 캐시 쓰기 포함) 주요사업 약 27만·경영관리 약 24만 토큰,
 * 출력 effort high 0.9~2.3만 → 위쪽 2.3만. 여러 안은 동시에 불러 서로의 캐시를 못 읽으므로 안마다 이 값 그대로
 */
export const OUTLINE_TOKENS = { biz: { input: 270_000, output: 23_000 }, mg: { input: 240_000, output: 23_000 } } as const;

/** 구성안 한 번 비용 어림(USD — 모르는 모델이면 null). CLI(구독)는 API 환산 */
export function outlineCostUsd(model: string | null | undefined, mg: boolean): number | null {
  const t = OUTLINE_TOKENS[mg ? "mg" : "biz"];
  return estimateUsd(model, { input: 0, output: t.output, cacheWrite: t.input });
}

/** 비용 안내 글: 「3안 = 구성안 3번 비용(약 $2.7)」 */
export const altCostText = (n: number, perOutline: number | null) => `${n}안 = 구성안 ${n}번 비용${perOutline === null ? "" : `(약 $${(perOutline * n).toFixed(1)})`}`;
