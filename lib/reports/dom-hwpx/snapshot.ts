// 화면 배치 스냅숏(시험판 — 2026-10-28): 브라우저가 실제로 그린 본문 틀 아래 요소의 상자 위치·계산된 스타일·글 줄 조각을 적은 JSON 자료형.
// 추출기(extract.ts — 브라우저 DOM API만)가 만들고, 변환기(convert.ts — 입출력 없는 순수 함수)가 한글 모델로 옮깁니다. 입출력 없는 자료형만 둡니다.
//  · 길이: mm(본문 틀 왼쪽 위가 원점, 화면 확대·축소를 걷은 값) · 글자 크기·자간·줄 높이: pt
//  · 색·테두리 종류·표시 방식 같은 CSS 값은 브라우저 계산값 문자열 그대로(해석은 변환기가 함)
//  · SVG는 브라우저가 그린 PNG(base64)를 함께 담음(추출기가 SVG 직렬화 → Image → canvas로 그림)
//  · <img>는 그림 주소(currentSrc)와 보이는 자리(조상이 잘라 낸 부분)만 담고 바이트는 싣지 않음 — 배경 그림 주소는 style.bgImage의 url(…)에 그대로.
//    바이트는 서버가 허용한 주소만 저장소에서 받음(pictures.ts)
//  · 블록 종류·화면 클래스 이름은 담지 않음 — 변환기는 기하와 계산된 CSS만 봄

/** 상자 위치·크기(mm, 본문 틀 기준) */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 테두리 한 변: 굵기(mm — 브라우저 계산값 그대로), 종류(solid·dashed …), 색(계산값 문자열) */
export interface SnapBorderSide {
  w: number;
  style: string;
  color: string;
}

/** 계산된 스타일 일부 */
export interface SnapStyle {
  display: string;
  position: string;
  /** background-color 계산값 */
  bg: string;
  /** background-image 계산값(none·linear-gradient(…)·url(…)) — 층이 여럿이면 쉼표로 이음(첫 층이 맨 위) */
  bgImage: string;
  /** background-size·background-position·background-repeat 계산값(층마다 쉼표) — 없으면 CSS 기본값(auto·0% 0%·repeat). 예전 스냅숏에는 없음 */
  bgSize?: string;
  bgPosition?: string;
  bgRepeat?: string;
  /** 위·오른·아래·왼 */
  border: [SnapBorderSide, SnapBorderSide, SnapBorderSide, SnapBorderSide];
  /** 안 여백 위·오른·아래·왼(mm) */
  pad: [number, number, number, number];
  /** border-radius 계산값 */
  radius: string;
  /** box-shadow 계산값 */
  shadow: string;
  /** clip-path 계산값 */
  clipPath: string;
  opacity: number;
  /** font-family 계산값(목록 그대로) */
  fontFamily: string;
  /** pt */
  fontSize: number;
  fontWeight: number;
  fontStyle: string;
  color: string;
  /** 줄 높이 pt(normal이면 null) */
  lineHeight: number | null;
  textAlign: string;
  /** text-align-last 계산값(auto·justify·start …) — 마지막 줄(한 줄 글이면 그 줄) 정렬 */
  textAlignLast: string;
  /** text-justify 계산값(auto·none·inter-word·inter-character) — 지원하지 않는 브라우저(Chrome)는 빈 글 */
  textJustify: string;
  /** pt */
  letterSpacing: number;
  /** pt */
  wordSpacing: number;
  /** vertical-align 계산값(baseline·middle·super·길이 px …) */
  verticalAlign: string;
  /** 첫 줄 들여쓰기(mm) */
  textIndent: number;
  /** text-decoration-line 계산값 */
  textDecoration: string;
  whiteSpace: string;
  wordBreak: string;
}

/** 글 조각의 한 줄 부분: 글(접은 글) 안 시작 글자 위치 at과 그 줄 부분의 상자(mm) */
export interface SnapFrag {
  at: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 글 마디(공백은 화면처럼 접은 글). 글자 모양은 부모 요소의 스타일 */
export interface SnapText {
  kind: "text";
  text: string;
  /** 줄마다 나뉜 부분(화면 줄바꿈 자리 — Range.getClientRects로 글자마다 잰 결과) */
  frags: SnapFrag[];
}

export interface SnapBr {
  kind: "br";
}

/** ::before·::after: 글(content의 따옴표 글만)·스타일·상자(절대 위치일 때만 계산 — 아니면 null) */
export interface SnapPseudo {
  text: string;
  style: SnapStyle;
  rect: Rect | null;
}

/** 대체 대상을 브라우저가 그린 그림(PNG) — 지금은 SVG만(글 요소가 없는 것) */
export interface SnapImage {
  /** PNG 바이트의 base64 */
  png: string;
  /** 그림 픽셀 크기 */
  w: number;
  h: number;
}

/** <img>의 그림 원본: 주소(바이트는 싣지 않음)와 화면에 보이는 부분 */
export interface SnapSource {
  /** 그림 주소(currentSrc — 브라우저가 고른 절대 주소) */
  url: string;
  /** 조상의 넘침 자르기(overflow)로 보이는 부분(mm, 틀 기준) — 상자 전체가 보이면 없음 */
  clip?: Rect;
}

/** 대체 대상(그림·SVG 등) — 자리와 안 글, SVG는 그린 그림(image)도 */
export type SnapReplaced = "svg" | "img" | "canvas" | "video" | "iframe" | "object" | "embed" | "input" | "textarea" | "select" | "math";

export interface SnapBox {
  kind: "box";
  /** 요소 이름(소문자) — 변환기는 갈래를 나누는 데 쓰지 않음(진단용) */
  tag: string;
  /** 테두리 상자(getBoundingClientRect). display: contents면 0 */
  rect: Rect;
  style: SnapStyle;
  before?: SnapPseudo;
  after?: SnapPseudo;
  /** 대체 대상이면 그 종류(자식은 SVG 안 글 요소만) */
  replaced?: SnapReplaced;
  /** 대체 대상을 그린 그림(그리지 못했으면 없음) */
  image?: SnapImage;
  /** <img>의 그림 주소·보이는 부분(주소가 너무 길면 없음) */
  src?: SnapSource;
  children: SnapNode[];
}

export type SnapNode = SnapBox | SnapText | SnapBr;

export interface LayoutSnapshot {
  version: 1;
  /** 본문 틀 크기(mm) */
  frame: { w: number; h: number };
  root: SnapBox;
  /** 화면이 그려진 글꼴 표지(부르는 쪽이 채움 — 앱은 <html data-kfont> 값: 진짜 원본 글꼴이 그려지는 갈래 이름을 공백으로 이음). 추출기는 모름 */
  fontMark?: string;
}
