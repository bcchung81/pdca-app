// 경평 초안 과제별 초안 연기 시험(수동 실행 전용): 호스티드 DB에서 카드 원장을 읽기만 하고 callReportSection → 검증 → HTML 파일로 씀(DB 저장 안 함).
// 실행: node --conditions=react-server --env-file=.env.local scripts/smoke/ai-report-smoke.ts [카드 id(기본 주요사업1/1-가)] [HTML 경로] [첨부 파일 경로…] [--sib <spec.json>] [--no-lens] [--no-mats]
//  첨부(2026-10-14): 위치 인자로 파일을 주지 않으면 운영(서버 prepareDraft)처럼 그 카드의 card_materials 저장본 전체 글(parsed_text)을 모두 넣음 — --no-mats면 안 넣음.
//   읽은 판이 현재 파서 판과 같은 저장본만 쓰고(안 읽었거나 판이 다르면 읽어 채우지 않고 건너뜀 — DB에 쓰지 않으려고), 건너뛴 것은 이름·이유를 찍음.
//   파일을 주면 그 파일만 카드 전용 자료처럼 넣음(DB 첨부와 합치지 않음, 저장소에 올리지 않음).
//   보고서 추가자료(report_materials)는 서버가 사람이 고른 것만 넣으므로 여기서는 넣지 않음.
//  짜임 고르기·여러 안(2026-10-12 — 서버 runReportOutline·runOutlineAlternatives와 같은 요청 글, 저장 안 함):
//   --story <이야기 틀> --pattern <구성 패턴 id(lib/reports/framework-patterns.ts)> --example <2025 절 조각 키(rpt25-biz/…)> --request <요청 글> — --outline 구성안에 넣음
//   --alts <story:틀,pattern:id,example:키,auto …(쉼표, 2~3개)> — 그 짜임들로 구성안을 동시에 한 번씩(집필 없이 안마다 요약·같은 짜임 표시)
//   --dry — 위 짜임의 구성안 요청 글 크기·짜임 절 글만(AI 호출 없음, 여러 안이면 안마다)
//  앱 흐름 그대로(2026-10-21 모델 비교 — scripts/eval/model-compare-run.ts가 부름): --app
//   「구성안 다시 만들기」(--outline과 같음) → 그 구성안 그대로 승인(판면 자동 줄이기 fitComposition 없음 — 화면에서도 사람이 누를 때만) → 집필(판면 맞추기·자동 고치기 포함, 검증은 서버 writeDraft와 같은 인자)
//   --app이면 초안 옆에 <HTML>.meta.json도 씀: 앱이 저장할 경고(card_report_drafts.warnings·unknown_numbers와 같은 목록)·구성안 경고(outline_warnings)·틀·판·시간·토큰·모델·요청 글 크기(구성안·집필 1차)
//  공통 지식 선별 방식 병행 비교(2026-10-26 — 지식공급 하이브리드 선별 계획 7단계, model-compare-run.ts 팔 sel이 부름): --select-dir <폴더>
//   그 폴더의 선별 결과(selection.json·rules/*.md — scripts/lib/select-dir.ts)를 출처로 꽂음. 선별 방식은 환경변수 KNOWLEDGE_SELECT에 report가 있어야 켜짐(자식 환경에서 줌).
//   선별되지 못해 통째로 넣기로 가면 경고를 찍고 meta.json select.fellBack = true
import { followupBasis } from "../../lib/ai/followup.ts";
import { readResult } from "../../lib/inspections/model.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readAttachment } from "../../lib/ai/attachments.ts";
import { MATERIAL_COLS, type MaterialDoc, type MaterialRow, materialState } from "../../lib/ai/material-text.ts";
import { aiProvider, callReportOutline, callReportSectionFitted, modelLabel, outlineSystem, reportOutlineAsk, reportSystem } from "../../lib/ai/run.ts";
import { listText, sharedTexts } from "../../lib/knowledge/bundle.ts";
import { reportOutlinePrompts } from "../../lib/prompts/sets.ts";
import { isStory } from "../../lib/reports/frameworks.ts";
import { patternOf } from "../../lib/reports/framework-patterns.ts";
import { type FrameChoice, type FrameInput, altContext, altSignature, cleanAltChoices, cleanFrameChoice, exampleOf, frameLabel, framePrompt, isEmptyFrame, markDuplicateAlts } from "../../lib/reports/framework-pick.ts";
import { type Composition, type SplitDraftRow, applyPlanLayout, planPrompt, blockBudgets, cleanComposition, compositionFit, compositionIssues, extraBlocks, fitComposition, outlineSiblingLayout, planAdherence, readComposition, splitSiblingsOf } from "../../lib/reports/composition.ts";
import { splitSiblingIssues } from "../../lib/reports/split-axes.ts";
import { sectionDocument } from "../../lib/reports/section-html.ts";
import { pickPrior, priorLabel, toPriorSection } from "../../lib/reports/prior.ts";
import { reportDraftPrompts } from "../../lib/prompts/sets.ts";
import { fitReport } from "../../lib/reports/fit.ts";
import { LENS_LABEL } from "../../lib/reports/lens.ts";
import { yearActuals } from "../../lib/reports/actuals.ts";
import { isoDay } from "../../lib/format.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { loadCardBundle, setSelectionSource } from "../../lib/ai/context.ts";
import { selectionFromDir } from "../lib/select-dir.ts";
import { relevantRefs } from "../../lib/knowledge/bundle.ts";
import { type SiblingCard, type SiblingLayout, draftEvidence, evidenceOf, readSection, sectionContext, sectionHints, sectionPrompt, siblingLayout, verifySection } from "../../lib/reports/section.ts";

// 위치 인자 = 옵션(--…)과 값을 받는 옵션의 값을 뺀 것: 카드 id · HTML 경로 · 첨부 파일…
const VALUED = new Set(["--sib", "--story", "--pattern", "--example", "--request", "--alts", "--select-dir"]);
const argv = process.argv.slice(2);
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const id = positional[0] || "주요사업1/1-가";
// 앱 흐름 그대로(--app): 구성안 → 그대로 승인 → 집필, 경고·시간·토큰을 <HTML>.meta.json으로
const app = argv.includes("--app");
const out = positional[1] || "report-draft.html";
// 선별 방식 실험 출처(--select-dir) — 묶음·평가 근거를 읽기 전에 꽂음
const selectDir = flag("--select-dir");
if (selectDir) setSelectionSource(selectionFromDir(selectDir));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, team_id, data").eq("id", id).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);
const { data: sib } = await db.from("cards").select("id, task_no, data").eq("eval_unit_id", card.eval_unit_id).eq("status", "active");
const siblings: SiblingCard[] = (sib ?? []).map((c) => ({ id: c.id, taskNo: c.task_no, targetBusiness: c.data?.targetBusiness ?? "", executionTaskNo: c.data?.executionTaskNo ?? "", executionTask: c.data?.executionTask ?? "" }));
// 목차·쪽 배정(report_outline)이 있으면 그 쪽수 — 운영 서버 액션(runReportSectionDraft)과 같게(예전에는 기본 규칙만 써서 평가 세트 쪽 모듈이 운영과 달랐음)
const { data: outline } = await db.from("report_outline").select("pages, included").eq("card_id", card.id).eq("year", 2026).maybeSingle();
const ctx = sectionContext(card.data, siblings, outline?.included === false ? null : outline?.pages ? Number(outline.pages) : null);
// 뒤 인자: 첨부 파일, 또는 --sib <spec.json>(형제 초안 짜임으로 씀 — 저장하지 않은 초안끼리 겹침을 시험)
const sibFiles = argv.flatMap((a, i) => (argv[i - 1] === "--sib" ? [a] : []));
const fileArgs = positional.slice(2);
let files: MaterialDoc[] = await Promise.all(fileArgs.map((f) => readAttachment(new Uint8Array(readFileSync(f)), basename(f))));
// 읽기 실패한 저장본 — 서버 prepareDraft의 skipped와 같은 표기(초안 경고 「첨부: AI가 읽지 못해 빼고 썼습니다」)
let skipped: string[] = [];
if (fileArgs.length) console.log(`첨부: 명령줄 파일 ${files.length}건(${files.map((f) => f.name).join(", ")})`);
else if (argv.includes("--no-mats")) console.log("첨부: 넣지 않음(--no-mats)");
else {
  // 서버 loadMaterialTexts와 같은 열·같은 판정이되 쓰기는 하지 않음
  const { data: mats, error: me } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id).order("created_at", { ascending: true });
  if (me) throw new Error(`카드 전용 자료를 읽지 못함: ${me.message}`);
  const rowsAll = (mats ?? []) as MaterialRow[];
  const ready = rowsAll.filter((r) => materialState(r) === "ready");
  files = ready.map((r) => ({ id: String(r.id), kind: "card" as const, name: r.file_name, text: r.parsed_text ?? "" }));
  skipped = rowsAll.filter((r) => materialState(r) === "failed").map((r) => `「${r.file_name}」(${r.parse_error ?? "읽기 실패"})`);
  console.log(`첨부: DB 카드 전용 자료 ${files.length}건(${files.map((f) => f.name).join(", ") || "없음"})${rowsAll.length > files.length ? ` · 건너뜀 ${rowsAll.length - files.length}건(${rowsAll.filter((r) => materialState(r) !== "ready").map((r) => r.file_name).join(", ")} — 안 읽었거나 판이 다르거나 읽기 실패)` : ""}`);
}
const { data: sibDrafts } = await db.from("card_report_drafts").select("card_id, spec, outline, cards!inner(eval_unit_id, task_no, title)").eq("year", 2026).eq("cards.eval_unit_id", card.eval_unit_id).neq("card_id", id);
// 형제: 초안이 있으면 초안 짜임, 없으면 저장된 구성안의 틀·블록 순서(서버 prepareDraft와 같음 — 2026-10-10) + --sib 파일
const layouts: SiblingLayout[] = [
  ...(sibDrafts ?? []).flatMap((d: { spec: unknown; outline: unknown; cards: { task_no: string; title: string } | Array<{ task_no: string; title: string }> | null }) => {
    const sp = readSection(d.spec);
    const l = sp ? siblingLayout(sp) : null;
    if (l) return [l];
    const c = Array.isArray(d.cards) ? d.cards[0] : d.cards;
    const plan = readComposition(d.outline);
    const o = plan ? outlineSiblingLayout(`${c?.task_no ?? ""} ${(c?.title ?? "").slice(0, 24)}(구성안)`, plan) : null;
    return o ? [o] : [];
  }),
  ...sibFiles.map((f) => readSection(JSON.parse(readFileSync(f, "utf8")))).flatMap((sp) => (sp ? [siblingLayout(sp)].filter((l): l is SiblingLayout => Boolean(l)) : [])),
];
console.log("형제 짜임:", layouts.map((x) => `${x.label} [${x.story}] ${x.signature}`).join(" ‖ ") || "없음");
// 같은 실행과제 형제의 갈래 축·칩(서버 prepareDraft와 같음 — 2026-10-13)
const splitSiblings = splitSiblingsOf(card.data, card.id, siblings, (sibDrafts ?? []) as SplitDraftRow[]);
console.log("형제 갈래:", splitSiblings.map((x) => `${x.mark}. ${x.title.slice(0, 20)} ${x.axis ? `「${x.axis}」 [${x.chip || "칩 없음"}]` : "축 없음"}`).join(" ‖ ") || "없음");
// 전년도 보고서 같은 과제 절(앱과 같게 자동으로 고름)
const { data: rows } = await db.from("knowledge_chunks").select("chunk_key, business, title, text, report_page_2025, meta").eq("doc_id", "rpt25-biz").eq("business", card.eval_unit_id);
const prior = pickPrior(card.data, (rows ?? []).map(toPriorSection));
console.log("전년 절:", prior.map((p) => `${priorLabel(p.section)} · ${p.score}`).join(" ‖ ") || "없음");
// 평가 기준·평가위원 관점(앱과 같게) — --no-lens면 빼고 만들어 전후 비교
const lens = process.argv.includes("--no-lens") ? [] : await loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
// 공통 지식 규칙 범위 전부(앱과 같게 — 참고자료 설계 2단계, 서버 draft-prepare와 같은 「report」 목적 — 경평 작성 방법론 자료 포함, 2026-10-14). --no-kb면 빼고 만들어 전후 비교
const kb = process.argv.includes("--no-kb") ? undefined : await loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "report");
// 선별 방식을 요청했는데 이 카드가 선별되지 못하면 통째로 넣기로 감(비교가 무의미 — meta에 남김)
const fellBack = Boolean(selectDir) && Boolean(kb) && !kb!.select;
if (selectDir) console.log(fellBack ? `경고: 선별 방식(--select-dir ${selectDir})인데 이 카드는 선별되지 못해 통째로 넣기로 감(fellBack — KNOWLEDGE_SELECT에 report가 없거나 선별 결과·규칙 문서 없음)` : `공통 지식: 선별 방식 — 고른 조각 ${kb!.select!.picked.length}개 · 제목만 ${kb!.select!.unpicked.length}개`);
// 요청 글 크기(구성안·집필 1차 — reportStructured와 같은 조각: 공통 지식 덩이는 요청 앞에 따로, 요청 글 = 목록표 + 자료 블록)
const kbp = reportDraftPrompts().prompts;
const requestSize = (system: string, ask: string) => ({ systemChars: system.length, sharedChars: kb ? sharedTexts(kbp, kb).map((t) => t.length) : [], listChars: kb ? listText(kbp, kb).length : 0, promptChars: kb ? listText(kbp, kb).length + 2 + ask.length : ask.length });
console.log("평가 근거:", lens.map((x) => `${LENS_LABEL[x.group]} · ${x.title}`).join(" ‖ ") || "없음");
// 올해 실적 재료(앱과 같게 — 이 카드가 속한 보고서의 부서 계량 실적 입력 포함)
const { data: report } = await db.from("reports").select("inputs").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", 2026).maybeSingle();
const actuals = yearActuals(card.data, (report?.inputs?.kpi ?? {}) as Record<string, string>, isoDay());
console.log("올해 실적 재료:", `계량 ${actuals.kpi.length}(부서 입력 ${actuals.kpi.filter((k) => k.input).length}) · 월별 수치 줄 ${actuals.monthly.length}`);
// --outline: 구성안(재료표·짜임) → 자동 승인 → 집필(구현 계획 2단계 — 화면에서는 사람이 고친 뒤 승인)
const { known: extraText, quoteOnly, past, current } = draftEvidence(files, prior, lens, actuals, kb ? relevantRefs(kb) : []);
let plan: Composition | undefined;
let outlineSec = 0;
let outlineMs = 0;
let outlineMeta: { warnings: string[]; version: string; model: string; usage: unknown; request: ReturnType<typeof requestSize> } | null = null;
// 짜임 고르기(--story·--pattern·--example·--request)·여러 안(--alts) — 서버와 같은 검증(cleanFrameChoice·cleanAltChoices)과 요청 글 재료(예시 절은 공통 지식 조각, 근거 글에는 안 넣음)
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
const singleRaw = cleanFrameChoice({ story: flag("--story"), pattern: flag("--pattern"), ...(flag("--example") ? { example: { key: flag("--example"), title: flag("--example") } } : {}) }, false);
if (!singleRaw.ok) throw new Error(singleRaw.message);
const single = singleRaw.frame;
const request = (flag("--request") ?? "").slice(0, 500);
const altSpec = flag("--alts");
const altsRaw = altSpec ? cleanAltChoices(altSpec.split(",").map(parseFrame), false) : null;
if (altsRaw && !altsRaw.ok) throw new Error(altsRaw.message);
const frames: FrameChoice[] = altsRaw?.ok ? altsRaw.alts : [single];
const inspectionBasis = async () => {
  const { data: ins } = await db.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
  return followupBasis(ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null);
};
if (process.argv.includes("--dry")) {
  // 요청 글 크기(AI 호출 없음): 시스템 + 공통 지식 ①~③ + 목록표 + 요청 글 — 짜임 절은 따로 보임
  const op = reportOutlinePrompts().prompts;
  const inspection = await inspectionBasis();
  const base = outlineSystem(op).length + (kb ? sharedTexts(reportDraftPrompts().prompts, kb).join("\n").length + listText(reportDraftPrompts().prompts, kb).length : 0);
  for (const [k, f] of frames.entries()) {
    const input = { ...(await frameInput(f)), alt: altsRaw?.ok ? altContext(frames, k) : null };
    const ask = reportOutlineAsk({ card: card.data, ctx, year: 2026, files, prior, siblings: layouts, lens, actuals, kb, inspection, memo: request, story: f.story && isStory(f.story) ? f.story : undefined, frame: input, splitSiblings })(files.map((d) => ({ name: d.name, text: d.text })));
    const fp = framePrompt(op, input, false);
    console.log(`--- ${altsRaw?.ok ? `${k + 1}안 ` : ""}${frameLabel(f) || "고른 짜임 없음"} — 요청 글 ${ask.length}자(짜임 절 ${fp.length}자) · 합계 약 ${base + ask.length}자 · 프롬프트 ${op.version}`);
    if (fp) console.log(fp.length > 1600 ? `${fp.slice(0, 1600)}…` : fp);
  }
  process.exit(0);
}
if (altsRaw?.ok) {
  // 여러 안: 같은 근거로 구성안을 동시에 한 번씩(서버 runOutlineAlternatives와 같음 — 저장 안 함, 집필 없음)
  const inspection = await inspectionBasis();
  const { hayKey, known } = evidenceOf(card.data, extraText, quoteOnly);
  const t = Date.now();
  const res = await Promise.all(
    frames.map(async (f, k) => {
      const t0 = Date.now();
      try {
        const oc = await callReportOutline({ card: card.data, ctx, year: 2026, files, prior, siblings: layouts, lens, actuals, kb, inspection, memo: request, story: f.story && isStory(f.story) ? f.story : undefined, frame: { ...(await frameInput(f)), alt: altContext(frames, k) }, splitSiblings });
        const cc = cleanComposition(oc.output, hayKey, known);
        const c = cc.composition;
        return { ok: true as const, label: frameLabel(f), sec: Math.round((Date.now() - t0) / 1000), usage: oc.usage, story: c.story, subStory: c.subStory ?? "", blocks: c.blocks.map((b) => `${b.label || "전폭"}:${b.variant ? `${b.kind}:${b.variant}` : b.kind}${b.layout ? `@${b.layout}` : ""}${b.span ? "½" : ""}`), fit: compositionFit(c, ctx.module, ctx.head), sig: altSignature(c.blocks, c.story, c.subStory), split: c.split ?? null, splitWarnings: [...cc.warnings.filter((w) => w.startsWith("갈래:")), ...splitSiblingIssues(c.split, splitSiblings)], issues: compositionIssues(c, ctx.module, ctx.head) };
      } catch (e) {
        return { ok: false as const, label: frameLabel(f), error: String(e), sig: null };
      }
    }),
  );
  const same = markDuplicateAlts(res.map((r) => r.sig));
  console.log(JSON.stringify({ sec: Math.round((Date.now() - t) / 1000), alts: res.map((r, i) => ({ no: i + 1, ...r, sig: undefined, same: same[i] === null ? null : same[i]! + 1 })) }, null, 1));
  process.exit(0);
}
if (process.argv.includes("--outline") || app) {
  const t1 = Date.now();
  // 최종 점검표의 미흡 행(서버 runReportOutline과 같은 규칙 — 보낸·확인한 것 중 점검월이 가장 늦은 1건)
  const { data: ins } = await db.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
  const inspection = followupBasis(ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null);
  console.log("월간 점검 보완 요청:", inspection ? `${inspection.period} 미흡 ${inspection.rows.length}${inspection.focus ? "(집중보완)" : ""}` : "없음");
  const outlineInput = { card: card.data, ctx, year: 2026, files, prior, siblings: layouts, lens, actuals, kb, inspection, memo: request, story: single.story && isStory(single.story) ? single.story : undefined, frame: isEmptyFrame(single) ? undefined : await frameInput(single), splitSiblings };
  const oc = await callReportOutline(outlineInput);
  outlineMs = Date.now() - t1;
  outlineSec = Math.round(outlineMs / 1000);
  const { hayKey, known } = evidenceOf(card.data, extraText, quoteOnly);
  const cleaned = cleanComposition(oc.output, hayKey, known);
  const before = compositionFit(cleaned.composition, ctx.module, ctx.head);
  // 화면에서는 담당자가 「판면에 맞게 줄이기」·블록 빼기로 맞춤 — 연기 시험은 자동으로(--app은 화면에서 안 누른 것처럼 그대로)
  const fitted = app ? { composition: cleaned.composition, changes: [] as string[] } : fitComposition(cleaned.composition, ctx.module, ctx.head);
  const { composition } = fitted;
  const warnings = [...cleaned.warnings, ...splitSiblingIssues(composition.split, splitSiblings)];
  const cf = compositionFit(composition, ctx.module, ctx.head);
  console.log(
    "구성안:",
    JSON.stringify({
      sec: outlineSec,
      usage: oc.usage,
      version: oc.promptVersion,
      story: composition.story,
      subStory: composition.subStory ?? "",
      split: composition.split ?? null,
      storyWhy: composition.storyWhy,
      message: composition.message,
      points: composition.points,
      blocks: composition.blocks.map((b) => `${b.label || "전폭"}:${b.variant ? `${b.kind}:${b.variant}` : b.kind}×${b.cells}${b.figures.length ? ` +그림${b.figures.length}` : ""}`),
      materials: composition.materials.length,
      need: composition.materials.filter((m) => m.kind === "need").length,
      unfound: composition.materials.filter((m) => m.kind !== "need" && !m.found).length,
      fit: `${before.total} → ${cf.total}/${cf.budget}`,
      fitChanges: fitted.changes,
      budgets: blockBudgets(composition, ctx.module, ctx.head),
      issues: compositionIssues(composition, ctx.module, ctx.head),
      warnings,
    }),
  );
  writeFileSync(`${out}.outline.json`, JSON.stringify(composition, null, 1));
  plan = composition;
  // 서버 bizComposition의 outline_warnings와 같은 목록(재료 경고 + 형제 갈래 + 짜임 문제)
  outlineMeta = {
    warnings: [...cleaned.warnings, ...splitSiblingIssues(composition.split, splitSiblings), ...compositionIssues(composition, ctx.module, ctx.head)],
    version: oc.promptVersion,
    model: modelLabel(oc),
    usage: oc.usage,
    request: requestSize(outlineSystem(reportOutlinePrompts().prompts), reportOutlineAsk(outlineInput)(files.map((d) => ({ name: d.name, text: d.text })))),
  };
}
const prompts = reportDraftPrompts().prompts;
const prompt = sectionPrompt(prompts, card.data, ctx, 2026, files, prior, layouts, lens, actuals);
console.log(`provider ${aiProvider()} · 카드 ${id} · ${ctx.task.no} ${ctx.mark}. · 모듈 ${ctx.module}쪽 · 첨부 ${files.length}건 · 요청 ${prompt.length}자 · 프롬프트 ${prompts.version}`);
const own = sectionHints(card.data, prior, files, lens, actuals, 2026).filter((h) => h.own);
console.log("이 과제만의 요소 후보:", own.map((h) => h.kind).join("·") || "없음");
const t0 = Date.now();
// --app은 서버 writeDraft와 같은 검증 인자(올해 실적 기준일 actuals.today까지)
const { call, check: v, passes, usage, trace } = await callReportSectionFitted({ card: card.data, ctx, year: 2026, files, prior, siblings: layouts, lens, actuals, plan, kb }, (o) => verifySection(o, card.data, plan?.split?.chip ? { ...ctx, chip: plan.split.chip } : ctx, extraText, layouts, quoteOnly, 2026, own, plan ? (blocks) => applyPlanLayout(plan!, blocks) : undefined, { past, current }, app ? actuals.today : undefined));
const draftMs = Date.now() - t0;
const fit = fitReport(v.spec);
console.log(JSON.stringify({ model: modelLabel(call), sec: Math.round((Date.now() - t0) / 1000), usage, fitPasses: passes, fit: `${fit.total}/${fit.budget}mm`, wrapped: fit.wrapped.length, ragged: fit.ragged.length, sparse: `${fit.sparse.length}/${fit.bullets}`, rows: fit.rows.map((r) => `${r.label || r.kinds} ${Math.round(r.mm)}`).join(" · "), story: v.spec.story, layout: siblingLayout(v.spec)?.signature, results: v.spec.results.length, figures: (v.spec.blocks ?? []).flatMap((b) => (b.figures ?? []).map((f) => `${f.kind}/${f.size}/${f.pos} ${f.desc}`)), unknownNumbers: v.unknownNumbers, yearIssues: v.yearIssues, composeIssues: v.composeIssues, trace, plan: plan ? planAdherence(plan, v.spec.blocks ?? []) : undefined, outlineSec, warnings: v.warnings }, null, 1));
writeFileSync(out, sectionDocument(v.spec, v.unknownNumbers, { year: 2026, generatedAt: new Date().toISOString(), model: modelLabel(call) }));
writeFileSync(`${out}.json`, JSON.stringify(v.spec, null, 1));
if (app) {
  // 앱이 저장할 경고 — 서버 writeDraft rowOf와 같은 순서·문구(검증 경고 + 첨부 읽기 실패 + 자동 고치기 실패·시간 부족 + 구성안 지킴)
  const failedFit = trace.drafts.find((d) => d.failed);
  const warnings = [
    ...v.warnings,
    ...(skipped.length ? [`첨부: AI가 읽지 못해 빼고 썼습니다 — ${skipped.join(", ")}`] : []),
    ...(failedFit ? [`자동 고치기: 다시 쓰기 요청이 실패해 고치기 전 초안을 저장했습니다(${failedFit.error ?? "원인 모름"}) — 판면·경고를 확인해 주세요.`] : []),
    ...(trace.skipped === "time" ? ["자동 고치기: 시간이 모자라 자동 고치기를 하지 않았습니다 — 「다시 만들기」나 블록 고치기로 판면·경고를 고쳐 주세요."] : []),
  ];
  const adherence = plan ? planAdherence(plan, v.spec.blocks ?? []) : null;
  if (plan && adherence && !adherence.same) {
    const extra = extraBlocks(plan, v.spec.blocks ?? []);
    warnings.push(
      adherence.matched === adherence.total && extra.length
        ? `구성안: 구성안 블록 ${adherence.total}개는 모두 그대로 썼지만 구성안에 없는 블록 ${extra.length}개(${extra.map((b) => b.label || b.kind).join(", ")})를 더 넣었습니다 — 판면이 넘치면 그 블록을 빼 주세요.`
        : `구성안: 승인한 짜임 ${adherence.total}블록 중 ${adherence.matched}블록만 같은 순서로 썼습니다 — 다시 만들거나 구성안을 고쳐 주세요.`,
    );
  }
  const meta = {
    warnings,
    unknownNumbers: v.unknownNumbers,
    outlineWarnings: outlineMeta?.warnings ?? [],
    story: v.spec.story,
    promptVersion: call.promptVersion,
    outlineVersion: outlineMeta?.version ?? null,
    timings: { outlineMs, draftMs, firstMs: trace.firstMs, fixMs: trace.fixMs ?? null, fitPasses: passes, fixSkipped: trace.skipped ?? null },
    usage: { outline: outlineMeta?.usage ?? null, draft: usage },
    // 요청 글 크기(글자) — 집필은 1차 요청(자동 고치기는 같은 글 끝에 고칠 점이 붙음)
    request: { outline: outlineMeta?.request ?? null, draft: requestSize(reportSystem(prompts), `${prompt}${plan ? `\n\n${planPrompt(prompts, plan, ctx.module, ctx.head)}` : ""}`) },
    select: selectDir ? { dir: selectDir, fellBack } : null,
    model: modelLabel(call),
    outlineModel: outlineMeta?.model ?? null,
    provider: aiProvider(),
  };
  writeFileSync(`${out}.meta.json`, JSON.stringify(meta, null, 1));
}
console.log(`HTML: ${out}`);
