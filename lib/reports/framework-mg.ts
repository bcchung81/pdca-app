// 경영관리 프레임워크(241203판 — 지표별 빈 틀 12종) → 「평가내용 → 대주제 → 절」 틀과 라벨 목록(순수).
// 프레임워크 파일은 칸이 빈 틀이라 라벨(추진배경·추진내용·추진성과·환경분석·전략목표 …)과 제목 줄만 남음 — 그 라벨을 대주제·절별로 순서대로 뽑아
// 경영관리 경평 초안 구성안이 「이 지표의 틀」을 고를 때 라벨 사다리 후보로 쓰게 함(분석 docs/analysis/2025-경영관리-경영실적보고서-분석.md §4·§8).
// 입력은 kordoc이 읽은 마크다운(HTML 표·파이프 표 두 모양). 파일 읽기는 scripts/knowledge/framework-mg.ts(결과는 git 밖 resources/knowledge/_derived/framework-mg.json).

export interface FrameworkSection {
  /** 「가」·「나」 — 절 표지(제목 줄 앞 한 글자) */
  mark: string;
  title: string;
  /** 이 절의 표 칸에서 뽑은 라벨(처음 나온 순서, 같은 라벨은 한 번) */
  labels: string[];
}

export interface FrameworkTheme {
  /** 대주제 번호(1·2·3 …) */
  no: number;
  title: string;
  /** 절 제목 줄 앞의 라벨(첫 절 앞 칸들) — 절이 없는 대주제는 이것이 전부 */
  labels: string[];
  sections: FrameworkSection[];
  /** 작성 메모(「~ 체계 (PDCA 구조로 서술)」 같은 줄) */
  memos: string[];
}

export interface FrameworkEval {
  /** 평가내용 번호 */
  no: number;
  title: string;
  themes: FrameworkTheme[];
}

export interface FrameworkTemplate {
  /** 표지의 지표 이름(첫 제목 줄) */
  indicator: string;
  weight: string;
  evals: FrameworkEval[];
}

/** 생성 데이터(resources/knowledge/_derived/framework-mg.json — git 밖) 한 항목 */
export interface FrameworkMgEntry {
  /** 원본 파일 이름의 지표 번호(1-(1) 형식) */
  file: string;
  /** 평가단위(카드가 없는 국민소통은 null) */
  unit: string | null;
  template: FrameworkTemplate;
}

const PLACEHOLDER = /^(0{3,}|\(?소제목\)?\s*\d*|\[소제목\]\s*\d*|\d{1,2}|[①-⑳]|✚|\+|[ㆍ·∙•-])$/;
const FILL_LINE = /^[□■▢]\s*0{3,}/;

/** 표 칸 글 정리: HTML 태그·공백·마크다운 강조 걷기 */
export function cellText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\\([~*_#.\-])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** 한 줄이 표 줄이면 칸 글 목록, 아니면 null */
function tableCells(line: string): string[] | null {
  const t = line.trim();
  if (/^<tr>/i.test(t)) return [...t.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => cellText(m[1]));
  if (t.startsWith("|")) {
    if (/^\|\s*-{2,}/.test(t)) return [];
    return t
      .replace(/^\||\|$/g, "")
      .split("|")
      .map(cellText);
  }
  return null;
}

/** 라벨로 칠 칸인지 — 비었거나 자리표시·숫자뿐이거나 문장(30자 넘음)이면 아님 */
export function isLabel(s: string): boolean {
  return s.length >= 1 && s.length <= 30 && !PLACEHOLDER.test(s) && !/^['’]?\d{2}년?$/.test(s) && !/^내용\s*\d+$/.test(s) && !/^[0-9.\s%~/]+$/.test(s);
}

/** 작성 메모 줄 — 「~ 체계 (PDCA 구조로 서술)」·「작년 보고서 포맷 유지」·「실행력 강화 부분 작성」 */
const isMemo = (s: string) => /^[~～]/.test(s) || /PDCA 구조|포맷 유지|부분 작성/.test(s);

const push = (list: string[], v: string) => {
  if (!list.includes(v)) list.push(v);
};

/** 마크다운 → 틀. 제목 줄(「1. …」 대주제·「가. …」 절)은 표 밖의 한 줄 글, 표 줄은 칸 글을 라벨로 모음 */
export function parseFrameworkMg(markdown: string): FrameworkTemplate {
  const lines = markdown.split(/\r?\n/);
  const tpl: FrameworkTemplate = { indicator: "", weight: "", evals: [] };
  let evalNo = 0;
  let theme: FrameworkTheme | null = null;
  let section: FrameworkSection | null = null;
  let inCover = true;
  let evalTitle = "";
  const evalTitles = new Map<number, string>();

  const currentEval = () => {
    let e = tpl.evals.find((x) => x.no === (evalNo || 1));
    if (!e) {
      e = { no: evalNo || 1, title: evalTitles.get(evalNo || 1) ?? evalTitle, themes: [] };
      tpl.evals.push(e);
    }
    return e;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cells = tableCells(line);
    if (cells) {
      const texts = cells.filter((c) => c);
      // 「평가내용 N」 칸이 있는 표: 평가내용 시작(제목은 같은 표의 긴 글)
      const ev = texts.find((c) => /^평가내용\s*\d+$/.test(c));
      if (ev) {
        evalNo = Number(ev.replace(/\D/g, ""));
        evalTitle = texts.find((c) => c.length > 12 && !/^평가내용/.test(c)) ?? evalTitles.get(evalNo) ?? "";
        theme = null;
        section = null;
        continue;
      }
      // 표지: 가중치·세부 평가내용 번호와 제목
      if (inCover) {
        const w = texts.findIndex((c) => /점\(?기관\)?|^\d(\.\d)?점/.test(c));
        if (w >= 0 && !tpl.weight) tpl.weight = texts[w];
        const no = texts.findIndex((c) => /^0\d$/.test(c));
        if (no >= 0 && texts[no + 1]) evalTitles.set(Number(texts[no]), texts[no + 1]);
        continue;
      }
      if (!theme) continue;
      const target = section ? section.labels : theme.labels;
      for (const c of texts) {
        if (isMemo(c)) push(theme.memos, c);
        else if (isLabel(c)) push(target, c);
      }
      continue;
    }

    // 표 밖 줄
    if (inCover && tpl.indicator === "" && !/^!\[/.test(line)) {
      tpl.indicator = line.replace(/^#+\s*/, "").replace(/\*\*/g, "");
      continue;
    }
    const t = line.replace(/^#+\s*/, "").replace(/\*\*/g, "");
    const m1 = t.match(/^(\d+)\.\s+(.+)$/);
    if (m1) {
      inCover = false;
      const e = currentEval();
      if (!e.title) e.title = evalTitles.get(e.no) ?? evalTitle;
      theme = { no: Number(m1[1]), title: m1[2].trim(), labels: [], sections: [], memos: [] };
      e.themes.push(theme);
      section = null;
      continue;
    }
    const m2 = t.match(/^([가-힣])\.\s*(.+)$/);
    if (m2 && theme) {
      section = { mark: m2[1], title: m2[2].replace(/[【】]/g, "").trim(), labels: [] };
      theme.sections.push(section);
      continue;
    }
    if (!theme) continue;
    if (FILL_LINE.test(t)) continue; // 「□ 00000 (소제목)」 — 채울 줄 표지
    if (isMemo(t)) push(theme.memos, t);
    else if (/^(as-?is|to-?be)$/i.test(t)) push(section ? section.labels : theme.labels, t.replace(/-/g, "-"));
  }
  return tpl;
}
