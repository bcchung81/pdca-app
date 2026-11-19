// 편람 수정 신구대비표 파서 시험 — 표 모양(기존 | 수정 두 열, 병합)만 본뜬 시험용 가상 자료입니다(실제 편람 글 아님).
// 실제 파일 시험은 kordoc 산출물이 이 컴퓨터에 있을 때만 돕니다(resources/knowledge는 git 밖).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { layerOf } from "../bundle.ts";
import { commonKpiOwner } from "../common-kpi-owner.ts";
import { revisionNote } from "../revision-note.ts";
import type { SourceBlock } from "../source.ts";
import { loadKordocChunks } from "../source.ts";
import type { KnowledgeChunk } from "../types.ts";
import { HANDBOOK_REV_EXPECTED, MG_REV_COMPONENTS, parseHandbookRev } from "./handbook-rev.ts";

let id = 0;
const block = (text: string, page: number, type = "table"): SourceBlock => ({ id: `b${id++}`, type, text, page, breadcrumb: [] });
const heading = (text: string, page: number) => block(`# ${text}`, page, "heading");

// 경영관리: 평가지표 칸(rowspan)·기존 쪽 취소선·(신 설)이 있는 두 열 표, 쪽을 넘어 값만 이어지는 표
const MG_TABLE = `<table>
<tr><th></th><th colspan="4">2026년도 경영평가편람(기존)</th><th colspan="3">2026년도 경영평가편람(수정)</th></tr>
<tr><td></td><td>평가지표</td><td colspan="3">세부평가내용</td><td>평가지표</td><td colspan="2">세부평가내용</td></tr>
<tr><td></td><td rowspan="3">일자리<br>및</td><td>지표정의</td><td colspan="2">• 옛 정의</td><td rowspan="3">일자리<br>및<br>균등한<br>기회</td><td>지표정의</td><td>• 가상 정의</td></tr>
<tr><td></td><td>적용대상<br>(배점)</td><td colspan="2">• 준정부기관 : 계량 2점</td><td>적용대상<br>(배점)</td><td>• 공기업 및 준정부기관 : 계량 2점</td></tr>
<tr><td></td><td>세부평가내용</td><td colspan="2">① 옛 항목<br>~~② 지운 항목~~<br><u>(신 설)</u></td><td>세부평가내용</td><td>① 가상 항목<br>⋮</td></tr>
</table>`;
const MG_CONT = `<table>
<tr><th colspan="2">2026년도 경영평가편람(기존)</th><th colspan="2">2026년도 경영평가편람(수정)</th></tr>
<tr><td></td><td><u>(신 설)</u></td><td></td><td>⑥ 가상 신설 항목</td></tr>
</table>`;
// 주요사업: 총괄요약표 · 지표 머리 · 기존 쪽 (신 설) 병합 · 쪽 넘김 이어짐 · 바뀌지 않은 지표 목록
const SUMMARY = `<table>
<tr><th colspan="4">2026년도 경영평가편람(기존)</th><th colspan="4">2026년도 경영평가편람(수정)</th></tr>
<tr><td>지표명</td><td>비계량</td><td>계량</td><td>합계</td><td>지표명</td><td>비계량</td><td>계량</td><td>합계</td></tr>
<tr><td>2. 국민안전 편익서비스 강화 사업</td><td></td><td></td><td>18</td><td>2. 국민안전 편익서비스 강화 사업</td><td></td><td></td><td>18</td></tr>
<tr><td>(1) 옛 지표</td><td></td><td>8</td><td></td><td>(1) <u>가상 지표 가</u></td><td></td><td>5</td><td></td></tr>
<tr><td colspan="4">(신 설)</td><td><u>(2) 가상 지표 나</u></td><td></td><td>3</td><td></td></tr>
<tr><td>(2) 성과관리의 적정성</td><td>10</td><td></td><td></td><td>(3) 성과관리의 적정성</td><td>10</td><td></td><td></td></tr>
<tr><td>주요사업 합계</td><td>10</td><td>8</td><td>18</td><td>주요사업 합계</td><td>10</td><td>8</td><td>18</td></tr>
</table>`;
const METRICS = `<table>
<tr><th></th><th colspan="3">2026년도 경영평가편람(기존)</th><th colspan="2">2026년도 경영평가편람(수정)</th></tr>
<tr><td></td><td colspan="3">(1) 옛 지표 (평가방식 : 목표부여(편차), 가중치 : 8점)</td><td colspan="2">(1) 가상 지표 가 (평가방식 : 목표부여(편차), 가중치 : 5점)</td></tr>
<tr><td></td><td>정 의</td><td colspan="2">옛 정의</td><td>정 의</td><td>가상 정의 가</td></tr>
<tr><td></td><td>측정 산식<br>및 변수</td><td colspan="2">~~옛 산식~~</td><td>측정 산식<br>및 변수</td><td>① 가 = A / B</td></tr>
<tr><td></td><td colspan="3" rowspan="3"><u>(신 설)</u></td><td colspan="2">(2) 가상 지표 나 (가중치 : 3점)</td></tr>
<tr><td></td><td>정 의</td><td>가상 정의 나</td></tr>
<tr><td></td><td>측정 산식<br>및 변수</td><td>① 나 = C / D</td></tr>
</table>`;
const TAIL = `<table>
<tr><th>2026년도 경영평가편람(기존)</th><th colspan="2">2026년도 경영평가편람(수정)</th></tr>
<tr><td></td><td></td><td>② D : 가상 변수 설명</td></tr>
<tr><td>(2) 성과관리의 적정성 (평가방식 : 9등급평가, 가중치 : 10점)</td><td colspan="2">(3) 성과관리의 적정성 (평가방식 : 9등급평가, 가중치 : 10점)<br>(4) 다른 가상 지표 (평가방식 : 목표대실적, 가중치 : 1점)</td></tr>
</table>`;

const SAMPLE: SourceBlock[] = [
  heading("제1장 경영실적 평가개요", 1),
  block(MG_TABLE.replace("일자리<br>및<br>균등한<br>기회", "평가 주체"), 1), // 읽는 범위 밖(제3절 앞) — 무시
  heading("제3절 평가지표별 세부평가내용", 3),
  block(MG_TABLE, 3),
  block(MG_CONT, 4),
  heading("제3장 경영실적 평가방법", 10),
  block(MG_TABLE, 10), // 범위 밖
  heading("❖ 총괄요약표 (주요사업)", 18),
  block(SUMMARY, 18),
  heading("국민안전 편익서비스 강화 사업 [18점]", 19),
  block(METRICS, 19),
  block(TAIL, 20),
];

test("가상 표: 「수정」 쪽 칸만(기존 쪽 취소선·(신 설)은 버림), 경영관리 구성요소는 옛 편람 자리(supersedes)로, 쪽 넘김 표는 앞 칸에 이어 붙임", () => {
  const { chunks, checks } = parseHandbookRev(SAMPLE);
  const mg = chunks.find((c) => c.chunk_key === "hb26r-2611/handbook26/MG-3/k1")!;
  assert.deepEqual(mg.blocks, ["지표정의: • 가상 정의", "적용대상(배점): • 공기업 및 준정부기관 : 계량 2점", "세부평가내용: ① 가상 항목\n⋮\n⑥ 가상 신설 항목"]);
  assert.equal(mg.title, "'26 편람(11.13 수정) · 일자리 및 균등한 기회 · 계량 (1/2)");
  assert.match(mg.context_prefix, /^'26 편람\(11\.13 수정\) · 경영관리 범주 · 안전 및 책임경영 · \(1\) 일자리 및 균등한 기회 · 구성요소 1\/2 · 적용대상 /);
  assert.deepEqual([mg.unit_type, mg.track, mg.business, mg.measure, mg.pdf_page_start, mg.pdf_page_end], ["handbook_indicator", "경영관리", "MG-3", "계량", 3, 4]);
  assert.deepEqual([mg.meta.supersedes, mg.meta.revision, mg.meta.elided, mg.meta.weight_quasi_gov], [["plan-2607/handbook26/MG-3/k1"], "2026.11.13", true, 2]);
  assert.ok(chunks.every((c) => !/옛|지운|\(신\s*설\)|평가 주체/.test(c.text)), "기존 쪽·범위 밖 글이 섞임");
  const ok = (name: string) => checks.find((c) => c.name === name)!.ok;
  assert.equal(ok("편람 수정 붙일 곳 없는 「수정」 칸 없음"), true);
  assert.equal(ok("편람 수정 조각에 기존 쪽 표시(취소선·(신 설)) 없음"), true);
  assert.equal(ok("편람 수정 경영관리 구성요소가 옛 편람 자리와 맞음"), false, "가상 표는 구성요소가 1개뿐이라 모자람으로 잡힘");
  assert.equal(ok("편람 수정 조각 수"), false);
});

test("가상 표: 주요사업은 사업 지표 구성 조각(총괄요약표 「수정」 쪽 + 지표 머리) + 바뀐·새 지표 조각, 새 지표는 기존 쪽 (신 설)로 알아봄", () => {
  const { chunks } = parseHandbookRev(SAMPLE);
  const keys = chunks.filter((c) => c.business === "BZ-2").map((c) => c.chunk_key);
  assert.deepEqual(keys, ["hb26r-2611/handbook26/BZ-2", "hb26r-2611/handbook26/BZ-2/m1", "hb26r-2611/handbook26/BZ-2/m2"]);
  const [sum, m1, m2] = keys.map((k) => chunks.find((c) => c.chunk_key === k)!);
  assert.deepEqual(sum.blocks, [
    "2. 국민안전 편익서비스 강화 사업 — 합계 18",
    "(1) 가상 지표 가 — 계량 5",
    "(2) 가상 지표 나 — 계량 3",
    "(3) 성과관리의 적정성 — 비계량 10",
    "(1) 가상 지표 가 (평가방식 : 목표부여(편차), 가중치 : 5점)",
    "(2) 가상 지표 나 (가중치 : 3점)",
    "(3) 성과관리의 적정성 (평가방식 : 9등급평가, 가중치 : 10점)",
    "(4) 다른 가상 지표 (평가방식 : 목표대실적, 가중치 : 1점)",
  ]);
  assert.deepEqual([sum.meta.points, sum.meta.supersedes, sum.context_prefix], [18, ["plan-2607/handbook26/BZ-2"], "'26 편람(11.13 수정) · 주요사업2 국민안전 편익서비스 강화('25 전파기반 대국민 서비스 강화) [18점]"]);
  assert.deepEqual(m1.blocks, ["정의: 가상 정의 가", "측정 산식 및 변수: ① 가 = A / B"]);
  assert.deepEqual(m2.blocks, ["정의: 가상 정의 나", "측정 산식 및 변수: ① 나 = C / D\n② D : 가상 변수 설명"], "쪽 넘김 표의 값만 있는 칸은 앞 칸(측정 산식)에 이어 붙음");
  assert.deepEqual([m1.meta.new_metric, m2.meta.new_metric, m2.meta.weight, m2.meta.method, m2.meta.supersedes], [false, true, 3, null, ["plan-2607/handbook26/BZ-2/m1"]]);
  assert.equal(m2.context_prefix, "'26 편람(11.13 수정) · 주요사업2 국민안전 편익서비스 강화('25 전파기반 대국민 서비스 강화) · 계량지표 (2) 가상 지표 나 · 가중치 3점");
});

// ---------------------------------------------------------------------------
// 실제 파일(원본·kordoc 산출물이 이 컴퓨터에 있을 때)

const ROOT = join(import.meta.dirname, "../../..");
const PARSED = join(ROOT, "resources/knowledge/_parsed/hb26r-2611.chunks.json");
const PLAN = join(ROOT, "resources/knowledge/_chunks/plan-2607.jsonl");
const HAS = existsSync(PARSED);
const real = HAS ? parseHandbookRev(loadKordocChunks(JSON.parse(readFileSync(PARSED, "utf8")))) : { chunks: [], checks: [] };

test("실제 신구대비표: 조각 15개(경영관리 8·주요사업 7), 검산 전부 통과, 지표별 목록이 기대값과 같음", { skip: !HAS && "편람 수정 신구대비표 kordoc 산출물(resources/knowledge/_parsed/hb26r-2611 — git 밖)이 없음" }, () => {
  for (const c of real.checks) assert.ok(c.ok, `${c.name}: ${JSON.stringify(c.actual)}`);
  assert.equal(real.chunks.length, HANDBOOK_REV_EXPECTED.chunks);
  assert.deepEqual(
    real.chunks.map((c) => c.chunk_key.replace("hb26r-2611/handbook26/", "")),
    [...MG_REV_COMPONENTS.map((s) => `${s.unit}/${s.old.split("/")[1]}`), "BZ-2", "BZ-2/m1", "BZ-2/m2", "BZ-2/m3", "BZ-3", "BZ-3/m1", "BZ-3/m2"],
  );
  const byKey = (k: string) => real.chunks.find((c) => c.chunk_key === `hb26r-2611/handbook26/${k}`)!;
  // 수정본에서 바뀐 곳이 「수정」 쪽 글로 들어 있음(짧은 낱말만 대조)
  assert.match(byKey("MG-3/k1").text, /공공부문\n도급 노동자 보호지침/);
  assert.match(byKey("MG-4/k1").text, /포괄적 관리 책임/);
  assert.doesNotMatch(byKey("MG-4/k1").text, /안전법령을 위반한 경우|\*\* 공공기관이/);
  assert.match(byKey("MG-7/k2").text, /0\.75점을\n②③항으로 평가/);
  assert.match(byKey("MG-14/k1").text, /공공기관 기능개혁 추진방안 이행/);
  // 세부평가내용 번호·구분(다음 단계 항목 파서가 씀 — H3 설계 §5)
  assert.deepEqual(
    MG_REV_COMPONENTS.map((s) => [s.old, byKey(`${s.unit}/${s.old.split("/")[1]}`).meta.items]),
    [["MG-3/k1", [1, 2]], ["MG-3/k2", [1, 2, 6]], ["MG-4/k1", [1]], ["MG-4/k2", [1]], ["MG-4/k3", [1]], ["MG-6/k1", [1, 6]], ["MG-7/k2", [1, 2, 3, 4]], ["MG-14/k1", [3]]],
  );
  assert.deepEqual([byKey("MG-7/k2").meta.item_kinds, byKey("MG-7/k2").meta.item_from], [{ 1: "그대로", 2: "신설", 3: "수정", 4: "그대로" }, { 3: 2, 4: 3 }]);
  const subs = byKey("MG-14/k1").meta.sub_items as Array<{ no: number; kind: string; head: string }>;
  assert.deepEqual(subs.map((x) => [x.no, x.kind]), [[1, "그대로"], [2, "그대로"], [3, "수정"], [4, "그대로"], [5, "신설"]]);
  assert.match(subs[4].head, /기능개혁/);
  assert.ok(real.chunks.filter((c) => c.track === "주요사업").every((c) => c.meta.items === undefined), "주요사업 조각은 해당 없음");
  assert.deepEqual([byKey("BZ-2").meta.points, byKey("BZ-3").meta.points], [18, 16]);
  assert.deepEqual(["BZ-2/m1", "BZ-2/m2", "BZ-2/m3", "BZ-3/m1", "BZ-3/m2"].map((k) => [byKey(k).meta.weight, byKey(k).meta.new_metric]), [[4, false], [2, true], [2, true], [3, false], [2, true]]);
  assert.doesNotMatch(byKey("BZ-3/m1").text, /차입금리/, "폐지된 운용수익 산식(기존 쪽)이 섞이지 않음");
});

const planChunks: KnowledgeChunk[] = existsSync(PLAN) ? readFileSync(PLAN, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
test("실제 조각: 수정본 조각은 대신하는 옛 편람 조각과 같은 층(작성지원·질문·코멘트 card, 경평 초안 report)에 같은 평가단위로 들어감 — 공통지표(BZ-4)가 아니라 소속 판정에 안 걸림", { skip: (!HAS || !planChunks.length) && "편람 수정본 산출물이나 관리계획 적재 결과(git 밖)가 없음" }, () => {
  const units = ["BZ-1", "BZ-2", "BZ-3", ...Array.from({ length: 14 }, (_, i) => `MG-${i + 1}`)];
  for (const c of real.chunks) {
    const olds = (c.meta.supersedes as string[]).map((k) => planChunks.find((p) => p.chunk_key === k)!);
    assert.ok(olds.every(Boolean), `${c.chunk_key}가 대신하는 옛 조각이 없음`);
    for (const old of olds) {
      assert.deepEqual([c.unit_type, c.track, c.business], [old.unit_type, old.track, old.business], c.chunk_key);
      for (const u of units) for (const p of ["card", "report"] as const) assert.equal(layerOf(c, u, p), layerOf(old, u, p), `${c.chunk_key} ${u} ${p}`);
      assert.ok(revisionNote(old), `${old.chunk_key}에 수정됨 표지가 없음`);
    }
    assert.notEqual(c.business, "BZ-4");
    assert.equal(commonKpiOwner(c), null, "공통지표 소속 판정은 BZ-4 조각만 — 수정본 조각은 소속 사업(business)으로 바로 감");
    assert.match(revisionNote(c)!, /11\.13 수정본.*이 판이 유효/);
  }
});
