// 경영관리 경평 초안 구성안 연기 시험(수동 실행 전용, 2026-10-09 R3c): 호스티드 DB에서 카드·공통 지식 묶음·평가 근거·전년 보고서 골격을 읽기만 하고
// 구성안 요청 크기를 보이거나(--dry, 비용 없음) callReportOutlineMg → cleanMgComposition 결과를 보여 줍니다(저장하지 않음 — 화면 시험은 과제별 초안 화면에서).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-report-mg-smoke.ts [카드 id(기본 경영관리8/8-1)] [HTML 경로] [--dry] [--draft] [--files] [--json <경로>]
//  --files: 운영 초안과 같은 조건으로 첨부를 넣음 — 이 카드의 카드 전용 자료·같은 지표·부서·연도 보고서의 추가자료 중 저장된 전체 글이 준비된(materialState ready) 것만
//    (화면 기본 선택과 같게 읽기 실패 자료는 빼고, 준비 안 된 자료는 읽거나 DB에 쓰지 않고 이름만 「건너뜀」으로 출력). 확정 연결(report_material_cards confirmed)로 숫자 근거 인정. 없으면 첨부 없음(기본)
//  --json <경로>: --draft일 때 구성안(composition)과 초안 spec·unknownNumbers·warnings를 JSON으로 저장(비교용)
//  서버(draft-prepare.ts prepareMgDraft)와 같은 입력: 분량 목표 쪽수(loadMgCardPages — 목차·쪽 배정)·닫기 관례(2025 절 글 — mgCloseRule)를 구성안·집필 요청에 넣음(2026-10-12)
//  --dry: 구성안 요청 크기 + 분량 목표·닫기 관례 줄 · PDCA 뼈대 단계별 줄 수(2026-10-30), 저장된 구성안이 있으면 집필 요청의 「승인된 구성안」 글 크기·새 줄도 보임(AI 호출 없음)
//  --draft: 구성안을 그대로 승인한 셈 치고 집필까지(callReportDraftMg → verifyMgDraft) — HTML 경로에 초안 문서를 씀(저장하지 않음, 2026-10-09)
//  --part <절 열쇠> --story <이야기 틀>: 저장된 구성안의 그 절만 그 틀로 다시 짜고(callReportOutlineMg part → replaceMgPart) 바뀐 절·그대로인 절을 보여 줌(저장하지 않음, 2026-10-10)
//  짜임 고르기·여러 안(2026-10-12 — 서버 regenerateMgPart·runOutlineAlternatives와 같은 요청 글, 저장 안 함): --part와 함께
//   --story(없어도 됨 — 없으면 AI가 그 절의 틀을 고름) --pattern <구성 패턴 id> --example <2025 절 조각 키(rpt25-mg-NN/…)> --request <요청 글>
//   --alts <story:틀,pattern:id,example:키,auto …(쉼표, 2~3개)> — 그 절을 그 짜임들로 동시에 한 번씩 · --dry면 안마다 요청 글 크기·짜임 절 글만(AI 호출 없음)
//  앱 흐름 그대로(2026-10-26 — scripts/eval/model-compare-run.ts가 경영관리 카드에 부름): --app = --files + --draft를 서버(runReportOutlineMg → approveReportOutline → writeMgDraft)와 같게
//   「구성안 만들기」(메모 없음) → 그 구성안 그대로 승인 → 집필(검증은 서버와 같은 인자 — 올해 실적 기준일 actuals.today까지), 같은 지표 다른 카드 구성안은 서버처럼 과제번호 순 12장까지.
//   HTML 경로에 초안, <HTML>.json에 spec, <HTML>.outline.json에 구성안, <HTML>.meta.json에 앱이 저장할 경고·구성안 경고·판·시간·토큰·모델·요청 글 크기(ai-report-smoke.ts --app과 같은 모양)
//  공통 지식 선별 방식 병행 비교(2026-10-26): --select-dir <폴더> — ai-report-smoke.ts와 같음(KNOWLEDGE_SELECT에 report가 있어야 켜짐, 선별되지 못하면 meta.json select.fellBack = true)
//  자료 반영 고치기(2026-10-29 — 서버 approveReportOutline에 pick·request를 준 흐름): --add-file <이 컴퓨터의 파일>(여러 번 가능) [--request <담당자 요청>]
//   = --files(저장된 첨부) + 이 파일을 kordoc으로 읽어 카드 전용 자료처럼 넣고, 저장된 구성안 그대로(구성안을 새로 만들지 않음) 다시 집필.
//   구성안 근거(composition.sources)에 없던 첨부(저장된 첨부 중 구성안 뒤 올린 것 + 이 파일)는 요청 글 「구성안 뒤 추가된 자료」, --request는 「담당자 요청」.
//   HTML 경로에 초안, <HTML>.json에 spec, <HTML>.meta.json에 경고·추가 자료·판·시간·토큰·요청 글 크기. DB에 쓰지 않고 파일도 올리지 않음. --dry면 「승인된 구성안」 끝의 두 절만 보임(AI 호출 없음)
//  분량 채움 보강(2026-10-29): --app·--add-file은 서버 writeMgDraft와 같게 집필 검증 뒤 lib/reports/mg-fill.ts runMgFill → mgFillPatch(블록마다 callReportBlock edit·경영관리, 기한은 fixDeadlineMs)를 돌림 —
//   HTML·<HTML>.json은 보강한 초안, <HTML>.meta.json fill에 보강 전후 높이·사유와 라운드별(rounds — 최대 2회) 고른 블록·사유(빈 칸·분량·반복·안 쓴 사실)·블록 몫·늘어난 mm·
//   반복 수치 제거 결과(removed·kept)·성공/실패·시간·토큰(DB에 쓰지 않음). 반복 수치 남길 자리는 구성안 성과 배정(plan)을 봄. 호출 기록이 없어 호출 한도(startAiRequest)로는 멈추지 않음.
//   --no-fill이면 보강 없이(1차 초안만 — 비교용, meta.fill.off)
//  저장 초안 보강만(2026-11-12): --fill-saved = 운영에 저장된 초안·구성안을 읽어 보강(runMgFill)만 다시 돌림(저장 안 함 — 호출 한도로 보강이 멈췄던 초안이 기다림 고침 뒤 얼마나 차는지 보기).
//   원장 보강 닫기(closed)·앱이 뺀 블록(dropped)은 저장 초안에 남지 않아 빈 목록으로 둠. HTML 경로에 초안, <HTML>.json·.meta.json(fill 전후)
//  첨부 효과 대조(2026-11-12): --replan = --add-file과 같은 흐름(저장된 구성안 그대로 다시 집필)을 추가 파일 없이 — 같은 구성안의 「첨부 없음」 기준 초안(--add-file 결과와 견줌)
//   빠진 구성안 블록(2026-10-29): 보강 맨 앞에 서버와 같게 집필이 빠뜨린 구성안 블록을 빈 모양으로 끼워 채움 — meta.fill.missing(구성안 블록 번호·라벨·모양·절·데이터 블록 여부),
//   meta.fill.revived(블록마다 받음/못 받음·늘어난 mm·까닭·시간·토큰). 구성안 지킴 셈은 서버처럼 앱이 뺀 블록(droppedShapes)을 덜어냄
import { createClient } from "@supabase/supabase-js";
import { loadCardBundle, setSelectionSource } from "../../lib/ai/context.ts";
import { selectionFromDir } from "../lib/select-dir.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { materialState, MATERIAL_COLS, type MaterialRow } from "../../lib/ai/material-text.ts";
import { fileRelation } from "../../lib/reports/material-match.ts";
import { aiProvider, callReportBlock, callReportDraftMg, callReportOutlineMg, modelLabel, outlineSystem, reportSystem } from "../../lib/ai/run.ts";
import { fixDeadlineMs } from "../../lib/ai/fix-policy.ts";
import { type FillPlan, type FillTarget, type MgFillInput, type MgFillReasons, mgAdherenceWarning, mgFillPatch, mgFillReasons, missingBlocks, runMgFill } from "../../lib/reports/mg-fill.ts";
import { isoDay } from "../../lib/format.ts";
import { sharedTexts, listText, relevantRefs } from "../../lib/knowledge/bundle.ts";
import { mgStoryHintsFor } from "../../lib/reports/story-hints-mg.ts";
import { reportBlockPromptsMg, reportDraftPromptsMg, reportOutlinePromptsMg } from "../../lib/prompts/sets.ts";
import { yearActuals } from "../../lib/reports/actuals.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { type MgDraftContext, mgCardAsOf, mgMarkers, mgMaterialsPrompt, mgPlanPrompt, mgVolumePrompt, verifyMgDraft } from "../../lib/reports/mg-draft.ts";
import { mgPdcaSkeleton } from "../../lib/reports/mg-pdca.ts";
import { PDCA_STAGES } from "../../lib/tracks/index.ts";
import { sectionDocument } from "../../lib/reports/section-html.ts";
import { addMgDataBlocks } from "../../lib/reports/mg-data-blocks.ts";
import { MG_LIMITS, type MgSibling, cleanMgComposition, defaultEvals, isMgMainStory, mgBundlePrompt, mgCloseRule, mgClosePrompt, mgCompositionIssues, mgDiagramPrompt, mgHintOptions, mgOutcomePrompt, mgOverlapIssues, mgPartLabel, mgPartRedo, mgSiblingOf, mgSiblingsPrompt, replaceMgPart } from "../../lib/reports/mg-outline.ts";
import { loadMgCardPages, loadMgNumberEvidence, loadMgPrior } from "../../lib/reports/mg-queries.ts";
import { type ReportSectionSpec, cleanLine, draftEvidence, evidenceOf, sectionHints } from "../../lib/reports/section.ts";
import { cardBundles, linkedBundles } from "../../lib/reports/mg-bundles.ts";
import { ledgerOutcomeItems } from "../../lib/reports/mg-close.ts";
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
import { readAttachment } from "../../lib/ai/attachments.ts";
import type { PlanRevise } from "../../lib/reports/draft-sources.ts";
import { basename } from "node:path";

// 값을 받는 옵션(--part·--story)의 값은 위치 인자에서 뺌
const flagValue = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
// --add-file은 여러 번 줄 수 있어 모든 자리의 값을 뺌
const valued = new Set([...["--part", "--story", "--json", "--pattern", "--example", "--request", "--alts", "--select-dir"].flatMap((f) => (process.argv.includes(f) ? [process.argv.indexOf(f) + 1] : [])), ...process.argv.flatMap((a, i) => (a === "--add-file" ? [i + 1] : []))]);
const addPaths = process.argv.flatMap((a, i) => (a === "--add-file" && process.argv[i + 1] ? [process.argv[i + 1]] : []));
const args = process.argv.slice(2).filter((a, i) => !a.startsWith("--") && !valued.has(i + 2));
const dry = process.argv.includes("--dry");
// 앱 흐름 그대로(--app): 서버와 같은 첨부(--files)로 구성안 → 그대로 승인 → 집필(--draft)
const app = process.argv.includes("--app");
const withFiles = app || addPaths.length > 0 || process.argv.includes("--files");
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
// 읽기 실패한 저장본 — 서버 prepareDraft의 skipped와 같은 표기(초안 경고 「첨부: AI가 읽지 못해 빼고 썼습니다」)
const skipped: string[] = [];
if (withFiles) {
  const { data: cardMats } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id).order("created_at");
  const { data: rep } = await db.from("reports").select("id").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", year).maybeSingle();
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
// --add-file: 이 컴퓨터의 파일을 앱이 올릴 때와 같은 읽기(kordoc — 이미지·스캔 PDF는 그림 설명)로 카드 전용 자료처럼 넣음(DB·버킷에 안 씀)
for (const path of addPaths) {
  const doc = await readAttachment(new Uint8Array(readFileSync(path)), basename(path), "card");
  files.push({ id: `local:${doc.name}`, kind: "card", name: doc.name, text: doc.text, relation: "card", numberEvidence: true });
  console.log(`추가 자료 「${doc.name}」 ${doc.text.length}자(이 컴퓨터 파일 — 카드 전용 자료처럼)`);
}
const [prior, lens, kb, pages] = await Promise.all([loadMgPrior(db, card.eval_unit_id), loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }), loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "report"), loadMgCardPages(db, card, year)]);
const taskNo = String(card.data?.taskNo ?? "");
const ctx: MgDraftContext = { unit: card.eval_unit_id, indicator: indicator.name, taskNo, markers: mgMarkers(card.data), prior, evals: defaultEvals(taskNo, prior), pages, cardAsOf: mgCardAsOf(card) };
const actuals = yearActuals(card.data, isoDay(), { wide: true });
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
// 서버 callReportOutlineMg와 같은 순서: 분량 목표 · 닫기 관례 · 절 성과 재료 · 수치 묶음 재료(2026-10-29 — 연결 조각 표도 서버와 같은 kb의 relevantRefs)
const outcomes = ledgerOutcomeItems(card.data, cleanLine, Infinity);
const volumeClose = [mgVolumePrompt(outline, ctx.pages), mgClosePrompt(outline, prior, indicator.name), mgOutcomePrompt(outline, outcomes), mgBundlePrompt(outline, [...cardBundles(card.data, actuals), ...linkedBundles(relevantRefs(kb))])].filter(Boolean).join("\n\n");
const storyHints = mgStoryHintsFor(outline, { card: card.data, ctx, files, siblings });
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
// 분량 채움 보강(서버 writeMgDraft와 같은 runMgFill → mgFillPatch, 저장 안 함 — 2026-10-29). --no-fill이면 보강 없이 1차 초안 그대로(비교용)
const noFill = process.argv.includes("--no-fill");
// 함수 안에서는 위의 카드 null 확인이 이어지지 않아 값을 따로 둠
const cardData = card.data;
async function fillStep(v: ReturnType<typeof verifyMgDraft>, warnings: string[], t0: number, firstMs: number, plan: FillPlan) {
  const input: MgFillInput = { card: cardData, known: [ev.known, numbers].join("\n"), quoteOnly: ev.quoteOnly, year, today: actuals.today, closed: v.closed, plan, dropped: v.droppedShapes, refs: relevantRefs(kb) };
  // 빠진 구성안 블록(서버와 같은 missingBlocks — 앱이 뺀 블록·원장 보강한 추진성과 제외, 데이터 블록 먼저)
  const missing = missingBlocks(v.spec, plan, v.droppedShapes, v.closed).map((m) => ({ plan: m.plan + 1, label: m.label, shape: m.shape, part: m.at, data: m.data }));
  const brief = (r: MgFillReasons) => ({ short: r.short, hollow: r.hollow.map((h) => h.index + 1), facts: r.facts, refFacts: r.refFacts.length, repeats: r.repeats.map((x) => ({ figure: x.figure, keep: x.keep + 1, others: x.others.map((i) => i + 1) })), sentences: r.sentences.map((x) => ({ block: x.index + 1, keep: x.keep < 0 ? "상자" : x.keep + 1, text: x.text })) });
  const reasons = mgFillReasons(v.spec, cardData, plan, input.refs);
  const first = { spec: v.spec, warnings, unknownNumbers: v.unknownNumbers };
  if (noFill) return { ...first, meta: { off: true, before: reasons.height, target: reasons.target, reasons: brief(reasons), missing } };
  const t = Date.now();
  const prompts = reportBlockPromptsMg().prompts;
  const run = await runMgFill(v.spec, input, {
    prompts,
    t0,
    firstMs,
    deadlineMs: fixDeadlineMs(),
    call: async (prompt) => {
      const c = await callReportBlock({ kind: "edit", prompt, kb, mg: true });
      return { ok: true, output: c.output, usage: c.usage, model: modelLabel(c) };
    },
  });
  const ms = Date.now() - t;
  if (!run) return { ...first, meta: { off: false, before: reasons.height, after: reasons.height, target: reasons.target, reasons: brief(reasons), missing, revived: [], rounds: [], ms, usage: null, promptVersion: prompts.version } };
  const patch = mgFillPatch(first, run, input);
  // 라운드 블록 번호는 빠진 블록을 되살린 뒤의 초안 번호(라운드는 블록을 끼우거나 빼지 않아 보강을 마친 초안과 같음)
  const label = (i: number) => run.spec.blocks?.[i]?.label || "전폭";
  // 라운드별 블록·사유(빈 칸·분량·반복·안 쓴 사실)·늘어난 mm·반복 제거 결과·시간
  const why = (x: FillTarget) => [x.boxes.length ? "빈 칸" : "", x.part ? "분량" : "", x.repeats.length ? "반복" : "", x.sentences.length ? "반복 문장" : "", x.facts.length ? "안 쓴 사실" : "", x.refFacts.length ? "연결 근거 사실" : ""].filter(Boolean);
  const meta = {
    off: false,
    before: run.before,
    after: run.after,
    target: run.reasons.target,
    reasons: brief(run.reasons),
    missing,
    // 빠진 블록 되살리기 결과(block = 받았으면 보강을 마친 초안의 번호, 못 받았으면 끼우려던 자리 — 0이면 자리 없음)
    revived: run.revived.map((x) => ({ plan: (x.plan ?? -1) + 1, block: x.index + 1, label: x.label || "전폭", ok: x.ok, mm: x.mm ?? null, reason: x.reason ?? null, ms: x.ms ?? null, usage: x.usage ?? null })),
    rounds: run.rounds.map((r) => ({
      round: r.round,
      cleanup: r.cleanup ?? false,
      before: r.before,
      after: r.after,
      ms: r.ms,
      reasons: brief(r.reasons),
      targets: r.targets.map((x) => ({ block: x.index + 1, label: label(x.index), why: x.why, reasons: why(x), share: x.share, part: x.part ?? null, facts: x.facts, refFacts: x.refFacts.map((y) => `${y.text} ← ${y.from}`), repeats: x.repeats.map((y) => `${y.figure} → ${y.at}`), sentences: x.sentences.map((y) => `${y.text} → ${y.at}`) })),
      results: r.results.map((x) => ({ block: x.index + 1, label: label(x.index), ok: x.ok, share: x.share, mm: x.mm ?? null, repeats: x.repeats ?? null, sentences: x.sentences ?? null, reason: x.reason ?? null, ms: x.ms ?? null, usage: x.usage ?? null })),
      skipped: r.skipped ? { ...r.skipped, blocks: r.skipped.blocks.map((i) => i + 1) } : null,
    })),
    ms,
    usage: run.usage,
    promptVersion: prompts.version,
  };
  const tally = [...(run.revived.length ? [`빠진 블록 ${run.revived.filter((x) => x.ok).length}/${run.revived.length}개 되살림`] : []), ...meta.rounds.map((r) => `${r.cleanup ? "반복 정리" : `${r.round}회차`} ${r.before} → ${r.after}mm·블록 ${r.results.filter((x) => x.ok).length}/${r.targets.length}개·${Math.round(r.ms / 1000)}초`)].join(" / ");
  console.log(`분량 보강 — ${run.before} → ${run.after}${run.reasons.target ? `/${run.reasons.target}` : ""}mm · ${tally} · 합 ${Math.round(ms / 1000)}초`);
  return { ...patch, meta };
}
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
    console.log(`--- 절 성과 재료(이 절만 다시 짜기) ---\n${mgOutcomePrompt(outline, redos[0]?.redo.outcomes ?? outcomes) || "(없음)"}`);
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
        // 다시 짠 절에 데이터 블록 넣기(서버 mgPartMerge와 같음)
        const merged = replaceMgPart(saved, cleaned.composition, partKey, { story, frame: outlineFrameOf(f, memo) });
        const data = merged.changed ? addMgDataBlocks(merged.composition, ctx.pages, partKey) : { composition: merged.composition, notes: [] };
        const r = { ...merged, composition: data.composition };
        const blocks = r.composition.blocks.filter((b) => b.at === partKey);
        const part = r.composition.mg!.parts.find((p) => p.key === partKey)!;
        return { ok: r.changed, label: frameLabel(f), model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage: call.usage, part: `${mgPartLabel(part)} [${part.story || "—"}${part.subStory ? ` + ${part.subStory}` : ""}]`, axis: saved.mg?.axis ?? null, chip: part.chip ?? null, blocks: blocks.map((b) => `${b.label || "전폭"}:${b.kind}${b.variant ? `:${b.variant}` : ""}${b.layout ? `@${b.layout}` : ""}`), why: part.why, notes: r.notes, warnings: [...cleaned.warnings, ...data.notes, ...mgCompositionIssues(r.composition, mgPdcaSkeleton(card.data))], sig: r.changed ? altSignature(blocks, part.story, part.subStory ?? "") : null };
      } catch (e) {
        return { ok: false, label: frameLabel(f), error: String(e), sig: null };
      }
    }),
  );
  const same = markDuplicateAlts(res.map((r) => r.sig));
  console.log(JSON.stringify({ sec: Math.round((Date.now() - t) / 1000), alts: res.map((r, i) => ({ no: i + 1, ...r, sig: undefined, same: same[i] === null ? null : same[i]! + 1 })) }, null, 1));
  process.exit(0);
}
if (process.argv.includes("--fill-saved")) {
  const { data: row } = await db.from("card_report_drafts").select("outline, spec, warnings, unknown_numbers").eq("card_id", card.id).eq("year", year).maybeSingle();
  const plan = readComposition(row?.outline);
  const saved = row?.spec as ReportSectionSpec | null | undefined;
  if (!plan?.mg || !saved?.mg) throw new Error("저장된 경영관리 초안·구성안이 없음");
  const out = args[1] ?? `/tmp/mg-fill-${id.replace(/\//g, "_")}.html`;
  const v = { spec: saved, closed: [] as string[], droppedShapes: [] as Array<{ kind: string; variant: string }>, unknownNumbers: (row?.unknown_numbers ?? []) as string[], warnings: [] as string[] };
  const t1 = Date.now();
  const fin = await fillStep(v as unknown as ReturnType<typeof verifyMgDraft>, (row?.warnings ?? []) as string[], t1, 60_000, plan);
  writeFileSync(out, sectionDocument(fin.spec, fin.unknownNumbers, { year, generatedAt: new Date().toISOString(), model: "saved+fill" }));
  writeFileSync(`${out}.json`, JSON.stringify(fin.spec, null, 1));
  writeFileSync(`${out}.meta.json`, JSON.stringify({ warnings: fin.warnings, unknownNumbers: fin.unknownNumbers, fill: fin.meta, provider: aiProvider() }, null, 1));
  console.log(JSON.stringify({ fill: { before: fin.meta.before, after: "after" in fin.meta ? fin.meta.after : null, target: fin.meta.target }, warnings: fin.warnings.filter((w) => /분량/.test(w)), html: out }, null, 1));
  process.exit(0);
}
if (addPaths.length || process.argv.includes("--replan")) {
  // 자료 반영 고치기(--replan이면 추가 파일 없이 — 첨부 없음 기준): 저장된 구성안 그대로 + 구성안 뒤 추가된 자료·담당자 요청(서버 approveReportOutline → writeMgDraft revise)
  const { data: row } = await db.from("card_report_drafts").select("outline").eq("card_id", card.id).eq("year", year).maybeSingle();
  const plan = readComposition(row?.outline);
  if (!plan?.mg) throw new Error("저장된 경영관리 구성안이 없음 — 앱에서 구성안을 만든 뒤 시험해 주세요");
  const had = new Set([...(plan.sources?.card ?? []).map((x) => `card:${x}`), ...(plan.sources?.report ?? []).map((x) => `report:${x}`)]);
  const revise: PlanRevise = { added: files.filter((f) => !had.has(`${f.kind}:${f.id}`)).map((f) => f.name), request: (flagValue("--request") ?? "").trim().slice(0, 500) };
  const evals = [...new Set(plan.mg.parts.map((p) => p.evalNo))];
  const draftAsk = `${mgMaterialsPrompt(draft, card.data, ctx, year, evals.length ? evals : ctx.evals, files.map((f) => ({ name: f.name, text: f.text })), lens, actuals)}\n\n${mgPlanPrompt(draft, plan, ctx, revise)}`;
  console.log(`자료 반영 고치기 — 구성안 절 ${plan.mg.parts.length}개·블록 ${plan.blocks.length}개 · 구성안 뒤 추가된 자료 ${revise.added.length}건(${revise.added.join(" · ") || "없음"}) · 담당자 요청 ${revise.request ? `${revise.request.length}자` : "없음"} · 집필 요청 글 ${draftAsk.length}자 · ${draft.version}`);
  if (dry) {
    const plain = mgPlanPrompt(draft, plan, ctx);
    console.log(`--- 「승인된 구성안」 끝에 붙는 글 ---\n${mgPlanPrompt(draft, plan, ctx, revise).slice(plain.length).trim() || "(없음 — 추가 자료·요청이 없음)"}`);
    process.exit(0);
  }
  const t1 = Date.now();
  const dcall = await callReportDraftMg({ card: card.data, ctx, year, files, lens, actuals, kb, plan, revise });
  const draftMs = Date.now() - t1;
  // 서버 writeMgDraft와 같은 검증 인자(숫자 근거 = 카드·첨부(추가 자료 포함)·실사 답변 + 그 지표 2025 보고서·핵심공통항목)
  const v = verifyMgDraft(dcall.output, card.data, plan, ctx, [ev.known, numbers].join("\n"), ev.quoteOnly, year, actuals.today);
  const out = args[1] ?? `/tmp/mg-revise-${id.replace(/\//g, "_")}.html`;
  // 서버 writeMgDraft와 같은 셈(앱이 뺀 블록 droppedShapes를 덜어냄)·같은 글
  const adherence = planAdherence(plan, v.spec.blocks ?? [], v.droppedShapes);
  const draftWarnings = [...v.warnings, ...(skipped.length ? [`첨부: AI가 읽지 못해 빼고 썼습니다 — ${skipped.join(", ")}`] : [])];
  const planWarning = mgAdherenceWarning(adherence);
  if (planWarning) draftWarnings.push(planWarning);
  // 서버와 같게 1차 초안 뒤 분량 채움 보강(저장 안 함 — 파일은 보강한 초안)
  const fin = await fillStep(v, draftWarnings, t1, draftMs, plan);
  writeFileSync(out, sectionDocument(fin.spec, fin.unknownNumbers, { year, generatedAt: new Date().toISOString(), model: modelLabel(dcall) }));
  writeFileSync(`${out}.json`, JSON.stringify(fin.spec, null, 1));
  const meta = {
    revise,
    files: files.map((f) => ({ kind: f.kind, name: f.name, chars: f.text.length, relation: f.relation, local: f.id.startsWith("local:") })),
    warnings: fin.warnings,
    unknownNumbers: fin.unknownNumbers,
    adherence,
    promptVersion: dcall.promptVersion,
    fill: fin.meta,
    timings: { draftMs, fillMs: fin.meta.off ? null : fin.meta.ms },
    usage: { draft: dcall.usage, fill: fin.meta.off ? null : fin.meta.usage },
    request: { draft: requestSize(reportSystem(draft), draftAsk) },
    model: modelLabel(dcall),
    provider: aiProvider(),
  };
  writeFileSync(`${out}.meta.json`, JSON.stringify(meta, null, 1));
  console.log(JSON.stringify({ draftSec: Math.round(draftMs / 1000), usage: dcall.usage, added: revise.added, kinds: (fin.spec.blocks ?? []).map((b, i) => `${fin.spec.mg?.at[i]} ${b.label || "전폭"}:${b.kind}`), adherence: `${adherence.matched}/${adherence.total}`, unknownNumbers: fin.unknownNumbers, warnings: fin.warnings, html: out }, null, 1));
  process.exit(0);
}
if (dry) {
  console.log(`--- 구성안 요청: 분량 목표·닫기 관례·절 성과 재료 ---\n${volumeClose}`);
  // PDCA 뼈대(2026-10-30 — 카드 글 바로 뒤, 구성안·집필 공용): 단계별 줄 수와 라벨(카드 칸 머리)만 — 줄 글은 요청에 있음
  const sk = mgPdcaSkeleton(card.data);
  console.log(`--- PDCA 뼈대: 요청에 ${request.includes("「PDCA 뼈대」") ? "있음" : "없음"} · ${PDCA_STAGES.map((s) => `${s} ${sk[s].length}줄`).join(" · ")} · 라벨 ${[...new Set(PDCA_STAGES.flatMap((s) => sk[s].map((x) => x.label.replace(/ · .*$/, ""))))].join(" / ") || "—"}`);
  // 저장된 구성안이 있으면 집필 요청의 「승인된 구성안」 글(닫기 관례·분량 목표·블록 글 한도)도 — AI 호출 없음
  const { data: row } = await db.from("card_report_drafts").select("outline, spec").eq("card_id", card.id).eq("year", year).maybeSingle();
  const saved = readComposition(row?.outline);
  if (saved?.mg) {
    const planText = mgPlanPrompt(draft, saved, ctx);
    console.log(`--- 집필 요청: 승인된 구성안 글 ${planText.length}자(절 ${saved.mg.parts.length}개·블록 ${saved.blocks.length}개) — 새 줄만 ---`);
    console.log(planText.split("\n").filter((l) => /닫기 관례|분량 목표|블록 영역|글 한도|둔 이유|값 어긋남/.test(l)).slice(0, 12).join("\n"));
  } else console.log("저장된 구성안 없음 — 집필 요청 글은 보이지 않음");
  // 저장된 초안이 있으면 분량 채움 보강의 사유·재료(2026-10-29 저녁 — 연결 근거 사실 수·빠진 블록, AI 호출 없음)
  const savedSpec = row?.spec as ReportSectionSpec | null | undefined;
  if (savedSpec?.mg) {
    const r = mgFillReasons(savedSpec, card.data, saved ?? undefined, relevantRefs(kb));
    console.log(`--- 분량 채움 보강(저장된 초안 기준): 어림 ${r.height}/${r.target ?? "배정 없음"}mm · 안 쓴 원장 사실 ${r.facts.length}개 · 연결 근거 사실 ${r.refFacts.length}개 · 반복 수치 ${r.repeats.length}개 · 반복 문장 ${r.sentences.length}쌍${saved ? ` · 빠진 구성안 블록 ${missingBlocks(savedSpec, saved).length}개` : ""}`);
  }
  process.exit(0);
}
const t0 = Date.now();
const call = await callReportOutlineMg({ card: card.data, ctx, year, files, lens, actuals, kb, siblings, hints, inspection });
const outlineMs = Date.now() - t0;
const { hayKey, known } = evidenceOf(card.data, ...evidenceArgs);
const cleaned = cleanMgComposition(call.output, hayKey, known, { indicator: indicator.name, prior, outcomes: ledgerOutcomeItems(card.data, cleanLine, Infinity) });
// 데이터 블록 넣기(S2 — 서버 runReportOutlineMg와 같음)
const data = addMgDataBlocks(cleaned.composition, ctx.pages);
const composition = data.composition;
// 서버 runReportOutlineMg가 저장하는 구성안 경고와 같은 목록
const outlineWarnings = [...cleaned.warnings, ...data.notes, ...mgOverlapIssues(composition, siblings), ...mgCompositionIssues(composition, mgPdcaSkeleton(card.data))];
console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round(outlineMs / 1000), usage: call.usage, axis: composition.mg?.axis ?? null, parts: composition.mg?.parts.map((p) => `${mgPartLabel(p)} [${p.story}]${p.chip ? ` 칩 [${p.chip}]` : ""}`), blocks: composition.blocks.map((b) => `${b.at} ${b.label || "전폭"}:${b.kind}${b.variant ? `:${b.variant}` : ""}`), materials: composition.materials.length, warnings: outlineWarnings }, null, 1));
// 구성안만 돌릴 때도 구성안 JSON을 남김(2026-11-10 T1 — 모양 비교용, 저장 안 함)
if (!withDraft && args[1]) writeFileSync(`${args[1]}.outline.json`, JSON.stringify(composition, null, 1));
if (withDraft) {
  // 집필(서버 writeMgDraft와 같은 숫자 근거: 카드·첨부·실사 답변 + 그 지표 2025 보고서 전 장·핵심공통항목)
  const t1 = Date.now();
  const plan = { ...composition, memo: "", module: 1, head: "all" as const };
  const dcall = await callReportDraftMg({ card: card.data, ctx, year, files, lens, actuals, kb, plan });
  const draftMs = Date.now() - t1;
  // --app은 서버 writeMgDraft와 같은 검증 인자(올해 실적 기준일 actuals.today까지)
  const v = verifyMgDraft(dcall.output, card.data, plan, ctx, [ev.known, numbers].join("\n"), ev.quoteOnly, year, app ? actuals.today : undefined);
  const out = args[1] ?? `/tmp/mg-draft-${id.replace(/\//g, "_")}.html`;
  // 앱이 저장할 경고 — 서버 writeMgDraft와 같은 순서·문구(검증 경고 + 첨부 읽기 실패 + 구성안 지킴), --app은 그 뒤 분량 채움 보강까지(서버와 같음 — 저장 안 함)
  // 서버 writeMgDraft와 같은 셈(앱이 뺀 블록 droppedShapes를 덜어냄)·같은 글
  const adherence = planAdherence(plan, v.spec.blocks ?? [], v.droppedShapes);
  const draftWarnings = [...v.warnings, ...(skipped.length ? [`첨부: AI가 읽지 못해 빼고 썼습니다 — ${skipped.join(", ")}`] : [])];
  const planWarning = mgAdherenceWarning(adherence);
  if (planWarning) draftWarnings.push(planWarning);
  const fin = app ? await fillStep(v, draftWarnings, t1, draftMs, plan) : { spec: v.spec, warnings: v.warnings, unknownNumbers: v.unknownNumbers, meta: null };
  writeFileSync(out, sectionDocument(fin.spec, fin.unknownNumbers, { year, generatedAt: new Date().toISOString(), model: modelLabel(dcall) }));
  const jsonOut = flagValue("--json");
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ card: id, year, files: files.map((f) => ({ kind: f.kind, name: f.name, chars: f.text.length, relation: f.relation })), composition, spec: fin.spec, unknownNumbers: fin.unknownNumbers, warnings: fin.warnings }, null, 1));
  if (app && fin.meta) {
    writeFileSync(`${out}.json`, JSON.stringify(fin.spec, null, 1));
    writeFileSync(`${out}.outline.json`, JSON.stringify(plan, null, 1));
    const evals = [...new Set((plan.mg?.parts ?? []).map((p) => p.evalNo))];
    const draftAsk = `${mgMaterialsPrompt(draft, card.data, ctx, year, evals.length ? evals : ctx.evals, files.map((f) => ({ name: f.name, text: f.text })), lens, actuals)}\n\n${mgPlanPrompt(draft, plan, ctx)}`;
    const meta = {
      warnings: fin.warnings,
      unknownNumbers: fin.unknownNumbers,
      outlineWarnings,
      story: fin.spec.story,
      promptVersion: dcall.promptVersion,
      outlineVersion: call.promptVersion,
      fill: fin.meta,
      timings: { outlineMs, draftMs, firstMs: draftMs, fixMs: null, fitPasses: 0, fixSkipped: null, fillMs: fin.meta.off ? null : fin.meta.ms },
      usage: { outline: call.usage, draft: dcall.usage, fill: fin.meta.off ? null : fin.meta.usage },
      // 요청 글 크기(글자) — 구성안 요청 글은 callReportOutlineMg와 같은 조각(자료 블록 + 도식 후보·형제·점검·전체 구성안 요청·갈래 축·틀 후보·분량·닫기)
      request: { outline: requestSize(outlineSystem(outline), [request, mgDiagramPrompt(outline, hints), mgSiblingsPrompt(outline, siblings), outlineInspectionPrompt(outline, inspection), fillFrom(outline, "request", "task", { maxParts: MG_LIMITS.parts, maxBlocks: MG_LIMITS.blocks }), splitHead, storyHints, mgVolumePrompt(outline, ctx.pages), mgClosePrompt(outline, prior, indicator.name)].filter(Boolean).join("\n\n")), draft: requestSize(reportSystem(draft), draftAsk) },
      select: selectDir ? { dir: selectDir, fellBack } : null,
      model: modelLabel(dcall),
      outlineModel: modelLabel(call),
      provider: aiProvider(),
    };
    writeFileSync(`${out}.meta.json`, JSON.stringify(meta, null, 1));
  }
  console.log(JSON.stringify({ draftSec: Math.round(draftMs / 1000), usage: dcall.usage, kinds: (fin.spec.blocks ?? []).map((b, i) => `${fin.spec.mg?.at[i]} ${b.label || "전폭"}:${b.kind}`), strategy: (fin.spec.blocks ?? []).filter((b) => b.kind === "strategy" || b.kind === "pdca").map((b) => ({ kind: b.kind, text: b.text, items: b.items, cells: b.cells.map((c) => c.head) })), unknownNumbers: fin.unknownNumbers, warnings: fin.warnings, html: out }, null, 1));
}
