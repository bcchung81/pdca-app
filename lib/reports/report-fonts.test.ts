// 경평 초안 글꼴(report-fonts.ts): 표지 → 자간 변수 값 · 별칭 이름(PostScript 포함, KoPubWorld 없음) · 한글 파일 글꼴 이름과 화면 별칭이 같은 표에서 나옴.
// 브라우저 판단(markReportFonts) 자체는 DOM이 필요해 여기서는 내려받기 스크립트 식이 문법상 맞는지만 봄.

import assert from "node:assert/strict";
import { test } from "node:test";
import { FONT_PROBES, FONT_SPACING, REPORT_FONTS, fontFaceCss, fontName, fontSpacingCss, fontSpacingFor, reportFontsScript } from "./report-fonts.ts";
import { REPORT_CSS } from "./section-css.ts";
import { HWPX_FACES } from "./section-hwpx.ts";

const NOTO = { "--k-ls": "-0.083em", "--k-ws": "0.09em", "--k-ls-dotum": "-0.12em", "--k-ls-label": "-0.04em", "--k-ls-label-t": "-0.02em", "--k-ls-head": "-0.02em" };

test("표지 없음 → 자간 보정이 예전 값 그대로(글꼴 없는 PC의 화면 불변), 갈래 표지 → 그 갈래만 한글 파일 값 0em", () => {
  assert.deepEqual(fontSpacingFor(""), NOTO);
  assert.deepEqual(fontSpacingFor("body"), { ...NOTO, "--k-ls": "0em", "--k-ws": "0em" });
  assert.deepEqual(fontSpacingFor("dotum head"), { ...NOTO, "--k-ls-dotum": "0em", "--k-ls-head": "0em" });
  assert.deepEqual(fontSpacingFor("label"), { ...NOTO, "--k-ls-label": "0em", "--k-ls-label-t": "0em" });
  assert.deepEqual(new Set(Object.values(fontSpacingFor("body dotum label head"))), new Set(["0em"]));
  // CSS: 기본 선언은 표의 기본값, 덮기 규칙은 표지마다 하나
  for (const [k, v] of Object.entries(FONT_SPACING.base)) assert.ok(REPORT_CSS.includes(`${k}:${v};`), `${k} 기본값`);
  assert.ok(REPORT_CSS.includes(fontSpacingCss()));
  assert.ok(REPORT_CSS.includes(':root[data-kfont~="body"] .kca-dg-doc{--k-ls:0em;--k-ws:0em}'));
  assert.deepEqual(FONT_PROBES.map((p) => p.mark), ["body", "dotum", "label", "head"]);
});

test("판단 굵기는 화면이 쓰는 굵기(본문 300·700, 돋움 700, 라벨 400·700, 제목 400)이고 그 굵기 글꼴 이름으로 잼", () => {
  assert.deepEqual(
    FONT_PROBES.map((p) => [p.mark, p.checks.map((c) => `${c.weight}:${c.names[0]}`)]),
    [
      ["body", ["300:KoPub바탕체 Light", "700:KoPub바탕체 Bold"]],
      ["dotum", ["700:KoPub돋움체 Bold"]],
      ["label", ["400:맑은 고딕", "700:맑은 고딕 Bold"]],
      ["head", ["400:HY헤드라인M"]],
    ],
  );
});

test("별칭 @font-face: local()만, PostScript 이름(2025 최종본 PDF)이 들어 있고 KoPubWorld(다른 판)는 없음", () => {
  const faces = fontFaceCss();
  assert.ok(REPORT_CSS.includes(faces));
  for (const ps of ["KoPubBatangLight", "KoPubBatangMedium", "KoPubBatangBold", "KoPubDotumLight", "KoPubDotumMedium", "KoPubDotumBold", "MalgunGothic", "MalgunGothicBold", "H2hdrM", "HCRBatang"])
    assert.ok(faces.includes(`local("${ps}")`), ps);
  assert.doesNotMatch(faces, /url\(/);
  assert.doesNotMatch(REPORT_CSS, /KoPubWorld/);
  // 글꼴 목록: 따옴표 별칭 → 원본 별칭 → 예전 대체
  assert.match(REPORT_CSS, /--k-f-body:"KcaQuoteSerif","KcaBody",/);
  assert.match(REPORT_CSS, /--k-f-dotum:"KcaQuoteSans","KcaDotum",/);
  assert.match(REPORT_CSS, /--k-f-label:"KcaQuoteSans","KcaLabel",/);
  assert.match(REPORT_CSS, /--k-f-head:"KcaQuoteSans","KcaHead",/);
  // 보정은 변수로만(고정 −0.02em이 남으면 진짜 글꼴에서도 걸림)
  assert.doesNotMatch(REPORT_CSS, /letter-spacing:-/);
});

test("한글 파일 글꼴 이름(HWPX_FACES)은 화면 별칭과 같은 표에서 굵기로 가져온 이름 — 값은 예전 그대로", () => {
  assert.deepEqual(HWPX_FACES, { body: "KoPub바탕체 Light", bodyB: "KoPub바탕체 Bold", dotumB: "KoPub돋움체 Bold", label: "맑은 고딕", head: "HY헤드라인M", num: "함초롬바탕" });
  const faces = fontFaceCss().split("\n");
  for (const [k, group, w] of [
    ["body", "body", 300],
    ["bodyB", "body", 700],
    ["dotumB", "dotum", 700],
    ["label", "label", 400],
    ["head", "head", 400],
    ["num", "num", 400],
  ] as const) {
    assert.equal(HWPX_FACES[k], fontName(group, w), k);
    const line = faces.find((x) => x.includes(`font-family:"${REPORT_FONTS[group].alias}";src:local("${HWPX_FACES[k]}")`));
    assert.ok(line, `${k} 별칭`);
    const [lo, hi = lo] = line.replace(/.*font-weight:([\d ]+)\}$/, "$1").split(" ").map(Number);
    assert.ok(lo <= w && w <= hi, `${k} 굵기 ${w} ∈ ${lo}~${hi}`);
  }
});

test("내려받기 스크립트 식은 문법상 맞음(toString한 함수 + 판단 표)", () => {
  assert.doesNotThrow(() => new Function(`return ${reportFontsScript()};`));
  assert.match(reportFontsScript(), /KoPubBatangLight/);
});
