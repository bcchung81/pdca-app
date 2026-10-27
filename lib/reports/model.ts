// 경평 초안 상태·블록(순수)




export type ReportStatus = "preparing" | "drafting" | "submitted" | "approved";
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = { preparing: "자료 준비", drafting: "초안 작성", submitted: "제출 · 검토 중", approved: "승인" };
export const COMMENT_KINDS = ["수정", "삭제", "질문", "좋음"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export interface ReportBlock {
  id: string;
  type: "heading" | "paragraph" | "table";
  level?: number;
  text?: string;
  rows?: string[][];
}

/** 저장·전송된 블록 JSON의 한 항목(검증 전 — 모든 칸이 믿을 수 없는 값) */
interface RawBlock {
  id?: unknown;
  type?: unknown;
  level?: unknown;
  text?: unknown;
  rows?: unknown;
}

/** 저장된 블록 JSON을 화면용으로(형식이 어긋난 블록은 건너뜀) */
export function readBlocks(raw: unknown): ReportBlock[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<RawBlock | null | undefined>)
    .filter((b): b is RawBlock & { id: string; type: ReportBlock["type"] } => !!b && typeof b.id === "string" && ["heading", "paragraph", "table"].includes(b.type as string))
    .map((b) => ({ id: b.id, type: b.type, level: Number(b.level) || undefined, text: typeof b.text === "string" ? b.text : undefined, rows: Array.isArray(b.rows) ? (b.rows as unknown[]).map((r) => (Array.isArray(r) ? r.map(String) : [])) : undefined }));
}

/** 부서가 넣는 계량 실적 칸 키: 카드 id + 지표 순번 */
export const kpiKey = (cardId: string, i: number) => `${cardId}#${i}`;

/** 부서 담당자가 바꿀 수 있는 상태 전환 */
/** 보고서 상태 순서(화면 칩·전이 표) */
export const REPORT_STATUSES: ReportStatus[] = ["preparing", "drafting", "submitted", "approved"];

/** 부서 담당자도 하는 전이: 준비 → 작성 중(첫 과제별 초안이 생기면 DB 트리거가 바꿈, 초안이 보고서보다 먼저면 prepareReports가 바꿈), 작성 중 → 제출, 제출 → 작성 중(제출 취소·돌려보내기) */
const DEPT_MOVES = new Set(["preparing>drafting", "drafting>submitted", "submitted>drafting"]);
/** 성과관리팀·관리자만 하는 전이: 제출 → 승인, 승인 → 작성 중(승인 취소 — 다시 고치게 돌려보냄). 돌려보내기 메모는 서버가 따로 요구 */
const STAFF_MOVES = new Set(["submitted>approved", "approved>drafting"]);

/** 「승인 풀기」 단추가 보내는 상태(승인 → 작성 중 — 전이 표 STAFF_MOVES. 화면 단추가 표 밖으로 보내지 않게 시험이 대조) */
export const UNAPPROVE_TO: ReportStatus = "drafting";

/**
 * 보고서 상태 전이 표(규칙 한 곳 — 2026-10-10 개선 계획 P1-1). 화면 단추·서버 액션(setReportStatus)·DB 트리거(private.report_transition_ok — 같은 목록)가 같은 규칙.
 * 예전에는 성과관리팀이 아무 전이나(준비·작성 중 → 승인처럼 제출 조건을 건너뛰는 것까지) 할 수 있었음
 */
export function canMove(role: "dept_user" | "pmo" | "admin", from: ReportStatus, to: ReportStatus): boolean {
  const k = `${from}>${to}`;
  return DEPT_MOVES.has(k) || (role !== "dept_user" && STAFF_MOVES.has(k));
}

/** 부서가 고칠 점 메모가 필수인 전이: 성과관리팀의 돌려보내기(제출 → 작성 중)·승인 풀기(승인 → 작성 중). 부서의 제출 취소는 메모 없음 */
export function needsReturnMemo(role: "dept_user" | "pmo" | "admin", from: ReportStatus, to: ReportStatus): boolean {
  return role !== "dept_user" && to === "drafting" && (from === "submitted" || from === "approved") && canMove(role, from, to);
}

export function deptCanMove(from: ReportStatus, to: ReportStatus): boolean {
  return canMove("dept_user", from, to);
}

/** 파일 이름 → 저장소 키에 쓸 ASCII 확장자 */
export function safeExt(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? `.${m[1].toLowerCase()}` : "";
}

/** 카드 계량지표 행 중 실제 지표만(원본 양식의 빈 자리표시 "-" 행 제외). i는 원래 순번(입력값 키) */
export function kpiRowsOf(rows: unknown): Array<{ i: number; name: string; unit: string; target: string; prev: string }> {
  if (!Array.isArray(rows)) return [];
  return (rows as Array<Record<string, unknown> | null | undefined>)
    .map((k, i) => ({ i, name: String(k?.name ?? "").trim(), unit: String(k?.unit ?? "").trim(), target: String(k?.target ?? "").trim(), prev: String(k?.prev ?? "").trim() }))
    .filter((k) => k.name && !/^[-–—·]+$/.test(k.name));
}

export const BLOCK_LIMITS = { blocks: 300, text: 5000, rows: 60, cols: 12 } as const;

/** 편집기에서 받은 블록 정리: 형식이 맞는 것만, 길이 제한, 빈 id는 새로 */
export function cleanBlocks(raw: unknown, newId: () => string): { blocks: ReportBlock[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "블록 목록이 아닙니다." };
  if (raw.length > BLOCK_LIMITS.blocks) return { error: `블록은 ${BLOCK_LIMITS.blocks}개까지입니다.` };
  const seen = new Set<string>();
  const blocks: ReportBlock[] = [];
  for (const b of raw as Array<RawBlock | null | undefined>) {
    if (!b || !["heading", "paragraph", "table"].includes(b.type as string)) continue;
    let id = typeof b.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(b.id) ? b.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    if (b.type === "table") {
      const rows = (Array.isArray(b.rows) ? (b.rows as unknown[]) : [])
        .slice(0, BLOCK_LIMITS.rows)
        .map((r) => (Array.isArray(r) ? (r as unknown[]).slice(0, BLOCK_LIMITS.cols).map((c) => String(c ?? "").slice(0, 1000)) : []))
        .filter((r: string[]) => r.some((c) => c.trim()));
      blocks.push({ id, type: "table", rows });
    } else {
      const text = String(b.text ?? "").slice(0, BLOCK_LIMITS.text);
      blocks.push(b.type === "heading" ? { id, type: "heading", level: b.level === 2 ? 2 : 1, text } : { id, type: "paragraph", text });
    }
  }
  return { blocks };
}

/**
 * 표 붙여넣기 글 → 행 배열. 탭이 있으면 엑셀·한글 복사 형식(TSV: 줄바꿈이 든 칸은 큰따옴표로 감쌈, ""는 따옴표)으로,
 * 없으면 | 구분(마크다운 표, 구분선 행은 건너뜀)으로 읽습니다.
 */
export function parseTableText(text: string): string[][] {
  if (text.includes("\t")) return parseTsv(text);
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line))
    .map((line) =>
      line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim()),
    );
}

function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let atStart = true;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else if (ch === "\t") {
      row.push(cell.trim());
      cell = "";
      atStart = true;
    } else if (ch === "\n") {
      row.push(cell.trim());
      if (row.some((c) => c)) rows.push(row);
      row = [];
      cell = "";
      atStart = true;
    } else {
      cell += ch;
      atStart = false;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}

/** 행 배열 → 편집용 TSV 글(탭·줄바꿈·따옴표가 든 칸은 큰따옴표로 감쌈 — parseTableText와 왕복) */
export function toTableText(rows: string[][]): string {
  const q = (c: string) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((r) => r.map(q).join("\t")).join("\n");
}

/** 보고서보다 초안이 먼저 생긴 경우 — DB 트리거 report_drafting_on_draft와 같은 짝 판정: 같은 평가단위·팀·연도의 초안이 있는 준비 중 보고서 id */
export function reportsToStart(
  reports: ReadonlyArray<{ id: number; eval_unit_id: string; team_id: number; year: number; status: ReportStatus }>,
  drafts: ReadonlyArray<{ year: number; eval_unit_id: string; team_id: number | null }>,
): number[] {
  const has = new Set<string>();
  for (const d of drafts) if (d.team_id != null) has.add(`${d.eval_unit_id}|${d.team_id}|${d.year}`);
  const ids = new Set<number>();
  for (const r of reports) if (r.status === "preparing" && has.has(`${r.eval_unit_id}|${r.team_id}|${r.year}`)) ids.add(r.id);
  return [...ids];
}
