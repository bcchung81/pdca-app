// 공통 지식 맥락 줄이기(2026-11-21, 후보 A·B·C·D) 검증 — base·new 두 갈래 실행기(평가 전용·수동 실행, --dry가 아니면 Claude CLI 호출이 나감).
// 한 스크립트로 두 갈래를 같은 꼴로 돌림: 앱 모듈(lib/…)·프롬프트(resources/…)를 지금 폴더(process.cwd())에서 읽음 —
//  base = 고정 사본 폴더(커밋 00cb959)에서, new = 저장소 작업 트리에서 실행(.team/VER.md 0절). 지금 폴더에 lib/ai/writer-knowledge.ts가 있으면 new 코드, 없으면 base 코드이고 --arm과 다르면 멈춤.
// 서버 액션(app/(app)/cards/actions.ts runCardAssist·runCardChat·runCardComments)과 같은 근거·검증으로 카드 × 기능마다 AI를 한 번씩 부름:
//  - 작성지원(improve·discover·reflect·followup): new = lib/ai/writer-knowledge.ts(latestInspection + loadWriterKnowledge — 요청 종류 × 점검표 유무 범위와 「최근 점검표」 요약),
//    base = loadCardBundle(…, "card", "writer")(그때 서버와 같음 — 점검표는 보완 점검의 미흡 행만). reflect는 붙여 넣은 글 없이 카드 전용 자료만(없으면 서버처럼 건너뜀),
//    followup은 점검표가 없으면 건너뜀·미흡 0건이면 코드 결과(AI 안 부름).
//  - 질문(chat): 모든 카드에 같은 질문 하나(이력 없음) + 최종 점검표 요약(inspectionBrief) — loadCardBundle(…, "card", "chat")
//  - 리뷰어 코멘트(comment): 잠기지 않은 글 칸 중 긴 것 둘에 「수정」·「질문」 코멘트(scripts/smoke/ai-comment-smoke.ts와 같은 고르기 — 두 갈래 같음) — loadCardBundle(…, "card", "comment")
//  카드 = 운영 원장 카드 JSON(성과관리팀 화면과 같음), 카드 전용 자료 = card_materials 저장본 전체 글(materialState ready — 아니면 건너뛰고 기록에 남김, DB에 쓰지 않음).
// 선별 여부는 셸 환경변수(KNOWLEDGE_SELECT·KNOWLEDGE_SELECT_TRACKS — --env-file보다 앞섬)가 정함. 이 스크립트는 바꾸지 않고 기록만 함.
//  --select-dir <폴더>: (new만) 선별 실험 출처를 꽂음(scripts/lib/select-dir.ts selectionFromDir(…, { asDb: true }) — 파일에 없는 카드는 운영 DB 선별 행). 기록 settings.selectDir에 「실험 출처」로 남김
// 기록마다 앱 함수로 센 값: 선별 적용·고른 수·설정상 대상(gate)·통째로 돌아감(fellBack), 요청 종류별 범위(new 작성지원), 점검표를 줬는지, 층별 조각 수·글자·가점 실사 수,
//  가점 실사 관련 판정(bonusReasons), 요청 글 크기(서버 호출과 같은 조각), CLI 사용량·시간, 검증 전 답 건수.
// Claude는 로컬 CLI로만(AI_PROVIDER=cli, ANTHROPIC_API_KEY 비움). 운영 DB는 읽기만(select), ai_requests에도 쓰지 않음.
// 실행: cd <코드 폴더> && node --conditions=react-server --env-file=<저장소>/.env.local <저장소>/scripts/eval/writer-ab.ts --arm base|new --out <폴더> --cards <id,…>
//        [--features improve,discover,reflect,followup,chat,comment] [--concurrency 2] [--select-dir <폴더>] [--attach <카드 id>=<파일>[+<파일>][,…]] [--dry]
//  --attach: 이 컴퓨터의 파일을 서버와 같은 읽기(lib/ai/attachments.ts readAttachment — kordoc)로 읽어 그 카드의 DB 첨부 뒤에 더함(DB·저장소에 올리지 않음, writer-run.ts와 같음).
//    기록 materials.attached에 이름·경로·글자 수를 남김(심사기가 같은 읽기로 다시 읽어 묶음에 실음). 두 갈래에 같은 파일을 줘야 비교가 됨
//  결과: <out>/<arm>/<cards.uid>/<기능>.json — 이미 있으면 건너뜀(이어 하기), 실패는 <기능>.fail.json(다시 돌리면 다시 부름). 진행 줄 <out>/<arm>/run.txt
//  --dry: AI를 부르지 않고 할 일·요청 글 크기·선별·범위·점검표·가점 실사를 표로 보이고 <out>/<arm>/dry.json에 씀(답 파일은 안 씀)
//  --dump(--dry와 함께): 부를 요청 글을 <out>/<arm>/<cards.uid>/<기능>.request.txt에 그대로 씀(시스템 · 공통 지식 덩이 · 요청 글 — 두 갈래 diff용)
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { bonusReasons, isBonusSurvey } from "../../lib/knowledge/bonus-scope.ts";
import { selectionFromDir } from "../lib/select-dir.ts";
import { AB_ARMS, type AbArm, type AbFeature, type AbRecord, QUESTION, type RequestSize, bundleStats, failFile, isWriterFeature, parseAttachArg, parseFeatures, recordFile } from "./writer-ab-core.ts";

// Claude API는 쓰지 않음 — .env.local에 API 키가 있어도 CLI로(aiProvider는 부를 때 process.env를 읽음)
process.env.AI_PROVIDER = "cli";
process.env.ANTHROPIC_API_KEY = "";
delete process.env.VERCEL;

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const outArg = flag("--out");
const arm = flag("--arm") as AbArm | undefined;
const cardIds = (flag("--cards") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!outArg || !arm || !cardIds.length) {
  console.error("usage: cd <코드 폴더> && node --conditions=react-server --env-file=<저장소>/.env.local <저장소>/scripts/eval/writer-ab.ts --arm base|new --out <폴더> --cards <id,…> [--features …] [--concurrency 2] [--select-dir <폴더>] [--dry]");
  process.exit(1);
}
if (!AB_ARMS.includes(arm)) throw new Error(`--arm은 ${AB_ARMS.join("·")} 중 하나`);
const features = parseFeatures(flag("--features"));
const concurrency = Math.max(1, Number(flag("--concurrency") ?? 2) || 2);
const dry = argv.includes("--dry");
const dump = argv.includes("--dump");
if (dump && !dry) throw new Error("--dump는 --dry와 함께 씁니다.");
const selectDir = flag("--select-dir") ? resolve(flag("--select-dir")!) : null;
/** --attach 카드 id → 로컬 파일 경로들(절대 경로로) */
const attachMap = new Map([...parseAttachArg(flag("--attach"))].map(([id, files]) => [id, files.map((f) => resolve(f))]));
for (const id of attachMap.keys()) if (!cardIds.includes(id)) throw new Error(`--attach의 카드 ${id}가 --cards에 없습니다.`);
const out = resolve(outArg);
const armDir = join(out, arm);

// 코드 폴더(갈래): 지금 폴더의 앱 모듈·프롬프트를 씀
const root = process.cwd();
const kind: AbArm = existsSync(join(root, "lib/ai/writer-knowledge.ts")) ? "new" : "base";
if (kind !== arm) throw new Error(`지금 폴더(${root})는 ${kind} 코드입니다 — --arm ${arm}는 ${arm === "base" ? "고정 사본 폴더" : "저장소 작업 트리"}에서 돌려 주세요.`);
if (selectDir && kind !== "new") throw new Error("--select-dir는 new 갈래에서만 씁니다(base 코드의 select-dir.ts에는 asDb가 없음).");
const load = async <M,>(p: string): Promise<M> => (await import(pathToFileURL(join(root, p)).href)) as M;

const [ctx, runMod, writer, chat, comments, bundle, sel, sets, tracks, mat, follow, insModel, mgCard, view, patch, pathLabelMod, pool, scopeQ, attachments] = await Promise.all([
  load<typeof import("../../lib/ai/context.ts")>("lib/ai/context.ts"),
  load<typeof import("../../lib/ai/run.ts")>("lib/ai/run.ts"),
  load<typeof import("../../lib/ai/writer.ts")>("lib/ai/writer.ts"),
  load<typeof import("../../lib/ai/chat.ts")>("lib/ai/chat.ts"),
  load<typeof import("../../lib/ai/comments.ts")>("lib/ai/comments.ts"),
  load<typeof import("../../lib/knowledge/bundle.ts")>("lib/knowledge/bundle.ts"),
  load<typeof import("../../lib/knowledge/select.ts")>("lib/knowledge/select.ts"),
  load<typeof import("../../lib/prompts/sets.ts")>("lib/prompts/sets.ts"),
  load<typeof import("../../lib/tracks/index.ts")>("lib/tracks/index.ts"),
  load<typeof import("../../lib/ai/material-text.ts")>("lib/ai/material-text.ts"),
  load<typeof import("../../lib/ai/followup.ts")>("lib/ai/followup.ts"),
  load<typeof import("../../lib/inspections/model.ts")>("lib/inspections/model.ts"),
  load<typeof import("../../lib/cards/mgmt-card.ts")>("lib/cards/mgmt-card.ts"),
  load<typeof import("../../lib/cards/view.ts")>("lib/cards/view.ts"),
  load<typeof import("../../lib/cards/patch.ts")>("lib/cards/patch.ts"),
  load<typeof import("../../lib/cards/path-label.ts")>("lib/cards/path-label.ts"),
  load<typeof import("../../lib/ai/pool.ts")>("lib/ai/pool.ts"),
  load<typeof import("../../lib/prep/scope-queries.ts")>("lib/prep/scope-queries.ts"),
  load<typeof import("../../lib/ai/attachments.ts")>("lib/ai/attachments.ts"),
]);
// new 코드에만 있는 모듈(작성지원 요청 종류별 범위)
const wk = kind === "new" ? await load<typeof import("../../lib/ai/writer-knowledge.ts")>("lib/ai/writer-knowledge.ts") : null;
const mp = kind === "new" ? await load<typeof import("../../lib/knowledge/mode-profile.ts")>("lib/knowledge/mode-profile.ts") : null;

type KB = import("../../lib/knowledge/bundle.ts").KnowledgeBundle;
type MaterialDoc = import("../../lib/ai/material-text.ts").MaterialDoc;
type MaterialRow = import("../../lib/ai/material-text.ts").MaterialRow;
type FollowupBasis = import("../../lib/ai/followup.ts").FollowupBasis;
type Ins = { period: string; status: string; result: import("../../lib/inspections/model.ts").InspectionResult };
type CommentInput = import("../../lib/ai/comments.ts").CommentInput;
type Usage = import("../../lib/ai/run.ts").Usage;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
if (selectDir) ctx.setSelectionSource(selectionFromDir(selectDir, { asDb: true }));
const settings = {
  KNOWLEDGE_SELECT: process.env.KNOWLEDGE_SELECT ?? "",
  KNOWLEDGE_SELECT_TRACKS: process.env.KNOWLEDGE_SELECT_TRACKS ?? "",
  selectDir: selectDir ? `실험 출처 ${selectDir}` : null,
  CLAUDE_CLI_TIMEOUT_MS: process.env.CLAUDE_CLI_TIMEOUT_MS ?? "",
};

const period = view.currentPeriod();
const periodLabel = `${period.slice(0, 4)}년 ${Number(period.slice(5))}월`;
const promptFiles = (files: MaterialDoc[]) => files.map((d) => ({ name: d.name, text: d.text }));

interface Prepared {
  feature: AbFeature;
  kb: KB;
  gate: boolean;
  scope: AbRecord["scope"];
  /** 작성지원 「최근 점검표」 요약(new) 또는 질문 점검표 요약 */
  inspectionText: string | null;
  given: AbRecord["inspection"]["given"];
  comments?: CommentInput[];
  commentMeta?: AbRecord["comments"];
}
interface CardRow {
  id: string;
  uid: string;
  evalUnitId: string;
  data: Record<string, unknown>;
  files: MaterialDoc[];
  skipped: string[];
  attached: NonNullable<AbRecord["materials"]["attached"]>;
  ins: Ins | null;
  followup: FollowupBasis | null;
  bonusReasons: string[];
  isBonus: (key: string) => boolean;
  prepared: Partial<Record<AbFeature, Prepared>>;
}

/** 리뷰어 코멘트 자리: 잠기지 않은 글 칸 중 글이 20자 이상인 것을 긴 순(같으면 경로 순)으로 둘 — 「수정」 1건 + 「질문」 1건(ai-comment-smoke.ts와 같은 문구) */
function pickComments(data: Record<string, unknown>): { comments: CommentInput[]; meta: NonNullable<AbRecord["comments"]> } {
  const targets = patch.editTargets(data);
  const cands = [...targets.entries()]
    .filter(([, t]) => t.line && !t.locked)
    .map(([path]) => ({ path, text: String(patch.valueAt(data, path) ?? "") }))
    .filter((c) => c.text.trim().length >= 20)
    .sort((a, b) => b.text.length - a.text.length || a.path.localeCompare(b.path));
  if (cands.length < 2) throw new Error(`코멘트 예시로 쓸 만한 칸이 모자람(${cands.length}개)`);
  const quote = (t: string) => t.slice(0, Math.min(40, t.length));
  const comments: CommentInput[] = [
    { id: "c1", kind: "edit", path: cands[0].path, paths: [cands[0].path], quote: quote(cands[0].text), text: "이 부분을 더 쉬운 말로, 두괄식으로 다듬어 주세요." },
    { id: "c2", kind: "ask", path: cands[1].path, paths: [cands[1].path], quote: quote(cands[1].text), text: "이 실적의 근거 자료가 있나요?" },
  ];
  return { comments, meta: comments.map((c) => ({ id: c.id, kind: c.kind, path: c.path ?? "", quote: c.quote ?? "", text: c.text, label: pathLabelMod.pathLabel(c.path, data) })) };
}

/** 기능마다 공통 지식 묶음 — 서버와 같은 함수(갈래 코드) */
async function prepare(c: CardRow, f: AbFeature): Promise<Prepared> {
  const card = { id: c.id, evalUnitId: c.evalUnitId, data: c.data };
  const trackId = tracks.trackSpecOfUnit(c.evalUnitId).id;
  const selFeature = isWriterFeature(f) ? "writer" : f;
  const gateBy = (scopeSelect: boolean) => scopeSelect && sel.selectOn(process.env.KNOWLEDGE_SELECT, "card", selFeature) && sel.selectTrackOn(process.env.KNOWLEDGE_SELECT_TRACKS, trackId, "card", selFeature);
  if (isWriterFeature(f)) {
    if (wk && mp) {
      const scope = mp.writerScope(f, c.ins !== null, tracks.trackSpecOfUnit(c.evalUnitId));
      const { kb, inspection } = await wk.loadWriterKnowledge(db, card, f, c.ins);
      return { feature: f, kb, gate: gateBy(scope.select), scope: { groups: [...scope.groups], dropUnits: [...scope.dropUnits], extraUnits: [...(scope.extraUnits ?? [])], select: scope.select, inspection: scope.inspection }, inspectionText: inspection, given: f === "followup" ? (c.followup ? "followup" : null) : inspection ? "summary" : null };
    }
    const kb = await ctx.loadCardBundle(db, card, "card", "writer");
    return { feature: f, kb, gate: gateBy(true), scope: null, inspectionText: null, given: f === "followup" && c.followup ? "followup" : null };
  }
  if (f === "chat") {
    const kb = await ctx.loadCardBundle(db, card, "card", "chat");
    return { feature: f, kb, gate: gateBy(true), scope: null, inspectionText: chat.inspectionBrief(c.ins), given: c.ins ? "chat" : null };
  }
  const kb = await ctx.loadCardBundle(db, card, "card", "comment");
  const picked = pickComments(c.data);
  return { feature: f, kb, gate: gateBy(true), scope: null, inspectionText: null, given: null, comments: picked.comments, commentMeta: picked.meta };
}

/** 운영 DB가 가끔 「JWT issued at future」(시계 어긋남)로 거절함 — 그 오류만 잠깐 쉬고 다시(최대 5번) */
async function withJwtRetry<R extends { error: { message: string } | null }>(q: () => PromiseLike<R>): Promise<R> {
  for (let i = 0; ; i++) {
    const r = await q();
    if (!r.error || !/JWT issued at future/i.test(r.error.message) || i >= 4) return r;
    await new Promise((s) => setTimeout(s, 3000));
  }
}

/** 카드 원장 + 카드 전용 자료(저장본 전체 글만) + 최종 점검표 + 가점 실사 판정 + 기능별 묶음 */
async function loadCard(id: string): Promise<CardRow> {
  const { data: card, error } = await withJwtRetry(() => db.from("cards").select("id, uid, eval_unit_id, data, status").eq("id", id).single());
  if (error || !card) throw new Error(`카드를 읽지 못함 ${id}: ${error?.message}`);
  if (card.status !== "active") throw new Error(`보관한 카드 ${id}`);
  const { data: mats, error: me } = await db.from("card_materials").select(mat.MATERIAL_COLS).eq("card_id", card.id).order("created_at");
  if (me) throw new Error(`카드 전용 자료를 읽지 못함 ${id}: ${me.message}`);
  const rows = (mats ?? []) as MaterialRow[];
  const files = rows.filter((r) => mat.materialState(r) === "ready").map((r): MaterialDoc => ({ id: String(r.id), kind: "card", name: r.file_name, text: r.parsed_text ?? "" }));
  const skipped = rows.filter((r) => mat.materialState(r) !== "ready").map((r) => `「${r.file_name}」(${mat.materialState(r) === "failed" ? (r.parse_error ?? "읽기 실패") : "저장본 없음·판 다름 — 서버라면 이때 읽음"})`);
  // --attach: 서버와 같은 읽기로 DB 첨부 뒤에 더함(file:N 번호도 그 순서)
  const attached: CardRow["attached"] = [];
  for (const path of attachMap.get(id) ?? []) {
    const doc = await attachments.readAttachment(new Uint8Array(readFileSync(path)), basename(path));
    files.push(doc);
    attached.push({ name: doc.name, path, chars: doc.text.length });
  }
  // 최종 점검표: 보낸·확인한 것 중 점검월이 가장 늦은 1건(초안 제외) — new는 서버와 같은 latestInspection, base는 그때 서버와 같은 질의
  let ins: Ins | null;
  if (wk) ins = await wk.latestInspection(db, card.id);
  else {
    const { data: r } = await db.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
    ins = r ? { period: r.period, status: r.status, result: insModel.readResult(r.result) } : null;
  }
  // 가점 실사 판정: 이 트랙 조각 행에 isBonusSurvey(조각 key → 행), 관련 판정 bonusReasons(대응표 auto·confirmed 연결 — 서버와 같은 loadScopeKeys)
  const [chunks, linked] = await Promise.all([ctx.loadBundleChunks(db, tracks.trackSpecOfUnit(card.eval_unit_id)), scopeQ.loadScopeKeys(db, card.id)]);
  const bonusKeys = new Set(chunks.filter((ch) => isBonusSurvey(ch)).map((ch) => ch.chunk_key));
  const linkedSet = new Set(linked);
  const row: CardRow = {
    id: card.id,
    uid: card.uid,
    evalUnitId: card.eval_unit_id,
    data: card.data,
    files,
    skipped,
    attached,
    ins,
    followup: follow.followupBasis(ins),
    bonusReasons: bonusReasons({ unit: card.eval_unit_id, data: card.data, linkedBonus: [...bonusKeys].some((k) => linkedSet.has(k)) }),
    isBonus: (k) => bonusKeys.has(k),
    prepared: {},
  };
  for (const f of features) row.prepared[f] = await prepare(row, f);
  return row;
}

/** 할 일 판정 — 서버 runCardAssist와 같은 순서 */
type Plan = { kind: "call" } | { kind: "code"; reason: string } | { kind: "skip"; reason: string };
function planOf(c: CardRow, f: AbFeature): Plan {
  if (f === "followup") {
    if (!c.followup) return { kind: "skip", reason: "점검표 없음" };
    if (!c.followup.rows.length) return { kind: "code", reason: "미흡 0건(코드 결과, AI 안 부름)" };
  }
  if (f === "reflect" && !c.files.length) return { kind: "skip", reason: "실적 자료 없음" };
  return { kind: "call" };
}

const writerReq = (c: CardRow, p: Prepared) => ({ mode: p.feature as import("../../lib/ai/writer.ts").WriterMode, note: "", periodLabel, attachmentText: null, followup: p.feature === "followup" ? c.followup : null, inspection: p.inspectionText });
const chatReq = (p: Prepared) => ({ question: QUESTION, history: [], periodLabel, inspection: p.inspectionText ?? "" });
const commentReq = (p: Prepared) => ({ periodLabel, comments: p.comments ?? [], keeps: [] });

/** 서버 호출(callWriter·callChat·callComments → cardStructured)과 같은 조각으로 요청 글(시스템·공통 지식 덩이·목록표·요청 글) */
function requestTexts(c: CardRow, p: Prepared): { system: string; shared: string[]; list: string; prompt: string } {
  const mg = mgCard.isMgmtCard(c.data);
  const track = tracks.trackSpecOfUnit(p.kb.unit);
  const files = promptFiles(c.files);
  let ps: import("../../lib/prompts/template.ts").PromptSet;
  let system: string;
  let make: (list: string) => string;
  if (isWriterFeature(p.feature)) {
    ps = (mg ? sets.assistPromptsMg : sets.assistPrompts)().prompts;
    system = (mg ? runMod.writerSystemMg : runMod.writerSystem)(track);
    make = (list) => writer.userPrompt(ps, c.data, list, { ...writerReq(c, p), files });
  } else if (p.feature === "chat") {
    ps = (mg ? sets.chatPromptsMg : sets.chatPrompts)().prompts;
    system = (mg ? runMod.chatSystemMg : runMod.chatSystem)(track);
    make = (list) => chat.chatPrompt(ps, c.data, list, { ...chatReq(p), files });
  } else {
    ps = (mg ? sets.commentPromptsMg : sets.commentPrompts)().prompts;
    system = (mg ? runMod.commentSystemMg : runMod.commentSystem)(track);
    make = (list) => comments.commentPrompt(ps, c.data, patch.editTargets(c.data), list, { ...commentReq(p), files });
  }
  const list = bundle.listText(ps, p.kb);
  return { system, shared: bundle.sharedTexts(ps, p.kb), list, prompt: make(list) };
}

/** 요청 글 크기 */
function requestSize(c: CardRow, p: Prepared): RequestSize {
  const t = requestTexts(c, p);
  const shared = t.shared.map((x) => x.length);
  return { system: t.system.length, shared, list: t.list.length, prompt: t.prompt.length, total: t.system.length + shared.reduce((n, x) => n + x, 0) + t.prompt.length };
}

/** 기록의 공통 부분(답 빼고) */
function baseRecord(c: CardRow, p: Prepared): AbRecord {
  return {
    arm: arm!,
    feature: p.feature,
    cardId: c.id,
    uid: c.uid,
    unit: c.evalUnitId,
    periodLabel,
    code: { root, kind },
    settings,
    bonusReasons: c.bonusReasons,
    scope: p.scope,
    knowledge: bundleStats(p.kb, c.isBonus, p.gate),
    inspection: { exists: c.ins !== null, period: c.ins?.period ?? null, given: p.given, chars: p.given === "followup" ? 0 : (p.inspectionText ?? "").length },
    materials: { used: c.files.map((f) => f.name), skipped: c.skipped, ...(c.attached.length ? { attached: c.attached } : {}) },
    request: null,
    ...(p.commentMeta ? { comments: p.commentMeta } : {}),
    ...(p.feature === "chat" ? { question: QUESTION } : {}),
  };
}

// ---------------------------------------------------------------------------
// 준비(차례로): 카드 읽기 → 기능마다 묶음
const loaded: CardRow[] = [];
for (const id of cardIds) loaded.push(await loadCard(id));
for (const c of loaded) if (c.skipped.length) console.warn(`경고: ${c.id} 카드 전용 자료 중 저장본이 없어 뺀 것 ${c.skipped.length}건 — ${c.skipped.join(", ")}`);

interface Task { card: CardRow; p: Prepared; plan: Plan; file: string; fail: string }
const tasks: Task[] = loaded.flatMap((card) => features.map((f) => ({ card, p: card.prepared[f]!, plan: planOf(card, f), file: recordFile(out, arm, card.uid, f), fail: failFile(out, arm, card.uid, f) })));
const man = (n: number) => `${(n / 10_000).toFixed(1)}만`;

if (dry) {
  const rows = tasks.map((t) => ({ ...baseRecord(t.card, t.p), plan: t.plan, request: t.plan.kind === "call" ? requestSize(t.card, t.p) : null, exists: existsSync(t.file) }));
  mkdirSync(armDir, { recursive: true });
  writeFileSync(join(armDir, "dry.json"), JSON.stringify({ createdAt: new Date().toISOString(), arm, code: { root, kind }, settings, rows }, null, 1));
  if (dump)
    for (const t of tasks.filter((x) => x.plan.kind === "call")) {
      const r = requestTexts(t.card, t.p);
      const parts = [`=== system (${r.system.length}자) ===`, r.system, ...r.shared.flatMap((s, i) => [`=== shared[${i}] (${s.length}자) ===`, s]), `=== prompt (${r.prompt.length}자) ===`, r.prompt];
      mkdirSync(join(armDir, t.card.uid), { recursive: true });
      writeFileSync(join(armDir, t.card.uid, `${t.p.feature}.request.txt`), parts.join("\n") + "\n");
    }
  console.log(`arm=${arm} · 코드 ${kind}(${root}) · KNOWLEDGE_SELECT=${settings.KNOWLEDGE_SELECT} · TRACKS=${settings.KNOWLEDGE_SELECT_TRACKS}${selectDir ? ` · ${settings.selectDir}` : ""}`);
  console.log("| 카드 | 기능 | 할 일 | 공통 지식 | 고른/제목 | 범위(new 작성지원) | 점검표 | 가점 실사(요청 원문/관련) | 층 조각(①/②/③) | 요청 글(시스템/덩이/요청) |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const k = r.knowledge!;
    const what = r.plan.kind === "call" ? "AI 호출" : `${r.plan.kind === "code" ? "코드 결과" : "건너뜀"} — ${r.plan.reason}`;
    const scope = r.scope ? `${r.scope.groups.join("+")}${r.scope.dropUnits.length ? ` −${r.scope.dropUnits.join(",")}` : ""}${r.scope.extraUnits?.length ? ` +${r.scope.extraUnits.join(",")}` : ""}${r.scope.select ? "" : " (선별 안 씀)"}` : "범위 전부";
    const size = r.request ? `${man(r.request.total)} (${man(r.request.system)}/${man(r.request.shared.reduce((n, x) => n + x, 0))}/${man(r.request.prompt)})` : "—";
    console.log(`| ${r.cardId} | ${r.feature} | ${what}${r.exists ? " [있음]" : ""} | ${k.method}${k.fellBack ? "(대상인데 통째로)" : ""} | ${k.picked ?? "—"}/${k.unpicked ?? "—"} | ${scope} | ${r.inspection.given ?? (r.inspection.exists ? "있음·안 줌" : "없음")} | ${k.bonus.inLayers + k.bonus.picked}/${r.bonusReasons.join("+") || "무관"} | ${k.layers.map((l) => l.refs).join("/")} | ${size} |`);
  }
  console.log(`\n글자 수(만 자). 기록: ${join(armDir, "dry.json")}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 실행(동시 N): 카드 × 기능 — 이미 있으면 건너뜀
mkdirSync(armDir, { recursive: true });
const progress = (line: string) => {
  const l = `${new Date().toISOString()} ${line}`;
  console.log(l);
  appendFileSync(join(armDir, "run.txt"), `${l}\n`);
};
const usage5 = (u: Usage) => ({ input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite, cacheWrite1h: u.cacheWrite1h });
const save = (file: string, rec: unknown) => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(rec, null, 1));
};

progress(`시작 · arm=${arm} · 코드 ${kind} · 할 일 ${tasks.length}건(이미 있음 ${tasks.filter((t) => existsSync(t.file)).length}) · 동시 ${concurrency} · KNOWLEDGE_SELECT=${settings.KNOWLEDGE_SELECT} · TRACKS=${settings.KNOWLEDGE_SELECT_TRACKS}${selectDir ? ` · ${settings.selectDir}` : ""}`);
let failed = 0;
await pool.runPool(tasks, concurrency, async (t, i) => {
  const name = `${arm}/${t.card.id}/${t.p.feature}`;
  const n = `${i + 1}/${tasks.length}`;
  if (existsSync(t.file)) return progress(`${n} 건너뜀(있음) ${name}`);
  const c = t.card;
  const rec = baseRecord(c, t.p);
  if (t.plan.kind === "skip") {
    save(t.file, { ...rec, skipped: t.plan.reason });
    return progress(`${n} 건너뜀(${t.plan.reason}) ${name}`);
  }
  if (t.plan.kind === "code") {
    save(t.file, { ...rec, model: "코드(AI 호출 없음)", codeResult: true, result: writer.noRequirementResult(c.followup!) });
    return progress(`${n} 코드 결과(${t.plan.reason}) ${name}`);
  }
  rec.request = requestSize(c, t.p);
  progress(`${n} 시작 ${name} · 요청 약 ${rec.request.total}자 · ${rec.knowledge!.method}${rec.knowledge!.picked !== null ? ` ${rec.knowledge!.picked}건` : ""}`);
  const t0 = Date.now();
  try {
    let done: AbRecord;
    if (isWriterFeature(t.p.feature)) {
      const call = await runMod.callWriter({ card: c.data, kb: t.p.kb, req: writerReq(c, t.p), files: c.files });
      const followup = t.p.feature === "followup" ? c.followup : null;
      // 인용 대조: 공통 지식 조각(선별 방식이어도 선별 전 원문 전부 — bundleRefs) + 첨부 전체 글(file:N), 서버와 같음
      const result = writer.verifyResult(call.result, c.data, [...bundle.bundleRefs(t.p.kb), ...mat.fileRefs(c.files)], followup);
      done = { ...rec, model: runMod.modelLabel(call), sec: (Date.now() - t0) / 1000, usage: usage5(call.usage), rawCounts: { suggestions: call.result.suggestions.length, citations: call.result.citations.length }, result };
    } else if (t.p.feature === "chat") {
      const call = await runMod.callChat({ card: c.data, kb: t.p.kb, req: chatReq(t.p), files: c.files });
      const answer = call.result.answer.trim();
      if (!answer) throw new Error("AI가 빈 답을 보냄(서버라면 오류)");
      done = { ...rec, model: runMod.modelLabel(call), sec: (Date.now() - t0) / 1000, usage: usage5(call.usage), result: { question: QUESTION, answer } };
    } else {
      const targets = patch.editTargets(c.data);
      const call = await runMod.callComments({ card: c.data, targets, kb: t.p.kb, req: commentReq(t.p), files: c.files });
      done = { ...rec, model: runMod.modelLabel(call), sec: (Date.now() - t0) / 1000, usage: usage5(call.usage), result: { comments: comments.verifyComments(call.result, c.data, targets, t.p.comments ?? []) } };
    }
    save(t.file, done);
    const u = done.usage!;
    progress(`${n} 끝 ${name} · ${Math.round(done.sec!)}초 · 입력 ${u.input}+캐시 읽기 ${u.cacheRead}·쓰기 ${u.cacheWrite}/출력 ${u.output}`);
  } catch (e) {
    failed++;
    const message = String(e instanceof Error ? e.message : e);
    save(t.fail, { ...rec, failedAt: new Date().toISOString(), sec: (Date.now() - t0) / 1000, error: message.slice(0, 2000) });
    progress(`${n} 실패 ${name}: ${message.slice(0, 300)}`);
  }
});
progress(`끝 · 실패 ${failed}/${tasks.length}`);
if (failed) process.exitCode = 1;
