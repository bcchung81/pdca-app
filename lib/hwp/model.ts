// 한글 문서(HWP 5 바이너리·HWPX) 공통 모델 — 원본 모양(글자·문단·표·그림·테두리·채우기)을 HTML로 옮기는 데 쓰는 값.
// hwp5.ts(바이너리)와 hwpx.ts(XML)가 같은 모양으로 읽어 내고, 카드 변환·원본 양식 렌더러가 이것만 봅니다. 입출력 없는 자료형.
//  · 길이: HWPUNIT(1/7200인치). 100 = 1pt, 75 = 1px(96dpi), 283.46 = 1mm
//  · 비율(장평·자간·상대 크기·글자 위치): %  · 색: #RRGGBB(없음은 null)
//  · 줄 배치(lineseg): 한글이 저장할 때 계산해 둔 줄마다의 시작 글자 위치·세로 위치·높이·폭 — 원본 줄바꿈을 그대로 알 수 있음

/** 글자 언어 7종(한글이 언어마다 글꼴·장평·자간·크기를 따로 둠) */
export const LANGS = ["hangul", "latin", "hanja", "japanese", "other", "symbol", "user"] as const;
export type Lang = (typeof LANGS)[number];

export interface CharPr {
  /** 기준 크기(HWPUNIT, 1000 = 10pt) */
  height: number;
  /** 언어별 글꼴 이름(LANGS 순서) */
  face: string[];
  /** 언어별 장평(%) */
  ratio: number[];
  /** 언어별 자간(%) */
  spacing: number[];
  /** 언어별 상대 크기(%) */
  relSize: number[];
  /** 언어별 글자 위치(%, 위로 +) */
  offset: number[];
  bold: boolean;
  italic: boolean;
  /** 밑줄: 없음·아래·위 */
  underline: "" | "BOTTOM" | "TOP";
  underlineColor: string | null;
  strike: boolean;
  strikeColor: string | null;
  supscript: boolean;
  subscript: boolean;
  outline: boolean;
  /** 그림자 종류(없음 "") */
  shadow: string;
  shadowColor: string | null;
  shadowX: number;
  shadowY: number;
  emboss: boolean;
  engrave: boolean;
  color: string;
  /** 음영(글자 뒤 배경색) */
  shade: string | null;
  kerning: boolean;
  useFontSpace: boolean;
  borderFill: number;
  /** 속성 원값(밑줄·취소선 모양·외곽선·그림자·강조점 — HWPX로 다시 쓸 때) */
  attr?: number;
}

export type Align = "JUSTIFY" | "LEFT" | "RIGHT" | "CENTER" | "DISTRIBUTE" | "DISTRIBUTE_SPACE";
export type LineSpacingType = "PERCENT" | "FIXED" | "BETWEEN_LINES" | "AT_LEAST";

export interface ParaPr {
  align: Align;
  /** 라틴 문자 줄나눔: 단어·하이픈·글자 */
  breakLatin: "KEEP_WORD" | "HYPHENATION" | "BREAK_WORD";
  /** 한글 줄나눔 — HWPX 이름 그대로이고 이름과 뜻이 반대: BREAK_WORD = 어절 단위, KEEP_WORD = 글자 단위(hwp5.ts paraShape 주석) */
  breakNonLatin: "KEEP_WORD" | "BREAK_WORD";
  /** 최소 공백(%, 0~75): 줄을 맞추려고 빈칸을 이만큼까지 줄일 수 있음 */
  condense: number;
  lineSpacingType: LineSpacingType;
  /** PERCENT면 %, 나머지는 HWPUNIT */
  lineSpacing: number;
  left: number;
  right: number;
  /** 첫 줄 들여쓰기(+)·내어쓰기(-) */
  indent: number;
  before: number;
  after: number;
  vertAlign: "BASELINE" | "TOP" | "CENTER" | "BOTTOM";
  snapToGrid: boolean;
  fontLineHeight: boolean;
  keepWithNext: boolean;
  borderFill: number;
  /** 문단 테두리 안쪽 간격(왼·오른·위·아래) */
  borderOffset: [number, number, number, number];
  tabDef: number;
  headingType: "NONE" | "OUTLINE" | "NUMBER" | "BULLET";
  /** 문단 머리 번호·글머리표 id(1부터) */
  headingId: number;
  /** 문단 머리 수준(0부터) */
  headingLevel: number;
  autoSpaceEAsianEng: boolean;
  autoSpaceEAsianNum: boolean;
  /** 줄 넘김: 보통 줄바꿈(BREAK — 없으면 이것)·자간을 줄여 한 줄로(SQUEEZE)·한 줄 그대로(KEEP). 읽을 때는 채우지 않음 */
  lineWrap?: "BREAK" | "SQUEEZE" | "KEEP";
}

export type LineType =
  | "NONE"
  | "SOLID"
  | "DASH"
  | "DOT"
  | "DASH_DOT"
  | "DASH_DOT_DOT"
  | "LONG_DASH"
  | "CIRCLE"
  | "DOUBLE_SLIM"
  | "SLIM_THICK"
  | "THICK_SLIM"
  | "SLIM_THICK_SLIM"
  | "WAVE"
  | "DOUBLE_WAVE"
  | "THICK_3D"
  | "THICK_3D_LIFTED"
  | "3D"
  | "3D_LIFTED";

export interface Border {
  type: LineType;
  /** mm */
  width: number;
  color: string;
}

export interface ImageFill {
  /** 채우기 방식(TOTAL = 크기에 맞춤, TILE… 등) */
  mode: string;
  bin: number;
  bright: number;
  contrast: number;
  effect: string;
}

export interface Gradation {
  /** 1 줄무늬(LINEAR) · 2 원(RADIAL) · 3 원뿔(CONICAL) · 4 사각(SQUARE) */
  type: number;
  angle: number;
  cx: number;
  cy: number;
  colors: string[];
  /** 번짐 정도 */
  step?: number;
  /** 번짐 중심(%) */
  stepCenter?: number;
  /** 색 위치(색이 셋 이상일 때) */
  positions?: number[];
}

export interface Fill {
  color: string | null;
  patternColor: string | null;
  /** 무늬 종류(-1·없음이면 무늬 없음) */
  pattern: number;
  image: ImageFill | null;
  gradation: Gradation | null;
  /** 투명도(0~255) */
  alpha?: number;
}

export interface BorderFill {
  left: Border;
  right: Border;
  top: Border;
  bottom: Border;
  diagonal: Border;
  fill: Fill | null;
}

export interface TabStop {
  /** HWPUNIT(파일의 2배 값을 반으로) */
  pos: number;
  kind: "LEFT" | "RIGHT" | "CENTER" | "DECIMAL";
  leader: number;
}
export interface TabDef {
  autoLeft: boolean;
  autoRight: boolean;
  stops: TabStop[];
}

/** 문단 머리(글머리표·번호) 모양 */
export interface ParaHead {
  align: "LEFT" | "CENTER" | "RIGHT";
  /** 번호 너비를 실제 글자 폭에 맞춤 */
  instWidth: boolean;
  /** 자동 내어쓰기: 둘째 줄부터 본문 시작 위치에 맞춤 */
  autoIndent: boolean;
  widthAdjust: number;
  /** 본문과의 거리(textOffsetPercent면 글자 크기의 %, 아니면 HWPUNIT) */
  textOffset: number;
  textOffsetPercent: boolean;
  /** 번호 모양(0 1,2,3 · 8 가,나,다 …) */
  numFormat: number;
  /** 머리 글자 모양 id(-1이면 문단 첫 글자 모양) */
  charPr: number;
}
export interface Bullet {
  head: ParaHead;
  char: string;
}
export interface Numbering {
  levels: { head: ParaHead; format: string }[];
  start: number;
  /** 수준별 시작 번호(없으면 1, 첫 수준은 start) */
  starts?: number[];
}

export interface BinItem {
  id: number;
  ext: string;
  data: Uint8Array | null;
}

export interface LineSeg {
  textpos: number;
  vertpos: number;
  vertsize: number;
  textheight: number;
  baseline: number;
  spacing: number;
  horzpos: number;
  horzsize: number;
  flags: number;
}

/** 개체 위치(표·그림·도형 공통) */
export interface ObjPos {
  treatAsChar: boolean;
  affectLineSpacing: boolean;
  vertRelTo: "PAPER" | "PAGE" | "PARA";
  horzRelTo: "PAPER" | "PAGE" | "COLUMN" | "PARA";
  vertAlign: "TOP" | "CENTER" | "BOTTOM" | "INSIDE" | "OUTSIDE";
  horzAlign: "LEFT" | "CENTER" | "RIGHT" | "INSIDE" | "OUTSIDE";
  vertOffset: number;
  horzOffset: number;
  width: number;
  height: number;
  wrap: "SQUARE" | "TOP_AND_BOTTOM" | "BEHIND_TEXT" | "IN_FRONT_OF_TEXT";
  zOrder: number;
  /** 바깥 여백(왼·오른·위·아래) */
  outMargin: [number, number, number, number];
  // ── 아래는 HWPX로 다시 쓸 때 쓰는 원본 값(없으면 기본값)
  /** 쪽 영역 안으로 제한 */
  flowWithText?: boolean;
  /** 다른 개체와 겹침 허용 */
  allowOverlap?: boolean;
  widthRelTo?: "PAPER" | "PAGE" | "COLUMN" | "PARA" | "ABSOLUTE";
  heightRelTo?: "PAPER" | "PAGE" | "ABSOLUTE";
  /** 크기 보호 */
  protect?: boolean;
  textFlow?: "BOTH_SIDES" | "LEFT_ONLY" | "RIGHT_ONLY" | "LARGEST_ONLY";
  numberingType?: "NONE" | "PICTURE" | "TABLE" | "EQUATION";
  /** 개체 설명(한글이 붙이는 「그림입니다.」 등) */
  comment?: string;
}

/**
 * 그리기 개체 모양 정보(원본 값 그대로): 만들 때 크기·뒤집기·회전·변환 행렬.
 * 행렬은 6개 값(e1..e6: [e1 e2 e3; e4 e5 e6])이고 이동 1개 + (크기, 회전) 쌍 — 묶음 속 개체는 바깥 묶음 것까지 함께 적힘
 */
export interface ShapeGeo {
  orgW: number;
  orgH: number;
  flipH: boolean;
  flipV: boolean;
  angle: number;
  cx: number;
  cy: number;
  trans: number[];
  pairs: [number[], number[]][];
  groupLevel: number;
}

export interface Cell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  width: number;
  height: number;
  /** 안 여백(왼·오른·위·아래). 칸이 따로 지정하지 않았으면 표의 기본 안 여백 */
  margin: [number, number, number, number];
  /** 칸이 안 여백을 따로 지정함 */
  ownMargin: boolean;
  borderFill: number;
  vertAlign: "TOP" | "CENTER" | "BOTTOM";
  paras: Para[];
  /** 제목 칸(쪽이 넘어가면 반복) */
  header?: boolean;
  /** 칸 보호 */
  protect?: boolean;
  /** 화면용: 칸 내용(.hw-cc)에 더할 속성 */
  attrs?: string;
}

/** 칸 묶음 영역의 테두리/배경(여러 칸에 걸친 채우기) */
export interface CellZone {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
  borderFill: number;
}

export interface Table {
  kind: "table";
  pos: ObjPos;
  rows: number;
  cols: number;
  cellSpacing: number;
  inMargin: [number, number, number, number];
  borderFill: number;
  /** 쪽 넘김: 나누지 않음·칸 단위·나눔 */
  pageBreak: "NONE" | "CELL" | "TABLE";
  repeatHeader: boolean;
  cells: Cell[];
  zones?: CellZone[];
}

export interface Pic {
  kind: "pic";
  pos: ObjPos;
  /** 묶음 안에서의 위치(묶음의 자식일 때) */
  x?: number;
  y?: number;
  /** 원래 그림 크기 */
  orgW: number;
  orgH: number;
  /** 문서에 보이는 크기 */
  curW: number;
  curH: number;
  /** 자르기(왼·위·오른·아래, 원래 크기 기준 HWPUNIT) */
  crop: [number, number, number, number];
  inMargin: [number, number, number, number];
  bin: number;
  borderColor: string | null;
  borderWidth: number;
  bright: number;
  contrast: number;
  effect: string;
  /** 그림 영역 네 점(원래 크기 기준) */
  imgRect?: [number, number][];
  /** 원본 그림 크기(HWPUNIT) */
  imgDim?: [number, number];
  geo?: ShapeGeo;
}

export interface LineStyle {
  color: string | null;
  /** HWPUNIT */
  width: number;
  type: LineType;
  /** 속성 원값(끝 모양·화살표) · 외곽선 방식(0 보통·1 바깥·2 안) */
  attr?: number;
  outline?: number;
}

export interface TextBox {
  margin: [number, number, number, number];
  vertAlign: "TOP" | "CENTER" | "BOTTOM";
  paras: Para[];
  /** 글상자 글 폭(마지막으로 잰 값) */
  lastWidth?: number;
}

export interface Shape {
  kind: "rect" | "ellipse" | "line" | "polygon" | "curve" | "arc" | "container" | "ole" | "equation" | "unknown";
  pos: ObjPos;
  curW: number;
  curH: number;
  /** 묶음 안에서의 위치 */
  x: number;
  y: number;
  line: LineStyle | null;
  fill: Fill | null;
  /** 둥근 모서리(%) */
  round: number;
  shadow: { type: number; color: string | null; x: number; y: number; alpha?: number } | null;
  text: TextBox | null;
  /** 묶음(container)의 자식: 도형·그림 */
  children: (Shape | Pic)[];
  /** 선·다각형·곡선 점(만들 때 크기 기준 — geo.orgW·orgH) */
  points: [number, number][];
  /** 곡선 조각 종류(0 직선·1 곡선) */
  segs?: number[];
  /** 사각형 네 모서리(만들 때 크기 기준) */
  corners?: [number, number][];
  geo?: ShapeGeo;
}

export type Obj = Table | Pic | Shape;

/** 문단 안 요소. pos = 한글 글자 위치(줄 배치 textpos와 같은 셈: 조종 문자는 8칸) */
export type Inline =
  /** attrs: 화면용 — 이 글자 조각을 따로 감쌀 속성(체크 상자 토글 등). raw: 파일에 쓸 원본 글자(화면 글과 빈칸·기호 종류만 다를 때) */
  | { kind: "text"; pos: number; text: string; charPr: number; attrs?: string; raw?: string }
  | { kind: "tab"; pos: number; charPr: number; width: number; leader: number; tabKind: number }
  | { kind: "br"; pos: number; charPr: number }
  | { kind: "obj"; pos: number; charPr: number; obj: Obj }
  /** 글자 겹침: 여러 글자를 한 칸에 겹쳐 그림(예: ∙ + 전각 빈칸 → 글머리 한 칸). border 0 없음 · 1 원 · 2 반전 원 · 3 사각형 · 4 반전 사각형 */
  | { kind: "compose"; pos: number; charPr: number; chars: string; border: number; size: number; spread: number; charPrs: number[] }
  // ── 아래는 화면용 표시(파일에 없음): 카드 화면이 원본 글자 자리에 카드 JSON 글을 얹을 때 씀
  /** 원본 글자를 모양만 보임(편집 글에 들지 않음 — 줄 앞 빈칸·기호 글꼴 글머리 등) */
  | { kind: "gen"; pos: number; charPr: number; text: string; attrs?: string }
  /** 편집 글에만 있는 글자(폭 없음 — 강제 줄바꿈 자리의 빈칸 등) */
  | { kind: "zero"; pos: number; charPr: number; text: string };

/** 화면용 표시(파일에 없음): 카드 화면이 문단·칸에 다는 속성과 그리는 방식 */
export interface RenderHints {
  /** 문단(.hw-p)에 더할 속성(data-p·contenteditable 등, 앞에 빈칸) */
  attrs?: string;
  /** 문단(.hw-p)에 더할 class */
  cls?: string;
  /** 문단 글만 감쌀 속성(줄 앞 개체 — 글상자·표 — 는 감싸지 않음: 그 안 글은 따로 편집 칸) */
  textAttrs?: string;
  /** 조각(강제 줄바꿈으로 나뉜 줄 묶음)마다 감쌀 속성(null이면 감싸지 않음) */
  segAttrs?: (string | null)[];
  /** 글이 원본과 달라 원본 줄 배치를 못 씀: 같은 모양으로 흘려 그림 */
  flow?: boolean;
  /** 한 줄 문단의 글만 바꿈: 화면은 원본 줄 칸에 그리되, 한글 파일에는 줄 배치를 쓰지 않음(한글이 다시 조판) */
  relaid?: boolean;
  /** 문단 머리 글을 편집 글로(JSON이 번호 글을 본문에 적은 경우) */
  headText?: boolean;
  /** 쪽 보기에서 자른 문단 조각의 뒤 줄이 다음 쪽에 이어짐 — 조각의 끝 줄도 문단 끝 줄이 아님(양쪽 정렬로 늘림) */
  more?: boolean;
}

export interface Para extends RenderHints {
  paraPr: number;
  style: number;
  items: Inline[];
  lines: LineSeg[];
  /** 문단 글자 수(한글 셈, 문단 끝 포함) */
  length: number;
  /** 쪽·단 나누기 앞에서 시작 */
  pageBreak: boolean;
  /** 문단 머리 글자(글머리표 문자 또는 번호 글) — resolveHeads가 문서 순서대로 채움 */
  head?: string;
  /** 문단 끝(문단 나눔 글자)의 글자 모양 — 문단 머리·빈 문단 높이에 씀 */
  endCharPr?: number;
}

export interface PageDef {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  header: number;
  footer: number;
  gutter: number;
  landscape: boolean;
  /** 제본: 한쪽(LEFT_ONLY — 없으면 이것)·맞쪽(LEFT_RIGHT — 왼쪽 여백 = 안쪽, 오른쪽 = 바깥쪽)·위로(TOP_BOTTOM). 읽을 때는 채우지 않음 */
  gutterType?: "LEFT_ONLY" | "LEFT_RIGHT" | "TOP_BOTTOM";
}

/** 머리말·꼬리말: 적용 쪽, 칸 안 세로 정렬, 문단(쪽 번호 자동 번호는 data-hw-field="page" 자리표시 글자) */
export interface HeadFoot {
  applyTo: "BOTH" | "EVEN" | "ODD";
  vertAlign: "TOP" | "CENTER" | "BOTTOM";
  paras: Para[];
}

/** 쪽 번호 위치(pgnp): 자리(0 없음 · 1~3 위 왼·가운데·오른 · 4~6 아래 왼·가운데·오른 · 7~10 바깥·안쪽), 번호 모양, 장식 문자 */
export interface PageNumPos {
  position: number;
  format: number;
  prefix: string;
  suffix: string;
  dash: string;
  /** 번호 글자 모양(문서 기본 글자 모양) */
  charPr: number;
  /** 이 조종이 든 최상위 문단 번호(그 쪽부터 적용) */
  para?: number;
}

export interface Section {
  page: PageDef | null;
  paras: Para[];
  header?: HeadFoot;
  footer?: HeadFoot;
  pageNum?: PageNumPos;
}

/** 글꼴 정보(파일에 적힌 것): 기본 글꼴 이름(영문 등 다른 이름)·대체 글꼴 */
export interface FaceInfo {
  defaultName: string | null;
  alt: string | null;
}

export interface HwpDoc {
  format: "hwp" | "hwpx";
  /** 글꼴 이름 → 파일에 적힌 다른 이름·대체 글꼴 */
  faces: Record<string, FaceInfo>;
  charPrs: CharPr[];
  paraPrs: ParaPr[];
  /** borderFill id(1부터) → 값. [0]은 비워 둠 */
  borderFills: (BorderFill | null)[];
  tabDefs: TabDef[];
  /** 글머리표(id 1부터 → [id-1]) */
  bullets: Bullet[];
  /** 번호(id 1부터 → [id-1]) */
  numberings: Numbering[];
  /** 그림 id → 형식·바이트 */
  bins: Map<number, BinItem>;
  sections: Section[];
}

export class HwpReadError extends Error {}

/** 글자가 속한 언어(한글이 글꼴 설정을 고를 때 쓰는 갈래). 빈칸은 한글로 셈 */
export function langOf(cp: number): number {
  if (cp === 0x20 || cp === 0xa0 || cp === 0x3000) return 0;
  if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f) || (cp >= 0xa960 && cp <= 0xa97f) || (cp >= 0xd7b0 && cp <= 0xd7ff)) return 0;
  if (cp < 0x80 || (cp >= 0x80 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff)) return 1;
  if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x20000 && cp <= 0x2ffff)) return 2;
  if ((cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x31f0 && cp <= 0x31ff)) return 3;
  if ((cp >= 0x370 && cp <= 0x3ff) || (cp >= 0x400 && cp <= 0x52f) || (cp >= 0x590 && cp <= 0x6ff) || (cp >= 0xe00 && cp <= 0xe7f)) return 4;
  return 5;
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const HANGUL_SYL = "가나다라마바사아자차카타파하";
const HANGUL_JAMO = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";
const HANGUL_NUM = ["일", "이", "삼", "사", "오", "육", "칠", "팔", "구", "십"];
const IDEO = "一二三四五六七八九十";
function roman(n: number): string {
  const t: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, r] of t)
    while (n >= v) {
      out += r;
      n -= v;
    }
  return out;
}
/** 번호 모양대로 숫자 → 글(한글 번호 모양 표) */
export function formatNumber(n: number, fmt: number): string {
  const at = (s: string) => [...s][(n - 1) % [...s].length] ?? String(n);
  switch (fmt) {
    case 1:
      return at(CIRCLED);
    case 2:
      return roman(n);
    case 3:
      return roman(n).toLowerCase();
    case 4:
      return String.fromCharCode(64 + (((n - 1) % 26) + 1));
    case 5:
      return String.fromCharCode(96 + (((n - 1) % 26) + 1));
    case 8:
      return at(HANGUL_SYL);
    case 10:
      return at(HANGUL_JAMO);
    case 12:
      return HANGUL_NUM[(n - 1) % 10];
    case 13:
      return at(IDEO);
    default:
      return String(n);
  }
}

/** 번호 수준의 시작 번호(한글: 수준이 새로 시작할 때 이 번호부터) */
export function levelStart(nb: Numbering, lv: number): number {
  return Math.max(1, nb.starts?.[lv] ?? (lv === 0 ? nb.start : 1));
}

/** 번호 형식(^1. 등)에 수준별 번호를 넣은 글(아직 세지 않은 수준은 시작 번호) */
export function headText(nb: Numbering, lv: number, counters: number[]): string {
  const fmt = nb.levels[lv];
  return fmt.format.replace(/\^(\d)/g, (_m, d) => {
    const k = Number(d) - 1;
    const lvHead = nb.levels[k]?.head ?? fmt.head;
    return formatNumber(counters[k] || levelStart(nb, k), lvHead.numFormat);
  });
}

/** 문단 머리 글자를 문서 순서대로 채움: 글머리표는 그 문자, 개요·번호는 수준별 번호를 세어 형식(^1. 등)에 넣음 */
export function resolveHeads(doc: HwpDoc): void {
  const counters = new Map<number, number[]>();
  const visit = (ps: Para[]) => {
    for (const p of ps) {
      const pp = doc.paraPrs[p.paraPr];
      if (pp && pp.headingType === "BULLET") {
        const b = doc.bullets[pp.headingId - 1];
        if (b) p.head = b.char;
      } else if (pp && (pp.headingType === "OUTLINE" || pp.headingType === "NUMBER")) {
        const id = pp.headingType === "OUTLINE" ? pp.headingId || 1 : pp.headingId;
        const nb = doc.numberings[id - 1];
        if (nb) {
          const lv = Math.min(pp.headingLevel, nb.levels.length - 1);
          const cs = counters.get(id) ?? Array(10).fill(0);
          cs[lv] = cs[lv] ? cs[lv] + 1 : levelStart(nb, lv);
          for (let k = lv + 1; k < cs.length; k++) cs[k] = 0;
          counters.set(id, cs);
          p.head = headText(nb, lv, cs);
        }
      }
      for (const it of p.items) {
        if (it.kind !== "obj") continue;
        const o = it.obj;
        if (o.kind === "table") for (const c of o.cells) visit(c.paras);
        else if (o.kind !== "pic" && o.text) visit(o.text.paras);
      }
    }
  };
  for (const s of doc.sections) visit(s.paras);
}
