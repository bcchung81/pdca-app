// 261103판 카드 원본(주요사업 56장·경영관리 47장 — 지금 운영 원장의 판): 원본 배치로 내려받은 한글(HWPX)을 다시 올리면(kordoc → 카드 파서 → 현행화 비교)
// 같은 카드인지, 원본 배치 화면에서 한 칸이 편집 칸 하나로 그려지는지 봅니다(59장·43장 시험은 9.16판·9.04판 — layout-hwpx*.test.ts).
// 남은 예외(KNOWN)는 잇기·파서 구조 문제로 원장·배치를 다시 적재해야 풀리는 카드 — 고치면 목록에서 뺍니다.
// 원본(data/cards/261103 — git 밖)이 이 컴퓨터에 있을 때만 돕니다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "kordoc";
import { readHwp5 } from "../hwp/hwp5.ts";
import type { CardLayout } from "../hwp/layout.ts";
import { writeHwpxPackage } from "../hwpx/postprocess.ts";
import { parseCardGroups } from "./hwp/parse.ts";
import { parseMgmtMarkdown } from "./hwp/parse-mgmt.ts";
import { planSync } from "./hwp/sync.ts";
import { buildLayouts } from "./layout-build.ts";
import { layoutHwpxFiles } from "./layout-hwpx.ts";
import { renderLayoutCard } from "./layout-render.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DIR = join(resolve(import.meta.dirname, "../.."), "data/cards/261103");
const FILES = [
  { name: "cards-261103-biz.hwp", mg: false },
  { name: "cards-261103-mg.hwp", mg: true },
];
const has = FILES.every((f) => existsSync(join(DIR, f.name)));
const SKIP = !has && "261103판 카드 원본 없음(data/cards/261103 — git 밖)";

/**
 * 남은 예외 없음(2026-11-10 5단계): 13-4·13-5 계량 부칸 「대표」는 행마다 한 지표로(parse-mgmt.ts splitNameSpan), 2/4-가 두 문단 과제명 가운데 과제번호는
 * 가운데 조각의 괄호 고정 글로(layout-bind.ts midPart·postEdges, layout-render.ts shapeCellParts), 3/1-가·3/2-나 글줄 사이 딱지 표는 「앞 글 · 표 · 뒤 글」을 한 덩이로 맞춤(alignGrouped)
 */
const KNOWN: string[] = [];

type Item = { mg: boolean; card: any; layout: CardLayout };
let cache: Item[] | null = null;
async function load(): Promise<Item[]> {
  if (cache) return cache;
  const items: Item[] = [];
  for (const f of FILES) {
    const bytes = readFileSync(join(DIR, f.name));
    const md = ((await parse(bytes, { images: false })) as any).markdown as string;
    const cards: any[] = f.mg ? parseMgmtMarkdown(md, { sourceName: f.name, fileType: "hwp" }).cards : parseCardGroups(md, { sourceName: f.name, fileType: "hwp" }).flatMap((g) => g.cards);
    for (const b of buildLayouts(readHwp5(bytes), cards).built) items.push({ mg: f.mg, card: cards[b.index], layout: b.layout });
  }
  cache = items;
  return items;
}

async function reread(x: Item): Promise<any[]> {
  const r: any = await parse(Buffer.from((await writeHwpxPackage(layoutHwpxFiles(x.card, x.layout, new Map())!)).bytes), { images: false });
  assert.ok(r.success, x.card.id);
  return x.mg ? parseMgmtMarkdown(r.markdown, { sourceName: "x.hwpx", fileType: "hwpx" }).cards : parseCardGroups(r.markdown, { sourceName: "x.hwpx", fileType: "hwpx" }).flatMap((g) => g.cards);
}

/** 원본 배치 화면에서 글로 찾은 문단(.hw-p)의 보이는 글(번호 머리 포함) */
function paraText(html: string, needle: string): string | null {
  for (const m of html.matchAll(/<div class="hw-p[^"]*"[^>]*>(.*?)<\/div>/g)) {
    const t = m[1]
      .replace(/data-head="([^"]*)"[^>]*>/g, ">$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'");
    if (t.includes(needle)) return t;
  }
  return null;
}

test("261103판 103장: 원본 배치로 내려받은 한글 파일을 다시 올리면 같은 카드(남은 예외는 KNOWN)", { skip: SKIP }, async () => {
  const items = await load();
  assert.equal(items.length, 103);
  const bad: string[] = [];
  for (const x of items) {
    const back = await reread(x);
    const ok = back.length === 1 && back[0].id === x.card.id && (() => {
      const plan = planSync(x.card, back[0]);
      return !plan.blocks.some((b) => b.status !== "same") && !plan.risks.length;
    })();
    if (!ok) bad.push(x.card.id);
  }
  assert.deepEqual(bad.sort(), [...KNOWN].sort());
});

test("261103판: 줄바꿈으로 나뉜 과제명 + 과제번호 문단은 편집 칸 하나에 과제명 한 번, 번호 세기가 갈린 문단은 카드 번호 한 번", { skip: SKIP }, async () => {
  const items = await load();
  const pick = (id: string) => items.find((x) => x.card.id === id)!;
  // 1/4-나: 「에너지 효율 실증을 통한 / 친환경 기지국 인증제도 고도화 / (과제번호 : 4-나)」 — 조각마다 과제명 전체가 들어가 두 번 보이던 것
  const a = pick("주요사업1/4-나");
  const html = renderLayoutCard(a.card, a.layout, { editable: true })!;
  assert.equal(html.match(/data-p="title"/g)?.length, 1);
  const shown = paraText(html, "인증제도")!;
  assert.equal(shown.split("인증제도 고도화").length - 1, 1, shown);
  assert.match(shown, /\(과제번호 : 4-나\)/);
  // 한글 파일에도 과제명 한 번, 과제번호 그대로
  const back = (await reread(a))[0];
  assert.equal(back.title, a.card.title);
  assert.equal(back.taskNo, "4-나");
  // 2/7-나·3/7-나: 원본 배치는 「다.」·「라.」, 카드 JSON은 「가.」 — 머리 번호와 본문 번호가 겹쳐 「다. 가. …」로 보이던 것
  for (const [id, needle] of [
    ["주요사업2/7-나", "부적합 판정이 어려울"],
    ["주요사업3/7-나", "hwp, pdf 혼재"],
  ] as const) {
    const x = pick(id);
    const t = paraText(renderLayoutCard(x.card, x.layout, { editable: true })!, needle)!;
    assert.match(t, /^가\.\s/, `${id}: ${t}`);
    assert.doesNotMatch(t, /^[가-힣]\.\s*[가-힣]\.\s/, `${id}: ${t}`);
  }
});

test("261103판 월별 상자: 카드 표가 [Do]에서 끊겨 뒤 표로 이어진 카드(3/3-가)·「3월 ~ 10월 실적」 딱지(3/4-나)도 월별 실적·Check·추진성과를 읽음", { skip: SKIP }, async () => {
  const items = await load();
  const card = (id: string) => items.find((x) => x.card.id === id)!.card;
  const a = card("주요사업3/3-가");
  assert.deepEqual(a.do.monthly.map((m: any) => m.period), ["1월~10월"]);
  assert.ok(a.do.monthly[0].items.length > 5);
  assert.ok(a.check.items.length > 0 && a.outcome.quantitative.length > 0 && a.outcome.qualitative.length > 0);
  assert.ok(!a.parseWarnings.some((w: string) => w.startsWith("없는 구역")), a.parseWarnings.join(" / "));
  const b = card("주요사업3/4-나");
  assert.deepEqual(b.do.monthly.map((m: any) => m.period), ["3월~10월"]);
  assert.equal(b.do.grid ?? null, null);
});

/** 편집 칸 요소의 글(textContent에 가까움 — 태그를 걷고 줄바꿈 자리 「<br>」는 빈칸). 원본 모양 글자(data-c, CSS로만 그림)는 글이 아님 */
function editText(html: string, path: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<(span|div|td)\\b[^>]*data-p="${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`, "g");
  for (const m of html.matchAll(open)) {
    // 같은 이름 태그의 짝을 세어 요소 끝을 찾음
    const tag = m[1];
    let depth = 1;
    let i = m.index! + m[0].length;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
    re.lastIndex = i;
    let e: RegExpExecArray | null;
    while (depth && (e = re.exec(html))) {
      depth += e[1] ? -1 : 1;
      i = e.index;
    }
    out.push(html.slice(m.index! + m[0].length, i).replace(/<br>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  }
  return out;
}

test("261103판 편집 칸 글 = 카드 JSON(리뷰 OK1): 줄바꿈으로 나뉜 과제명 덩이(1/4-나)·두 문단 과제명(2/4-가)·번호 머리를 JSON에서 가져온 문단(2/7-나)", { skip: SKIP }, async () => {
  const items = await load();
  const pick = (id: string) => items.find((x) => x.card.id === id)!;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const squash = (s: string) => s.replace(/\s+/g, "");
  const a = pick("주요사업1/4-나");
  assert.deepEqual(editText(renderLayoutCard(a.card, a.layout, { editable: true })!, "title").map(norm), [norm(a.card.title)]);
  // 두 문단 과제명은 칸째 편집(문단 나눔은 줄바꿈 → 편집기가 빈칸으로) — 가운데 「(과제번호 : 4-가)」는 원본 모양 글자라 글에 안 들어감
  const b = pick("주요사업2/4-가");
  assert.deepEqual(editText(renderLayoutCard(b.card, b.layout, { editable: true })!, "title").map(squash), [squash(b.card.title)]);
  const c = pick("주요사업2/7-나");
  const html = renderLayoutCard(c.card, c.layout, { editable: true })!;
  const path = "axAttachments.0.sections.1.items.2";
  assert.deepEqual(editText(html, path).map(norm), [norm(c.card.axAttachments[0].sections[1].items[2])]);
});
