// TS 카드 파서가 parse_cards.py와 같은 카드 JSON을 내는지: kordoc 마크다운 3개 → 카드 59장을 biz-260916.json과 대조.
// AX 붙임 번호 딱지(no·marker·markerSource)는 원본 PDF가 있어야 정해지므로 비교에서 뺍니다(현행화는 기존 카드 값을 이어 받음).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { parseCardMarkdown, pyRepr, unmarkKordocInline } from "./parse.ts";
import { HAS_SEED_CARDS, NO_SEED_CARDS } from "../../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DIR = resolve(import.meta.dirname, "../../../seed/cards/260916");
const seed = HAS_SEED_CARDS ? JSON.parse(readFileSync(join(DIR, "biz-260916.json"), "utf8")) : null;

function withoutPdfMarks(card: any) {
  const c = structuredClone(card);
  for (const a of c.axAttachments ?? []) Object.assign(a, { no: null, marker: null, markerSource: null });
  c.axAttachment = c.axAttachments?.[0] ?? null;
  c.parseWarnings = c.parseWarnings.filter((w: string) => !w.startsWith("PDF"));
  return c;
}

function firstDiff(a: any, b: any, path = ""): string | null {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: 기대 ${JSON.stringify(a)?.slice(0, 200)} / 실제 ${JSON.stringify(b)?.slice(0, 200)}`;
}

test("HWPX 글의 kordoc 마크다운 표시(굵게·기울임·취소선·밑줄·역슬래시)를 걷음 — HWP는 표시 없이 나오므로 HWPX에만", () => {
  assert.equal(unmarkKordocInline("무선국 **안테나 설치** 형태 \\*각주\\* \\<산출근거\\> ~~취소~~ <u>밑줄</u> ***둘 다***"), "무선국 안테나 설치 형태 *각주* <산출근거> 취소 밑줄 둘 다");
  assert.equal(unmarkKordocInline("가\\\\ 0.26원 \\ 그대로"), "가\\ 0.26원 \\ 그대로", "구두점 앞이 아닌 역슬래시(원 표시)는 그대로");
});

test("파이썬 repr 따옴표 규칙", () => {
  assert.equal(pyRepr("`"), "'`'");
  assert.equal(pyRepr("it's"), `"it's"`);
  assert.equal(pyRepr(`a'b"c`), `'a\\'b"c'`);
  assert.equal(pyRepr("a\\b"), "'a\\\\b'");
});

test("kordoc 마크다운 → 카드 59장 = biz-260916.json(경고 문구까지)", { skip: NO_SEED_CARDS }, () => {
  let n = 0;
  for (let g = 1; g <= 3; g++) {
    const md = readFileSync(join(DIR, "kordoc", `biz${g}.md`), "utf8");
    const res = parseCardMarkdown(md, {
      sourceName: seed.source[g - 1],
      imageResolver: (src) => {
        const stem = src.replace(/\.[^.]+$/, "");
        for (const ext of [".jpg", ".png"]) if (existsSync(join(DIR, "images", `biz${g}`, stem + ext))) return `images/biz${g}/${stem}${ext}`;
        return null;
      },
    });
    const group = seed.groups[g - 1];
    assert.equal(firstDiff(group, res.group), null, `묶음 ${g}`);
    assert.equal(firstDiff(seed.ignoredBlocks[group.id], res.ignored), null, `무시한 블록 ${g}`);
    const expected = seed.cards.filter((c: any) => c.group === group.id);
    assert.equal(res.cards.length, expected.length, `카드 수 ${g}`);
    expected.forEach((e: any, i: number) => {
      assert.equal(firstDiff(withoutPdfMarks(e), withoutPdfMarks(res.cards[i])), null, e.id);
      n += 1;
    });
  }
  assert.equal(n, 59);
});

test("과제 한 장만 있는 파일: 묶음 표지·목차 없이도 카드를 읽고 경고를 남김", { skip: NO_SEED_CARDS }, () => {
  const md = readFileSync(join(DIR, "kordoc", "biz1.md"), "utf8");
  const lines = md.split("\n");
  // 첫 카드 표(과제명 행 바로 위의 <table>)부터 다음 카드 표 전까지
  const title = lines.findIndex((l) => l.includes("과제명<br>(과제번호)"));
  const start = lines.lastIndexOf("<table>", title);
  const next = lines.findIndex((l, i) => i > title && l.includes("과제명<br>(과제번호)"));
  assert.ok(start > 0 && next > start);
  const res = parseCardMarkdown(lines.slice(start, lines.lastIndexOf("<table>", next)).join("\n"), { sourceName: "one.hwpx", groupNo: 1 });
  assert.equal(res.cards.length, 1);
  const c = res.cards[0];
  assert.equal(c.taskNo, seed.cards[0].taskNo);
  assert.equal(c.targetBusiness, null);
  assert.ok(c.parseWarnings.some((w: string) => w.startsWith("목차에서 과제번호")));
});
