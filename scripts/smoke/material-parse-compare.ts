// 이미 저장된 첨부 「읽은 글」 대조(읽기 전용) — 판정·집계·출력과 대조 순서(material-parse-check.ts가 실제 클라이언트·kordoc을 넘겨 부름).
// 배경(2026-11-17 근본책 0·1단계): 3차(7f41418)부터 card_materials·report_materials의 읽은 글 칸은 서버만 쓰지만(20261117100000),
// 그 전에는 쓰기 권한자가 앱 밖에서 parsed_text·sha256을 바꿀 수 있었음 — 그런 행이 남았는지 저장소 파일과 대조함.
// 이 파일은 DB·저장소를 직접 부르지 않음(받은 클라이언트의 select·download만 씀 — 쓰기 메서드는 부르지 않음, 시험이 가짜 클라이언트로 지킴).
// 출력에는 id·표·카드 uid(보고서 추가자료는 보고서 id)·건수·글자 수만 — 글 내용·파일 이름·실명은 내지 않음.

import { createHash } from "node:crypto";
import { PARSER_VERSION, type ParseOutcome } from "../../lib/ai/material-text.ts";

export type TableKey = "card" | "report";

/** 표별 이름·버킷·소속 칸(카드 전용 자료는 카드 uid, 보고서 추가자료는 보고서 id로 적음) */
export const TABLES: Record<TableKey, { table: "card_materials" | "report_materials"; bucket: string; ownerCols: string; label: string }> = {
  card: { table: "card_materials", bucket: "card-materials", ownerCols: "card:cards(uid)", label: "카드 전용 자료" },
  report: { table: "report_materials", bucket: "report-materials", ownerCols: "report_id", label: "보고서 추가자료" },
};

/** 앱 읽기 경로의 kordoc 옵션(lib/ai/attachments.ts realDeps.kordoc과 같아야 함 — 시험이 그 파일 글과 대조) */
export const KORDOC_OPTIONS = { images: false } as const;

/** 대조할 행(읽은 글이 있는 행) */
export interface CheckRow {
  table: TableKey;
  id: string;
  /** 카드 uid 또는 보고서 id(출력용 — 이름 아님) */
  owner: string;
  storagePath: string;
  /** 읽기 판단(확장자·이미지 여부)에만 씀 — 출력하지 않음 */
  fileName: string;
  sha256: string | null;
  parsedText: string;
  parserVersion: string | null;
}

/** 판정: 같음·sha 다름·글 다름·판 다름·비교 불가(그림 설명)·내려받기 실패 */
export type Verdict = "same" | "sha" | "text" | "version" | "describe" | "download";
export const VERDICTS: readonly Verdict[] = ["same", "sha", "text", "version", "describe", "download"];
export const VERDICT_LABEL: Record<Verdict, string> = {
  same: "같음",
  sha: "sha 다름",
  text: "글 다름",
  version: "판 다름",
  describe: "비교 불가(그림 설명)",
  download: "내려받기 실패",
};
/** 행을 하나씩 적는 판정(의심 행) — 판 다름·비교 불가·같음은 건수만 */
export const LISTED: readonly Verdict[] = ["sha", "text", "download"];

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * 행 하나 판정(앞에서부터 먼저 맞는 것): 내려받기 실패 → sha 다름(저장값 ≠ 파일 — 판과 무관하게 의심) → 판 다름(앱이 다음 요청에 다시 읽어 덮음, 글은 견주지 않음)
 * → 비교 불가(다시 읽기가 그림 설명 길로 감 — 이미지·글 없는 스캔 PDF, AI를 부르지 않음) → 같음/글 다름(앱과 같은 길로 다시 읽은 글과 저장 글이 글자까지 같은가).
 * 판정이 저장 글이 아니라 파일로 정해지므로, 문서 파일에 그림 설명 머리를 붙여 넣은 글도 「글 다름」으로 잡힘
 */
export function classify(row: Pick<CheckRow, "sha256" | "parsedText" | "parserVersion">, file: { sha256: string } | null, reparse: ParseOutcome | null, current: string = PARSER_VERSION): Verdict {
  if (!file) return "download";
  if (row.sha256 !== file.sha256) return "sha";
  if (row.parserVersion !== current) return "version";
  if (!reparse) return "text"; // 같은 판인데 다시 읽기를 못 함 — 부르는 쪽이 넘기지 않은 경우(쓰이지 않음)
  if (reparse.status === "pending") return "describe";
  return reparse.status === "parsed" && reparse.text === row.parsedText ? "same" : "text";
}

/** 판정 하나(출력용) — 글자 수·크기만, 글 내용은 없음 */
export interface CheckResult {
  table: TableKey;
  id: string;
  owner: string;
  verdict: Verdict;
  /** 글 다름일 때: 저장 글 글자 수·다시 읽은 글 글자 수(다시 읽기 실패면 null) */
  chars?: { stored: number; reparsed: number | null };
}

export interface CheckOptions {
  tables: TableKey[];
  /** 표마다 대조할 행 상한(없으면 전부) */
  limit: number | null;
  dry: boolean;
}

/** 명령줄 → 옵션. 잘못되면 { error } */
export function parseArgs(argv: readonly string[]): CheckOptions | { error: string } {
  const out: CheckOptions = { tables: ["card", "report"], limit: null, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") out.dry = true;
    else if (a === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) return { error: "--limit 뒤에는 1 이상의 정수" };
      out.limit = n;
    } else if (a === "--table") {
      const t = argv[++i];
      if (t !== "card" && t !== "report") return { error: "--table 뒤에는 card 또는 report" };
      out.tables = [t];
    } else return { error: `모르는 옵션: ${a}` };
  }
  return out;
}

// ---------------------------------------------------------------------------
// 대조 순서(클라이언트는 받음 — 쓰기 메서드는 부르지 않음)

/** 이 모듈이 쓰는 Supabase 클라이언트 모양(읽기만: select·download) */
export interface ReadDb {
  from(table: string): { select(cols: string): ReadQuery };
  storage: { from(bucket: string): { download(path: string): Promise<{ data: Blob | null; error: unknown }> } };
}
export interface ReadQuery extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  not(col: string, op: "is", value: null): ReadQuery;
  order(col: string, opts?: { ascending: boolean }): ReadQuery;
  range(from: number, to: number): ReadQuery;
}

/** 한 번에 읽는 행 수(읽은 글이 행마다 수십만 자일 수 있어 작게) */
export const PAGE_ROWS = 20;

/** DB 행 → 대조할 행 */
function toRow(table: TableKey, r: Record<string, unknown>): CheckRow {
  const card = r.card as { uid?: unknown } | Array<{ uid?: unknown }> | null | undefined;
  const uid = Array.isArray(card) ? card[0]?.uid : card?.uid;
  return {
    table,
    id: String(r.id),
    owner: table === "card" ? String(uid ?? "?") : String(r.report_id ?? "?"),
    storagePath: String(r.storage_path ?? ""),
    fileName: String(r.file_name ?? ""),
    sha256: typeof r.sha256 === "string" ? r.sha256 : null,
    parsedText: String(r.parsed_text ?? ""),
    parserVersion: typeof r.parser_version === "string" ? r.parser_version : null,
  };
}

/** 대조할 행을 PAGE_ROWS씩(id 순, 읽은 글이 있는 행만, 표마다 limit까지) */
async function* rowsOf(db: ReadDb, table: TableKey, limit: number | null): AsyncGenerator<CheckRow> {
  const t = TABLES[table];
  let seen = 0;
  for (let from = 0; ; from += PAGE_ROWS) {
    const take = limit === null ? PAGE_ROWS : Math.min(PAGE_ROWS, limit - seen);
    if (take <= 0) return;
    const { data, error } = await db
      .from(t.table)
      .select(`id, ${t.ownerCols}, storage_path, file_name, sha256, parsed_text, parser_version`)
      .not("parsed_text", "is", null)
      .order("id", { ascending: true })
      .range(from, from + take - 1);
    if (error) throw new Error(`${t.table}을 읽지 못했습니다(${error.message})`);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    for (const r of rows) {
      seen++;
      yield toRow(table, r);
    }
    if (rows.length < take) return;
  }
}

/** 다시 읽기(앱과 같은 길 — AI를 부르지 않음): material-parse-check.ts가 kordoc으로 만들어 넘김 */
export type Reparse = (bytes: Uint8Array, fileName: string) => Promise<ParseOutcome>;

/** 행 하나 대조: 내려받기 → sha → (같은 판이면) 다시 읽기 → 판정. 파일 바이트·글은 여기서 끝나고 밖으로 내지 않음 */
export async function checkRow(db: ReadDb, row: CheckRow, reparse: Reparse, current: string = PARSER_VERSION): Promise<CheckResult> {
  const base = { table: row.table, id: row.id, owner: row.owner };
  let bytes: Uint8Array | null = null;
  try {
    const { data, error } = await db.storage.from(TABLES[row.table].bucket).download(row.storagePath);
    if (!error && data) bytes = new Uint8Array(await data.arrayBuffer());
  } catch {
    bytes = null;
  }
  if (!bytes) return { ...base, verdict: "download" };
  const file = { sha256: sha256Hex(bytes) };
  // sha·판에서 갈리면 다시 읽지 않음(kordoc 시간을 아낌)
  const early = classify(row, file, null, current);
  if (early === "sha" || early === "version") return { ...base, verdict: early };
  let o: ParseOutcome;
  try {
    o = await reparse(bytes, row.fileName);
  } catch {
    o = { status: "failed", text: "", error: "다시 읽다가 오류", sha256: file.sha256 };
  }
  const verdict = classify(row, file, o, current);
  return verdict === "text" ? { ...base, verdict, chars: { stored: row.parsedText.length, reparsed: o.status === "parsed" ? o.text.length : null } } : { ...base, verdict };
}

/** 표들을 차례로 대조(한 행씩 — 운영 저장소에 부담을 적게). onResult는 진행 표시용 */
export async function checkMaterials(db: ReadDb, opts: CheckOptions, reparse: Reparse, onResult?: (r: CheckResult, n: number) => void, current: string = PARSER_VERSION): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const table of opts.tables) {
    for await (const row of rowsOf(db, table, opts.limit)) {
      const r = await checkRow(db, row, reparse, current);
      out.push(r);
      onResult?.(r, out.length);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// --dry: 대상 건수·크기만(읽은 글·파일은 읽지 않음)

export interface DryCount {
  table: TableKey;
  /** 읽은 글이 있는 행 */
  rows: number;
  /** 그중 지금 판(PARSER_VERSION) — 다시 읽어 글까지 견줄 행 */
  current: number;
  /** 파일 크기 합(bytes 칸 — 비어 있으면 0으로 셈) */
  bytes: number;
}

/** 대상 건수·크기(표마다 limit까지 — 대조 때와 같은 행). 글·파일은 읽지 않고 id·bytes·parser_version만 */
export async function dryCount(db: ReadDb, opts: CheckOptions, current: string = PARSER_VERSION): Promise<DryCount[]> {
  const out: DryCount[] = [];
  for (const table of opts.tables) {
    const t = TABLES[table];
    const c: DryCount = { table, rows: 0, current: 0, bytes: 0 };
    for (let from = 0; ; from += 1000) {
      const take = opts.limit === null ? 1000 : Math.min(1000, opts.limit - c.rows);
      if (take <= 0) break;
      const { data, error } = await db.from(t.table).select("id, bytes, parser_version").not("parsed_text", "is", null).order("id", { ascending: true }).range(from, from + take - 1);
      if (error) throw new Error(`${t.table}을 읽지 못했습니다(${error.message})`);
      const rows = (data ?? []) as Array<{ bytes: unknown; parser_version: unknown }>;
      for (const r of rows) {
        c.rows++;
        if (r.parser_version === current) c.current++;
        c.bytes += Number(r.bytes) > 0 ? Number(r.bytes) : 0;
      }
      if (rows.length < take) break;
    }
    out.push(c);
  }
  return out;
}

/**
 * 예상 시간(초) 어림: 행마다 내려받기 왕복 PER_ROW_SEC + 크기 × (내려받기 DOWNLOAD_SEC_PER_MB + 같은 판 행만 kordoc PARSE_SEC_PER_MB).
 * kordoc 값은 로컬 원본 실측(PDF 21개 417.7MB에 78.5초 = MB당 0.19초, 파일당 최대 15.6초 · HWPX MB당 0.06초 · HWP 더 빠름 — 2026-11-17)의 PDF 쪽(느린 쪽).
 * 내려받기 값은 실측 없음(운영 접속 금지) — 넉넉히 MB당 0.1초·왕복 0.3초로 둠
 */
export const ESTIMATE = { PER_ROW_SEC: 0.3, DOWNLOAD_SEC_PER_MB: 0.1, PARSE_SEC_PER_MB: 0.2 } as const;
export function estimateSeconds(c: Pick<DryCount, "rows" | "current" | "bytes">): number {
  const mb = c.bytes / 1048576;
  const currentMb = c.rows ? mb * (c.current / c.rows) : 0;
  return c.rows * ESTIMATE.PER_ROW_SEC + mb * ESTIMATE.DOWNLOAD_SEC_PER_MB + currentMb * ESTIMATE.PARSE_SEC_PER_MB;
}

// ---------------------------------------------------------------------------
// 출력(id·표·카드 uid·건수·글자 수만)

const fmtSec = (s: number) => (s >= 90 ? `약 ${Math.round(s / 60)}분` : `약 ${Math.max(1, Math.round(s))}초`);

/** --dry 출력 줄 */
export function dryReport(counts: readonly DryCount[]): string[] {
  const lines = ["| 표 | 읽은 글 있는 행 | 지금 판(글까지 견줌) | 판 다름 | 파일 합계 | 예상 시간 |", "|---|---:|---:|---:|---:|---:|"];
  for (const c of counts) lines.push(`| ${TABLES[c.table].table} | ${c.rows} | ${c.current} | ${c.rows - c.current} | ${(c.bytes / 1048576).toFixed(1)}MB | ${fmtSec(estimateSeconds(c))} |`);
  const all = counts.reduce((a, c) => ({ rows: a.rows + c.rows, current: a.current + c.current, bytes: a.bytes + c.bytes }), { rows: 0, current: 0, bytes: 0 });
  lines.push("", `합계 ${all.rows}행 · ${(all.bytes / 1048576).toFixed(1)}MB · 예상 ${fmtSec(estimateSeconds(all))}(행마다 ${ESTIMATE.PER_ROW_SEC}초 + MB당 내려받기 ${ESTIMATE.DOWNLOAD_SEC_PER_MB}초 + 지금 판 MB당 kordoc ${ESTIMATE.PARSE_SEC_PER_MB}초)`);
  return lines;
}

/** 대조 결과 출력 줄: 표별 판정 건수 + 의심 행(sha 다름·글 다름·내려받기 실패) id·표·소속 */
export function checkReport(results: readonly CheckResult[], tables: readonly TableKey[]): string[] {
  const lines = [`| 표 | ${VERDICTS.map((v) => VERDICT_LABEL[v]).join(" | ")} | 합계 |`, `|---|${VERDICTS.map(() => "---:").join("|")}|---:|`];
  for (const t of tables) {
    const mine = results.filter((r) => r.table === t);
    lines.push(`| ${TABLES[t].table} | ${VERDICTS.map((v) => mine.filter((r) => r.verdict === v).length).join(" | ")} | ${mine.length} |`);
  }
  const odd = results.filter((r) => LISTED.includes(r.verdict));
  lines.push("");
  if (!odd.length) lines.push("의심 행 없음(sha 다름·글 다름·내려받기 실패 0건).");
  else {
    lines.push(`의심 행 ${odd.length}건(id · 표 · 카드 uid 또는 보고서 id · 판정 · 글자 수 저장/다시 읽음):`);
    for (const r of odd) lines.push(`- ${r.id} · ${TABLES[r.table].table} · ${r.owner} · ${VERDICT_LABEL[r.verdict]}${r.chars ? ` · ${r.chars.stored}/${r.chars.reparsed ?? "다시 읽기 실패"}` : ""}`);
  }
  const version = results.filter((r) => r.verdict === "version").length;
  if (version) lines.push("", `판 다름 ${version}건: 앱이 다음 AI 요청 때 서버로 다시 읽어 덮습니다(지금 글은 견주지 않음 — sha는 맞음).`);
  const desc = results.filter((r) => r.verdict === "describe").length;
  if (desc) lines.push(`비교 불가(그림 설명) ${desc}건: AI가 쓴 글이라 AI를 부르지 않고는 견줄 수 없음(sha는 맞음).`);
  return lines;
}
