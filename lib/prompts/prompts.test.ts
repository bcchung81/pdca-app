import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { z } from "zod";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { editTargets } from "../cards/patch.ts";
import { chatPrompt } from "../ai/chat.ts";
import { commentPrompt } from "../ai/comments.ts";
import { inspectSystemText, inspectionCardText, inspectionPrompt } from "../ai/inspect.ts";
import { type KnowledgeRef, knowledgeBlock, userPrompt } from "../ai/writer.ts";
import { BLOCK_KINDS, STORIES } from "../reports/blocks.ts";
import { type Composition, compositionOutSchema, planBlockCap, planPrompt } from "../reports/composition.ts";
import { FRAMEWORKS } from "../reports/frameworks.ts";
import { diagramHints } from "../reports/diagram-hints.ts";
import { storyHints, storyHintsPrompt } from "../reports/story-hints.ts";
import { HARNESS_DIR } from "../harness/files.ts";
import { OUTLINE_SKELETON, pickHeadings } from "../harness/rules.ts";
import { blockAreaMm } from "../reports/fit.ts";
import { SectionOutputSchema, moduleGuide, sectionContext, sectionPrompt } from "../reports/section.ts";
import { PROMPT_FILES, PROMPT_ROOT } from "./load.ts";
import { PROMPT_FEATURES, assistPrompts, assistPromptsMg, chatPrompts, chatPromptsMg, commentPrompts, commentPromptsMg, describePrompts, inspectPrompts, inspectPromptsMg, matchPrompts, reportBlockPrompts, reportBlockPromptsMg, reportDraftPrompts, reportDraftPromptsMg, reportOutlinePrompts, reportOutlinePromptsMg, reportUnitPromptsMg, rulesDigestPrompts } from "./sets.ts";
import { type PromptSet, fill, fillFrom, parseSections, requireSections } from "./template.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const seed = { cards: seedCards<Record<string, any>>() };
const group = (g: string) => seed.cards.filter((c) => c.group === g).map((c) => ({ id: c.id, taskNo: c.taskNo, targetBusiness: c.targetBusiness, executionTaskNo: c.executionTaskNo, executionTask: c.executionTask }));
const card = seed.cards.find((c) => c.id === "주요사업1/1-가")!;
const raw = (feature: string, f: string) => readFileSync(join(ROOT, PROMPT_ROOT, feature, `${f}.md`), "utf8");
const SETS: Record<string, () => { prompts: PromptSet }> = { "card-assist": assistPrompts, "card-chat": chatPrompts, "card-comment": commentPrompts, "card-assist-mg": assistPromptsMg, "card-chat-mg": chatPromptsMg, "card-comment-mg": commentPromptsMg, inspection: inspectPrompts, "inspection-mg": inspectPromptsMg, "report-draft": reportDraftPrompts, "report-outline": reportOutlinePrompts, "report-draft-mg": reportDraftPromptsMg, "report-outline-mg": reportOutlinePromptsMg, "report-unit-mg": reportUnitPromptsMg, "match-knowledge": matchPrompts, "describe-image": describePrompts, "rules-digest": rulesDigestPrompts };
// report-block은 답 스키마가 edit·ask·shapes 셋(단일 ZodType이 아님)이라 SETS(모델용 답 스키마 설명 대조 테스트)에는 안 넣고, 절 목록·판 해시 테스트에만 더함(PROMPTS_ONLY)
const PROMPTS_ONLY: Record<string, () => { prompts: PromptSet }> = { ...SETS, "report-block": reportBlockPrompts, "report-block-mg": reportBlockPromptsMg };
const placeholders = (s: string) => [...new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
const refs: KnowledgeRef[] = [
  { key: "k1", title: "관리계획 '25 평가보고서", unitType: "evaluator_comment", text: "원문", where: "위치" },
  { key: "p1", title: "붙임2 · 기관 — 사업(B+)", unitType: "peer_case", text: "잘한 점", meta: { org: "기관", grade: "B+" } },
];
const files = [
  { name: "a.hwp", text: "글" },
  { name: "b.pdf", text: "PDF 글" },
  { name: "c.xlsx", text: "표" },
];

test("절 풀이: 첫 표지 위 메모는 버림, 절 끝 빈 줄은 걷고 줄 끝 빈칸은 둠, CRLF, 같은 절 두 번은 오류", () => {
  const s = parseSections("메모 — AI에 안 감\n<!-- @a -->\n첫 줄\n둘째 줄  \n\n\n<!-- @b.c -->\n{{x}}\r\n", "t.md");
  assert.deepEqual(s, { a: "첫 줄\n둘째 줄  ", "b.c": "{{x}}" });
  assert.deepEqual(parseSections("글 안의 <!-- @a --> 는 표지가 아님\n<!-- @a -->\nx", "t.md"), { a: "x" }, "한 줄 전체가 표지일 때만");
  assert.throws(() => parseSections("<!-- @a -->\n1\n<!-- @a -->\n2", "t.md"), /절 「a」이 두 번/);
  assert.throws(() => requireSections({ a: "" }, ["a", "b", "c"], "t.md"), /t\.md: 절이 없습니다 — b, c/);
});

test("자리표시 채우기: 한 번에 바꿔 넣은 값은 다시 훑지 않음, 값이 없는 이름은 오류", () => {
  assert.equal(fill("{{a}}·{{b}}·{{a}}", { a: "{{b}}", b: 2 }, "t"), "{{b}}·2·{{b}}");
  assert.throws(() => fill("{{a}} {{nope}}", { a: 1 }, "t.md @x"), /t\.md @x: \{\{nope\}\}에 넣을 값이 없습니다/);
  assert.throws(() => fill("{{toString}}", {}, "t"), /\{\{toString\}\}/, "객체 기본 속성 이름도 값이 아님");
});

test("기능 폴더마다 필요한 절이 모두 있고 쓰지 않는 절은 없음, 판 해시", () => {
  for (const [feature, spec] of Object.entries(PROMPT_FEATURES)) {
    const p = PROMPTS_ONLY[feature]().prompts;
    for (const f of PROMPT_FILES) assert.deepEqual(Object.keys(parseSections(raw(feature, f), `${feature}/${f}.md`)).sort(), [...spec[f]].sort(), `${feature}/${f}.md`);
    assert.match(p.version, new RegExp(`^${feature}@[0-9a-f]{8}$`));
    assert.equal(PROMPTS_ONLY[feature]().prompts.version, p.version, "같은 파일이면 같은 판");
  }
});

test("시스템 프롬프트 자리표시는 코드가 채우는 것뿐(지침·문체 사본, 점검의 붙임2 두 벌)", () => {
  for (const f of ["card-assist", "card-chat", "card-comment", "card-assist-mg", "card-chat-mg", "card-comment-mg"]) assert.deepEqual(placeholders(SETS[f]().prompts.system.system), ["guideline", "style"], f);
  assert.deepEqual(placeholders(reportDraftPrompts().prompts.system.system), ["style", "rules"]);
  // 경영관리 지표 단위 부분 문장 채우기(R5c) — 경평 초안과 같은 report-harness 문체·규칙 자리만
  assert.deepEqual(placeholders(reportUnitPromptsMg().prompts.system.system), ["style", "rules"]);
  const ip = inspectPrompts().prompts;
  assert.deepEqual(placeholders(ip.system.system).sort(), ["guideline", "peer", "peerNotice", "preMonthNote"]);
  for (const peer of [false, true]) {
    const sys = inspectSystemText(ip, peer, "(지침 14)");
    assert.doesNotMatch(sys, /\{\{\w+\}\}/);
    assert.match(sys, peer ? /「붙임2 사례」로 줍니다/ : /붙임2\(유관기관 평가보고서 정리\)는 아직 없습니다/);
  }
});

test("요청 글: 모든 갈래를 채워도 자리표시가 남지 않음(작성지원·질문·코멘트·점검)", { skip: NO_SEED_CARDS }, () => {
  const ap = assistPrompts().prompts;
  for (const mode of ["improve", "discover", "reflect"] as const)
    for (const [note, paste] of [["요청", null], ["", "실적 글"], ["", null]] as const)
      assert.doesNotMatch(userPrompt(ap, card, knowledgeBlock(refs), { mode, note, periodLabel: "2026년 9월", attachmentText: paste, files }), /\{\{\w+\}\}/, `${mode}`);
  const cp = chatPrompts().prompts;
  const chat = chatPrompt(cp, card, knowledgeBlock(refs), { question: "질문", history: [{ role: "user", text: "앞" }, { role: "assistant", text: "답" }], periodLabel: "2026년 9월", inspection: "점검", files });
  assert.doesNotMatch(chat, /\{\{\w+\}\}/);
  assert.match(chat, /「이전 대화」\n담당자: 앞\nAI: 답\n\n「이번 질문」\n질문$/);
  const mp = commentPrompts().prompts;
  const comments = [
    { id: "c1", kind: "edit" as const, path: "plan.lines.1", paths: ["plan.lines.1", "plan.lines.2"], quote: "고른 글", text: "" },
    { id: "c2", kind: "ask" as const, path: null, paths: [], quote: "", text: "" },
  ];
  const cm = commentPrompt(mp, card, editTargets(card), knowledgeBlock(refs), { periodLabel: "2026년 9월", comments, keeps: [{ path: "plan.lines.0", quote: "유지" }] });
  assert.doesNotMatch(cm, /\{\{\w+\}\}/);
  for (const phrase of ["고른 글이 걸친 칸: plan.lines.1, plan.lines.2", "(내용 없음 — 고른 글을", 'at="카드 전체"', "요청: (내용 없음)", "- plan.lines.0 | 「유지」"]) assert.ok(cm.includes(phrase), phrase);
  const ip = inspectPrompts().prompts;
  const ctx = { period: "2026-09", today: "2026-09-26", preMonth: true, business: null, subBusinesses: [], hasPeerCases: true };
  const ins = inspectionPrompt(ip, card, refs, ctx);
  assert.doesNotMatch(ins, /\{\{\w+\}\}/);
  for (const phrase of ["사전점검(점검월 미도래)", "붙임2 사례 1행", "「붙임2 사례」"]) assert.ok(ins.includes(phrase), phrase);
});

test("모델용 답 스키마 = 구조 + schema.md 설명(모든 기능), 타입·검증용 스키마에는 지시문 없음", () => {
  const descs = (o: any, out: string[] = []): string[] => {
    if (Array.isArray(o)) o.forEach((x) => descs(x, out));
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) {
        if (k === "description" && typeof v === "string") out.push(v);
        else descs(v, out);
      }
    return out;
  };
  for (const [feature, get] of Object.entries(SETS)) {
    const { prompts, schema } = get() as { prompts: PromptSet; schema: z.ZodType };
    const used = new Set(descs(z.toJSONSchema(schema)));
    for (const [k, v] of Object.entries(prompts.schema)) assert.ok(used.has(v), `${feature} schema.md @${k}가 스키마에 붙지 않음`);
  }
  assert.equal(JSON.stringify(z.toJSONSchema(SectionOutputSchema)).includes("description"), false);
});

test("경평 초안 시스템 프롬프트(규칙 정리 ④): 「기준이 부딪힐 때(앞이 먼저)」 사다리 7항목이 순서대로 있고, report-craft(「보고서 설계」)는 더 이상 안 씀", () => {
  const sys = reportDraftPrompts().prompts.system.system;
  assert.ok(sys.includes("기준이 부딪힐 때(앞이 먼저)"));
  const ladder = ["1. 근거", "2. 판면", "3. 읽히는 문장", "4. 올해 실적", "5. 평가 논점", "6. 이 과제만의 요소", "7. 문체"];
  const idx = ladder.map((item) => sys.indexOf(item));
  for (const [i, at] of idx.entries()) assert.ok(at > 0, `「${ladder[i]}」이 시스템 프롬프트에 없음`);
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i] > idx[i - 1], `사다리 순서가 어긋남: ${ladder[i - 1]} → ${ladder[i]}`);
  assert.doesNotMatch(sys, /「보고서 설계」/, "REPORT_HARNESS(section.ts)가 report-craft를 뺐으므로 「보고서 설계」 절 표시는 더 이상 없어야 함");
});

test("경평 초안: 적응문의 이야기 틀·블록 사전 이름 = 코드 목록, 요청 글 모든 갈래·고친 문구의 없는 자리표시는 절 이름과 오류", { skip: NO_SEED_CARDS }, () => {
  const p = reportDraftPrompts().prompts;
  for (const s of STORIES.filter((x) => x !== "섞음")) assert.ok(p.system.system.includes(` ${s} — `), `이야기 틀 ${s}`);
  for (const k of BLOCK_KINDS) assert.ok(p.system.system.includes(`\n- ${k}(`), `블록 사전 ${k}`);
  const ctx = { ...sectionContext(card, group("주요사업1")), markers: [] };
  const sec = { key: "k", business: "BZ-1", taskNo: "1-1", mark: "가", title: "t", taskTitle: "과제", targetName: "전파품질 향상", page: 119, text: "’24년 연구 | ’25년 개발" };
  const lens = (["criteria", "critiques", "survey", "peers"] as const).map((group, i) => ({ group, key: `l${i}`, title: `근거 ${i}`, where: i % 2 ? "" : "위치", text: "글" }));
  const text = sectionPrompt(p, card, ctx, 2026, files, [{ section: sec, score: 0.5 }, { section: { ...sec, key: "k2", taskTitle: "", text: "평범" }, score: 0.2 }], [{ label: "1-2 가. x", story: "", signature: "a → b" }], lens);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  for (const phrase of ["앱이 붙일 마커: 없음", "같은 과제로 보임", "비슷한 과제 —", "(전년 절 짜임 — 앱이 글에서 뽑은 근사: 연도 흐름)", "[틀 없음]", "[첨부 2] b.pdf — ", "PDF 글", "[첨부 3] c.xlsx — ", "\n표"]) assert.ok(text.includes(phrase), phrase);
  const broken = { ...p, request: { ...p.request, "files.head": "「첨부」 {{nope}}" } };
  assert.throws(() => sectionPrompt(broken, card, ctx, 2026, [files[0]]), /report-draft\/request\.md @files\.head: \{\{nope\}\}/);
});

test("경평 초안 구성안(report-outline): resultShape(추진성과 모양)·block.alts 설명이 답 스키마에 붙음(표현 보강 — 2026-09-27·09-28)", () => {
  const op = reportOutlinePrompts().prompts;
  const schema = compositionOutSchema(op.schema);
  const json = z.toJSONSchema(schema) as any;
  assert.equal(json.properties.resultShape.description, op.schema.resultShape);
  assert.equal(json.properties.blocks.items.properties.alts.description, op.schema["block.alts"]);
});

test("경평 초안 구성안(report-outline): 시스템 프롬프트는 끼움을 푼 뒤 자리표시가 없고, 요청 절(task·memo·story)은 코드가 주는 값으로 채우면 자리표시가 남지 않음", { skip: NO_SEED_CARDS }, () => {
  const op = reportOutlinePrompts().prompts;
  assert.deepEqual(placeholders(op.system.system), ["skeleton"], "report-outline/system.md의 자리표시는 골격 판정(도식 Pool 사본 발췌)뿐");
  const skeleton = pickHeadings(readFileSync(join(ROOT, HARNESS_DIR, OUTLINE_SKELETON.file), "utf8"), OUTLINE_SKELETON.headings);
  const system = fillFrom(op, "system", "system", { skeleton });
  assert.doesNotMatch(system, /\{\{\w+\}\}/);
  assert.match(system, /3단-7/);
  const ctx = { ...sectionContext(card, group("주요사업1")), markers: [] };
  const task = fillFrom(op, "request", "task", { module: ctx.module, moduleGuide: moduleGuide(reportDraftPrompts().prompts, ctx.module), area: blockAreaMm(ctx.module), maxBlocks: planBlockCap(ctx.module) });
  assert.doesNotMatch(task, /\{\{\w+\}\}/);
  const memo = fillFrom(op, "request", "memo", { memo: "담당자 메모" });
  assert.doesNotMatch(memo, /\{\{\w+\}\}/);
  assert.ok(memo.includes("담당자 메모"));
  const fw = FRAMEWORKS.find((f) => f.story === "원스톱 통합형")!;
  const story = fillFrom(op, "request", "story", { story: fw.story, fit: fw.fit, blocks: fw.blocks.map((b) => (b.label ? `[${b.label}] ${b.kind}` : b.kind)).join(" → ") });
  assert.doesNotMatch(story, /\{\{\w+\}\}/);
  assert.ok(story.includes(fw.story));
  // 담당자가 「섞음」을 고르면 주 틀 + 보조 틀을 고르라는 절
  assert.doesNotMatch(fillFrom(op, "request", "story.mix"), /\{\{\w+\}\}/);
  // 틀 고르기(코드가 뽑은 후보) — 후보가 있을 때·없을 때 모두 자리표시가 남지 않음
  const text = inspectionCardText(card);
  const hints = storyHints(diagramHints(text), text, ["한계 극복·다자협업형"]);
  assert.ok(hints.length > 0);
  const withHints = storyHintsPrompt(op, hints);
  assert.doesNotMatch(withHints, /\{\{\w+\}\}/);
  assert.ok(withHints.includes(hints[0].story));
  assert.doesNotMatch(storyHintsPrompt(op, []), /\{\{\w+\}\}/);
});

test("경평 초안 집필 요청의 「승인된 구성안」(report-draft plan.*)도 planPrompt로 채우면 자리표시가 남지 않음", () => {
  const p = reportDraftPrompts().prompts;
  const composition: Composition = {
    version: 1,
    message: "메시지",
    points: ["논점"],
    story: "단계 전개형",
    storyWhy: "이유",
    alternative: "차선",
    blocks: [{ kind: "bullets", variant: "", label: "", purpose: "목적", cells: 2, materials: ["m1"], figures: [] }],
    results: "결과",
    materials: [{ id: "m1", kind: "fact", text: "재료", when: "’25년", source: "카드", quote: "인용", found: true }],
    memo: "메모",
  };
  const text = planPrompt(p, composition, 1);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
});

test("경평 초안 집필 요청의 「담당자가 고른 블록」(report-draft plan.human)을 memo로 채우면 자리표시가 안 남음", () => {
  const p = reportDraftPrompts().prompts;
  const human = fillFrom(p, "request", "plan.human", { memo: "담당자 메모" });
  assert.doesNotMatch(human, /\{\{\w+\}\}/);
  assert.ok(human.includes("담당자 메모"));
});

test("경평 초안 블록 고치기(report-block): 시스템 프롬프트는 끼움을 푼 뒤 자리표시가 없음", () => {
  const bp = reportBlockPrompts().prompts;
  assert.deepEqual(placeholders(fillFrom(bp, "system", "system", {})), [], "report-block/system.md는 끼움만 쓰고 자리표시는 없음");
});

test("경평 초안 블록 고치기(report-block): 모델용 답 스키마 = 구조 + schema.md 설명(고치기 block·reply, 질문 answer, 다른 모양으로 options·why·block·reply — 두 트랙)", () => {
  for (const get of [reportBlockPrompts, reportBlockPromptsMg]) {
    const { prompts, schema } = get();
    const editJson = z.toJSONSchema(schema.edit) as any;
    const askJson = z.toJSONSchema(schema.ask) as any;
    const shapesJson = z.toJSONSchema(schema.shapes) as any;
    assert.equal(editJson.properties.block.description, prompts.schema.block);
    assert.equal(editJson.properties.reply.description, prompts.schema.reply);
    assert.equal(askJson.properties.answer.description, prompts.schema.answer);
    assert.equal(shapesJson.properties.options.description, prompts.schema.options);
    assert.equal(shapesJson.properties.options.items.properties.why.description, prompts.schema.why);
    assert.equal(shapesJson.properties.options.items.properties.block.description, prompts.schema.block);
    assert.equal(shapesJson.properties.reply.description, prompts.schema.reply);
  }
});

test("경평 초안 추진성과 고치기(2026-10-13): 주요사업 report-block에만 result·resultAsk 절과 results·band 설명, 경영관리 report-block-mg는 절·판 그대로", () => {
  const bp = reportBlockPrompts().prompts;
  for (const k of ["result", "resultAsk"]) assert.ok(bp.request[k], `report-block/request.md @${k}`);
  for (const k of ["results", "band"]) assert.ok(bp.schema[k], `report-block/schema.md @${k}`);
  const mg = reportBlockPromptsMg();
  assert.equal(mg.prompts.request.result, undefined);
  assert.equal(mg.prompts.schema.results, undefined);
  assert.equal("result" in mg.schema, false, "경영관리 답 스키마에 추진성과 고치기 없음");
  // 경영관리 블록 고치기 프롬프트 판(추진성과 고치기를 더할 때 바뀌지 않아야 했던 값 — report-block-mg 글을 일부러 고치면 이 값도 함께 고침)
  // 2026-10-14 경영관리 근거 규칙 추가로 판 바뀜(@59b58f23 → @79786ba1)
  // 2026-10-14 보정(과잉 교정 완화)으로 판 바뀜(@79786ba1 → @3a68f193)
  // 2026-10-15 후속 5 상자 채움(공용 문체 report-draft/style.md 「판면」 — 나란한 칸 줄 수 맞춤)으로 판 바뀜(@3a68f193 → @db2b1b11)
  assert.equal(mg.prompts.version, "report-block-mg@db2b1b11");
});

test("상자 채움(2026-10-15 후속 5): 두 트랙 문체 「판면」에 나란한 칸 줄 수 맞춤(±1줄)·불릿 1~3개 + 근거 없으면 긴 칸을 줄여 맞춤 짝, 주요사업 집필 판면 예산·고치기 요청 절", () => {
  const rule = /나란한 칸\(카드·단계·연도 흐름·전후 패널·PDCA\)은 줄 수를 같게\(±1줄\) 맞춥니다[^\n]*더 쓸 사실이 없으면 긴 칸을 줄여 맞춥니다\(근거 없는 말로 채우지 않음\)/;
  for (const sys of [reportDraftPrompts().prompts.system.system, reportDraftPromptsMg().prompts.system.system]) {
    assert.match(sys, rule);
    assert.match(sys, /한 칸의 불릿은 1~3개입니다/);
    assert.doesNotMatch(sys, /칸마다 1~2개/);
  }
  const req = reportDraftPrompts().prompts.request;
  assert.doesNotMatch(req["fit.guide"], /칸 불릿은 칸마다 1~2개/);
  assert.match(req["fit.guide"], /나란한 칸[^\n]*줄 수를 같게\(±1줄\)[^\n]*불릿 1~3개[^\n]*2025 보고서\(전년 절\)의 글·수치·사례로 칸이나 배경을 채우지 않습니다[^\n]*올해 사실로 더 쓸 것이 없으면 긴 칸을 줄이거나 칸 수를 줄여 맞추고, 근거 없는 말로 채우지 않습니다\. 판면 예산은 그대로 지킵니다/);
  assert.match(req["fit.hollowHead"], /짧은 칸을 채워도 판면은 늘지 않음[^\n]*카드·첨부의 올해 사실로만 보강하고\(2025 보고서 글·수치로 채우지 않음\), 성과 칸을 비우거나 블록을 빼서 맞추지 않음/);
  assert.match(req["fit.hollowItem"], /카드·첨부의 올해 사실로 약 \{\{add\}\}자 보강[^\n]*올해 사실로 더 쓸 것이 없으면 긴 칸을 줄여 맞춤/);
  assert.match(reportDraftPromptsMg().prompts.request["volume.plan"], /칸 불릿은 칸마다 1~3개, 나란한 칸은 줄 수를 같게/);
});

test("경영관리 구성안 절 정하기(2026-10-15): 올해 한 일 없이 계획·목표만 있는 묶음은 따로 절을 세우지 않고 실적 있는 절의 「향후 계획」 줄로 — 절 수 규칙(분량 목표)은 그대로", () => {
  const sys = reportOutlinePromptsMg().prompts.system.system;
  assert.match(sys, /계획·목표만 있는 추진내용 묶음은 따로 절을 세우지 않고, 실적이 있는 절 안에서 「향후 계획」 줄로 다룹니다\. 절 수는 요청의 「분량 목표」 쪽수에 맞춥니다/);
});

test("구성안 틀 고르기 절: 여는 블록 재료가 없다는 이유로 후보를 버리지 않음(평가 라운드 Q)", () => {
  const op = reportOutlinePrompts().prompts;
  assert.match(op.request.storyHints, /여는 블록[^\n]*재료[^\n]*버리지 않/);
});

test("수치 띠 실적 규칙(2026-10-15 후속 6): 주요사업 집필 요청 「도식 고르기」에만 「올해 실적 값 2개 이상일 때만·목표·예상·전년 값·자리표시로 채우지 않음」, 경영관리 경평 판 셋은 그대로", () => {
  const rule = /핵심 수치 띠\(stats\)는 카드·첨부의 올해 실적 값이 2개 이상일 때만 쓰고, 목표·예상·전년 값·자리표시로 칸을 채우지 않습니다\(실적이 모자라면 다른 도식으로/;
  assert.match(reportDraftPrompts().prompts.request["diagram.guide"], rule);
  assert.doesNotMatch(JSON.stringify(reportDraftPromptsMg().prompts), /올해 실적 값이 2개 이상일 때만/);
  // 2026-10-17 서사 순서(S — 여는 블록·핵심 메시지는 이 과제의 가치에서, 지적은 해소 블록 하나로)로 앞 둘의 판 바뀜(@309828eb → @845bc269, @913804d5 → @b1183426)
  // 2026-10-26 공통 지식 선별 방식(실험) 절 kb.select.*를 request.md에 더해 집필 판만 바뀜(@845bc269 → @02ce64ac) — 통째로 넣기 절 글은 그대로
  assert.equal(reportDraftPromptsMg().prompts.version, "report-draft-mg@02ce64ac");
  assert.equal(reportOutlinePromptsMg().prompts.version, "report-outline-mg@b1183426");
  assert.equal(reportBlockPromptsMg().prompts.version, "report-block-mg@db2b1b11");
});

test("경영관리 서사 순서(2026-10-17 S): 구성안·집필(경영관리만)에 「여는 블록·핵심 메시지는 이 과제의 가치(왜)에서 — '25 지적은 해소 블록 하나로」, 문제·해결형·기존·개선형의 문제/기존 = 현장·제도의 문제, 주요사업 판 그대로", () => {
  const op = reportOutlinePromptsMg().prompts;
  assert.match(op.system.system, /핵심 메시지와 논점 1번은 이 과제가 낸 변화·가치\(누가 무엇을 얻었나\)로 쓰고 '25 지적 문구로 세우지 않습니다\. '25 지적 대응은 지표 단위 「Ⅰ\. 지적사항 조치실적」 표\(카드 밖 부분\)가 맡으므로/);
  assert.match(op.system.system, /절의 여는 블록은 이 과제의 가치에서 시작합니다 — 왜 하는가\(카드·첨부의 문제 정의·상위 요구·현장 문제\)를 보이고, '25 지적·평가위원 의견으로 열지 않습니다\. 외부 검증 재료가 있으면 블록 하나/);
  assert.match(op.system.system, /외부 검증\(수상·선정·인증·보도\)이 있으면 빠뜨리지 않고 재료로 뽑습니다/);
  assert.match(op.request.task, /절의 여는 블록과 핵심 메시지는 이 과제의 가치\(왜 — 문제 정의·상위 요구·현장 문제\)에서 시작합니다[^\n]*해소하는 블록 하나에서만 다룹니다\(앱이 지적 행과 가장 많이 겹치는 절에 지적개선 표지를 붙임\)/);
  assert.match(op.schema.message, /이 과제가 낸 변화·가치로 쓰고 '25 지적 문구로 세우지 않음/);
  assert.match(op.schema.points, /1번은 이 과제가 낸 변화·가치이고, '25 지적 해소는 넣더라도 1번이 아님/);
  const dp = reportDraftPromptsMg().prompts;
  assert.match(dp.system.system, /여는 블록은 이 과제를 왜 하는지\(카드·첨부의 문제 정의·상위 요구·현장 문제\)부터 쓰고 '25 지적으로 열지 않습니다/);
  assert.match(dp.request["lens.group.critiques"], /절을 지적으로 열지 않고 그 지적을 실제로 해소하는 블록 하나에서만 보입니다/);
  for (const sys of [op.system.system, dp.system.system]) {
    assert.match(sys, /③ 문제·해결형 — 현장·제도의 문제 먼저\(이용자·현장의 불편, 제도·환경의 한계 — '25 지적은 문제의 근거 중 하나일 수 있으나 지적으로 열지 않음\)/);
    assert.match(sys, /④ 기존·개선형 — As-Is → To-Be\(기존 = 현장·제도에서 드러난 한계 — '25 지적 문구가 아님\)/);
  }
  // 주요사업 경평 프롬프트·경영관리 블록 고치기에는 없음(판 그대로)
  for (const p of [reportOutlinePrompts().prompts, reportDraftPrompts().prompts, reportBlockPromptsMg().prompts]) assert.doesNotMatch(JSON.stringify(p), /지적사항 조치실적」 표/);
});
