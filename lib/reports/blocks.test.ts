import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type BlockOutput, FIGURE_MM, LOGO_MM, actualBars, blockBullets, blockSignature, cleanBlocks, figureMm, figuresOf, layoutHints, logoNames, visualCount } from "./blocks.ts";

const blk = (b: Omit<Partial<BlockOutput>, "kind"> & { kind: any }): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = []) => ({ head, tag: "", bullets, note: "" });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);

test("블록 정리: 모르는 종류는 버림, 모양은 목록 밖이면 첫째, 숫자 없는 막대는 뺌, 블록은 16개까지", () => {
  const { blocks, dropped } = cleanBlocks(
    [
      blk({ kind: "table", items: ["모르는 종류"] }),
      blk({ kind: "cards", variant: "zigzag", cells: [cell("가", ["a"]), cell("나", ["b"])] }),
      blk({ kind: "bullets", variant: "plus", items: ["불릿"] }),
      blk({ kind: "chart", series: [{ label: "’25년", value: "많음" }, { label: "’26년", value: "3건" }] }),
      blk({ kind: "band", text: "" }),
    ],
    line,
    () => true,
  );
  assert.deepEqual(blocks.map((b) => [b.kind, b.variant]), [["cards", "plus"], ["bullets", ""]], "막대 1개(숫자 있는 것)·빈 띠는 그릴 것이 없어 뺌");
  assert.deepEqual(dropped, [], "칸이 모자란 블록은 경고 없이 뺌(근거 없는 인용·사례만 알림)");
  const many = cleanBlocks(Array.from({ length: 20 }, () => blk({ kind: "bullets", items: ["x"] })), line, () => true);
  assert.equal(many.blocks.length, 16);
});

test("짜임 서명·시각 블록 수: 기본 모양은 이름만, 불릿·소제목은 시각 블록이 아님", () => {
  const { blocks } = cleanBlocks(
    [
      blk({ kind: "bullets", items: ["x"] }),
      blk({ kind: "cards", variant: "plus", cells: [cell("a"), cell("b")] }),
      blk({ kind: "cards", variant: "plain", cells: [cell("a"), cell("b")] }),
      blk({ kind: "subhead", text: "① [국내] 확산" }),
      blk({ kind: "timeline", variant: "dots", cells: [cell("’24년"), cell("’25년")] }),
    ],
    line,
    () => true,
  );
  assert.equal(blockSignature(blocks), "bullets → cards → cards:plain → subhead → timeline:dots");
  assert.equal(visualCount(blocks), 3);
});

test("전년 절 짜임 근사(layoutHints): kordoc 글의 표지로 블록 순서를 처음 나온 순으로", () => {
  const text = [
    "정부 | ’25.6, 장관 지시: 현장 안전 우선",
    "’24년 기술 연구 | ’25년 개발 및 시범 운영 | ’26년 확대 운영",
    "Step 1 민관 협력 | Step 2 실증",
    "구분 | 기존 | 개선",
    "민원 A ✚ 민원 B",
    "“전자파가 걱정돼요”",
    "공공성 | ▶ 국민 안전 확보 ◀",
    "’24년 기술 연구 | ’25년 개발",
  ].join("\n");
  assert.deepEqual(layoutHints(text), ["인용 상자(정부·CEO 원문)", "연도 흐름", "Step 사다리", "As-Is/To-Be·기존/개선", "✚ 병렬 칸", "말풍선(현장 목소리)", "가치 축 띠"]);
  assert.deepEqual(layoutHints("평범한 문장만 있는 절"), []);
});

const fig = (kind: string, over: Record<string, unknown> = {}) => ({ kind, desc: "현장 사진", pos: "right", size: "M", ...over });

test("cleanFigures(그림 자리표시): 블록마다 2개까지, 모르는 종류·빈 서술은 버림, 자리·크기는 목록 밖이면 기본값(right·M)", () => {
  const { blocks } = cleanBlocks([blk({ kind: "bullets", items: ["x"], figures: [fig("photo"), fig("illust"), fig("map"), fig("banner")] as any })], line, () => true);
  assert.equal(blocks[0].figures?.length, 2, "블록마다 2개까지");
  assert.deepEqual(blocks[0].figures, [fig("photo"), fig("illust")]);

  const unknownKind = cleanBlocks([blk({ kind: "bullets", items: ["x"], figures: [{ kind: "video", desc: "동영상", pos: "right", size: "M" }] as any })], line, () => true);
  assert.deepEqual(unknownKind.blocks[0].figures, [], "모르는 종류(video)는 버림");

  const emptyDesc = cleanBlocks([blk({ kind: "bullets", items: ["x"], figures: [{ kind: "photo", desc: "", pos: "right", size: "M" }] as any })], line, () => true);
  assert.deepEqual(emptyDesc.blocks[0].figures, [], "빈 서술은 버림");

  const outOfList = cleanBlocks([blk({ kind: "bullets", items: ["x"], figures: [{ kind: "photo", desc: "현장", pos: "up", size: "XXL" }] as any })], line, () => true);
  assert.deepEqual(outOfList.blocks[0].figures, [{ kind: "photo", desc: "현장", pos: "right", size: "M" }], "목록 밖 자리·크기는 기본값(right·M)");
});

test("cleanFigures: 가운데(center) 자리는 compare·hub에서만 허용 — 그 밖은 오른쪽으로, map은 크기와 상관없이 늘 MAP", () => {
  const compareCenter = cleanBlocks([blk({ kind: "compare", rows: [{ key: "a", before: ["b"], after: ["c"] }], figures: [fig("illust", { pos: "center" })] as any })], line, () => true);
  assert.equal(compareCenter.blocks[0].figures?.[0].pos, "center");
  const hubCenter = cleanBlocks([blk({ kind: "hub", cells: [cell("a"), cell("b")], figures: [fig("logo", { pos: "center", desc: "해양경찰청･KCA･KOMSA" })] as any })], line, () => true);
  assert.equal(hubCenter.blocks[0].figures?.[0].pos, "center");
  const bulletsCenter = cleanBlocks([blk({ kind: "bullets", items: ["x"], figures: [fig("illust", { pos: "center" })] as any })], line, () => true);
  assert.equal(bulletsCenter.blocks[0].figures?.[0].pos, "right", "compare·hub가 아니면 가운데는 오른쪽으로");

  const mapSizeS = cleanBlocks([blk({ kind: "bullets", items: ["x"], figures: [fig("map", { size: "S" })] as any })], line, () => true);
  assert.equal(mapSizeS.blocks[0].figures?.[0].size, "MAP", "지도는 요청한 크기와 상관없이 늘 MAP");
});

test("figuresOf: 블록 순서대로 그림 자리표시를 모두 모음(채울 자료 목록)", () => {
  const { blocks } = cleanBlocks(
    [blk({ kind: "bullets", items: ["x"], figures: [fig("photo", { desc: "사진1" })] as any }), blk({ kind: "cards", cells: [cell("a"), cell("b")] }), blk({ kind: "hub", cells: [cell("a"), cell("b")], figures: [fig("logo", { pos: "center", desc: "KT･한국기술교육대" })] as any })],
    line,
    () => true,
  );
  assert.deepEqual(
    figuresOf(blocks).map((f) => f.desc),
    ["사진1", "KT･한국기술교육대"],
  );
});

test("로고 묶음: 협업 기관 2곳 이상만(KCA 하나만 둔 로고는 뺌 — 평가 라운드 G), 블록마다 하나, 폭은 기관 수만큼(46mm까지)", () => {
  const one = cleanBlocks([blk({ kind: "hub", cells: [cell("a"), cell("b")], figures: [fig("logo", { pos: "center", desc: "한국방송통신전파진흥원(KCA) 기관 로고" })] as any })], line, () => true);
  assert.deepEqual(one.blocks[0].figures, [], "기관 하나뿐인 로고는 뺌");
  const two = cleanBlocks([blk({ kind: "hub", cells: [cell("a"), cell("b")], figures: [fig("logo", { pos: "center", desc: "KT･KCA" }), fig("logo", { pos: "center", desc: "LG･SK" })] as any })], line, () => true);
  assert.equal(two.blocks[0].figures?.length, 1, "로고 묶음은 블록마다 하나");
  assert.deepEqual(logoNames("국립공원공단･이통3사･KCA 기관 로고"), ["국립공원공단", "이통3사", "KCA"]);
});

test("figureMm: 크기 등급별 mm는 FIGURE_MM과 같고, 로고 묶음은 크기와 상관없이 기관 수로(2곳 34mm·3곳 46mm·그 이상 46mm, 높이 LOGO_MM.h)", () => {
  for (const size of ["S", "M", "L", "W", "MAP"] as const) assert.deepEqual(figureMm({ kind: "illust", desc: "x", pos: "right", size }), FIGURE_MM[size]);
  assert.deepEqual(figureMm({ kind: "logo", desc: "KT･KCA", pos: "center", size: "L" }), { w: 34, h: LOGO_MM.h });
  assert.deepEqual(figureMm({ kind: "logo", desc: "해양경찰청･KCA･KOMSA", pos: "center", size: "S" }), { w: 46, h: LOGO_MM.h });
  assert.deepEqual(figureMm({ kind: "logo", desc: "A기관･B기관･C기관･D기관", pos: "center", size: "S" }), { w: 46, h: LOGO_MM.h });
});

// ---------------------------------------------------------------------------
// 수치 표(table)·QA 상자(qa)·VS 대립(cards vs) — 2026-09-27 표현 보강

test("수치 표(table) 정리: 값 열 수는 items 길이-1로 맞추고, 빈 칸도 자리를 지킴(거르지 않음)", () => {
  const { blocks } = cleanBlocks(
    [
      blk({
        kind: "table",
        items: ["구분", "’24년", "’25년", "’26년"],
        cells: [cell("가입자", ["10만", "20만", ""]), cell("매출", ["", "5억", "8억"])] as any,
      }),
    ],
    line,
    () => true,
  );
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].items, ["구분", "’24년", "’25년", "’26년"]);
  assert.equal(blocks[0].cells.length, 2);
  assert.deepEqual(blocks[0].cells[0].bullets, ["10만", "20만", ""], "빈 칸(공란)도 열 자리를 지킴");
  assert.deepEqual(blocks[0].cells[1].bullets, ["", "5억", "8억"]);
});

test("수치 표(table): 머리 줄(items)이 3개 미만이면 통째로 버림", () => {
  const { blocks } = cleanBlocks([blk({ kind: "table", items: ["구분", "’25년"], cells: [cell("가", ["1"]), cell("나", ["2"])] as any })], line, () => true);
  assert.deepEqual(blocks, [], "items<3이면 표를 그릴 수 없어 버림");
});

test("수치 표(table): 값 행이 2개 미만이면 버리고, 7행 이상은 6행까지만", () => {
  const oneRow = cleanBlocks([blk({ kind: "table", items: ["구분", "’25년", "’26년"], cells: [cell("가", ["1", "2"])] as any })], line, () => true);
  assert.deepEqual(oneRow.blocks, [], "행이 1개면(2행 미만) 버림");
  const sevenRows = cleanBlocks(
    [blk({ kind: "table", items: ["구분", "값"], cells: Array.from({ length: 7 }, (_, i) => cell(`행${i}`, [`${i}`])) as any })],
    line,
    () => true,
  );
  // items가 2개(값 열 1개)라 이 표는 items<3이라 버려짐 — 값 열 하나짜리도 머리 3개(구분+값 열 1개+?)가 필요하니 items 3개로 다시 확인
  assert.deepEqual(sevenRows.blocks, [], "items 2개는 버림(위 사례와 같은 규칙 재확인)");
  const sevenRowsOk = cleanBlocks(
    [blk({ kind: "table", items: ["구분", "’25년", "’26년"], cells: Array.from({ length: 7 }, (_, i) => cell(`행${i}`, [`${i}`, `${i + 1}`])) as any })],
    line,
    () => true,
  );
  assert.equal(sevenRowsOk.blocks[0].cells.length, 6, "7행 이상은 6행까지만");
});

test("blockBullets: table은 값이라 문체 경고 대상에서 빠짐", () => {
  const { blocks } = cleanBlocks([blk({ kind: "table", items: ["구분", "’25년", "’26년"], cells: [cell("가", ["1", "2"]), cell("나", ["3", "4"])] as any })], line, () => true);
  assert.deepEqual(blockBullets(blocks[0]), []);
});

test("QA 상자(qa) 정리: 질문(head) 또는 답(bullets)이 없는 쌍은 버리고, 3쌍까지·답은 2개까지", () => {
  const { blocks } = cleanBlocks(
    [
      blk({
        kind: "qa",
        cells: [
          cell("왜 이 사업을 하나요?", ["국민 편익을 위해", "법령 근거"]),
          cell("질문만 있음", []),
          cell("", ["답만 있음"]),
          cell("어떻게 확산하나요?", ["1", "2", "3"]),
          cell("추가 질문", ["답"]),
        ] as any,
      }),
    ],
    line,
    () => true,
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].cells.length, 3, "질문·답 둘 다 있는 쌍만 남고 3쌍까지");
  assert.deepEqual(
    blocks[0].cells.map((c) => c.head),
    ["왜 이 사업을 하나요?", "어떻게 확산하나요?", "추가 질문"],
  );
  assert.deepEqual(blocks[0].cells[1].bullets, ["1", "2"], "답은 2개까지");
});

test("QA 상자(qa): 질문·답이 있는 쌍이 하나도 없으면 버림", () => {
  const { blocks } = cleanBlocks([blk({ kind: "qa", cells: [cell("질문만", []), cell("", ["답만"])] as any })], line, () => true);
  assert.deepEqual(blocks, []);
});

test("VS 대립(cards vs): 두 칸일 때만 유지, 그 밖(1·3칸)은 plain으로", () => {
  const two = cleanBlocks([blk({ kind: "cards", variant: "vs", cells: [cell("찬성"), cell("반대")] })], line, () => true);
  assert.equal(two.blocks[0].variant, "vs");
  const three = cleanBlocks([blk({ kind: "cards", variant: "vs", cells: [cell("가"), cell("나"), cell("다")] })], line, () => true);
  assert.equal(three.blocks[0].variant, "plain", "2칸이 아니면 평범한 카드로");
});

test("blockSignature: cards:vs도 기본 모양(plus)이 아니므로 종류:모양으로 남음", () => {
  const { blocks } = cleanBlocks([blk({ kind: "cards", variant: "vs", cells: [cell("찬성"), cell("반대")] })], line, () => true);
  assert.equal(blockSignature(blocks), "cards:vs");
});

test("actualBars(2026-10-15): 값이 【확인】 자리표시거나 막대용 수로 안 읽히면 실적이 아님 — ’25 실적 + ’26 목표 + ’26 【확인】 막대는 실적 1개라 빠짐", () => {
  const series = [
    { label: "’25년 실적", value: "4.16점" },
    { label: "’26년 목표", value: "4.37점" },
    { label: "’26년 실적", value: "【확인: ’26년 만족도】" },
  ];
  assert.deepEqual(actualBars(series).map((x) => x.label), ["’25년 실적"]);
  assert.deepEqual(actualBars([{ label: "’25년", value: "’25 기준" }, { label: "’24년", value: "80점" }]).map((x) => x.label), ["’24년"], "수로 시작하지 않는 값은 실적 아님");
  const { blocks, dropped } = cleanBlocks([blk({ kind: "chart", label: "추진성과", title: "만족도", series })], line, () => true);
  assert.equal(blocks.length, 0);
  assert.ok(dropped.some((d) => d.startsWith("막대: 실적 값이 2개 미만")));
  const ok = cleanBlocks([blk({ kind: "chart", label: "추진성과", title: "만족도", series: [{ label: "’24년", value: "4.02점" }, ...series] })], line, () => true);
  assert.equal(ok.blocks.length, 1, "실적 둘(’24·’25)이면 자리표시 막대가 있어도 남음");
});

// 핵심 수치 띠 실적 규칙(2026-10-15 블라인드 심사 — 「띠가 ’25 실적·’26 목표·자리표시뿐」): 칸 = [head 큰 수치, note 시점]
const stat = (head: string, note = "", bullets: string[] = ["뜻 줄"]) => ({ head, tag: "", bullets, note });
const NEED = (x: string) => `【확인: ’26년 ${x}】`;
const STATS_DROP: Array<[string, ReturnType<typeof stat>[]]> = [
  ["자리표시 2칸 + 국적 순서(2-2-가)", [stat(NEED("판독 건수")), stat(NEED("정확도")), stat("인도네시아·베트남·중국", "’26년", ["진출 국가"])]],
  ["목표 1칸 + 자리표시 2칸", [stat("14,083명", "’26년 목표"), stat(NEED("교육 인원")), stat(NEED("만족도"))]],
  ["전년 실적 2칸 + 자리표시", [stat("30,706건", "’25년"), stat("97%", "’25년"), stat(NEED("대체 건수"))]],
  ["목표·예상 + 자리표시", [stat("45,000건", "목표"), stat("1.5만 시간", "예상"), stat(NEED("절감 시간"))]],
];
const STATS_KEEP: Array<[string, ReturnType<typeof stat>[]]> = [
  ["올해 실적 2칸 + 자리표시", [stat("93.9%", "’26.7 시범"), stat("1,416건", "’26.7"), stat(NEED("누적 건수"))]],
  ["올해 실적 2칸", [stat("720건", "’26.9.21 기준"), stat("50건", "’26.9")]],
];

test("cleanBlocks(statsYear — 주요사업): 올해 실적 칸이 2개 미만인 핵심 수치 띠는 빼고 dropped에 이유, 2개 이상이면 남김", () => {
  for (const [name, cells] of STATS_DROP) {
    const { blocks, dropped } = cleanBlocks([blk({ kind: "stats", cells })], line, () => true, { statsYear: 2026 });
    assert.equal(blocks.length, 0, name);
    assert.ok(dropped.some((d) => /^수치 띠: 올해 실적 칸이 [01]개뿐/.test(d)), `${name}: ${dropped.join(" / ")}`);
  }
  for (const [name, cells] of STATS_KEEP) {
    const { blocks, dropped } = cleanBlocks([blk({ kind: "stats", cells })], line, () => true, { statsYear: 2026 });
    assert.equal(blocks.length, 1, name);
    assert.deepEqual(dropped, [], name);
  }
});

test("cleanBlocks(statsYear 없음 — 경영관리·블록 고치기): 같은 수치 띠를 빼지 않음(예전 그대로)", () => {
  for (const [name, cells] of STATS_DROP) assert.equal(cleanBlocks([blk({ kind: "stats", cells })], line, () => true).blocks.length, 1, name);
});
