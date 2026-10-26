// 첨부(카드 전용 자료·보고서 추가자료)의 읽은 글 저장본 — 순수 함수. 읽기·내려받기·저장은 lib/ai/attachments.ts.
// 참고자료 설계 1단계(docs/reference-materials.md §4.1): 올릴 때 kordoc으로 한 번 읽어 전체 글을 저장하고, AI 요청 때는 저장본만 씀(자르지 않음).
// 저장본이 없거나(1단계 전에 올린 자료) 파서 판이 다르면 요청 때 다시 읽어 채움.

import { DESCRIBE_VERSION } from "./describe.ts";
import type { KnowledgeRef } from "./writer.ts";

/** 파서 판 — kordoc 판이나 첨부 글 만드는 법(그림 설명 판 포함)이 바뀌면 올림(저장본과 다르면 요청 때 다시 읽음). 테스트가 설치된 kordoc 판과 대조 */
export const PARSER_VERSION = `kordoc-4.15.3/att-2+${DESCRIBE_VERSION}`;

export type ParseStatus = "pending" | "parsed" | "failed";

/** card_materials·report_materials 공통 칸(읽은 글 저장본 포함) */
export interface MaterialRow {
  id: string;
  file_name: string;
  storage_path: string;
  bytes: number | null;
  parsed_text: string | null;
  parse_status: ParseStatus;
  parser_version: string | null;
  parse_error: string | null;
}

export const MATERIAL_COLS = "id, file_name, storage_path, bytes, parsed_text, parse_status, parser_version, parse_error";

/** 첨부를 읽지 못함(연기 시험 스크립트 등에서 던짐 — 순수 파일에 둬서 run.ts와 attachments.ts가 서로 불러오지 않게) */
export class AttachmentError extends Error {}

/** 그림 설명을 만들 때 쓴 모델·토큰(ai_requests에 남김) */
export interface DescribeInfo {
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number };
  /** 설명 호출에 걸린 ms(ai_requests.duration_ms에 남김) */
  ms?: number;
}

/**
 * 파일 하나를 읽은 결과. 실패도 결과(요청을 막지 않고 「AI가 못 읽음」으로 빠짐).
 * pending = 지금은 읽을 수 없고 나중에 읽음(그림 설명은 API 경로에서만 만들 수 있어 CLI로 돌 때) — 저장본은 「아직 안 읽음」이라 요청 때 다시 읽어 봄
 */
export interface ParseOutcome {
  status: "parsed" | "failed" | "pending";
  /** 읽은 전체 글(kordoc 글, 또는 그림 설명 — 머리에 「[그림 설명」 표지). 실패·보류면 "" */
  text: string;
  /** 사용자에게 보일 실패·보류 사유 */
  error: string | null;
  sha256: string;
  /** 그림 설명을 만들었으면 그 호출 기록(성공·실패 모두 토큰이 나갔으면) */
  describe?: DescribeInfo;
}

/** AI에 넣는 첨부 하나(전체 글) */
export interface MaterialDoc {
  id: string;
  kind: "card" | "report";
  name: string;
  text: string;
}

/** 저장본 상태: ready = 같은 판의 읽은 글, failed = 같은 판에서 읽기 실패(다시 안 읽음), stale = 아직 안 읽었거나 판이 다름 */
export function materialState(row: MaterialRow): "ready" | "failed" | "stale" {
  if (row.parser_version !== PARSER_VERSION) return "stale";
  if (row.parse_status === "parsed") return row.parsed_text != null ? "ready" : "stale";
  if (row.parse_status === "failed") return "failed";
  return "stale";
}

/** 읽은 결과 → DB에 넣을 칸 */
export function parseColumns(o: ParseOutcome, now: Date = new Date()) {
  const ok = o.status === "parsed";
  return {
    sha256: o.sha256,
    parsed_text: ok ? o.text : null,
    parse_status: o.status, // parsed·failed·pending(보류는 요청 때 다시 읽음)
    parser_version: PARSER_VERSION,
    parsed_at: now.toISOString(),
    parse_error: ok ? null : o.error,
    parsed_chars: ok ? o.text.length : null,
  };
}

/** 첨부 → 인용 대조용 근거(열쇠 file:N — 프롬프트의 <source key="file:N"> 봉투와 같음). 글은 자르지 않음 */
export function fileRefs(docs: MaterialDoc[]): KnowledgeRef[] {
  return docs.map((d, i) => ({ key: `file:${i + 1}`, title: d.name, unitType: d.kind === "card" ? "card_material" : "report_material", text: d.text }));
}
