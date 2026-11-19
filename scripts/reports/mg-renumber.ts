// 경영관리 평가내용 번호를 '26 편람(11.13 수정) 번호로 옮깁니다(2026-11-19 사용자 결정 D1 안 2·D2 — 상생 MG-7만 옛 2 → 3, 옛 3 → 4).
//   node --conditions=react-server --env-file-if-exists=.env.local scripts/reports/mg-renumber.ts [--unit MG-7] [--year 2026] [--write]
// 기본은 드라이런: 대상 행(과제별 초안의 구성안·초안, 목차·쪽 배정 행, 지표 단위 부분)과 바뀌는 절·글을 보여 주기만 합니다(DB 읽기만).
// --write: 바꾸기 전 원래 행 전부를 ~/pdca-backups/<YYMMDD>-mg-renumber/<지표>-<연도>.json에 남긴 뒤, 행마다 updated_at 조건으로 씁니다(그사이 바뀐 행은 건너뜀).
// 변환은 lib/reports/mg-renumber.ts(순수 — 2025 제목과 같은 평가내용만 동시 사상, 두 번 돌려도 같음). 판 기록(card_report_draft_versions)은 그대로 두고 되돌리기 때 같은 함수를 적용.
// 운영 순서: H1 편람 수정본 적재 → AI 일시 중지 → 배포 → 이 스크립트 드라이런 → 사용자 확인 → --write → AI 재개. 제출·승인된 MG-7 보고서가 있으면 그 팀 제출 취소 뒤에(트리거가 막음).
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadMgRenumberCtx } from "../../lib/reports/mg-queries.ts";
import { renumberDraftRow, renumberMap, renumberOutlineRow, renumberUnitPart } from "../../lib/reports/mg-renumber.ts";

const args = process.argv.slice(2);
const arg = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const WRITE = args.includes("--write");
const unit = arg("--unit") ?? "MG-7";
const year = Number(arg("--year") ?? new Date().getFullYear());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다(.env.local)");
  if (!renumberMap(unit).size) {
    console.log(`${unit}: 번호가 바뀌는 평가내용이 없습니다 — 할 일 없음`);
    return;
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ctx = await loadMgRenumberCtx(db, unit);
  if (!ctx || !ctx.titles2025.size) throw new Error(`${unit}: 2025 보고서 골격 조각(rpt25-mg)을 읽지 못해 제목 대조를 할 수 없습니다 — 중단`);
  console.log(`${unit} ${year} · 사상 ${[...renumberMap(unit)].map(([a, b]) => `${a}→${b}`).join(", ")} · ${WRITE ? "쓰기" : "드라이런(읽기만)"}`);
  for (const [n, t] of renumberMap(unit)) console.log(`  2025 평가내용 ${n} 「${ctx.titles2025.get(n) ?? "?"}」 → '26 평가내용 ${t} 「${ctx.titles26.get(t) ?? "?"}」`);

  const { data: cards, error: ce } = await db.from("cards").select("id, task_no").eq("eval_unit_id", unit);
  if (ce) throw new Error(`카드 읽기 실패: ${ce.message}`);
  const ids = (cards ?? []).map((c) => String(c.id));
  const taskOf = new Map((cards ?? []).map((c) => [String(c.id), String(c.task_no ?? "")]));
  const [drafts, outline, parts, reports] = await Promise.all([
    ids.length ? db.from("card_report_drafts").select("card_id, year, outline, spec, updated_at").eq("year", year).in("card_id", ids) : Promise.resolve({ data: [], error: null }),
    db.from("report_outline").select("card_id, year, section, subsection, updated_at").eq("year", year).eq("eval_unit_id", unit),
    db.from("eval_unit_report_parts").select("eval_unit_id, year, part, spec, updated_at").eq("year", year).eq("eval_unit_id", unit),
    db.from("reports").select("id, team_id, status").eq("year", year).eq("eval_unit_id", unit),
  ]);
  for (const [name, r] of [["card_report_drafts", drafts], ["report_outline", outline], ["eval_unit_report_parts", parts], ["reports", reports]] as const) if (r.error) throw new Error(`${name} 읽기 실패: ${r.error.message}`);
  const locked = (reports.data ?? []).filter((r) => r.status === "submitted" || r.status === "approved");
  if (locked.length) console.log(`  주의: 제출·승인된 보고서 ${locked.map((r) => `${r.id}(${r.status})`).join(", ")} — 그 팀 초안은 트리거가 쓰기를 막습니다(제출 취소 뒤 다시)`);

  type Change = { table: string; label: string; match: Record<string, unknown>; updatedAt: string; patch: Record<string, unknown>; before: Record<string, unknown>; detail: string[] };
  const changes: Change[] = [];
  const notes: string[] = [];
  for (const d of drafts.data ?? []) {
    const x = renumberDraftRow({ outline: d.outline, spec: d.spec }, ctx);
    notes.push(...x.notes.map((n) => `초안 ${taskOf.get(String(d.card_id))}: ${n}`));
    if (!x.changed) continue;
    const keys = (v: unknown) => ((v as { mg?: { parts?: Array<{ key: string }> } })?.mg?.parts ?? []).map((p) => p.key).join(" ");
    changes.push({
      table: "card_report_drafts",
      label: `초안 ${taskOf.get(String(d.card_id))}`,
      match: { card_id: d.card_id, year: d.year },
      updatedAt: String(d.updated_at),
      patch: { ...(x.outline ? { outline: x.outline } : {}), ...(x.spec ? { spec: x.spec } : {}) },
      before: { outline: d.outline, spec: d.spec },
      detail: [...(x.outline ? [`구성안 절 ${keys(d.outline)} → ${keys(x.outline)}`] : []), ...(x.spec ? [`초안 절 ${keys(d.spec)} → ${keys(x.spec)}`] : [])],
    });
  }
  for (const o of outline.data ?? []) {
    const x = renumberOutlineRow(o, ctx);
    notes.push(...x.notes.map((n) => `목차 ${taskOf.get(String(o.card_id))}: ${n}`));
    if (!x.changed) continue;
    changes.push({ table: "report_outline", label: `목차 ${taskOf.get(String(o.card_id))}`, match: { card_id: o.card_id, year: o.year }, updatedAt: String(o.updated_at), patch: { section: x.section, subsection: x.subsection }, before: { section: o.section, subsection: o.subsection }, detail: [`「${o.section}」${o.subsection ? ` / 「${o.subsection}」` : ""} → 「${x.section}」${x.subsection ? ` / 「${x.subsection}」` : ""}`] });
  }
  for (const p of parts.data ?? []) {
    const x = renumberUnitPart(p.spec, ctx);
    notes.push(...x.notes.map((n) => `지표 단위 ${p.part}: ${n}`));
    if (!x.changed) continue;
    changes.push({ table: "eval_unit_report_parts", label: `지표 단위 ${p.part}`, match: { eval_unit_id: p.eval_unit_id, year: p.year, part: p.part }, updatedAt: String(p.updated_at), patch: { spec: x.value }, before: { spec: p.spec }, detail: [`평가내용 행 ${x.changed}개`] });
  }

  console.log(`\n대상: 초안 ${(drafts.data ?? []).length}행 · 목차 ${(outline.data ?? []).length}행 · 지표 단위 ${(parts.data ?? []).length}행 중 바뀌는 행 ${changes.length}개`);
  for (const c of changes) console.log(`  [${c.table}] ${c.label}: ${c.detail.join(" · ")}`);
  for (const n of notes) console.log(`  확인: ${n}`);
  if (!WRITE) {
    console.log("\n드라이런 — 쓰지 않았습니다. 확인 뒤 --write로 다시 실행하세요.");
    return;
  }
  if (!changes.length) return;
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const dir = join(homedir(), "pdca-backups", `${stamp}-mg-renumber`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${unit}-${year}.json`);
  writeFileSync(file, JSON.stringify({ unit, year, at: new Date().toISOString(), rows: changes.map((c) => ({ table: c.table, match: c.match, updated_at: c.updatedAt, before: c.before })) }, null, 1));
  console.log(`\n백업: ${file}`);
  let ok = 0;
  for (const c of changes) {
    let q = db.from(c.table).update(c.patch).eq("updated_at", c.updatedAt);
    for (const [k, v] of Object.entries(c.match)) q = q.eq(k, v as never);
    const { data, error } = await q.select("updated_at");
    if (error) console.log(`  실패 [${c.table}] ${c.label}: ${error.message}`);
    else if (!data?.length) console.log(`  건너뜀 [${c.table}] ${c.label}: 그사이 바뀜(updated_at 다름) — 다시 드라이런`);
    else ok += 1;
  }
  console.log(`썼습니다: ${ok}/${changes.length}행`);
  if (ok !== changes.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
