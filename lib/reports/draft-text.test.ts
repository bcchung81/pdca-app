import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { applyDraftText } from "./draft-text.ts";
import type { ReportSectionSpec } from "./section.ts";
import { sectionHtml } from "./section-html.ts";

const cell = (head: string, bullets: string[], note = "", tag = "") => ({ head, tag, bullets, note });
const blk = (over: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...over });

/** 여러 모양의 블록이 든 초안(렌더러가 경로를 다는 곳을 고루) */
const spec = (): ReportSectionSpec =>
  ({
    version: 3,
    card: { id: "c", taskNo: "1-가", title: "과제" },
    business: { no: 1, name: "대상사업" },
    task: { no: "1-1", title: "실행과제", bp: false },
    sub: { mark: "가", title: "**AI**로 판독 시간 단축", markers: [] },
    rows: [],
    results: ["처리 기간 **30% 단축**", "만족도 향상 【확인: ’26 만족도】"],
    resultCards: [],
    caption: "",
    module: 1,
    blocks: [
      blk({ kind: "bullets", label: "추진배경", items: ["첫 줄", "둘째 줄 ^{’25년}10건"] }),
      blk({ kind: "cards", variant: "plus", label: "현황", cells: [cell("칸1", ["가"], "결과1", "태그"), cell("칸2", ["나"]), cell("칸3", ["다"])] }),
      blk({ kind: "compare", variant: "panels", items: ["As-Is 수기", "To-Be 자동"], rows: [{ key: "", before: ["① 손으로 입력", "지연"], after: ["➊ 자동 송출"] }] }),
      blk({ kind: "compare", variant: "table", label: "추진내용", rows: [{ key: "절차", before: ["3단계"], after: ["1단계"] }] }),
      blk({ kind: "steps", variant: "row", label: "추진내용", cells: [cell("설계", ["a"]), cell("Step 2 개발", ["b"], "완료"), cell("확산", ["c"], "", "핵심")] }),
      blk({ kind: "steps", variant: "zigzag", cells: [cell("의견", ["a"]), cell("한계", ["b"]), cell("방향", ["c"]), cell("해결", ["d"], "끝")] }),
      blk({ kind: "timeline", variant: "chevron", label: "추진경과", cells: [cell("’24년", ["기반"]), cell("’25년", ["확산"], "누적 3곳")] }),
      blk({ kind: "timeline", variant: "dots", cells: [cell("’23", ["설계"]), cell("’24", ["시행"], "10개")] }),
      blk({ kind: "hub", label: "협업", cells: [cell("KCA", ["주관", "운영"]), cell("과기정통부", ["정책", "예산"]), cell("지자체", ["현장"])] }),
      blk({ kind: "voices", cells: [cell("시민", ["편해졌어요"]), cell("", ["좋아요"])] }),
      blk({ kind: "define", title: "무엇인가?", text: "설명", items: ["접수", "처리"] }),
      blk({ kind: "band", label: "공공성", text: "모두에게" }),
      blk({ kind: "banner", text: "핵심 메시지" }),
      blk({ kind: "quotes", cells: [cell("정부 방향", ["원문 인용"], "(’25.6, 보도)", "정부")] }),
      blk({ kind: "case", label: "우수사례", title: "공모전", items: ["공모명 | 2025 AI 공모전", "그냥 한 줄"] }),
      blk({ kind: "subhead", text: "① [국내] 갈래" }),
      blk({ kind: "qa", cells: [cell("왜 필요한가?", ["답 하나"])] }),
      blk({ kind: "table", items: ["구분", "’24", "’25"], cells: [cell("건수", ["10건", "20건"])] }),
      blk({ kind: "stats", cells: [cell("97%", ["신뢰도"], "’25년", "검증"), cell("3만국", ["수도권"])] }),
      blk({ kind: "chart", label: "추진경과", title: "건수", series: [{ label: "’24년", value: "10" }, { label: "’25년", value: "20" }] }),
    ],
  }) as unknown as ReportSectionSpec;

/** 경로 값 읽기(테스트용) */
function valueAt(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, k) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined), root);
}
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

test("sectionHtml editMarks: 표지가 없으면 출력이 예전과 같고, 켜면 글 조각마다 data-t(초안 JSON 경로)·data-raw(원래 글)", () => {
  const s = spec();
  const plain = sectionHtml(s, [], { blockMarks: true });
  assert.ok(!plain.includes('class="k-t"'), "표지 끔 — 고치기 표지 없음");
  const marked = sectionHtml(s, [], { blockMarks: true, editMarks: true });
  const tags = [...marked.matchAll(/<span class="k-t" data-t="([^"]+)"(?: data-j="([^"]*)")? data-raw="([^"]*)">/g)];
  assert.ok(tags.length > 60, `표지 수 ${tags.length}`);
  for (const [, path, join, raw] of tags) {
    const v = valueAt(s, path);
    const want = join ? (Array.isArray(v) ? v.join(unesc(join)) : undefined) : v;
    assert.equal(typeof want, "string", `${path}는 글(또는 이음 배열)을 가리킴`);
    assert.equal(unesc(raw), want, `${path}의 원래 글`);
  }
  const paths = new Set(tags.map((t) => t[1]));
  for (const p of ["sub.title", "results.0", "blocks.0.items.1", "blocks.1.cells.0.head", "blocks.1.cells.0.note", "blocks.2.rows.0.before", "blocks.3.rows.0.after.0", "blocks.5.cells.3.note", "blocks.8.cells.1.bullets", "blocks.14.items.0", "blocks.18.cells.0.head"]) assert.ok(paths.has(p), `${p} 표지`);
  // 단계 흐름: 「Step 2 개발」처럼 앞말이 붙거나 tag를 이어 붙인 제목은 어느 칸을 고칠지 모호해 표지 안 함
  assert.ok(!paths.has("blocks.4.cells.1.head") && !paths.has("blocks.4.cells.2.head") && paths.has("blocks.4.cells.0.head"));
  // 표지 켬 여부와 상관없이 보이는 글은 같음(태그만 더함)
  const text = (h: string) => h.replace(/<[^>]+>/g, "");
  assert.equal(text(marked), text(plain));
  // v3이 아닌 초안은 표지 안 함
  assert.ok(!sectionHtml({ ...s, version: 2 } as ReportSectionSpec, [], { editMarks: true }).includes('class="k-t"'));
});

test("applyDraftText: 허용 경로의 글만 바꾸고(블록이면 blockIndex), 이음 배열은 「 / 」로 나누고, 같은 글이면 바뀌지 않음", () => {
  const s = spec();
  const r = applyDraftText(s, { path: "blocks.1.cells.0.bullets.0", text: "새 글" });
  assert.ok(r.ok && r.changed && r.blockIndex === 1 && r.before === "가" && r.after === "새 글");
  assert.equal((r as { spec: ReportSectionSpec }).spec.blocks![1].cells[0].bullets[0], "새 글");
  assert.equal(s.blocks![1].cells[0].bullets[0], "가", "원래 초안은 그대로(복사본에 씀)");
  const j = applyDraftText(s, { path: "blocks.8.cells.1.bullets", text: "정책 / 예산 / 감독", join: " / " });
  assert.ok(j.ok && j.changed);
  assert.deepEqual((j as { spec: ReportSectionSpec }).spec.blocks![8].cells[1].bullets, ["정책", "예산", "감독"]);
  const slash = applyDraftText(s, { path: "blocks.8.cells.1.bullets", text: "24/7 운영", join: " / " });
  assert.deepEqual((slash as { spec: ReportSectionSpec }).spec.blocks![8].cells[1].bullets, ["24/7 운영"], "앞뒤 빈칸 없는 빗금은 나누지 않음");
  const same = applyDraftText(s, { path: "sub.title", text: "**AI**로 판독 시간 단축" });
  assert.ok(same.ok && !same.changed && same.blockIndex === null);
  const title = applyDraftText(s, { path: "results.1", text: "만족도 향상" });
  assert.ok(title.ok && title.changed && title.blockIndex === null);
});

test("applyDraftText: 허용 목록 밖 경로·없는 블록·글이 아닌 값·모르는 이음은 거절", () => {
  const s = spec();
  for (const path of ["blocks.0.kind", "blocks.19.series.0.value", "blocks.0.figures.0.desc", "card.title", "__proto__.x", "blocks.40.items.0", "blocks.0.items.9"]) assert.equal(applyDraftText(s, { path, text: "x" }).ok, false, path);
  assert.equal(applyDraftText(s, { path: "blocks.1.cells.0.bullets", text: "x" }).ok, false, "배열은 이음 없이 못 바꿈");
  assert.equal(applyDraftText(s, { path: "blocks.8.cells.1.bullets", text: "x", join: " | " }).ok, false, "모르는 이음");
});
