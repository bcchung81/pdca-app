// 경영관리 카드 43장: 원본 배치로 내려받은 한글(HWPX)을 다시 올리면(kordoc → 경영관리 카드 파서 → 현행화 비교) 같은 카드이고,
// 고친 글·새 월별 상자가 파일에 들어가 다시 올리면 고친 블록만 [변경]으로 잡히며 반영하면 고친 카드가 되는지 확인합니다(주요사업은 layout-hwpx.test.ts).
// 원장에서 더하거나 뺀 짝 칸 표(지적 및 개선방안·전년도 환류) 행이 원본 배치 화면(행 복제·삭제)과 한글 파일 왕복(같은 행 수·같은 글)에 그대로 나오는지도 봅니다.
// 원본(8월 점검 자료 한글 파일)이 이 컴퓨터에 있을 때만 돕니다(data/는 git 밖).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "kordoc";
import { readHwp5 } from "../hwp/hwp5.ts";
import type { CardLayout } from "../hwp/layout.ts";
import { writeHwpxPackage } from "../hwpx/postprocess.ts";
import { canonicalJson } from "./fixed.ts";
import { applyText, deletePairRow, insertPairRow } from "./edit.ts";
import { parseMgmtMarkdown } from "./hwp/parse-mgmt.ts";
import { applySync, matchCard, planSync } from "./hwp/sync.ts";
import { buildLayouts } from "./layout-build.ts";
import { layoutHwpxFiles } from "./layout-hwpx.ts";
import { renderLayoutCard } from "./layout-render.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const FILE = join(resolve(import.meta.dirname, "../.."), "data/cards/260904/cards-260904-mg.hwp");
const has = existsSync(FILE);

type Built = { card: any; layout: CardLayout; images: Map<string, { data: Uint8Array; ext: string }> };
let cache: { items: Built[]; md: string } | null = null;
async function load() {
  if (cache || !has) return cache!;
  const bytes = readFileSync(FILE);
  const md = ((await parse(bytes, { images: false })) as any).markdown as string;
  const cards = parseMgmtMarkdown(md, { sourceName: "mg.hwp", fileType: "hwp" }).cards;
  const items = buildLayouts(readHwp5(bytes), cards).built.map((b) => ({ card: cards[b.index], layout: b.layout, images: new Map(b.images.map((im) => [im.key, { data: im.data, ext: im.key.split(".").pop() ?? "png" }])) }));
  cache = { items, md };
  return cache;
}
const toHwpx = async (card: any, x: Built) => (await writeHwpxPackage(layoutHwpxFiles(card, x.layout, x.images)!)).bytes;
async function reread(card: any, x: Built): Promise<any> {
  const r: any = await parse(Buffer.from(await toHwpx(card, x)), { images: false });
  assert.ok(r.success, card.id);
  const cards = parseMgmtMarkdown(r.markdown, { sourceName: "x.hwpx", fileType: "hwpx" }).cards;
  assert.equal(cards.length, 1, card.id);
  return cards[0];
}

test("43장: 원본 배치로 내려받은 한글 파일을 그대로 다시 올리면 같은 카드(바뀐 블록·위험 없음)", { skip: !has && "원본 한글 파일 없음" }, async () => {
  const { items } = await load();
  assert.equal(items.length, 43);
  for (const x of items) {
    const back = await reread(x.card, x);
    assert.equal(back.id, x.card.id);
    assert.equal(matchCard({ group: back.group, taskNo: back.taskNo, title: back.title }, items.map((y) => ({ id: y.card.id, group: y.card.group, taskNo: y.card.taskNo, title: y.card.title }))).cardId, x.card.id);
    const plan = planSync(x.card, back);
    assert.deepEqual(plan.blocks.filter((b) => b.status !== "same").map((b) => b.key), [], x.card.id);
    assert.deepEqual(plan.risks, [], x.card.id);
  }
});

const pick = (items: Built[], id: string) => items.find((x) => x.card.id === id)!;
const same = (a: any, b: any) => canonicalJson(a) === canonicalJson(b);

test("고친 글(지적·개선방안·환류·추진내용)·새 월별 실적·계량지표 목표를 한글 파일로 고쳐 올리면 고친 블록만 [변경], 반영하면 고친 카드(나머지는 원장 그대로)", { skip: !has && "원본 한글 파일 없음" }, async () => {
  const { items } = await load();
  const x = pick(items, "경영관리1/1-1");
  let e = applyText(x.card, "findings.rows.0.plan.0", "‘26년 개선방안 시험: 현행화 품질 확인용 문장");
  e = applyText(e, "feedback.rows.0.self.0", "’25년 자체평가 시험: 환류 문장 고침");
  e = applyText(e, "kpi.rows.0.target", "777");
  const back = await reread(e, x);
  const plan = planSync(x.card, back);
  assert.deepEqual(plan.blocks.filter((b) => b.status !== "same").map((b) => b.key).sort(), ["feedback", "findings", "kpi"]);
  assert.ok(plan.blocks.filter((b) => b.status !== "same").every((b) => b.status === "changed"));
  assert.ok(plan.risks.some((r) => r.includes("계량지표 목표")), "계량지표 목표 변경은 건별 승인(위험)");
  // 지침 08 고정영역(전년도 환류·지적 및 개선방안·계량지표)은 현행화에서 건별 승인 — 기본 반영 없음
  assert.ok(plan.risks.includes("고정영역(전년도 환류) 변경") && plan.risks.includes("고정영역(지적 및 개선방안) 변경"));
  assert.deepEqual([...plan.defaults], [], "고정영역 변경은 기본 반영에서 빠짐");
  // 승인한 블록만 반영 — 계량지표는 승인하지 않으면 그대로
  const { card: merged, applied } = applySync(x.card, back, { blocks: ["feedback", "findings"], removals: [] });
  assert.deepEqual(applied.sort(), ["feedback", "findings"]);
  assert.ok(same(merged.findings, e.findings) && same(merged.feedback, e.feedback), "고친 구역은 고친 카드와 같음");
  for (const k of ["overview", "do", "kpi", "outcome", "title", "deptText"]) assert.ok(same(merged[k], x.card[k]), `${k}: 원장 그대로`);
  // 계량지표까지 승인하면 그것도 반영
  const all = applySync(x.card, back, { blocks: ["feedback", "findings", "kpi"], removals: [] });
  assert.ok(same(all.card.kpi.rows.map((r: any) => r.target), e.kpi.rows.map((r: any) => r.target)));
});

test("월별 실적 새 기간·고친 추진내용: 새 기간은 추가, 파일에 없는 기존 기간은 그대로, 원장은 줄지 않음", { skip: !has && "원본 한글 파일 없음" }, async () => {
  const { items } = await load();
  const x = pick(items, "경영관리3/3-2");
  const e = structuredClone(x.card);
  const first = e.do.monthly[0];
  first.items = [...first.items.slice(0, -1), "∙ (시험) 월별 실적 마지막 줄을 고침"];
  const back = await reread(e, x);
  const plan = planSync(x.card, back);
  const bad = plan.blocks.filter((b) => b.status !== "same").map((b) => b.key);
  assert.deepEqual(bad, ["monthly"]);
  const { card: merged } = applySync(x.card, back, { blocks: ["monthly"], removals: [] });
  assert.equal(merged.do.monthly.length, x.card.do.monthly.length, "기간 수 그대로");
  assert.ok(JSON.stringify(merged.do.monthly[0].items).includes("월별 실적 마지막 줄을 고침"));
  assert.ok(same(merged.findings, x.card.findings) && same(merged.kpi, x.card.kpi), "다른 구역은 그대로");
});

const SIDES = { findings: ["finding", "plan"], feedback: ["self", "plan"] } as const;
const trCount = (h: string) => (h.match(/<tr /g) ?? []).length;
const pairPaths = (h: string, key: string) => [...h.matchAll(/ data-p="([^"]+)"/g)].map((m) => m[1]).filter((p) => p.startsWith(`${key}.rows.`));

test("43장 원본 배치: 짝 칸 표에 빈 행을 어느 자리에 더해도 앞(맨 앞이면 뒤) 행을 복제해 그 자리에 두 칸 빈 편집 줄, 행을 빼면 표 행도 빠짐", { skip: !has && "원본 한글 파일 없음" }, async () => {
  const { items } = await load();
  let tried = 0;
  for (const x of items) {
    const base = renderLayoutCard(x.card, x.layout, { editable: true })!;
    for (const key of ["findings", "feedback"] as const) {
      const n = x.card[key].rows.length;
      for (let after = -1; after < n; after++) {
        const { card } = insertPairRow(x.card, key, after);
        const h = renderLayoutCard(card, x.layout, { editable: true });
        assert.ok(h, `${x.card.id} ${key} ${after}: 원본 배치로 그림`);
        // 본뜬 행의 짜임 그대로 — 대개 표 행 하나, 개선방안 줄마다 칸이 따로인 행(4-3 세 줄·10-1 두 줄)은 그 수만큼
        const grew = trCount(h) - trCount(base);
        assert.ok(grew >= 1 && grew <= 3, `${x.card.id} ${key} ${after}: 표 행이 늘어남(${grew})`);
        const at = after + 1;
        for (const side of SIDES[key]) {
          const m = new RegExp(`data-p="${key}\\.rows\\.${at}\\.${side}\\.0"[^>]*data-empty="1"[^>]*>([\\s\\S]*?)</div>`).exec(h);
          assert.ok(m, `${x.card.id} ${key} ${at}.${side}: 빈 편집 줄`);
          assert.equal(m[1].replace(/<[^>]+>/g, ""), "", `${x.card.id} ${key} ${at}.${side}: 편집 칸 글 = JSON(빈 글)`);
        }
        // 편집 칸 경로는 행 순서대로(새 행 뒤 행은 번호가 하나씩 밀림)
        const rowsSeen = pairPaths(h, key).map((p) => Number(p.split(".")[2]));
        assert.deepEqual(rowsSeen, [...rowsSeen].sort((a, b) => a - b), `${x.card.id} ${key} ${after}: 행 순서`);
        assert.equal(new Set(rowsSeen).size, n + 1);
        tried++;
      }
      if (n > 1) {
        const h = renderLayoutCard(deletePairRow(x.card, key, 0).card, x.layout, { editable: true })!;
        assert.ok(trCount(h) < trCount(base), `${x.card.id} ${key}: 행 빼기`);
        assert.equal(new Set(pairPaths(h, key).map((p) => p.split(".")[2])).size, n - 1);
      }
    }
  }
  assert.ok(tried > 100);
});

test("43장 한글 왕복: 지적 행을 맨 앞·끝에 더하고(글 채움) 가운데 행을 빼고 환류 행을 더한 카드를 내려받아 다시 읽으면 같은 행 수·같은 글, 현행화 비교는 두 구역만 [변경]", { skip: !has && "원본 한글 파일 없음" }, async () => {
  const { items } = await load();
  for (const x of items) {
    let e = x.card;
    const n = e.findings.rows.length;
    let r = insertPairRow(e, "findings", -1);
    e = applyText(applyText(r.card, "findings.rows.0.finding.0", "∙ 맨 앞 새 지적(시험)"), "findings.rows.0.plan.0", "∙ 맨 앞 새 개선방안(시험)");
    r = insertPairRow(e, "findings", e.findings.rows.length - 1);
    e = applyText(applyText(r.card, r.path, "∙ 끝 새 지적(시험)"), r.path.replace(/finding\.0$/, "plan.0"), "∙ 끝 새 개선방안(시험)");
    if (n > 1) e = deletePairRow(e, "findings", 2).card; // 원래 둘째 행
    r = insertPairRow(e, "feedback", e.feedback.rows.length - 1);
    e = applyText(applyText(r.card, r.path, "∙ 새 자체평가(시험)"), r.path.replace(/self\.0$/, "plan.0"), "∙ 새 개선방안(시험)");
    assert.equal(e.findings.rows.length, n + (n > 1 ? 1 : 2));
    const back = await reread(e, x);
    assert.ok(same(back.findings.rows, e.findings.rows), `${x.card.id}: 지적 및 개선방안 행 수·글`);
    assert.ok(same(back.feedback.rows, e.feedback.rows), `${x.card.id}: 전년도 환류 행 수·글`);
    const plan = planSync(x.card, back);
    assert.deepEqual(
      plan.blocks.filter((b) => b.status !== "same").map((b) => `${b.key}:${b.status}`),
      ["feedback:changed", "findings:changed"],
      x.card.id,
    );
    assert.ok(plan.risks.includes("고정영역(지적 및 개선방안) 변경"), "행 수 변화도 고정영역 변경(건별 승인)");
    const { card: merged } = applySync(x.card, back, { blocks: ["feedback", "findings"], removals: [] });
    assert.ok(same(merged.findings, { ...x.card.findings, rows: e.findings.rows }), `${x.card.id}: 반영하면 더하고 뺀 행 그대로`);
  }
});
