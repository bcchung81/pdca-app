// 보고서 도식 CSS — docs/analysis/diagram-html-samples.html(2025 최종본 실측 회색조·글꼴·크기)에서 옮김. 모든 규칙은 .kca-dg-doc 아래로 한정.
// 글꼴 파일은 넣지 않습니다(기관 PC의 KoPub·맑은 고딕·HY헤드라인M을 먼저 찾고, 없으면 시스템 글꼴).

/**
 * 화면 CSS와 한글(HWPX) 양식(lib/reports/section-hwpx.ts)이 같이 쓰는 값 — 회색조·선 굵기(pt)·글자 크기(pt)·줄간격.
 * REPORT_CSS는 이 값을 끼워 만든 글(section-hwpx.test.ts가 sha256으로 고정 — 값을 바꾸면 고정값도 갱신). 값을 바꾸면 화면·한글이 함께 바뀜
 * 칸 사이 기호 칸·좁은 칸 안 여백은 판면 어림(fit.ts slotOf)도 같이 씀
 */
export const REPORT_STYLE = {
  /** 2025 최종본 전 쪽 회색조(PDF 채움색 실측) */
  gray: { g0: "#ffffff", g1: "#f1f2f1", g2: "#d7d8d7", g3: "#b9bab9", g4: "#7e7f7e", g5: "#4b4c4b", ink: "#111111" },
  /** 채울 자료 자리(【확인: …】 노란 칸): 바탕·테두리·글자·앞 「확인」 표지 */
  need: { bg: "#fff1b8", line: "#c79a00", ink: "#4d3a00", label: "#8a6500" },
  /** 선 굵기(pt): 가는 선·굵은 선 */
  line: { hair: 0.48, thick: 1.68 },
  /** 글자 크기(pt, PDF 실측): 본문·작은 글·라벨·소항목·머리·칩 + 상자 머리(시기·단계·비교·사례 머리)·대상사업 번호·실행과제 번호·큰 수치·소제목·추진성과 라벨·그림 자리 칩·설명·마커 */
  pt: { body: 10.6, small: 9.5, label: 10.4, sub: 14, head: 15, tag: 8, box: 11, bizNo: 12, taskNo: 14, stat: 15, subhead: 12, resultLabel: 10.9, figKind: 7.5, figDesc: 7.8, marker: 11 },
  /** 화면 줄 높이(HWP 줄간격 lineSpacingPct의 근사 — 기준선 간격 16.8pt/10.6pt) */
  lineHeight: 1.52,
  /** 한글 줄간격(%) */
  lineSpacingPct: 160,
  /**
   * 칸 사이 기호 칸(2026-10-21 5mm → 3.5mm — 좁은 다단 칸 글 폭): 카드 묶음 ✚·▶·시기 흐름 ▶·PDCA ▶ 칸 폭(mm) · 기호 ✚·▶ 글자(pt) · 시기 흐름 화살표 그림 폭(mm).
   * 전후 비교·VS·협업 등 다른 사이 칸은 따로
   */
  join: { gapMm: 3.5, pt: 10, arrowMm: 3.2 },
  /** 좁은 칸 안쪽 좌우 여백(px, 2026-10-21 5·4px → 3px): 카드·PDCA 칸 본문(.k-card__b)·단계 본문(.k-proc__b)·시기 본문(.k-tl__b) */
  boxPadX: 3,
} as const;
const G = REPORT_STYLE.gray;
const L = REPORT_STYLE.line;
const F = REPORT_STYLE.pt;
const N = REPORT_STYLE.need;
const J = REPORT_STYLE.join;
const BX = REPORT_STYLE.boxPadX;

export const REPORT_CSS = `/* 따옴표(‘’“”)만 좁은 라틴 글꼴로 — 한글 글꼴의 전각 따옴표는 「’ 25년」처럼 벌어짐(2025 최종본은 좁은 따옴표) */
@font-face{font-family:"KcaQuoteSerif";src:local("Georgia"),local("Times New Roman"),local("Noto Serif"),local("DejaVu Serif");unicode-range:U+2018-201F}
@font-face{font-family:"KcaQuoteSans";src:local("Arial"),local("Helvetica Neue"),local("Helvetica"),local("Noto Sans"),local("DejaVu Sans");unicode-range:U+2018-201F}
/* ───────────── 모든 규칙은 .kca-dg-doc 아래로 한정 ───────────── */
.kca-dg-doc{
  /* 색: 2025 최종본은 전 쪽 회색조(PDF 채움색 실측) */
  --k-g0:${G.g0}; --k-g1:${G.g1}; --k-g2:${G.g2}; --k-g3:${G.g3}; --k-g4:${G.g4}; --k-g5:${G.g5}; --k-ink:${G.ink};
  --k-hair:${L.hair}pt; --k-thick:${L.thick}pt;
  /* 글꼴: 원본 이름 우선, 없으면 Google Fonts 대체 */
  --k-f-body:"KcaQuoteSerif","KoPubWorld바탕체","KoPubBatang","KoPub Batang","HCR Batang","Noto Serif KR",serif;
  --k-f-label:"KcaQuoteSans","맑은 고딕","Malgun Gothic","Noto Sans KR",sans-serif;
  --k-f-dotum:"KcaQuoteSans","KoPubWorld돋움체","KoPubDotum","KoPub Dotum","Noto Sans KR",sans-serif;
  --k-f-head:"KcaQuoteSans","HY헤드라인M","H2hdrM","Noto Sans KR",sans-serif;
  /* 크기: PDF 실측 pt 그대로 */
  --k-fs-body:${F.body}pt; --k-fs-small:${F.small}pt; --k-fs-label:${F.label}pt; --k-fs-sub:${F.sub}pt; --k-fs-head:${F.head}pt; --k-fs-tag:${F.tag}pt;
  --k-lh:${REPORT_STYLE.lineHeight};            /* HWP 줄간격 160%(기준선 간격 16.8pt/10.6pt) 근사 */
  --k-ls:-0.083em;        /* 한글 글자폭 실측 0.917em(KoPub바탕L 10.6pt, 자간·장평 반영) ÷ Noto 1.0em */
  --k-ws:0.09em;          /* 띄어쓰기 실측 0.26em 보정 */
  --k-ls-dotum:-0.12em;   /* KoPub돋움B 실측 0.874em */
  --k-ls-label:-0.04em;   /* 맑은고딕B 실측 0.958em */
  --k-body-w:170mm;       /* 본문 폭(실측 172mm, 안전 여유 2mm) */
  font-family:var(--k-f-label); color:var(--k-ink); position:relative; overflow-wrap:anywhere;
}
.kca-dg-doc *, .kca-dg-doc *::before, .kca-dg-doc *::after{box-sizing:border-box}
.kca-dg-doc .k-frame{width:var(--k-body-w);font-family:var(--k-f-body);font-size:var(--k-fs-body);line-height:var(--k-lh);
  letter-spacing:var(--k-ls);word-spacing:var(--k-ws);word-break:keep-all;overflow-wrap:break-word;font-weight:300;color:var(--k-ink)}
.kca-dg-doc .sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* ───────────── 공통 조각: 태그·마커·불릿 ───────────── */
.kca-dg-doc .k-frame ul{list-style:none;margin:0;padding:0}
.kca-dg-doc .k-frame li{position:relative;padding-left:0.95em}
.kca-dg-doc .k-frame li::before{content:"•";position:absolute;left:0.05em;top:0}
.kca-dg-doc .k-frame b,.kca-dg-doc .k-frame strong{font-weight:700}
.kca-dg-doc .k-small{font-size:var(--k-fs-small)}
.kca-dg-doc .k-sup{font-size:6.1pt;vertical-align:4pt;letter-spacing:0;line-height:0}
.kca-dg-doc .k-tag{display:inline-block;font:700 var(--k-fs-tag)/1.35 var(--k-f-dotum);letter-spacing:0;border:var(--k-hair) solid var(--k-g5);
  padding:0 3px;margin-right:4px;vertical-align:1.5pt;white-space:nowrap;background:#fff}
.kca-dg-doc .k-tag--dark{background:var(--k-g4);color:#fff;border-color:var(--k-g4)}
.kca-dg-doc .k-num{display:inline-block;min-width:1.35em;text-align:center;font:700 8pt/1.35 var(--k-f-dotum);letter-spacing:0;border:var(--k-hair) solid var(--k-g5);margin-right:4px;vertical-align:1pt}
.kca-dg-doc .mk{display:inline-block;font:700 ${F.marker}pt/1 var(--k-f-dotum);letter-spacing:0;vertical-align:2pt;margin-left:6px;white-space:nowrap}
.kca-dg-doc .mk--dark{background:var(--k-g5);color:#fff;padding:2px 5px}
.kca-dg-doc .mk--new{border:1pt solid var(--k-ink);border-radius:9pt;padding:1px 5px;font-size:9.5pt}
.kca-dg-doc .mk--bp{background:var(--k-g5);color:#fff;padding:2px 14px 2px 13px;
  clip-path:polygon(9px 0,100% 0,calc(100% - 7px) 50%,100% 100%,9px 100%,0 50%)}

/* 줄 맞춤 실패 표시(리뷰어 경고와 같은 규칙) */
.kca-dg-doc .k-overflow{outline:1.5px dashed #c62828;outline-offset:1px}

/* ───────────── heading_task / heading_sub ───────────── */
.kca-dg-doc .k-task{display:flex;align-items:center;gap:7px;margin:0 0 4px;padding:1px 0;
  background:linear-gradient(90deg,var(--k-g2) 0%,var(--k-g1) 55%,#fff 100%);font:400 var(--k-fs-head)/1.25 var(--k-f-head);letter-spacing:-0.02em}
.kca-dg-doc .k-task__no{background:var(--k-g4);color:#fff;font-size:${F.taskNo}pt;padding:1px 6px;box-shadow:inset 2px 2px 0 rgba(255,255,255,.35)}
.kca-dg-doc .k-task__t{font-weight:900}
.kca-dg-doc .k-sub{font:700 var(--k-fs-sub)/1.3 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);margin:0 0 5px}

/* ───────────── context_boxes (2열 + 가운데 연결선) ───────────── */
.kca-dg-doc .k-ctx{display:grid;grid-template-columns:1fr 6mm 1fr;align-items:stretch}
.kca-dg-doc .k-ctx__box{border:var(--k-hair) solid var(--k-g4)}
.kca-dg-doc .k-ctx__head{display:flex;align-items:center;gap:4px;justify-content:center;border-bottom:var(--k-hair) solid var(--k-g4);
  background:var(--k-g1);font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:0 4px}
.kca-dg-doc .k-ctx__body{padding:2px 5px 3px}
.kca-dg-doc .k-ctx__link{position:relative}
.kca-dg-doc .k-ctx__link svg{position:absolute;inset:0;width:100%;height:100%;display:block}

/* ───────────── label_ladder 행 ───────────── */
.kca-dg-doc table.k-ladder{width:100%;border-collapse:separate;border-spacing:0 0;margin-top:5px}
.kca-dg-doc table.k-ladder th{width:18mm;background:var(--k-g2);font:700 var(--k-fs-label)/1.3 var(--k-f-label);letter-spacing:var(--k-ls-label);
  border:var(--k-hair) solid var(--k-g4);padding:2px 3px;vertical-align:middle}
.kca-dg-doc table.k-ladder td{border:var(--k-hair) solid var(--k-g4);border-left:0;padding:2px 3px;vertical-align:middle}

/* ───────────── banner(메시지 띠 + 하단 중괄호) ───────────── */
.kca-dg-doc .k-banner{margin-top:6px;border:0.9pt solid var(--k-g5);box-shadow:1.4pt 1.4pt 0 var(--k-g4);text-align:center;
  font-weight:700;padding:2px 6px}
.kca-dg-doc .k-brace{display:block;width:100%;height:9px;margin-top:1px}

/* ───────────── timeline(연도 셰브론) ───────────── */
.kca-dg-doc ol.k-tl{display:grid;grid-template-columns:1fr ${J.gapMm}mm 1.45fr ${J.gapMm}mm 1fr;margin:3px 0 0;padding:0;list-style:none}
.kca-dg-doc ol.k-tl > li{padding:0}
.kca-dg-doc ol.k-tl > li::before{content:none}
.kca-dg-doc .k-tl__h{background:var(--k-g2);text-align:center;font:700 ${F.box}pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);border:var(--k-hair) solid var(--k-g4);border-bottom:0}
.kca-dg-doc .k-tl__b{border:var(--k-hair) solid var(--k-g4);padding:1px ${BX}px}
.kca-dg-doc .k-tl__item[aria-current="step"] .k-tl__h{background:var(--k-g4);color:#fff}
.kca-dg-doc .k-tl__item[aria-current="step"] .k-tl__b{border-width:var(--k-thick)}
.kca-dg-doc .k-tl__item[aria-current="step"] .k-tl__h .k-tag{color:var(--k-ink)}
.kca-dg-doc .k-tl__sep{display:flex;align-items:center;justify-content:center}
.kca-dg-doc .k-tl__sep svg{width:${J.arrowMm}mm;height:9mm}

/* ───────────── process_flow(셰브론 헤더 3단 + 결과행) ───────────── */
.kca-dg-doc ol.k-proc{display:grid;grid-template-columns:repeat(3,1fr);margin:3px 0 0;padding:0;list-style:none;border:var(--k-thick) solid var(--k-g4)}
.kca-dg-doc ol.k-proc > li{padding:0;display:grid;grid-template-rows:auto 1fr auto;border-left:var(--k-hair) solid var(--k-g4)}
.kca-dg-doc ol.k-proc > li:first-child{border-left:0}
.kca-dg-doc ol.k-proc > li::before{content:none}
.kca-dg-doc .k-proc__h{background:var(--k-g2);font:700 ${F.box}pt/1.55 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);text-align:center;
  clip-path:polygon(0 0,calc(100% - 9px) 0,100% 50%,calc(100% - 9px) 100%,0 100%,9px 50%);margin-left:-1px;padding:0 10px}
.kca-dg-doc ol.k-proc > li:first-child .k-proc__h{clip-path:polygon(0 0,calc(100% - 9px) 0,100% 50%,calc(100% - 9px) 100%,0 100%)}
.kca-dg-doc ol.k-proc > li:last-child .k-proc__h{clip-path:polygon(0 0,100% 0,100% 100%,0 100%,9px 50%)}
.kca-dg-doc .k-proc__b{padding:2px ${BX}px}
.kca-dg-doc .k-proc__r{border-top:var(--k-hair) solid var(--k-g4);text-align:center;font-weight:700;padding:1px 3px}

/* ───────────── before_after 표 ───────────── */
.kca-dg-doc table.k-ba{width:100%;border-collapse:separate;border-spacing:0}
.kca-dg-doc table.k-ba th,.kca-dg-doc table.k-ba td{padding:2px 5px;vertical-align:middle}
.kca-dg-doc table.k-ba thead th{background:var(--k-g2);font:700 ${F.box}pt/1.5 var(--k-f-dotum);letter-spacing:.2em;text-align:center}
.kca-dg-doc table.k-ba thead th.k-ba__after{background:var(--k-g4);color:#fff}
.kca-dg-doc table.k-ba tbody th{font:700 ${F.box}pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);text-align:center;border-bottom:var(--k-hair) solid var(--k-g3);width:19mm;border-right:var(--k-hair) solid var(--k-g3)}
.kca-dg-doc table.k-ba td.k-ba__b{border-bottom:var(--k-hair) solid var(--k-g3);width:62mm}
.kca-dg-doc table.k-ba .k-ba__arrow{width:9mm;padding:0;text-align:center}
.kca-dg-doc table.k-ba .k-ba__arrow svg{width:6mm;height:24mm;display:block;margin:auto}
.kca-dg-doc table.k-ba td.k-ba__a{border-left:var(--k-thick) solid var(--k-g4);border-right:var(--k-thick) solid var(--k-g4);border-bottom:var(--k-hair) solid var(--k-g3)}
.kca-dg-doc table.k-ba tbody tr:last-child td.k-ba__a{border-bottom:var(--k-thick) solid var(--k-g4)}
.kca-dg-doc table.k-ba thead th.k-ba__after{border:var(--k-thick) solid var(--k-g4);border-bottom:0}

/* ───────────── matrix(SWOT) ───────────── */
.kca-dg-doc table.k-swot{width:100%;border-collapse:separate;border-spacing:3px;table-layout:fixed}
.kca-dg-doc table.k-swot td,.kca-dg-doc table.k-swot th{vertical-align:top;padding:0;font-weight:300;text-align:left}
.kca-dg-doc .k-swot__corner{position:relative;height:17mm;
  background:linear-gradient(to top right,transparent calc(50% - .4pt),var(--k-g3) 50%,transparent calc(50% + .4pt)),linear-gradient(180deg,var(--k-g1),#fff)}
.kca-dg-doc .k-swot__corner span{position:absolute;font:500 10pt/1 var(--k-f-dotum);color:#555}
.kca-dg-doc .k-swot__corner .in{right:4px;top:5px}.kca-dg-doc .k-swot__corner .ex{left:4px;bottom:5px}
.kca-dg-doc .k-swot__h{display:inline-block;border:var(--k-thick) solid var(--k-g4);font:700 11pt/1.4 var(--k-f-dotum);padding:0 6px;margin:0 0 2px}
.kca-dg-doc .k-swot__cell{border:var(--k-hair) solid var(--k-g3);padding:0 4px 2px}
.kca-dg-doc .k-swot__q{border:var(--k-thick) solid var(--k-g4);outline:var(--k-hair) solid var(--k-g4);outline-offset:1.5px;padding:0 0 2px}
.kca-dg-doc .k-swot__qh{display:flex;justify-content:space-between;align-items:stretch;background:linear-gradient(90deg,var(--k-g4) 0 40%,var(--k-g1) 40%);
  font:700 11pt/1.5 var(--k-f-dotum);margin-bottom:2px}
.kca-dg-doc .k-swot__qh .l{color:#fff;padding:0 18px 0 4px;background:var(--k-g4);clip-path:polygon(0 0,100% 0,calc(100% - 14px) 100%,0 100%)}
.kca-dg-doc .k-swot__qh--r{background:linear-gradient(90deg,var(--k-g1) 60%,var(--k-g4) 60%)}
.kca-dg-doc .k-swot__qh--r .l{order:2;background:var(--k-g4);clip-path:polygon(14px 0,100% 0,100% 100%,0 100%);padding:0 4px 0 18px}
.kca-dg-doc .k-swot__qh .t{padding:0 6px;color:var(--k-ink)}
.kca-dg-doc .k-swot__q li,.kca-dg-doc .k-swot__cell li{padding-left:0}
.kca-dg-doc .k-swot__q li::before,.kca-dg-doc .k-swot__cell li::before{content:none}
.kca-dg-doc .k-swot__q ul{padding:0 4px}
.kca-dg-doc .k-combo{float:right;font:700 7pt/1.4 var(--k-f-dotum);letter-spacing:0;border:var(--k-hair) solid var(--k-g5);padding:0 2px;margin-top:2pt}

/* ───────────── kpi 쪽(계량) ───────────── */
.kca-dg-doc .k-kpi-head{display:grid;grid-template-columns:1fr 43mm;gap:4mm;align-items:start}
.kca-dg-doc .k-kpi-name{display:flex;align-items:center;border:var(--k-hair) solid var(--k-ink);border-left:5pt solid var(--k-g5);padding:3px 4px;min-height:13mm}
.kca-dg-doc .k-kpi-name .lab{background:var(--k-g2);font:700 13.6pt/1.4 var(--k-f-dotum);padding:1px 8px;white-space:nowrap}
.kca-dg-doc .k-kpi-name .nm{flex:1;text-align:center;font:900 16pt/1.3 var(--k-f-head);letter-spacing:-0.02em}
.kca-dg-doc table.k-t{width:100%;border-collapse:collapse;font-size:10.6pt}
.kca-dg-doc table.k-t th{background:var(--k-g2);font:700 10.4pt/1.45 var(--k-f-label);letter-spacing:-0.02em;padding:1px 3px;border-bottom:var(--k-hair) solid var(--k-g4);border-left:var(--k-hair) solid #fff}
.kca-dg-doc table.k-t td{padding:1px 4px;border-bottom:var(--k-hair) solid var(--k-g4);border-left:var(--k-hair) solid var(--k-g3);text-align:center}
.kca-dg-doc table.k-t td:first-child,.kca-dg-doc table.k-t th:first-child{border-left:0}
.kca-dg-doc table.k-t{border-top:var(--k-thick) solid var(--k-g4)}
.kca-dg-doc table.k-t.num td.n{text-align:right;font-variant-numeric:tabular-nums;letter-spacing:0}
.kca-dg-doc table.k-t tr.b td{font-weight:700}
.kca-dg-doc table.k-t td.lft{text-align:center;font-family:var(--k-f-label);font-weight:400}
.kca-dg-doc table.k-t tr.b td.lft{font-weight:700}
.kca-dg-doc .k-def{margin:5px 0;padding:2px 6px;text-align:center;font:700 11pt/1.55 var(--k-f-label);letter-spacing:-0.02em;
  background:repeating-linear-gradient(135deg,#fff 0 3px,var(--k-g2) 3px 4px);border-top:var(--k-hair) solid var(--k-g3);border-bottom:var(--k-hair) solid var(--k-g3)}
.kca-dg-doc .k-def span{background:linear-gradient(90deg,transparent,#fff 12%,#fff 88%,transparent);padding:0 18px}
.kca-dg-doc .k-h5{font:700 15pt/1.3 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);margin:8px 0 3px}
.kca-dg-doc .k-h5 .k-tag--dark{font-size:8pt;vertical-align:3pt;margin-left:5px}
.kca-dg-doc .k-frac{display:inline-flex;flex-direction:column;align-items:center;line-height:1.3}
.kca-dg-doc .k-frac .t{border-bottom:var(--k-hair) solid var(--k-ink);padding:0 3px}
.kca-dg-doc .k-frac .d{padding:0 3px}
.kca-dg-doc .k-src{display:inline-block;font:500 8pt/1.4 var(--k-f-label);color:#fff;background:#6b6c6b;padding:0 4px;letter-spacing:0;vertical-align:1pt}

/* ───────────── case_callout + result_box ───────────── */
.kca-dg-doc .k-case{display:grid;grid-template-columns:1fr 35mm;border:var(--k-hair) solid var(--k-g4);column-gap:0}
.kca-dg-doc .k-case__h{grid-column:1/2;display:flex;align-items:stretch;background:var(--k-g1);font:700 ${F.box}pt/1.55 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .k-case__tab{background:var(--k-g4);color:#fff;padding:0 22px 0 8px;clip-path:polygon(0 0,100% 0,calc(100% - 12px) 100%,0 100%);white-space:nowrap}
.kca-dg-doc .k-case__title{flex:1;text-align:center;padding:0 4px}
.kca-dg-doc .k-case__b{grid-column:1/2;padding:2px 5px 3px}
.kca-dg-doc .k-case__fig{grid-column:2/3;grid-row:1/3;margin:0;background:repeating-linear-gradient(45deg,#dcdddc 0 6px,#cfd0cf 6px 12px);
  display:flex;align-items:flex-end;justify-content:center;min-height:15mm}
.kca-dg-doc .k-case__fig figcaption{font:700 7.5pt/1.3 var(--k-f-label);color:#fff;background:rgba(0,0,0,.55);width:100%;text-align:center;padding:1px 2px;letter-spacing:0}
.kca-dg-doc .k-result{display:grid;grid-template-columns:21mm 1fr;margin-top:6px;border:1.2pt solid var(--k-g5);border-radius:4pt;box-shadow:inset 0 0 0 1.5pt #fff, inset 0 0 0 2.1pt var(--k-g3);overflow:hidden}
.kca-dg-doc .k-result__label{background:var(--k-g5);color:#fff;font:700 ${F.resultLabel}pt/1.3 var(--k-f-dotum);display:flex;align-items:center;justify-content:center;margin:3pt 0 3pt 3pt}
.kca-dg-doc .k-result__body{padding:3px 6px;font-weight:700;display:flex;align-items:center;background:linear-gradient(90deg,var(--k-g1),#fff 70%);margin:3pt 3pt 3pt 0}
/* ───────────── 앱 추가: 종이·대상사업 상자·카드 격자·action_table·경고 ───────────── */
.kca-dg-doc .k-paper{background:#fff;padding:8mm 6mm;box-shadow:0 1px 3px rgba(0,0,0,.18);width:max-content;max-width:none}
.kca-dg-doc .k-biz{display:inline-flex;align-items:center;gap:6px;margin:0 0 5px;font:400 var(--k-fs-head)/1.3 var(--k-f-head);letter-spacing:-0.02em}
.kca-dg-doc .k-biz__no{background:var(--k-g2);border:var(--k-hair) solid var(--k-g4);padding:1px 8px;font-size:${F.bizNo}pt}
.kca-dg-doc .k-cards{display:grid;gap:3mm;margin-top:3px}
.kca-dg-doc .k-card{border:var(--k-hair) solid var(--k-g4);display:flex;flex-direction:column;min-width:0}
.kca-dg-doc .k-card__h{background:var(--k-g2);text-align:center;font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);border-bottom:var(--k-hair) solid var(--k-g4);padding:0 4px}
.kca-dg-doc .k-card__b{padding:2px ${BX}px;flex:1}
.kca-dg-doc .k-card__f{border-top:var(--k-hair) solid var(--k-g3);text-align:center;font-weight:700;padding:1px 4px}
.kca-dg-doc table.k-act{width:100%;border-collapse:collapse;margin-top:3px;border-top:var(--k-thick) solid var(--k-g4)}
.kca-dg-doc table.k-act th{background:var(--k-g2);font:700 10.4pt/1.45 var(--k-f-label);padding:1px 4px;border-bottom:var(--k-hair) solid var(--k-g4)}
.kca-dg-doc table.k-act th.k-act__r{background:var(--k-g4);color:#fff}
.kca-dg-doc table.k-act td{padding:2px 5px;border-bottom:var(--k-hair) solid var(--k-g4);vertical-align:middle}
.kca-dg-doc table.k-act td + td{border-left:var(--k-hair) solid var(--k-g3);font-weight:700}
.kca-dg-doc .k-dg-title{font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);margin:4px 0 0}
/* v2: 기존·개선 열 균형, ✚ 잇기, 행 옆 막대, 인용 상자 1개, 사진 없는 우수사례, 3칸 추진성과 */
/* 단계 결과 줄을 단계끼리 같은 높이에(subgrid) */
.kca-dg-doc ol.k-proc{grid-template-rows:auto 1fr auto}
.kca-dg-doc ol.k-proc > li{grid-row:span 3;grid-template-rows:subgrid}
.kca-dg-doc table.k-ba{table-layout:fixed}
.kca-dg-doc table.k-ba td.k-ba__b{width:auto}
.kca-dg-doc .k-cards--join{gap:0}
/* 전략체계도(2026-10-09): 층 이름 열 16mm(fit.ts STRAT_TIER_MM) · 목표 띠 진회색 · 열 머리 · 과제 · 지표 — 칸 안 여백 2px 3px */
.kca-dg-doc table.k-strat{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3px}
.kca-dg-doc table.k-strat th,.kca-dg-doc table.k-strat td{border:var(--k-hair) solid var(--k-g4);padding:2px 3px;vertical-align:middle}
.kca-dg-doc table.k-strat th{width:16mm;background:var(--k-g2);text-align:center;font:700 9.5pt/1.3 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .k-strat__top td{background:var(--k-g4);color:#fff;text-align:center;font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:2px 4px}
.kca-dg-doc .k-strat__head td{background:var(--k-g1);text-align:center;font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .k-strat__body td{vertical-align:top}
.kca-dg-doc .k-strat__foot td{background:var(--k-g1);text-align:center;font:700 9.5pt/1.45 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
/* PDCA 순환(2026-10-09): 4칸 사이 ▶ 칸(REPORT_STYLE.join.gapMm — fit.ts slotOf도 같이 씀), 칸 머리 단계 표지 원 4.6mm, 아래 환류 띠 */
.kca-dg-doc .k-pdca{display:grid;grid-template-columns:minmax(0,1fr) ${J.gapMm}mm minmax(0,1fr) ${J.gapMm}mm minmax(0,1fr) ${J.gapMm}mm minmax(0,1fr);margin-top:3px}
.kca-dg-doc .k-pdca__m{display:inline-flex;align-items:center;justify-content:center;width:4.6mm;height:4.6mm;border-radius:50%;background:var(--k-g4);color:#fff;font:700 8.5pt/1 var(--k-f-label);letter-spacing:0;margin-right:1.4mm;vertical-align:0.4mm}
.kca-dg-doc .k-pdca__fb{grid-column:1/-1;margin:1.2mm 0 0;border:var(--k-hair) dashed var(--k-g4);text-align:center;font:700 9.5pt/1.45 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:2px 6px}
.kca-dg-doc .k-join{display:flex;align-items:center;justify-content:center;color:var(--k-g3);font:900 ${J.pt}pt/1 var(--k-f-label)}
.kca-dg-doc .k-row2{display:grid;grid-template-columns:minmax(0,1fr) 42mm;gap:2.5mm;align-items:center}
.kca-dg-doc .k-chart{margin:0;border:var(--k-hair) solid var(--k-g4);background:#fff}
.kca-dg-doc .k-chart figcaption{background:var(--k-g1);border-bottom:var(--k-hair) solid var(--k-g4);text-align:center;font:700 9.5pt/1.45 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:0 3px}
.kca-dg-doc .k-chart svg{display:block;width:100%;height:auto}
.kca-dg-doc .k-chart__badge{display:inline-block;margin-left:4px;background:var(--k-g5);color:#fff;border-radius:7pt;padding:0 5px;font-size:8pt;letter-spacing:0;vertical-align:1pt}
.kca-dg-doc .k-ctx{margin:0 0 4px}
.kca-dg-doc .k-ctx--one{grid-template-columns:1fr}
.kca-dg-doc .k-ladder + .k-banner{margin-top:6px}
.kca-dg-doc .k-brace + .k-ladder{margin-top:4px}
.kca-dg-doc .k-case{margin-top:5px}
.kca-dg-doc .k-case--nofig{grid-template-columns:1fr}
.kca-dg-doc .k-result__body--cards{flex-direction:column;align-items:stretch}
.kca-dg-doc .k-rcards{display:grid}
.kca-dg-doc .k-rcard{padding:1px 5px;text-align:center;border-left:var(--k-hair) solid var(--k-g3)}
.kca-dg-doc .k-rcard:first-child{border-left:0}
.kca-dg-doc .k-rcard p{margin:0}
/* v3 블록: 협업 구조·말풍선·용어 박스·칩 흐름·가치 축 띠·지그재그·점 연혁·As-Is/To-Be 패널·소제목 */
.kca-dg-doc .k-hub{display:grid;grid-template-columns:1fr 9mm 1.2fr 9mm 1fr;align-items:stretch;margin-top:3px}
.kca-dg-doc .k-hub--list{grid-template-columns:0.9fr 9mm 1.6fr}
.kca-dg-doc .k-hub__node{border:var(--k-hair) solid var(--k-g4);padding:2px 5px 3px;display:flex;flex-direction:column;justify-content:center;min-width:0}
.kca-dg-doc .k-hub__name{display:block;border:var(--k-hair) solid var(--k-g5);text-align:center;font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);margin:0 4px 2px;background:#fff}
.kca-dg-doc .k-hub__node--center{padding:0}
.kca-dg-doc .k-hub__node--center .k-hub__name{background:var(--k-g4);color:#fff;border:0;margin:0}
.kca-dg-doc .k-hub__node--center ul{padding:1px 5px 2px}
.kca-dg-doc .k-hub__role{text-align:center;margin:0}
.kca-dg-doc .k-hub__link{display:flex;align-items:center;justify-content:center}
.kca-dg-doc .k-hub__link svg{width:8mm;height:6mm}
.kca-dg-doc table.k-hub__list{width:100%;border-collapse:collapse;align-self:center}
.kca-dg-doc table.k-hub__list th{background:var(--k-g1);border:var(--k-hair) solid var(--k-g4);font:700 10.2pt/1.4 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:1px 4px;white-space:nowrap;width:30%}
.kca-dg-doc table.k-hub__list td{border:var(--k-hair) solid var(--k-g4);padding:1px 4px}
.kca-dg-doc .k-voice{display:grid;gap:4mm;padding:3px 2px}
.kca-dg-doc .k-voice figure{margin:0;display:grid;grid-template-columns:15mm 1fr;align-items:center;gap:3mm}
.kca-dg-doc .k-voice__who{display:flex;flex-direction:column;align-items:center}
.kca-dg-doc .k-voice__who svg{width:11mm;height:11mm}
.kca-dg-doc .k-voice__who span{background:var(--k-g4);color:#fff;font:700 7.5pt/1.4 var(--k-f-dotum);padding:0 3px;margin-top:-1px;white-space:nowrap}
.kca-dg-doc .k-voice blockquote{margin:0;border:var(--k-hair) solid var(--k-g4);border-radius:3pt;padding:2px 6px;position:relative;text-align:center}
.kca-dg-doc .k-voice blockquote::before{content:"";position:absolute;left:-2.4mm;top:40%;border:1.2mm solid transparent;border-right-color:var(--k-g4)}
.kca-dg-doc .k-dfn{border:var(--k-hair) solid var(--k-g4);border-radius:4pt;margin-top:5px;overflow:hidden}
.kca-dg-doc .k-dfn__tab{display:inline-block;margin:0;background:var(--k-g4);color:#fff;font:700 10.4pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:0 22px 0 10px;clip-path:polygon(0 0,100% 0,calc(100% - 11px) 100%,0 100%)}
.kca-dg-doc .k-dfn__body{padding:2px 6px 4px}
.kca-dg-doc .k-dfn__body p{margin:0}
.kca-dg-doc .k-chips{display:flex;align-items:center;gap:1.6mm;margin-top:3px;flex-wrap:wrap}
.kca-dg-doc .k-chip{border:var(--k-hair) solid var(--k-g5);font:700 9.5pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:0 6px;background:#fff}
.kca-dg-doc .k-arr{color:var(--k-g4);font:700 10pt/1 var(--k-f-label)}
.kca-dg-doc .k-band{display:grid;grid-template-columns:auto 1fr;gap:2mm;margin-top:5px;align-items:stretch}
.kca-dg-doc .k-band__l{background:var(--k-g2);border:var(--k-hair) solid var(--k-g4);text-align:center;font:700 10.4pt/1.6 var(--k-f-label);letter-spacing:var(--k-ls-label);padding:0 8px;min-width:18mm}
.kca-dg-doc .k-band__t{border:var(--k-hair) solid var(--k-g4);text-align:center;font:700 10.6pt/1.6 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc ol.k-zig{list-style:none;margin:3px 0 0;padding:3px;display:grid;grid-template-columns:1fr 7mm 1fr;grid-template-rows:auto 5mm auto;border:var(--k-hair) solid var(--k-g3)}
.kca-dg-doc ol.k-zig > li{padding:0;border:var(--k-hair) solid var(--k-g4);min-width:0}
.kca-dg-doc ol.k-zig > li::before{content:none}
.kca-dg-doc ol.k-zig > li.k-zig__arr{border:0;display:flex;align-items:center;justify-content:center;color:var(--k-g3);font:900 12pt/1 var(--k-f-label)}
.kca-dg-doc .k-zig__h{display:grid;grid-template-columns:auto 1fr;border-bottom:var(--k-hair) solid var(--k-g4);font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .k-zig__h b{background:var(--k-g2);padding:0 6px}
.kca-dg-doc .k-zig__h span{text-align:center}
.kca-dg-doc .k-zig__b{padding:1px 4px 2px}
.kca-dg-doc .k-zig__r{margin:2px 0 0;border-top:var(--k-hair) solid var(--k-g3);text-align:center;font-weight:700}
.kca-dg-doc .k-dots{border:var(--k-hair) solid var(--k-g4);margin-top:3px}
.kca-dg-doc ol.k-dots__items{list-style:none;margin:0;padding:3px 0;display:grid;background:linear-gradient(var(--k-g5),var(--k-g5)) 0 8.2mm/100% 0.6pt no-repeat}
.kca-dg-doc ol.k-dots__items > li{padding:2px 3px 0;text-align:center;min-width:0}
.kca-dg-doc ol.k-dots__items > li::before{content:none}
.kca-dg-doc .k-dots__yr{display:inline-block;border:var(--k-hair) solid var(--k-g5);font:700 9pt/1.4 var(--k-f-label);padding:0 10px;background:#fff}
.kca-dg-doc li[aria-current="step"] .k-dots__yr{background:var(--k-g4);color:#fff;border-color:var(--k-g4)}
.kca-dg-doc .k-dots__dot{display:block;width:3.2mm;height:3.2mm;margin:1mm auto 1.2mm;border-radius:50%;background:#fff;box-shadow:0 0 0 0.6pt var(--k-g5),inset 0 0 0 0.9mm #fff,inset 0 0 0 2mm var(--k-g5)}
.kca-dg-doc .k-dots__t{margin:0;text-align:left}
.kca-dg-doc .k-dots__n{display:inline-block;border:var(--k-hair) solid var(--k-g5);font:700 8.5pt/1.4 var(--k-f-label);padding:0 8px;margin-top:2px}
.kca-dg-doc .k-panels{display:grid;grid-template-columns:1fr 8mm 1fr;align-items:stretch;margin-top:3px}
.kca-dg-doc .k-panel{border:var(--k-hair) solid var(--k-g4);min-width:0}
.kca-dg-doc .k-panel--to{border:var(--k-thick) solid var(--k-g4)}
.kca-dg-doc .k-panel__h{background:var(--k-g1);border-bottom:var(--k-hair) solid var(--k-g4);text-align:center;font:700 10.6pt/1.55 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:0 4px}
.kca-dg-doc .k-panel--to .k-panel__h{background:var(--k-g4);color:#fff}
.kca-dg-doc .k-panel ul{padding:2px 5px 3px}
.kca-dg-doc .k-panels__arr{display:flex;align-items:center;justify-content:center}
.kca-dg-doc .k-panels__arr svg{width:6mm;height:18mm}
.kca-dg-doc .k-ctx__head,.kca-dg-doc .k-hub__node--center .k-hub__name,.kca-dg-doc .k-dfn__tab{margin-top:0;margin-bottom:0}
.kca-dg-doc .k-hub__node:not(.k-hub__node--center) .k-hub__name{margin-top:0}
/* 막대가 행 오른쪽이 아니면 폭을 줄여 가운데(전폭으로 늘면 글자가 커짐) */
.kca-dg-doc .k-frame > .k-chart,.kca-dg-doc .k-ladder td > .k-chart{max-width:68mm;margin:5px auto 0}
.kca-dg-doc .k-subh{margin:7px 0 2px;font:700 ${F.subhead}pt/1.4 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc table.k-ladder th .k-tag{display:inline-block;margin:0 0 1px}
.kca-dg-doc .k-ladder + .k-ladder,.kca-dg-doc .k-ladder + .k-band,.kca-dg-doc .k-band + .k-ladder,.kca-dg-doc .k-ctx + .k-ladder{margin-top:5px}
.kca-dg-doc .k-case + .k-case{margin-top:4px}
.kca-dg-doc .k-figrow{display:flex;align-items:stretch;gap:2.5mm}
.kca-dg-doc .k-figrow > .k-fig{align-self:center}
.kca-dg-doc .k-figrow__main{flex:1;min-width:0}
.kca-dg-doc .k-fig{flex:none;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:2px 3px;box-sizing:border-box;border:1px dashed var(--k-g4);background:repeating-linear-gradient(45deg,#f1f2f1 0 5px,#e6e7e6 5px 10px);text-align:center}
.kca-dg-doc .k-fig__kind{font:700 ${F.figKind}pt/1.25 var(--k-f-label);color:#fff;background:var(--k-g5);padding:0 4px;border-radius:2px;letter-spacing:0}
.kca-dg-doc .k-fig__desc{font:400 ${F.figDesc}pt/1.3 var(--k-f-label);color:var(--k-g5);letter-spacing:-0.02em;word-break:keep-all;overflow-wrap:anywhere}
.kca-dg-doc .k-fig--logo{padding:1px 2px}
.kca-dg-doc .k-fig--logo .k-fig__desc{font-size:7pt}
.kca-dg-doc .k-panel__b{display:flex;gap:2mm;align-items:stretch;padding-right:2mm}
.kca-dg-doc .k-panel__b > ol{flex:1;min-width:0}
.kca-dg-doc .k-panel__b > .k-fig{margin:2px 0}
.kca-dg-doc .k-panels__mid{display:flex;align-items:stretch;justify-content:center;padding:0 2mm}
.kca-dg-doc .k-hub__logos{display:flex;flex-wrap:wrap;gap:1.5mm;justify-content:center;padding:2px 4px 0}
.kca-dg-doc .k-case__figslot{grid-column:2/3;grid-row:1/3;width:auto!important;border-width:0 0 0 1px}
.kca-dg-doc .k-need{background:${N.bg};box-shadow:inset 0 0 0 1px ${N.line};border-radius:2px;padding:0 3px;color:${N.ink};font-weight:400;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.kca-dg-doc .k-need::before{content:"확인 ";font:700 .78em var(--k-f-dotum);color:${N.label}}
.kca-dg-doc .k-stat__v .k-need{display:inline-block;max-width:100%;margin:2px 0 1px;padding:1px 4px;font:700 10.5pt/1.35 var(--k-f-dotum);letter-spacing:0}
.kca-dg-doc .k-weak{text-decoration:underline dotted #8a8b8a;text-underline-offset:2px;text-decoration-thickness:1px}
.kca-dg-doc .k-unv{text-decoration:underline dashed #c62828;text-underline-offset:2px;text-decoration-thickness:1.5px}
.kca-dg-doc .k-result__body ul{width:100%}

/* 판면 맞추기(2026-09-27): 문단 기본 여백 없음(쓰는 곳마다 따로 정함 — :where로 뒤 규칙이 이김), 외톨이 줄 피하기, 머리 줄 고르게 */
.kca-dg-doc .k-frame :where(p){margin:0}
.kca-dg-doc .k-frame li,.kca-dg-doc .k-frame td,.kca-dg-doc .k-frame p{text-wrap:pretty}
.kca-dg-doc .k-sub,.kca-dg-doc .k-card__h,.kca-dg-doc .k-tl__h,.kca-dg-doc .k-proc__h,.kca-dg-doc .k-panel__h,.kca-dg-doc .k-hub__name,.kca-dg-doc .k-ctx__head,.kca-dg-doc .k-zig__h span,.kca-dg-doc .k-chart figcaption,.kca-dg-doc .k-card__f,.kca-dg-doc .k-proc__r{text-wrap:balance}
/* 강조(**…**): 명조 본문 안의 굵은 고딕(보고서 관례) — 대체 명조에 굵은 꼴이 없어도 드러나게 */
.kca-dg-doc .k-frame li b,.kca-dg-doc .k-frame p b,.kca-dg-doc .k-frame td > b{font-family:var(--k-f-dotum);font-weight:700;letter-spacing:var(--k-ls-dotum)}
/* 시기 칸: 결과 줄을 칸 바닥에 맞춤 */
.kca-dg-doc .k-tl__item{display:flex;flex-direction:column}
.kca-dg-doc .k-tl__b{flex:1;display:flex;flex-direction:column}
.kca-dg-doc .k-tl__b > p{margin-top:auto;padding-top:1px;text-align:center}
/* 2026-10-15 상자 균형 — 블록 높이 불변(가장 긴 칸이 정함), 짧은 칸 본문 불릿을 같은 높이 안에 고르게(1개면 가운데). 꼬리 줄은 바닥 맞춤 그대로 */
.kca-dg-doc .k-card__b,.kca-dg-doc .k-proc__b,.kca-dg-doc .k-tl__b{display:flex;flex-direction:column}
.kca-dg-doc .k-card__b > ul,.kca-dg-doc .k-proc__b > ul,.kca-dg-doc .k-tl__b > ul{flex:1;display:flex;flex-direction:column;justify-content:space-evenly}
.kca-dg-doc .k-panel{display:flex;flex-direction:column}
.kca-dg-doc .k-panel__b{flex:1}
.kca-dg-doc .k-panel__b > ol{display:flex;flex-direction:column;justify-content:space-evenly}
/* 라벨만 있는 막대(행에 다른 블록 없음)는 작게 */
.kca-dg-doc .k-frame > .k-chart,.kca-dg-doc .k-ladder td > .k-chart{max-width:48mm}

/* 칸 글 양쪽 정렬(한글 문서 관행 — 줄 끝이 칸 끝에 맞음, 마지막 줄은 왼쪽). 자간 맞춤(1~2글자 넘침은 자간을 줄여 한 줄로)은 fit-dom.ts가 그린 뒤 맞춤 */
.kca-dg-doc .k-frame li{text-align:justify;text-justify:inter-character} /* 낱말 사이만 늘리면 keep-all 줄에서 빈칸이 크게 벌어짐 — 한글은 글자 사이로 고르게(한글 배분 관행) */
.kca-dg-doc .k-frame li.k-left{text-align:left}
.kca-dg-doc .k-frame li.k-fit-tight{letter-spacing:calc(var(--k-ls) + var(--k-fit, 0em))}
/* 번호 As-Is/To-Be 패널 */
.kca-dg-doc ol.k-panel__list{list-style:none;margin:0;padding:2px 5px 3px}
.kca-dg-doc ol.k-panel__list > li{padding-left:1.3em}
.kca-dg-doc ol.k-panel__list > li::before{content:none}
.kca-dg-doc .k-panel__no{position:absolute;left:0;top:0;font-family:"Haansoft Batang","HCR Batang",serif;letter-spacing:0}
/* 우수사례 라벨 줄 */
.kca-dg-doc .k-case__kv{padding-left:0}
.kca-dg-doc .k-case__kv::before{content:none}
.kca-dg-doc .k-case__kv .k-tag{margin-right:5px;min-width:13mm;text-align:center}
/* 핵심 수치 띠 */
.kca-dg-doc .k-stats{display:grid;gap:3mm;margin-top:3px}
.kca-dg-doc .k-stat{border:var(--k-hair) solid var(--k-g4);border-top:var(--k-thick) solid var(--k-g5);text-align:center;padding:2px 4px 3px;min-width:0}
.kca-dg-doc .k-stat .k-tag{margin:1px 0 0}
.kca-dg-doc .k-stat__v{font:700 ${F.stat}pt/1.3 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);margin:1px 0 0}
.kca-dg-doc .k-stat__d{font-size:var(--k-fs-body);line-height:var(--k-lh);margin:0}
.kca-dg-doc .k-stat__n{font:700 9.5pt/1.4 var(--k-f-dotum);color:var(--k-g5);margin:1px 0 0}
/* 3단계 표현 보강(2026-09-27, 2025 119~126쪽): VS 대립 2칸 · Q&A 상자 · 수치 표 · 추진성과 막대·강조 띠 · 위첨자 비교 */
.kca-dg-doc .k-cards--vs{display:grid;grid-template-columns:minmax(0,1fr) 9mm minmax(0,1fr);gap:0;margin-top:3px}
.kca-dg-doc .k-vs{align-self:center;justify-self:center;width:8mm;height:8mm;border-radius:50%;background:var(--k-g5);color:#fff;display:flex;align-items:center;justify-content:center;font:900 9pt/1 var(--k-f-head);letter-spacing:-0.02em}
.kca-dg-doc dl.k-qa{margin:3px 0 0;border:var(--k-hair) solid var(--k-g4);border-radius:3pt;padding:2px 6px 3px;display:grid;grid-template-columns:6mm minmax(0,1fr);row-gap:0}
.kca-dg-doc .k-qa dt,.kca-dg-doc .k-qa dd{display:contents;margin:0}
.kca-dg-doc .k-qa dt > span:last-child{font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);min-width:0}
.kca-dg-doc .k-qa dd > ul{min-width:0;margin-bottom:0.8mm}
.kca-dg-doc .k-qa__m{align-self:start;justify-self:start;width:4.4mm;margin-top:0.6mm;text-align:center;font:900 8pt/1.5 var(--k-f-dotum);letter-spacing:0;background:var(--k-g5);color:#fff;border-radius:2px}
.kca-dg-doc .k-qa dd li:only-child{padding-left:0}
.kca-dg-doc .k-qa dd li:only-child::before{content:none}
.kca-dg-doc .k-qa__m--a{background:#fff;color:var(--k-g5);box-shadow:inset 0 0 0 var(--k-hair) var(--k-g5)}
.kca-dg-doc table.k-tbl{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:3px;border-top:var(--k-thick) solid var(--k-g4);border-bottom:var(--k-hair) solid var(--k-g4)}
.kca-dg-doc table.k-tbl thead th{background:var(--k-g2);font:700 10.4pt/1.45 var(--k-f-label);letter-spacing:var(--k-ls-label);padding:1px 4px;border-bottom:var(--k-hair) solid var(--k-g4);border-left:var(--k-hair) solid #fff;text-align:center}
.kca-dg-doc table.k-tbl tbody th{background:var(--k-g1);font:700 10.4pt/1.45 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);padding:1px 4px;border-bottom:var(--k-hair) solid var(--k-g3);text-align:center}
.kca-dg-doc table.k-tbl td{padding:1px 4px;border-bottom:var(--k-hair) solid var(--k-g3);border-left:var(--k-hair) solid var(--k-g3);text-align:center;vertical-align:middle}
.kca-dg-doc table.k-tbl th:first-child{border-left:0}
.kca-dg-doc .k-result--band{grid-template-columns:21mm minmax(0,1fr) auto}
.kca-dg-doc .k-result__band{align-self:center;margin:3pt 4pt 3pt 2mm;max-width:40mm;padding:2px 6px;background:var(--k-g5);color:#fff;border-radius:3pt;text-align:center;font:700 11pt/1.3 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);box-shadow:1.2pt 1.2pt 0 var(--k-g3)}
.kca-dg-doc .k-result__body--chart > .k-row2{width:100%}
.kca-dg-doc .k-result__body--chart .k-chart{font-weight:400}
/* 표 모양(2026-10-12, 2025 경영관리 빈출 — 폭은 lib/reports/fit.ts TABLE_SHAPE_MM과 같음): 추진실적 열 · 값 옆 막대 · 쉐브론 머리 · 2단 라벨 */
.kca-dg-doc table.k-tbl--res td.k-res__b,.kca-dg-doc table.k-tbl--lad td.k-lad__b{text-align:left;vertical-align:middle;padding:1px 4px}
.kca-dg-doc table.k-tbl--res td.k-res__r{background:var(--k-g5);color:#fff;text-align:center;vertical-align:middle;padding:2px 4px;border-left:var(--k-hair) solid var(--k-g5)}
.kca-dg-doc .k-res__h{margin:0 0 1px;padding-bottom:1px;border-bottom:var(--k-hair) solid #fff;font:700 9.5pt/1.4 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .k-res__v{margin:1px 0 0;font:700 ${F.stat}pt/1.3 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .k-res__l,.kca-dg-doc .k-res__t{margin:0;font:700 9.5pt/1.4 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .k-res__t{margin-top:2px}
.kca-dg-doc .k-res__r .k-need{color:var(--k-ink)}
.kca-dg-doc .k-barc{display:flex;align-items:center;gap:1.5mm}
.kca-dg-doc .k-barc__v{flex:1 1 auto;min-width:0;text-align:right}
.kca-dg-doc .k-barc__t{flex:0 0 14mm;height:2.6mm;background:var(--k-g1);box-shadow:inset 0 0 0 var(--k-hair) var(--k-g3)}
.kca-dg-doc .k-barc__b{display:block;height:100%;background:var(--k-g4)}
.kca-dg-doc table.k-tbl--chev thead th.k-chev{background:#fff;padding:1px 0 2px;border-left:0}
.kca-dg-doc .k-chev > span{display:flex;align-items:center;justify-content:center;min-height:5.4mm;padding:1px 4mm 1px 3mm;background:var(--k-g4);color:#fff;
  clip-path:polygon(0 0,calc(100% - 2.5mm) 0,100% 50%,calc(100% - 2.5mm) 100%,0 100%,2.5mm 50%)}
.kca-dg-doc .k-chev--last > span{background:var(--k-g5)}
.kca-dg-doc table.k-tbl--chev td{text-align:left;vertical-align:top}
.kca-dg-doc table.k-tbl--lad th.k-lad__g{background:var(--k-g2);border-right:var(--k-hair) solid var(--k-g4)}
.kca-dg-doc table.k-tbl--lad th.k-lad__s{background:var(--k-g1);text-align:left;border-right:var(--k-hair) solid var(--k-g3)}
/* 배치(2026-10-12 — lib/reports/layout.ts): 단 띠 = 어두운 단 이름 탭 + 판을 가로지르는 아래 선(높이는 fit.ts stageHeadMm), 가로 반씩 = 두 칸 나란히(사이는 layout.ts PAIR_GAP_MM) */
.kca-dg-doc .k-stage{display:flex;align-items:stretch;margin:6px 0 1px;border-bottom:1.2pt solid var(--k-g5);font:700 10.6pt/1.5 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum)}
.kca-dg-doc .k-stage__l{background:var(--k-g5);color:#fff;padding:0 18px 0 7px;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 100%,0 100%)}
.kca-dg-doc .k-stage__l .k-tag{color:var(--k-ink)}
.kca-dg-doc .k-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:4mm;align-items:start}
.kca-dg-doc .k-pair__c{min-width:0}
`;

/**
 * 경영관리 지표 단위 카드 밖 부분(표지·지적사항 조치실적·전년 대비·성과분석 및 환류 — lib/reports/unit-parts-html.ts) 전용 규칙(2026-10-16 R5a).
 * REPORT_CSS 뒤에 함께 둠. REPORT_CSS와 기존 렌더러 출력은 그대로(이 문자열을 따로 내보내 기존 바이트가 바뀌지 않게)
 */
export const UNIT_PARTS_CSS = `
.kca-dg-doc .k-up-ch{font:700 var(--k-fs-head)/1.3 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);margin:10px 0 5px;padding-bottom:2px;border-bottom:var(--k-thick) solid var(--k-g4)}
.kca-dg-doc .k-up-ch:first-child{margin-top:0}
.kca-dg-doc table.k-up{table-layout:fixed;margin:0 0 6px}
.kca-dg-doc table.k-up th{text-align:center;vertical-align:middle}
.kca-dg-doc table.k-up td{text-align:left;vertical-align:top;padding:2px 4px}
.kca-dg-doc table.k-up td.c{text-align:center;vertical-align:middle}
.kca-dg-doc table.k-up li{text-align:left} /* 좁은 표 칸에서 글자 사이 배분(.k-frame li)은 글자가 벌어져 보여 왼쪽 맞춤 */
.kca-dg-doc table.k-up td.n{text-align:right;vertical-align:middle;font-variant-numeric:tabular-nums;letter-spacing:0}
.kca-dg-doc table.k-up--cover th{width:24mm;background:var(--k-g2)}
.kca-dg-doc .k-up-cap{font:700 var(--k-fs-small)/1.45 var(--k-f-dotum);letter-spacing:var(--k-ls-dotum);margin:4px 0 2px}
.kca-dg-doc .k-up-empty{display:block;min-height:1.4em;border:var(--k-hair) dashed var(--k-g3);background:var(--k-g1);color:var(--k-g4);font:400 8pt/1.4 var(--k-f-label);letter-spacing:0;text-align:center}
.kca-dg-doc .k-up-flag{display:inline-block;margin-left:4px;border:1px dashed #c62828;color:#c62828;font:700 7.5pt/1.35 var(--k-f-label);letter-spacing:0;padding:0 3px;vertical-align:1pt}
`;
