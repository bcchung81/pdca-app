// 담당자 등록(엑셀 붙여넣기)의 공용 타입. 화면과 서버 액션이 함께 씁니다(입출력 없음).

import type { AppRole } from "../auth/access.ts";

export interface TeamRef {
  id: number;
  name: string;
  hq: string | null;
}

/** 붙여넣기 화면의 팀 선택지: 카드가 연결된 활성 팀과 그 팀의 활성 과제 수 */
export interface TeamOption extends TeamRef {
  cards: number;
}

/** 붙여넣은 표의 한 줄 */
export interface PasteRow {
  /** 붙여넣은 표에서 몇 번째 데이터 줄인가(1부터, 머리글 제외) */
  line: number;
  name: string;
  email: string;
  /** 엑셀에 적혀 있던 팀 표기 그대로 */
  teamText: string;
}

export interface Suggestion {
  teamId: number;
  /** 0~1 */
  score: number;
  reason: string;
}

/**
 * 붙여넣은 팀 표기와 DB 팀의 비교 결과.
 *  exact   — 이름이 정확히 같아 자동 확정(오판 여지 없음: 팀명은 고유)
 *  suggest — 비슷한 후보. 사람이 고르거나 확인해야 반영
 *  none    — 후보 없음. 드롭다운에서 직접 선택
 */
export type TeamMatch = { kind: "exact"; teamId: number; reason: string; warn?: string } | { kind: "suggest"; candidates: Suggestion[] } | { kind: "none" };

/** 이미 있는 계정의 요약(화면에서 상태를 다시 셀 때 씀) */
export interface ExistingSnapshot {
  role: AppRole;
  active: boolean;
  teamId: number | null;
  displayName: string;
}

/** 이메일(소문자) → 이미 있는 계정(없으면 null). 조회한 주소만 들어 있음 */
export type ExistingLookup = Record<string, ExistingSnapshot | null>;

export type LookupResponse = { ok: true; existing: ExistingLookup } | { ok: false; message: string };

/** 반영을 요청하는 한 줄 — 서버는 이 값을 처음부터 다시 검증합니다 */
export interface ApplyRowInput {
  line: number;
  name: string;
  email: string;
  teamId: number | null;
  /** 주는 권한(없으면 부서 담당자). 성과관리팀은 관리자만 */
  role?: "dept_user" | "pmo";
}

export type ApplyStatus = "created" | "updated" | "unchanged" | "skipped" | "error";

export interface ApplyRowResult {
  line: number;
  email: string;
  status: ApplyStatus;
  message: string;
  /** 이번에 새로 담당자로 지정된 과제 수 */
  assigned: number;
}

export type ApplyResult = { ok: true; rows: ApplyRowResult[] } | { ok: false; message: string };

/** 한 번에 처리하는 최대 줄 수(서비스 키 계정 생성이 줄마다 한 번씩 돌기 때문) */
export const PASTE_MAX_ROWS = 300;
