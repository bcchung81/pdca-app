// 원본 배치 과제명 칸의 고정 글(「(과제번호 : …)」)과 부제: 화면에 원본 그대로 한 번씩 보이고, 한글(HWPX)로 내려받아 다시 읽어도 같은 과제번호·과제명인지 봅니다.
// 과제번호 글은 편집 칸 밖 고정 글이라 「편집 칸 글 = JSON」 전수 시험(edit-text.test.ts)이 못 봄 — 두 문단 과제명 가운데 「(과제번호 : 4-가)」가
// 잇기에서 빠져(칸 하나로 잡혀) 과제명이 첫 문단을 덮어 과제번호가 사라지고 부제가 두 번 보이던 261103판 2/4-가(11-05 운영 배치, 11-10 잇기 고침 앞).
// 화면 글은 원본 모양 글자(data-c, CSS로만 그림)도 보이는 글로 셈. 원본(git 밖)이 있을 때만 돎.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "kordoc";
import { readHwp5 } from "../hwp/hwp5.ts";
import type { CardLayout } from "../hwp/layout.ts";
import type { Para } from "../hwp/model.ts";
import { writeHwpxPackage } from "../hwpx/postprocess.ts";
import { parseCardGroups } from "./hwp/parse.ts";
import { parseMgmtMarkdown } from "./hwp/parse-mgmt.ts";
import { type BoundPara, keyOf, paraText } from "./layout-bind.ts";
import { buildLayouts } from "./layout-build.ts";
import { layoutHwpxFiles } from "./layout-hwpx.ts";
import { renderLayoutCard } from "./layout-render.ts";
import { cardSourceFile } from "./file-names.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = resolve(import.meta.dirname, "../..");
const BIZ916 = [1, 2, 3].map((g) => join(ROOT, "data/cards/260916", cardSourceFile(g)));
const MG904 = join(ROOT, "data/cards/260904/cards-260904-mg.hwp");
const P1103 = ["cards-261103-biz.hwp", "cards-261103-mg.hwp"].map((n) => join(ROOT, "data/cards/261103", n));

type Item = { mg: boolean; card: any; layout: CardLayout };

const mdOf = async (bytes: Uint8Array) => ((await parse(Buffer.from(bytes), { images: false })) as any).markdown as string;
const mgCards = (md: string, name: string, type: "hwp" | "hwpx") => parseMgmtMarkdown(md, { sourceName: name, fileType: type }).cards as any[];
const bizCards = (md: string, name: string, type: "hwp" | "hwpx") => parseCardGroups(md, { sourceName: name, fileType: type }).flatMap((g) => g.cards) as any[];
const built = (bytes: Uint8Array, cards: any[], mg: boolean): Item[] => buildLayouts(readHwp5(bytes), cards).built.map((b) => ({ mg, card: cards[b.index], layout: b.layout }));

/** 문단 전부(표 칸·글상자 안까지) */
function walk(ps: Para[], f: (p: Para) => void) {
  for (const p of ps) {
    f(p);
    for (const it of p.items)
      if (it.kind === "obj") {
        const o = it.obj;
        if (o.kind === "table") for (const c of o.cells) walk(c.paras, f);
        else if (o.kind !== "pic" && o.text) walk(o.text.paras, f);
      }
  }
}
function allParas(l: CardLayout): Para[] {
  const out: Para[] = [];
  for (const b of l.blocks) walk(b.kind === "table" ? b.table.cells.flatMap((c) => c.paras) : [b.para], (p) => out.push(p));
  return out;
}

/** 과제명 칸(과제명에 이은 문단이 있는 칸)과 「과제번호 : …」 칸의 문단 열쇠들 — 첫 표에서 */
function titleKeys(l: CardLayout): string[] {
  const first = l.blocks.find((b) => b.kind === "table");
  if (!first || first.kind !== "table") return [];
  const cells = first.table.cells.filter((c) => c.paras.some((p) => (p as BoundPara).bind?.some((a) => a?.path === "title")) || c.paras.some((p) => /과제\s*번호\s*[:：]/.test(paraText(p))));
  return cells.flatMap((c) => c.paras.map((p) => keyOf(paraText(p)))).filter(Boolean);
}

/** 화면에 보이는 글의 열쇠: 원본 모양 글자(data-c)도 글로, 태그는 걷음 */
const shownKey = (html: string) =>
  keyOf(
    html
      .replace(/<[^>]*\sdata-c="([^"]*)"[^>]*>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&"),
  );
const count = (hay: string, k: string) => hay.split(k).length - 1;
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * 카드마다 과제명 칸 문단이 화면에 원본과 같은 수만큼(과제번호 빠짐·부제 겹침 없음), 다시 읽은 한글 파일이 같은 과제번호·과제명 — 어긋난 카드 목록과
 * 과제명 칸(같은 행 칸)에 「(과제번호 : …)」 문단이 있는 카드 수
 */
async function check(items: Item[]): Promise<{ marks: number; bad: string[] }> {
  let marks = 0;
  const bad: string[] = [];
  for (const x of items) {
    const keys = titleKeys(x.layout);
    if (keys.some((k) => /\(과제번호[:：]/.test(k))) marks++;
    const orig = keyOf(allParas(x.layout).map(paraText).join(""));
    const shown = shownKey(renderLayoutCard(x.card, x.layout, { editable: false }) ?? "");
    for (const k of keys) if (count(shown, k) !== count(orig, k)) bad.push(`${x.card.id} 화면 「${k.slice(0, 20)}」 ${count(shown, k)}번(원본 ${count(orig, k)}번)`);
    const r: any = await parse(Buffer.from((await writeHwpxPackage(layoutHwpxFiles(x.card, x.layout, new Map())!)).bytes), { images: false });
    const back = (x.mg ? mgCards : bizCards)(r.markdown, "x.hwpx", "hwpx");
    if (back.length !== 1 || back[0].taskNo !== x.card.taskNo || norm(back[0].title) !== norm(x.card.title)) bad.push(`${x.card.id} 한글 다시 읽기: 과제번호 ${back[0]?.taskNo ?? "없음"} · 과제명 ${norm(back[0]?.title) === norm(x.card.title) ? "같음" : "다름"}`);
  }
  return { marks, bad };
}

test("261103판 103장: 과제명 칸의 「(과제번호 : …)」·부제가 화면에 원본대로 한 번씩, 내려받은 한글 파일을 다시 읽어도 같은 과제번호·과제명", { skip: !P1103.every(existsSync) && "261103판 원본 없음(data/cards/261103 — git 밖)" }, async () => {
  const items: Item[] = [];
  for (const [k, f] of P1103.entries()) {
    const bytes = new Uint8Array(readFileSync(f));
    const md = await mdOf(bytes);
    items.push(...built(bytes, k ? mgCards(md, "mg.hwp", "hwp") : bizCards(md, "biz.hwp", "hwp"), Boolean(k)));
  }
  assert.equal(items.length, 103);
  const { marks, bad } = await check(items);
  // 두 파일 모두 카드마다 과제명 칸(또는 같은 행 칸)에 「(과제번호 : …)」 글이 있음
  assert.equal(marks, 103);
  assert.deepEqual(bad, []);
});

test("9.16판 59장: 과제명 칸의 「(과제번호 : …)」·부제가 화면에 원본대로 한 번씩, 다시 읽어도 같은 과제번호·과제명", { skip: NO_SEED_CARDS || (!BIZ916.every(existsSync) && "9.16판 원본 한글 파일 없음") }, async () => {
  const all = seedCards<any>();
  const items = [1, 2, 3].flatMap((g, k) => built(new Uint8Array(readFileSync(BIZ916[k])), all.filter((c) => c.id.startsWith(`주요사업${g}/`)), false));
  assert.equal(items.length, 59);
  const { marks, bad } = await check(items);
  assert.equal(marks, 59);
  assert.deepEqual(bad, []);
});

test("경영관리 9.04판 43장: 과제명 칸의 「(과제번호 : …)」가 화면에 원본대로 한 번씩, 다시 읽어도 같은 과제번호·과제명", { skip: !existsSync(MG904) && "경영관리 9.04판 원본 없음" }, async () => {
  const bytes = new Uint8Array(readFileSync(MG904));
  const items = built(bytes, mgCards(await mdOf(bytes), "mg.hwp", "hwp"), true);
  assert.equal(items.length, 43);
  const { marks, bad } = await check(items);
  assert.equal(marks, 43);
  assert.deepEqual(bad, []);
});
