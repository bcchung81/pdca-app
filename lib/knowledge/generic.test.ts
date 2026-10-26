import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { GENERIC_MAX_CHARS, GENERIC_MIN_CHARS, genericChunks } from "./generic.ts";
import { type SourceBlock, loadKordocChunks } from "./source.ts";

const opts = { docId: "up-test0001", docTitle: "시험 문서", track: "주요사업" as const, business: null };
const blk = (text: string, page = 1, type = "text", breadcrumb: string[] = [], i = 0): SourceBlock => ({ id: `c${i}`, type, text, page, breadcrumb });
const para = (n: number, ch = "가") => ch.repeat(n);

test("제목 경계로 나누고, 작은 구간은 앞 구간에 합치며, 제목·상위 제목·쪽·꼬리표가 붙는다", () => {
  const blocks = [
    blk("# 1장 개요", 1, "heading", []),
    blk(para(700), 1),
    blk("## 1.1 배경", 2, "heading", ["1장 개요"]),
    blk(para(800), 2),
    blk("## 1.2 범위", 3, "heading", ["1장 개요"]),
    blk(para(100), 3), // 작아서 앞 구간(1.1)에 합쳐짐
    blk("# 2장 방법", 4, "heading", []),
    blk(para(900), 4),
  ];
  const r = genericChunks(blocks, opts);
  assert.equal(r.checks.filter((c) => !c.ok && c.level === "error").length, 0);
  assert.equal(r.stats.byPage, false);
  assert.ok(r.chunks.length >= 2);
  const first = r.chunks[0];
  assert.equal(first.unit_type, "generic_section");
  assert.equal(first.chunk_key, "up-test0001/g0000");
  assert.equal(first.track, "주요사업");
  assert.equal(first.business, null);
  assert.equal(first.eval_item, null, "꼬리표는 채우지 않음");
  assert.deepEqual([first.q_type, first.dept_resp, first.dept_coop], [[], [], []]);
  assert.equal(first.meta.generic, true);
  assert.match(first.context_prefix, /^시험 문서 › /);
  assert.equal(first.pdf_page_start, 1);
  assert.ok(r.chunks.every((c) => c.meta.search_only === undefined));
  const last = r.chunks.at(-1)!;
  assert.match(last.title, /2장 방법/);
});

test("제목이 없으면 쪽 경계로 나누고 제목은 쪽 범위(p.N~M)", () => {
  const blocks = Array.from({ length: 12 }, (_, i) => blk(para(500, String.fromCharCode(0xac00 + i)), 1 + Math.floor(i / 2), "text", [], i));
  const r = genericChunks(blocks, opts);
  assert.equal(r.stats.byPage, true);
  assert.equal(r.stats.splitDepth, null);
  assert.ok(r.chunks.length >= 2 && r.chunks.length < 12);
  assert.match(r.chunks[0].title, /^p\.\d+(~\d+)?$/);
  assert.equal(r.checks.filter((c) => !c.ok && c.level === "error").length, 0);
});

test("큰 구간은 블록 경계에서 나누고(제목에 (i/n)), 한 블록이 커도 자르지 않고 그 블록 하나를 한 조각으로 둔다", () => {
  const blocks = [blk("# 큰 장", 1, "heading"), ...Array.from({ length: 5 }, (_, i) => blk(para(2500, String.fromCharCode(0xac00 + i)), 1 + i, "text", ["큰 장"], i))];
  const r = genericChunks(blocks, opts);
  assert.ok(r.chunks.length >= 2);
  assert.ok(r.chunks.every((c) => c.blocks.join("").length <= GENERIC_MAX_CHARS + 200 || c.blocks.length === 1));
  assert.match(r.chunks[0].title, /\(1\/\d+\)$/);
  const giant = genericChunks([blk(para(GENERIC_MAX_CHARS + 500))], opts);
  assert.equal(giant.chunks.length, 1, "한 블록은 자르지 않음");
  assert.equal(giant.checks.find((c) => c.name.includes("넘는 조각"))?.ok, false, "넘으면 경고만");
  assert.equal(giant.checks.filter((c) => !c.ok && c.level === "error").length, 0);
});

test("글 손실이 없고(블록 글자 합 = 조각 글자 합) 블록 순서가 그대로이며, 같은 입력은 같은 출력", () => {
  const blocks = [blk("# A", 1, "heading"), blk(para(900), 1), blk("<table><tr><td>표</td></tr></table>", 2, "table"), blk("## B", 3, "heading", ["A"]), blk(para(1200, "나"), 3), blk("", 4), blk("   ", 4)];
  const a = genericChunks(blocks, opts);
  const b = genericChunks(blocks, opts);
  assert.deepEqual(a, b);
  const joined = a.chunks.flatMap((c) => c.blocks).join("\n");
  assert.equal(joined, blocks.map((x) => x.text.trim()).filter(Boolean).join("\n"));
  assert.equal(a.checks.find((c) => c.name.startsWith("글 손실"))?.ok, true);
});

test("검색 전용 표지: 옵션을 주면 모든 조각 meta.search_only, 키는 문서 id 기준", () => {
  const r = genericChunks([blk("# 제목", 1, "heading"), blk(para(800))], { ...opts, searchOnly: true, business: "BZ-2" });
  assert.ok(r.chunks.every((c) => c.meta.search_only === true && c.business === "BZ-2"));
  assert.ok(r.chunks.every((c) => c.chunk_key.startsWith("up-test0001/g")));
});

test("글이 거의 없으면(스캔 문서) error로 멈추고, 빈 입력도 던지지 않는다", () => {
  const scan = genericChunks([blk("표지", 1), blk("1", 2)], opts);
  assert.equal(scan.checks.find((c) => c.name.startsWith("읽은 글"))?.ok, false);
  assert.equal(scan.checks.find((c) => c.name.startsWith("읽은 글"))?.level, "error");
  const empty = genericChunks([], opts);
  assert.equal(empty.chunks.length, 0);
  assert.equal(empty.checks.find((c) => c.name === "조각이 한 개 이상")?.ok, false);
});

// 실제 kordoc 산출물(이 컴퓨터의 resources/knowledge/_parsed — git 밖) 6개 이상으로 같은 성질을 확인한다: 제목 있는 문서(관리계획·실사·전년 보고서)와 없는 문서(AX·점검표·Pool)
const PARSED = resolve(import.meta.dirname, "../../resources/knowledge/_parsed");
const real = existsSync(PARSED) ? readdirSync(PARSED).filter((f) => f.endsWith(".chunks.json")) : [];
test("실제 kordoc 산출물: 글 손실 없음·키 중복 없음·크기 규칙·결정적(원본이 없으면 건너뜀)", { skip: real.length === 0 && "kordoc 산출물(resources/knowledge/_parsed)이 없음" }, () => {
  for (const f of real) {
    const blocks = loadKordocChunks(JSON.parse(readFileSync(resolve(PARSED, f), "utf8")));
    const r = genericChunks(blocks, { ...opts, docId: `up-${f.slice(0, 6)}` });
    const errs = r.checks.filter((c) => !c.ok && c.level === "error");
    assert.deepEqual(errs, [], `${f} 검산 error`);
    assert.deepEqual(genericChunks(blocks, { ...opts, docId: `up-${f.slice(0, 6)}` }).chunks.map((c) => c.chunk_key), r.chunks.map((c) => c.chunk_key), `${f} 결정적`);
    const multi = r.chunks.filter((c) => c.blocks.length > 1);
    assert.ok(multi.every((c) => c.blocks.join("").length <= GENERIC_MAX_CHARS + 50), `${f}: 여러 블록 조각은 최대 크기 이내`);
    const small = r.chunks.filter((c) => c.blocks.join("").length < GENERIC_MIN_CHARS).length;
    assert.ok(small <= Math.max(1, Math.round(r.chunks.length * 0.15)), `${f}: 작은 조각이 너무 많음(${small}/${r.chunks.length})`);
  }
});
