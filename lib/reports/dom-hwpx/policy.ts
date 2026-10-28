// 경평 초안 「한글 내려받기(화면 그대로)」의 판정(입출력 없는 순수 함수 — 2026-10-28). 브라우저(내려받기 단추)와 서버(라우트) 둘 다 씀.
//  · 스냅숏 검사(validateSnapshot): 판(version)·본문 틀 폭(170±0.5mm)·노드 수·깊이·글 길이·그림(PNG 서명·IHDR 크기·픽셀 수)·<img> 주소 모양 — 변환기가 믿고 읽는 모양인지
//  · 라우트 판정(parseDomHwpxPost → judgeDomHwpx): 401 로그인 없음 · 413 본문 2MB 넘음 · 400 JSON·스냅숏·글꼴 막힘 · 404 카드·초안 없음 · 409 초안이 바뀜
//    과제관리카드(app/(app)/cards/[uid]/hwpx POST)는 같은 순서로 judgeSnapshotPost(본문 틀 폭 = 카드 쪽 본문 폭, 글꼴 정책 없음)
//  · 글꼴 정책(fontGate): 화면 글꼴 표지(<html data-kfont>)에 본문(body)·돋움(dotum)이 없으면 막음, 라벨(label)·제목(head)만 없으면 경고 후 진행
//  · 판면 넘침(overflowMm): 화면 본문 틀 높이 − 쪽 수 × 쪽 본문 높이(주요사업 — 분량 쪽 수를 올림, 1쪽 이상). 경영관리는 여러 쪽이 정상이라 재지 않음
//  · 흉내 자간 되돌리기 표(spacingUndoFor): 빠진 갈래의 별칭과 화면이 건 흉내 자간(em) — 변환기 옵션(convert.ts spacingUndo)
// 무거운 모듈(변환기·한글 쓰기·판면 어림)은 import하지 않음 — 브라우저 묶음에 들어감

import { FONT_SPACING, type FontMark, REPORT_FONTS } from "../report-fonts.ts";
import { PICTURE_URL_MAX } from "./pictures.ts";
import type { LayoutSnapshot } from "./snapshot.ts";

/** 경평 초안 쪽 본문(mm) — section-hwpx.ts REPORT_PAGE_MM에서 나온 값과 같음(policy.test.ts가 대조) */
export const REPORT_BODY_MM = { w: 170, h: 255 } as const;
/** 본문 틀 폭 허용 오차(mm) */
export const FRAME_TOL_MM = 0.5;
/** 요청 본문 상한(byte — gzip 본문이면 줄인 크기) */
export const DOM_HWPX_MAX_BYTES = 2 * 1024 * 1024;
/** gzip 본문(과제관리카드 — 스냅숏이 수 MB라 브라우저가 CompressionStream으로 줄여 보냄)의 형식과 풀린 크기 상한(byte) */
export const DOM_HWPX_GZIP_TYPE = "application/gzip";
export const DOM_HWPX_MAX_INFLATED = 32 * 1024 * 1024;
/** 스냅숏 상한: 노드 수·깊이·틀 높이(mm)·글 마디 하나의 글자 수·그림 수·그림 한 변(px)·그림 픽셀 수 */
export const SNAP_LIMITS = { nodes: 20000, depth: 64, frameH: REPORT_BODY_MM.h * 40, text: 100000, images: 200, side: 8192, pixels: 4096 * 4096 } as const;
/** 응답 머리: 화면 기준 넘친 mm(넘치지 않으면 없음) */
export const OVERFLOW_HEADER = "x-hwpx-overflow-mm";
/** 표지 없는 사본 HTML(?for=hwpx)에 라우트가 넣는 초안 판(updated_at) meta 이름 */
export const DRAFT_VERSION_META = "kca-draft-version";
/** 여러 쪽 초안에서 맨 위 표를 쪽 경계에서 나눌 수 있게 할 높이(mm) — 쪽 본문의 1/4(이보다 낮은 표는 통째로 다음 쪽으로 넘어감) */
export const MULTI_PAGE_SPLIT_MM = REPORT_BODY_MM.h / 4;

// ───────────────────────── 스냅숏 검사

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";
const isRect = (x: unknown) => isObj(x) && isNum(x.x) && isNum(x.y) && isNum(x.w) && isNum(x.h);
const STYLE_STR = ["display", "position", "bg", "bgImage", "radius", "shadow", "clipPath", "fontFamily", "fontStyle", "color", "textAlign", "textAlignLast", "textJustify", "verticalAlign", "textDecoration", "whiteSpace", "wordBreak"] as const;
const STYLE_NUM = ["opacity", "fontSize", "fontWeight", "letterSpacing", "wordSpacing", "textIndent"] as const;
const STYLE_OPT_STR = ["bgSize", "bgPosition", "bgRepeat"] as const;
function isStyle(x: unknown): boolean {
  if (!isObj(x)) return false;
  if (!STYLE_STR.every((k) => isStr(x[k])) || !STYLE_NUM.every((k) => isNum(x[k]))) return false;
  if (!STYLE_OPT_STR.every((k) => x[k] === undefined || isStr(x[k]))) return false;
  if (!(x.lineHeight === null || isNum(x.lineHeight))) return false;
  const b = x.border;
  if (!Array.isArray(b) || b.length !== 4 || !b.every((s) => isObj(s) && isNum(s.w) && isStr(s.style) && isStr(s.color))) return false;
  const p = x.pad;
  return Array.isArray(p) && p.length === 4 && p.every(isNum);
}
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** PNG base64 → 서명·IHDR 너비·높이 확인(앞 33바이트만 풂) */
function pngOk(b64: string, w: number, h: number): boolean {
  if (b64.length < 44 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return false;
  let head: string;
  try {
    head = atob(b64.slice(0, 44));
  } catch {
    return false;
  }
  const at = (i: number) => head.charCodeAt(i);
  if (!PNG_SIG.every((v, i) => at(i) === v) || head.slice(12, 16) !== "IHDR") return false;
  const u32 = (i: number) => ((at(i) << 24) >>> 0) + (at(i + 1) << 16) + (at(i + 2) << 8) + at(i + 3);
  return u32(16) === w && u32(20) === h;
}

export type SnapCheck = { ok: true; snap: LayoutSnapshot } | { ok: false; reason: string };

/** 스냅숏 검사(변환기가 믿고 읽을 모양인지). frameW = 쪽 본문 폭(mm) */
export function validateSnapshot(x: unknown, frameW: number = REPORT_BODY_MM.w): SnapCheck {
  const no = (reason: string): SnapCheck => ({ ok: false, reason });
  if (!isObj(x)) return no("스냅숏이 객체가 아님");
  if (x.version !== 1) return no("스냅숏 판이 1이 아님");
  const f = x.frame;
  if (!isObj(f) || !isNum(f.w) || !isNum(f.h)) return no("본문 틀 크기 없음");
  if (Math.abs(f.w - frameW) > FRAME_TOL_MM) return no(`본문 틀 폭 ${f.w.toFixed(1)}mm ≠ ${frameW}mm(±${FRAME_TOL_MM})`);
  if (f.h <= 0 || f.h > SNAP_LIMITS.frameH) return no(`본문 틀 높이 ${f.h.toFixed(1)}mm가 범위 밖`);
  if (x.fontMark !== undefined && !(isStr(x.fontMark) && x.fontMark.length <= 200)) return no("글꼴 표지가 글이 아님");
  let nodes = 0;
  let images = 0;
  let bad: string | null = null;
  const pseudoOk = (p: unknown) => p === undefined || (isObj(p) && isStr(p.text) && p.text.length <= SNAP_LIMITS.text && isStyle(p.style) && (p.rect === null || isRect(p.rect)));
  const walk = (n: unknown, depth: number): void => {
    if (bad) return;
    nodes += 1;
    if (nodes > SNAP_LIMITS.nodes) {
      bad = `노드가 ${SNAP_LIMITS.nodes}개를 넘음`;
      return;
    }
    if (depth > SNAP_LIMITS.depth) {
      bad = `깊이가 ${SNAP_LIMITS.depth}을 넘음`;
      return;
    }
    if (!isObj(n)) {
      bad = "노드가 객체가 아님";
      return;
    }
    if (n.kind === "br") return;
    if (n.kind === "text") {
      if (!isStr(n.text) || n.text.length > SNAP_LIMITS.text) bad = "글 마디의 글이 없거나 너무 김";
      else if (!Array.isArray(n.frags) || !n.frags.every((g) => isRect(g) && isNum((g as { at: unknown }).at))) bad = "글 마디의 줄 조각이 잘못됨";
      return;
    }
    if (n.kind !== "box") {
      bad = "모르는 노드 종류";
      return;
    }
    if (!isStr(n.tag) || !isRect(n.rect) || !isStyle(n.style) || !Array.isArray(n.children)) {
      bad = "상자 노드 모양이 잘못됨";
      return;
    }
    if (!pseudoOk(n.before) || !pseudoOk(n.after)) {
      bad = "의사요소 모양이 잘못됨";
      return;
    }
    if (n.replaced !== undefined && !isStr(n.replaced)) {
      bad = "대체 대상 종류가 글이 아님";
      return;
    }
    const src = n.src;
    if (src !== undefined && !(isObj(src) && isStr(src.url) && src.url.length <= PICTURE_URL_MAX && (src.clip === undefined || isRect(src.clip)))) {
      bad = "그림 주소 모양이 잘못됨";
      return;
    }
    const im = n.image;
    if (im !== undefined) {
      images += 1;
      if (images > SNAP_LIMITS.images) {
        bad = `그림이 ${SNAP_LIMITS.images}개를 넘음`;
        return;
      }
      if (!isObj(im) || !isStr(im.png) || !Number.isInteger(im.w) || !Number.isInteger(im.h)) {
        bad = "그림 모양이 잘못됨";
        return;
      }
      const w = im.w as number;
      const h = im.h as number;
      if (w < 1 || h < 1 || w > SNAP_LIMITS.side || h > SNAP_LIMITS.side || w * h > SNAP_LIMITS.pixels) {
        bad = `그림 크기 ${w}×${h}px가 범위 밖`;
        return;
      }
      if (!pngOk(im.png, w, h)) {
        bad = "그림이 PNG가 아니거나 크기가 맞지 않음";
        return;
      }
    }
    for (const c of n.children) walk(c, depth + 1);
  };
  if (!isObj(x.root) || x.root.kind !== "box") return no("뿌리 노드가 상자가 아님");
  walk(x.root, 1);
  if (bad) return no(bad);
  return { ok: true, snap: x as unknown as LayoutSnapshot };
}

// ───────────────────────── 글꼴 정책

/** 없으면 막는 갈래(본문·돋움 — 줄바꿈이 크게 달라짐) · 없으면 경고만 하는 갈래(라벨·제목) */
export const FONT_REQUIRED: readonly FontMark[] = ["body", "dotum"];
export const FONT_OPTIONAL: readonly FontMark[] = ["label", "head"];
/** 갈래 이름(화면 문구) — 도움말 「이 PC 상태」(report-font-status.tsx)와 같은 이름 */
export const FONT_GROUP_NAME: Record<FontMark, string> = { body: "KoPub바탕(본문)", dotum: "KoPub돋움(굵은 글·제목 일부)", label: "맑은 고딕(표 머리·라벨)", head: "HY헤드라인M(제목)" };

const marksOf = (mark: string | undefined) => new Set((mark ?? "").split(/\s+/).filter(Boolean));
/** 글꼴 표지 → 막는 갈래(blocked — 하나라도 있으면 화면 그대로 내려받기를 막음)·경고 갈래(warned) */
export function fontGate(mark: string | undefined): { blocked: FontMark[]; warned: FontMark[] } {
  const on = marksOf(mark);
  return { blocked: FONT_REQUIRED.filter((k) => !on.has(k)), warned: FONT_OPTIONAL.filter((k) => !on.has(k)) };
}

/** 빠진 갈래의 흉내 자간 되돌리기 표: 갈래 별칭 + 그 갈래 자간 변수(--k-ls…, 낱말 간격 --k-ws는 뺌)의 표지 없을 때 값(em) */
export function spacingUndoFor(mark: string | undefined): { family: string; em: number[] }[] {
  const on = marksOf(mark);
  return (Object.keys(FONT_SPACING.real) as FontMark[])
    .filter((k) => !on.has(k))
    .map((k) => ({
      family: REPORT_FONTS[k].alias,
      em: Object.keys(FONT_SPACING.real[k])
        .filter((v) => v.startsWith("--k-ls"))
        .map((v) => parseFloat(FONT_SPACING.base[v as keyof typeof FONT_SPACING.base])),
    }))
    .filter((u) => u.em.length > 0);
}

// ───────────────────────── 판면 넘침·쪽 나눔

/** 판면 넘침을 재는 한도(mm): 주요사업 = 분량 쪽 수를 올림한 쪽(1쪽 이상) × 쪽 본문 높이, 경영관리 = 없음(여러 쪽이 정상) */
export function overflowLimitMm(o: { mg: boolean; module: number }): number | null {
  if (o.mg) return null;
  return Math.max(1, Math.ceil(o.module || 1)) * REPORT_BODY_MM.h;
}
/** 화면 기준 넘친 mm(소수 한 자리, 넘치지 않거나 한도가 없으면 0) */
export function overflowMm(frameH: number, limitMm: number | null): number {
  if (limitMm === null) return 0;
  return Math.max(0, Math.round((frameH - limitMm) * 10) / 10);
}
/** 맨 위 표 나눔 높이: 여러 쪽 초안(경영관리·2쪽 이상 분량)이면 쪽 본문의 1/4, 한 쪽 초안이면 없음(변환기 기본 — 쪽 본문보다 높은 표만) */
export function splitOverFor(o: { mg: boolean; module: number }): number | undefined {
  const limit = overflowLimitMm(o);
  return limit === null || limit > REPORT_BODY_MM.h ? MULTI_PAGE_SPLIT_MM : undefined;
}

// ───────────────────────── 라우트 판정

export type Refusal = { ok: false; status: 400 | 401 | 404 | 409 | 413; message: string };
export interface DomHwpxBody {
  version: string;
  snapshot: unknown;
}

/** 요청 단계 판정: 로그인 → 본문 크기 → JSON 모양({ version: 글, snapshot }) */
export function parseDomHwpxPost(o: { authed: boolean; tooLarge: boolean; text: string | null }): Refusal | { ok: true; body: DomHwpxBody } {
  if (!o.authed) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (o.tooLarge || o.text === null) return { ok: false, status: 413, message: `화면 배치 자료가 ${DOM_HWPX_MAX_BYTES / 1024 / 1024}MB를 넘습니다.` };
  let body: unknown;
  try {
    body = JSON.parse(o.text);
  } catch {
    return { ok: false, status: 400, message: "요청 본문이 JSON이 아닙니다." };
  }
  if (!isObj(body) || !isStr(body.version) || !body.version || body.snapshot === undefined) return { ok: false, status: 400, message: "요청에 초안 판(version)과 화면 배치(snapshot)가 있어야 합니다." };
  return { ok: true, body: { version: body.version, snapshot: body.snapshot } };
}

/**
 * 대상 단계 판정(경평 초안·과제관리카드 공통 — 2026-10-28 일반화): 대상 있음(version null이면 404) → 같은 판(409) → 스냅숏 검사(400, 본문 틀 폭 frameW)
 * → 글꼴 막힘(400 — fonts일 때만: 경평 초안 글꼴 정책. 카드는 한글 원본 글꼴을 그대로 써서 재지 않음). 문구(missing·changed)는 부르는 쪽이 정함
 */
export function judgeSnapshotPost(o: { body: DomHwpxBody; version: string | null; frameW: number; fonts?: boolean; missing?: string; changed?: string }): Refusal | { ok: true; snap: LayoutSnapshot; warned: FontMark[] } {
  if (o.version === null) return { ok: false, status: 404, message: o.missing ?? "내려받을 대상이 없습니다." };
  if (o.body.version !== o.version) return { ok: false, status: 409, message: o.changed ?? "화면을 연 뒤 내용이 바뀌었습니다. 새로고침한 뒤 다시 내려받으세요." };
  const v = validateSnapshot(o.body.snapshot, o.frameW);
  if (!v.ok) return { ok: false, status: 400, message: `화면 배치 자료를 읽을 수 없습니다(${v.reason}).` };
  if (!o.fonts) return { ok: true, snap: v.snap, warned: [] };
  const gate = fontGate(v.snap.fontMark);
  if (gate.blocked.length) return { ok: false, status: 400, message: `이 PC에 ${gate.blocked.map((k) => FONT_GROUP_NAME[k]).join("·")} 글꼴이 없어 화면 그대로 내려받을 수 없습니다.` };
  return { ok: true, snap: v.snap, warned: gate.warned };
}

/** 초안 단계 판정: 카드·초안 있음(draftVersion null이면 404) → 같은 판(409) → 스냅숏 검사(400) → 글꼴 막힘(400). 통과하면 스냅숏·넘친 mm·경고 갈래 */
export function judgeDomHwpx(o: { body: DomHwpxBody; draftVersion: string | null; limitMm: number | null }): Refusal | { ok: true; snap: LayoutSnapshot; overflowMm: number; warned: FontMark[] } {
  const v = judgeSnapshotPost({ body: o.body, version: o.draftVersion, frameW: REPORT_BODY_MM.w, fonts: true, missing: "초안이 없습니다.", changed: "화면을 연 뒤 초안이 바뀌었습니다. 새로고침한 뒤 다시 내려받으세요." });
  if (!v.ok) return v;
  return { ...v, overflowMm: overflowMm(v.snap.frame.h, o.limitMm) };
}
