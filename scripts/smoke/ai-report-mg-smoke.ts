// 경영관리 경평 초안 구성안 연기 시험(수동 실행 전용, 2026-10-09 R3c): 호스티드 DB에서 카드·공통 지식 묶음·평가 근거·전년 보고서 골격을 읽기만 하고
// 구성안 요청 크기를 보이거나(--dry, 비용 없음) callReportOutlineMg → cleanMgComposition 결과를 보여 줍니다(저장하지 않음 — 화면 시험은 과제별 초안 화면에서).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-report-mg-smoke.ts [카드 id(기본 경영관리8/8-1)] [HTML 경로] [--dry] [--draft] [--files] [--json <경로>]
//  --files: 운영 초안과 같은 조건으로 첨부를 넣음 — 이 카드의 카드 전용 자료·같은 지표·부서·연도 보고서의 추가자료 중 저장된 전체 글이 준비된(materialState ready) 것만
//    (화면 기본 선택과 같게 읽기 실패 자료는 빼고, 준비 안 된 자료는 읽거나 DB에 쓰지 않고 이름만 「건너뜀」으로 출력). 확정 연결(report_material_cards confirmed)로 숫자 근거 인정, 보고서 inputs.kpi도 실적에 반영. 없으면 첨부 없음(기본)
//  --json <경로>: --draft일 때 구성안(composition)과 초안 spec·unknownNumbers·warnings를 JSON으로 저장(비교용)
//  서버(draft-prepare.ts prepareMgDraft)와 같은 입력: 분량 목표 쪽수(loadMgCardPages — 목차·쪽 배정)·닫기 관례(2025 절 글 — mgCloseRule)를 구성안·집필 요청에 넣음(2026-10-12)
//  --dry: 구성안 요청 크기 + 분량 목표·닫기 관례 줄, 저장된 구성안이 있으면 집필 요청의 「승인된 구성안」 글 크기·새 줄도 보임(AI 호출 없음)
//  --draft: 구성안을 그대로 승인한 셈 치고 집필까지(callReportDraftMg → verifyMgDraft) — HTML 경로에 초안 문서를 씀(저장하지 않음, 2026-10-09)
//  --part <절 열쇠> --story <이야기 틀>: 저장된 구성안의 그 절만 그 틀로 다시 짜고(callReportOutlineMg part → replaceMgPart) 바뀐 절·그대로인 절을 보여 줌(저장하지 않음, 2026-10-10)
//  짜임 고르기·여러 안(2026-10-12 — 서버 regenerateMgPart·runOutlineAlternatives와 같은 요청 글, 저장 안 함): --part와 함께
//   --story(없어도 됨 — 없으면 AI가 그 절의 틀을 고름) --pattern <구성 패턴 id> --example <2025 절 조각 키(rpt25-mg-NN/…)> --request <요청 글>
//   --alts <story:틀,pattern:id,example:키,auto …(쉼표, 2~3개)> — 그 절을 그 짜임들로 동시에 한 번씩 · --dry면 안마다 요청 글 크기·짜임 절 글만(AI 호출 없음)
//  앱 흐름 그대로(2026-10-26 — scripts/eval/model-compare-run.ts가 경영관리 카드에 부름): --app = --files + --draft를 서버(runReportOutlineMg → approveReportOutline → writeMgDraft)와 같게
//   「구성안 만들기」(메모 없음) → 그 구성안 그대로 승인 → 집필(검증은 서버와 같은 인자 — 올해 실적 기준일 actuals.today까지), 같은 지표 다른 카드 구성안은 서버처럼 과제번호 순 12장까지.
//   HTML 경로에 초안, <HTML>.json에 spec, <HTML>.outline.json에 구성안, <HTML>.meta.json에 앱이 저장할 경고·구성안 경고·판·시간·토큰·모델·요청 글 크기(ai-report-smoke.ts --app과 같은 모양)
//  공통 지식 선별 방식 병행 비교(2026-10-26): --select-dir <폴더> — ai-report-smoke.ts와 같음(KNOWLEDGE_SELECT에 report가 있어야 켜짐, 선별되지 못하면 meta.json select.fellBack = true)
import { createClient } from "@supabase/supabase-js";
import { loadCardBundle, setSelectionSource } from "../../lib/ai/context.ts";
import { selectionFromDir } from "../lib/select-dir.ts";
import { writeFileSync } from "node:fs";
import { materialState, MATERIAL_COLS, type MaterialRow } from "../../lib/ai/material-text.ts";
import { fileRelation } from "../../lib/reports/material-match.ts";
import { aiProvider, callReportDraftMg, callReportOutlineMg, modelLabel, outlineSystem, reportSystem } from "../../lib/ai/run.ts";
import { isoDay } from "../../lib/format.ts";
import { sharedTexts, listText, relevantRefs } from "../../lib/knowledge/bundle.ts";
import { mgStoryHintsFor } from "../../lib/reports/story-hints-mg.ts";
import { reportDraftPromptsMg, reportOutlinePromptsMg } from "../../lib/prompts/sets.ts";
import { yearActuals } from "../../lib/reports/actuals.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { type MgDraftContext, mgCardAsOf, mgMarkers, mgMaterialsPrompt, mgPlanPrompt, mgVolumePrompt, verifyMgDraft } from "../../lib/reports/mg-draft.ts";
import { sectionDocument } from "../../lib/reports/section-html.ts";
import { MG_LIMITS, type MgSibling, cleanMgComposition, defaultEvals, isMgMainStory, mgCloseRule, mgClosePrompt, mgCompositionIssues, mgDiagramPrompt, mgHintOptions, mgOverlapIssues, mgPartLabel, mgPartRedo, mgSiblingOf, mgSiblingsPrompt, replaceMgPart } from "../../lib/reports/mg-outline.ts";
import { loadMgCardPages, loadMgNumberEvidence, loadMgPrior } from "../../lib/reports/mg-queries.ts";
import { draftEvidence, evidenceOf, sectionHints } from "../../lib/reports/section.ts";
import { planAdherence, readComposition } from "../../lib/reports/composition.ts";
import { patternOf } from "../../lib/reports/framework-patterns.ts";
import { type FrameChoice, type FrameInput, altContext, altSignature, cleanAltChoices, cleanFrameChoice, exampleOf, frameLabel, framePrompt, markDuplicateAlts, outlineFrameOf } from "../../lib/reports/framework-pick.ts";
import { mgPartPrompt } from "../../lib/reports/mg-outline.ts";
import { outlineInspectionPrompt } from "../../lib/reports/inspection-input.ts";
import { followupBasis } from "../../lib/ai/followup.ts";
import { readResult } from "../../lib/inspections/model.ts";
import { MGMT_INDICATORS } from "../../lib/tracks/mgmt-units.ts";
import { splitHeadPrompt } from "../../lib/reports/split-axes.ts";
import { fillFrom } from "../../lib/prompts/template.ts";

// 값을 받는 옵션(--part·--story)의 값은 위치 인자에서 뺌
const flagValue = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const valued = new Set(["--part", "--story", "--json", "--pattern", "--example", "--request", "--alts", "--select-dir"].flatMap((f) => (process.argv.includes(f) ? [process.argv.indexOf(f) + 1] : [])));
const args = process.argv.slice(2).filter((a, i) => !a.startsWith("--") && !valued.has(i + 2));
const dry = process.argv.includes("--dry");
// 앱 흐름 그대로(--app): 서버와 같은 첨부(--files)로 구성안 → 그대로 승인 → 집필(--draft)
const app = process.argv.includes("--app");
const withFiles = app || process.argv.includes("--files");
const withDraft = app || process.argv.includes("--draft");
// 선별 방식 실험 출처(--select-dir) — 묶음·평가 근거를 읽기 전에 꽂음
const selectDir = flagValue("--select-dir");
if (selectDir) setSelectionSource(selectionFromDir(selectDir));
const id = args[0] || "경영관리8/8-1";
const year = 2026;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, data, team_id, edition, data_rev, updated_at").eq("id", id).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);
const indicator = MGMT_INDICATORS.find((u) => u.id === card.eval_unit_id);
if (!indicator) throw new Error(`경영관리 카드가 아님: ${card.eval_unit_id}`);
// --files: 서버(prepareDraft)와 같은 첨부 — 읽은 글이 준비된 행만, 준비 안 된 행은 이름만 출력(파싱·DB 쓰기 없음)
type SmokeFile = { id: string; kind: "card" | "report"; name: string; text: string; relation: "card" | "matched" | "same-report"; numberEvidence: boolean };
const files: SmokeFile[] = [];
let reportKpi: Record<string, string> = {};
// 읽기 실패한 저장본 — 서버 prepareDraft의 skipped와 같은 표기(초안 경고 「첨부: AI가 읽지 못해 빼고 썼습니다」)
const skipped: string[] = [];
if (withFiles) {
  const { data: cardMats } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id).order("created_at");
  const { data: rep } = await db.from("reports").select("id, inputs").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", year).maybeSingle();
  reportKpi = (rep?.inputs?.kpi ?? {}) as Record<string, string>;
  const { data: repMats } = rep ? await db.from("report_materials").select(MATERIAL_COLS).eq("report_id", rep.id).order("created_at") : { data: [] };
  const { data: links } = repMats?.length ? await db.from("report_material_cards").select("material_id").eq("card_id", card.id).eq("status", "confirmed").in("material_id", repMats.map((m: { id: string }) => m.id)) : { data: [] };
  const confirmed = new Set((links ?? []).map((l: { material_id: string }) => String(l.material_id)));
  for (const [kind, rows] of [["card", cardMats ?? []], ["report", repMats ?? []]] as const) {
    for (const r of rows as MaterialRow[]) {
      const state = materialState(r);
      if (state === "failed") skipped.push(`「${r.file_name}」(${r.parse_error ?? "읽기 실패"})`);
      if (state !== "ready") console.log(`첨부 건너뜀(${kind === "card" ? "카드 전용" : "보고서 추가자료"}) 「${r.file_name}」 — ${state === "failed" ? `읽기 실패(${r.parse_error ?? "사유 없음"})` : "읽은 글이 아직 준비되지 않음"}`);
      else files.push({ id: String(r.id), kind, name: r.file_name, text: r.parsed_text ?? "", ...fileRelation({ id: String(r.id), kind }, confirmed) });
    }
  }
  console.log(`첨부 ${files.length}건: ${files.map((f) => `[${f.kind === "card" ? "카드" : "보고서"}·${f.relation}] 「${f.name}」 ${f.text.length}자`).join(" · ") || "없음"} · 합계 ${files.reduce((n, f) => n + f.text.length, 0)}자`);
}
const [prior, lens, kb, pages] = await Promise.all([loadMgPrior(db, card.eval_unit_id), loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }), loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "report"), loadMgCardPages(db, card, year)]);
const taskNo = String(card.data?.taskNo ?? "");
const ctx: MgDraftContext = { unit: card.eval_unit_id, indicator: indicator.name, taskNo, markers: mgMarkers(card.data), prior, evals: defaultEvals(taskNo, prior), pages, cardAsOf: mgCardAsOf(card) };
const actuals = yearActuals(card.data, reportKpi, isoDay());
const numbers = await loadMgNumberEvidence(db, card.eval_unit_id);
const ev = draftEvidence(files, [], lens, actuals, relevantRefs(kb));
const draft = reportDraftPromptsMg().prompts;
const outline = reportOutlinePromptsMg().prompts;
const request = mgMaterialsPrompt(draft, card.data, ctx, year, ctx.evals, files.map((f) => ({ name: f.name, text: f.text })), lens, actuals);
// 같은 지표 다른 카드의 구성안 절(겹침 점검·요청 — 2026-10-09)과 도식 후보
const { data: sibRows } = await db.from("card_report_drafts").select("outline, cards!inner(task_no, eval_unit_id)").eq("year", year).eq("cards.eval_unit_id", card.eval_unit_id).neq("card_id", card.id).not("outline", "is", null);
// 서버 loadMgSiblings와 같게 과제번호 순 12장까지
const siblings = (sibRows ?? [])
  .map((d: { outline: unknown; cards: { task_no: string } | Array<{ task_no: string }> | null }) => mgSiblingOf(String((Array.isArray(d.cards) ? d.cards[0] : d.cards)?.task_no ?? ""), readComposition(d.outline)))
  .filter((x): x is MgSibling => Boolean(x))
  .sort((a, b) => a.taskNo.localeCompare(b.taskNo, "ko", { numeric: true }))
  .slice(0, 12);
const hints = sectionHints(card.data, [], files, lens, actuals, year, mgHintOptions(ctx));
const { data: ins } = await db.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
const inspection = followupBasis(ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null);
const volumeClose = [mgVolumePrompt(outline, ctx.pages), mgClosePrompt(outline, prior, indicator.name)].filter(Boolean).join("\n\n");
const storyHints = mgStoryHintsFor(outline, { card: card.data, ctx, files, hints, siblings });
// 갈래 축 사전(서버 callReportOutlineMg와 같은 절 — 전체 구성안만, 2026-10-13)
const splitHead = splitHeadPrompt(outline, "mg");
const extra = [mgDiagramPrompt(outline, hints), mgSiblingsPrompt(outline, siblings), outlineInspectionPrompt(outline, inspection), storyHints, volumeClose, splitHead].filter(Boolean).join("\n\n");
const shared = sharedTexts(draft, kb).join("\n").length;
// 선별 방식을 요청했는데 이 카드가 선별되지 못하면 통째로 넣기로 감(비교가 무의미 — meta에 남김)
const fellBack = Boolean(selectDir) && !kb.select;
if (selectDir) console.log(fellBack ? `경고: 선별 방식(--select-dir ${selectDir})인데 이 카드는 선별되지 못해 통째로 넣기로 감(fellBack — KNOWLEDGE_SELECT에 report가 없거나 선별 결과·규칙 문서 없음)` : `공통 지식: 선별 방식 — 고른 조각 ${kb.select!.picked.length}개 · 제목만 ${kb.select!.unpicked.length}개`);
// 요청 글 크기(reportStructured와 같은 조각: 공통 지식 덩이는 요청 앞에 따로, 요청 글 = 목록표 + 자료 블록)
const requestSize = (system: string, ask: string) => ({ systemChars: system.length, sharedChars: sharedTexts(draft, kb).map((t) => t.length), listChars: listText(draft, kb).length, promptChars: listText(draft, kb).length + 2 + ask.length });
const list = listText(draft, kb).length;
const system = outlineSystem(outline).length;
console.log(`provider ${aiProvider()} · 카드 ${id} (${indicator.name}) · 추천 평가내용 ${ctx.evals.join("·")} · 전년 절 ${prior.length}개(고른 평가내용 ${prior.filter((s) => ctx.evals.includes(s.evalNo)).length}개, 글 ${prior.filter((s) => ctx.evals.includes(s.evalNo)).reduce((n, s) => n + s.text.length, 0)}자) · 평가 근거 ${lens.length}건`);
console.log(`글자 수 — 시스템 ${system} · 공통 지식 ①~③ ${shared} · 목록표 ${list} · 요청 자료 블록 ${request.length} · 도식 후보·형제 짜임·점검·분량·닫기·갈래 축 ${extra.length}(갈래 축 사전 ${splitHead.length}) · 합계 약 ${system + shared + list + request.length + extra.length}자`);
console.log(`같은 지표 다른 카드 갈래 축: ${siblings.filter((x) => x.axis).map((x) => `${x.taskNo} 「${x.axis}」`).join(" · ") || "없음"}`);
console.log(storyHints ? `틀 후보 —\n${storyHints}` : "틀 후보 없음");
console.log(`도식 후보 ${hints.map((h) => h.kind).join("·") || "없음"} · 같은 지표 다른 카드 구성안 ${siblings.length}장(${siblings.map((s) => s.taskNo).join("·") || "—"})`);
// 근거 글: --files면 서버(runReportOutlineMg)와 같게 known = 첨부·실사·계량 입력 + 2025 보고서·핵심공통항목, 아니면 예전 시험 그대로
const evidenceArgs: [string, string] = withFiles ? [[ev.known, numbers].join("\n"), ev.quoteOnly] : [prior.map((s) => s.text).join("\n"), lens.map((x) => x.text).join("\n")];
const close = mgCloseRule(prior);
console.log(`분량 목표 ${ctx.pages ?? "없음"}쪽 · 닫기 관례 ${close.strict ? "엄격" : "기본"}(2025 절 ${close.total}개 중 「추진성과」 행 ${close.closed}개) · 구성안 요청의 분량·닫기 절 ${volumeClose.length}자`);
const partKey = flagValue("--part");
if (partKey) {
  // 절별 다시 짜기(서버 regenerateMgPart·runOutlineAlternatives와 같은 흐름 — 저장된 구성안을 읽기만). 짜임은 서버와 같은 검증
  const frameInput = async (f: FrameChoice): Promise<FrameInput> => {
    if (!f.example) return { pattern: f.pattern ? patternOf(f.pattern) : null };
    const { data: ex } = await db.from("knowledge_chunks").select("chunk_key, title, text, business, report_page_2025, meta").eq("chunk_key", f.example.key).eq("unit_type", "report_section").maybeSingle();
    if (!ex) throw new Error(`2025 예시 절 조각이 없음: ${f.example.key}`);
    return { pattern: f.pattern ? patternOf(f.pattern) : null, example: exampleOf(ex) };
  };
  const parseFrame = (spec: string): FrameChoice => {
    const [k, ...v] = spec.split(":");
    const val = v.join(":").trim();
    return k === "auto" ? { auto: true } : k === "story" ? { story: val } : k === "pattern" ? { pattern: val } : k === "example" ? { example: { key: val, title: val } } : {};
  };
  const single = cleanFrameChoice({ story: flagValue("--story"), pattern: flagValue("--pattern"), ...(flagValue("--example") ? { example: { key: flagValue("--example"), title: flagValue("--example") } } : {}) }, true);
  if (!single.ok) throw new Error(single.message);
  const altSpec = flagValue("--alts");
  const altsRaw = altSpec ? cleanAltChoices(altSpec.split(",").map(parseFrame), true) : null;
  if (altsRaw && !altsRaw.ok) throw new Error(altsRaw.message);
  const frames: FrameChoice[] = altsRaw?.ok ? altsRaw.alts : [single.frame];
  const memo = (flagValue("--request") ?? "").slice(0, 500);
  const { data: row } = await db.from("card_report_drafts").select("outline").eq("card_id", card.id).eq("year", year).maybeSingle();
  const saved = readComposition(row?.outline);
  if (!saved?.mg?.parts.some((p) => p.key === partKey)) throw new Error(`저장된 구성안에 절 ${partKey}가 없음 — 있는 절: ${saved?.mg?.parts.map((p) => p.key).join(", ") ?? "구성안 없음"}`);
  const redos = await Promise.all(
    frames.map(async (f, k) => {
      const story = isMgMainStory(f.story) ? f.story : undefined;
      return { f, story, redo: mgPartRedo(saved, partKey, story, { ...(await frameInput(f)), alt: altsRaw?.ok ? altContext(frames, k) : null })! };
    }),
  );
  if (dry) {
    // 요청 글 크기(AI 호출 없음): callReportOutlineMg part와 같은 조각 — 자료 블록·도식 후보·형제 짜임·점검·이 절만 다시 짜기(+ 고른 짜임)·닫기 관례·요청 글
    const head = [request, mgDiagramPrompt(outline, hints), mgSiblingsPrompt(outline, siblings), outlineInspectionPrompt(outline, inspection)].filter(Boolean).join("\n\n").length;
    const tail = mgClosePrompt(outline, prior, indicator.name).length + (memo ? memo.length + 80 : 0);
    for (const [k, x] of redos.entries()) {
      const partText = mgPartPrompt(outline, x.redo);
      const fp = x.redo.frame ? framePrompt(outline, x.redo.frame, true) : "";
      console.log(`--- ${altsRaw?.ok ? `${k + 1}안 ` : ""}${frameLabel(x.f) || "고른 짜임 없음(요청 글만)"} — 절 요청 ${partText.length}자(짜임 절 ${fp.length}자) · 요청 글 합계 약 ${head + partText.length + tail}자 · 전체 약 ${system + shared + list + head + partText.length + tail}자 · ${outline.version}`);
      if (fp) console.log(fp.length > 1600 ? `${fp.slice(0, 1600)}…` : fp);
    }
    process.exit(0);
  }
  const t = Date.now();
  const res = await Promise.all(
    redos.map(async ({ f, story, redo }) => {
      const t0 = Date.now();
      try {
        const call = await callReportOutlineMg({ card: card.data, ctx, year, files, lens, actuals, kb, siblings, hints, inspection, part: redo, memo });
        const { hayKey, known } = evidenceOf(card.data, ...evidenceArgs);
        // 갈래 축은 카드 것(서버 mgPartMerge와 같음) — 새 절 칩은 그 축으로 검증
        const cleaned = cleanMgComposition(call.output, hayKey, known, { indicator: indicator.name, prior, axis: saved.mg?.axis ?? "" });
        const r = replaceMgPart(saved, cleaned.composition, partKey, { story, frame: outlineFrameOf(f, memo) });
        const blocks = r.composition.blocks.filter((b) => b.at === partKey);
        const part = r.composition.mg!.parts.find((p) => p.key === partKey)!;
        return { ok: r.changed, label: frameLabel(f), model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage, part: `${mgPartLabel(part)} [${part.story || "—"}${part.subStory ? ` + ${part.subStory}` : ""}]`, axis: saved.mg?.axis ?? null, chip: part.chip ?? null, blocks: blocks.map((b) => `${b.label || "전폭"}:${b.kind}${b.variant ? `:${b.variant}` : ""}${b.layout ? `@${b.layout}` : ""}`), why: part.why, notes: r.notes, warnings: [...cleaned.warnings, ...mgCompositionIssues(r.composition)], sig: r.changed ? altSignature(blocks, part.story, part.subStory ?? "") : null };
      } catch (e) {
        return { ok: false, label: frameLabel(f), error: String(e), sig: null };
      }
    }),
  );
  const same = markDuplicateAlts(res.map((r) => r.sig));
  console.log(JSON.stringify({ sec: Math.round((Date.now() - t) / 1000), alts: res.map((r, i) => ({ no: i + 1, ...r, sig: undefined, same: same[i] === null ? null : same[i]! + 1 })) }, null, 1));
  process.exit(0);
}
if (dry) {
  console.log(`--- 구성안 요청: 분량 목표·닫기 관례 ---\n${volumeClose}`);
  // 저장된 구성안이 있으면 집필 요청의 「승인된 구성안」 글(닫기 관례·분량 목표·블록 글 한도)도 — AI 호출 없음
  const { data: row } = await db.from("card_report_drafts").select("outline").eq("card_id", card.id).eq("year", year).maybeSingle();
  const saved = readComposition(row?.outline);
  if (saved?.mg) {
    const planText = mgPlanPrompt(draft, saved, ctx);
    console.log(`--- 집필 요청: 승인된 구성안 글 ${planText.length}자(절 ${saved.mg.parts.length}개·블록 ${saved.blocks.length}개) — 새 줄만 ---`);
    console.log(planText.split("\n").filter((l) => /닫기 관례|분량 목표|블록 영역|글 한도|둔 이유|값 어긋남/.test(l)).slice(0, 12).join("\n"));
  } else console.log("저장된 구성안 없음 — 집필 요청 글은 보이지 않음");
  process.exit(0);
}
const t0 = Date.now();
const call = await callReportOutlineMg({ card: card.data, ctx, year, files, lens, actuals, kb, siblings, hints, inspection });
const outlineMs = Date.now() - t0;
const { hayKey, known } = evidenceOf(card.data, ...evidenceArgs);
const { composition, warnings } = cleanMgComposition(call.output, hayKey, known, { indicator: indicator.name, prior });
// 서버 runReportOutlineMg가 저장하는 구성안 경고와 같은 목록
const outlineWarnings = [...warnings, ...mgOverlapIssues(composition, siblings), ...mgCompositionIssues(composition)];
console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round(outlineMs / 1000), usage: call.usage, axis: composition.mg?.axis ?? null, parts: composition.mg?.parts.map((p) => `${mgPartLabel(p)} [${p.story}]${p.chip ? ` 칩 [${p.chip}]` : ""}`), blocks: composition.blocks.map((b) => `${b.at} ${b.label || "전폭"}:${b.kind}`), materials: composition.materials.length, warnings: outlineWarnings }, null, 1));
if (withDraft) {
  // 집필(서버 writeMgDraft와 같은 숫자 근거: 첨부·실사 답변·계량 실적 입력 + 그 지표 2025 보고서 전 장·핵심공통항목)
  const t1 = Date.now();
  const plan = { ...composition, memo: "", module: 1, head: "all" as const };
  const dcall = await callReportDraftMg({ card: card.data, ctx, year, files, lens, actuals, kb, plan });
  const draftMs = Date.now() - t1;
  // --app은 서버 writeMgDraft와 같은 검증 인자(올해 실적 기준일 actuals.today까지)
  const v = verifyMgDraft(dcall.output, card.data, plan, ctx, [ev.known, numbers].join("\n"), ev.quoteOnly, year, app ? actuals.today : undefined);
  const out = args[1] ?? `/tmp/mg-draft-${id.replace(/\//g, "_")}.html`;
  writeFileSync(out, sectionDocument(v.spec, v.unknownNumbers, { year, generatedAt: new Date().toISOString(), model: modelLabel(dcall) }));
  const jsonOut = flagValue("--json");
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ card: id, year, files: files.map((f) => ({ kind: f.kind, name: f.name, chars: f.text.length, relation: f.relation })), composition, spec: v.spec, unknownNumbers: v.unknownNumbers, warnings: v.warnings }, null, 1));
  if (app) {
    writeFileSync(`${out}.json`, JSON.stringify(v.spec, null, 1));
    writeFileSync(`${out}.outline.json`, JSON.stringify(plan, null, 1));
    // 앱이 저장할 경고 — 서버 writeMgDraft와 같은 순서·문구(검증 경고 + 첨부 읽기 실패 + 구성안 지킴)
    const adherence = planAdherence(plan, v.spec.blocks ?? []);
    const draftWarnings = [...v.warnings, ...(skipped.length ? [`첨부: AI가 읽지 못해 빼고 썼습니다 — ${skipped.join(", ")}`] : [])];
    if (!adherence.same) draftWarnings.push(`구성안: 승인한 짜임 ${adherence.total}블록 중 ${adherence.matched}블록만 같은 순서로 썼습니다 — 다시 만들거나 구성안을 고쳐 주세요.`);
    const evals = [...new Set((plan.mg?.parts ?? []).map((p) => p.evalNo))];
    const draftAsk = `${mgMaterialsPrompt(draft, card.data, ctx, year, evals.length ? evals : ctx.evals, files.map((f) => ({ name: f.name, text: f.text })), lens, actuals)}\n\n${mgPlanPrompt(draft, plan, ctx)}`;
    const meta = {
      warnings: draftWarnings,
      unknownNumbers: v.unknownNumbers,
      outlineWarnings,
      story: v.spec.story,
      promptVersion: dcall.promptVersion,
      outlineVersion: call.promptVersion,
      timings: { outlineMs, draftMs, firstMs: draftMs, fixMs: null, fitPasses: 0, fixSkipped: null },
      usage: { outline: call.usage, draft: dcall.usage },
      // 요청 글 크기(글자) — 구성안 요청 글은 callReportOutlineMg와 같은 조각(자료 블록 + 도식 후보·형제·점검·전체 구성안 요청·갈래 축·틀 후보·분량·닫기)
      request: { outline: requestSize(outlineSystem(outline), [request, mgDiagramPrompt(outline, hints), mgSiblingsPrompt(outline, siblings), outlineInspectionPrompt(outline, inspection), fillFrom(outline, "request", "task", { maxParts: MG_LIMITS.parts, maxBlocks: MG_LIMITS.blocks }), splitHead, storyHints, mgVolumePrompt(outline, ctx.pages), mgClosePrompt(outline, prior, indicator.name)].filter(Boolean).join("\n\n")), draft: requestSize(reportSystem(draft), draftAsk) },
      select: selectDir ? { dir: selectDir, fellBack } : null,
      model: modelLabel(dcall),
      outlineModel: modelLabel(call),
      provider: aiProvider(),
    };
    writeFileSync(`${out}.meta.json`, JSON.stringify(meta, null, 1));
  }
  console.log(JSON.stringify({ draftSec: Math.round(draftMs / 1000), usage: dcall.usage, kinds: (v.spec.blocks ?? []).map((b, i) => `${v.spec.mg?.at[i]} ${b.label || "전폭"}:${b.kind}`), strategy: (v.spec.blocks ?? []).filter((b) => b.kind === "strategy" || b.kind === "pdca").map((b) => ({ kind: b.kind, text: b.text, items: b.items, cells: b.cells.map((c) => c.head) })), unknownNumbers: v.unknownNumbers, warnings: v.warnings, html: out }, null, 1));
}
