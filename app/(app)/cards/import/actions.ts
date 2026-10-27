"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "../../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../../lib/auth/preview.ts";
import { checkEditable, recomputeDerived } from "../../../../lib/cards/edit.ts";
import { isMgmtCard } from "../../../../lib/cards/mgmt-card.ts";
import { CARD_FILE_MAX, CardFileError, cardFileExt, mapImages, imageNames, readCardFile } from "../../../../lib/cards/hwp/read.ts";
import { registerTarget } from "../../../../lib/cards/hwp/register.ts";
import { ALL_BLOCK_KEYS, BLOCK_LABEL, type BlockKey, type LedgerRef, type MatchResult, applySync, blockValue, matchCard, planSync } from "../../../../lib/cards/hwp/sync.ts";
import { openVersion, withFixedFrom } from "../../../../lib/cards/versions.ts";
import { renderCard } from "../../../../lib/cards/render.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { latestVersion } from "../../../../lib/cards/versions.ts";
import { cardImageRefs } from "../../../../lib/cards/original-html.ts";
import { type BuiltLayout, buildLayouts } from "../../../../lib/cards/layout-build.ts";
import { readHwp5 } from "../../../../lib/hwp/hwp5.ts";
import { readHwpx } from "../../../../lib/hwp/hwpx.ts";
import { type CardLayout, layoutImageKeys } from "../../../../lib/hwp/layout.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { prepCardAdded, prepCardChanged } from "../../../../lib/prep/triggers.ts";
import type { LooseJson } from "../../../../lib/loose-json.ts";
import { SKIP_REASON_MAX } from "../../../../lib/cards/limits.ts";

// 과제관리카드 현행화(성과관리팀 종합점검 지침 14 <현행화모드>):
// 한글 파일 올리기 → kordoc으로 읽어 카드 JSON → 원장 과제와 매칭 → (화면) 블록별 비교 → 승인한 것만 반영.
// 원장 반영은 성과관리팀·관리자, 부서는 자기 카드 작성본에만 반영합니다.


type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ImportFileMeta {
  n: number;
  name: string;
  type: string;
  bytes: number;
  path: string;
  cards?: number;
  group?: string | null;
  error?: string;
  note?: string;
}

/** loadItem이 읽는 현행화 항목 한 줄(parsed = 파일에서 읽은 카드 JSON — 칸이 많아 넓은 모양 그대로) */
interface LoadedImportItem {
  id: number;
  import_id: number;
  file_n: number;
  parsed: LooseJson;
  layout: CardLayout | null;
  match: "exact" | "uncertain" | "none";
  card_id: string | null;
  candidates: string[];
  new_uid: string;
  status: string;
  imp: { id: number; scope: "ledger" | "draft"; files: ImportFileMeta[] | null } | null;
}

export interface ImportDecision {
  itemId: number;
  /** 불확실 매칭에서 고른 카드(후보 중 하나) */
  cardId?: string | null;
  blocks: BlockKey[];
  removals: BlockKey[];
}

export type ItemOutcome = { itemId: number; ok: boolean; message: string };

const MAX_FILES = 20;
const BLOCK_KEYS = ALL_BLOCK_KEYS;
const cleanKeys = (v: unknown): BlockKey[] => (Array.isArray(v) ? (v.filter((k) => BLOCK_KEYS.has(k)) as BlockKey[]) : []);

/** 파일 이름의 (YYMMDD)를 판(版)으로, 없으면 오늘(서울) */
function editionOf(fileName: string): string {
  const m = /\((\d{6})\)/.exec(fileName);
  if (m) return m[1];
  const d = new Date(Date.now() + 9 * 3600_000).toISOString();
  return `${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}`;
}

/**
 * 1단계: 올릴 파일 알리기 → 묶음을 만들고 파일마다 저장소 직접 업로드 주소를 받음(함수 본문 한도와 무관).
 * cardUid를 주면 그 카드 하나만 대상(부서는 자기 카드 작성본, 성과관리팀은 그 카드 원장).
 */
export async function startCardImport(input: { files: Array<{ name: string; size: number }>; cardUid?: string }): Promise<{ ok: true; importId: number; uploads: Array<{ n: number; path: string; token: string }> } | { ok: false; message: string }> {
  const me = await requireUser("/cards/import");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const staff = me.role !== "dept_user";
  const files = Array.isArray(input?.files) ? input.files : [];
  if (!files.length) return { ok: false, message: "올릴 한글 파일을 골라 주세요." };
  if (!staff && !input.cardUid) return { ok: false, message: "원장 현행화는 성과관리팀·관리자가 합니다. 자기 과제는 카드에서 「한글 파일로 작성본 채우기」를 써 주세요." };
  if (files.length > (input.cardUid ? 1 : MAX_FILES)) return { ok: false, message: input.cardUid ? "카드 하나에는 파일 하나만 올립니다." : `한 번에 ${MAX_FILES}개까지 올릴 수 있습니다.` };
  for (const f of files) {
    if (!cardFileExt(String(f.name))) return { ok: false, message: `「${f.name}」: 한글 파일(HWP·HWPX)만 올릴 수 있습니다. PDF는 카드 양식을 되살릴 수 없어 받지 않습니다.` };
    if (!(Number(f.size) > 0) || Number(f.size) > CARD_FILE_MAX) return { ok: false, message: `「${f.name}」: 30MB 이하 파일만 올릴 수 있습니다.` };
  }
  const supabase = await createClient();
  let targetId: string | null = null;
  if (input.cardUid) {
    const { data: card } = await supabase.from("cards").select("id, team_id, status").eq("uid", input.cardUid).maybeSingle();
    if (!card || card.status !== "active") return { ok: false, message: "카드를 찾을 수 없습니다." };
    if (!staff && (me.team?.id ?? -1) !== card.team_id) return { ok: false, message: "자기 부서 과제만 채울 수 있습니다." };
    targetId = card.id;
  }
  // 파일 이름은 NFC로(macOS는 자모를 나눈 NFD로 줄 때가 있음 — 화면·검색에서 같은 글자로 보이게)
  const meta: ImportFileMeta[] = files.map((f, i) => ({ n: i + 1, name: String(f.name).normalize("NFC").slice(0, 200), type: cardFileExt(String(f.name))!, bytes: Number(f.size), path: "" }));
  const { data: imp, error } = await supabase
    .from("card_imports")
    .insert({ scope: staff ? "ledger" : "draft", target_card_id: targetId, files: meta, created_by: me.id })
    .select("id")
    .single();
  if (error || !imp) return { ok: false, message: "현행화를 시작하지 못했습니다." };
  const uploads: Array<{ n: number; path: string; token: string }> = [];
  for (const f of meta) {
    f.path = `${imp.id}/${f.n}.${f.type}`;
    const { data: signed, error: e } = await supabase.storage.from("card-imports").createSignedUploadUrl(f.path);
    if (e || !signed) return { ok: false, message: "올리기 주소를 만들지 못했습니다." };
    uploads.push({ n: f.n, path: f.path, token: signed.token });
  }
  await supabase.from("card_imports").update({ files: meta }).eq("id", imp.id);
  return { ok: true, importId: imp.id as number, uploads };
}

/**
 * 2단계: 올린 파일을 읽어 카드마다 원장과 매칭하고, 카드에 쓰인 그림을 저장소에 올린 뒤 항목으로 남깁니다.
 * 확정 매칭은 그 카드 폴더에, 나머지는 항목마다 새 폴더(new_uid)에 그림을 둡니다(반영·등록 때 옮김).
 */
export async function parseCardImport(importId: number): Promise<{ ok: boolean; message?: string }> {
  const me = await requireUser("/cards/import");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const staff = me.role !== "dept_user";
  const supabase = await createClient();
  const { data: imp } = await supabase.from("card_imports").select("id, scope, target_card_id, files, status").eq("id", importId).maybeSingle();
  if (!imp) return { ok: false, message: "현행화 묶음을 찾을 수 없습니다." };
  if (imp.status !== "uploading") return { ok: true };
  const { data: rows } = await supabase.from("cards").select("id, uid, task_no, title, grp:data->>group, data, fixed_locked_at").eq("status", "active");
  const cards = (rows ?? []) as Array<{ id: string; uid: string; task_no: string; title: string; grp: string; data: LooseJson; fixed_locked_at: string | null }>;
  const dataOf = new Map(cards.map((r) => [r.id, r]));
  const ref = (r: (typeof cards)[number]): LedgerRef => ({ id: r.id, group: r.grp, taskNo: r.task_no, title: r.title });
  const uidOf = new Map(cards.map((r) => [r.id, r.uid]));
  const target = imp.target_card_id ? cards.find((r) => r.id === imp.target_card_id) : null;
  if (imp.target_card_id && !target) return { ok: false, message: "대상 카드를 찾을 수 없습니다." };

  const files = (imp.files ?? []) as ImportFileMeta[];
  const items: Array<Record<string, unknown>> = [];
  for (const f of files) {
    const { data: blob, error } = await supabase.storage.from("card-imports").download(f.path);
    if (error || !blob) {
      f.error = "올린 파일을 찾지 못했습니다(올리기가 끝나기 전에 창을 닫았을 수 있음).";
      continue;
    }
    let read;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    try {
      read = await readCardFile(bytes, f.name);
    } catch (e) {
      f.error = e instanceof CardFileError ? e.message : "파일을 읽지 못했습니다.";
      continue;
    }
    // 원본 배치(HWP·HWPX): 카드마다 표·줄 배치·글자 모양을 떼어 둠 — 반영하면 카드 화면·내려받기가 이 파일 모양 그대로. 못 떼도 현행화는 그대로
    const layouts = new Map<number, BuiltLayout>();
    if (read.fileType === "hwp" || read.fileType === "hwpx")
      try {
        const doc = read.fileType === "hwp" ? readHwp5(bytes) : await readHwpx(bytes);
        for (const b of buildLayouts(doc, read.cards).built) layouts.set(b.index, b);
      } catch (e) {
        console.error("import layout", e instanceof Error ? e.message : e);
      }
    f.cards = read.cards.length;
    f.group = /^주요사업\d+$/.test(read.group.id) ? read.group.id : null;
    let seq = 0;
    let others = 0;
    for (const [ci, card] of read.cards.entries()) {
      // 묶음: 주요사업 파일은 파일 하나가 한 사업(f.group), 경영관리 파일은 카드마다 지표 묶음(카드의 group)
      const cardGroup: string | null = isMgmtCard(card) ? card.group : f.group;
      let m: MatchResult = matchCard({ group: cardGroup, taskNo: card.taskNo, title: card.title }, target ? [ref(target)] : cards.map(ref));
      if (target && m.kind === "none") {
        if (read.cards.length > 1) {
          others += 1;
          continue;
        }
        m = { kind: "uncertain", cardId: target.id, candidates: [target.id], reason: `파일의 과제(${card.taskNo ?? "번호 없음"} ${card.title ?? ""})가 이 카드와 다름 — 같은 과제가 맞는지 확인` };
      }
      seq += 1;
      const folder = m.kind === "exact" || target ? uidOf.get(m.cardId ?? target!.id)! : crypto.randomUUID();
      // 그림: 확정 매칭은 바뀐 블록에 든 것만(원본을 다시 올리면 0건), 그 밖(불확실·미존재)은 모두 — 반영·등록 때 쓰임
      const ledgerRow = m.kind === "exact" && m.cardId ? dataOf.get(m.cardId) : null;
      const wanted = ledgerRow
        ? planSync(ledgerRow.data, card, { locked: Boolean(ledgerRow.fixed_locked_at) })
            .blocks.filter((b) => b.status !== "same")
            .flatMap((b) => imageNames(blockValue(card, b.key)))
        : imageNames(card);
      // 저장 이름은 웹용으로 바꾼 파일 이름(BMP → PNG·JPEG), 카드 JSON의 kordoc 이름은 그대로(비교용)
      const uploaded = new Map<string, string>();
      for (const name of new Set(wanted)) {
        const img = read.images.get(name);
        if (!img) continue;
        const { error: upErr } = await supabase.storage.from("card-originals").upload(`${folder}/imp${imp.id}-${img.file}`, img.data, { contentType: img.mime, upsert: staff });
        if (!upErr || /exist/i.test(upErr.message)) uploaded.set(name, img.file);
      }
      const parsed = mapImages(card, (img) => ({ src: uploaded.has(img.kordoc) ? `images/imp${imp.id}/${uploaded.get(img.kordoc)}` : null, kordoc: img.kordoc }));
      // 원본 배치 그림: 같은 폴더에 내용 해시 이름으로 — 이미 있는 그림(같은 내용)은 올리지 않음
      const built = layouts.get(ci);
      let layoutOk = Boolean(built);
      if (built?.images.length) {
        const { data: listed } = await supabase.storage.from("card-originals").list(folder, { limit: 1000 });
        const have = new Set((listed ?? []).map((o) => o.name));
        for (const im of built.images) {
          if (have.has(im.key)) continue;
          const { error: upErr } = await supabase.storage.from("card-originals").upload(`${folder}/${im.key}`, im.data, { contentType: im.mime, upsert: staff });
          if (upErr && !/exist/i.test(upErr.message)) layoutOk = false;
        }
      }
      items.push({
        import_id: imp.id,
        file_n: f.n,
        seq,
        task_no: card.taskNo ?? null,
        title: card.title ?? null,
        group_id: cardGroup,
        parsed,
        match: m.kind,
        match_reason: m.reason,
        card_id: m.cardId,
        candidates: m.candidates,
        new_uid: folder,
        layout: layoutOk && built ? built.layout : null,
      });
    }
    if (others) f.note = `이 카드가 아닌 과제 ${others}장은 건너뜀`;
  }
  for (let i = 0; i < items.length; i += 20) {
    const { error } = await supabase.from("card_import_items").insert(items.slice(i, i + 20));
    if (error) {
      console.error("parseCardImport items", error.message);
      return { ok: false, message: "읽은 카드를 저장하지 못했습니다." };
    }
  }
  await supabase.from("card_imports").update({ files, status: "parsed" }).eq("id", imp.id);
  revalidatePath("/cards/import");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 원장 반영(성과관리팀·관리자)

async function loadItem(supabase: Supabase, importId: number, itemId: number): Promise<LoadedImportItem | null> {
  const { data } = await supabase
    .from("card_import_items")
    .select("id, import_id, file_n, parsed, layout, match, card_id, candidates, new_uid, status, imp:card_imports(id, scope, files)")
    .eq("id", itemId)
    .eq("import_id", importId)
    .maybeSingle();
  return data as LoadedImportItem | null;
}

const fileNameOf = (item: LoadedImportItem) => ((item.imp?.files ?? []) as ImportFileMeta[]).find((f) => f.n === item.file_n)?.name ?? "한글 파일";

/** 현행화 그림(원본 배치 그림 포함)을 대상 카드 폴더로(확정 매칭이 아니었던 항목) */
async function moveImages(supabase: Supabase, card: LooseJson, importId: number, fromUid: string, toUid: string, layout?: CardLayout | null) {
  if (fromUid === toUid) return;
  const prefix = `../images/imp${importId}/`;
  const names = cardImageRefs(renderCard(card))
    .filter((r) => r.src.startsWith(prefix))
    .map((r) => r.objectName);
  for (const name of [...names, ...layoutImageKeys(layout)]) {
    const { error } = await supabase.storage.from("card-originals").copy(`${fromUid}/${name}`, `${toUid}/${name}`);
    if (error && !/exist/i.test(error.message)) console.error("import image copy", error.message);
  }
}

async function applyToLedger(supabase: Supabase, me: { id: string }, item: LoadedImportItem, decision: ImportDecision): Promise<ItemOutcome> {
  const fail = (message: string): ItemOutcome => ({ itemId: item.id, ok: false, message });
  if (item.status !== "pending") return fail("이미 처리한 항목입니다.");
  if (item.match === "none") return fail("원장에 없는 과제입니다(새 과제로 등록하거나 건너뛰기).");
  const cardId = decision.cardId ?? item.card_id;
  if (!cardId || !(item.candidates as string[]).includes(cardId)) return fail("반영할 카드를 골라 주세요.");
  const { data: row } = await supabase.from("cards").select("id, uid, data, data_rev, fixed_locked_at, team_id, status").eq("id", cardId).maybeSingle();
  if (!row || row.status !== "active") return fail("카드를 찾을 수 없습니다(보관됐을 수 있음).");
  const fileName = fileNameOf(item);
  const { card: merged, applied } = applySync(row.data, item.parsed, { blocks: cleanKeys(decision.blocks), removals: cleanKeys(decision.removals) }, { locked: Boolean(row.fixed_locked_at), fileName });
  if (!applied.length) {
    await supabase.from("card_import_items").update({ status: "skipped", card_id: cardId, result: { reason: "반영할 변경 없음" }, decided_by: me.id, decided_at: new Date().toISOString() }).eq("id", item.id);
    return { itemId: item.id, ok: true, message: "바뀐 것이 없어 건너뜀" };
  }
  const after = recomputeDerived(merged);
  const problem = checkEditable(row.data, after);
  if (problem) return fail(problem);
  let html = "";
  try {
    html = renderCard(after);
  } catch {
    return fail("원본 양식으로 그리지 못했습니다.");
  }
  await moveImages(supabase, after, item.import_id, item.new_uid, row.uid, item.layout);
  const patch: Record<string, unknown> = { data: after, title: String(after.title).trim(), original_html: html, data_rev: row.data_rev + 1, updated_by: me.id, edition: editionOf(fileName) };
  // 원본 배치: 이 파일 모양으로(HWP에서 뗀 경우만 — HWPX는 전 배치 그대로)
  if (item.layout) patch.layout = item.layout;
  if (applied.includes("basic")) {
    patch.hq = after.department ?? null;
    if (after.team && after.team !== row.data?.team) {
      const { data: team } = await supabase.from("teams").select("id").eq("name", after.team).maybeSingle();
      if (team) patch.team_id = team.id;
    }
  }
  const { data: updated, error } = await supabase.from("cards").update(patch).eq("id", row.id).eq("data_rev", row.data_rev).select("id, data_rev");
  if (error || !updated?.length) return fail(error ? "원장에 반영하지 못했습니다." : "그사이 원장이 바뀌었습니다. 화면을 새로 고쳐 다시 비교해 주세요.");
  const labels = applied.map((k) => BLOCK_LABEL[k]).join("·");
  const { error: logError } = await supabase.from("card_edits").insert({ card_id: row.id, edited_by: me.id, before: row.data, after, summary: `현행화: ${fileName} (${labels})` });
  if (logError) console.error("import history", logError.message);
  await prepCardChanged(supabase, me.id, row.id, row.data, after);
  await supabase
    .from("card_import_items")
    .update({ status: "applied", card_id: row.id, result: { blocks: applied, removals: cleanKeys(decision.removals), rev: updated[0].data_rev }, decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", item.id);
  return { itemId: item.id, ok: true, message: `반영함(${labels})` };
}

/** 고른 항목을 승인한 블록대로 원장에 반영(건별 승인) */
export async function applyImportItems(importId: number, decisions: ImportDecision[]): Promise<{ ok: boolean; message?: string; results: ItemOutcome[] }> {
  const me = await requireRole(["pmo", "admin"], "/cards/import");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 원장에 반영할 수 있습니다.", results: [] };
  const supabase = await createClient();
  const results: ItemOutcome[] = [];
  for (const d of (decisions ?? []).slice(0, 100)) {
    const item = await loadItem(supabase, importId, Number(d.itemId));
    if (!item || item.imp?.scope !== "ledger") {
      results.push({ itemId: Number(d.itemId), ok: false, message: "항목을 찾을 수 없습니다." });
      continue;
    }
    results.push(await applyToLedger(supabase, me, item, d));
  }
  revalidatePath("/cards");
  revalidatePath(`/cards/import/${importId}`);
  return { ok: results.every((r) => r.ok), results };
}

/**
 * 「전체 반영」: 확정 매칭이고 위험 트리거가 없는 항목만 기본 블록(변경·추가)으로 반영하고, 바뀐 것이 없는 항목은 건너뜀.
 * 위험 항목은 그대로 두어 건별 승인을 받습니다(지침 14 [4단계]).
 */
export async function applySafeImportItems(importId: number): Promise<{ ok: boolean; message: string; results: ItemOutcome[] }> {
  const me = await requireRole(["pmo", "admin"], "/cards/import");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 원장에 반영할 수 있습니다.", results: [] };
  const supabase = await createClient();
  const { data: list } = await supabase.from("card_import_items").select("id").eq("import_id", importId).eq("status", "pending").eq("match", "exact").order("file_n").order("seq");
  const results: ItemOutcome[] = [];
  let held = 0;
  for (const { id } of list ?? []) {
    const item = await loadItem(supabase, importId, id);
    if (!item || item.imp?.scope !== "ledger") continue;
    const { data: row } = await supabase.from("cards").select("data, fixed_locked_at").eq("id", item.card_id).maybeSingle();
    if (!row) continue;
    const plan = planSync(row.data, item.parsed, { locked: Boolean(row.fixed_locked_at) });
    if (plan.risks.length) {
      held += 1;
      continue;
    }
    results.push(await applyToLedger(supabase, me, item, { itemId: id, blocks: plan.defaults, removals: [] }));
  }
  revalidatePath("/cards");
  revalidatePath(`/cards/import/${importId}`);
  const done = results.filter((r) => r.ok && r.message.startsWith("반영")).length;
  const same = results.filter((r) => r.ok && !r.message.startsWith("반영")).length;
  const failed = results.filter((r) => !r.ok).length;
  return { ok: failed === 0, message: `반영 ${done}건 · 변경 없음 ${same}건${held ? ` · 건별 승인 대기 ${held}건` : ""}${failed ? ` · 실패 ${failed}건` : ""}`, results };
}

/** 건너뛰기(반영하지 않음). 사유를 남깁니다 */
export async function skipImportItems(importId: number, itemIds: number[], reason: string): Promise<{ ok: boolean; message?: string }> {
  const me = await requireUser("/cards/import");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("card_import_items")
    .update({ status: "skipped", result: { reason: reason.trim().slice(0, SKIP_REASON_MAX) || "건너뜀" }, decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("import_id", importId)
    .in("id", (itemIds ?? []).slice(0, 200))
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, message: "건너뛰지 못했습니다." };
  revalidatePath(`/cards/import/${importId}`);
  return { ok: true, message: `${data?.length ?? 0}건 건너뜀` };
}

/**
 * 원장에 없는 과제를 새 카드로 등록(지침 14는 현행화에서 카드를 만들지 않음 — 그래서 별도 단계로, 성과관리팀이 명시적으로).
 * 주요사업을 모르는 파일(과제 한 장짜리)은 화면에서 고른 주요사업으로.
 */
export async function registerImportItem(importId: number, itemId: number, groupId: string): Promise<{ ok: boolean; message: string; uid?: string }> {
  const me = await requireRole(["pmo", "admin"], "/cards/import");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 새 과제를 등록할 수 있습니다." };
  const supabase = await createClient();
  const item = await loadItem(supabase, importId, itemId);
  if (!item || item.imp?.scope !== "ledger") return { ok: false, message: "항목을 찾을 수 없습니다." };
  if (item.status !== "pending" || item.match !== "none") return { ok: false, message: "원장에 없는 과제로 남아 있는 항목만 등록할 수 있습니다." };
  const target = registerTarget(item.parsed, groupId);
  if (!target.ok) return { ok: false, message: target.message };
  const { group, unit, taskNo, id, title } = target;
  const { data: exists } = await supabase.from("cards").select("id, status").eq("id", id).maybeSingle();
  if (exists) return { ok: false, message: exists.status === "retired" ? `보관함에 같은 번호(${id})의 과제가 있습니다. 그 과제를 복원해 현행화하거나 번호를 확인해 주세요.` : `이미 있는 과제 번호입니다(${id}).` };
  const data = { ...item.parsed, id, group, taskNo };
  let html = "";
  try {
    html = renderCard(data);
  } catch {
    return { ok: false, message: "원본 양식으로 그리지 못했습니다." };
  }
  const { data: team } = data.team ? await supabase.from("teams").select("id").eq("name", data.team).maybeSingle() : { data: null };
  const fileName = fileNameOf(item);
  const { error } = await supabase.from("cards").insert({
    id,
    uid: item.new_uid,
    eval_unit_id: unit,
    task_no: taskNo,
    title,
    team_id: team?.id ?? null,
    hq: data.department ?? null,
    edition: editionOf(fileName),
    data,
    original_html: html,
    // 원본 배치(HWP에서 뗀 경우): 그림은 이미 이 카드 폴더(new_uid)에 있음
    layout: item.layout ?? null,
    updated_by: me.id,
  });
  if (error) {
    console.error("registerImportItem", error.message);
    return { ok: false, message: "새 과제를 등록하지 못했습니다." };
  }
  await supabase.from("card_edits").insert({ card_id: id, edited_by: me.id, before: {}, after: data, summary: `새 과제 등록: ${fileName}` });
  await prepCardAdded(supabase, me.id, id);
  await supabase.from("card_import_items").update({ status: "applied", card_id: id, result: { registered: true }, decided_by: me.id, decided_at: new Date().toISOString() }).eq("id", itemId);
  revalidatePath("/cards");
  revalidatePath(`/cards/import/${importId}`);
  return { ok: true, message: `새 과제로 등록했습니다(${id}${team ? "" : " · 부서를 찾지 못해 미지정 — 과제 원장에서 정해 주세요"}).`, uid: item.new_uid };
}

// ---------------------------------------------------------------------------
// 부서: 자기 카드 작성본에 반영

/**
 * 한글 파일에서 읽은 카드를 이달 작성본에 반영(승인한 블록만, 무손실 병합). 작성본이 없으면 원장을 바탕으로 새로 만듭니다.
 * 돌려준 data·rev·versionId로 편집기를 다시 그립니다.
 */
export async function applyImportToDraft(
  importId: number,
  decision: ImportDecision,
): Promise<{ ok: boolean; message: string; data?: Record<string, unknown>; rev?: number; versionId?: number; imageUrls?: Record<string, string> }> {
  const me = await requireUser("/my");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const item = await loadItem(supabase, importId, Number(decision.itemId));
  if (!item || item.imp?.scope !== "draft") return { ok: false, message: "항목을 찾을 수 없습니다." };
  if (item.status !== "pending") return { ok: false, message: "이미 처리한 항목입니다." };
  const { data: card } = await supabase.from("cards").select("id, uid, data, team_id, fixed_locked_at, status").eq("id", item.card_id).maybeSingle();
  if (!card || card.status !== "active") return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (me.role === "dept_user" && (me.team?.id ?? -1) !== card.team_id) return { ok: false, message: "자기 부서 과제만 채울 수 있습니다." };
  const open = await openVersion(supabase, card.id);
  if (open?.status === "submitted") return { ok: false, message: "제출한 작성본입니다. 먼저 「제출 취소」를 눌러 주세요." };
  const current = open ? open.data : card.data;
  const locked = Boolean(card.fixed_locked_at);
  const { card: merged, applied } = applySync(current, item.parsed, { blocks: cleanKeys(decision.blocks), removals: cleanKeys(decision.removals) }, { locked, fileName: fileNameOf(item) });
  if (!applied.length) return { ok: false, message: "반영할 변경이 없습니다(고른 블록이 없거나 이미 같음)." };
  let after = recomputeDerived(merged);
  if (locked) after = withFixedFrom(after, card.data);
  const problem = checkEditable(card.data, after);
  if (problem) return { ok: false, message: problem };
  try {
    renderCard(after);
  } catch {
    return { ok: false, message: "원본 양식으로 그리지 못했습니다." };
  }
  let versionId: number;
  let rev: number;
  if (open) {
    const { data, error } = await supabase.from("card_versions").update({ data: after, rev: open.rev + 1 }).eq("id", open.id).eq("status", "draft").eq("rev", open.rev).select("id, rev");
    if (error || !data?.length) return { ok: false, message: "작성본이 그사이 바뀌었습니다. 화면을 새로 고친 뒤 다시 반영해 주세요." };
    versionId = open.id;
    rev = data[0].rev as number;
  } else {
    const period = currentPeriod();
    const latest = await latestVersion(supabase, card.id, period);
    const { data, error } = await supabase
      .from("card_versions")
      .insert({ card_id: card.id, period, version: (latest?.version ?? 0) + 1, status: "draft", data: after, base: card.data, created_by: me.id })
      .select("id, rev")
      .single();
    if (error || !data) return { ok: false, message: "작성본을 만들지 못했습니다." };
    versionId = data.id as number;
    rev = (data.rev as number) ?? 0;
  }
  await supabase
    .from("card_import_items")
    .update({ status: "applied", result: { blocks: applied, removals: cleanKeys(decision.removals), versionId }, decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", item.id);
  // 새로 들어온 그림의 서명 주소(편집기가 바로 보여 주게)
  const refs = cardImageRefs(renderCard(after)).filter((r) => r.src.startsWith(`../images/imp${importId}/`));
  const imageUrls: Record<string, string> = {};
  if (refs.length) {
    const { data: signed } = await supabase.storage.from("card-originals").createSignedUrls(
      refs.map((r) => `${card.uid}/${r.objectName}`),
      3600,
    );
    refs.forEach((r, i) => {
      const url = signed?.[i]?.signedUrl;
      if (url) imageUrls[r.src] = url;
    });
  }
  revalidatePath("/my");
  return { ok: true, message: `작성본에 반영했습니다(${applied.map((k) => BLOCK_LABEL[k]).join("·")}). 확인한 뒤 성과관리팀에 제출해 주세요.`, data: after, rev, versionId, imageUrls };
}

/** 부서 작성본 채우기: 올린 파일의 카드를 지금 작성본(없으면 원장)과 블록별로 비교 */
export async function getDraftImportPlan(importId: number): Promise<{
  ok: boolean;
  message?: string;
  items: Array<{ itemId: number; title: string | null; taskNo: string | null; match: string; reason: string | null; plan: ReturnType<typeof planSync> }>;
}> {
  await requireUser("/my");
  const supabase = await createClient();
  const { data: imp } = await supabase.from("card_imports").select("id, scope, target_card_id, files").eq("id", importId).maybeSingle();
  if (!imp || !imp.target_card_id) return { ok: false, message: "현행화 묶음을 찾을 수 없습니다.", items: [] };
  const fileError = ((imp.files ?? []) as ImportFileMeta[]).map((f) => f.error).find(Boolean);
  const { data: card } = await supabase.from("cards").select("id, data, fixed_locked_at").eq("id", imp.target_card_id).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다.", items: [] };
  const open = await openVersion(supabase, card.id);
  const current = open && open.status !== "confirmed" ? open.data : card.data;
  const { data: rows } = await supabase.from("card_import_items").select("id, task_no, title, parsed, match, match_reason").eq("import_id", importId).eq("status", "pending").order("seq");
  const items = ((rows ?? []) as Array<{ id: number; task_no: string | null; title: string | null; parsed: LooseJson; match: string; match_reason: string | null }>).map((r) => ({
    itemId: r.id,
    title: r.title,
    taskNo: r.task_no,
    match: r.match,
    reason: r.match_reason,
    plan: planSync(current, r.parsed, { locked: Boolean(card.fixed_locked_at), uncertain: r.match === "uncertain" ? r.match_reason : null }),
  }));
  if (!items.length) return { ok: false, message: fileError ?? "파일에서 이 과제의 카드를 찾지 못했습니다.", items: [] };
  return { ok: true, items };
}
