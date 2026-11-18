// 경평 초안 「판 기록」(2026-11-18 사용자 결정 3~6 — .team/VER.md): 과제·연도 초안 행(card_report_drafts)이 저장될 때마다 DB 트리거가
// 저장 직전 판(초안 + 구성안)을 card_report_draft_versions에 남기고(supabase/migrations/20261118120000_report_draft_versions.sql),
// 화면은 판 목록을 보고 고른 판으로 되돌림(app/(app)/reports/cards/version-actions.ts). 이 파일은 입출력 없는 순수 부분(목록 정리·되돌리기 판정·쓸 행)만.
// 판 spec 읽기 검사(draft-recount.ts)를 쓰므로 클라이언트 부품은 이 모듈을 읽지 않고 타입만 씀(목록 글은 서버가 만들어 넘김)

import { readDraftSpec } from "./draft-recount.ts";

/**
 * 저장 종류 머리글: 앱이 그 저장에만 실어 보냄 → 트리거가 current_setting('request.headers')로 읽음(PostgREST는 머리글 이름을 소문자로 담음).
 * text = 직접 고침 자동 저장(같은 사람 10분 안 묶음), restore = 판 되돌리기(목록에 「되돌리기」로 표시). 없으면 그 밖의 저장(늘 새 판)
 */
export const DRAFT_SAVE_HEADER = "x-draft-save";
export type DraftSaveKind = "text" | "restore";

/** 과제·연도마다 남기는 판 수(결정 4) — 마이그레이션 트리거의 limit 값과 같음(시험이 대조) */
export const DRAFT_VERSION_KEEP = 30;
/** 직접 고침 묶음 시간(분, 결정 3) — 묶음의 마지막 저장부터 셈(2026-11-18 사용자 결정). 마이그레이션 트리거의 interval과 같음(시험이 대조) */
export const DRAFT_TEXT_MERGE_MINUTES = 10;

/** 판이 무엇이 바뀌어 덮였나(트리거가 셈) */
export type DraftVersionChanged = "draft" | "outline" | "both";
export const CHANGED_LABEL: Record<DraftVersionChanged, string> = { draft: "초안", outline: "구성안", both: "초안·구성안" };

/** 판 목록 조회 열(본문 spec·outline은 빼고 가볍게 — 블록 수는 표의 생성 열) */
export const VERSION_LIST_COLS = "id, state_at, replaced_by, replaced_at, changed, save_kind, block_count, warnings, unknown_numbers, outline_status";

/** 판 목록 한 행(DB) */
export interface DraftVersionListRow {
  id: number;
  state_at: string;
  replaced_by: string | null;
  replaced_at: string;
  changed: string;
  save_kind: string | null;
  block_count: number | null;
  warnings: unknown;
  unknown_numbers: string[] | null;
  outline_status: string | null;
}

/** 판 목록 한 줄(화면 — 글은 서버가 만듦) */
export interface DraftVersionItem {
  id: number;
  /** 그 판이 저장된 때(= 덮이기 전 행의 updated_at) */
  stateAt: string;
  /** 덮은 사람 이름(못 읽으면 「다른 사용자」, 사람 없는 작업이면 「관리 작업」) */
  who: string;
  replacedAt: string;
  changed: DraftVersionChanged;
  /** 「초안」·「구성안」·「초안·구성안」 */
  changedLabel: string;
  /** 덮은 저장이 직접 고침·되돌리기였나(그 밖은 null) */
  saveKind: DraftSaveKind | null;
  /** 판 내용 요약(「블록 7 · 경고 2 · 구성안 승인」) */
  summary: string;
}

const asChanged = (v: string): DraftVersionChanged => (v === "outline" || v === "both" ? v : "draft");
const asKind = (v: string | null): DraftSaveKind | null => (v === "text" || v === "restore" ? v : null);

/** 판 내용 요약 */
export function versionSummary(v: { blocks: number | null; warnings: number; unknown: number; outline: string | null }): string {
  return [
    v.blocks === null ? "초안 없음" : `블록 ${v.blocks}`,
    v.warnings ? `경고 ${v.warnings}` : "",
    v.unknown ? `없는 숫자 ${v.unknown}` : "",
    v.outline === "approved" ? "구성안 승인" : v.outline === "draft" ? "구성안 확인 전" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** DB 행 → 화면 줄. nameOf = 읽을 수 있는 프로필 이름(부서 담당자는 자기 것만 — RLS profiles_read) */
export function versionItems(rows: DraftVersionListRow[], nameOf: Map<string, string>, meId: string): DraftVersionItem[] {
  return rows.map((r) => {
    const changed = asChanged(String(r.changed));
    return {
      id: Number(r.id),
      stateAt: String(r.state_at),
      who: r.replaced_by === null ? "관리 작업" : (nameOf.get(r.replaced_by) ?? (r.replaced_by === meId ? "나" : "다른 사용자")),
      replacedAt: String(r.replaced_at),
      changed,
      changedLabel: CHANGED_LABEL[changed],
      saveKind: asKind(r.save_kind),
      summary: versionSummary({
        blocks: typeof r.block_count === "number" ? r.block_count : null,
        warnings: Array.isArray(r.warnings) ? r.warnings.length : 0,
        unknown: Array.isArray(r.unknown_numbers) ? r.unknown_numbers.length : 0,
        outline: r.outline_status,
      }),
    };
  });
}

/** 되돌리기를 막는 까닭(없으면 null) — 화면은 단추 대신 이 글을 보이고, 서버도 같은 판정으로 거절 */
export function restoreBlockReason(s: { preview: boolean; active: boolean; locked: boolean; canWrite: boolean }): string | null {
  if (s.preview) return "부서 화면 보기(읽기 전용)라 되돌리기 단추가 없습니다.";
  if (!s.active) return "보관한 과제는 되돌리지 않습니다.";
  if (s.locked) return "제출·승인된 보고서의 과제라 되돌릴 수 없습니다 — 보고서를 먼저 되돌려 보내 주세요.";
  if (!s.canWrite) return "이 과제의 초안을 고칠 권한이 없어 되돌리기 단추가 없습니다.";
  return null;
}

/** 되돌릴 때 초안 행에 쓰는 칸(판 내용 전부 — 식별 칸·시각·덮은 사람은 빼고) */
export const RESTORE_COLS = ["spec", "warnings", "unknown_numbers", "model", "source_rev", "outline", "outline_status", "outline_warnings", "outline_model", "outline_at", "outline_approved_by", "outline_approved_at"] as const;

/** 판 읽기 열(RESTORE_COLS와 같음 — 글자 그대로 둬야 조회 결과 타입이 잡힘, 시험이 대조) */
export const RESTORE_SELECT = "spec, warnings, unknown_numbers, model, source_rev, outline, outline_status, outline_warnings, outline_model, outline_at, outline_approved_by, outline_approved_at";

/** 판 한 행(DB — RESTORE_COLS) */
export type DraftVersionRow = Partial<Record<(typeof RESTORE_COLS)[number], unknown>>;

/**
 * 판 → 초안 행에 쓸 값. 판 spec은 지금 읽기 검사(readSection·specIssue — lib/reports/draft-recount.ts readDraftSpec)를 지나야 함:
 * 판이 맞지 않거나 모양이 깨졌으면 까닭(글)을 돌려줌. spec이 없는 판(구성안만 있던 때)은 그대로 씀
 */
export function restoreRow(v: DraftVersionRow): { ok: true; row: Record<string, unknown> } | { ok: false; message: string } {
  const has = (x: unknown) => x !== null && x !== undefined;
  if (!has(v.spec) && !has(v.outline)) return { ok: false, message: "이 판에는 초안도 구성안도 없습니다." };
  if (has(v.spec)) {
    const { spec, issue } = readDraftSpec(v.spec);
    if (!spec) return { ok: false, message: `이 판의 초안을 지금 앱이 읽지 못해 되돌리지 않습니다(${issue ?? "초안 판이 맞지 않음"}).` };
  }
  const row: Record<string, unknown> = {};
  for (const k of RESTORE_COLS) row[k] = has(v[k]) ? v[k] : null;
  // 기본값이 있는 칸(not null)은 null 대신 빈 값으로(판 표도 not null이라 정상 판에서는 일어나지 않음)
  if (row.warnings === null) row.warnings = [];
  if (row.unknown_numbers === null) row.unknown_numbers = [];
  if (row.outline_warnings === null) row.outline_warnings = [];
  return { ok: true, row };
}
