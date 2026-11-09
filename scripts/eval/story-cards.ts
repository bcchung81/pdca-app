// 주요사업 카드별 이야기 틀 후보 분포(읽기 전용 — 운영 DB를 select로만 읽고 쓰지 않음, AI 호출 없음, 2026-11-09 경평 초안 프레임워크 확장 계획 P1-2).
// 서버 구성안(run.ts reportOutlineAsk → section.ts storyHintsOf)과 같은 입력으로 틀 후보를 뽑음: 카드 + 평가 근거(loadLens) + 올해 실적(yearActuals) + 카드 전용 자료(ready만).
// 틀 신호는 전년 절을 보지 않으므로(storyHintsOf) 2025 같은 과제 절(pickPrior)은 읽지 않음. 보고서 추가자료(같은 사업·부서·연도)는 사람이 연결한 것만 숫자 근거라 여기서는 넣지 않음.
// 출력: 틀별 1순위 장수(카드 단독 — 형제 초안 없음) · 3후보 안 장수 · 일괄(같은 주요사업 안에서 과제 순서대로 앞 카드 1순위를 형제로) 장수 + 쓰인 틀 수·최다·상위 3틀 합.
// 카드 제목·본문 같은 기관 자료는 --detail일 때만 화면에 찍음(파일로 남기지 않음 — 저장소·시험에 기관 자료를 넣지 않음).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/story-cards.ts [--detail]
import { createClient } from "@supabase/supabase-js";
import { MATERIAL_COLS, type MaterialRow, materialState } from "../../lib/ai/material-text.ts";
import { compareUnitId } from "../../lib/cards/view.ts";
import { isoDay } from "../../lib/format.ts";
import { yearActuals } from "../../lib/reports/actuals.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import { type ReportFile, storyHintsOf } from "../../lib/reports/section.ts";
import { MAIN_STORIES, type StoryHint } from "../../lib/reports/story-hints.ts";

const detail = process.argv.includes("--detail");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SECRET_KEY가 없음 — --env-file=.env.local로 실행합니다.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

interface Row {
  id: string;
  eval_unit_id: string;
  task_no: string;
  data: Record<string, unknown>;
}
const { data, error } = await db.from("cards").select("id, eval_unit_id, task_no, data").eq("status", "active").not("eval_unit_id", "like", "MG-%");
if (error) throw new Error(error.message);
const cards = (data as Row[]).sort((a, b) => compareUnitId(a.eval_unit_id, b.eval_unit_id) || a.task_no.localeCompare(b.task_no, "ko", { numeric: true }));

const today = isoDay();
const year = Number(today.slice(0, 4));
interface Item {
  card: Row;
  files: ReportFile[];
  lens: Awaited<ReturnType<typeof loadLens>>;
  alone: StoryHint[];
  batch: string;
}
const items: Item[] = [];
for (const card of cards) {
  const { data: mats, error: e } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id);
  if (e) throw new Error(e.message);
  const files: ReportFile[] = ((mats ?? []) as unknown as MaterialRow[])
    .filter((r) => materialState(r) === "ready")
    .map((r) => ({ name: r.file_name, text: r.parsed_text ?? "" }));
  const lens = await loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
  const alone = storyHintsOf(card.data, files, lens, yearActuals(card.data, today), year);
  items.push({ card, files, lens, alone, batch: "" });
}
// 일괄: 같은 주요사업 안에서 과제 순서대로 — 앞 카드들의 1순위를 형제 초안의 주 틀로
const picked = new Map<string, string[]>();
for (const it of items) {
  const sibs = picked.get(it.card.eval_unit_id) ?? [];
  const top = storyHintsOf(it.card.data, it.files, it.lens, yearActuals(it.card.data, today), year, sibs)[0]?.story ?? "";
  it.batch = top;
  if (top) picked.set(it.card.eval_unit_id, [...sibs, top]);
}

const NONE = "(후보 없음)";
const tally = (pick: (it: Item) => string[]) => {
  const m = new Map<string, number>();
  for (const it of items) for (const s of pick(it)) m.set(s, (m.get(s) ?? 0) + 1);
  return m;
};
const t1 = tally((it) => [it.alone[0]?.story ?? NONE]);
const t3 = tally((it) => it.alone.map((h) => h.story));
const tb = tally((it) => [it.batch || NONE]);
const no = (i: number) => String.fromCodePoint(0x2460 + i);
console.log(`주요사업 활성 카드 ${items.length}장 · 첨부(ready) 있는 카드 ${items.filter((x) => x.files.length).length}장 · 기준일 ${today}`);
console.log("| 틀 | 1순위 | 3후보 안 | 일괄 |\n|---|---:|---:|---:|");
MAIN_STORIES.forEach((s, i) => console.log(`| ${no(i)} ${s} | ${t1.get(s) ?? "·"} | ${t3.get(s) ?? "·"} | ${tb.get(s) ?? "·"} |`));
console.log(`| ${NONE} | ${t1.get(NONE) ?? "·"} | ${items.filter((x) => !x.alone.length).length || "·"} | ${tb.get(NONE) ?? "·"} |`);
const summary = (m: Map<string, number>) => {
  const v = [...m.entries()].filter(([k]) => k !== NONE).map(([, n]) => n).sort((a, b) => b - a);
  return { used: v.length, max: v[0] ?? 0, top3: v.slice(0, 3).reduce((a, b) => a + b, 0) };
};
const a = summary(t1);
const b = summary(tb);
console.log(`\n1순위로 쓰인 틀: 단독 ${a.used}종 · 일괄 ${b.used}종`);
console.log(`가장 많은 틀: 단독 ${a.max}장 · 일괄 ${b.max}장`);
console.log(`상위 3틀 합: 단독 ${a.top3}장 · 일괄 ${b.top3}장`);
const missing = MAIN_STORIES.filter((s) => !t3.has(s));
console.log(`3후보에 한 번도 안 나온 틀: ${missing.length ? missing.join("·") : "없음"}`);

if (detail) {
  console.log("\n카드별(기관 자료 — 화면에서만 보고 파일로 남기지 않음)");
  for (const it of items) {
    const title = String(it.card.data.title ?? "").slice(0, 40);
    console.log(`- ${it.card.eval_unit_id} ${it.card.task_no} ${title} | 일괄 ${it.batch || NONE}`);
    for (const h of it.alone) console.log(`    ${h.score}점 ${h.story} — ${h.why}`);
  }
}
