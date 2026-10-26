// 경평 초안 글 직접 고치기(순수, 2026-09-28 사용자 요구 「과제원장처럼 두 번 눌러 고치기」): 미리보기의 고치기 표지(section-html editMarks —
// data-t = 초안 JSON 경로, data-j = 배열을 이어 그린 이음 기호)가 가리키는 글을 새 글로 바꾼 초안을 만듦.
// 허용 경로만 받음(블록 안 글·소항목 제목·추진성과, 추진실적 열 표의 큰 수치 — 2026-10-12) — 블록 종류·모양·막대 값·그림은 여기서 못 바꿈(구성안 편집·AI 수정 요청이 맡음).

import type { Block } from "./blocks.ts";
import type { ReportSectionSpec } from "./section.ts";

/** 고칠 수 있는 경로 */
const BLOCK_PATH = /^blocks\.(\d{1,2})\.(title|text|items\.\d{1,2}|cells\.\d{1,2}\.(?:head|tag|note|bullets(?:\.\d{1,2})?)|rows\.\d{1,2}\.(?:key|before(?:\.\d{1,2})?|after(?:\.\d{1,2})?)|series\.\d\.(?:label|value))$/;
const OTHER_PATH = /^(sub\.title|results\.\d{1,2}|resultCards\.\d{1,2}\.(?:headline|figure)|resultBand)$/;

/** 이음 배열로 고칠 수 있는 이음 기호(렌더러가 쓰는 것만) */
const JOINS = new Set([" / "]);

export interface DraftTextEdit {
  path: string;
  text: string;
  /** 배열을 이어 그린 칸이면 이음 기호 */
  join?: string;
}

export type DraftTextResult =
  | { ok: true; spec: ReportSectionSpec; changed: boolean; blockIndex: number | null; before: string; after: string }
  | { ok: false; message: string };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** 경로 → [부모 객체, 마지막 열쇠] (없는 경로면 null) */
function locate(root: Record<string, unknown>, path: string): [Record<string, unknown> | unknown[], string] | null {
  const keys = path.split(".");
  let cur: unknown = root;
  for (const k of keys.slice(0, -1)) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  if (cur === null || typeof cur !== "object") return null;
  const last = keys.at(-1)!;
  if (!(last in (cur as object))) return null;
  return [cur as Record<string, unknown>, last];
}

/**
 * 고친 글 적용: 경로가 허용 목록에 있고 지금 값이 글(이음이면 글 배열)일 때만. text는 부르는 쪽이 정리(cleanLine)해서 넘김.
 * 이음 배열은 이음 기호로 나눠(빈 조각 버림, 적어도 하나) 넣음. 블록 경로면 blockIndex(수정 이력·사람이 고친 블록 표시)
 */
export function applyDraftText(spec: ReportSectionSpec, edit: DraftTextEdit): DraftTextResult {
  const path = String(edit?.path ?? "");
  const m = BLOCK_PATH.exec(path);
  if (!m && !OTHER_PATH.test(path)) return { ok: false, message: "여기서는 고칠 수 없는 글입니다." };
  if (edit.join !== undefined && !JOINS.has(edit.join)) return { ok: false, message: "고칠 수 없는 칸입니다." };
  if (m && (spec.version !== 3 || !spec.blocks?.[Number(m[1])])) return { ok: false, message: "고칠 블록이 없습니다(블록 목록 초안만 고칠 수 있음)." };
  // series는 추진실적 열 표(table:result)의 큰 수치·뜻만 — 막대(chart) 값은 여기서 못 바꿈
  if (m && m[2].startsWith("series.") && !(spec.blocks?.[Number(m[1])]?.kind === "table" && spec.blocks?.[Number(m[1])]?.variant === "result")) return { ok: false, message: "여기서는 고칠 수 없는 글입니다." };
  const next = clone(spec) as unknown as Record<string, unknown>;
  const at = locate(next, path);
  if (!at) return { ok: false, message: "고칠 글을 찾지 못했습니다 — 화면을 새로 고쳐 주세요." };
  const [parent, key] = at;
  const cur = (parent as Record<string, unknown>)[key];
  const text = String(edit.text ?? "");
  let before: string;
  let value: string | string[];
  if (edit.join) {
    if (!Array.isArray(cur) || !cur.every((x) => typeof x === "string")) return { ok: false, message: "고칠 글을 찾지 못했습니다 — 화면을 새로 고쳐 주세요." };
    before = cur.join(edit.join);
    // 「 / 」(앞뒤 빈칸이 있는 빗금)로만 나눔 — 「24/7」 같은 글 속 빗금은 그대로
    const parts = text
      .split(/\s+\/\s+/)
      .map((x) => x.trim())
      .filter(Boolean);
    value = parts.length ? parts : [""];
  } else {
    if (typeof cur !== "string") return { ok: false, message: "고칠 글을 찾지 못했습니다 — 화면을 새로 고쳐 주세요." };
    before = cur;
    value = text.trim();
  }
  const after = Array.isArray(value) ? value.join(edit.join) : value;
  if (after === before) return { ok: true, spec, changed: false, blockIndex: m ? Number(m[1]) : null, before, after };
  (parent as Record<string, unknown>)[key] = value;
  return { ok: true, spec: next as unknown as ReportSectionSpec, changed: true, blockIndex: m ? Number(m[1]) : null, before, after };
}

/** 블록 하나(수정 이력 전후) */
export const blockAt = (spec: ReportSectionSpec, i: number | null): Block | null => (i === null ? null : (spec.blocks?.[i] ?? null));
