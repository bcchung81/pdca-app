// 앱이 부르는 모델 등급(참고자료 설계 §5, 1-M). 등급은 둘이고 기능마다 어느 등급인지 이 파일의 표(FEATURE_TIER) 한 곳에서 정한다.
// 2026-09-30 사용자 결정: light = Sonnet 5.5 · effort low, heavy = Sonnet 5.5 · effort xhigh(heavy 기본 모델도 Sonnet 5.5로 바뀜 — 예전 기본은 Opus 5.5).
// 모델 id·effort는 환경변수로만 바꾼다(코드에 흩지 않음). 순수 함수(server-only 없음)라 시험할 수 있음.

/** 등급 — heavy: 판단·창작(결과가 곧 평가 논리·문장 품질·판정) · light: 정답이 원문에 있고 코드가 검증할 수 있는 일(분류·추출·옮기기) */
export type Tier = "heavy" | "light";
/** Claude API·CLI가 받는 생각 수준(effort) */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** AI를 부르는 기능 — `ai_requests.feature`에 남는 값과 같다 */
export type AiFeature = "card_assist" | "card_chat" | "card_comment" | "inspection" | "report_outline" | "report_section" | "report_fix" | "report_block" | "report_unit_mg" | "prep_match" | "material_describe";

/**
 * 기능 → 등급 표. 1-M에서는 지금 동작을 그대로 두려고 과제 매칭·첨부 그림 설명만 light이고 나머지는 heavy.
 * 설계 §5.2의 light 후보(경평 블록 고치기·질문, 작성지원 실적 반영·질문, 리뷰어 코멘트)는 품질 비교(§11) 뒤에 이 표의 한 줄만 바꿔 옮긴다.
 * 한 작업에는 한 모델: 초안 한 벌(구성안 → 집필 → 판면 고치기)과 대화 한 줄기는 같은 등급이어야 캐시·문체가 이어진다.
 */
export const FEATURE_TIER: Record<AiFeature, Tier> = {
  card_assist: "heavy",
  card_chat: "heavy",
  card_comment: "heavy",
  inspection: "heavy",
  report_outline: "heavy",
  report_section: "heavy",
  report_fix: "heavy", // 경평 집필 자동 고치기 호출(2026-10-10 — effort·상한은 집필과 같고 키만 따로, 기록은 집필 한 행 report_section에 합쳐 남김)
  report_block: "heavy",
  report_unit_mg: "heavy", // 경영관리 지표 단위 부분(카드 밖 표)의 문장 칸 채우기(R5c, 2026-10-16 — 지표당 1회)
  prep_match: "light",
  material_describe: "light", // 첨부 그림 설명(4단계) — 보이는 것을 글로 옮기기, API 전용
};

/** 기능의 등급. 표에 없는 값(옛 기록의 기능 이름 등)은 heavy로 본다 */
export function tierOf(feature: string): Tier {
  return (FEATURE_TIER as Record<string, Tier>)[feature] ?? "heavy";
}

/**
 * 기능별 기본 effort(2026-10-07) — 표에 없는 기능은 등급 기본값(heavy xhigh·light low). 모델은 등급 그대로이고 effort만 갈린다.
 * 같은 기능은 한 값이라(작성지원 요청 종류들, 경평 집필→판면 고치기) 같은 기능끼리의 캐시 공유는 그대로(기능이 다르면 시스템 글·스키마가 달라 원래 안 이어짐).
 * 근거 수준(1-가 카드 CLI 실측, xhigh→high 출력 토큰): 작성지원 개선 제안 −56%·블라인드 심사 3카드 변동 범위 안(인용 폭은 좁아짐, 보완 점검 등 다른 요청 종류는 미측정) ·
 * 질문 −41%(품질 미심사) · 코멘트·블록 고치기는 측정 없이 범위가 좁고(코드가 숫자·칸을 검증, 수정 이력으로 되돌림) 같은 종류의 일이라 따라 낮춤.
 * 경평 구성안·집필·고치기도 high(2026-10-10 B4 사용자 결정 — 같은 9장 평가 라운드 Z: 판면·근거·편람 논점·도식 다양성이 xhigh(T)와 같거나 낫고 문장 문제 1/9 → 3/9,
 * 구성안 226~535 → 69~175초·1차 집필 148~325 → 34~63초, docs/plan/코드-개선-계획.md 「B4 실험 결과」). 두 트랙이 같은 기능 키라 경영관리 경평도 high.
 * xhigh 유지: 월간 점검(공식 점검표 판정 — B4에서 판정 98/100 일치였지만 ★핵심 항목 1건이 달라 유지).
 * 운영자가 CLAUDE_EFFORT_HEAVY·CLAUDE_EFFORT_LIGHT를 명시하면 이 표보다 앞서므로 한 줄로 전체를 되돌릴 수 있음.
 */
export const FEATURE_EFFORT: Partial<Record<AiFeature, Effort>> = {
  card_assist: "high",
  card_chat: "high",
  card_comment: "high",
  report_block: "high",
  report_outline: "high",
  report_section: "high",
  // 자동 고치기는 집필과 같은 effort(고치기만 낮춘 B2c — 라운드 V — 는 문장 문제 1/9 → 5/9라 미채택. B4는 구성안·집필·고치기를 함께 낮춤)
  report_fix: "high",
  // 경영관리 지표 단위 부분 문장 칸(R5c — 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.7: 경평 기능과 같이 high)
  report_unit_mg: "high",
};

type Env = Record<string, string | undefined>;

/**
 * 기본 모델(API) — 두 등급 모두 Sonnet 5.5. 입력 $2·출력 $10 /100만 토큰(캐시 읽기 $0.20), 입력 한도 100만.
 * 설계 문서 §5의 claude-sonnet-5와 단가가 같고(2026-09-29 claude-api 모델 표로 확인), CLI `sonnet` 별칭이 부르는 모델과 같아 API·CLI가 같은 모델을 씀.
 * 단가표(lib/ai/pricing.ts)는 접두 일치(claude-sonnet-5)로 이 id도 같은 단가를 붙임
 */
export const HEAVY_MODEL_DEFAULT = "claude-sonnet-5-5";
export const LIGHT_MODEL_DEFAULT = "claude-sonnet-5-5";
/** 기본 CLI 별칭(로컬 개발). `sonnet`은 CLI에서 claude-sonnet-5-5로 불림(참고자료 설계 §13 V24 — 단가 같음 확인) */
export const HEAVY_CLI_MODEL_DEFAULT = "sonnet";
export const LIGHT_CLI_MODEL_DEFAULT = "sonnet";
/** 기본 effort — heavy는 xhigh(사용자 결정 2026-09-30), light는 low */
export const HEAVY_EFFORT_DEFAULT: Effort = "xhigh";
export const LIGHT_EFFORT_DEFAULT: Effort = "low";

const isEffort = (v: string | undefined): v is Effort => EFFORTS.includes(v as Effort);

/** 등급 하나의 모델(API)·CLI 별칭·effort */
export interface TierSpec {
  model: string;
  cliModel: string;
  effort: Effort;
}

/**
 * 등급 → 모델·effort. 환경변수(비우면 기본값):
 *  heavy: CLAUDE_MODEL_HEAVY(옛 이름 CLAUDE_MODEL_WRITER) · CLAUDE_CLI_MODEL_HEAVY(옛 이름 CLAUDE_CLI_MODEL) · CLAUDE_EFFORT_HEAVY(옛 이름 CLAUDE_CLI_EFFORT — CLI 경로에서만)
 *  light: CLAUDE_MODEL_LIGHT · CLAUDE_CLI_MODEL_LIGHT · CLAUDE_EFFORT_LIGHT
 * effort 값이 허용값(low·medium·high·xhigh·max)이 아니면 기본값을 씀(틀린 글자 하나로 호출이 실패하지 않게)
 */
export function tierSpec(tier: Tier, path: "api" | "cli" = "api", env: Env = process.env): TierSpec {
  if (tier === "light") {
    return {
      model: env.CLAUDE_MODEL_LIGHT || LIGHT_MODEL_DEFAULT,
      cliModel: env.CLAUDE_CLI_MODEL_LIGHT || LIGHT_CLI_MODEL_DEFAULT,
      effort: envEffort(tier, path, env) ?? LIGHT_EFFORT_DEFAULT,
    };
  }
  return {
    model: env.CLAUDE_MODEL_HEAVY || env.CLAUDE_MODEL_WRITER || HEAVY_MODEL_DEFAULT,
    cliModel: env.CLAUDE_CLI_MODEL_HEAVY || env.CLAUDE_CLI_MODEL || HEAVY_CLI_MODEL_DEFAULT,
    effort: envEffort(tier, path, env) ?? HEAVY_EFFORT_DEFAULT,
  };
}

/** 운영자가 환경변수로 명시한 등급 effort(허용값일 때만) — 없으면 undefined */
function envEffort(tier: Tier, path: "api" | "cli", env: Env): Effort | undefined {
  return (tier === "light" ? [env.CLAUDE_EFFORT_LIGHT] : [env.CLAUDE_EFFORT_HEAVY, path === "cli" ? env.CLAUDE_CLI_EFFORT : undefined]).find(isEffort);
}

/**
 * 기능별 API 출력 상한(max_tokens — 생각 토큰까지 포함한 한도, API 경로만·스트리밍). 2026-10-09: effort를 올린(xhigh·high) 뒤 로컬 CLI 실측 출력이
 * 작성지원 2.1~2.4만·경평 집필 4.0만·월간 점검 5.7~5.9만·경평 구성안 7.0만 토큰인데 예전 상한은 1.6만(점검 3.2만)이라, Vercel(늘 API)에서는
 * 「답이 너무 길어 끊겼습니다」로 실패할 수 있었음. 상한은 쓴 만큼만 과금되므로 넉넉히(Sonnet 5.5 출력 한도 12.8만)
 */
export const FEATURE_MAX_TOKENS: Record<AiFeature, number> = {
  card_assist: 64_000,
  card_chat: 64_000,
  card_comment: 64_000,
  inspection: 128_000,
  report_outline: 128_000,
  report_section: 128_000,
  report_fix: 128_000,
  report_block: 64_000,
  report_unit_mg: 64_000,
  prep_match: 8_000,
  material_describe: 16_000,
};

/** 기능이 쓸 모델·effort — effort는 환경변수 명시값 > 기능별 표(FEATURE_EFFORT) > 등급 기본값 순 */
export function specForFeature(feature: string, path: "api" | "cli" = "api", env: Env = process.env): TierSpec {
  const tier = tierOf(feature);
  const spec = tierSpec(tier, path, env);
  const own = (FEATURE_EFFORT as Record<string, Effort | undefined>)[feature];
  return own && !envEffort(tier, path, env) ? { ...spec, effort: own } : spec;
}

// 1단계(3-3)에서 만든 light 전용 접근자 — 호환용
export function lightModel(env: Env = process.env): string {
  return tierSpec("light", "api", env).model;
}

export function lightCliModel(env: Env = process.env): string {
  return tierSpec("light", "cli", env).cliModel;
}
