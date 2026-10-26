// 글자 정규화. 표시용(normalizeText)과 색인·질의용(foldForSearch)을 나눕니다.
// 근거: docs/analysis/공통지식-5종-분석.md §2(P1·P8·P9·P17·P18)

const MIDDOT_VARIANTS = /[･‧․ㆍ・]/g; // ･ ‧ ․ ㆍ ・ → ·
const YEAR_QUOTE = /[‘’`´](?=\d{2}(?!\d))/g; // ’25, ‘26. → '25, '26.
const MD_ESCAPE = /\\([~*`_#[\]|<>\-+.!()])/g;
const LEADER_DOTS = /\s*·{3,}\s*/g;

/** 표시용 정규화: 가운뎃점·연도 따옴표·마크다운 이스케이프·공백 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFC")
    .replace(MIDDOT_VARIANTS, "·")
    .replace(YEAR_QUOTE, "'")
    .replace(MD_ESCAPE, "$1")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** 목차 점선 제거 */
export function stripLeaderDots(input: string): string {
  return input.replace(LEADER_DOTS, " ").trim();
}

/** 색인·질의용 접기: 표시용 정규화 + 따옴표 통일 + 공백 한 칸 + 영문 소문자 */
export function foldForSearch(input: string): string {
  return normalizeText(input)
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** 비교용 키: 글자·숫자만 남김(공백·문장부호 제거) */
export function compactKey(input: string): string {
  return foldForSearch(input).replace(/[^\p{L}\p{N}]/gu, "");
}

/** HTML 줄바꿈과 태그를 걷어 낸 셀 글자 */
export function cellText(html: string, brAs = " "): string {
  return normalizeText(
    html
      .replace(/<br\s*\/?>/gi, brAs)
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&"),
  );
}

// 글머리로 시작하는 줄은 앞 줄에 잇지 않습니다.
const BULLET_START =
  /^(?:[☑￭※□■ㅇ○●◦▪◆◇▶►◎★\-·∙•*]|[①-⑳❶-❿➊-➓⑴-⒇㉮-㉻]|\d+[.)]\s|[가-하][.)]\s|\(\d+\)|<|\||#|!\[)/;
const TERMINAL_END = /[.?!:;)\]】」』>|]$/;
const STRUCTURAL = /^(?:<|\||#|!\[)/;

/**
 * PDF 한 줄이 문단 하나가 된 경우(P1)를 잇습니다.
 * 앞 줄이 종결부호로 끝나지 않고 다음 줄이 글머리로 시작하지 않으면 공백 하나로 잇습니다.
 * 표·제목·그림 줄은 잇지 않습니다.
 */
export function joinBrokenLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const prev = out.at(-1);
    if (prev !== undefined && !TERMINAL_END.test(prev) && !STRUCTURAL.test(prev) && !BULLET_START.test(line)) {
      out[out.length - 1] = `${prev} ${line}`;
    } else {
      out.push(line);
    }
  }
  return out;
}

/** 관리계획 글머리 줄이 제목으로 올라간 경우(P8)와 이중 글머리(P9)를 되돌립니다 */
export function demoteBulletHeading(line: string): string {
  return line.replace(/^#{1,6} (?=[ㅇ□*\-※]|\\\*)/, "").replace(/^- - /, "- ");
}

const DEPT_SUFFIX = /(팀|센터|본부|단|실|TF)$/;

/**
 * 부서 칸(P18). "경영<br>기획팀"은 한 부서, "검사기획팀<br>검사관리팀"은 두 부서.
 * 조각을 차례로 이어 붙이다가 부서 접미사로 끝나면 끊습니다.
 */
export function splitDepartments(cell: string): string[] {
  const out: string[] = [];
  // 쉼표는 언제나 구분자, <br>·줄바꿈은 부서 접미사로 판단
  for (const group of cell.split(/,|，/)) {
    const pieces = group
      .split(/<br\s*\/?>|\n/i)
      .map((p) => normalizeText(p.replace(/<[^>]+>/g, "")).replace(/\s+/g, ""))
      .filter(Boolean);
    let cur = "";
    for (const piece of pieces) {
      cur += piece;
      if (DEPT_SUFFIX.test(cur)) {
        out.push(cur);
        cur = "";
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
export const DINGBAT = "❶❷❸❹❺❻❼❽❾❿";

export function circledToNumber(ch: string): number | null {
  const i = CIRCLED.indexOf(ch);
  if (i >= 0) return i + 1;
  const j = DINGBAT.indexOf(ch);
  return j >= 0 ? j + 1 : null;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
