// 경평 초안 사업 단위 조판 어림(수동 실행 전용 — 호스티드 DB는 읽기만, AI 안 씀). 주요사업마다 목차·쪽 배정(report_outline)과
// 과제별 초안(card_report_drafts)을 읽어 lib/reports/business-layout.ts로 쪽을 나누고 조판 쪽 수·검사를 찍습니다.
// --drafts <평가 라운드 폴더 …>: 호스티드에 초안이 없는 카드를 평가 라운드 초안(drafts/*.html.json, 커밋 안 함)으로 채워 봄(흉내 — DB에 쓰지 않음).
// --html <폴더>: 사업마다 쪽 보기 HTML 한 파일(<폴더>/<평가단위>.html — 화면 「사업 조판」과 같은 sheetHtml·CSS·자간 맞춤)을 씀(개발 서버 없이 확인용).
// 실행: node --env-file=.env.local scripts/eval/business-layout.ts [--year 2026] [--drafts docs/analysis/eval/2026-09-27-L …] [--pages] [--html <폴더>]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BUSINESS_CSS, sheetHtml } from "../../lib/reports/business-html.ts";
import { type BusinessItem, layoutBusiness, sheetsOf } from "../../lib/reports/business-layout.ts";
import { fitTextLines } from "../../lib/reports/fit-dom.ts";
import { REPORT_CSS } from "../../lib/reports/section-css.ts";
import { type ReportSectionSpec, readSection } from "../../lib/reports/section.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const year = Number(opt("--year") ?? 2026);
const showPages = args.includes("--pages");
const htmlDir = opt("--html");
if (htmlDir) mkdirSync(htmlDir, { recursive: true });
const draftDirs: string[] = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--drafts") for (let j = i + 1; j < args.length && !args[j].startsWith("--"); j++) draftDirs.push(args[j]);

// 평가 라운드 초안: 카드 id → spec(뒤 폴더가 앞을 덮음)
const sim = new Map<string, ReportSectionSpec>();
for (const dir of draftDirs) {
  const d = join(dir, "drafts");
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((x) => x.endsWith(".html.json"))) {
    const spec = readSection(JSON.parse(readFileSync(join(d, f), "utf8")));
    if (spec) sim.set(spec.card.id, spec);
  }
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const [{ data: units, error: e0 }, { data: rows, error: e1 }, { data: drafts, error: e2 }] = await Promise.all([
  db.from("eval_units").select("id, name, card_group").eq("track", "주요사업").not("card_group", "is", null).order("sort").order("id"),
  db.from("report_outline").select("card_id, eval_unit_id, section, subsection, sort, pages, included, card:cards!inner(uid, task_no, title, data_rev, status)").eq("year", year).eq("card.status", "active").order("sort"),
  db.from("card_report_drafts").select("card_id, spec, unknown_numbers, source_rev").eq("year", year).not("spec", "is", null),
]);
if (e0 || e1 || e2) throw new Error(`읽기 실패: ${(e0 ?? e1 ?? e2)?.message}`);
/** 이 도구가 읽는 select 행(lib/reports/unit-layout-queries.ts loadBusinessItems와 같은 모양, 평가단위 열만 더함) */
interface LayoutDraftDbRow {
  card_id: string;
  spec: unknown;
  unknown_numbers: string[] | null;
  source_rev: number | null;
}
interface LayoutCardJoin {
  uid: string;
  task_no: string;
  title: string;
  data_rev: number | null;
}
interface LayoutOutlineDbRow {
  card_id: string;
  eval_unit_id: string;
  section: string;
  subsection: string | null;
  sort: number | string;
  pages: number | string;
  included: boolean | null;
  card: LayoutCardJoin | LayoutCardJoin[];
}
const draftOf = new Map(((drafts ?? []) as LayoutDraftDbRow[]).map((d) => [d.card_id, d]));
const first = <X,>(v: X | X[]): X => (Array.isArray(v) ? v[0] : v);

console.log(`${year}년 · 호스티드 초안 ${drafts?.length ?? 0}건${sim.size ? ` · 평가 라운드 초안 ${sim.size}건으로 빈 곳 채움(흉내)` : ""}`);
for (const u of units ?? []) {
  const items: BusinessItem[] = ((rows ?? []) as LayoutOutlineDbRow[])
    .filter((r) => r.eval_unit_id === u.id)
    .map((r) => {
      const c = first(r.card);
      const d = draftOf.get(r.card_id);
      const spec = readSection(d?.spec) ?? sim.get(r.card_id) ?? null;
      return {
        cardId: r.card_id,
        uid: c.uid,
        taskNo: c.task_no,
        title: c.title,
        section: r.section,
        subsection: r.subsection,
        sort: Number(r.sort),
        pages: Number(r.pages),
        included: Boolean(r.included),
        spec,
        unknownNumbers: d?.unknown_numbers ?? [],
        sourceRev: d ? (d.source_rev ?? null) : null,
        dataRev: c.data_rev ?? null,
      };
    });
  const l = layoutBusiness(items);
  const s = l.summary;
  const c = l.checks;
  console.log(
    `\n${u.card_group} ${u.name}: 과제 ${s.total}(뺀 과제 ${s.excluded}) · 배정 합 ${s.assigned}쪽(${s.assignedState}) → 조판 ${s.laid}쪽(${s.state}, 예산 ${s.budget.target}±${s.budget.tolerance}) · 빈 자리 합 ${Math.round(s.blank)}mm · 초안 ${s.drafted}/${s.total}`,
  );
  // 실행과제별: 배정 합 → 쪽 수
  const tasks = new Map<string, { pages: number; from: number; to: number; n: number }>();
  for (const x of l.sections) {
    const k = `${x.section} / ${x.subsection ?? "-"}`;
    const t = tasks.get(k) ?? { pages: 0, from: x.startPage, to: x.endPage, n: 0 };
    t.pages += x.pages;
    t.to = x.endPage;
    t.n += 1;
    tasks.set(k, t);
  }
  for (const [k, t] of tasks) console.log(`  ${k} — 소항목 ${t.n} · 배정 ${t.pages}쪽 · 조판 ${t.to - t.from + 1}쪽(${t.from}~${t.to})`);
  console.log(
    `  검사: 같은 문장 ${c.sameSentenceCount}쌍 · 같은 짜임 ${c.sameLayouts.length}묶음 · 이야기 틀 ${c.stories.map((x) => `${x.story} ${x.taskNos.length}`).join(", ") || "-"} · 초안 없음 ${c.missing.length} · 다시 만들기 권장 ${c.stale.length} · 어림 없음 ${c.unestimated.length}`,
  );
  for (const p of c.sameSentences.slice(0, 5)) console.log(`    ${p.a.taskNo} 「${p.a.text}」 ≈ ${p.b.taskNo} 「${p.b.text}」 ${p.score}`);
  for (const g of c.sameLayouts) console.log(`    같은 짜임 ${g.taskNos.join("·")}: ${g.signature}`);
  for (const x of l.sections.filter((y) => y.fit && y.fit !== "ok")) console.log(`    ${x.taskNo} ${x.fit === "over" ? "넘침" : "모자람"} ${x.delta > 0 ? "+" : ""}${x.delta}mm(조판 ${x.height}mm · 배정 ${x.pages}쪽 · 머리 ${x.head} · ${x.source})`);
  if (htmlDir) {
    const sheets = sheetsOf(l.pages).map((sh) => `<section class="wrap">${sheetHtml(sh, l)}</section>`).join("\n");
    const file = join(htmlDir, `${u.id}.html`);
    writeFileSync(
      file,
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${u.card_group} 사업 조판</title><style>body{margin:0;background:#e9eae9;padding:24px 16px}.wrap{display:flex;justify-content:center;margin:0 0 16px}${REPORT_CSS}${BUSINESS_CSS}</style></head><body>${sheets}<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { (${fitTextLines.toString()})(document); });</script></body></html>`,
    );
    console.log(`  HTML: ${file}`);
  }
  if (showPages) for (const p of l.pages) console.log(`    ${p.no}쪽 ${Math.round(p.fill * 100)}%${p.over ? ` 넘침 +${p.over}mm` : ""}: ${p.pieces.map((x) => `${x.taskNo}${x.cont ? "(이어짐)" : ""}[${x.head}${x.more ? "→" : ""}] ${x.height}mm`).join(" · ")}`);
}
