// 과제관리카드 현행화(한글 파일 → 원장): 과제 매칭 · 블록별 비교 · 무손실 병합. 입출력 없는 순수 함수.
// 기준: 성과관리팀 종합점검 지침(14) <현행화모드> — 블록 단위 [유지]·[변경]·[추가]·[⚠️삭제 예정], 위험 트리거, <무손실_가드>.
// 비교는 화면에 보이는 원본 양식(렌더러 출력) 기준입니다. 그림 경로·AX 번호 딱지처럼 파일에서 정해지지 않는 값은 비교에서 뺍니다.

import { canonicalJson, fixedLabelOf, fixedSectionsOf } from "../fixed.ts";
import { isMgmtCard } from "../mgmt-card.ts";
import { type CardPart, renderAxPart, renderMonthlyBox, renderPart } from "../render.ts";
import { type MgmtPart, renderMgmtPart } from "../render-mgmt.ts";
import type { LooseJson } from "../../loose-json.ts";

export type BlockKey = "basic" | "index" | "kpi" | "strategy" | "act" | "plan" | "do" | "monthly" | "check" | "outcome" | "ax" | "feedback" | "findings";
/** unknown = 비교 불가(원장이나 파일 카드의 이 블록을 그리다 렌더러가 던짐 — 기본은 유지, 개선 계획 P2-4) */
export type BlockStatus = "same" | "changed" | "added" | "removed" | "unknown";

export const SYNC_BLOCKS: Array<{ key: BlockKey; label: string }> = [
  { key: "basic", label: "과제 기본정보" },
  { key: "index", label: "목차(대상사업·실행과제)" },
  { key: "kpi", label: "계량 성과지표" },
  { key: "strategy", label: "전략 연계성" },
  { key: "act", label: "[Act] 전년도 환류" },
  { key: "plan", label: "[Plan] 조치·개선방향" },
  { key: "do", label: "[Do] 추진내용" },
  { key: "monthly", label: "▣ 월별 실적" },
  { key: "check", label: "[Check] 성과점검" },
  { key: "outcome", label: "추진성과" },
  { key: "ax", label: "붙임 · AX 연계과제" },
];
/** 경영관리 카드의 블록(칸 8개: 과제명·부서·관리자 / 과제 개요 / 전년도 환류 / 지적 및 개선방안 / 추진내용 / 계량 성과지표 / 추진성과 — 목차·전략 연계·Act·Plan·Check·AX 붙임은 없음) */
export const MGMT_SYNC_BLOCKS: Array<{ key: BlockKey; label: string }> = [
  { key: "basic", label: "과제 기본정보·개요" },
  { key: "feedback", label: "전년도 환류" },
  { key: "findings", label: "지적 및 개선방안" },
  { key: "do", label: "추진내용" },
  { key: "monthly", label: "▣ 월별 실적" },
  { key: "kpi", label: "계량 성과지표" },
  { key: "outcome", label: "추진성과" },
];
/** 카드 종류(주요사업·경영관리)에 맞는 블록 목록 — 비교·병합이 이 목록을 돎 */
export const syncBlocksOf = (card: LooseJson) => (isMgmtCard(card) ? MGMT_SYNC_BLOCKS : SYNC_BLOCKS);
/** 두 종류 블록 키 전부(서버가 받은 키를 거르는 데) */
export const ALL_BLOCK_KEYS: ReadonlySet<string> = new Set([...SYNC_BLOCKS, ...MGMT_SYNC_BLOCKS].map((b) => b.key));
export const BLOCK_LABEL = Object.fromEntries([...MGMT_SYNC_BLOCKS, ...SYNC_BLOCKS].map((b) => [b.key, b.label])) as Record<BlockKey, string>;

export interface LineOp {
  op: "same" | "add" | "del";
  text: string;
}

export interface BlockDiff {
  key: BlockKey;
  label: string;
  status: BlockStatus;
  /** 이 블록을 반영하려면 건별 승인이 필요한 까닭(고정영역 변경·부서 변경·대상사업 변경 등) */
  risk: string | null;
  /** 원장의 고정 영역이 확정돼 반영할 수 없음 */
  locked: boolean;
  /** 원장에 있고 파일에 없는 것(블록 전체·월별 기간·붙임). 기본은 보존 */
  missing: string[];
  /** 줄 비교(바뀐 곳 주변만) */
  lines: LineOp[];
  note: string | null;
}

export interface SyncPlan {
  blocks: BlockDiff[];
  /** 과제 단위 위험 사유(하나라도 있으면 일괄 반영에서 빼고 건별 승인) */
  risks: string[];
  /** 기본 반영 블록: 변경·추가 중 위험·잠김이 아닌 것 */
  defaults: BlockKey[];
  /** 바뀐 것이 하나도 없음 */
  unchanged: boolean;
}

// ---------------------------------------------------------------------------
// 글 다루기

/** 과제명 비교용: 띄어쓰기·문장부호를 빼고 소문자로 */
export function normTitle(s: unknown): string {
  return String(s ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s·‧･・.,:;'"‘’“”()（）[\]【】「」『』<>〈〉《》\-–—_/~∼!?]/g, "");
}

/** 두 제목의 글자 쌍 겹침(0~1). 과제명 일부를 고친 경우 후보 순서를 정하는 데만 씀 */
export function titleSimilarity(a: unknown, b: unknown): number {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let both = 0;
  for (const [g, n] of gx) both += Math.min(n, gy.get(g) ?? 0);
  const total = Math.max(1, x.length - 1 + (y.length - 1));
  return (2 * both) / total;
}

/** 원본 양식 조각 → 사람이 읽는 줄(표 칸은 " | "로 이음) */
export function htmlLines(html: string): string[] {
  return html
    .replace(/<img\b[^>]*>/gi, "\n[그림]\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|tr|div|li|h\d|thead|section)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").replace(/(\s*\|\s*)+$/, "").trim())
    .filter((l) => l && l !== "|");
}

/** 줄 비교(LCS). 바뀐 곳 앞뒤 context줄만 남기고, 생략한 곳은 "…" */
export function diffLines(a: string[], b: string[], context = 1): LineOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ op: "del", text: a[i++] });
    else ops.push({ op: "add", text: b[j++] });
  }
  while (i < n) ops.push({ op: "del", text: a[i++] });
  while (j < m) ops.push({ op: "add", text: b[j++] });
  if (context < 0) return ops;
  const keep = ops.map((o) => o.op !== "same");
  const near = ops.map((_, k) => {
    for (let d = -context; d <= context; d++) if (keep[k + d]) return true;
    return false;
  });
  const out: LineOp[] = [];
  let skipped = false;
  ops.forEach((o, k) => {
    if (near[k]) {
      out.push(o);
      skipped = false;
    } else if (!skipped) {
      out.push({ op: "same", text: "…" });
      skipped = true;
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// 블록 추출(비교용 조각)

/**
 * 표·격자의 열 나눔을 실제로 쓰인 칸 경계만으로 다시 셈(열 너비 비율은 내용이 아님).
 * kordoc은 한글 표를 되읽을 때 칸 경계로 격자를 다시 세어 colspan이 달라질 수 있습니다(내용은 같음).
 */
export function normalizeSpans(rows: LooseJson[][]): { rows: LooseJson[][]; cols: number } {
  const taken = new Set<string>();
  const bounds = new Set<number>([0]);
  const starts: number[][] = rows.map((row, r) => {
    let c = 0;
    return row.map((cell) => {
      while (taken.has(`${r},${c}`)) c += 1;
      const cs = Math.max(1, Number(cell?.colspan) || 1);
      const rs = Math.max(1, Number(cell?.rowspan) || 1);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) taken.add(`${r + dr},${c + dc}`);
      bounds.add(c);
      bounds.add(c + cs);
      const at = c;
      c += cs;
      return at;
    });
  });
  const sorted = [...bounds].sort((a, b) => a - b);
  const idx = new Map(sorted.map((b, i) => [b, i]));
  const out = rows.map((row, r) => row.map((cell, i) => ({ ...cell, colspan: idx.get(starts[r][i] + Math.max(1, Number(cell?.colspan) || 1))! - idx.get(starts[r][i])! })));
  return { rows: out, cols: sorted.length - 1 };
}

const isImage = (x: LooseJson) => Boolean(x && typeof x === "object" && "image" in x);

/**
 * 비교용 복사본: 그림 경로(파일마다 다름)·AX 번호 딱지(PDF에서 정해짐)를 지우고, 표·격자 열 나눔을 정규화.
 * 글줄 목록 안의 그림은 끝으로 모음 — kordoc이 한글 표 칸 안 그림을 늘 칸 끝에 두어(표 밖은 제자리) 되읽으면 자리만 달라지므로.
 */
function forCompare(v: LooseJson): LooseJson {
  // 줄 끝 공백은 한글 파일을 거치면 사라지므로(「∙ 」→「∙」) 같은 글로 봄 — 비교에만 쓰고 반영하는 글은 파일 그대로
  if (typeof v === "string") return v.replace(/[ \t\u00a0]+(?=\n|$)/g, "");
  if (Array.isArray(v)) {
    const out = v.map(forCompare);
    return out.some(isImage) ? [...out.filter((x) => !isImage(x)), ...out.filter(isImage)] : out;
  }
  if (v && typeof v === "object") {
    if ("image" in v && v.image && typeof v.image === "object") return { image: { src: "x", kordoc: "그림" } };
    const out: LooseJson = {};
    for (const [k, x] of Object.entries(v)) out[k] = forCompare(x);
    if (Array.isArray(out.rows) && out.rows.length && out.rows.every((r: unknown) => Array.isArray(r))) {
      const n = normalizeSpans(out.rows);
      out.rows = n.rows;
      if ("cols" in out) out.cols = n.cols;
    }
    return out;
  }
  return v;
}

const axBare = (a: LooseJson) => forCompare({ ...a, no: null, seq: null, marker: null, markerSource: null });

/** 그림 개수 */
export function countImages(v: LooseJson): number {
  if (Array.isArray(v)) return v.reduce((n, x) => n + countImages(x), 0);
  if (v && typeof v === "object") return isImage(v) ? 1 : Object.values(v).reduce((n: number, x) => n + countImages(x), 0);
  return 0;
}
/** 그림을 뺀 복사본(글만 비교할 때) */
function withoutImages(v: LooseJson): LooseJson {
  if (Array.isArray(v)) return v.filter((x) => !isImage(x)).map(withoutImages);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withoutImages(x)]));
  return v;
}
/**
 * 글은 같고 파일에 그림만 적은가. kordoc이 한글 표 안의 표에 든 그림을 옮기지 못해, 앱에서 내려받은 파일을 다시 올리면
 * 그 그림만 빠져 옵니다 — 파일에 없다고 지우지 않는다(무손실 가드 1)는 원칙대로 이런 블록은 「유지」로 봅니다.
 */
function onlyImagesMissing(ledgerPart: LooseJson, parsedPart: LooseJson, render: (x: LooseJson) => string): boolean {
  return countImages(parsedPart) < countImages(ledgerPart) && render(withoutImages(ledgerPart)) === render(withoutImages(parsedPart));
}
/**
 * 한글 수식: HWP를 읽으면 kordoc이 글 안에 `$…$`(LaTeX)로 적지만, 앱이 내려받은 HWPX를 다시 읽으면 수식이 빠져 옴 — 수식이 든 칸은 글이 같아도 다르게 보임.
 * 그래서 파일에서 수식만 빠진 블록은 「유지」로 보고(원장 그대로), 다른 변경과 함께 수식이 빠지면 위험으로 알림(반영하면 원장의 수식이 빠짐).
 */
const EQ = /\$[^$\n]+\$/g;
export function countEquations(v: LooseJson): number {
  if (typeof v === "string") return (v.match(EQ) ?? []).length;
  if (Array.isArray(v)) return v.reduce((n, x) => n + countEquations(x), 0);
  if (v && typeof v === "object") return Object.values(v).reduce((n: number, x) => n + countEquations(x), 0);
  return 0;
}
function withoutEquations(v: LooseJson): LooseJson {
  if (typeof v === "string") return v.replace(EQ, "").replace(/[ \t]{2,}/g, " ");
  if (Array.isArray(v)) return v.map(withoutEquations);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withoutEquations(x)]));
  return v;
}
/** 파일 쪽에 수식만 적은가(수식을 뺀 글이 같음) */
function onlyEquationsMissing(ledgerPart: LooseJson, parsedPart: LooseJson, render: (x: LooseJson) => string): boolean {
  return countEquations(parsedPart) < countEquations(ledgerPart) && render(withoutEquations(ledgerPart)) === render(withoutEquations(parsedPart));
}

const periodKey = (p: unknown) => String(p ?? "").replace(/\s+/g, "").replace(/∼/g, "~");
const monthNums = (p: unknown) => (String(p ?? "").match(/\d{1,2}(?=\s*월)/g) ?? []).map(Number);

function partHtml(card: LooseJson, part: CardPart | MgmtPart, strict = false): string {
  try {
    return isMgmtCard(card) ? renderMgmtPart(forCompare(card), part as MgmtPart) : renderPart(forCompare(card), part as CardPart);
  } catch (e) {
    if (strict) throw e;
    return "";
  }
}

function blockHtml(card: LooseJson, key: BlockKey, strict = false): string {
  switch (key) {
    case "basic":
      return partHtml(card, "header", strict) + partHtml(card, "overview", strict);
    case "index":
      return indexLines(card).join("\n");
    case "monthly":
      return (card?.do?.monthly ?? []).map((m: LooseJson) => renderMonthlyBox(forCompare(m))).join("");
    case "ax":
      return (card?.axAttachments ?? []).map((a: LooseJson) => renderAxPart(axBare(a))).join("");
    default:
      return partHtml(card, key as CardPart | MgmtPart, strict);
  }
}

/**
 * 이 블록을 그리다 렌더러가 던지면 그 까닭(아니면 null). 예전에는 그리지 못한 쪽을 빈 글로 비교해 「삭제 예정」이나 전부 지운 [변경]으로 잘못 보였고
 * (기본 반영 대상이 되기도 함), 월별 실적·붙임은 비교 전체가 던졌음(개선 계획 P2-4)
 */
function renderError(card: LooseJson, key: BlockKey): string | null {
  try {
    blockHtml(card, key, true);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function indexLines(card: LooseJson): string[] {
  if (!card?.targetBusiness && !card?.executionTask) return [];
  return [
    `대상사업: ${card.targetBusiness ?? ""}`,
    `실행과제: ${[card.executionTaskNo, card.executionTask].filter(Boolean).join(". ")}`,
    `목차 과제명: ${card.indexTitle ?? ""}`,
    `구분: ${(card.tags?.labels ?? []).join(" ") || "—"}`,
  ];
}

/** 글·그림이 하나라도 있나 */
function hasText(v: LooseJson): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(hasText);
  if (v && typeof v === "object") return "image" in v || Object.values(v).some(hasText);
  return false;
}

/** 블록에 사람이 쓴 내용이 있나(머리글·열 이름 같은 양식 글은 빼고) */
function blockHasContent(card: LooseJson, key: BlockKey): boolean {
  switch (key) {
    case "kpi":
      return hasText(card?.kpi?.rows) || hasText(card?.kpi?.notes);
    case "strategy":
      return hasText(card?.strategy?.nationalAgenda) || hasText(card?.strategy?.esgText) || hasText(card?.strategy?.ai?.text);
    case "act":
      return hasText(card?.act?.findings) || hasText(card?.act?.selfAssessment);
    case "plan":
      return hasText(card?.plan?.lines) || hasText(card?.plan?.grid);
    case "do":
      return hasText(card?.do?.lines) || hasText(card?.do?.grid);
    case "check":
      return hasText(card?.check?.items) || hasText(card?.check?.grid);
    case "outcome":
      return hasText(card?.outcome?.quantitative) || hasText(card?.outcome?.qualitative);
    case "feedback":
      return hasText(card?.feedback?.rows);
    case "findings":
      return hasText(card?.findings?.rows);
    default:
      return blockLines(card, key).length > 0;
  }
}

function blockLines(card: LooseJson, key: BlockKey): string[] {
  return key === "index" ? indexLines(card) : htmlLines(blockHtml(card, key));
}

/** 블록에 해당하는 카드 JSON 값(그림 찾기 등) */
export function blockValue(card: LooseJson, key: BlockKey): LooseJson {
  switch (key) {
    case "basic":
      return [card?.title, card?.deptText, card?.overview];
    case "index":
      return [card?.targetBusiness, card?.executionTask, card?.indexTitle];
    case "do":
      return { ...(card?.do ?? {}), monthly: [] };
    case "monthly":
      return card?.do?.monthly ?? [];
    case "ax":
      return card?.axAttachments ?? [];
    default:
      return card?.[key];
  }
}

// ---------------------------------------------------------------------------
// 비교 계획

/** 파일 카드의 식별 칸(id·group·taskNo)은 늘 원장 값으로 봄 — 과제번호는 현행화로 바꾸지 않음 */
function asLedgerIds(ledger: LooseJson, parsed: LooseJson): LooseJson {
  return { ...parsed, id: ledger?.id, group: ledger?.group, taskNo: ledger?.taskNo };
}

export function planSync(ledger: LooseJson, parsedIn: LooseJson, opts: { locked?: boolean; uncertain?: string | null } = {}): SyncPlan {
  const parsed = asLedgerIds(ledger, parsedIn);
  const blocks: BlockDiff[] = [];
  const risks: string[] = [];
  if (opts.uncertain) risks.push(`과제 매칭 불확실 — ${opts.uncertain}`);

  for (const { key, label } of syncBlocksOf(ledger)) {
    const broken = renderError(ledger, key) ? "원장" : renderError(parsed, key) ? "파일" : null;
    if (broken) {
      blocks.push({ key, label, status: "unknown", risk: `비교 불가(${label})`, locked: false, missing: [], lines: [], note: `${broken} 카드의 이 블록을 그리지 못해 비교하지 못했습니다 — 기본은 원장 그대로 둡니다(반영하려면 파일 내용을 확인한 뒤 직접 고르세요)` });
      continue;
    }
    const before = blockLines(ledger, key);
    const after = blockLines(parsed, key);
    let status: BlockStatus;
    let missing: string[] = [];
    let note: string | null = null;
    let risk: string | null = null;

    if (key === "index" && !after.length) {
      // 과제 한 장 파일은 목차가 없음: 비교하지 않고 원장 값 유지
      blocks.push({ key, label, status: "same", risk: null, locked: false, missing: [], lines: [], note: before.length ? "파일에 목차가 없어 원장 값을 그대로 둡니다" : null });
      continue;
    }
    if (key === "monthly") {
      const L: LooseJson[] = ledger?.do?.monthly ?? [];
      const P: LooseJson[] = parsed?.do?.monthly ?? [];
      const inP = new Set(P.map((m) => periodKey(m.period)));
      const inL = new Map(L.map((m) => [periodKey(m.period), m]));
      missing = L.filter((m) => !inP.has(periodKey(m.period))).map((m) => String(m.period));
      const changedP = P.filter((m) => {
        const old = inL.get(periodKey(m.period));
        return !old || (renderMonthlyBox(forCompare(old)) !== renderMonthlyBox(forCompare(m)) && !onlyEquationsMissing(old, m, (x) => renderMonthlyBox(forCompare(x))));
      });
      status = changedP.length ? (L.length ? "changed" : "added") : missing.length ? "removed" : "same";
      if (missing.length) note = `파일에 없는 기간 ${missing.join(", ")}은(는) 그대로 둡니다(지우려면 따로 승인)`;
      if (P.length < L.length) risk = "월별 실적 누적행 감소";
    } else if (key === "ax") {
      const L: LooseJson[] = ledger?.axAttachments ?? [];
      const P: LooseJson[] = parsed?.axAttachments ?? [];
      const inP = new Set(P.map((a) => normTitle(a.title)));
      missing = L.filter((a) => !inP.has(normTitle(a.title))).map((a) => String(a.title ?? `붙임 ${a.seq}`));
      const sameAtt = (a: LooseJson, b: LooseJson) => canonicalJson(axBare(a)) === canonicalJson(axBare(b)) || onlyImagesMissing(b, a, (x) => canonicalJson(axBare(x)));
      const sameAll = P.length > 0 && P.every((a) => L.some((b) => normTitle(b.title) === normTitle(a.title) && sameAtt(a, b)));
      const lostImages = P.some((a) => {
        const b = L.find((x) => normTitle(x.title) === normTitle(a.title));
        return b && !sameAtt(a, b) && countImages(a) < countImages(b);
      });
      if (lostImages) risk = "파일에 없는 그림이 있음 — 반영하면 원장 그림이 빠집니다";
      status = !P.length ? (L.length ? "removed" : "same") : sameAll ? (missing.length ? "removed" : "same") : L.length ? "changed" : "added";
      if (missing.length) note = `파일에 없는 붙임 ${missing.length}건은 그대로 둡니다(지우려면 따로 승인)`;
    } else {
      const exact = key === "index" ? canonicalJson(before) === canonicalJson(after) : blockHtml(ledger, key) === blockHtml(parsed, key);
      const imagesOnly =
        !exact &&
        key !== "index" &&
        countImages(blockValue(parsed, key)) < countImages(blockValue(ledger, key)) &&
        blockHtml(withoutImages(ledger), key) === blockHtml(withoutImages(parsed), key);
      const eqOnly = !exact && key !== "index" && onlyEquationsMissing(blockValue(ledger, key), blockValue(parsed, key), (x) => blockHtml({ ...ledger, ...(key === "do" ? { do: x } : { [key]: x }) }, key));
      const same = exact || imagesOnly || eqOnly;
      const hasBefore = blockHasContent(ledger, key);
      const hasAfter = blockHasContent(parsed, key);
      status = same ? "same" : !hasAfter ? "removed" : !hasBefore ? "added" : "changed";
      if (status === "removed") missing = [label];
      if (imagesOnly) note = "파일에 없는 그림은 원장 그대로 둡니다(한글 표 안의 표에 든 그림)";
      if (eqOnly) note = "파일에 없는 수식은 원장 그대로 둡니다(내려받은 한글 파일(HWPX)에서는 수식을 읽지 못함)";
      if (status === "changed" && countImages(blockValue(parsed, key)) < countImages(blockValue(ledger, key))) risk = "파일에 없는 그림이 있음 — 반영하면 원장 그림이 빠집니다";
      if (status === "changed" && !risk && countEquations(blockValue(parsed, key)) < countEquations(blockValue(ledger, key))) risk = "파일에 없는 수식이 있음 — 반영하면 원장의 수식이 빠집니다";
    }

    // 위험: 지침 14 고정영역(Act·Plan·계량지표 목표·전략 연계성)·지침 08 고정영역(전년도 환류·지적 및 개선방안·계량지표), 대상사업 변경, 담당 부서 변경
    if (status === "changed" || status === "added" || status === "removed") {
      if (key === "act" || key === "plan" || key === "strategy" || key === "feedback" || key === "findings") risk = `고정영역(${label}) 변경`;
      if (key === "kpi") {
        const t = (c: LooseJson) => canonicalJson((c?.kpi?.rows ?? []).map((r: LooseJson) => [r.nameRaw ?? r.name, r.target]));
        risk = t(ledger) !== t(parsed) ? "고정영역(계량지표 목표) 변경" : null;
      }
      if (key === "index" && String(ledger?.targetBusiness ?? "") !== String(parsed?.targetBusiness ?? "")) risk = "대상사업 변경";
      if (key === "basic" && normTitle(ledger?.team) !== normTitle(parsed?.team)) risk = `담당 부서 변경(${ledger?.team ?? "—"} → ${parsed?.team ?? "—"})`;
      if (key === "basic" && !String(parsed?.title ?? "").trim()) risk = "파일에서 과제명을 읽지 못함";
    }
    // 원장에서 고정 영역을 확정하면 잠기는 블록 — 카드 종류별(lib/cards/fixed.ts fixedSectionsOf)
    const locked = Boolean(opts.locked) && fixedSectionsOf(ledger).includes(key) && status !== "same";
    if (locked) note = `원장의 고정 영역(${fixedLabelOf(ledger)})이 확정돼 반영하지 않습니다`;
    blocks.push({ key, label, status, risk, locked, missing, lines: status === "same" ? [] : diffLines(before, after), note });
  }

  for (const b of blocks) {
    if (b.risk && !b.locked && !risks.includes(b.risk)) risks.push(b.risk);
    if (b.missing.length && b.status !== "same") {
      const r = "⚠️삭제 예정 항목(기본은 보존)";
      if (!risks.includes(r)) risks.push(r);
    }
  }
  const defaults = blocks.filter((b) => (b.status === "changed" || b.status === "added") && !b.risk && !b.locked).map((b) => b.key);
  return { blocks, risks, defaults, unchanged: blocks.every((b) => b.status === "same") };
}

// ---------------------------------------------------------------------------
// 반영(무손실 병합)

export interface SyncApproval {
  /** 반영할 블록(변경·추가) */
  blocks: BlockKey[];
  /** 지우기까지 승인한 블록(파일에 없는 블록 전체·월별 기간·붙임) */
  removals: BlockKey[];
}

const BASIC_KEYS = ["title", "deptText", "department", "team", "manager", "writer", "overview"];
const INDEX_KEYS = ["indexTitle", "tags", "targetBusiness", "executionTask", "executionTaskNo", "indexDepartment"];

/**
 * 원장 카드에 승인한 블록만 파일 카드 값으로 옮깁니다. 식별 칸(id·group·taskNo)은 늘 원장 값.
 * - 파일에 없다는 이유로 지우지 않음: removals에 있을 때만 지움(무손실 가드 1)
 * - 월별 실적: 파일에 있는 기간만 바꾸거나 더하고, 없는 기간은 둠(가드 2)
 * - AX 붙임: 번호 딱지는 같은 제목의 원장 붙임에서 이어 받음
 * - 고정 영역이 잠긴 카드는 그 영역(주요사업 Act·Plan·계량지표, 경영관리 전년도 환류·지적 및 개선방안·계량지표)을 옮기지 않음
 */
export function applySync(ledger: LooseJson, parsedIn: LooseJson, approval: SyncApproval, opts: { locked?: boolean; fileName?: string } = {}): { card: LooseJson; applied: BlockKey[] } {
  const parsed = asLedgerIds(ledger, parsedIn);
  const card = structuredClone(ledger);
  const applied: BlockKey[] = [];
  const plan = planSync(ledger, parsed, { locked: opts.locked });
  const status = new Map(plan.blocks.map((b) => [b.key, b]));
  const want = (k: BlockKey) => {
    const b = status.get(k)!;
    if (b.locked || b.status === "same") return null;
    if (b.status === "removed") return approval.removals.includes(k) ? "remove" : null;
    if (!approval.blocks.includes(k)) return null;
    return approval.removals.includes(k) ? "replace+remove" : "replace";
  };

  for (const { key } of syncBlocksOf(ledger)) {
    const w = want(key);
    if (!w) continue;
    switch (key) {
      case "basic":
        if (w === "remove") continue;
        for (const k of isMgmtCard(ledger) ? [...BASIC_KEYS, "partners"] : BASIC_KEYS) if (parsed[k] !== undefined && parsed[k] !== null) card[k] = structuredClone(parsed[k]);
        if (!String(card.title ?? "").trim()) card.title = ledger.title;
        break;
      case "index":
        if (w === "remove") continue;
        for (const k of INDEX_KEYS) if (parsed[k] !== undefined) card[k] = structuredClone(parsed[k]);
        break;
      case "do":
        card.do = { ...structuredClone(parsed.do ?? {}), monthly: card.do?.monthly ?? [] };
        if (w === "remove") card.do = { items: [], monthly: card.do.monthly, lines: [], grid: null };
        break;
      case "monthly": {
        const P: LooseJson[] = parsed?.do?.monthly ?? [];
        const byP = new Map(P.map((m) => [periodKey(m.period), m]));
        const kept: LooseJson[] = [];
        for (const m of card.do?.monthly ?? []) {
          const k = periodKey(m.period);
          if (byP.has(k)) kept.push(w === "remove" ? m : structuredClone(byP.get(k)));
          else if (!w.includes("remove")) kept.push(m);
        }
        if (w !== "remove") for (const m of P) if (!kept.some((x) => periodKey(x.period) === periodKey(m.period))) kept.push(structuredClone(m));
        // 달 순서(첫 달 → 끝 달)로. 기간을 읽지 못하면 뒤에 둔 순서 그대로
        const order = (m: LooseJson) => {
          const ns = monthNums(m.period);
          return ns.length ? [ns[0], ns[ns.length - 1]] : [99, 99];
        };
        kept.sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1]);
        card.do = { ...card.do, monthly: kept };
        break;
      }
      case "ax": {
        const L: LooseJson[] = ledger.axAttachments ?? [];
        const P: LooseJson[] = w === "remove" ? [] : (parsed.axAttachments ?? []);
        const next = P.map((a, i) => {
          const old = L.find((b) => normTitle(b.title) === normTitle(a.title));
          return { ...structuredClone(a), seq: i + 1, no: old?.no ?? null, marker: old?.marker ?? null, markerSource: old?.markerSource ?? null };
        });
        if (!w.includes("remove")) for (const b of L) if (!P.some((a) => normTitle(a.title) === normTitle(b.title))) next.push({ ...structuredClone(b), seq: next.length + 1 });
        card.axAttachments = next;
        card.axAttachment = next[0] ?? null;
        break;
      }
      default:
        if (w === "remove") {
          card[key] = emptySection(key, ledger[key]);
        } else card[key] = structuredClone(parsed[key]);
    }
    applied.push(key);
  }
  if (applied.length) {
    card.source = { file: opts.fileName ?? parsed.source?.file ?? null, kordocLine: parsed.source?.kordocLine ?? null };
    card.parseWarnings = [...(parsed.parseWarnings ?? [])];
    if (parsed.raw) card.raw = parsed.raw;
  }
  return { card, applied };
}

/** 지우기를 승인한 구역: 구조(머리글·열)는 두고 글만 비움 */
function emptySection(key: BlockKey, v: LooseJson): LooseJson {
  const c = structuredClone(v ?? {});
  switch (key) {
    case "kpi":
      return { ...c, rows: [], notes: [] };
    case "strategy":
      return { ...c, nationalAgenda: [], nationalAgendaText: null, esgText: null, ai: { checked: null, text: null } };
    case "act":
      return { ...c, findings: c.findings === null ? null : [], selfAssessment: [] };
    case "plan":
      return { ...c, items: [], sustainability: null, starLines: [], lines: [], grid: null };
    case "check":
      return { ...c, risks: [], monitoring: [], items: [], labels: {}, grid: null };
    case "outcome":
      return { ...c, quantitative: [], qualitative: [] };
    case "feedback":
    case "findings":
      return { ...c, rows: [] };
    default:
      return c;
  }
}

// ---------------------------------------------------------------------------
// 과제 매칭(지침 14 [2단계]: 과제명과 과제번호를 함께 대조)

export interface LedgerRef {
  id: string;
  group: string;
  taskNo: string;
  title: string;
}

export interface MatchResult {
  kind: "exact" | "uncertain" | "none";
  cardId: string | null;
  candidates: string[];
  reason: string | null;
}

export function matchCard(parsed: { group?: string | null; taskNo?: string | null; title?: string | null }, ledger: LedgerRef[]): MatchResult {
  const group = parsed.group && /^(주요사업|경영관리)\d+$/.test(parsed.group) ? parsed.group : null;
  const pool = group ? ledger.filter((c) => c.group === group) : ledger;
  const t = normTitle(parsed.title);
  const no = String(parsed.taskNo ?? "").trim();
  const exact = pool.filter((c) => c.taskNo === no && normTitle(c.title) === t);
  if (exact.length === 1) return { kind: "exact", cardId: exact[0].id, candidates: [exact[0].id], reason: null };
  if (exact.length > 1) return { kind: "uncertain", cardId: null, candidates: exact.map((c) => c.id), reason: "같은 과제명·번호의 카드가 여러 장" };

  const byTitle = t ? pool.filter((c) => normTitle(c.title) === t) : [];
  if (byTitle.length === 1) return { kind: "uncertain", cardId: byTitle[0].id, candidates: [byTitle[0].id], reason: `과제명은 같고 과제번호가 다름(파일 ${no || "없음"} · 원장 ${byTitle[0].taskNo})` };
  if (byTitle.length > 1) return { kind: "uncertain", cardId: null, candidates: byTitle.map((c) => c.id), reason: "같은 과제명의 카드가 여러 장" };

  const byNo = no ? pool.filter((c) => c.taskNo === no).sort((a, b) => titleSimilarity(parsed.title, b.title) - titleSimilarity(parsed.title, a.title)) : [];
  const likely = byNo.filter((c) => titleSimilarity(parsed.title, c.title) >= 0.5);
  if (byNo.length === 1 || likely.length === 1) {
    const c = likely[0] ?? byNo[0];
    return { kind: "uncertain", cardId: c.id, candidates: byNo.map((x) => x.id), reason: `과제번호는 같고 과제명이 다름(원장 「${c.title}」)` };
  }
  if (byNo.length > 1) return { kind: "uncertain", cardId: null, candidates: byNo.map((c) => c.id), reason: "같은 과제번호의 카드가 여러 사업에 있음(주요사업을 골라 주세요)" };
  return { kind: "none", cardId: null, candidates: [], reason: "카드 미존재 — 원장에 없는 과제" };
}
