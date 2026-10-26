// 카드 → 한글(HWPX) → 다시 올리기(현행화) 왕복: 앱에서 내려받은 파일을 그대로 올리면 59장 모두 「변경 없음」이어야 합니다.
// 1) 역변환 마크다운 → 파서(순수)  2) 실제 kordoc으로 HWPX를 만들고 되읽기(그림 바이트 포함)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import JSZip from "jszip";
import { parse, validateHwpx } from "kordoc";
import { CARD_COLS, PDCA_FILL, buildCardHwpx, formProfile } from "./form.ts";
import { parseCardMarkdown } from "./parse.ts";
import { planSync } from "./sync.ts";
import { cardLayout, cardToKordocMarkdown, spread } from "./write.ts";
import { HAS_SEED_CARDS, NO_SEED_CARDS } from "../../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DIR = resolve(import.meta.dirname, "../../../seed/cards/260916");
const seed = HAS_SEED_CARDS ? JSON.parse(readFileSync(join(DIR, "biz-260916.json"), "utf8")) : { cards: [] };
const changedBlocks = (plan: ReturnType<typeof planSync>) => plan.blocks.filter((b) => b.status !== "same").map((b) => b.key);

test("열 나누기: 13열을 칸 수대로(앞 칸부터 1열씩 더)", () => {
  assert.deepEqual(spread(4), [4, 3, 3, 3]);
  assert.deepEqual(spread(2), [7, 6]);
  assert.deepEqual(spread(0), []);
});

test("역변환 마크다운을 파서가 같은 카드로 읽음(59장, 묶음·과제번호 포함)", { skip: NO_SEED_CARDS }, () => {
  for (const c of seed.cards) {
    const md = cardToKordocMarkdown(c, { group: { id: c.group, name: "시험" } });
    const res = parseCardMarkdown(md, { sourceName: "x.hwpx" });
    assert.equal(res.cards.length, 1, c.id);
    assert.equal(res.group.id, c.group, c.id);
    assert.equal(res.cards[0].taskNo, c.taskNo, c.id);
    assert.deepEqual(changedBlocks(planSync(c, res.cards[0])), [], c.id);
  }
});

test("원본 서식 HWPX 왕복: 내려받기와 같은 길(서식 프로필+마무리)로 만들고 되읽으면 59장 모두 변경 없음(그림 포함)", { skip: NO_SEED_CARDS }, async () => {
  let given = 0;
  let embedded = 0;
  for (const c of seed.cards) {
    const images: Record<string, Uint8Array> = {};
    const bytes = await buildCardHwpx(
      c,
      {
        group: { id: c.group, name: "시험" },
        imageKey: (img) => {
          const key = (img.src ?? img.kordoc).split("/").pop()!;
          if (img.src) images[key] = readFileSync(join(DIR, img.src));
          return key;
        },
      },
      images,
    );
    const r: any = await parse(Buffer.from(bytes));
    assert.ok(r.success, c.id);
    const res = parseCardMarkdown(r.markdown, { sourceName: "x.hwpx" });
    assert.equal(res.cards.length, 1, c.id);
    assert.equal(res.group.id, c.group, c.id);
    assert.deepEqual(changedBlocks(planSync(c, res.cards[0])), [], c.id);
    given += Object.keys(images).length;
    embedded += (r.images ?? []).length;
  }
  // 표 안의 표에 든 그림(3장)은 kordoc 생성기가 옮기지 못함 — 그 밖의 그림은 모두 한글 파일에 들어감
  assert.ok(given >= 10 && embedded >= given - 3, `그림 ${embedded}/${given}`);
});

test("파일에 그림만 빠진 블록은 유지(무손실), 글도 바뀌며 그림이 빠지면 위험", { skip: NO_SEED_CARDS }, () => {
  const c = seed.cards.find((x: any) => x.id === "주요사업1/1-가");
  const noImg = structuredClone(c);
  const strip = (v: any): any => (Array.isArray(v) ? v.filter((x) => !(x && typeof x === "object" && "image" in x)).map(strip) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)])) : v);
  noImg.axAttachments = strip(noImg.axAttachments);
  const same = planSync(c, noImg);
  assert.equal(same.blocks.find((b) => b.key === "ax")!.status, "same");
  assert.deepEqual(same.risks, []);
  noImg.axAttachments[0].purpose = `${noImg.axAttachments[0].purpose} (보완)`;
  const risky = planSync(c, noImg);
  const ax = risky.blocks.find((b) => b.key === "ax")!;
  assert.equal(ax.status, "changed");
  assert.match(ax.risk ?? "", /그림/);
  assert.ok(!risky.defaults.includes("ax"));
});

test("원본 서식: 열 너비·과제명 검은 칸·하늘색 머리·PDCA 채움·파란 월별 상자·굵은 글꼴 요소·쪽 여백·과제명 강조", { skip: NO_SEED_CARDS }, async () => {
  const c = seed.cards.find((x: any) => x.id === "주요사업1/1-가");
  const layout = cardLayout(c, { group: { id: c.group, name: "시험" } });
  const prof = formProfile(layout);
  assert.equal(prof.tables.length, layout.tables.length);
  const card = prof.tables[1];
  assert.deepEqual([card.cols, card.anchor_text], [15, "과제명(과제번호)"]);
  assert.equal(CARD_COLS.reduce((a, b) => a + b, 0), 48428, "원본 표 너비");
  const zip = await JSZip.loadAsync(await buildCardHwpx(c, { group: { id: c.group, name: "시험" } }));
  const header = await zip.file("Contents/header.xml")!.async("string");
  const section = await zip.file("Contents/section0.xml")!.async("string");
  // 프로필이 카드 표에 걸림: 칸 너비(라벨·여백 열)와 채움 색
  assert.ok(section.includes('<hp:cellSz width="4285"'), "라벨 열 4285");
  for (const color of ["#000000", "#C7E6E9", PDCA_FILL.act, PDCA_FILL.plan, PDCA_FILL.do, PDCA_FILL.check]) assert.ok(header.includes(`faceColor="${color}"`), color);
  assert.ok(/<hh:(?:left|right|top|bottom)Border type="SOLID" width="0.5 mm" color="#0000FF"\/>/.test(header), "월별 상자 파란 굵은 선");
  // 한컴이 읽는 굵은 글꼴 요소: bold="1"인 글자 모양에는 모두 <hh:bold/>
  const bolds = [...header.matchAll(/<hh:charPr\b[^>]*\sbold="1"[^>]*>[\s\S]*?<\/hh:charPr>/g)].map((m) => m[0]);
  assert.ok(bolds.length > 0 && bolds.every((x) => x.includes("<hh:bold/>")));
  assert.ok(section.includes('left="5669" right="5431" top="4251" bottom="4251"'), "원본 쪽 여백");
  assert.ok(/<hh:font id="\d+" face="한컴 윤고딕 740"/.test(header), "원본 글꼴");
  assert.ok(header.includes('<hh:spacing hangul="-3"'), "원본 대표 자간");
  // 과제명은 노란 음영, 과제번호는 파랑, 굵은 머리말은 따로 run
  const charOf = (id: string) => new RegExp(`<hh:charPr id="${id}"[^>]*>`).exec(header)?.[0] ?? "";
  const run = (text: string) => new RegExp(`<hp:run charPrIDRef="(\\d+)"><hp:t>${text.replace(/[()]/g, "\\$&")}</hp:t>`).exec(section)?.[1] ?? "";
  assert.match(charOf(run(c.title)), /shadeColor="#FFFF00"/);
  assert.match(charOf(run(" (과제번호 : 1-가)")), /textColor="#0000FF"/);
  assert.match(charOf(run("(AI 학습데이터 수집)")), /\sbold="1"/);
  assert.match(charOf(run("A")), /textColor="#0000FF"/, "[Act]의 A");
  // 빈 행은 얇게, 표 자체 테두리 없음
  assert.ok(section.includes('<hp:cellMargin left="0" right="0" top="0" bottom="0"/>'));
  // 최상위 표(중첩 표는 kordoc 기본 선 그대로)
  let depth = 0;
  const tops: string[] = [];
  for (const m of section.matchAll(/<hp:tbl\b[^>]*>|<\/hp:tbl>/g)) {
    if (m[0] === "</hp:tbl>") depth -= 1;
    else {
      if (depth === 0) tops.push(m[0]);
      depth += 1;
    }
  }
  assert.equal(tops.length, layout.tables.length);
  assert.ok(tops.every((t) => /borderFillIDRef="1"/.test(t)));
  const v: any = await (validateHwpx as any)(Buffer.from(await zip.generateAsync({ type: "uint8array" })));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
});
