// 주요사업 과제관리카드(한글 파일 — 묶음 하나 또는 묶음 여럿을 합친 파일)를 원장에 새 카드로 올립니다(원장을 비우고 새 판으로 채울 때).
//   pnpm db:cards-biz --file <경로> [--edition YYMMDD] [--team-override "주요사업3/1-가=팀 이름"]… [--dry-run | --write]
// 기본은 읽기만(--dry-run): 파일을 읽어 카드·원본 배치·그림·팀·평가단위를 계획해 보여 줍니다(DB는 select만).
// --write: ① 평가단위 BZ-N 확인(없으면 멈춤) ② 카드마다 그림(카드 그림 bizN-…·원본 배치 그림 hwp-… → 저장소 card-originals/{uid}/) ③ 카드 행.
//          이미 있는 카드(같은 id, 또는 같은 평가단위·과제번호 — 보관한 카드 포함)는 건드리지 않고 건너뜁니다.
// 읽기는 앱 현행화와 같은 함수(readCardFile — 카드마다 자기 앞의 가장 가까운 묶음 표지로 묶음, buildLayouts — 원본 배치),
// 새 카드 행은 현행화 「새 과제 등록」과 같은 규칙(registerTarget·renderCard)입니다. 앱 화면의 올리기 한도는 여기에 걸리지 않습니다(파일을 직접 읽음).
// 팀: 카드 「부서(팀)」의 팀 이름이 teams.name과 같아야 하고, 못 찾으면 멈춤 — 카드 글은 파일 그대로 두고 팀만 정할 때 --team-override(여러 번).
// 판(edition): 파일 이름의 여섯 자리 숫자(예: cards-261103-biz.hwp), 없으면 --edition.
// 그림 한 장이 저장소(card-originals) 파일 한도를 넘으면 그 그림만 흰 바탕 JPEG(픽셀 크기 그대로, 품질 90부터 9MB 안까지 낮춤)로 바꿔 올림 —
// 카드 JSON·원본 양식·원본 배치가 가리키는 이름(.png → .jpg)도 함께(2026-11-05 사용자 결정). 바꿔도 넘으면 쓰기 전에 멈춤.
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parse } from "kordoc";
import { checkEditable } from "../../lib/cards/edit.ts";
import { groupSlug } from "../../lib/cards/file-names.ts";
import { parseCardGroups } from "../../lib/cards/hwp/parse.ts";
import { jpegOnWhite } from "../../lib/cards/hwp/image.ts";
import { imageNames, mapImages, readCardFile } from "../../lib/cards/hwp/read.ts";
import { registerTarget } from "../../lib/cards/hwp/register.ts";
import { type BuiltLayout, CARD_ORIGINALS_FIT, CARD_ORIGINALS_MAX, type FittedImage, buildLayouts, fitLayoutImages } from "../../lib/cards/layout-build.ts";
import { renderLayoutCard } from "../../lib/cards/layout-render.ts";
import { isMgmtCard } from "../../lib/cards/mgmt-card.ts";
import { cardImageRefs } from "../../lib/cards/original-html.ts";
import { renderCard } from "../../lib/cards/render.ts";
import { readHwp5 } from "../../lib/hwp/hwp5.ts";
import { layoutImageKeys } from "../../lib/hwp/layout.ts";
import { readHwpx } from "../../lib/hwp/hwpx.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const arg = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const WRITE = has("--write");
const mb = (n: number) => `${(n / 1048576).toFixed(1)}MB`;

interface Prepared {
  index: number;
  id: string;
  group: string;
  unit: string;
  taskNo: string;
  title: string;
  teamName: string;
  data: LooseJson;
  html: string;
  layout: BuiltLayout | null;
  /** 카드 그림(카드 JSON이 가리키는 것): 저장 이름 → 바이트 */
  pictures: Map<string, { data: Uint8Array; mime: string }>;
}

async function main() {
  const fileArg = arg("--file");
  if (!fileArg) throw new Error("--file <한글 파일 경로>가 필요합니다");
  const file = resolve(fileArg);
  const edition = arg("--edition") ?? /(\d{6})/.exec(basename(file))?.[1] ?? "";
  if (!/^\d{6}$/.test(edition)) throw new Error("판(YYMMDD)을 파일 이름에서 못 읽었습니다 — --edition 261103처럼 주세요");
  const overrides = new Map<string, string>();
  args.forEach((a, i) => {
    if (a !== "--team-override") return;
    const v = args[i + 1] ?? "";
    const k = v.indexOf("=");
    if (k < 1 || !v.slice(k + 1).trim()) throw new Error(`--team-override는 "카드 id=팀 이름" 모양이어야 합니다: ${v}`);
    overrides.set(v.slice(0, k).trim(), v.slice(k + 1).trim());
  });

  // 1) 읽기 — 앱 현행화와 같은 함수
  const bytes = new Uint8Array(readFileSync(file));
  const read = await readCardFile(bytes, basename(file));
  if (read.cards.some(isMgmtCard)) throw new Error("경영관리 카드 파일입니다 — pnpm db:cards-mg로 올리세요");
  const cards = read.cards;
  console.log(`파일 ${basename(file)} (${mb(bytes.length)}, 판 ${edition}) · 카드 ${cards.length}장 · 읽지 않은 블록 ${read.ignored}개`);
  // 목차 대조(보고용): 같은 kordoc 글을 묶음별로 다시 읽음
  const md = await parse(Buffer.from(bytes));
  if (!md.success) throw new Error("한글 파일을 다시 읽지 못했습니다");
  for (const g of parseCardGroups(md.markdown, { sourceName: basename(file), fileType: read.fileType })) {
    const got = new Set(g.cards.map((c) => c.taskNo));
    const only = g.indexRows.map((r) => r.taskNo).filter((n) => !got.has(n));
    console.log(`  ${g.group.id} ${g.group.titleText ?? ""}: 카드 ${g.cards.length}장 · 목차 ${g.indexRows.length}개 · 목차에만 있는 과제 ${only.join(", ") || "없음"}`);
  }

  const problems: string[] = [];
  const notes: string[] = [];
  const warned = cards.filter((c) => c.parseWarnings?.length);
  console.log(`읽기 경고 있는 카드 ${warned.length}장(카드 글은 파일 그대로 올림)`);
  for (const c of warned) console.log(`  경고 ${c.id}: ${c.parseWarnings.join(" / ")}`);

  // 2) 원본 배치
  const doc = read.fileType === "hwp" ? readHwp5(bytes) : await readHwpx(bytes);
  const { built, skipped } = buildLayouts(doc, cards);
  // 저장소 한도를 넘는 그림만 흰 바탕 JPEG로(배치 그림은 이름·배치 참조까지 — fitLayoutImages)
  const fittedRows: Array<{ id: string; kind: string } & FittedImage> = [];
  for (const b of built) for (const f of fitLayoutImages(b)) fittedRows.push({ id: cards[b.index].id, kind: "배치", ...f });
  const layoutOf = new Map(built.map((b) => [b.index, b]));
  for (const s of skipped) notes.push(`배치 건너뜀 ${s}`);
  const rates = built.map((b) => b.stats.bound / (b.stats.targets || 1));
  const low = built.filter((b) => b.stats.bound / (b.stats.targets || 1) < 0.98).map((b) => `${cards[b.index].id} ${b.stats.bound}/${b.stats.targets}`);
  const layoutImages = built.flatMap((b) => b.images);
  console.log(
    `원본 배치 ${built.length}/${cards.length}장 · 잇기 적중률 ${rates.length ? `${Math.min(...rates).toFixed(3)}~${Math.max(...rates).toFixed(3)}` : "-"} · 0.98 미만 ${low.join(", ") || "없음"} · 배치 그림 ${layoutImages.length}개 ${mb(layoutImages.reduce((n, im) => n + im.data.length, 0))}`,
  );

  // 3) 카드 행 준비(현행화 「새 과제 등록」과 같은 식별 칸·원본 양식)
  const prepared: Prepared[] = [];
  const seenIds = new Set<string>();
  // 카드 그림(kordoc 이름 → 올릴 그림): 한도를 넘으면 흰 바탕 JPEG(이름 .jpg — 카드 JSON src·원본 양식이 그 이름을 가리킴)
  const fitted = new Map<string, { file: string; data: Uint8Array; mime: string }>();
  const pictureOf = (kordoc: string, id: string) => {
    const im = read.images.get(kordoc);
    if (!im || im.data.byteLength <= CARD_ORIGINALS_MAX) return im;
    if (!fitted.has(kordoc)) {
      const j = jpegOnWhite(im.data, im.file, CARD_ORIGINALS_FIT);
      fittedRows.push({ id, kind: "카드", from: im.file, to: j?.name ?? null, before: im.data.byteLength, after: j?.data.byteLength ?? null, quality: j?.quality ?? null });
      fitted.set(kordoc, j ? { file: j.name, data: j.data, mime: j.mime } : im);
    }
    return fitted.get(kordoc);
  };
  for (const [index, card] of cards.entries()) {
    const t = registerTarget(card, String(card.group ?? ""));
    if (!t.ok) {
      problems.push(`${card.id ?? `${index + 1}번째 카드`}: ${t.message}`);
      continue;
    }
    if (seenIds.has(t.id)) {
      problems.push(`${t.id}: 파일 안에 같은 과제가 두 번 있음`);
      continue;
    }
    seenIds.add(t.id);
    const folder = groupSlug(t.group);
    const pictures = new Map<string, { data: Uint8Array; mime: string }>();
    // 카드 그림: 저장 이름 bizN-{웹 이름}(lib/cards/original-html.ts — 원본 양식 조각이 ../images/bizN/{이름}으로 가리킴), kordoc 이름은 비교용 자리표시로 그대로
    const data = mapImages({ ...card, id: t.id, group: t.group, taskNo: t.taskNo }, (img) => {
      const im = pictureOf(img.kordoc, t.id);
      if (!im) return { src: null, kordoc: img.kordoc };
      pictures.set(`${folder}-${im.file}`, { data: im.data, mime: im.mime });
      return { src: `images/${folder}/${im.file}`, kordoc: img.kordoc };
    });
    const editable = checkEditable(data, data);
    if (editable) problems.push(`${t.id}: 저장 검증 실패(${editable})`);
    let html = "";
    try {
      html = renderCard(data);
    } catch (e) {
      problems.push(`${t.id}: 원본 양식으로 그리지 못함(${e instanceof Error ? e.message : e})`);
    }
    // 참조 = 올릴 그림(이름까지): 원본 양식(카드 JSON src)이 가리키는 이름·원본 배치가 가리키는 이름이 모두 올릴 그림에 있어야 함
    const refs = cardImageRefs(html).map((r) => r.objectName);
    if (refs.length !== pictures.size || refs.some((n) => !pictures.has(n))) problems.push(`${t.id}: 원본 양식이 가리키는 그림(${refs.join(", ")})과 올릴 카드 그림(${[...pictures.keys()].join(", ")})이 다름`);
    const missing = imageNames(card).filter((n) => !read.images.has(n));
    if (missing.length) notes.push(`${t.id}: 파일에 없는 그림 ${missing.length}개(자리만 둠)`);
    const layout = layoutOf.get(index) ?? null;
    const unbound = layout ? layoutImageKeys(layout.layout).filter((k) => !layout.images.some((im) => im.key === k)) : [];
    if (unbound.length) problems.push(`${t.id}: 원본 배치가 가리키는 그림 ${unbound.join(", ")}을(를) 올릴 그림에서 못 찾음`);
    if (layout)
      try {
        if (!renderLayoutCard(data, layout.layout)) notes.push(`${t.id}: 원본 배치로 그리지 못함(9.16 양식으로 보임)`);
      } catch (e) {
        problems.push(`${t.id}: 원본 배치 그리기 오류(${e instanceof Error ? e.message : e})`);
      }
    prepared.push({ index, id: t.id, group: t.group, unit: t.unit, taskNo: t.taskNo, title: t.title, teamName: overrides.get(t.id) ?? String(card.team ?? ""), data, html, layout, pictures });
  }
  for (const id of overrides.keys()) if (!seenIds.has(id)) problems.push(`--team-override ${id}: 파일에 없는 카드`);
  const pics = prepared.flatMap((p) => [...p.pictures.values()]);
  const biggest = Math.max(0, ...pics.map((p) => p.data.length), ...layoutImages.map((im) => im.data.length));
  const over = [
    ...prepared.flatMap((p) => [...p.pictures].map(([name, im]) => [`${p.id} 카드 그림 ${name}`, im.data.length] as const)),
    ...built.flatMap((b) => b.images.map((im) => [`${cards[b.index].id} 배치 그림 ${im.key}`, im.data.length] as const)),
  ].filter(([, n]) => n > CARD_ORIGINALS_MAX);
  for (const [label, n] of over) problems.push(`그림 한 장이 저장소 한도(${mb(CARD_ORIGINALS_MAX)})를 넘음(흰 바탕 JPEG로도 못 줄임): ${label} ${mb(n)}`);
  console.log(`카드 그림 ${pics.length}개 ${mb(pics.reduce((n, p) => n + p.data.length, 0))} · 가장 큰 그림 ${mb(biggest)}(저장소 한도 ${mb(CARD_ORIGINALS_MAX)})`);
  console.log(`한도를 넘어 흰 바탕 JPEG로 바꾼 그림 ${fittedRows.length}개${fittedRows.length ? ":" : ""}`);
  for (const f of fittedRows) console.log(`  ${f.id} ${f.kind} 그림 ${f.from} ${f.before.toLocaleString()}B → ${f.to ? `${f.to} ${f.after!.toLocaleString()}B(품질 ${f.quality})` : "못 바꿈"}`);
  const byGroup = new Map<string, number>();
  for (const p of prepared) byGroup.set(p.group, (byGroup.get(p.group) ?? 0) + 1);
  console.log(`사업별: ${[...byGroup].map(([g, n]) => `${g} ${n}장`).join(" · ")}`);

  // 4) DB 읽기(select만): 평가단위·팀·지금 원장
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다(.env.local)");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const must = <T,>(label: string, r: { data: unknown; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return (r.data ?? ([] as unknown)) as T;
  };
  const [units, teams, ledger] = await Promise.all([
    db.from("eval_units").select("id, card_group").then((r) => must<Array<{ id: string; card_group: string | null }>>("eval_units", r)),
    db.from("teams").select("id, name, hq").then((r) => must<Array<{ id: number; name: string; hq: string | null }>>("teams", r)),
    db.from("cards").select("id, eval_unit_id, task_no, status, edition").range(0, 9999).then((r) => must<Array<{ id: string; eval_unit_id: string; task_no: string; status: string; edition: string }>>("cards", r)),
  ]);
  for (const u of new Set(prepared.map((p) => p.unit))) {
    const row = units.find((x) => x.id === u);
    const group = prepared.find((p) => p.unit === u)!.group;
    if (!row) problems.push(`평가단위 ${u}(${group})가 없음 — 먼저 평가단위를 확인하세요`);
    else if (row.card_group !== group) problems.push(`평가단위 ${u}의 카드 묶음이 ${row.card_group}(카드는 ${group})`);
  }
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const teamCount = new Map<string, number>();
  for (const p of prepared) {
    const team = teamByName.get(p.teamName);
    if (!team) problems.push(`${p.id}: 팀 「${p.teamName}」을(를) teams에서 찾지 못함(--team-override "${p.id}=팀 이름")`);
    else if (team.hq && p.data.department && team.hq !== p.data.department) notes.push(`${p.id}: 카드 본부 ${p.data.department} ≠ 팀 ${team.name}의 본부 ${team.hq}`);
    const label = `${p.teamName}${overrides.has(p.id) ? `(지정 — 카드 글 「${p.data.team}」)` : ""}`;
    teamCount.set(label, (teamCount.get(label) ?? 0) + 1);
  }
  console.log(`팀별(${teamCount.size}팀): ${[...teamCount].map(([t, n]) => `${t} ${n}`).join(" · ")}`);
  const taken = (p: Prepared) => ledger.find((c) => c.id === p.id || (c.eval_unit_id === p.unit && c.task_no === p.taskNo));
  const fresh = prepared.filter((p) => !taken(p));
  const editions = new Map<string, number>();
  for (const c of prepared.map(taken)) {
    if (!c) continue;
    const label = c.status === "active" ? c.edition : `${c.edition}·${c.status}`;
    editions.set(label, (editions.get(label) ?? 0) + 1);
  }
  console.log(`계획(지금 원장 기준): 카드 새로 ${fresh.length}장 · 이미 있어 건너뜀 ${prepared.length - fresh.length}장${editions.size ? `(원장의 판 ${[...editions].map(([e, n]) => `${e} ${n}`).join(", ")})` : ""}`);
  console.log(`계획(원장을 비운 뒤라면): 카드 새로 ${prepared.length}장 · 카드 그림 ${pics.length}개 · 배치 그림 ${layoutImages.length}개`);

  console.log("\n카드별(id · 팀 · 경고 수 · 배치 잇기 · 카드 그림/배치 그림):");
  for (const p of prepared) {
    const b = p.layout;
    console.log(`  ${p.id} · ${p.teamName} · 경고 ${cards[p.index].parseWarnings?.length ?? 0} · ${b ? `${b.stats.bound}/${b.stats.targets}` : "배치 없음"} · ${p.pictures.size}/${b?.images.length ?? 0} · ${p.title.slice(0, 30)}`);
  }
  for (const n of notes) console.log(`  참고: ${n}`);
  if (problems.length) {
    for (const m of problems) console.log(`  문제: ${m}`);
    throw new Error(`쓰기 전에 멈출 문제 ${problems.length}건${WRITE ? " — 아무것도 쓰지 않았습니다" : ""}`);
  }
  if (!WRITE) {
    console.log("\n드라이런 — 쓰지 않았습니다. 반영하려면 --write");
    return;
  }

  // 5) 쓰기: 카드마다 그림 → 카드 행(파일 순서). 실패하면 거기서 멈추고 이미 넣은 카드는 그대로
  const created: Array<{ id: string; uid: string }> = [];
  for (const p of fresh) {
    const uid = randomUUID();
    const uploads = [...(p.layout?.images ?? []).map((im) => ({ name: im.key, data: im.data, mime: im.mime })), ...[...p.pictures].map(([name, im]) => ({ name, ...im }))];
    for (const im of uploads) {
      const { error } = await db.storage.from("card-originals").upload(`${uid}/${im.name}`, im.data, { upsert: true, contentType: im.mime });
      if (error) throw new Error(`그림 올리기 ${p.id} ${im.name}: ${error.message} (이미 넣은 카드 ${created.length}장은 그대로)`);
    }
    const row = {
      id: p.id,
      uid,
      eval_unit_id: p.unit,
      task_no: p.taskNo,
      title: p.title,
      team_id: teamByName.get(p.teamName)!.id,
      hq: p.data.department ?? null,
      edition,
      data: p.data,
      original_html: p.html,
      layout: p.layout?.layout ?? null,
    };
    const { error } = await db.from("cards").insert(row);
    if (error) throw new Error(`카드 넣기 ${p.id}: ${error.message} (이미 넣은 카드 ${created.length}장은 그대로)`);
    created.push({ id: p.id, uid });
    console.log(`  넣음 ${p.id} ${p.title.slice(0, 24)}`);
  }
  const dir = process.env.CLAUDE_JOB_DIR ? `${process.env.CLAUDE_JOB_DIR}/tmp` : join(ROOT, "data/cards", edition);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `biz-cards-created-${Date.now()}.json`);
  writeFileSync(out, JSON.stringify({ edition, file: basename(file), cards: created }, null, 1));
  console.log(`완료: 카드 ${created.length}장 · 되돌리기용 목록 ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
