// 구성안 화면 글 다듬기(순수, 2026-09-28 사용자 요구 「AI가 분석한 구성안의 가독성」): AI 구성안의 재료 출처(「카드 do.lines.3」 같은 칸 경로,
// 「[Do] 추진내용 2」처럼 0부터 센 줄 번호)와 이유 글의 영문 도식 코드(voices·hub…)를 사람이 읽는 말로 바꿈.
// 저장된 구성안은 그대로 두고 화면에만 씀 — 서버가 셈(클라이언트 번들에 모양 표를 싣지 않게).

import { pathLabel } from "../cards/path-label.ts";
import { BLOCK_KINDS } from "./blocks.ts";
import type { Composition } from "./composition.ts";
import { shapeName } from "./frameworks.ts";
import { frameLabel } from "./framework-pick.ts";

/** 카드 칸 경로(AI에 준 카드 목록 cardOutline의 경로 모양) + 뒤에 붙은 범위(~2, ･1) */
const CARD_PATH = /(?<![A-Za-z])(?:overview|kpi|strategy|act|plan|do|check|outcome|axAttachments)(?:\.(?:[A-Za-z]+|\d+))+(?:\s*[~･·,]\s*\d+)*/g;
/** 카드 목록의 절 제목으로 시작하는 출처(뒤 숫자는 0부터 센 줄 번호) */
const CARD_HEAD = /^(?:\[(?:Act|Plan|Do|Check)\]|추진성과|과제 개요|계량 성과지표|전략 연계성)/;

/** 0부터 센 번호 목록(「1~2」「0･1」) → 1부터(「2~3」「1·2」) */
const plusOne = (s: string) =>
  s
    .replace(/\d+/g, (d) => String(Number(d) + 1))
    .replace(/\s+/g, "")
    .replace(/[･,]/g, "·");

/** 칸 경로 하나 → 자리 이름(pathLabel — 여백 메모·AI 제안과 같은 이름). 범위가 붙으면 「2~3번째 줄」 */
function pathText(raw: string): string {
  const m = /^([A-Za-z\d.]+)(.*)$/.exec(raw.trim());
  if (!m) return raw;
  const label = pathLabel(m[1]);
  const tail = m[2].trim();
  if (!tail || label === m[1]) return label;
  const last = /(\d+)(번째 (?:줄|칸))$/.exec(label);
  return last ? label.slice(0, last.index) + last[1] + plusOne(tail) + last[2] : label;
}

/** 「[Do] 추진내용 2」「추진성과 — 정량 1」「과제 개요 4･5」 → 「[Do] 추진내용 · 3번째 줄」 … (카드 절 제목이 아니면 null) */
function headText(part: string): string | null {
  if (!CARD_HEAD.test(part)) return null;
  const m = /^(.*\S)\s+(\d+(?:\s*[~･·,]\s*\d+)*)$/.exec(part);
  const head = (m ? m[1] : part).replace(/\s+—\s+/g, " · ");
  if (!m) return head;
  const unit = head.startsWith("과제 개요") ? "번째 칸" : head.startsWith("계량") ? "행" : "번째 줄";
  return `${head} · ${plusOne(m[2])}${unit}`;
}

/**
 * 재료 출처 → 읽는 이름. 카드 칸이면 「카드 · 」를 앞에(모든 조각이 카드면 한 번만), 첨부·전년 절·평가 근거 이름은 그대로.
 * 예: 「카드 do.lines.1~2」 → 「카드 · [Do] 2~3번째 줄」, 「추진성과 — 정량 1」 → 「카드 · 추진성과 · 정량 · 2번째 줄」
 */
export function sourceLabel(src: string): string {
  const s = String(src ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const parts = s.split(/\s+\/\s+/).map((p) => {
    let q = p.trim();
    const lead = /^카드(?:\s|$)/.test(q);
    q = q.replace(/^카드\s*/, "");
    const paths = q.match(CARD_PATH);
    if (paths) return { card: true, text: paths.map(pathText).join(" · ") };
    const h = headText(q);
    if (h) return { card: true, text: h };
    return { card: lead, text: q };
  });
  const shown = parts.filter((p) => p.text);
  if (!shown.length) return parts.some((p) => p.card) ? "카드" : "";
  if (shown.every((p) => p.card)) return `카드 · ${shown.map((p) => p.text).join(" / ")}`;
  return shown.map((p) => (p.card ? `카드 · ${p.text}` : p.text)).join(" / ");
}

/** 도식 종류 코드 → 쉬운 이름(모양 이름의 괄호 표지는 뺌 — 「칸 도식(✚)」 → 「칸 도식」) */
const KIND_NAME: Record<string, string> = Object.fromEntries(BLOCK_KINDS.map((k) => [k, shapeName(k, "").replace(/\s*\(.*\)$/, "")]));
const KINDS = BLOCK_KINDS.join("|");
/** 「협업 구조(hub)」의 괄호 코드, 또는 맨 코드 + 뒤 조사(뒤가 한글이 아닐 때만 — 「stats이다」의 「이」는 조사로 보지 않음) */
const KIND_WORD = new RegExp(`\\s*\\((?:${KINDS})\\)|(?<![A-Za-z])(${KINDS})(?![A-Za-z])(?:(으로|로|은|는|이|가|을|를|과|와)(?![가-힣]))?`, "g");

/** 받침에 맞춘 조사(영문 코드를 한글 이름으로 바꾸면 조사도 바뀜 — 「cards는」 → 「칸 도식은」) */
function josa(word: string, p: string): string {
  const c = word.charCodeAt(word.length - 1);
  const jong = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0;
  const has = jong !== 0;
  if (p === "은" || p === "는") return has ? "은" : "는";
  if (p === "이" || p === "가") return has ? "이" : "가";
  if (p === "을" || p === "를") return has ? "을" : "를";
  if (p === "과" || p === "와") return has ? "과" : "와";
  if (p === "으로" || p === "로") return has && jong !== 8 ? "으로" : "로";
  return p;
}

/** AI 글 속 영문 도식 코드 → 쉬운 이름(「voices는 빼고」 → 「현장 목소리는 빼고」, 「협업 구조(hub)와」 → 「협업 구조와」) */
export function plainShapes(text: string): string {
  return String(text ?? "").replace(KIND_WORD, (all, kind: string | undefined, p: string | undefined) => {
    if (!kind) return "";
    const name = KIND_NAME[kind] ?? kind;
    return p ? name + josa(name, p) : name;
  });
}

/** 「머리: 글」 → [머리, 글] (머리가 짧을 때만 — 평가 논점 「편람 ② 추진 활동의 적정성: …」, 차선 「⑤ 원스톱 통합형: …」) */
function headed(s: string, max: number): { tag: string; text: string } {
  const m = /^([^:：]{2,40}?)\s*[:：]\s*(.+)$/.exec(s.trim());
  return m && m[1].length <= max ? { tag: m[1].trim(), text: m[2].trim() } : { tag: "", text: s.trim() };
}

/** 구성안 화면에 보일 글(저장된 구성안에서 셈) */
export interface OutlineText {
  /** 평가 논점(머리 = 편람 항목 등) */
  points: Array<{ tag: string; text: string }>;
  storyWhy: string;
  /** 차선 틀(name = 틀 이름) */
  alternative: { name: string; why: string } | null;
  results: string;
  /** 재료 번호 → 읽는 출처 */
  sources: Record<string, string>;
  /** 만들 때 고른 짜임(「이야기 틀 X · 구성 패턴 Y · 2025 예시 「…」」 — 없으면 빈 글, 2026-10-12) */
  frame: string;
  /** 만들 때 요청 글(고른 짜임과 함께 보낸 것) */
  frameRequest: string;
  /** 경영관리: 절 열쇠 → 절 다시 짜기에서 고른 짜임(없는 절은 뺌) */
  partFrames: Record<string, string>;
}

export function outlineText(c: Composition): OutlineText {
  const alt = c.alternative ? headed(plainShapes(c.alternative), 24) : null;
  return {
    points: c.points.map((p) => headed(plainShapes(p), 28)),
    storyWhy: plainShapes(c.storyWhy ?? ""),
    alternative: alt ? { name: alt.tag, why: alt.text } : null,
    results: plainShapes(c.results ?? ""),
    sources: Object.fromEntries(c.materials.map((m) => [m.id, sourceLabel(m.source)])),
    frame: c.frame ? frameLabel(c.frame) : "",
    frameRequest: c.frame?.request ?? "",
    partFrames: Object.fromEntries((c.mg?.parts ?? []).flatMap((p) => (p.frame ? [[p.key, [frameLabel(p.frame), p.frame.request ? `요청 「${p.frame.request}」` : ""].filter(Boolean).join(" · ")]] : []))),
  };
}
