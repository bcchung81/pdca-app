// 경영관리 과제관리카드(한글 파일)를 원장에 올립니다(현행화 — 경영관리 원장은 비어 있으므로 모두 새 카드).
//   pnpm db:cards-mg [--file <경로>] [--dry-run | --write]
// 기본은 읽기만(--dry-run): 파일을 읽고 카드·원본 배치·팀·평가단위를 계획해 보여 줍니다(DB는 읽기만).
// --write: ① 평가단위 MG-1~14 ② 없는 팀 ③ 원본 배치 그림(저장소 card-originals) ④ 카드를 차례로 넣음. 이미 있는 카드(id)는 건드리지 않고 건너뜁니다.
// 파일: 기본 data/cards/260904/cards-260904-mg.hwp(HWP·HWPX). 카드 id = 경영관리N/N-M, 평가단위 = 지표 MG-N.
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "kordoc";
import { buildLayouts } from "../../lib/cards/layout-build.ts";
import { parseMgmtMarkdown } from "../../lib/cards/hwp/parse-mgmt.ts";
import { renderMgmtCard } from "../../lib/cards/render-mgmt.ts";
import { readHwp5 } from "../../lib/hwp/hwp5.ts";
import { readHwpx } from "../../lib/hwp/hwpx.ts";
import { MGMT_INDICATORS } from "../../lib/tracks/mgmt-units.ts";


const ROOT = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const arg = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const WRITE = has("--write");
const file = resolve(arg("--file") ?? `${ROOT}/data/cards/260904/cards-260904-mg.hwp`);
const edition = /(\d{6})/.exec(basename(file))?.[1] ?? "260904";

async function main() {
  const bytes = readFileSync(file);
  const ext = file.toLowerCase().endsWith(".hwpx") ? "hwpx" : "hwp";
  const res = await parse(Buffer.from(bytes));
  if (!res.success) throw new Error(`한글 파일을 읽지 못했습니다(${res.error ?? res.code})`);
  const parsed = parseMgmtMarkdown(res.markdown, { sourceName: basename(file), fileType: ext });
  const warned = parsed.cards.filter((c) => c.parseWarnings.length);
  const declared = parsed.index.flatMap((e) => e.tasks.map((t) => t.no));
  const got = new Set(parsed.cards.map((c) => c.taskNo));
  console.log(`파일 ${basename(file)} (${(bytes.length / 1024).toFixed(0)}KB) · 카드 ${parsed.cards.length}장 · 목차 ${declared.length}개 · 경고 있는 카드 ${warned.length}장`);
  console.log(`  목차에는 있고 파일에 카드가 없는 과제: ${declared.filter((n) => !got.has(n)).join(", ") || "없음"}`);
  if (parsed.skipped) throw new Error(`과제번호를 못 읽은 카드 표 ${parsed.skipped}개 — 중단`);
  if (warned.length) throw new Error(`읽기 경고가 있는 카드 ${warned.map((c) => c.taskNo).join(", ")} — 중단`);

  const doc = ext === "hwp" ? readHwp5(new Uint8Array(bytes)) : await readHwpx(new Uint8Array(bytes));
  const { built, skipped } = buildLayouts(doc, parsed.cards);
  for (const s of skipped) console.log(`  배치 건너뜀: ${s}`);
  const layoutOf = new Map(built.map((b) => [b.index, b]));
  const rates = built.map((b) => b.stats.bound / (b.stats.targets || 1));
  console.log(`원본 배치 ${built.length}/${parsed.cards.length}장 · 잇기 적중률 ${Math.min(...rates).toFixed(3)}~${Math.max(...rates).toFixed(3)} · 그림 ${built.reduce((n, b) => n + b.images.length, 0)}개`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다(.env.local)");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const must = <T,>(label: string, r: { data: unknown; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return (r.data ?? ([] as unknown)) as T;
  };
  interface UnitRow {
    id: string;
    track: string;
    card_group: string | null;
  }
  interface TeamRow {
    id: number;
    name: string;
    hq: string | null;
  }

  const [units, teams, cards] = await Promise.all([
    db.from("eval_units").select("id, track, card_group").then((r) => must<UnitRow[]>("eval_units", r)),
    db.from("teams").select("id, name, hq").then((r) => must<TeamRow[]>("teams", r)),
    db.from("cards").select("id").then((r) => must<Array<{ id: string }>>("cards", r)),
  ]);
  const haveUnits = new Set(units.map((u) => u.id));
  const needUnits = MGMT_INDICATORS.filter((i) => !haveUnits.has(i.id));
  const clash = MGMT_INDICATORS.filter((i) => units.some((u) => u.card_group === i.group && u.id !== i.id));
  if (clash.length) throw new Error(`카드 묶음 이름이 이미 다른 평가단위에 있음: ${clash.map((c) => c.group).join(", ")}`);
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const wantTeams = new Map<string, string>();
  for (const c of parsed.cards) for (const o of [{ department: c.department, team: c.team }, ...c.partners]) if (o.team && !teamByName.has(o.team)) wantTeams.set(o.team, o.department);
  const haveCards = new Set(cards.map((c) => c.id));
  const newCards = parsed.cards.filter((c) => !haveCards.has(c.id));
  console.log(`계획: 평가단위 추가 ${needUnits.length}개 · 팀 추가 ${wantTeams.size}개(${[...wantTeams].map(([n, h]) => `${n}←${h}`).join(", ")}) · 카드 새로 ${newCards.length}장 · 이미 있어 건너뜀 ${parsed.cards.length - newCards.length}장`);
  const missingUnit = newCards.filter((c) => !MGMT_INDICATORS.some((i) => i.no === c.indicatorNo));
  if (missingUnit.length) throw new Error(`지표 번호가 14개 밖인 카드: ${missingUnit.map((c) => c.id).join(", ")}`);
  if (!WRITE) {
    console.log("\n드라이런 — 쓰지 않았습니다. 반영하려면 --write");
    return;
  }

  // 1) 평가단위 2) 팀 3) 그림 4) 카드
  if (needUnits.length) must("eval_units 추가", await db.from("eval_units").insert(needUnits.map((i) => ({ id: i.id, track: "경영관리", card_group: i.group, name: i.name, sort: i.no }))).select("id"));
  if (wantTeams.size) {
    const added = must<TeamRow[]>("teams 추가", await db.from("teams").insert([...wantTeams].map(([name, hq]) => ({ name, hq }))).select("id, name, hq"));
    for (const t of added) teamByName.set(t.name, t);
  }
  const created: Array<{ id: string; uid: string }> = [];
  for (const [i, c] of parsed.cards.entries()) {
    if (haveCards.has(c.id)) continue;
    const b = layoutOf.get(i);
    const uid = randomUUID();
    for (const im of b?.images ?? []) {
      const { error } = await db.storage.from("card-originals").upload(`${uid}/${im.key}`, im.data, { upsert: true, contentType: im.mime });
      if (error) throw new Error(`그림 올리기 ${c.id} ${im.key}: ${error.message} (이미 넣은 카드 ${created.length}장은 그대로)`);
    }
    const row = {
      id: c.id,
      uid,
      eval_unit_id: `MG-${c.indicatorNo}`,
      task_no: c.taskNo,
      title: c.title,
      team_id: teamByName.get(c.team)?.id ?? null,
      hq: c.department,
      edition,
      data: c,
      original_html: renderMgmtCard(c),
      layout: b?.layout ?? null,
    };
    const { error } = await db.from("cards").insert(row);
    if (error) throw new Error(`카드 넣기 ${c.id}: ${error.message} (이미 넣은 카드 ${created.length}장은 그대로)`);
    created.push({ id: c.id, uid });
    console.log(`  넣음 ${c.id} ${c.title.slice(0, 24)}`);
  }
  const out = resolve(process.env.CLAUDE_JOB_DIR ? `${process.env.CLAUDE_JOB_DIR}/tmp` : ROOT, `mgmt-cards-created-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify({ edition, units: needUnits.map((u) => u.id), teams: [...wantTeams.keys()], cards: created }, null, 1));
  console.log(`완료: 카드 ${created.length}장 · 되돌리기용 목록 ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
