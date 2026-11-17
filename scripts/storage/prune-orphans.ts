// 저장소 고아 파일 정리(2026-11-18 웹 취약점 낮음 보완 — 근거 T2-F1·T4-S1): DB 행이 가리키지 않는 저장소 객체를 찾아 지웁니다.
// 생기는 까닭: 로그인 사용자가 앱을 거치지 않고 Storage API로 직접 올린 파일(저장소 표지 20261118100000 전), 행을 지운 뒤 파일 지우기 실패
// (서버 로그 kind = storage_remove_failed — lib/storage/remove.ts), 현행화 묶음을 지운 뒤 남은 그림, 올리다 만 파일.
// 버킷별 참조 열과 대조 규칙은 lib/storage/orphans.ts 머리 주석. 만든 지 하루가 안 된 객체는 올리는 중일 수 있어 지우지 않습니다.
// 기본은 드라이런(건수·앞 10개 경로만), --write일 때만 지움. 참조를 읽다 하나라도 실패하면 아무것도 지우지 않고 멈춥니다(덜 읽은 참조로 쓰는 파일을 지우지 않게).
//
//   pnpm storage:prune-orphans [--bucket <이름>] [--write]
//
// 버킷: card-materials · report-materials · card-imports · card-originals(없으면 넷 다). knowledge 버킷은 pnpm knowledge:prune-images.
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY(서비스 키 — 모든 행·객체를 봄). 운영 DB를 가리키면 운영 버킷에서 지웁니다(--write일 때).
import { PRUNE_BUCKETS, type PruneBucket, type RefIndex, type StoredObject, addRefs, importFilePaths, isPruneBucket, originalReferenced, planOrphans } from "../../lib/storage/orphans.ts";
import { createAdminClient } from "../../lib/supabase/admin.ts";

const USAGE = `사용법: pnpm storage:prune-orphans [--bucket <${PRUNE_BUCKETS.join("|")}>] [--write]`;
const argv = process.argv.slice(2);
const write = argv.includes("--write");
const bucketArg = argv.includes("--bucket") ? argv[argv.indexOf("--bucket") + 1] : null;
const unknownArg = argv.find((a, i) => a !== "--write" && a !== "--bucket" && argv[i - 1] !== "--bucket");
if (unknownArg !== undefined || (bucketArg !== null && !isPruneBucket(bucketArg ?? ""))) {
  console.error(USAGE);
  process.exit(1);
}
const buckets: PruneBucket[] = bucketArg && isPruneBucket(bucketArg) ? [bucketArg] : [...PRUNE_BUCKETS];

/** 하위 폴더를 따라 내려가는 깊이 상한(앱이 만드는 경로는 한 단계 — 더 깊으면 직접 올린 것) */
const MAX_DEPTH = 6;
const PAGE = 1000;

const db = createAdminClient();
const host = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "(알 수 없음)";
  }
})();
console.log(`DB ${host}${write ? " · --write(지움)" : " · 드라이런(지우지 않음 — 지우려면 --write)"} · 버킷 ${buckets.join(", ")}`);

/** 버킷의 모든 객체(하위 폴더 포함). 실패하면 던짐. 깊이 상한을 넘는 폴더는 too_deep에 모음 */
async function listObjects(bucket: string, dir: string, depth: number, tooDeep: string[]): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list(dir, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`목록(${bucket}/${dir || ""}): ${error.message}`);
    for (const o of data ?? []) {
      const path = dir ? `${dir}/${o.name}` : o.name;
      if (o.id) out.push({ path, createdAt: o.created_at ?? null });
      else if (depth < MAX_DEPTH) out.push(...(await listObjects(bucket, path, depth + 1, tooDeep)));
      else tooDeep.push(path);
    }
    if ((data ?? []).length < PAGE) return out;
  }
}

/** 표 전체를 id 순으로 나눠 읽어 행마다 onRow. 실패하면 던짐 */
async function eachRow<T>(table: string, columns: string, size: number, onRow: (row: T) => void): Promise<number> {
  let n = 0;
  for (let from = 0; ; from += size) {
    const { data, error } = await db.from(table).select(columns).order("id").range(from, from + size - 1);
    if (error) throw new Error(`${table} 읽기: ${error.message}`);
    for (const row of (data ?? []) as T[]) onRow(row);
    n += (data ?? []).length;
    if ((data ?? []).length < size) return n;
  }
}

/** 버킷별 「이 경로를 가리키는 행이 있나」 판정 — DB에서 참조 열을 모두 읽은 뒤에만 돌려줌 */
async function referenceCheck(bucket: PruneBucket): Promise<{ isReferenced: (path: string) => boolean; note: string }> {
  if (bucket === "card-materials" || bucket === "report-materials") {
    const table = bucket === "card-materials" ? "card_materials" : "report_materials";
    const paths = new Set<string>();
    const n = await eachRow<{ storage_path: string | null }>(table, "id, storage_path", PAGE, (r) => {
      if (r.storage_path) paths.add(r.storage_path);
    });
    return { isReferenced: (p) => paths.has(p), note: `${table}.storage_path ${n}행` };
  }
  if (bucket === "card-imports") {
    const paths = new Set<string>();
    const n = await eachRow<{ files: unknown }>("card_imports", "id, files", PAGE, (r) => {
      for (const p of importFilePaths(r.files)) paths.add(p);
    });
    return { isReferenced: (p) => paths.has(p), note: `card_imports.files ${n}행(경로 ${paths.size}개)` };
  }
  // card-originals: 폴더(카드 uid·현행화 항목 new_uid)마다 딸린 행의 글에서 이름 조각을 모음
  const index: RefIndex = new Map();
  const uidOf = new Map<string, string>();
  const nCards = await eachRow<{ id: string; uid: string; data: unknown; layout: unknown; original_html: string | null }>("cards", "id, uid, data, layout, original_html", 50, (r) => {
    uidOf.set(r.id, r.uid);
    addRefs(index, r.uid, r.data);
    addRefs(index, r.uid, r.layout);
    addRefs(index, r.uid, r.original_html);
  });
  const nVersions = await eachRow<{ card_id: string; data: unknown }>("card_versions", "id, card_id, data", 200, (r) => addRefs(index, uidOf.get(r.card_id), r.data));
  const nEdits = await eachRow<{ card_id: string; before: unknown; after: unknown }>("card_edits", "id, card_id, before, after", 200, (r) => {
    addRefs(index, uidOf.get(r.card_id), r.before);
    addRefs(index, uidOf.get(r.card_id), r.after);
  });
  const nItems = await eachRow<{ card_id: string | null; new_uid: string | null; parsed: unknown; layout: unknown }>("card_import_items", "id, card_id, new_uid, parsed, layout", 100, (r) => {
    for (const folder of new Set([r.new_uid, r.card_id ? uidOf.get(r.card_id) : null])) {
      addRefs(index, folder, r.parsed);
      addRefs(index, folder, r.layout);
    }
  });
  return {
    isReferenced: (p) => originalReferenced(index, p),
    note: `cards ${nCards}·card_versions ${nVersions}·card_edits ${nEdits}·card_import_items ${nItems}행(폴더 ${index.size}개)`,
  };
}

let totalOrphans = 0;
let totalRemoved = 0;
for (const bucket of buckets) {
  // 참조를 먼저 다 읽고(실패하면 여기서 멈춤) 그다음 목록 — 목록 뒤에 올라온 파일은 어차피 하루 미만이라 남음
  const { isReferenced, note } = await referenceCheck(bucket);
  const tooDeep: string[] = [];
  const objects = await listObjects(bucket, "", 0, tooDeep);
  const plan = planOrphans(objects, isReferenced, Date.now());
  totalOrphans += plan.orphans.length;
  console.log(`\n[${bucket}] 객체 ${objects.length}개 — 참조 있음 ${plan.referenced} · 고아 ${plan.orphans.length} · 참조 없지만 하루 미만·시각 모름 ${plan.young}(남김) · 참조: ${note}`);
  if (tooDeep.length) console.log(`  깊이 ${MAX_DEPTH}단계를 넘는 폴더 ${tooDeep.length}개(보지 않음, 확인 필요): ${tooDeep.slice(0, 5).join(", ")}${tooDeep.length > 5 ? " …" : ""}`);
  for (const p of plan.orphans.slice(0, 10)) console.log(`  고아: ${p}`);
  if (plan.orphans.length > 10) console.log(`  … 외 ${plan.orphans.length - 10}개`);
  if (!write) continue;
  for (let i = 0; i < plan.orphans.length; i += 100) {
    const batch = plan.orphans.slice(i, i + 100);
    const { data, error } = await db.storage.from(bucket).remove(batch);
    if (error) throw new Error(`지우기(${bucket}): ${error.message} — 이미 지운 ${totalRemoved}개는 그대로`);
    totalRemoved += data?.length ?? 0;
  }
}
console.log(write ? `\n고아 ${totalOrphans}개 중 ${totalRemoved}개를 지웠습니다.` : `\n고아 ${totalOrphans}개(드라이런 — 지우려면 --write).`);
