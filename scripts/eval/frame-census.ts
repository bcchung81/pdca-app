// 경평 초안 짜임 다양성 집계(읽기 전용 — 운영 DB를 select로만 읽고 쓰지 않음, AI 호출 없음, 2026-11-10 T1 「프레임워크 다양성」).
// 두 갈래를 한 번에 셈:
//  ① 저장된 초안(card_report_drafts, 그 해): 트랙별 주 틀·보조 틀 분포, 상위 3 점유, 엔트로피, 구성 패턴(frame.pattern) 사용, 블록 모양(kind:variant) 분포
//     (전체 + 시각 블록만 — 글·띠 블록(PLAIN_KINDS)과 경영관리 닫는 「추진성과」 수치 행을 뺌, 2026-11-10 2단계) · 여는 블록 분포 · 같은 평가단위 다른 카드와 여는 모양이 같은 카드 수,
//     1순위 추종률(카드마다 서버와 같은 입력으로 틀 후보를 다시 뽑아 AI가 고른 틀의 순위 — 형제 = 같은 평가단위 앞 과제가 실제로 쓴 틀)
//  ② 지금 코드의 추천 분포(--dry와 같음, 비용 0): 카드 단독 1순위 · 일괄(같은 평가단위 안 과제 순서대로 앞 카드 1순위를 형제로) 1순위 · 3후보 안 · 후보 없는 카드,
//     신호가 있는데(3후보에 나오는데) 1순위로 한 번도 안 뽑히는 틀
// 주요사업 틀 후보 = section.ts storyHintsOf(서버 run.ts reportOutlineAsk와 같은 입력), 경영관리 = story-hints-mg.ts mgStoryHintsOf(서버 mgStoryHintsFor와 같은 입력 — 추천 평가내용 defaultEvals).
// 카드 제목·본문 같은 기관 자료는 찍지 않음(평가단위·과제번호·틀 이름만). 결과 JSON은 --json <파일>(git 밖 docs/analysis/ 아래에 둠).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/frame-census.ts [--year 2026] [--json <파일>] [--recommend-only]
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { MATERIAL_COLS, type MaterialRow, materialState } from "../../lib/ai/material-text.ts";
import { compareUnitId } from "../../lib/cards/view.ts";
import { isoDay } from "../../lib/format.ts";
import { yearActuals } from "../../lib/reports/actuals.ts";
import { PLAIN_KINDS } from "../../lib/reports/diagram-hints.ts";
import { kindStats } from "../../lib/reports/eval-stats.ts";
import { MG_MAIN_STORIES } from "../../lib/reports/frameworks-mg.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { defaultEvals } from "../../lib/reports/mg-outline.ts";
import { loadMgPrior } from "../../lib/reports/mg-queries.ts";
import type { MgPriorSection } from "../../lib/reports/mg-outline.ts";
import { type ReportFile, storyHintsOf } from "../../lib/reports/section.ts";
import { MAIN_STORIES } from "../../lib/reports/story-hints.ts";
import { mgStoryHintsOf } from "../../lib/reports/story-hints-mg.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const year = Number(opt("--year") ?? isoDay().slice(0, 4));
const jsonOut = opt("--json");
const recommendOnly = args.includes("--recommend-only");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SECRET_KEY가 없음 — --env-file=.env.local로 실행합니다.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const today = isoDay();

type Json = Record<string, unknown>;
interface CardRow {
  id: string;
  eval_unit_id: string;
  task_no: string;
  data: Json;
}
interface Hint {
  story: string;
  score: number;
}
interface Item {
  card: CardRow;
  mg: boolean;
  files: ReportFile[];
  /** 틀 후보를 다시 뽑는 함수(형제 주 틀 목록 → 후보) */
  hintsWith: (siblings: string[]) => Hint[];
}

const { data: cardData, error } = await db.from("cards").select("id, eval_unit_id, task_no, data").eq("status", "active");
if (error) throw new Error(error.message);
const cards = (cardData as CardRow[]).sort((a, b) => compareUnitId(a.eval_unit_id, b.eval_unit_id) || a.task_no.localeCompare(b.task_no, "ko", { numeric: true }));

const priorCache = new Map<string, MgPriorSection[]>();
const items: Item[] = [];
for (const card of cards) {
  const mg = card.eval_unit_id.startsWith("MG-");
  const { data: mats, error: e } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id);
  if (e) throw new Error(e.message);
  const files: ReportFile[] = ((mats ?? []) as unknown as MaterialRow[]).filter((r) => materialState(r) === "ready").map((r) => ({ name: r.file_name, text: r.parsed_text ?? "" }));
  if (!mg) {
    const lens = await loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
    const actuals = yearActuals(card.data, today);
    items.push({ card, mg, files, hintsWith: (sib) => storyHintsOf(card.data, files, lens, actuals, year, sib) });
    continue;
  }
  if (!priorCache.has(card.eval_unit_id)) priorCache.set(card.eval_unit_id, await loadMgPrior(db, card.eval_unit_id));
  const prior = priorCache.get(card.eval_unit_id)!;
  const ctx = { prior, evals: defaultEvals(String(card.data.taskNo ?? ""), prior) };
  items.push({ card, mg, files, hintsWith: (sib) => mgStoryHintsOf({ card: card.data, ctx, files, siblingStories: sib }) });
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const count = (xs: string[]) => {
  const m: Record<string, number> = {};
  for (const x of xs) m[x] = (m[x] ?? 0) + 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};
/** 분포 요약: 쓰인 종 수·최다·상위 3 점유·엔트로피(비트) */
const summary = (dist: Record<string, number>) => {
  const v = Object.values(dist).sort((a, b) => b - a);
  const total = v.reduce((a, b) => a + b, 0);
  const top3 = v.slice(0, 3).reduce((a, b) => a + b, 0);
  return { total, used: v.length, max: v[0] ?? 0, top3, top3Share: total ? round3(top3 / total) : 0, entropyBits: kindStats([Object.entries(dist).flatMap(([k, n]) => Array(n).fill(k) as string[])]).entropyBits };
};

// ② 지금 코드의 추천 분포
function recommend(track: "biz" | "mg") {
  const list = items.filter((x) => x.mg === (track === "mg"));
  const all = track === "mg" ? [...MG_MAIN_STORIES] : [...MAIN_STORIES];
  const alone = list.map((x) => x.hintsWith([]));
  const picked = new Map<string, string[]>();
  const batch = list.map((x) => {
    const sib = picked.get(x.card.eval_unit_id) ?? [];
    const top = x.hintsWith(sib)[0]?.story ?? "";
    if (top) picked.set(x.card.eval_unit_id, [...sib, top]);
    return top;
  });
  const top1Alone = count(alone.map((h) => h[0]?.story).filter((s): s is string => !!s));
  const top1Batch = count(batch.filter(Boolean));
  const inThree = count(alone.flatMap((h) => h.map((x) => x.story)));
  const signalNoTop1 = all.filter((s) => inThree[s] && !top1Batch[s] && !top1Alone[s]);
  return {
    cards: list.length,
    withFiles: list.filter((x) => x.files.length).length,
    noHint: alone.filter((h) => !h.length).length,
    top1Alone,
    top1Batch,
    inThree,
    aloneSummary: summary(top1Alone),
    batchSummary: summary(top1Batch),
    neverCandidate: all.filter((s) => !inThree[s]),
    signalNoTop1,
    perCard: list.map((x, i) => ({ unit: x.card.eval_unit_id, task: x.card.task_no, alone: alone[i].map((h) => `${h.story}(${h.score})`), batch: batch[i] })),
  };
}

// ① 저장된 초안
async function saved() {
  const { data, error: e } = await db.from("card_report_drafts").select("card_id, outline, spec").eq("year", year);
  if (e) throw new Error(e.message);
  const byCard = new Map(((data ?? []) as Array<{ card_id: string; outline: Json | null; spec: Json | null }>).map((d) => [d.card_id, d]));
  /** 블록 모양(kind:variant)과 시각 블록 여부(글·띠 블록, 경영관리 닫는 「추진성과」 수치 행은 시각 블록이 아님 — 2025 양식이 정한 자리) */
  const shapesOf = (s: Json | null, o: Json | null) =>
    (((s?.blocks ?? o?.blocks) as Array<{ kind: string; variant?: string; label?: string }> | undefined) ?? []).map((b) => ({
      key: b.variant ? `${b.kind}:${b.variant}` : b.kind,
      visual: !PLAIN_KINDS.has(b.kind) && !(b.kind === "stats" && b.label === "추진성과"),
    }));
  // 주요사업
  const biz = items.filter((x) => !x.mg);
  const sib = new Map<string, string[]>();
  const bizRows = biz.flatMap((x) => {
    const d = byCard.get(x.card.id);
    if (!d?.outline && !d?.spec) return [];
    const o = d.outline ?? {};
    const story = String(d.spec?.story || o.story || "");
    const sub = String(o.subStory || "");
    const siblings = sib.get(x.card.eval_unit_id) ?? [];
    const hints = x.hintsWith(siblings);
    if (story) sib.set(x.card.eval_unit_id, [...siblings, story]);
    const frame = (o.frame ?? {}) as Json;
    return [{ unit: x.card.eval_unit_id, task: x.card.task_no, story, sub, rank: hints.findIndex((h) => h.story === story) + 1, cands: hints.map((h) => h.story), pattern: String(frame.pattern ?? ""), shapes: shapesOf(d.spec, d.outline), hasSpec: !!d.spec }];
  });
  // 경영관리(절 단위)
  const mgs = items.filter((x) => x.mg);
  const msib = new Map<string, string[]>();
  const mgRows = mgs.flatMap((x) => {
    const d = byCard.get(x.card.id);
    if (!d?.outline && !d?.spec) return [];
    const parts = ((((d.outline ?? {}).mg as Json | undefined)?.parts as Array<{ key: string; story?: string; subStory?: string; frame?: Json }> | undefined) ?? []).map((p) => ({ key: p.key, story: p.story ?? "", sub: p.subStory ?? "", pattern: String(p.frame?.pattern ?? "") }));
    const siblings = msib.get(x.card.eval_unit_id) ?? [];
    const hints = x.hintsWith(siblings);
    msib.set(x.card.eval_unit_id, [...siblings, ...parts.map((p) => p.story)]);
    return [{ unit: x.card.eval_unit_id, task: x.card.task_no, parts, cands: hints.map((h) => h.story), rankFirst: hints.findIndex((h) => h.story === parts[0]?.story) + 1, shapes: shapesOf(d.spec, d.outline), hasSpec: !!d.spec }];
  });
  const bizMain = count(bizRows.map((r) => r.story).filter(Boolean));
  const mgMain = count(mgRows.flatMap((r) => r.parts.map((p) => p.story)).filter(Boolean));
  const mgCardMain = count(mgRows.flatMap((r) => [...new Set(r.parts.map((p) => p.story))]).filter(Boolean));
  const follow = {
    biz: {
      rows: bizRows.length,
      rank1: bizRows.filter((r) => r.rank === 1).length,
      rank23: bizRows.filter((r) => r.rank > 1).length,
      outside: bizRows.filter((r) => r.rank === 0 && r.cands.length).length,
      noHint: bizRows.filter((r) => !r.cands.length).length,
      outsideStories: count(bizRows.filter((r) => r.rank === 0).map((r) => r.story)),
    },
    mg: {
      cards: mgRows.length,
      parts: mgRows.reduce((n, r) => n + r.parts.length, 0),
      partsInCands: mgRows.reduce((n, r) => n + r.parts.filter((p) => r.cands.includes(p.story)).length, 0),
      firstPartRank1: mgRows.filter((r) => r.rankFirst === 1).length,
      cardsWithTop1Used: mgRows.filter((r) => r.cands[0] && r.parts.some((p) => p.story === r.cands[0])).length,
      cardsWithCands: mgRows.filter((r) => r.cands.length).length,
      noHint: mgRows.filter((r) => !r.cands.length).length,
    },
  };
  const shapes = (rows: Array<{ unit: string; shapes: Array<{ key: string; visual: boolean }> }>) => {
    const stat = (lists: string[][]) => {
      const k = kindStats(lists);
      return { blocks: lists.flat().length, distinct: Object.keys(k.frequency).length, top3Share: k.top3Share, entropyBits: k.entropyBits, frequency: k.frequency };
    };
    const openers = rows.map((r) => r.shapes[0]?.key ?? "");
    // 같은 평가단위의 다른 카드와 여는 모양이 같은 카드 수
    const sameOpener = rows.filter((r, i) => openers[i] && rows.some((o, j) => j !== i && o.unit === r.unit && openers[j] === openers[i])).length;
    return { ...stat(rows.map((r) => r.shapes.map((x) => x.key))), visual: stat(rows.map((r) => r.shapes.filter((x) => x.visual).map((x) => x.key))), openers: count(openers.filter(Boolean)), sameOpener };
  };
  return {
    biz: { main: bizMain, sub: count(bizRows.map((r) => r.sub).filter(Boolean)), summary: summary(bizMain), unused: MAIN_STORIES.filter((s) => !bizMain[s]), patterns: count(bizRows.map((r) => r.pattern || "(없음)")), shapes: shapes(bizRows) },
    mg: { partMain: mgMain, cardMain: mgCardMain, sub: count(mgRows.flatMap((r) => r.parts.map((p) => p.sub)).filter(Boolean)), summary: summary(mgMain), unused: MG_MAIN_STORIES.filter((s) => !mgMain[s]), patterns: count(mgRows.flatMap((r) => r.parts.map((p) => p.pattern || "(없음)"))), shapes: shapes(mgRows) },
    follow,
    // 카드별 줄(모양 목록은 위 분포로 충분해 뺌)
    rows: { biz: bizRows.map((r) => ({ ...r, shapes: undefined })), mg: mgRows.map((r) => ({ ...r, shapes: undefined })) },
  };
}

const rec = { biz: recommend("biz"), mg: recommend("mg") };
const sv = recommendOnly ? null : await saved();

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const line = (s: ReturnType<typeof summary>) => `쓰인 ${s.used}종 · 최다 ${s.max} · 상위3 ${s.top3}/${s.total}(${pct(s.top3, s.total)}) · 엔트로피 ${s.entropyBits}비트`;
console.log(`기준일 ${today} · 연도 ${year}`);
for (const t of ["biz", "mg"] as const) {
  const r = rec[t];
  const name = t === "biz" ? "주요사업" : "경영관리";
  console.log(`\n## 추천 분포(지금 코드) — ${name} ${r.cards}장(첨부 있는 카드 ${r.withFiles}, 후보 없는 카드 ${r.noHint})`);
  console.log(`- 단독 1순위: ${line(r.aloneSummary)}`);
  console.log(`- 일괄 1순위: ${line(r.batchSummary)}`);
  console.log(`- 3후보에 한 번도 안 나온 틀: ${r.neverCandidate.join("·") || "없음"}`);
  console.log(`- 3후보에는 나오는데 1순위(단독·일괄) 0인 틀: ${r.signalNoTop1.join("·") || "없음"}`);
  const all = t === "mg" ? MG_MAIN_STORIES : MAIN_STORIES;
  console.log("| 틀 | 단독 1순위 | 일괄 1순위 | 3후보 안 |\n|---|---:|---:|---:|");
  for (const s of all) console.log(`| ${s} | ${r.top1Alone[s] ?? "·"} | ${r.top1Batch[s] ?? "·"} | ${r.inThree[s] ?? "·"} |`);
}
if (sv) {
  console.log(`\n## 저장된 초안(${year}) — 주요사업 ${sv.follow.biz.rows}장 · 경영관리 ${sv.follow.mg.cards}장(절 ${sv.follow.mg.parts})`);
  console.log(`- 주요사업 주 틀: ${line(sv.biz.summary)} · 안 쓰인 틀 ${sv.biz.unused.join("·") || "없음"}`);
  console.log(`- 경영관리 절 주 틀: ${line(sv.mg.summary)} · 안 쓰인 틀 ${sv.mg.unused.join("·") || "없음"}`);
  const f = sv.follow;
  console.log(`- 주요사업 1순위 추종: 1순위 ${f.biz.rank1} · 2~3순위 ${f.biz.rank23} · 후보 밖 ${f.biz.outside} · 후보 없음 ${f.biz.noHint} (1순위 ${pct(f.biz.rank1, f.biz.rows)}) · 후보 밖 고른 틀 ${JSON.stringify(f.biz.outsideStories)}`);
  console.log(`- 경영관리: 절 주 틀이 카드 후보 안 ${f.mg.partsInCands}/${f.mg.parts}(${pct(f.mg.partsInCands, f.mg.parts)}) · 후보 있는 카드 ${f.mg.cardsWithCands}장 중 1순위 틀을 어느 절에든 쓴 카드 ${f.mg.cardsWithTop1Used} · 후보 없는 카드 ${f.mg.noHint}`);
  console.log(`- 구성 패턴 사용: 주요사업 ${JSON.stringify(sv.biz.patterns)} · 경영관리 ${JSON.stringify(sv.mg.patterns)}`);
  for (const t of ["biz", "mg"] as const) {
    const s = sv[t].shapes;
    console.log(`- 블록 모양(${t === "biz" ? "주요사업" : "경영관리"}): 블록 ${s.blocks} · 서로 다른 모양 ${s.distinct} · 상위3 ${Math.round(s.top3Share * 100)}% · 엔트로피 ${s.entropyBits}비트 · 상위 8 ${JSON.stringify(Object.entries(s.frequency).slice(0, 8))}`);
    console.log(`  시각 블록만: ${s.visual.blocks} · 서로 다른 모양 ${s.visual.distinct} · 상위3 ${Math.round(s.visual.top3Share * 100)}% · 엔트로피 ${s.visual.entropyBits}비트 · 상위 8 ${JSON.stringify(Object.entries(s.visual.frequency).slice(0, 8))}`);
    console.log(`  여는 블록: ${JSON.stringify(Object.entries(s.openers).slice(0, 6))} · 같은 평가단위 다른 카드와 여는 모양이 같은 카드 ${s.sameOpener}`);
  }
  console.log("\n| 주요사업 틀 | 주 틀 | 보조 틀 |\n|---|---:|---:|");
  for (const s of MAIN_STORIES) console.log(`| ${s} | ${sv.biz.main[s] ?? "·"} | ${sv.biz.sub[s] ?? "·"} |`);
  console.log("\n| 경영관리 틀 | 주 틀 절 | 주 틀 쓴 과제 | 보조 틀 절 |\n|---|---:|---:|---:|");
  for (const s of MG_MAIN_STORIES) console.log(`| ${s} | ${sv.mg.partMain[s] ?? "·"} | ${sv.mg.cardMain[s] ?? "·"} | ${sv.mg.sub[s] ?? "·"} |`);
}
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ today, year, recommend: rec, saved: sv }, null, 1));
  console.log(`\nJSON: ${jsonOut}`);
}
