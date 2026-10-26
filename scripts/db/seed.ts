// Supabase에 카드 59장과 공통 지식 적재 결과를 넣습니다(서비스 키, 다시 돌려도 같은 결과).
//
//   pnpm db:seed --dry-run            # 넣을 건수만 확인(접속 안 함)
//   pnpm db:seed                      # 넣기
//   pnpm db:seed --upload-originals   # 공통 지식 원본 파일도 knowledge 버킷에 올림
//   pnpm db:seed --prune              # 이번 적재에 없는 옛 조각 삭제(그 조각의 확정 연결도 함께 지워짐)
//   pnpm db:seed --knowledge-only     # 공통 지식(문서·조각·연결 초안·과제 대응)만 — 부서·평가 단위·카드·카드 그림은 건드리지 않음(운영 DB용)
//   pnpm db:seed --knowledge-only --doc <문서 id>   # 그 문서(문서 행·조각)만 — 다른 문서의 글·연결 초안·과제 대응표는 안 건드림(운영 DB에 새 문서 하나만 올릴 때)
//   pnpm db:seed --no-prep            # 새로 생기거나 판이 바뀐 문서의 과제 매칭 작업 등록을 건너뜀(등록만 하고, 처리는 pnpm prep run --ai)
//
// 필요한 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
// 사람이 확정한 연결(card_knowledge_scope, task_map의 confirmed·rejected)은 덮어쓰지 않습니다.

import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { cardImageRefs } from "../../lib/cards/original-html.ts";
import { KNOWLEDGE_DOCUMENTS } from "../../lib/knowledge/documents.ts";
import { type KnowledgeImage, knowledgeImagePath, metaImages } from "../../lib/knowledge/images.ts";
import { readSeedInput } from "../../lib/db/seed-files.ts";
import { buildSeedRows } from "../../lib/db/seed-rows.ts";
import { changedMatchingDocs, documentShas, registerMatching, saveDocumentsAndChunks } from "../../lib/knowledge/save.ts";
import { guardProduction } from "../lib/db-target.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const args = new Set(process.argv.slice(2));
const BATCH = 100;

// --dry-run(접속 안 함)·--knowledge-only(운영 DB 공통 지식 갱신용, CLAUDE.md 「명령」 절)는
// 운영 DB에서 그대로 씁니다. 카드·부서까지 덮어쓰는 전체 적재만 막습니다.
if (!args.has("--dry-run") && !args.has("--knowledge-only")) {
  guardProduction("db:seed");
}

async function main() {
  const seed = readSeedInput(ROOT);
  const all = buildSeedRows(seed);
  const onlyDoc = process.argv.includes("--doc") ? process.argv[process.argv.indexOf("--doc") + 1] : null;
  if (onlyDoc && !all.documents.some((d) => d.doc_id === onlyDoc)) throw new Error(`적재 결과에 없는 문서: ${onlyDoc} (pnpm knowledge:ingest 먼저)`);
  if (onlyDoc && !args.has("--knowledge-only")) throw new Error("--doc은 --knowledge-only와 함께만 씁니다");
  const rows = onlyDoc ? { ...all, documents: all.documents.filter((d) => d.doc_id === onlyDoc), chunks: all.chunks.filter((c) => c.doc_id === onlyDoc), scope: [], taskMap: [] } : all;
  console.log(
    `부서 ${rows.teams.length} · 평가 단위 ${rows.evalUnits.length} · 카드 ${rows.cards.length}` +
      (seed.knowledgeAvailable
        ? ` · 문서 ${rows.documents.length} · 조각 ${rows.chunks.length} · 카드 연결(대응표 규칙 행) ${rows.scope.length} · 과제 대응 ${rows.taskMap.length}`
        : " · 공통 지식 없음(pnpm knowledge:ingest 먼저)"),
  );
  if (args.has("--dry-run")) {
    if (seed.knowledgeAvailable) console.log(`  공통 지식 그림(조각이 가리키는 것) ${knowledgeImageUploads(rows.chunks).length}장`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다(.env.local)",
    );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const check = <T>(
    label: string,
    res: { data: T | null; error: { message: string } | null },
  ): T => {
    if (res.error || res.data === null)
      throw new Error(`${label}: ${res.error?.message ?? "응답 없음"}`);
    return res.data;
  };
  const ok = (label: string, res: { error: { message: string } | null }) => {
    if (res.error) throw new Error(`${label}: ${res.error.message}`);
  };
  const upsert = async (
    table: string,
    list: Array<Record<string, unknown>>,
    onConflict: string,
  ) => {
    for (let i = 0; i < list.length; i += BATCH) {
      ok(
        `${table} upsert`,
        await db.from(table).upsert(list.slice(i, i + BATCH), { onConflict }),
      );
    }
    console.log(`  ${table} ${list.length}`);
  };

  const knowledgeOnly = args.has("--knowledge-only");
  if (knowledgeOnly)
    console.log("  공통 지식만 적재(부서·평가 단위·카드·그림은 그대로)");
  else await seedCards();

  async function seedCards() {
    await upsert("teams", rows.teams, "name");
    const teamIds = new Map(
      check("teams select", await db.from("teams").select("id, name")).map(
        (t) => [t.name as string, t.id as number],
      ),
    );
    // 주관 부서(lead_team_id)는 화면에서 정하므로 보내지 않습니다.
    await upsert("eval_units", rows.evalUnits, "id");
    await upsert(
      "cards",
      rows.cards.map(({ team_name, ...c }) => ({
        ...c,
        team_id: team_name ? (teamIds.get(team_name) ?? null) : null,
      })),
      "id",
    );

    // 카드 원본 양식의 그림 → 비공개 버킷 card-originals/{uid}/{bizN}-{파일}
    const uids = new Map(
      check("cards uid", await db.from("cards").select("id, uid")).map((c) => [
        c.id as string,
        c.uid as string,
      ]),
    );
    let images = 0;
    for (const c of rows.cards) {
      for (const ref of cardImageRefs(c.original_html ?? "")) {
        const file = join(
          ROOT,
          "seed/cards",
          seed.edition,
          "images",
          ref.seedPath,
        );
        const type = ref.seedPath.endsWith(".png") ? "image/png" : "image/jpeg";
        ok(
          `upload ${ref.seedPath}`,
          await db.storage
            .from("card-originals")
            .upload(`${uids.get(c.id)}/${ref.objectName}`, readFileSync(file), {
              upsert: true,
              contentType: type,
            }),
        );
        images += 1;
      }
    }
    console.log(`  card-originals 그림 ${images}`);
  }
  if (!seed.knowledgeAvailable) return;

  if (args.has("--upload-originals")) {
    for (const doc of rows.documents) {
      const spec = KNOWLEDGE_DOCUMENTS.find((d) => d.doc_id === doc.doc_id)!;
      const file = join(ROOT, "resources/knowledge", spec.file_name);
      if (!existsSync(file)) continue;
      const path = `${doc.doc_id}/original${extname(spec.file_name).toLowerCase()}`;
      ok(
        `upload ${path}`,
        await db.storage
          .from("knowledge")
          .upload(path, readFileSync(file), { upsert: true }),
      );
      doc.storage_path = `knowledge/${path}`;
      console.log(`  knowledge/${path}`);
    }
  }
  // 새로 생기거나 판이 바뀐 문서를 알아내려고 적재 전 sha256을 읽어 둠
  const beforeSha = await documentShas(db);

  // 문서·조각 쓰기는 화면 업로드·CLI와 같은 공유 함수(lib/knowledge/save.ts) — 문서 업서트 → 그림(훅) → 조각 업서트 → 옛 조각 prune
  const uploadImages = async () => {
    // 공통 지식 그림(조각 meta.images가 가리키는 것만 — lib/knowledge/images.ts) → 비공개 버킷 knowledge/<doc_id>/images/<이름>.
    // 이미 올린 이름은 건너뜀(원본 쪽 그림은 바뀌지 않음 — 원본이 새 판이면 pnpm knowledge:parse --images로 다시 꺼내 이름·쪽이 달라짐)
    const uploads = knowledgeImageUploads(rows.chunks);
    const have = new Set<string>();
    for (const docId of new Set(uploads.map((u) => u.docId))) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.storage.from("knowledge").list(`${docId}/images`, { limit: 1000, offset });
        if (error || !data?.length) break;
        for (const o of data) have.add(knowledgeImagePath(docId, o.name));
        if (data.length < 1000) break;
      }
    }
    let sent = 0;
    for (const u of uploads) {
      const path = knowledgeImagePath(u.docId, u.image.file);
      if (have.has(path)) continue;
      ok(`upload knowledge/${path}`, await db.storage.from("knowledge").upload(path, readFileSync(u.file), { upsert: true, contentType: u.image.mime }));
      sent += 1;
    }
    console.log(`  knowledge 그림 ${uploads.length}장(새로 올림 ${sent})`);
  };
  await saveDocumentsAndChunks(db, rows.documents, rows.chunks as unknown as Array<Record<string, unknown>>, { prune: args.has("--prune"), beforeChunks: uploadImages, log: (m) => console.log(`  ${m}`) });

  // 사람이 정한 연결(확정·뺌)은 그대로 둡니다. 과제 대응표는 (과제, 조각) 단위입니다.
  const decided = check(
    "scope status",
    await db
      .from("card_knowledge_scope")
      .select("card_id, chunk_key")
      .in("status", ["confirmed", "rejected"]),
  );
  const decidedKeys = new Set(decided.map((r) => `${r.card_id}|${r.chunk_key}`));
  await upsert(
    "card_knowledge_scope",
    rows.scope.filter((l) => !decidedKeys.has(`${l.card_id}|${l.chunk_key}`)),
    "card_id,chunk_key",
  );
  const confirmedTasks = new Set(
    check(
      "task_map status",
      await db.from("task_map").select("card_id").eq("status", "confirmed"),
    ).map((r) => r.card_id as string),
  );
  await upsert(
    "task_map",
    rows.taskMap.filter((r) => !confirmedTasks.has(r.card_id as string)),
    "card_id",
  );

  // 새로 생기거나 판(sha256)이 바뀐 공통 문서 → 그 문서가 닿는 사업의 활성 카드에 그 문서만 다시 매칭하도록 작업 등록(참고자료 3단계).
  // 등록만 하고 처리는 pnpm prep run --ai(AI 작업은 직접 돌림). 대응표의 확정·뺌은 다시 매칭해도 덮이지 않음
  if (!args.has("--no-prep")) {
    const changed = changedMatchingDocs(beforeSha, rows.documents, rows.chunks);
    if (!changed.length) console.log("  과제 매칭 작업: 새로 생기거나 바뀐 문서 없음");
    else {
      const r = await registerMatching(db, changed, rows.chunks);
      // 적재는 이미 끝났으므로 실패하지 않음 — 새 표가 아직 없으면(pnpm db:push 전) 나중에 pnpm prep enqueue --match로 등록
      if (r.message) console.log(`  과제 매칭 작업 등록 실패(${r.message}) — pnpm db:push 뒤 pnpm prep enqueue --match로 등록하세요.`);
      else {
        console.log(`  과제 매칭 작업 ${r.queued}건 등록(이미 대기 중 ${r.skipped}건) — 문서 ${changed.join(", ")}. 처리: pnpm prep run --ai`);
        if (r.skipped) console.log("  ※ 이미 대기 중인 작업은 문서 목록이 다를 수 있습니다 — pnpm prep enqueue --match --doc <문서 id>로 보충하세요.");
      }
    }
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});

/** 조각이 가리키는 공통 지식 그림(로컬 파일 — resources/knowledge/_parsed/images/<doc_id>/) — 파일이 없으면 뺌 */
function knowledgeImageUploads(chunks: Array<{ doc_id?: unknown; meta?: unknown }>): Array<{ docId: string; image: KnowledgeImage; file: string }> {
  const lists = new Map<string, Map<string, KnowledgeImage>>();
  const out: Array<{ docId: string; image: KnowledgeImage; file: string }> = [];
  const seen = new Set<string>();
  for (const c of chunks) {
    const docId = String(c.doc_id ?? "");
    const names = metaImages(c.meta);
    if (!docId || !names.length) continue;
    if (!lists.has(docId)) {
      const manifest = join(ROOT, "resources/knowledge/_parsed/images", `${docId}.json`);
      lists.set(docId, new Map(existsSync(manifest) ? (JSON.parse(readFileSync(manifest, "utf8")) as KnowledgeImage[]).map((i) => [i.file, i]) : []));
    }
    for (const name of names) {
      const key = `${docId}/${name}`;
      const image = lists.get(docId)!.get(name);
      const file = join(ROOT, "resources/knowledge/_parsed/images", docId, name);
      if (seen.has(key) || !image || !existsSync(file)) continue;
      seen.add(key);
      out.push({ docId, image, file });
    }
  }
  return out;
}
