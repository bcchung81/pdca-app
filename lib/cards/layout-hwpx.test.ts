// 원본 배치로 내려받는 한글(HWPX): 59장을 그대로 다시 올리면(kordoc → 카드 파서) 같은 카드이고, 고친 글·새 줄·월별 상자·새 AX 붙임이
// 파일에 원본 모양으로 들어가며, 고친 문단만 줄 배치를 빼서 한글이 다시 조판하는지 확인합니다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "kordoc";
import { readHwp5 } from "../hwp/hwp5.ts";
import { readHwpx } from "../hwp/hwpx.ts";
import type { CardLayout } from "../hwp/layout.ts";
import type { Para } from "../hwp/model.ts";
import { writeHwpxPackage } from "../hwpx/postprocess.ts";
import { addMonthly, applyText, insertLineAfter } from "./edit.ts";
import { parseCardMarkdown } from "./hwp/parse.ts";
import { planSync } from "./hwp/sync.ts";
import { buildLayouts } from "./layout-build.ts";
import { layoutHwpxFiles } from "./layout-hwpx.ts";
import { cardSourceFile } from "./file-names.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = resolve(import.meta.dirname, "../..");
const file = (g: number) => join(ROOT, "data/cards/260916", cardSourceFile(g));
const has = [1, 2, 3].every((g) => existsSync(file(g)));
const seed = { cards: seedCards() };

type Built = { g: number; card: any; layout: CardLayout; images: Map<string, { data: Uint8Array; ext: string }> };
const built: Built[] = [];
function all(): Built[] {
  if (built.length || !has) return built;
  for (const g of [1, 2, 3]) {
    const cards = seed.cards.filter((c) => c.id.startsWith(`주요사업${g}/`));
    for (const b of buildLayouts(readHwp5(readFileSync(file(g))), cards).built) built.push({ g, card: cards[b.index], layout: b.layout, images: new Map(b.images.map((im) => [im.key, { data: im.data, ext: im.key.split(".").pop()! }])) });
  }
  return built;
}
const hwpx = async (card: any, x: Built) => (await writeHwpxPackage(layoutHwpxFiles(card, x.layout, x.images)!)).bytes;
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
const paraText = (p: Para) => p.items.map((it) => (it.kind === "text" ? it.text : "")).join("");

test("59장: 원본 배치로 내려받은 한글 파일을 그대로 다시 올리면 같은 카드(묶음 제목으로 묶음도 알아봄)", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, async () => {
  assert.equal(all().length, 59);
  for (const x of all()) {
    const r: any = await parse(Buffer.from(await hwpx(x.card, x)));
    assert.ok(r.success, x.card.id);
    const res = parseCardMarkdown(r.markdown, { sourceName: "x.hwpx", fileType: "hwpx" });
    assert.equal(res.cards.length, 1, x.card.id);
    assert.equal(res.group.id, x.card.group, x.card.id);
    assert.deepEqual(
      planSync(x.card, res.cards[0])
        .blocks.filter((b) => b.status !== "same")
        .map((b) => b.key),
      [],
      x.card.id,
    );
  }
});

test("고친 글·새 줄·월별 상자가 원본 모양으로 들어가고, 고친 문단만 줄 배치가 빠짐", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, async () => {
  const x = all().find((y) => y.g === 1 && y.card.taskNo === "1-가")!;
  let c = applyText(x.card, "plan.lines.1", "→ 무선국검사관리시스템(RIMS) 안테나 AI 분석 기능 도입(’26년 下) 및 운영 확대");
  c = insertLineAfter(c, "do.lines.2", "- 새 줄 시험: 추가 세부 내용").card;
  c = addMonthly(c, "9월").card;
  c = applyText(c, "do.monthly.1.items.0", "∙ (9월 시험) 새 월별 실적");
  const doc = await readHwpx(await hwpx(c, x));
  const paras: Para[] = [];
  walk(doc.sections[0].paras, (p) => paras.push(p));
  const find = (s: string) => paras.find((p) => paraText(p).includes(s));
  const edited = find("및 운영 확대");
  assert.ok(edited && !edited.lines.length, "고친 문단: 줄 배치 없음(한글이 다시 조판)");
  assert.ok(find("새 줄 시험") && !find("새 줄 시험")!.lines.length, "새 줄");
  assert.ok(find("(9월 시험) 새 월별 실적"), "새 월별 상자");
  assert.ok(!paras.some((p) => paraText(p).includes("전국 대상 운영 확산")), "고치기 전 글은 없음");
  const kept = find("예외처리 기준");
  assert.ok(kept && kept.lines.length > 0, "고치지 않은 문단: 원본 줄 배치 그대로");
});

test("새 AX 붙임: 앞 붙임 표를 본떠 이어 쓰고(그림은 빼고), 본뜬 붙임의 글은 남지 않음", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, async () => {
  const x = all().find((y) => y.g === 1 && y.card.taskNo === "1-가")!;
  const c = structuredClone(x.card);
  const src = c.axAttachments[c.axAttachments.length - 1];
  c.axAttachments.push({ ...src, no: src.no + 1, seq: src.seq + 1, title: "새 AX 시험 과제", purpose: "새 목적 시험", sections: [{ heading: "주요 기능", items: ["▪ 새 기능 시험"] }] });
  const doc = await readHwpx(await hwpx(c, x));
  const texts: string[] = [];
  walk(doc.sections[0].paras, (p) => texts.push(paraText(p)));
  const all2 = texts.join("\n");
  assert.ok(all2.includes("새 AX 시험 과제") && all2.includes("새 목적 시험") && all2.includes("새 기능 시험"));
  const r: any = await parse(Buffer.from(await hwpx(c, x)));
  const back = parseCardMarkdown(r.markdown, { sourceName: "x.hwpx", fileType: "hwpx" }).cards[0];
  assert.equal(back.axAttachments.length, c.axAttachments.length, "붙임 수");
  const last = back.axAttachments[back.axAttachments.length - 1];
  assert.equal(last.title, "새 AX 시험 과제");
  assert.ok(!JSON.stringify(last).includes(src.purpose.slice(0, 12)), "본뜬 붙임의 목적 글이 남지 않음");
});

test("띄운 표와 같은 문단의 딱지 표(주요사업2 다섯째 카드 AX 붙임): 한글 파일에서도 원본처럼 한 문단(딱지가 띄운 표 뒤로 밀리지 않게)", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, async () => {
  const x = all().find((b) => b.layout.blocks.some((k) => k.kind === "table" && k.host?.join));
  assert.ok(x, "같은 문단 딱지가 있는 카드");
  const doc = await readHwpx(await hwpx(x.card, x));
  const both = doc.sections[0].paras.find((p) => {
    const ts = p.items.filter((it) => it.kind === "obj" && it.obj.kind === "table");
    return ts.length === 2 && ts[0].kind === "obj" && !ts[0].obj.pos.treatAsChar && ts[1].kind === "obj" && ts[1].obj.pos.treatAsChar;
  });
  assert.ok(both, "띄운 표 + 글자처럼 놓은 딱지가 한 문단");
});
