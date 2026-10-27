// 경평 초안 글꼴 — 화면(REPORT_CSS)과 한글 파일(section-hwpx.ts HWPX_FACES)이 같은 글꼴 이름을 이 표 한 곳에서 가져옵니다.
// 기준: 2025 경영실적보고서 최종본 PDF·한컴 저장 틀(data/templates header.xml)의 글꼴 — 옛 KoPub(공식 「KoPub 2.0」,
// https://www.kopus.org/biz-electronic-font2-2/ — KoPubWorld는 다른 판이라 쓰지 않음), 맑은 고딕(윈도), HY헤드라인M·함초롬바탕(한컴오피스).
// 글꼴 파일은 앱에 넣지 않고(금기 6, KoPub 약관상 서버 탑재·웹 임베딩은 별도 승인) PC에 설치된 글꼴을 local()로 이름만 찾습니다.
//
// 화면 자간 보정(--k-ls 등)은 KoPub이 없어 Noto로 그릴 때 KoPub 글자 폭을 흉내 내는 값입니다. 진짜 글꼴이 그려지면 보정이 걸리면 안 되므로
// (한글 파일은 모든 글자 모양이 자간 0·장평 100 — section-hwpx.ts Shapes.char) 브라우저가 글꼴 갈래별로 진짜 글꼴을 쓰는지 재서
// <html data-kfont="body dotum label head">(있는 것만)를 달고, CSS가 그 갈래의 보정을 한글 파일 값(0)으로 덮습니다. 표지가 없으면 예전 그대로.

/** 글꼴 한 굵기: 굵기 범위(@font-face font-weight) + local() 이름 — [0] 한글 전체 이름(한글 파일 face 이름과 같음), 나머지는 PostScript·영문 이름 */
export interface ReportFontFace {
  readonly weight: readonly [number, number];
  readonly names: readonly string[];
}
/** 글꼴 갈래: 화면 별칭(@font-face 이름) · 굵기들 · 진짜 글꼴인지 판단할 굵기(화면이 실제로 쓰는 굵기 — 이 굵기가 모두 있어야 「있음」) */
export interface ReportFontGroup {
  readonly alias: string;
  readonly faces: readonly ReportFontFace[];
  readonly probe: readonly number[];
}

const kopub = (ko: string, en: string) =>
  [
    { weight: [100, 400], names: [`KoPub${ko} Light`, `KoPub${en}Light`, `KoPub${en} Light`] },
    { weight: [500, 600], names: [`KoPub${ko} Medium`, `KoPub${en}Medium`, `KoPub${en} Medium`] },
    { weight: [700, 900], names: [`KoPub${ko} Bold`, `KoPub${en}Bold`, `KoPub${en} Bold`] },
  ] as const;

/**
 * 글꼴 갈래 표. 굵기 범위: 본문·돋움 Light는 100~400(한글 파일의 굵지 않은 본문은 Light라 400 요청도 Light로), 굵게는 700~900.
 * 제목(HY헤드라인M)은 한 굵기(400)만 — 900 요청은 지금처럼 브라우저가 굵게 합성. 번호(함초롬바탕)는 보정이 없어 판단하지 않음(probe 없음)
 */
export const REPORT_FONTS = {
  body: { alias: "KcaBody", faces: kopub("바탕체", "Batang"), probe: [300, 700] },
  dotum: { alias: "KcaDotum", faces: kopub("돋움체", "Dotum"), probe: [700] },
  label: {
    alias: "KcaLabel",
    faces: [
      { weight: [100, 600], names: ["맑은 고딕", "MalgunGothic", "MalgunGothicRegular", "Malgun Gothic"] },
      { weight: [700, 900], names: ["맑은 고딕 Bold", "MalgunGothicBold", "Malgun Gothic Bold"] },
    ],
    probe: [400, 700],
  },
  head: { alias: "KcaHead", faces: [{ weight: [400, 400], names: ["HY헤드라인M", "H2hdrM"] }], probe: [400] },
  num: { alias: "KcaNum", faces: [{ weight: [400, 400], names: ["함초롬바탕", "HCRBatang", "HCR Batang"] }], probe: [] },
} as const satisfies Record<string, ReportFontGroup>;
export type ReportFontKey = keyof typeof REPORT_FONTS;

/** 그 굵기를 그리는 글꼴 */
function faceAt(key: ReportFontKey, weight: number): ReportFontFace {
  const f = (REPORT_FONTS[key].faces as readonly ReportFontFace[]).find((x) => x.weight[0] <= weight && weight <= x.weight[1]);
  if (!f) throw new Error(`글꼴 ${key} ${weight} 없음`);
  return f;
}
/** 그 굵기를 그리는 글꼴의 한글 이름(한글 파일 face 이름) */
export const fontName = (key: ReportFontKey, weight: number): string => faceAt(key, weight).names[0];

/** 별칭 @font-face(local()만 — 글꼴 파일 없음). 굵기 범위가 한 값이면 그 값 하나로 */
export function fontFaceCss(): string {
  return Object.values(REPORT_FONTS)
    .flatMap((g) =>
      (g.faces as readonly ReportFontFace[]).map(
        (f) => `@font-face{font-family:"${g.alias}";src:${f.names.map((n) => `local("${n}")`).join(",")};font-weight:${f.weight[0] === f.weight[1] ? f.weight[0] : `${f.weight[0]} ${f.weight[1]}`}}`,
      ),
    )
    .join("\n");
}

/**
 * 자간 보정 변수: 표지가 없을 때 값(Noto로 KoPub·맑은 고딕 폭 흉내) · 갈래 표지가 있을 때 덮는 값(한글 파일 자간 0 — 0이 아니라 0em: calc()에서 길이와 더함).
 * 근거: 본문 KoPub바탕L 10.6pt 한글 실측 0.917em ÷ Noto 1.0em → −0.083em, 띄어쓰기 실측 0.26em 보정 +0.09em, KoPub돋움B 0.874em → −0.12em,
 * 맑은고딕B 0.958em → −0.04em. 제목(HY헤드라인M)과 라벨 글꼴의 표 머리·정의 띠·그림 설명은 −0.02em(한글 파일은 0)
 */
export const FONT_SPACING = {
  base: { "--k-ls": "-0.083em", "--k-ws": "0.09em", "--k-ls-dotum": "-0.12em", "--k-ls-label": "-0.04em", "--k-ls-label-t": "-0.02em", "--k-ls-head": "-0.02em" },
  real: {
    body: { "--k-ls": "0em", "--k-ws": "0em" },
    dotum: { "--k-ls-dotum": "0em" },
    label: { "--k-ls-label": "0em", "--k-ls-label-t": "0em" },
    head: { "--k-ls-head": "0em" },
  },
} as const;
type SpacingVar = keyof typeof FONT_SPACING.base;
export type FontMark = keyof typeof FONT_SPACING.real;

/** 표지(data-kfont 값) → 자간 변수 값(CSS가 계산하는 것과 같은 결과 — 시험용) */
export function fontSpacingFor(mark: string): Record<SpacingVar, string> {
  const on = new Set(mark.split(/\s+/).filter(Boolean));
  const out: Record<string, string> = { ...FONT_SPACING.base };
  for (const [k, v] of Object.entries(FONT_SPACING.real)) if (on.has(k)) Object.assign(out, v);
  return out as Record<SpacingVar, string>;
}

/** 갈래 표지가 있으면 보정을 덮는 규칙(:root[data-kfont~=…] .kca-dg-doc — .kca-dg-doc보다 구체적이라 순서와 무관) */
export function fontSpacingCss(): string {
  return Object.entries(FONT_SPACING.real)
    .map(([k, v]) => `:root[data-kfont~="${k}"] .kca-dg-doc{${Object.entries(v).map(([n, x]) => `${n}:${x}`).join(";")}}`)
    .join("\n");
}

/** 판단할 갈래: 표지 이름 · 판단 굵기마다 그 굵기 글꼴의 local() 이름 */
export interface FontProbe {
  readonly mark: string;
  readonly checks: readonly { readonly weight: number; readonly names: readonly string[] }[];
}
export const FONT_PROBES: readonly FontProbe[] = (Object.keys(FONT_SPACING.real) as FontMark[]).map((mark) => ({
  mark,
  checks: REPORT_FONTS[mark].probe.map((weight) => ({ weight, names: faceAt(mark, weight).names })),
}));

/**
 * 브라우저에서 갈래별 진짜 글꼴 여부를 재서 <html data-kfont>를 달고 표지 문자열을 돌려줍니다(없으면 속성을 지움).
 * 내려받는 HTML에는 toString으로 넣으므로 바깥 이름·import를 쓰지 않는 한 함수로 둡니다(fit-dom.ts와 같은 방식).
 * 판단 기준(굵기마다 — 같은 갈래의 다른 굵기만 있으면 그 굵기를 합성해 그리므로 갈래 이름이 아니라 굵기별로 봄):
 *  ① 그 굵기의 local() 이름들로 시험용 FontFace를 만들어 load() — 설치된 글꼴을 못 찾으면 거절되므로 「없음」
 *  ② 불러왔으면 캔버스 measureText로 「시험 글꼴, monospace」와 「시험 글꼴, serif」의 폭이 같고(대체 글꼴이 안 끼어듦)
 *     그 폭이 monospace·serif 단독 폭 중 하나와는 달라야(대체 글꼴 그대로가 아님) 「있음」
 * 판단 굵기가 모두 있어야 그 갈래에 표지. 브라우저가 FontFace·캔버스를 못 쓰면 표지 없음(예전 보정 그대로)
 */
export async function markReportFonts(doc: Document, probes: readonly FontProbe[]): Promise<string> {
  const root = doc.documentElement;
  const ctx = typeof FontFace === "function" && doc.fonts ? doc.createElement("canvas").getContext("2d") : null;
  const marks: string[] = [];
  if (ctx) {
    const sample = "경영실적보고서 성과 KCA Wmil 2025";
    const width = (font: string) => {
      ctx.font = font;
      return ctx.measureText(sample).width;
    };
    let n = 0;
    const has = async (weight: number, names: readonly string[]) => {
      const family = `KcaFontProbe${(n += 1)}`;
      const face = new FontFace(family, names.map((x) => `local("${x}")`).join(","), { weight: String(weight) });
      try {
        await face.load();
      } catch {
        return false;
      }
      doc.fonts.add(face);
      try {
        const px = `${weight} 40px `;
        const a = width(`${px}"${family}", monospace`);
        const b = width(`${px}"${family}", serif`);
        return a === b && (a !== width(`${px}monospace`) || b !== width(`${px}serif`));
      } finally {
        doc.fonts.delete(face);
      }
    };
    for (const p of probes) {
      let ok = p.checks.length > 0;
      for (const c of p.checks) if (ok) ok = await has(c.weight, c.names);
      if (ok) marks.push(p.mark);
    }
  }
  const mark = marks.join(" ");
  if (mark) root.setAttribute("data-kfont", mark);
  else root.removeAttribute("data-kfont");
  return mark;
}

/** 내려받는 HTML용: 표지를 다는 식(Promise<string> — 실패해도 "") */
export function reportFontsScript(): string {
  return `(${markReportFonts.toString()})(document, ${JSON.stringify(FONT_PROBES)}).catch(function () { return ""; })`;
}
