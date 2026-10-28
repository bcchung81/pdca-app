// 시험판(2026-10-28): 경평 초안 HTML(화면과 같은 sectionDocument 출력)을 헤드리스 Chrome으로 열어 화면 배치 스냅숏을 뽑고,
// 범용 변환기(lib/reports/dom-hwpx/convert.ts)로 HWPX — (가) 줄 배치 없음(한글이 조판) — 를 만듭니다. 줄 배치를 적은 (나)는 한글이 다시 조판해 (가)와 같아서
// 만들지 않음(2026-10-28 한컴 뷰어 확인 — 변환기 lines 옵션은 남김). SVG는 추출기가 브라우저에서 PNG로 그려 한글 그림으로 넣음.
// kordoc validateHwpx로 검증하고 readHwpx로 다시 읽어 화면 글 줄(스냅숏 — text-keep.ts screenLines)이 한글 문단에 빠짐없이 있는지 셉니다(카드 왕복과 같은 기준). 앱에는 연결하지 않음.
// 어두운 채움 점검(scripts/eval/fill-check.ts): 변환기가 칠한 칸·글자 배경(fills — 화면 자리 mm)마다 본문 틀 스크린숏의 같은 자리에서 보이는 부분
// (안쪽에 위에 칠한 채움을 뺀 곳)의 가장 흔한 색과 채움색의 밝기 차이가 FILL_DIFF_MAX를 넘는 것을 보고. 결과표의 「채움 어긋남」이 0이어야 함
//
// 겹침 점검(2026-10-28): 변환기의 결정론 점검(convert.ts overlapCheck) 수 — 결과표 「겹침(줄 간격·세로)」이 0+0이어야 함
// 내어쓰기 점검(2026-10-28): 부호로 시작하거나 글머리표인 문단 중 내어쓰기(음수 intent)가 없는 문단 수(lib/hwpx/hang.ts hangCheck — 변환기 통계) — 결과표 「내어쓰기 없음(부호 문단)」이 0이어야 함
//
// 쓰기: node scripts/eval/dom-hwpx-poc.ts <html 파일 또는 폴더 …> [--out <출력 폴더>]
// 출력(파일마다): <이름>.snapshot.json · <이름>.a.hwpx(가) · <이름>.approx.json, 끝에 results.json과 결과표(표준 출력)
// 글꼴: 이 컴퓨터에 설치된 글꼴로 그린 화면을 잼(HTML의 글꼴 감지 스크립트가 <html data-kfont>를 달고 자간 맞춤이 돈 뒤 — 표지·fonts.ready·지연을 기다림)
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateHwpx } from "kordoc";
import { chromium } from "playwright-core";
import { readHwpx } from "../../lib/hwp/hwpx.ts";
import { snapshotToHwpx } from "../../lib/reports/dom-hwpx/convert.ts";
import { extractLayout } from "../../lib/reports/dom-hwpx/extract.ts";
import { REPORT_PAGE_MM } from "../../lib/reports/section-hwpx.ts";
import type { LayoutSnapshot } from "../../lib/reports/dom-hwpx/snapshot.ts";
import { checkFills } from "./fill-check.ts";
import { hwpParaTexts, missingLines, screenLines } from "./text-keep.ts";

/** 시작점: 경평 초안 본문 틀(이 스크립트에만 둠 — 추출기·변환기는 클래스 이름을 모름) */
const FRAME_SELECTOR = ".k-frame";

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const OUT = resolve(outAt >= 0 ? args[outAt + 1] : join(tmpdir(), "dom-hwpx-poc"));
const inputs = args.filter((a, i) => !a.startsWith("--") && (outAt < 0 || i !== outAt + 1));
const files = inputs.flatMap((p) => {
  const abs = resolve(p);
  return statSync(abs).isDirectory()
    ? readdirSync(abs)
        .filter((f) => extname(f) === ".html")
        .sort()
        .map((f) => join(abs, f))
    : [abs];
});
if (!files.length) {
  console.error("쓰기: node scripts/eval/dom-hwpx-poc.ts <html 파일 또는 폴더 …> [--out <출력 폴더>]");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

type Row = Record<string, unknown>;
const results: Row[] = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const file of files) {
    const name = basename(file, ".html");
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-kfont"), null, { timeout: 5000 }).catch(() => undefined);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(700);
    const fontMark = await page.evaluate(() => document.documentElement.getAttribute("data-kfont") ?? "");
    const t0 = Date.now();
    const snap = (await page.evaluate(`(${extractLayout.toString()})(document.querySelector(${JSON.stringify(FRAME_SELECTOR)}))`)) as LayoutSnapshot;
    const extractMs = Date.now() - t0;
    const snapJson = JSON.stringify(snap);
    writeFileSync(join(OUT, `${name}.snapshot.json`), snapJson);
    const want = screenLines(snap);
    const row: Row = { name, fontMark, frameMm: `${snap.frame.w.toFixed(1)}×${snap.frame.h.toFixed(1)}`, extractMs, snapshotBytes: snapJson.length, screenTexts: want.length };
    for (const [key, lines] of [["a", false]] as const) {
      const t1 = Date.now();
      const { bytes, approx, stats, fills } = await snapshotToHwpx(snap, { lines, title: name, page: REPORT_PAGE_MM });
      const ms = Date.now() - t1;
      writeFileSync(join(OUT, `${name}.${key}.hwpx`), bytes);
      if (key === "a") writeFileSync(join(OUT, `${name}.approx.json`), JSON.stringify(approx, null, 1));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v: any = await (validateHwpx as any)(Buffer.from(bytes));
      const doc = await readHwpx(bytes);
      const missing = missingLines(want, hwpParaTexts(doc)).map((l) => l.text);
      const pg = doc.sections[0].page;
      const mm = (v2: number) => Math.round((v2 / 7200) * 25.4 * 10) / 10;
      row[`${key}.valid`] = v.ok ? "ok" : `실패 ${JSON.stringify(v.issues).slice(0, 200)}`;
      row[`${key}.missing`] = missing.length;
      if (missing.length) row[`${key}.missingSample`] = missing.slice(0, 5);
      row[`${key}.bytes`] = bytes.length;
      row[`${key}.ms`] = ms;
      if (key === "a") {
        row.page = pg ? `${mm(pg.width)}×${mm(pg.height)} 여백 ${mm(pg.left)}/${mm(pg.right)}/${mm(pg.top)}/${mm(pg.bottom)} 본문 ${mm(pg.width - pg.left - pg.right)}` : "없음";
        row.stats = `문단 ${stats.paras} · 표 ${stats.tables} · 칸 ${stats.cells} · 표 깊이 ${stats.depth}`;
        row.squeezed = stats.squeezed;
        row.pics = stats.pics;
        row.approxCount = approx.reduce((a, x) => a + x.count, 0);
        row.approx = approx.map((x) => `${x.kind} ${x.count}`);
        row.rules = stats.rules;
        row.overlap = `${stats.tight}+${stats.stacked}`;
        row.hang = `${stats.flat} (${stats.marked})`;
        const { checked, bad } = await checkFills(page, FRAME_SELECTOR, snap.frame.w, fills);
        row.fills = fills.length;
        row.fillChecked = checked;
        row.fillBad = bad.length;
        if (bad.length) row.fillBadList = bad;
      }
    }
    await page.close();
    results.push(row);
    console.log(`${name}: (가) ${row["a.valid"]} 빠진 글 ${row["a.missing"]} · ${row.stats} · 채움 어긋남 ${row.fillBad}/${row.fillChecked}`);
    for (const b of (row.fillBadList as unknown[] | undefined) ?? []) console.log("   채움 어긋남", JSON.stringify(b));
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));

console.log(`\n| 표본 | 글꼴 표지 | 틀(mm) | 검증 | 빠진 글 줄(화면 글 줄 수) | 한 줄 유지 문단 | 그림 | 가는 선 변 | 채움 어긋남(잰 채움) | 겹침(줄 간격·세로) | 내어쓰기 없음(부호 문단) | 근사 수 | 구성 | 크기(byte) |`);
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results)
  console.log(`| ${r.name} | ${r.fontMark} | ${r.frameMm} | ${r["a.valid"]} | ${r["a.missing"]} (${r.screenTexts}) | ${r.squeezed} | ${r.pics} | ${r.rules} | ${r.fillBad} (${r.fillChecked}/${r.fills}) | ${r.overlap} | ${r.hang} | ${r.approxCount} | ${r.stats} | ${r["a.bytes"]} |`);
console.log(`\n쪽 정의: ${results[0]?.page}`);
console.log(`출력: ${OUT}`);
