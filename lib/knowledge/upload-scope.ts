// 일반 문서 올리기의 순수 상수·함수(참고자료 5단계) — kordoc·node 모듈을 안 불러서 화면(클라이언트 컴포넌트)도 import할 수 있다.
// 읽기 코어는 lib/knowledge/upload.ts(kordoc 사용, 서버·CLI 전용).

import type { Track, UnitId } from "./types.ts";
import { DEFAULT_TRACK } from "../tracks/index.ts";
import { MGMT_INDICATORS } from "../tracks/mgmt-units.ts";
import { REPORT_METHOD_USAGE } from "./usage.ts";

export const UPLOAD_EXTS = ["pdf", "hwp", "hwpx", "docx", "xlsx", "xls"] as const;
/** 저장소 버킷 knowledge의 파일당 한도(100MB) */
export const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
/** 이보다 큰 파일은 서버(함수)에서 읽는 시간을 재지 못했으므로 CLI(`pnpm knowledge:add`)를 권함 */
export const UPLOAD_WARN_BYTES = 30 * 1024 * 1024;

/** 올릴 때 고르는 범위 — 규칙 범위의 층(lib/knowledge/bundle.ts layerOf)에 그대로 대응 */
export type UploadScope = "institution" | "common-kpi" | "bonus" | "BZ-1" | "BZ-2" | "BZ-3" | "mg-institution" | `MG-${number}` | "report-method" | "search-only";

export const UPLOAD_SCOPES: Array<{ value: UploadScope; label: string; hint: string }> = [
  { value: "institution", label: "기관 공통(①)", hint: "모든 과제의 AI 근거에 들어감" },
  { value: "common-kpi", label: "공통지표(②)", hint: "모든 과제의 AI 근거에 들어감(공통지표 BZ-4)" },
  { value: "bonus", label: "가점(②)", hint: "모든 과제의 AI 근거에 들어감(가점 트랙, 사업 미지정)" },
  { value: "BZ-1", label: "주요사업1 공통(③)", hint: "주요사업1 과제의 AI 근거에만" },
  { value: "BZ-2", label: "주요사업2 공통(③)", hint: "주요사업2 과제의 AI 근거에만" },
  { value: "BZ-3", label: "주요사업3 공통(③)", hint: "주요사업3 과제의 AI 근거에만" },
  // 경영관리 트랙(2026-10-07): 트랙 공통은 경영관리 과제 모두의 AI 근거 ①, 지표 공통은 그 지표 과제의 ③(경영관리 지표 1~14, 12~14는 혁신가점)
  { value: "mg-institution", label: "경영관리 공통(①)", hint: "경영관리 과제 모두의 AI 근거에 들어감(경영관리 트랙, 지표 미지정)" },
  ...MGMT_INDICATORS.map((m) => ({ value: m.id as UploadScope, label: `경영관리 지표${m.no} ${m.name}(③)`, hint: `경영관리 지표${m.no} 과제의 AI 근거에만` })),
  { value: "report-method", label: "경평 초안 작성 방법론", hint: "경평 초안(구성안·집필·블록 고치기)에만 방법론 맥락으로 들어감 — 글 쓰는 방식의 참고이며 사실·숫자 근거가 아님. 과제원장 AI에는 안 들어감" },
  { value: "search-only", label: "검색 전용", hint: "공통 지식 검색에만 나오고 AI 근거·매칭에는 안 들어감" },
];

export function isUploadScope(v: unknown): v is UploadScope {
  return UPLOAD_SCOPES.some((s) => s.value === v);
}

/** 범위 선택 → 조각 꼬리표(트랙·사업·검색 전용·용도) */
export function scopeTags(scope: UploadScope): { track: Track; business: UnitId | null; searchOnly: boolean; usage?: typeof REPORT_METHOD_USAGE } {
  switch (scope) {
    case "institution":
      return { track: DEFAULT_TRACK.id, business: null, searchOnly: false };
    case "common-kpi":
      return { track: DEFAULT_TRACK.id, business: "BZ-4", searchOnly: false };
    case "bonus":
      return { track: "가점", business: null, searchOnly: false };
    case "report-method":
      return { track: DEFAULT_TRACK.id, business: null, searchOnly: false, usage: REPORT_METHOD_USAGE };
    case "search-only":
      return { track: DEFAULT_TRACK.id, business: null, searchOnly: true };
    case "mg-institution":
      return { track: "경영관리", business: null, searchOnly: false };
    default:
      return scope.startsWith("MG-") ? { track: "경영관리", business: scope as UnitId, searchOnly: false } : { track: DEFAULT_TRACK.id, business: scope as UnitId, searchOnly: false };
  }
}

/** 저장소 키에 한글을 쓰지 않으므로 파일 이름은 영문·숫자로만(원래 이름은 file_name 칸에 그대로) */
export function safeStorageName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  return `source${ext ? `.${ext}` : ""}`;
}

/** 파일 이름·크기 사전 검사(서버 액션이 서명 주소를 주기 전과 읽기 코어가 같이 씀). 통과하면 null, 아니면 사람이 읽을 문장 */
export function precheckUpload(fileName: string, bytes: number): string | null {
  const ext = fileName.includes(".") ? (fileName.toLowerCase().split(".").pop() ?? "") : "";
  if (!(UPLOAD_EXTS as readonly string[]).includes(ext)) return `한글(hwp·hwpx)·PDF·워드(docx)·엑셀(xlsx·xls) 파일만 올릴 수 있습니다(받은 형식: ${ext || "없음"}).`;
  if (bytes <= 0) return "빈 파일입니다.";
  if (bytes > UPLOAD_MAX_BYTES) return `파일이 너무 큽니다(최대 ${UPLOAD_MAX_BYTES / 1024 / 1024}MB).`;
  return null;
}
