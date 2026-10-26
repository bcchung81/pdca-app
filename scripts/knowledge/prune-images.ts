// 공통 지식 그림 정리(개선 계획 P2-10): 버킷 knowledge/<doc_id>/images/에 있지만 그 문서의 지금 조각(meta.images)이 가리키지 않는 그림을 찾아 지웁니다.
// 전용 파서 문서를 새 판으로 다시 적재(db:seed --knowledge-only)하면 옛 그림이 버킷에 남기 때문. 기본은 드라이런(건수·이름만), --write일 때만 지움.
// 문서 행이 없는 폴더는 알리기만 하고 지우지 않음(올리는 중인 문서일 수 있어서 — 지운 문서의 파일은 removeDocumentFiles가 지움).
//
//   pnpm knowledge:prune-images [--doc <문서 id>] [--write]
//
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY. 운영 DB를 가리키면 운영 버킷에서 지웁니다(--write일 때).
import { knowledgeImagePath, orphanImages } from "../../lib/knowledge/images.ts";
import { createAdminClient } from "../../lib/supabase/admin.ts";

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const onlyDoc = argv.includes("--doc") ? argv[argv.indexOf("--doc") + 1] : null;
if (onlyDoc !== null && !/^[\w-]+$/.test(onlyDoc ?? "")) {
  console.error("사용법: pnpm knowledge:prune-images [--doc <문서 id>] [--write]");
  process.exit(1);
}

const db = createAdminClient();
const bucket = db.storage.from("knowledge");
const host = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "(알 수 없음)";
  }
})();
console.log(`DB ${host}${write ? " · --write(지움)" : " · 드라이런(지우지 않음 — 지우려면 --write)"}`);

/** 폴더 안 이름(파일만 — id가 없으면 폴더). 실패하면 던짐 */
async function listNames(dir: string, folders = false): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(dir, { limit: 1000, offset });
    if (error) throw new Error(`목록(${dir || "/"}): ${error.message}`);
    for (const o of data ?? []) if (folders ? !o.id : o.id) out.push(o.name);
    if ((data ?? []).length < 1000) return out;
  }
}

const { data: docRows, error: docError } = await db.from("knowledge_documents").select("doc_id");
if (docError) {
  console.error(`문서 목록을 읽지 못했습니다: ${docError.message}`);
  process.exit(1);
}
const docIds = new Set((docRows ?? []).map((d) => String(d.doc_id)));
const folders = onlyDoc ? [onlyDoc] : await listNames("", true);

let found = 0;
let removed = 0;
let scanned = 0;
let total = 0;
for (const docId of folders.sort()) {
  const stored = await listNames(`${docId}/images`);
  if (!stored.length) continue;
  scanned += 1;
  total += stored.length;
  if (!docIds.has(docId)) {
    console.log(`  ${docId}: 문서 행 없음 — 그림 ${stored.length}장(지우지 않음, 확인 필요)`);
    continue;
  }
  const chunks: Array<{ meta: unknown }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("knowledge_chunks").select("meta").eq("doc_id", docId).order("chunk_key").range(from, from + 999);
    if (error) throw new Error(`조각(${docId}): ${error.message}`);
    chunks.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const orphans = orphanImages(stored, chunks);
  if (!orphans.length) continue;
  found += orphans.length;
  console.log(`  ${docId}: 그림 ${stored.length}장 중 안 쓰는 ${orphans.length}장 — ${orphans.slice(0, 5).join(", ")}${orphans.length > 5 ? " …" : ""}`);
  if (!write) continue;
  for (let i = 0; i < orphans.length; i += 100) {
    const { error } = await bucket.remove(orphans.slice(i, i + 100).map((f) => knowledgeImagePath(docId, f)));
    if (error) throw new Error(`지우기(${docId}): ${error.message}`);
    removed += Math.min(100, orphans.length - i);
  }
}
console.log(`그림 폴더 ${scanned}개·그림 ${total}장을 봤습니다.`);
console.log(write ? `안 쓰는 그림 ${found}장 중 ${removed}장을 지웠습니다.` : `안 쓰는 그림 ${found}장(드라이런 — 지우려면 --write).`);
