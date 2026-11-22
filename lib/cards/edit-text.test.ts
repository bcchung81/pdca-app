// 원본 배치 편집 칸 글 = 카드 JSON(CLAUDE.md 「과제관리카드는 원본 그대로」 — 편집기는 고칠 때 칸의 innerText 전체를 applyText로 씀, components/cards/card-editor.tsx commit).
// 고칠 수 있는 칸(contenteditable)마다 칸 안 글(태그를 걷은 글 — CSS로만 그리는 원본 모양 글자 data-c는 글이 아님, 공백 무시)이 JSON 값과 같아야 함.
// 딱지 표·고정 글이 칸 안에 끼어 글이 섞이는 칸은 고르기만(QA Q1-04·Q1-05). 원본(git 밖)이 있을 때만 돎.
// 고르기만으로 돌린 칸(돌리기 전 HTML의 mixedEditPaths)은 판마다 고정 목록(KNOWN)과 같아야 함 — 렌더러가 칸 글을 틀리게 그리면
// 그 칸이 조용히 고르기만으로 바뀌어 아래 「남은 칸 = JSON」 검사를 빠져나가므로, 목록에 새로 든 칸으로 잡음
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "kordoc";
import { readHwp5 } from "../hwp/hwp5.ts";
import { parseCardGroups } from "./hwp/parse.ts";
import { parseMgmtMarkdown } from "./hwp/parse-mgmt.ts";
import { buildLayouts } from "./layout-build.ts";
import { mixedEditPaths, renderLayoutCard } from "./layout-render.ts";
import { valueAt } from "./patch.ts";
import { cardSourceFile } from "./file-names.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = resolve(import.meta.dirname, "../..");
const BIZ916 = [1, 2, 3].map((g) => join(ROOT, "data/cards/260916", cardSourceFile(g)));
const MG904 = join(ROOT, "data/cards/260904/cards-260904-mg.hwp");
const P1103 = ["cards-261103-biz.hwp", "cards-261103-mg.hwp"].map((n) => join(ROOT, "data/cards/261103", n));
const VOID = new Set(["br", "img", "col", "hr", "wbr", "input", "meta", "link", "source"]);
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const squash = (s: string) => s.replace(/\s+/g, "");

/** 판마다 고르기만으로 돌린 칸(카드 id 경로, 나온 차례) — 딱지 표·과제번호 글이 낀 칸, □/☐ 모양만 다른 칸(QA Q1-04·Q1-07) */
const KNOWN = {
  biz916: ["주요사업3/1-가 overview.cells.4", "주요사업3/1-나 overview.cells.4"],
  mg904: ["경영관리6/6-4 title"],
  p1103: ["주요사업3/1-가 do.lines.15", "주요사업3/1-가 do.lines.18", "주요사업3/2-나 do.lines.2", "경영관리6/6-4 title"],
};

/** 고칠 수 있는 칸마다 [경로, 칸 안 글] — 같은 이름 태그의 짝을 세어 요소 끝을 찾음 */
function editableCells(html: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of html.matchAll(/<([a-z]+)\b([^>]*\scontenteditable="[^"]*"[^>]*)>/g)) {
    const path = /\sdata-p="([^"]+)"/.exec(m[2])?.[1];
    if (!path) continue;
    const tag = m[1];
    let depth = 1;
    let end = m.index! + m[0].length;
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
    re.lastIndex = end;
    let e: RegExpExecArray | null;
    while (depth && (e = re.exec(html))) {
      if (!e[1] && VOID.has(tag)) continue;
      depth += e[1] ? -1 : 1;
      end = e.index;
    }
    out.push([unesc(path), unesc(html.slice(m.index! + m[0].length, end).replace(/<[^>]+>/g, ""))]);
  }
  return out;
}

/** 칸 글 ≠ JSON인 칸 목록(카드 id 경로 :: 칸 글 ≠ JSON) */
function mismatches(card: any, html: string): string[] {
  return editableCells(html)
    .filter(([path, text]) => {
      const v = valueAt(card, path);
      // 머리 칸은 JSON이 비면 양식 기본 이름을 보임(render.ts·render-mgmt.ts와 같음 — 고치면 그 이름이 들어갈 뿐 보이는 글은 같음)
      if (/\.headers\./.test(path) && (v === undefined || v === null || v === "")) return false;
      return typeof v !== "object" && squash(text) !== squash(String(v ?? ""));
    })
    .map(([path, text]) => `${card.id} ${path} :: ${squash(text).slice(0, 60)} ≠ ${squash(String(valueAt(card, path) ?? "")).slice(0, 60)}`);
}

function check(bytes: Uint8Array, cards: any[]): { cells: number; bad: string[]; mixed: string[] } {
  const { built } = buildLayouts(readHwp5(bytes), cards);
  let cells = 0;
  const bad: string[] = [];
  const mixed: string[] = [];
  for (const b of built) {
    const card = cards[b.index];
    const html = renderLayoutCard(card, b.layout, { editable: true });
    const raw = renderLayoutCard(card, b.layout, { editable: true, keepMixed: true });
    assert.ok(html && raw, card.id);
    cells += editableCells(html).length;
    bad.push(...mismatches(card, html));
    mixed.push(...mixedEditPaths(card, raw).map((p) => `${card.id} ${p}`));
  }
  return { cells, bad, mixed };
}

test("9.16판 59장: 원본 배치의 고칠 수 있는 칸마다 칸 글 = 카드 JSON(공백 무시) — 고르기만으로 돌린 칸은 고정 목록뿐", { skip: NO_SEED_CARDS || (!BIZ916.every(existsSync) && "9.16판 원본 한글 파일 없음") }, () => {
  const all = seedCards<any>();
  let cells = 0;
  const bad: string[] = [];
  const mixed: string[] = [];
  [1, 2, 3].forEach((g, k) => {
    const r = check(new Uint8Array(readFileSync(BIZ916[k])), all.filter((c) => c.id.startsWith(`주요사업${g}/`)));
    cells += r.cells;
    bad.push(...r.bad);
    mixed.push(...r.mixed);
  });
  assert.deepEqual(mixed, KNOWN.biz916);
  assert.ok(cells > 4000, `편집 칸 ${cells}개`);
  assert.deepEqual(bad, []);
});

test("경영관리 9.04판 43장: 원본 배치의 고칠 수 있는 칸마다 칸 글 = 카드 JSON(공백 무시) — 고르기만으로 돌린 칸은 고정 목록뿐", { skip: !existsSync(MG904) && "경영관리 9.04판 원본 없음" }, async () => {
  const bytes = new Uint8Array(readFileSync(MG904));
  const md = ((await parse(Buffer.from(bytes), { images: false })) as any).markdown as string;
  const { cells, bad, mixed } = check(bytes, parseMgmtMarkdown(md, { sourceName: "mg.hwp", fileType: "hwp" }).cards);
  assert.deepEqual(mixed, KNOWN.mg904);
  assert.ok(cells > 2000, `편집 칸 ${cells}개`);
  assert.deepEqual(bad, []);
});

test("261103판 103장(운영 원장의 판): 원본 배치의 고칠 수 있는 칸마다 칸 글 = 카드 JSON(공백 무시) — 딱지 표·과제번호 글이 낀 칸은 고르기만(고정 목록뿐)", { skip: !P1103.every(existsSync) && "261103판 원본 없음" }, async () => {
  let cells = 0;
  const bad: string[] = [];
  const mixed: string[] = [];
  for (const [k, f] of P1103.entries()) {
    const bytes = new Uint8Array(readFileSync(f));
    const md = ((await parse(Buffer.from(bytes), { images: false })) as any).markdown as string;
    const cards = k ? parseMgmtMarkdown(md, { sourceName: "mg.hwp", fileType: "hwp" }).cards : parseCardGroups(md, { sourceName: "biz.hwp", fileType: "hwp" }).flatMap((g) => g.cards);
    const r = check(bytes, cards);
    cells += r.cells;
    bad.push(...r.bad);
    mixed.push(...r.mixed);
  }
  assert.deepEqual(mixed, KNOWN.p1103);
  assert.ok(cells > 7000, `편집 칸 ${cells}개`);
  assert.deepEqual(bad, []);
});
