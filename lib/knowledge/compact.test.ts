import assert from "node:assert/strict";
import { test } from "node:test";
import { type KnowledgeRef, knowledgeBlock } from "../ai/writer.ts";
import { duplicateMap, sharedBlock, stubPage } from "./compact.ts";

const ref = (key: string, over: Partial<KnowledgeRef> = {}): KnowledgeRef => ({ key, title: `제목 ${key}`, unitType: "plan_section", text: `글 ${key}`, ...over });
const long = (seed: string) => Array.from({ length: 12 }, (_, i) => `${seed} ${i}번 문장은 평가위원이 계량지표의 적합성과 도전성을 어떻게 보았는지 길게 설명합니다.`).join(" ");

test("그림 껍데기: 본문이 「그림 자료, 원문 PDF N쪽」 한 줄뿐인 증빙 그림 조각만 쪽 번호를 돌려줌", () => {
  const stub = ref("ev/1", { unitType: "evidence_image", text: "증빙 3-1 노사협의회 자료(발췌) (그림 자료, 원문 PDF 89쪽)" });
  assert.equal(stubPage(stub), "89");
  assert.equal(stubPage({ ...stub, unitType: "qa_pair" }), null, "다른 유형은 아님");
  assert.equal(stubPage({ ...stub, text: `${stub.text}\n설명 글이 더 있음` }), null, "글이 있으면 껍데기가 아님");
  assert.equal(stubPage({ ...stub, text: "증빙 3-1 노사협의회 자료" }), null);
});

test("중복 조각: 지적 행·요청 자료가 더 긴 평가위원 의견·질의응답 안에 80% 이상 그대로 있을 때만, 짧은 글·다른 유형·담는 조각이 더 짧으면 아님", () => {
  const body = long("지표");
  const comment = ref("eval/1", { unitType: "evaluator_comment", text: `앞 글 ${body} 뒤 글` });
  const finding = ref("find/1", { unitType: "finding_row", text: body });
  assert.deepEqual([...duplicateMap([comment, finding])], [["find/1", "eval/1"]]);
  assert.equal(duplicateMap([finding, ref("x/1", { unitType: "plan_section", text: `앞 ${body}` })]).size, 0, "담는 유형이 아님");
  assert.equal(duplicateMap([comment, ref("find/2", { unitType: "finding_row", text: "짧은 지적" })]).size, 0, "150자 미만");
  assert.equal(duplicateMap([ref("eval/2", { unitType: "evaluator_comment", text: body.slice(0, 200) }), finding]).size, 0, "담는 조각이 더 짧음");
  const req = ref("req/1", { unitType: "request_evidence", text: long("요청") });
  assert.equal(duplicateMap([req, ref("qa/1", { unitType: "qa_pair", text: `질문 ${long("요청")}` })]).get("req/1"), "qa/1");
  assert.equal(duplicateMap([comment, finding, ref("eval/9", { unitType: "evaluator_comment", text: `다른 ${body}` })]).get("find/1"), "eval/1", "먼저 나온 담는 조각을 가리킴");
});

test("덩이 글: 줄일 것이 없으면 knowledgeBlock과 똑같음(회귀)", () => {
  const refs = [ref("a", { where: "문서 · 위치1" }), ref("b", { where: "문서 · 위치2", text: "a<b & c" })];
  assert.equal(sharedBlock(refs, { tag: "A", pool: refs }), knowledgeBlock(refs));
});

test("덩이 글: 그림 껍데기와 중복 조각은 key·title과 안내만 남기고 본문·위치는 뺌, 조각 자체(refs)는 그대로", () => {
  const body = long("지표");
  const refs = [
    ref("eval/1", { unitType: "evaluator_comment", text: `앞 ${body}`, where: "평가보고서 · 의견" }),
    ref("find/1", { unitType: "finding_row", title: "'25 중간보고서 지적 · 3번", text: body, where: "중간보고서 · 지적 · 3번" }),
    ref("ev/1", { unitType: "evidence_image", title: "'25 실사 증빙 3-1", text: "증빙 3-1 (그림 자료, 원문 PDF 89쪽)", where: "긴 위치 글 · 부모 질문 문구" }),
  ];
  const snapshot = JSON.stringify(refs);
  const out = sharedBlock(refs, { tag: "A", pool: refs });
  assert.match(out, /<source key="find\/1" title="'25 중간보고서 지적 · 3번" note="본문 전체가 key=eval\/1 조각 안에 그대로 있어 생략"\/>/);
  assert.match(out, /<source key="ev\/1" title="'25 실사 증빙 3-1" note="그림 자료 — 본문 글 없음, 원문 PDF 89쪽"\/>/);
  assert.ok(!out.includes("부모 질문 문구") && !out.includes("중간보고서 · 지적"), "줄인 조각의 위치 글은 안 보냄");
  assert.ok(out.includes(body.slice(0, 40)), "담는 조각은 본문 그대로");
  assert.equal(JSON.stringify(refs), snapshot, "refs는 안 바뀜 — 인용 대조는 원래 글로");
});

test("위치 약칭: 4번 이상 되풀이되는 12자 이상 조각만 §표시로 줄이고 덩이 머리에 뜻을 한 번 적음, 같은 입력이면 같은 글", () => {
  const doc = "2025 주요사업 실사 질문·요청 답변자료('26.4.2)";
  const refs = Array.from({ length: 5 }, (_, i) => ref(`q/${i}`, { where: `${doc} · 질문 ${i} · 짧음` }));
  const out = sharedBlock(refs, { tag: "B", pool: refs });
  assert.match(out, /^<위치 약칭 — [^\n]*\n§B1 = 2025 주요사업 실사 질문·요청 답변자료\('26\.4\.2\)\n<\/위치 약칭>\n<source /);
  assert.match(out, /where="§B1 · 질문 0 · 짧음"/);
  assert.ok(!out.includes("짧음 ·") && out.split(doc).length === 2, "문서 이름은 약칭표에 한 번만");
  assert.equal(out, sharedBlock(refs, { tag: "B", pool: refs }));
  const few = refs.slice(0, 3);
  assert.ok(!sharedBlock(few, { tag: "B", pool: few }).includes("§"), "3번 이하는 약칭을 안 만듦");
  assert.match(sharedBlock(refs, { tag: "C", pool: refs }), /§C1 = /, "덩이 표지가 약칭에 들어가 덩이끼리 겹치지 않음");
});

test("위치 약칭 값의 <·&는 이스케이프", () => {
  const refs = Array.from({ length: 4 }, (_, i) => ref(`e/${i}`, { where: `R&D <공모> 사업 위치 문구 · ${i}` }));
  const out = sharedBlock(refs, { tag: "A", pool: refs });
  assert.match(out, /§A1 = R&amp;D &lt;공모&gt; 사업 위치 문구/);
});

test("판 표지(※ …)는 4번 이상 되풀이돼도 약칭표 뒤로 숨기지 않고 그 자리에 둠", () => {
  const refs = Array.from({ length: 5 }, (_, i) => ref(`n/${i}`, { where: `문서 위치 문구가 긴 앞부분 · 질문 ${i} · ※ '25 지표 — '26 편람에서 폐지` }));
  const out = sharedBlock(refs, { tag: "A", pool: refs });
  assert.ok(out.includes(`§A1 = 문서 위치 문구가 긴 앞부분`) && !out.includes("§A2"), "앞부분만 약칭");
  assert.equal(out.split("※ '25 지표 — '26 편람에서 폐지").length, 6, "판 표지는 조각마다 그 자리에(약칭표에는 없음)");
});
