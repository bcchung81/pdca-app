// 현행화(한글 파일 → 원장): 매칭·블록 비교·무손실 병합. 실제 카드 59장과 그 원본 kordoc 마크다운으로 확인합니다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { renderCard } from "../render.ts";
import { parseCardMarkdown } from "./parse.ts";
import { applySync, diffLines, htmlLines, matchCard, normTitle, planSync, titleSimilarity } from "./sync.ts";
import { HAS_SEED_CARDS, NO_SEED_CARDS } from "../../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const DIR = resolve(import.meta.dirname, "../../../seed/cards/260916");
const seed = HAS_SEED_CARDS ? JSON.parse(readFileSync(join(DIR, "biz-260916.json"), "utf8")) : { cards: [] };
const ledgerRefs = seed.cards.map((c: any) => ({ id: c.id, group: c.group, taskNo: c.taskNo, title: c.title }));
const parsed: any[] = !HAS_SEED_CARDS ? [] : [1, 2, 3].flatMap((g) => parseCardMarkdown(readFileSync(join(DIR, "kordoc", `biz${g}.md`), "utf8"), { sourceName: `biz${g}.hwp` }).cards);
const ledger = (id: string) => structuredClone(seed.cards.find((c: any) => c.id === id));
const file = (id: string) => structuredClone(parsed.find((c) => c.id === id));

test("원본 파일을 다시 읽으면 59장 모두 정확히 매칭되고 바뀐 블록이 없다(그림 경로·AX 번호 딱지는 비교에서 뺌)", { skip: NO_SEED_CARDS }, () => {
  assert.equal(parsed.length, 59);
  for (const p of parsed) {
    const m = matchCard(p, ledgerRefs);
    assert.equal(m.kind, "exact", p.id);
    assert.equal(m.cardId, p.id);
    const plan = planSync(ledger(p.id), p);
    assert.ok(plan.unchanged, `${p.id}: ${plan.blocks.filter((b) => b.status !== "same").map((b) => b.key)}`);
    assert.deepEqual(plan.risks, []);
  }
});

test("Check 글이 바뀌면 [변경]·기본 반영 대상, 반영하면 그 구역만 파일 값이 되고 나머지는 원장 그대로", { skip: NO_SEED_CARDS }, () => {
  const id = "주요사업1/1-가";
  const l = ledger(id);
  l.check.items = [...l.check.items.slice(0, 1), "∙ (원장에만 있는 줄) 지난달 점검 메모"];
  l.plan.lines = [...l.plan.lines];
  const p = file(id);
  const plan = planSync(l, p);
  const check = plan.blocks.find((b) => b.key === "check")!;
  assert.equal(check.status, "changed");
  assert.equal(check.risk, null);
  assert.ok(check.lines.some((o) => o.op === "del" && o.text.includes("원장에만 있는 줄")));
  assert.deepEqual(plan.defaults, ["check"]);
  assert.deepEqual(plan.risks, []);
  const { card, applied } = applySync(l, p, { blocks: plan.defaults, removals: [] }, { fileName: "새 파일.hwpx" });
  assert.deepEqual(applied, ["check"]);
  assert.deepEqual(card.check, p.check);
  assert.deepEqual(card.plan, l.plan);
  assert.equal(card.source.file, "새 파일.hwpx");
  assert.equal(card.id, id);
  // 반영 뒤에는 파일과 같아 다시 비교하면 바뀐 것이 없음
  assert.ok(planSync(card, p).unchanged);
  assert.ok(renderCard(card).includes("kca-card"));
});

test("고정영역(Plan·계량지표 목표) 변경은 위험 — 기본 반영에서 빠지고, 원장이 잠겨 있으면 반영하지 않음", { skip: NO_SEED_CARDS }, () => {
  const id = "주요사업1/1-가";
  const l = ledger(id);
  l.plan.lines = ["∙ 원장에서 고친 계획"];
  l.kpi.rows[0].target = "999";
  const p = file(id);
  const plan = planSync(l, p);
  const kpi = plan.blocks.find((b) => b.key === "kpi")!;
  assert.equal(plan.blocks.find((b) => b.key === "plan")!.risk, "고정영역([Plan] 조치·개선방향) 변경");
  assert.equal(kpi.risk, "고정영역(계량지표 목표) 변경");
  assert.deepEqual(plan.defaults, []);
  assert.ok(plan.risks.includes("고정영역(계량지표 목표) 변경"));
  // 건별 승인하면 반영
  assert.deepEqual(applySync(l, p, { blocks: ["plan", "kpi"], removals: [] }).card.plan, p.plan);
  // 잠긴 카드: 승인해도 옮기지 않음
  const locked = planSync(l, p, { locked: true });
  assert.ok(locked.blocks.find((b) => b.key === "plan")!.locked);
  assert.deepEqual(locked.risks, []);
  const res = applySync(l, p, { blocks: ["plan", "kpi"], removals: [] }, { locked: true });
  assert.deepEqual(res.applied, []);
  assert.deepEqual(res.card.plan, l.plan);
});

test("월별 실적: 파일에 있는 기간만 바꾸고 더함, 없는 기간은 보존(지우기는 따로 승인), 줄면 위험", { skip: NO_SEED_CARDS }, () => {
  const id = seed.cards.find((c: any) => (c.do.monthly ?? []).length >= 1).id;
  const l = ledger(id);
  const p = file(id);
  const first = p.do.monthly[0];
  l.do.monthly = [{ ...structuredClone(first), period: "12월", periodTokens: ["12월"], items: ["∙ 원장에만 있는 12월 상자"] }, ...structuredClone(p.do.monthly)];
  p.do.monthly = [...p.do.monthly, { ...structuredClone(first), period: "11월", periodTokens: ["11월"], items: ["∙ 파일에서 새로 온 11월 실적"] }];
  const plan = planSync(l, p);
  const mon = plan.blocks.find((b) => b.key === "monthly")!;
  assert.equal(mon.status, "changed");
  assert.deepEqual(mon.missing, ["12월"]);
  assert.ok(plan.risks.includes("⚠️삭제 예정 항목(기본은 보존)"));
  // 보존: 12월 상자가 남고 11월 상자가 달 순서대로 들어감
  const kept = applySync(l, p, { blocks: ["monthly"], removals: [] }).card.do.monthly.map((m: any) => m.period);
  assert.ok(kept.includes("12월") && kept.includes("11월"));
  assert.ok(kept.indexOf("11월") < kept.indexOf("12월"));
  // 지우기까지 승인하면 12월이 빠짐
  const dropped = applySync(l, p, { blocks: ["monthly"], removals: ["monthly"] }).card.do.monthly.map((m: any) => m.period);
  assert.ok(!dropped.includes("12월") && dropped.includes("11월"));
  // 파일의 상자가 원장보다 적으면 누적행 감소 위험
  const fewer = file(id);
  fewer.do.monthly = [];
  const r = planSync(ledger(id), fewer);
  assert.equal(r.blocks.find((b) => b.key === "monthly")!.status, "removed");
  assert.ok(r.risks.includes("월별 실적 누적행 감소"));
});

test("파일에 없는 구역은 [삭제 예정]으로만 보이고 승인 없이는 지우지 않음", { skip: NO_SEED_CARDS }, () => {
  const id = "주요사업1/1-가";
  const l = ledger(id);
  const p = file(id);
  p.outcome = { ...p.outcome, quantitative: [], qualitative: [] };
  const plan = planSync(l, p);
  const out = plan.blocks.find((b) => b.key === "outcome")!;
  assert.equal(out.status, "removed");
  assert.deepEqual(plan.defaults, []);
  assert.deepEqual(applySync(l, p, { blocks: ["outcome"], removals: [] }).card.outcome, l.outcome);
  assert.deepEqual(applySync(l, p, { blocks: [], removals: ["outcome"] }).card.outcome.quantitative, []);
});

test("AX 붙임: 번호 딱지는 같은 제목의 원장 붙임에서 이어 받고, 파일에 없는 붙임은 보존", { skip: NO_SEED_CARDS }, () => {
  const id = seed.cards.find((c: any) => c.axAttachments.some((a: any) => a.marker)).id;
  const l = ledger(id);
  const p = file(id);
  p.axAttachments[0].purpose = `${p.axAttachments[0].purpose ?? ""} (보완)`;
  const extra = { ...structuredClone(l.axAttachments[0]), title: "원장에만 있는 붙임" };
  l.axAttachments = [...l.axAttachments, extra];
  const plan = planSync(l, p);
  const ax = plan.blocks.find((b) => b.key === "ax")!;
  assert.equal(ax.status, "changed");
  assert.deepEqual(ax.missing, ["원장에만 있는 붙임"]);
  const card = applySync(l, p, { blocks: ["ax"], removals: [] }).card;
  assert.equal(card.axAttachments[0].marker, l.axAttachments[0].marker);
  assert.ok(card.axAttachments[0].purpose.endsWith("(보완)"));
  assert.ok(card.axAttachments.some((a: any) => a.title === "원장에만 있는 붙임"));
  assert.equal(card.axAttachment, card.axAttachments[0]);
});

test("담당 부서가 바뀌면 기본정보 블록이 위험(건별 승인)", { skip: NO_SEED_CARDS }, () => {
  const id = "주요사업1/1-가";
  const p = file(id);
  p.team = "다른팀";
  p.deptText = `${p.department}(다른팀)`;
  const plan = planSync(ledger(id), p);
  const basic = plan.blocks.find((b) => b.key === "basic")!;
  assert.equal(basic.status, "changed");
  assert.match(basic.risk ?? "", /담당 부서 변경/);
});

test("매칭: 과제명+번호 → 확정 / 번호만 다름·제목만 다름 → 불확실(후보) / 없음 → 카드 미존재", { skip: NO_SEED_CARDS }, () => {
  const c = seed.cards[5];
  assert.equal(matchCard({ taskNo: c.taskNo, title: c.title }, ledgerRefs).kind, "exact");
  const noDiff = matchCard({ taskNo: "9-하", title: c.title }, ledgerRefs);
  assert.equal(noDiff.kind, "uncertain");
  assert.equal(noDiff.cardId, c.id);
  assert.match(noDiff.reason!, /과제번호가 다름/);
  const titleDiff = matchCard({ group: c.group, taskNo: c.taskNo, title: `${c.title} 고도화` }, ledgerRefs);
  assert.equal(titleDiff.kind, "uncertain");
  assert.equal(titleDiff.cardId, c.id);
  // 묶음을 모르면 같은 번호가 사업마다 있어 비슷한 제목을 먼저, 없으면 후보만
  const amb = matchCard({ taskNo: "1-가", title: "전혀 다른 과제" }, ledgerRefs);
  assert.equal(amb.kind, "uncertain");
  assert.equal(amb.cardId, null);
  assert.ok(amb.candidates.length >= 2);
  assert.equal(matchCard({ group: "주요사업1", taskNo: "99-가", title: "없는 과제" }, ledgerRefs).kind, "none");
});

test("글 도우미: 과제명 정규화·유사도, 조각 → 줄, 줄 비교", () => {
  assert.equal(normTitle("AI 기반 · 안테나(자동) 판독"), normTitle("AI기반안테나 자동판독"));
  assert.ok(titleSimilarity("무선국 검사 AI 자동판독", "무선국 검사 AI 자동판독 확산") > 0.8);
  assert.deepEqual(htmlLines('<table><tr><td>가<br>나</td><td>다 &amp; 라</td></tr></table><p class="x">마</p><img src="a.png">'), ["가", "나 | 다 & 라", "마", "[그림]"]);
  const ops = diffLines(["a", "b", "c", "d", "e", "f"], ["a", "b", "x", "d", "e", "f"]);
  assert.deepEqual(
    ops.map((o) => `${o.op}:${o.text}`),
    ["same:…", "same:b", "del:c", "add:x", "same:d", "same:…"],
  );
});

test("줄 끝 공백만 다른 글은 같음(한글 파일을 거치면 줄 끝 공백이 사라짐) — 글이 실제로 바뀌면 [변경]", { skip: NO_SEED_CARDS }, () => {
  const id = "주요사업1/1-가";
  const l = ledger(id);
  const p = file(id);
  l.do.monthly[0].items = [...l.do.monthly[0].items.slice(0, -1), `${l.do.monthly[0].items.at(-1)} `, "∙ "];
  p.do.monthly[0].items = [...p.do.monthly[0].items.slice(0, -1), String(p.do.monthly[0].items.at(-1)).trimEnd(), "∙"];
  assert.ok(planSync(l, p).unchanged);
  p.do.monthly[0].items[0] = `${p.do.monthly[0].items[0]}(고침)`;
  assert.equal(planSync(l, p).blocks.find((b) => b.key === "monthly")!.status, "changed");
});

test("한글 수식($…$): 파일에서 수식만 빠진 블록은 [유지](원장 그대로), 다른 변경과 함께 빠지면 위험 — 반영하면 원장의 수식이 빠지므로", { skip: NO_SEED_CARDS }, () => {
  const id = "주요사업1/1-가";
  const l = ledger(id);
  const p = file(id);
  l.check.items = [...l.check.items];
  l.check.items[1] = "근무기간 $\\frac{ 1 } { 2 }$ 경과 시 평가";
  p.check.items = [...p.check.items];
  p.check.items[1] = "근무기간 경과 시 평가";
  const only = planSync(l, p).blocks.find((b) => b.key === "check")!;
  assert.equal(only.status, "same");
  assert.match(only.note ?? "", /수식/);
  p.check.items[0] = `${p.check.items[0]} (다른 변경)`;
  const both = planSync(l, p).blocks.find((b) => b.key === "check")!;
  assert.equal(both.status, "changed");
  assert.match(both.risk ?? "", /수식/);
});

test("경영관리 카드: 블록은 기본정보·전년도 환류·지적 및 개선방안·추진내용·월별 실적·계량지표·추진성과 7개(목차·전략·Act·Plan·Check·AX 없음), 묶음 「경영관리N」으로 매칭", () => {
  const mg = { id: "경영관리1/1-1", group: "경영관리1", taskNo: "1-1", title: "경영전략의 체계적 수립 및 이행", feedback: { rows: [] }, findings: { rows: [{ finding: ["지적"], plan: ["개선"] }] }, overview: { cells: [] }, do: { lines: [], monthly: [] }, kpi: { rows: [] }, outcome: { quantitative: [], qualitative: [] } };
  assert.deepEqual(planSync(mg, mg).blocks.map((b) => b.key), ["basic", "feedback", "findings", "do", "monthly", "kpi", "outcome"]);
  const refs = [{ id: mg.id, group: mg.group, taskNo: mg.taskNo, title: mg.title }, { id: "경영관리2/1-1", group: "경영관리2", taskNo: "1-1", title: "다른 과제" }];
  assert.equal(matchCard({ group: "경영관리1", taskNo: "1-1", title: mg.title }, refs).cardId, mg.id);
  assert.equal(matchCard({ group: "경영관리1", taskNo: "1-1", title: "과제명이 조금 다름" }, refs).kind, "uncertain");
  // 지적 및 개선방안을 파일에서 고치면 그 블록만 [변경] — 지침 08 고정영역이라 위험(기본 반영에서 빠지고 건별 승인)
  const file = structuredClone(mg);
  file.findings.rows[0].plan = ["개선 고침"];
  const plan = planSync(mg, file);
  assert.deepEqual(plan.blocks.filter((b) => b.status !== "same").map((b) => b.key), ["findings"]);
  assert.equal(plan.blocks.find((b) => b.key === "findings")!.risk, "고정영역(지적 및 개선방안) 변경");
  assert.deepEqual(plan.defaults, []);
  assert.deepEqual(applySync(mg, file, { blocks: ["findings"], removals: [] }).card.findings, file.findings, "건별 승인하면 반영");
  // 원장 고정 영역이 확정된 경영관리 카드: 전년도 환류·지적 및 개선방안·계량지표는 승인해도 옮기지 않음
  const lockedPlan = planSync(mg, file, { locked: true });
  assert.ok(lockedPlan.blocks.find((b) => b.key === "findings")!.locked);
  assert.match(lockedPlan.blocks.find((b) => b.key === "findings")!.note ?? "", /전년도 환류·지적 및 개선방안·계량지표/);
  assert.deepEqual(applySync(mg, file, { blocks: ["findings"], removals: [] }, { locked: true }).applied, []);
  // 파일에 지적 칸이 비어 오면 [삭제 예정] — 기본은 보존
  file.findings.rows = [];
  const removed = planSync(mg, file);
  assert.equal(removed.blocks.find((b) => b.key === "findings")!.status, "removed");
  assert.deepEqual(removed.defaults, []);
  assert.equal(applySync(mg, file, { blocks: ["findings"], removals: [] }).applied.length, 0, "삭제를 승인하지 않으면 그대로");
  assert.deepEqual(applySync(mg, file, { blocks: [], removals: ["findings"] }).card.findings.rows, [], "삭제를 승인하면 글만 비움");
});

test("경영관리 카드: 원장에서 지적·환류 행을 더하거나 빼면 그 구역이 [변경](고정영역 위험 — 건별 승인), 반영하면 파일의 행 수 그대로", () => {
  const mg = { id: "경영관리1/1-1", group: "경영관리1", taskNo: "1-1", title: "과제", feedback: { rows: [{ self: ["자체"], plan: ["개선"] }] }, findings: { rows: [{ finding: ["지적 가"], plan: ["개선 가"] }, { finding: ["지적 나"], plan: ["개선 나"] }] }, overview: { cells: [] }, do: { lines: [], monthly: [] }, kpi: { rows: [] }, outcome: { quantitative: [], qualitative: [] } };
  const more = structuredClone(mg);
  more.findings.rows.splice(1, 0, { finding: ["지적 새"], plan: ["개선 새"] });
  more.feedback.rows.push({ self: ["자체 새"], plan: [] });
  const plan = planSync(mg, more);
  assert.deepEqual(plan.blocks.filter((b) => b.status !== "same").map((b) => `${b.key}:${b.status}`), ["feedback:changed", "findings:changed"]);
  assert.ok(plan.risks.includes("고정영역(지적 및 개선방안) 변경") && plan.risks.includes("고정영역(전년도 환류) 변경"));
  assert.equal(applySync(mg, more, { blocks: ["findings"], removals: [] }).card.findings.rows.length, 3);
  // 행 하나를 뺀 파일도 [변경](삭제 예정이 아님 — 남은 행이 있음)
  const fewer = structuredClone(mg);
  fewer.findings.rows.splice(0, 1);
  assert.equal(planSync(mg, fewer).blocks.find((b) => b.key === "findings")!.status, "changed");
  assert.deepEqual(applySync(mg, fewer, { blocks: ["findings"], removals: [] }).card.findings.rows, fewer.findings.rows);
});

test("그리다 렌더러가 던지는 블록은 「비교 불가」 — 빈 글로 비교해 삭제 예정·전부 바뀜으로 잘못 보지 않고, 기본 반영·일괄 반영에서 빠짐(개선 계획 P2-4)", { skip: NO_SEED_CARDS }, () => {
  const id = "주요사업1/1-가";
  const p = file(id);
  p.do = { ...p.do, lines: 5 }; // 렌더러가 lines.forEach에서 던짐
  const plan = planSync(ledger(id), p);
  const d = plan.blocks.find((b) => b.key === "do")!;
  assert.equal(d.status, "unknown");
  assert.deepEqual([d.missing, d.lines], [[], []]);
  assert.match(d.note ?? "", /^파일 카드의 이 블록을 그리지 못해/);
  assert.ok(!plan.defaults.includes("do"), "기본 반영 아님");
  assert.ok(plan.risks.includes("비교 불가([Do] 추진내용)"), "위험이라 일괄 반영(위험 없는 과제만)에서 빠짐");
  assert.equal(plan.unchanged, false);
  assert.ok(plan.blocks.filter((b) => b.key !== "do").every((b) => b.status === "same"), "다른 블록은 그대로 비교");

  const l = ledger(id);
  l.check = { ...l.check, items: 5 };
  const fromLedger = planSync(l, file(id)).blocks.find((b) => b.key === "check")!;
  assert.equal(fromLedger.status, "unknown");
  assert.match(fromLedger.note ?? "", /^원장 카드의/);
});
