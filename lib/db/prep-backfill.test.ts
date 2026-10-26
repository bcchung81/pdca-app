// 20260930090000_prep_tables.sql의 이관: 옛 knowledge_card_links(지적 단위)가 (과제, 조각) 단위 card_knowledge_scope로 옮겨지는 규칙.
// 이 마이그레이션만 빼고 적용 → 옛 표에 사례를 넣고 → 이 마이그레이션을 적용해 확인한다.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB } from "./supabase-stub.ts";

const MIGRATIONS = join(resolve(import.meta.dirname, "../.."), "supabase/migrations");
const TARGET = "20260930090000_prep_tables.sql";
const SKIP = [/_search(_\w+)?\.sql$/];

test("옛 지적 연결 → 과제 대응표: (과제, 조각)마다 한 행, 사람이 정한 것이 먼저, 지적 정보는 meta에, 옛 표는 그대로", async () => {
  const db = new PGlite();
  try {
    await db.exec(SUPABASE_STUB);
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !SKIP.some((s) => s.test(f))).sort();
    assert.ok(files.includes(TARGET), "이관 마이그레이션이 있어야 함");
    for (const f of files.filter((f) => f < TARGET)) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));

    await db.exec(`
      insert into public.eval_units (id, track, name) values ('BZ-T', '주요사업', '시험 사업');
      insert into public.cards (id, eval_unit_id, task_no, title, edition, data) values
        ('A', 'BZ-T', '1', '카드 A', 'e', '{}'::jsonb), ('B', 'BZ-T', '2', '카드 B', 'e', '{}'::jsonb);
      insert into public.knowledge_documents (doc_id, title, file_name) values ('d', 't', 't.md');
      insert into public.knowledge_chunks (chunk_key, doc_id, seq, unit_type, track, title, context_prefix, blocks, text, search_text)
        select k, 'd', row_number() over (order by k), 'finding_row', '주요사업', 't', 'p', '[]'::jsonb, 'x', 'x' from (values ('X'), ('Y')) v(k);
      insert into public.knowledge_card_links (card_id, finding_index, chunk_key, finding_no, card_finding, method, score, basis, rank, status) values
        ('A', 0, 'X', 0, '자동 지적', 'finding_3gram', 0.6, '점수', 2, 'auto'),
        ('A', 1, 'X', 0, '확정된 지적', 'finding_3gram', 0.5, '점수', 1, 'confirmed'),
        ('A', 2, 'X', 0, '뺀 지적', 'finding_3gram', 0.5, '점수', 1, 'rejected'),
        ('A', 0, 'Y', 0, '후보 지적', 'finding_3gram', 0.3, null, 3, 'candidate'),
        ('B', 0, 'X', 0, '뺀 지적', 'finding_3gram', 0.4, null, 1, 'rejected');
    `);

    await db.exec(readFileSync(join(MIGRATIONS, TARGET), "utf8"));

    const rows = (await db.query<{ card_id: string; chunk_key: string; status: string; method: string; rank: number; meta: { card_finding: string; finding_index: number; link_method: string } }>(
      "select card_id, chunk_key, status, method, rank, meta from public.card_knowledge_scope order by card_id, chunk_key",
    )).rows;
    assert.deepEqual(
      rows.map((r) => [r.card_id, r.chunk_key, r.status, r.method]),
      [["A", "X", "confirmed", "rule"], ["A", "Y", "candidate", "rule"], ["B", "X", "rejected", "rule"]],
    );
    assert.equal(rows[0].meta.card_finding, "확정된 지적", "이긴 행의 지적 정보가 meta에 남음");
    assert.equal(rows[0].meta.finding_index, 1);
    assert.equal(rows[0].meta.link_method, "finding_3gram");
    assert.equal(rows[0].rank, 1);
    assert.equal((await db.query<{ n: number }>("select count(*)::int as n from public.knowledge_card_links")).rows[0].n, 5, "옛 표는 그대로");
  } finally {
    await db.close();
  }
});
