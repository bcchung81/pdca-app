// 시험판 측정(2026-10-28): 과제관리카드 59장 「한글(화면 그대로)」(DOM 방식) 왕복 — 원본 배치 방식(layout-hwpx.ts)과 나란히.
// 카드마다: 원본 한글 파일(data/cards/260916 — git 밖)에서 원본 배치를 떼어(buildLayouts) 숨은 사본과 같은 본문(lib/cards/hwpx-copy.ts cardCopyBody)을
// 화면과 같은 CSS(tailwind preflight + body 줄 나눔 + lib/cards/card.css + CARD_LAYOUT_CSS)로 헤드리스 Chrome에 그리고, 사본과 같은 맞춤(settleCardCopy → fit.ts)을 돌린 뒤
// 추출기(extractLayout)로 뜬 스냅숏을 라우트와 같은 판정(judgeSnapshotPost)·변환(snapshotToHwpx, 카드 쪽 정의)으로 HWPX를 만듦 →
// kordoc으로 다시 읽어 카드 파서(parseCardMarkdown)로 카드 JSON → 원래 카드와 대조: ① canonicalJson 같음 ② 현행화 비교(planSync)에서 바뀐 구역 ③ 묶음(group) 알아봄.
// 원본 배치 방식(layoutHwpxFiles)도 같은 대조. 다른 칸은 경로(JSON 경로)로 모아 분류 재료로 냄(dom.diffs). 어두운 채움 점검(fill-check.ts)도 함께.
// 그림(2026-10-28): 사본의 그림 주소는 앱과 같은 모양의 서명 주소(가짜 저장소 주소 FAKE_BASE/storage/v1/object/sign/card-originals/<가짜 uid>/<키>)로 그리고
// 브라우저 요청은 가로채 원본 바이트로 답함. 서버 쪽은 라우트와 같은 함수(snapshotPictureUrls → resolvePictures — 허용 주소 판정·키 뽑기·상한·형식)에
// 원본 바이트를 읽는 가짜 저장소를 넘겨 받고, 변환에 pictures로 넘김. 화면 그림 수(<img> + 배경 url 상자)와 넣은 그림 수(그림 개체 + 그림 채우기 칸)를 견줌
// 겹침 점검(2026-10-28): 변환기의 결정론 점검(convert.ts overlapCheck — 줄 간격 < 글자 크기 × 0.9인 문단·같은 칸 안 세로 위치가 겹치는 문단) 수를 카드마다 셈 — 0이어야 함
// 글 보존 점검(2026-10-28): 화면 글 줄(스냅숏 — 숨은 사본 DOM의 보이는 글) 중 다시 읽은 한글(readHwpx)의 어느 문단에도 없는 줄 수(text-keep.ts) — 0이어야 함
// 내어쓰기 점검(2026-10-28): 부호(□·ㅇ·-·∙·※ …)로 시작하거나 글머리표인 문단 중 내어쓰기(음수 intent)가 없는 문단 수(lib/hwpx/hang.ts hangCheck) — DOM 방식(변환기 통계)과 원본 배치 방식(다시 읽은 파일).
//   0이 목표 — 남는 것은 원본 한글 파일도 내어 쓰지 않은 문단인지 원본 배치 쪽 수와 견줌
// 운영 DB·버킷은 쓰지 않음(원본 파일·카드 JSON만 읽음). AI 부르지 않음.
//
// 쓰기: node scripts/eval/card-dom-roundtrip.ts [--out <폴더>] [--only 주요사업1/1-가,…] [--keep](HTML·HWPX를 남김)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { parse, validateHwpx } from "kordoc";
import { chromium } from "playwright-core";
import { canonicalJson } from "../../lib/cards/fixed.ts";
import { cardSourceFile } from "../../lib/cards/file-names.ts";
import { parseCardMarkdown } from "../../lib/cards/hwp/parse.ts";
import { planSync } from "../../lib/cards/hwp/sync.ts";
import { cardBodyWidthMm, cardCopyBody, cardPageMm } from "../../lib/cards/hwpx-copy.ts";
import { CARD_COPY_FRAME_ATTR, CARD_COPY_READY, CARD_COPY_READY_ATTR, settleCardCopy } from "../../lib/cards/hwpx-copy-marks.ts";
import { buildLayouts } from "../../lib/cards/layout-build.ts";
import { layoutHwpxFiles } from "../../lib/cards/layout-hwpx.ts";
import { CARD_LAYOUT_CSS } from "../../lib/cards/layout-render.ts";
import { fitHwpText } from "../../lib/hwp/fit.ts";
import { readHwp5 } from "../../lib/hwp/hwp5.ts";
import { readHwpx } from "../../lib/hwp/hwpx.ts";
import { hangCheck } from "../../lib/hwpx/hang.ts";
import { writeHwpxPackage } from "../../lib/hwpx/postprocess.ts";
import { bodyMmOf, snapshotToHwpx } from "../../lib/reports/dom-hwpx/convert.ts";
import { extractLayout } from "../../lib/reports/dom-hwpx/extract.ts";
import { type PictureStorage, picturesHeader, resolvePictures, snapshotPictureUrls } from "../../lib/reports/dom-hwpx/pictures.ts";
import { DOM_HWPX_MAX_BYTES, DOM_HWPX_MAX_INFLATED, judgeSnapshotPost, parseDomHwpxPost } from "../../lib/reports/dom-hwpx/policy.ts";
import type { LayoutSnapshot } from "../../lib/reports/dom-hwpx/snapshot.ts";
import { seedCards } from "../../lib/testing/originals.ts";
import type { LooseJson } from "../../lib/loose-json.ts";
import { checkFills } from "./fill-check.ts";
import { hwpParaTexts, missingLines, screenLines } from "./text-keep.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const OUT = resolve(opt("--out") ?? join(tmpdir(), "card-dom-roundtrip"));
const ONLY = opt("--only")?.split(",");
const KEEP = args.includes("--keep");
mkdirSync(OUT, { recursive: true });

const FRAME = `[${CARD_COPY_FRAME_ATTR}]`;
/** 가짜 저장소 주소(브라우저 요청은 page.route가 가로챔 — 밖으로 나가지 않음) */
const FAKE_BASE = "https://pictures.invalid";
const BUCKET = "card-originals";
/** 저장소 키(<uid>/<키>) → 원본 그림 바이트·형식 */
const served = new Map<string, { data: Uint8Array; mime: string }>();
const fakeStorage: PictureStorage = {
  from: (bucket) => ({
    download: async (path) => {
      const f = bucket === BUCKET ? served.get(path) : undefined;
      return { data: f ? new Blob([Uint8Array.from(f.data)]) : null };
    },
  }),
};
const VERSION = "측정";
/** 화면과 같은 CSS: 앱 전역(tailwind preflight·body 줄 나눔 — app/globals.css) + 카드 양식(card.css — app/(app)/layout.tsx가 불러옴). 원본 배치 CSS는 본문 앞 <style>(card-editor.tsx와 같음) */
const BASE_CSS = [readFileSync(join(ROOT, "node_modules/tailwindcss/preflight.css"), "utf8"), "body{word-break:keep-all;overflow-wrap:anywhere}", readFileSync(join(ROOT, "lib/cards/card.css"), "utf8")].join("\n");

type Built = { card: any; layout: any; images: { key: string; data: Uint8Array; mime: string }[] };
const cards = seedCards();
const items: Built[] = [];
for (const g of [1, 2, 3]) {
  const cs = cards.filter((c) => c.id.startsWith(`주요사업${g}/`));
  for (const b of buildLayouts(readHwp5(readFileSync(join(ROOT, "data/cards/260916", cardSourceFile(g)))), cs).built) items.push({ card: cs[b.index], layout: b.layout, images: b.images });
}
const todo = ONLY ? items.filter((x) => ONLY.includes(x.card.id)) : items;

/** JSON 두 값의 다른 경로(배열 번호 포함) */
function diffPaths(a: any, b: any, path = "", out: string[] = []): string[] {
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], path ? `${path}.${k}` : k, out);
  } else if (canonicalJson(a ?? null) !== canonicalJson(b ?? null)) out.push(path);
  return out;
}
async function readBack(bytes: Uint8Array, want: LooseJson) {
  const r: any = await parse(Buffer.from(bytes));
  if (!r.success) return { ok: false, why: `kordoc 읽기 실패 ${r.code ?? ""}` };
  const res = parseCardMarkdown(r.markdown, { sourceName: "x.hwpx", fileType: "hwpx" });
  if (res.cards.length !== 1) return { ok: false, why: `카드 ${res.cards.length}장`, md: r.markdown };
  const back = res.cards[0];
  const changed = planSync(want, back)
    .blocks.filter((b) => b.status !== "same")
    .map((b) => b.key);
  const same = canonicalJson(back) === canonicalJson(want);
  return { ok: true, group: res.group.id === (want as any).group, same, changed, diffs: same ? [] : diffPaths(want, back), md: r.markdown, back };
}

const rows: any[] = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // 창 높이를 카드보다 크게: 창 밖 글은 스크린숏(채움 점검)을 찍을 때 처음 그려지며 글꼴이 뒤늦게 붙어 배치가 바뀜(2026-10-28 확인 — 1/9-가 칩 1.8mm 밀림)
  const page = await browser.newPage({ viewport: { width: 1400, height: 7000 }, deviceScaleFactor: 1 });
  await page.route(`${FAKE_BASE}/**`, async (route) => {
    const u = new URL(route.request().url());
    const key = decodeURIComponent(u.pathname.replace(`/storage/v1/object/sign/${BUCKET}/`, ""));
    const f = served.get(key);
    await (f ? route.fulfill({ status: 200, contentType: f.mime, body: Buffer.from(f.data) }) : route.fulfill({ status: 404, body: "" }));
  });
  let seq = 0;
  for (const it of todo) {
    const id: string = it.card.id;
    const name = id.replace(/\//g, "_");
    const row: any = { id };
    // ── 원본 배치 방식
    const imgs = new Map(it.images.map((im) => [im.key, { data: im.data, ext: im.key.split(".").pop() ?? "png" }]));
    const layBytes = (await writeHwpxPackage(layoutHwpxFiles(it.card, it.layout, imgs)!)).bytes;
    const lay = await readBack(layBytes, it.card);
    row.layout = lay.ok ? { group: lay.group, same: lay.same, changed: lay.changed, diffs: lay.diffs } : { error: lay.why };
    {
      const doc = await readHwpx(layBytes);
      const hc = hangCheck({ doc, paras: doc.sections.flatMap((x) => x.paras) });
      row.hangLayout = { marked: hc.marked, flat: hc.flat, samples: hc.samples };
    }
    // ── DOM 방식
    const uid = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
    for (const im of it.images) served.set(`${uid}/${im.key}`, { data: im.data, mime: im.mime });
    const urls = new Map(it.images.map((im) => [im.key, `${FAKE_BASE}/storage/v1/object/sign/${BUCKET}/${uid}/${encodeURIComponent(im.key)}?token=measure`]));
    const body = cardCopyBody(it.card, it.layout, (k) => urls.get(k) ?? null);
    if (!body) {
      row.dom = { error: "배치에 얹지 못함" };
      rows.push(row);
      continue;
    }
    // 사본 HTML의 그림: <img>와 배경 그림(칸 그림 채우기 — url(…))
    row.images = (body.match(/<img\b/g) ?? []).length + (body.match(/url\((?:'|&quot;|")?https:\/\/pictures\.invalid/g) ?? []).length;
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${name}</title><style>${BASE_CSS}</style></head><body><style>${CARD_LAYOUT_CSS}</style>${body}</body></html>`;
    if (KEEP) writeFileSync(join(OUT, `${name}.html`), html);
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(`(${settleCardCopy})(document, ${fitHwpText}, ${JSON.stringify({ frameAttr: CARD_COPY_FRAME_ATTR, readyAttr: CARD_COPY_READY_ATTR, ready: CARD_COPY_READY })})`);
    // 사본 뜨기(capture.ts)처럼: 문서 변경이 400ms 없고 600ms 지날 때까지(최대 8초) — 뒤늦게 받은 글꼴로 다시 맞춘 뒤에 뜸
    await page.evaluate(
      () =>
        new Promise<void>((res) => {
          const t0 = Date.now();
          let last = Date.now();
          const mo = new MutationObserver(() => (last = Date.now()));
          mo.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true });
          const tick = () => {
            if ((Date.now() - last >= 400 && Date.now() - t0 >= 600) || Date.now() - t0 > 8000) {
              mo.disconnect();
              res();
            } else setTimeout(tick, 50);
          };
          tick();
        }),
    );
    // 화면 그림 수: 본문 틀 안 보이는 <img>와 계산된 배경에 url(…)이 있는 요소(그린 화면 기준)
    row.screen = await page.evaluate((sel) => {
      const fr = document.querySelector(sel) as Element;
      const els = [fr, ...Array.from(fr.querySelectorAll("*"))];
      const img = els.filter((e) => e.tagName === "IMG").length;
      const bg = els.filter((e) => getComputedStyle(e).backgroundImage.includes("url(")).length;
      return { img, bg };
    }, FRAME);
    const t0 = Date.now();
    const snap = (await page.evaluate(`(${extractLayout})(document.querySelector(${JSON.stringify(FRAME)}))`)) as LayoutSnapshot;
    row.extractMs = Date.now() - t0;
    const text = JSON.stringify({ version: VERSION, snapshot: snap });
    if (KEEP) writeFileSync(join(OUT, `${name}.snapshot.json`), JSON.stringify(snap));
    row.bytes = Buffer.byteLength(text);
    let nodes = 0;
    const count = (n: any) => {
      nodes++;
      if (n.kind === "box") n.children.forEach(count);
    };
    count(snap.root);
    row.nodes = nodes;
    row.frame = `${snap.frame.w.toFixed(1)}×${snap.frame.h.toFixed(1)}`;
    const pageMm = cardPageMm(it.layout);
    row.bodyW = cardBodyWidthMm(it.layout);
    // 브라우저는 gzip으로 줄여 보냄(dom-hwpx-download.tsx) — 라우트 상한은 줄인 크기·풀린 크기
    row.gzBytes = gzipSync(text).length;
    const pre = parseDomHwpxPost({ authed: true, tooLarge: row.gzBytes > DOM_HWPX_MAX_BYTES || row.bytes > DOM_HWPX_MAX_INFLATED, text });
    const judged = pre.ok ? judgeSnapshotPost({ body: pre.body, version: VERSION, frameW: row.bodyW }) : pre;
    row.judge = judged.ok ? 200 : `${judged.status} ${judged.message}`;
    // 그림 받기: 라우트와 같은 함수(허용 주소 판정·키 뽑기·상한·형식) — 저장소만 원본 바이트를 읽는 가짜
    const pics = await resolvePictures(snapshotPictureUrls(snap), { base: FAKE_BASE, bucket: BUCKET, folder: uid, storage: fakeStorage });
    row.picHeader = picturesHeader(pics);
    // 판정이 막아도(크기 등) 변환·왕복은 잼(분류 재료)
    const { bytes, stats, approx, fills } = await snapshotToHwpx(snap, { lines: false, title: id, page: pageMm, splitOverMm: bodyMmOf(pageMm).h / 4, pictures: pics.pictures });
    row.placed = { images: stats.images, fills: stats.imageFills, voids: stats.imageVoids };
    {
      const zip = await (await import("jszip")).default.loadAsync(bytes);
      const sec = await zip.file("Contents/section0.xml")!.async("string");
      const head = await zip.file("Contents/header.xml")!.async("string");
      // 파일 안 그림 채우기 칸 = 칸이 가리키는 테두리/배경 중 imgBrush가 있는 것
      const imgFills = new Set([...head.matchAll(/<hh:borderFill id="(\d+)"[^>]*>(?:(?!<\/hh:borderFill>)[\s\S])*?<hc:imgBrush/g)].map((m) => m[1]));
      const cellBf = [...sec.matchAll(/<hp:tc [^>]*borderFillIDRef="(\d+)"/g)].map((m) => m[1]);
      row.inFile = { pics: (sec.match(/<hp:pic /g) ?? []).length, fillCells: cellBf.filter((x) => imgFills.has(x)).length, bins: Object.keys(zip.files).filter((f) => f.startsWith("BinData/")).length };
    }
    if (KEEP) writeFileSync(join(OUT, `${name}.dom.hwpx`), bytes);
    const v: any = await (validateHwpx as any)(Buffer.from(bytes));
    const dom = await readBack(bytes, it.card);
    row.dom = dom.ok ? { group: dom.group, same: dom.same, changed: dom.changed, diffs: dom.diffs } : { error: dom.why };
    if (KEEP && dom.md) writeFileSync(join(OUT, `${name}.dom.md`), dom.md);
    if (KEEP && (dom as any).back) writeFileSync(join(OUT, `${name}.dom.json`), JSON.stringify((dom as any).back, null, 1));
    row.valid = v.ok ? "ok" : "실패";
    row.stats = `표 ${stats.tables} · 칸 ${stats.cells} · 나눔 ${stats.split}`;
    row.overlap = { tight: stats.tight, stacked: stats.stacked };
    row.hang = { marked: stats.marked, flat: stats.flat };
    {
      const lines = screenLines(snap);
      const lost = missingLines(lines, hwpParaTexts(await readHwpx(bytes)));
      row.textLines = lines.length;
      row.lost = lost.length;
      if (lost.length) row.lostList = lost.map((l) => `${l.text} @${l.x.toFixed(1)},${l.y.toFixed(1)}`);
    }
    row.approx = approx.reduce((a, x) => a + x.count, 0);
    row.approxList = approx.map((x) => `${x.kind} ${x.count}`);
    const fc = await checkFills(page as any, FRAME, snap.frame.w, fills);
    row.fills = `${fc.bad.length}/${fc.checked}`;
    if (fc.bad.length) row.fillBad = fc.bad;
    rows.push(row);
    const d = row.dom;
    console.log(`${id}: 그림 화면 ${row.screen.img}+${row.screen.bg} → 넣음 ${row.placed.images}+${row.placed.fills}(빈 자리 ${row.placed.voids}, 파일 pic ${row.inFile.pics}·채우기 칸 ${row.inFile.fillCells}) [${row.picHeader}]`);
    console.log(`${id}: 원본 배치 ${row.layout.same ? "같음" : `다름(${(row.layout.changed ?? []).length}구역)`} · DOM ${d.error ?? (d.same ? "같음" : `다름 — 바뀐 구역 ${d.changed.length} [${d.changed.join(",")}] · 다른 경로 ${d.diffs.length}`)}${d.group === false ? " · 묶음 못 알아봄" : ""} · 판정 ${row.judge} · ${(row.bytes / 1024).toFixed(0)}KB(gzip ${(row.gzBytes / 1024).toFixed(0)}KB)·노드 ${row.nodes} · 채움 ${row.fills} · 겹침 ${row.overlap.tight}+${row.overlap.stacked} · 내어쓰기 없음 ${row.hang.flat}/${row.hang.marked}(원본 배치 ${row.hangLayout.flat}/${row.hangLayout.marked}) · 빠진 글 줄 ${row.lost}/${row.textLines}`);
    for (const l of row.lostList ?? []) console.log(`   빠진 글 줄: ${l}`);
  }
} finally {
  await browser.close();
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(rows, null, 1));
const n = rows.length;
const cnt = (f: (r: any) => boolean) => rows.filter(f).length;
console.log(`\n| 방식 | 같은 카드(canonicalJson) | 현행화 비교 바뀐 구역 0 | 묶음 알아봄 |`);
console.log("|---|---|---|---|");
console.log(`| 원본 배치 | ${cnt((r) => r.layout.same)}/${n} | ${cnt((r) => r.layout.changed?.length === 0)}/${n} | ${cnt((r) => r.layout.group)}/${n} |`);
console.log(`| DOM(화면 그대로) | ${cnt((r) => r.dom.same)}/${n} | ${cnt((r) => r.dom.changed?.length === 0)}/${n} | ${cnt((r) => r.dom.group)}/${n} |`);
const paths = new Map<string, number>();
for (const r of rows) for (const p of new Set<string>((r.dom.diffs ?? []).map((x: string) => x.replace(/\.\d+(?=\.|$)/g, ".#")))) paths.set(p, (paths.get(p) ?? 0) + 1);
console.log("\nDOM 방식 다른 경로(카드 수):");
for (const [p, c] of [...paths].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${c}\t${p}`);
console.log(`\n판정 200: ${cnt((r) => r.judge === 200)}/${n} · gzip 2MB 넘음 ${cnt((r) => r.gzBytes > DOM_HWPX_MAX_BYTES)} · 스냅숏 최대 ${(Math.max(...rows.map((r) => r.bytes ?? 0)) / 1048576).toFixed(1)}MB(gzip ${(Math.max(...rows.map((r) => r.gzBytes ?? 0)) / 1024).toFixed(0)}KB) · 노드 최대 ${Math.max(...rows.map((r) => r.nodes ?? 0))} · 채움 어긋남 합 ${rows.reduce((a, r) => a + Number(String(r.fills ?? "0/0").split("/")[0]), 0)}`);
const sum = (f: (r: any) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0);
console.log(`\n그림: 사본 HTML ${sum((r) => r.images)}개 · 화면 <img> ${sum((r) => r.screen?.img)} + 배경 url ${sum((r) => r.screen?.bg)} = ${sum((r) => (r.screen?.img ?? 0) + (r.screen?.bg ?? 0))}`);
console.log(`넣음: 그림 개체 ${sum((r) => r.placed?.images)} + 그림 채우기 칸 ${sum((r) => r.placed?.fills)} = ${sum((r) => (r.placed?.images ?? 0) + (r.placed?.fills ?? 0))} · 빈 자리 ${sum((r) => r.placed?.voids)} · 파일 안 pic ${sum((r) => r.inFile?.pics)}(SVG 포함)·채우기 칸 ${sum((r) => r.inFile?.fillCells)}`);
console.log(`겹침 점검: 줄 간격 < 글자 × 0.9 문단 합 ${sum((r) => r.overlap?.tight)} · 같은 칸 세로 겹침 문단 합 ${sum((r) => r.overlap?.stacked)} · 겹침 0인 카드 ${cnt((r) => r.overlap && r.overlap.tight + r.overlap.stacked === 0)}/${n}`);
console.log(`내어쓰기 점검: DOM 부호·글머리표 문단 ${sum((r) => r.hang?.marked)} 중 내어쓰기 없음 ${sum((r) => r.hang?.flat)} · 원본 배치 ${sum((r) => r.hangLayout?.marked)} 중 ${sum((r) => r.hangLayout?.flat)} · 없음 0인 카드 DOM ${cnt((r) => r.hang?.flat === 0)}/${n}`);
console.log(`검증(validateHwpx) 통과 ${cnt((r) => r.valid === "ok")}/${n}`);
console.log(`글 보존: 화면 글 줄 ${sum((r) => r.textLines)} 중 한글 문단에 없는 줄 ${sum((r) => r.lost)} · 빠진 줄 0인 카드 ${cnt((r) => r.lost === 0)}/${n}`);
console.log(`화면 그림 수 = 넣은 수인 카드 ${cnt((r) => r.screen && r.screen.img + r.screen.bg === r.placed.images + r.placed.fills)}/${n}`);
console.log(`출력: ${OUT}`);
