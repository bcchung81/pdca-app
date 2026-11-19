// 경영관리 편람 항목표(lib/reports/mg-items.ts) 시험 — 2026-11-19 사용자 결정 D1(안 2 — '26 편람 번호)·D4~D8·D10.
// 지키는 것: 14지표 불변식(번호 연속 · 2025 평가내용 39개가 하나씩만 대응 · 2025에만 있는 평가내용 0) · 상생 번호 이동(2 → 3·3 → 4·② 신설) · 신설 항목(일자리 ⑤⑥·창업 ⑤⑥·혁신가점 ⑤) ·
// 뺀 항목(재무 ④⑤·보수 직무급) · 카드 추천 표('26 번호) · 편람 글 읽기(수정본이 같은 번호를 덮음 · 「⋮」 자리는 최초 조각 · 혁신가점 ③ 「-」 항목 · ※ 단서 각주는 뺌) · 제목 출처 · 실제 조각(git 밖 — 없으면 건너뜀)

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { MG_CARD_EVALS, MG_ITEM_CANDIDATES, MG_ITEM_PLAN, from26, handbookItems, isNewItem, mgItemTag, mgItems, to26 } from "./mg-items.ts";

/** 2025 보고서 지표별 평가내용 수(rpt25-mg-01~14 세부평가내용별 장 — 합 39) */
const EVALS_2025: Record<string, number> = { "MG-1": 2, "MG-2": 3, "MG-3": 4, "MG-4": 2, "MG-5": 1, "MG-6": 4, "MG-7": 3, "MG-8": 3, "MG-9": 5, "MG-10": 3, "MG-11": 3, "MG-12": 1, "MG-13": 1, "MG-14": 4 };

test("항목표 불변식: 14지표 · 번호는 1부터 연속 · 2025 평가내용 39개가 from으로 하나씩만 대응(2025에만 있는 평가내용 0) · '26 본문 대상 45개", () => {
  assert.deepEqual(Object.keys(MG_ITEM_PLAN).sort(), Object.keys(EVALS_2025).sort());
  let froms = 0;
  let total = 0;
  for (const [unit, plan] of Object.entries(MG_ITEM_PLAN)) {
    assert.deepEqual(plan.map((x) => x.no), plan.map((_, i) => i + 1), `${unit} 번호 연속`);
    const from = plan.flatMap((x) => (x.from === undefined ? [] : [x.from])).sort((a, b) => a - b);
    assert.deepEqual(from, Array.from({ length: EVALS_2025[unit] }, (_, i) => i + 1), `${unit} 2025 평가내용이 하나씩만`);
    for (const x of plan) assert.equal(x.from === undefined, x.kind === "신설26" || x.kind === "신설2611", `${unit} ${x.no} 신설 ↔ 2025에 없음`);
    froms += from.length;
    total += plan.length;
  }
  assert.equal(froms, 39);
  assert.equal(total, 45);
});

test("번호 옮기기: 상생만 옛 2 → 3·옛 3 → 4(② 지역업체 신설 — 2025 없음), 나머지 지표·항목표에 없는 지표는 그대로", () => {
  assert.deepEqual([1, 2, 3].map((n) => to26("MG-7", n)), [1, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map((n) => from26("MG-7", n)), [1, null, 2, 3]);
  for (const unit of Object.keys(MG_ITEM_PLAN).filter((u) => u !== "MG-7")) for (let n = 1; n <= EVALS_2025[unit]; n++) assert.equal(to26(unit, n), n, `${unit} ${n}`);
  assert.equal(to26("BZ-1", 2), 2, "항목표에 없는 지표");
  assert.equal(from26("MG-3", 6), null, "신설은 2025에 없음");
});

test("신설·뺀 항목: 일자리 ⑤(최초)·⑥(11.13) · 창업 ⑤(최초 — 연기금)·⑥(11.13) · 상생 ② · 혁신가점 ⑤(기능개혁), 재무 ④⑤·보수 직무급은 항목표에 없음(D7)", () => {
  const kinds = (u: string) => MG_ITEM_PLAN[u].filter((x) => x.kind !== "같음").map((x) => `${x.no}:${x.kind}`);
  assert.deepEqual(kinds("MG-3"), ["1:수정", "5:신설26", "6:신설2611"]);
  assert.deepEqual(kinds("MG-6"), ["5:신설26", "6:신설2611"]);
  assert.deepEqual(kinds("MG-7"), ["2:신설2611", "3:수정"]);
  assert.deepEqual(kinds("MG-14"), ["3:수정", "5:신설2611"]);
  assert.deepEqual(kinds("MG-4"), ["1:수정", "2:수정"]);
  assert.equal(MG_ITEM_PLAN["MG-8"].length, 3, "재무 ④⑤ 뺌");
  assert.ok(MG_ITEM_PLAN["MG-11"].every((x) => x.comp === "k2"), "보수 직무급(비계량 1/2 — k1) 뺌");
  assert.deepEqual([mgItemTag("같음"), mgItemTag("수정"), mgItemTag("신설26"), mgItemTag("신설2611")], ["", "수정", "신설('26 편람)", "신설(11.13 수정)"]);
});

test("카드 추천 표('26 번호): 3-1 → 1·3·5·6(D10) · 4-3 → 2 재난(D8) · 6-1 → 1·6 · 7-4 → 3 · 7-5 → 4, 담당 미정 항목은 추천에 없고 후보로만(D4~D6)", () => {
  assert.deepEqual(MG_CARD_EVALS["3-1"], [1, 3, 5, 6]);
  assert.deepEqual(MG_CARD_EVALS["4-3"], [2]);
  assert.deepEqual(MG_CARD_EVALS["6-1"], [1, 6]);
  assert.deepEqual([MG_CARD_EVALS["7-4"], MG_CARD_EVALS["7-5"]], [[3], [4]]);
  const held = (unit: string, no: number) => Object.entries(MG_CARD_EVALS).some(([t, nos]) => t.startsWith(`${unit.slice(3)}-`) && nos.includes(no));
  assert.ok(!held("MG-7", 2) && !held("MG-14", 5) && !held("MG-6", 5), "상생 ②·기능개혁·연기금은 담당 미정");
  assert.deepEqual(MG_ITEM_CANDIDATES["MG-7"][2], ["7-3"]);
  assert.deepEqual(MG_ITEM_CANDIDATES["MG-14"][5], ["14-1", "1-1"]);
  assert.equal(MG_ITEM_CANDIDATES["MG-6"]?.[5], undefined, "연기금은 후보도 없음(「자료 필요」)");
});

// 짧은 픽스처 글(원문 아님 — 편람 조각 「세부평가내용:」 칸의 모양만)
const OLD7 = { chunk_key: "plan-2607/handbook26/MG-7/k2", text: "지표정의: • 정의\n\n세부평가내용: ① 상생 노력\n* 상생 착안\n② 옛 기부 봉사\n* 옛 착안\n③ 시설 개방\n* 주차장" };
const REV7 = { chunk_key: "hb26r-2611/handbook26/MG-7/k2", text: "지표정의: • 정의\n\n세부평가내용: ① 상생 노력\n* 상생 착안\n② 지역업체 발주\n* 발주 비중\n* 협력사 육성\n③ 기부·봉사, 지역인재\n양성 노력\n* 지역공부방\n④ 시설 개방\n* 주차장\n※ ②③항은 여건 고려", meta: { revision: "2026.11.13" } };
const OLD3 = { chunk_key: "plan-2607/handbook26/MG-3/k2", text: "세부평가내용: ① 옛 신규채용\n② 민간 일자리\n③ 사회형평\n④ 여성\n⑤ 비정규직 처우\n* 사전심사제" };
const REV3 = { chunk_key: "hb26r-2611/handbook26/MG-3/k2", text: "세부평가내용: ① 청년 등 신규채용\n* 취업지원\n② 민간 일자리\n⋮\n⑥ 공정채용 전략\n* 블라인드 채용", meta: { revision: "2026.11.13" } };
const MG14 = { chunk_key: "hb26r-2611/handbook26/MG-14/k1", text: "세부평가내용: ③ 국정과제 이행(2점)\n- 정부정책 수행\n* 물가 안정\n- 신속투자\n집행 노력\n* 점검 결과\n- 청년 채용\n* 신규채용 목표\n* 청년인턴\n- 국민체감\n* 개선과제\n- 기능개혁 이행\n* 실적 제출", meta: { revision: "2026.11.13" } };

test("편람 글 읽기: 동그라미 항목 머리(끊긴 줄 이음)·착안사항(「*」·「-」 줄), 「※」 단서와 그 아래 「*」 각주는 뺌, 「⋮」는 건너뜀", () => {
  const items = handbookItems(REV7.text);
  assert.deepEqual(items.map((x) => [x.no, x.head]), [[1, "상생 노력"], [2, "지역업체 발주"], [3, "기부·봉사, 지역인재 양성 노력"], [4, "시설 개방"]]);
  assert.deepEqual(items[1].marks.map((m) => m.text), ["발주 비중", "협력사 육성"]);
  assert.deepEqual(items[3].marks.map((m) => m.text), ["주차장"], "※ 단서 뺌");
  assert.deepEqual(handbookItems("세부평가내용: ① 가\n※ 0점 단서\n* 단서 각주\n② 나").map((x) => [x.no, x.marks.length]), [[1, 0], [2, 0]]);
  assert.deepEqual(handbookItems(REV3.text).map((x) => x.no), [1, 2, 6]);
  assert.deepEqual(handbookItems("지표정의: 세부평가내용 없음"), []);
});

test("항목표 만들기: 수정본이 같은 번호를 덮고(상생 ②③④·일자리 ①⑥) 「⋮」로 줄인 번호는 최초 조각(일자리 ③④⑤), 같음 항목 제목은 2025 제목, 혁신가점 ③은 「-」 항목·그 아래 「*」", () => {
  const prior = [
    { evalNo: 1, evalNo2025: 1, evalTitle: "2025 상생 제목", themeNo: 1, mark: "", title: "" },
    { evalNo: 3, evalNo2025: 2, evalTitle: "2025 기부 제목", themeNo: 4, mark: "나", title: "지역산업 성장 지원" },
    { evalNo: 4, evalNo2025: 3, evalTitle: "2025 시설 제목", themeNo: 1, mark: "", title: "" },
  ];
  const sibs = [{ taskNo: "7-3", parts: [{ evalNo: 1 }, { evalNo: 1 }] }, { taskNo: "7-4", parts: [{ evalNo: 3 }] }];
  const { items, warnings } = mgItems("MG-7", [OLD7, REV7], { prior, siblings: sibs });
  assert.deepEqual(warnings, []);
  assert.deepEqual(items.map((x) => [x.no, x.kind, x.title, x.from2025]), [
    [1, "같음", "2025 상생 제목", 1],
    [2, "신설2611", "지역업체 발주", null],
    [3, "수정", "기부·봉사, 지역인재 양성 노력", 2],
    [4, "같음", "2025 시설 제목", 3],
  ]);
  assert.deepEqual(items[1].points, ["발주 비중", "협력사 육성"]);
  assert.deepEqual([items[1].cards, items[1].candidates, items[2].cards, items[3].cards], [[], ["7-3"], ["7-4"], ["7-5"]]);
  assert.deepEqual(items[0].cards, ["7-1", "7-2", "7-3"]);
  assert.deepEqual(items[1].ref25, { key: "3.4.나", label: "평가내용 3 · 대주제 4 · 나. 지역산업 성장 지원" }, "2025 참고 절(2.4.나)은 '26 번호로 옮겨 보임");
  assert.deepEqual(items[0].taken, [{ taskNo: "7-3", parts: 2 }]);
  assert.ok(isNewItem(items[1]) && !isNewItem(items[2]));

  const mg3 = mgItems("MG-3", [OLD3, REV3]).items;
  assert.deepEqual(mg3.map((x) => x.title), ["청년 등 신규채용", "민간 일자리", "사회형평", "여성", "비정규직 처우", "공정채용 전략"], "①⑥은 수정본, ③④⑤는 최초 조각(같음은 2025 제목이 없으면 편람 글)");
  assert.deepEqual(mg3[4].points, ["사전심사제"]);

  const mg14 = mgItems("MG-14", [MG14]).items;
  assert.deepEqual(mg14.map((x) => x.title), ["정부정책 수행", "신속투자 집행 노력", "청년 채용", "국민체감", "기능개혁 이행"]);
  assert.deepEqual(mg14[2].points, ["신규채용 목표", "청년인턴"]);
  assert.deepEqual(mg14[4].candidates, ["14-1", "1-1"]);
});

test("항목표 만들기: 편람 글이 없으면 수정·신설은 짧은 이름 + 경고, 같음은 2025 제목(없으면 짧은 이름) · 항목표에 없는 지표는 빈 목록", () => {
  const r = mgItems("MG-6", [], { prior: [{ evalNo: 1, evalTitle: "2025 해외진출", themeNo: 1, mark: "", title: "" }] });
  assert.deepEqual(r.items.map((x) => x.title), ["2025 해외진출", "데이터 개방·협업", "중소기업 기술마켓", "미활용 특허 공유·이전", "연기금 벤처투자", "청년 창업 지원"]);
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings[0], /MG-6 평가내용 5\(연기금 벤처투자\)의 편람 글을 읽지 못해/);
  assert.deepEqual(mgItems("BZ-1", []), { items: [], warnings: [] });
});

test("항목표 만들기: 수정본이 없으면 상생은 최초 조각의 옛 번호로 읽음(③ 항목은 최초 ②, 신설 ②는 글 없이 짧은 이름 + 경고), 수정본이 있으면 수정본 글", () => {
  const prior = [{ evalNo: 4, evalNo2025: 3, evalTitle: "2025 시설 제목", themeNo: 1, mark: "", title: "" }];
  const a = mgItems("MG-7", [OLD7], { prior });
  assert.equal(a.items[1].title, "지역업체 발주·지역기업 육성", "신설 ②는 최초 조각에서 안 읽음");
  assert.equal(a.warnings.length, 1);
  assert.match(a.warnings[0], /MG-7 평가내용 2/);
  assert.equal(a.items[2].title, "옛 기부 봉사", "③ 항목은 최초 ② 머리");
  assert.deepEqual(a.items[2].points, ["옛 착안"]);
  assert.equal(a.items[3].title, "2025 시설 제목");
  assert.equal(mgItems("MG-7", [OLD7]).items[3].title, "시설 개방", "2025 제목 없으면 최초 ③ 시설 글");
  const b = mgItems("MG-7", [OLD7, REV7]).items;
  assert.deepEqual(b.map((x) => x.title).slice(1), ["지역업체 발주", "기부·봉사, 지역인재 양성 노력", "시설 개방"]);
});

const CHUNK_DIR = resolve(import.meta.dirname, "../../resources/knowledge/_chunks");
const HAVE = existsSync(resolve(CHUNK_DIR, "plan-2607.jsonl")) && existsSync(resolve(CHUNK_DIR, "hb26r-2611.jsonl"));
test("실제 편람 조각: 14지표 45개 항목 모두 편람 글을 읽고(경고 없음), 수정본 신설은 수정본 글 · 신설 착안사항이 있음", { skip: !HAVE && "편람 조각(resources/knowledge/_chunks/plan-2607.jsonl·hb26r-2611.jsonl — git 밖)이 없음" }, () => {
  const rows = ["plan-2607", "hb26r-2611"].flatMap((d) => readFileSync(resolve(CHUNK_DIR, `${d}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))).filter((c) => /\/handbook26\/MG-/.test(c.chunk_key));
  let n = 0;
  for (const unit of Object.keys(MG_ITEM_PLAN)) {
    const r = mgItems(unit, rows);
    assert.deepEqual(r.warnings, [], unit);
    n += r.items.length;
    for (const it of r.items.filter(isNewItem)) assert.ok(it.title.length > 4, `${unit} ${it.no} 제목`);
  }
  assert.equal(n, 45);
  const mg7 = mgItems("MG-7", rows).items;
  assert.match(mg7[1].title, /지역업체/);
  assert.match(mg7[2].title, /지역인재/);
  assert.ok(mgItems("MG-3", rows).items[5].points.length > 0, "공정채용 착안사항");
});
