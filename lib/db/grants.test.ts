// 로그인 사용자(authenticated)·비로그인(anon)의 쓰기 권한 목록을 고정합니다(2026-11-17 근본책 0단계 — 권한 위생 20261117110000).
// 모든 마이그레이션을 호스티드 Supabase 기본 권한 흉내(supabase-stub.ts) 위에 올린 뒤, 공개 표·열의 쓰기 권한(넣기·고치기·지우기·비우기·참조·트리거),
// 시퀀스 권한, 공개 함수 실행 권한이 아래 기대 목록과 **똑같아야** 합니다. 권한을 넓히는 마이그레이션은 이 목록부터 고쳐야 통과합니다
// (넓힐 때는 그 표의 RLS 정책·앱 경로를 함께 확인). 어느 행이 쓰이는지는 RLS 정책이 정하고 그 사례는 migrations.test.ts에 있습니다.
// 카드 원본(seed) 없이 마이그레이션만 올리므로 늘 돕니다. PGroonga 검색 마이그레이션(search_knowledge)은 건너뜁니다(호스티드에서 확인).

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB } from "./supabase-stub.ts";

const MIGRATIONS = join(resolve(import.meta.dirname, "../.."), "supabase/migrations");
const SKIP = [/_search(_\w+)?\.sql$/];

let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !SKIP.some((s) => s.test(f))).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
});

after(async () => {
  await db?.close();
});

const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

/**
 * 공개 표 쓰기 권한 한 줄씩: 「역할 권한 표」 또는 열 단위면 「역할 권한(열,…) 표」. 실제로 쓸 수 있는지(has_*_privilege — PUBLIC·역할 상속 포함)로 셈.
 * 운영 확인 SQL(.team 보고서)과 같은 모양
 */
async function tableWrites(): Promise<string[]> {
  const out: string[] = [];
  const tables = await rows<{ t: string; oid: number }>("select c.oid::int as oid, 'public.' || c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') order by c.relname");
  for (const role of ["anon", "authenticated"]) {
    for (const { t, oid } of tables) {
      for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        const [{ whole }] = await rows<{ whole: boolean }>("select has_table_privilege($1, $2::oid, $3) as whole", [role, oid, priv]);
        if (whole) {
          out.push(`${role} ${priv} ${t}`);
          continue;
        }
        if (priv !== "INSERT" && priv !== "UPDATE" && priv !== "REFERENCES") continue;
        const cols = await rows<{ c: string }>(
          "select a.attname as c from pg_attribute a where a.attrelid = $2::oid and a.attnum > 0 and not a.attisdropped and has_column_privilege($1, $2::oid, a.attname, $3) order by a.attname",
          [role, oid, priv],
        );
        if (cols.length) out.push(`${role} ${priv}(${cols.map((r) => r.c).join(",")}) ${t}`);
      }
    }
  }
  return out;
}

/** 공개 시퀀스 권한(USAGE·SELECT·UPDATE) */
async function sequenceGrants(): Promise<string[]> {
  const r = await rows<{ line: string }>(
    `select r.role || ' ' || p.priv || ' public.' || c.relname as line
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('anon'), ('authenticated')) r(role)
       cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) p(priv)
      where n.nspname = 'public' and c.relkind = 'S' and has_sequence_privilege(r.role, c.oid, p.priv)
      order by 1`,
  );
  return r.map((x) => x.line);
}

/** 공개 스키마 함수 중 실행할 수 있는 것(PostgREST rpc로 부를 수 있는 것) */
async function functionGrants(): Promise<string[]> {
  const r = await rows<{ line: string }>(
    `select r.role || ' EXECUTE public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as line
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       cross join (values ('anon'), ('authenticated')) r(role)
      where n.nspname = 'public' and has_function_privilege(r.role, p.oid, 'EXECUTE')
      order by 1`,
  );
  return r.map((x) => x.line);
}

// ── 기대 목록(위생 20261117110000 뒤 · 3차 20261117100000 · 근본책 1단계 A 20261117120000 포함) ─────────────────────────
// anon은 공개 표·시퀀스에 아무 권한도 없고, 실행할 수 있는 공개 함수는 확인용 app_write_probe 하나뿐.

const TABLE_WRITES = [
  // ai_results: 백그라운드 작업 결과(본인 행 넣기·「기록 지우기」)
  "authenticated INSERT public.ai_results",
  "authenticated DELETE public.ai_results",
  // card_assignees: 성과관리팀의 담당 지정(정책 is_staff, 감사 트리거)
  "authenticated INSERT public.card_assignees",
  "authenticated DELETE public.card_assignees",
  // card_edits: 원장 고친 이력(넣기, 성과관리팀 본인 행 이어 쓰기)
  "authenticated INSERT public.card_edits",
  "authenticated UPDATE public.card_edits",
  // 한글 현행화 묶음·항목(가드 guard_card_import*)
  "authenticated INSERT public.card_import_items",
  "authenticated UPDATE public.card_import_items",
  "authenticated DELETE public.card_import_items",
  "authenticated INSERT public.card_imports",
  "authenticated UPDATE public.card_imports",
  "authenticated DELETE public.card_imports",
  // 과제 대응표(성과관리팀 확정·뺌)
  "authenticated INSERT public.card_knowledge_scope",
  "authenticated UPDATE public.card_knowledge_scope",
  "authenticated DELETE public.card_knowledge_scope",
  // 카드 전용 자료: 등록 칸만 넣고(읽은 글은 서버만 — 20261117100000) 지우기
  "authenticated INSERT(bytes,card_id,file_name,id,mime_type,storage_path,uploaded_by) public.card_materials",
  "authenticated DELETE public.card_materials",
  // 경평 과제별 초안·구성안
  "authenticated INSERT public.card_report_drafts",
  "authenticated UPDATE public.card_report_drafts",
  "authenticated DELETE public.card_report_drafts",
  // 작성본
  "authenticated INSERT public.card_versions",
  "authenticated UPDATE public.card_versions",
  "authenticated DELETE public.card_versions",
  // 원장(부서는 내용만 — guard_card)
  "authenticated INSERT public.cards",
  "authenticated UPDATE public.cards",
  "authenticated DELETE public.cards",
  // 지표 단위 카드 밖 부분
  "authenticated INSERT public.eval_unit_report_parts",
  "authenticated UPDATE public.eval_unit_report_parts",
  "authenticated DELETE public.eval_unit_report_parts",
  // 평가단위(성과관리팀 — 주관 부서)
  "authenticated INSERT public.eval_units",
  "authenticated UPDATE public.eval_units",
  "authenticated DELETE public.eval_units",
  // 월간 점검표
  "authenticated INSERT public.inspections",
  "authenticated UPDATE public.inspections",
  "authenticated DELETE public.inspections",
  // 공통 지식(관리자 화면 올리기·지우기)
  "authenticated INSERT public.knowledge_chunks",
  "authenticated UPDATE public.knowledge_chunks",
  "authenticated DELETE public.knowledge_chunks",
  "authenticated INSERT public.knowledge_documents",
  "authenticated UPDATE public.knowledge_documents",
  "authenticated DELETE public.knowledge_documents",
  // 매칭 작업 등록(네 칸만)
  "authenticated INSERT(kind,payload,requested_by,target) public.prep_jobs",
  // 프로필: 갱신만(가드 guard_profile_update — 넣기는 가입 트리거, 지우기는 계정 삭제 연쇄)
  "authenticated UPDATE public.profiles",
  // 보고서 검토 코멘트(해결 표시 세 칸)
  "authenticated INSERT public.report_comments",
  "authenticated UPDATE(resolved_at,resolved_by,status) public.report_comments",
  "authenticated DELETE public.report_comments",
  // 블록 고치기 이력(넣기만)
  "authenticated INSERT public.report_draft_edits",
  // 추가자료 ↔ 과제 연결
  "authenticated INSERT public.report_material_cards",
  "authenticated UPDATE public.report_material_cards",
  "authenticated DELETE public.report_material_cards",
  // 보고서 추가자료: 등록 칸만 넣고 지우기
  "authenticated INSERT(bytes,file_name,id,mime_type,report_id,storage_path,uploaded_by) public.report_materials",
  "authenticated DELETE public.report_materials",
  // 보고서 목차(성과관리팀)
  "authenticated INSERT public.report_outline",
  "authenticated UPDATE public.report_outline",
  "authenticated DELETE public.report_outline",
  // 보고서
  "authenticated INSERT public.reports",
  "authenticated UPDATE public.reports",
  "authenticated DELETE public.reports",
  // 과제 기준 목록표(성과관리팀)
  "authenticated INSERT public.task_map",
  "authenticated UPDATE public.task_map",
  "authenticated DELETE public.task_map",
];

const SEQUENCES = [
  "access_events_id_seq",
  "ai_requests_id_seq",
  "card_edits_id_seq",
  "card_import_items_id_seq",
  "card_imports_id_seq",
  "card_versions_id_seq",
  "inspections_id_seq",
  "prep_jobs_id_seq",
  "report_comments_id_seq",
  "report_draft_edits_id_seq",
  "reports_id_seq",
  "teams_id_seq",
].map((s) => `authenticated USAGE public.${s}`);

const FUNCTIONS = [
  "anon EXECUTE public.app_write_probe()",
  "authenticated EXECUTE public.app_write_probe()",
  "authenticated EXECUTE public.finish_ai_request(p_id bigint, p_key text, p_status text, p_model text, p_input_tokens integer, p_output_tokens integer, p_cache_read_tokens integer, p_cache_write_tokens integer, p_cache_write_1h_tokens integer, p_error text, p_duration_ms integer, p_timings jsonb)",
  "authenticated EXECUTE public.mg_biz_ref_texts(p_card_id text, p_year integer, p_biz_ids text[])",
  "authenticated EXECUTE public.mg_biz_refs(p_card_id text, p_year integer)",
  "authenticated EXECUTE public.mg_biz_stale(p_card_ids text[], p_year integer)",
  "authenticated EXECUTE public.report_outline_context(p_eval_unit text, p_year integer)",
  "authenticated EXECUTE public.report_submit_cards(p_report_id bigint)",
  "authenticated EXECUTE public.start_ai_request(p_feature text, p_card_id text, p_mode text, p_job text, p_key_hashes text[], p_batch boolean)",
];

const sorted = (a: string[]) => [...a].sort();

test("공개 표·열 쓰기 권한(authenticated·anon)이 기대 목록과 같다 — 넓히려면 이 목록부터(TRUNCATE·REFERENCES·TRIGGER·정책 없는 명령·앱이 안 쓰는 표 쓰기는 없음)", async () => {
  assert.deepEqual(sorted(await tableWrites()), sorted(TABLE_WRITES));
});

test("공개 시퀀스: 로그인 사용자는 USAGE만(값 바꾸기 없음), 비로그인은 없음", async () => {
  assert.deepEqual(sorted(await sequenceGrants()), sorted(SEQUENCES));
});

test("공개 함수 실행 권한(rpc로 부를 수 있는 것)이 기대 목록과 같다 — 비로그인은 확인용 app_write_probe만", async () => {
  assert.deepEqual(sorted(await functionGrants()), sorted(FUNCTIONS));
});

test("비로그인은 공개 표를 읽지도 못하고 private 스키마도 못 씀", async () => {
  const readable = await rows<{ t: string }>("select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and has_table_privilege('anon', c.oid, 'SELECT')");
  assert.deepEqual(readable, []);
  assert.equal((await rows<{ u: boolean }>("select has_schema_privilege('anon', 'private', 'USAGE') as u"))[0].u, false);
});

test("앞으로 만드는 공개 표·시퀀스·함수는 기본으로 닫힘(마이그레이션이 명시적으로 grant 해야 함), private 판정 함수는 로그인 사용자가 실행", async () => {
  await db.exec(`
    create table public.zz_new (id bigint generated always as identity primary key, v text);
    create function public.zz_rpc() returns int language sql as $$ select 1 $$;
    create function private.zz_check() returns boolean language sql as $$ select true $$;
  `);
  try {
    const t = await rows<{ role: string; p: boolean }>(
      "select r.role, has_table_privilege(r.role, 'public.zz_new', 'SELECT') or has_table_privilege(r.role, 'public.zz_new', 'INSERT') or has_table_privilege(r.role, 'public.zz_new', 'UPDATE') or has_table_privilege(r.role, 'public.zz_new', 'DELETE') or has_table_privilege(r.role, 'public.zz_new', 'TRUNCATE') as p from (values ('anon'), ('authenticated')) r(role)",
    );
    assert.deepEqual(t.map((x) => [x.role, x.p]), [["anon", false], ["authenticated", false]], "새 표");
    const s = await rows<{ p: boolean }>("select has_sequence_privilege('authenticated', 'public.zz_new_id_seq', 'USAGE') or has_sequence_privilege('anon', 'public.zz_new_id_seq', 'USAGE') as p");
    assert.equal(s[0].p, false, "새 시퀀스");
    const f = await rows<{ anon: boolean; auth: boolean; svc: boolean }>("select has_function_privilege('anon', 'public.zz_rpc()', 'EXECUTE') as anon, has_function_privilege('authenticated', 'public.zz_rpc()', 'EXECUTE') as auth, has_function_privilege('service_role', 'public.zz_rpc()', 'EXECUTE') as svc");
    assert.deepEqual(f[0], { anon: false, auth: false, svc: true }, "새 공개 함수(서비스 키는 그대로)");
    const p = await rows<{ anon: boolean; auth: boolean }>("select has_function_privilege('anon', 'private.zz_check()', 'EXECUTE') as anon, has_function_privilege('authenticated', 'private.zz_check()', 'EXECUTE') as auth");
    assert.deepEqual(p[0], { anon: false, auth: true }, "새 private 판정 함수(RLS 정책이 로그인 사용자로 부름)");
  } finally {
    await db.exec("drop table public.zz_new; drop function public.zz_rpc(); drop function private.zz_check();");
  }
});

// ── 쓰기 정책 구조(근본책 2·3단계, 2026-11-17) ─────────────────────────────────────────
// 로그인 사용자(또는 PUBLIC)에게 걸린 공개 표의 쓰기 정책은 모두 「앱 서버 경유 표지」(private.app_write())를 쓰기 쪽 식의
// **맨 위 AND 항 하나로** 가져야 합니다(삽입·갱신은 WITH CHECK, 삭제는 USING). OR·NOT·CASE 안에 들어가면 무력해지므로 인정하지 않습니다.
// FOR ALL 정책은 두지 않습니다(USING이 읽기에도 쓰여 표지를 넣으면 읽기까지 막히고, 안 넣으면 삭제가 표지 없이 통과).
// 로그인 사용자가 부를 수 있는 공개 security definer 함수는 본문 첫 문장에서 표지를 확인해야 합니다(RLS를 거치지 않으므로).
// 새 표·정책·rpc를 만들 때 표지를 잊으면 여기서 실패합니다. 예외는 이름과 이유를 적어 아래 배열에 — 비어 있는 것이 목표.

/** 표지 없이 두는 쓰기 정책 `표.정책` → 이유 */
const POLICY_EXCEPTIONS: Record<string, string> = {};
/** 표지 확인 없이 두는 공개 security definer 함수 이름 → 이유 */
const DEFINER_EXCEPTIONS: Record<string, string> = {
  app_write_probe: "확인용 — 표지가 실렸는지 true·false만 돌려주고 아무것도 쓰지 않음",
};

/** 따옴표·괄호 밖의 맨 위 단계에서 sep(대문자 키워드)로 나눔. 겉을 감싼 괄호는 벗김 */
function topLevel(expr: string, sep: "AND" | "OR"): string[] {
  let s = expr.trim();
  const wrapped = (x: string) => {
    if (!x.startsWith("(") || !x.endsWith(")")) return false;
    let depth = 0;
    let q = false;
    for (let i = 0; i < x.length; i++) {
      const ch = x[i];
      if (ch === "'") q = !q;
      if (q) continue;
      if (ch === "(") depth++;
      if (ch === ")" && --depth === 0 && i < x.length - 1) return false;
    }
    return true;
  };
  while (wrapped(s)) s = s.slice(1, -1).trim();
  const parts: string[] = [];
  let depth = 0;
  let q = false;
  let start = 0;
  const tok = ` ${sep} `;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") q = !q;
    if (q) continue;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && s.startsWith(tok, i)) {
      parts.push(s.slice(start, i).trim());
      start = i + tok.length;
      i += tok.length - 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts;
}

/** 식의 맨 위 AND 항 가운데 하나가 정확히 private.app_write() 인가(OR가 맨 위에 있으면 AND 항이 식 전체 하나라서 거짓) */
function hasAppWriteConjunct(expr: string | null): boolean {
  if (!expr) return false;
  if (topLevel(expr, "OR").length > 1) return false;
  const unwrap = (x: string) => topLevel(x, "AND").length === 1 ? topLevel(x, "AND")[0] : x;
  return topLevel(expr, "AND").some((p) => unwrap(p) === "private.app_write()");
}

test("표지 판정 도우미: 맨 위 AND 항만 인정하고 OR·NOT 안의 표지는 인정하지 않음", () => {
  assert.equal(hasAppWriteConjunct("(private.can_write_card(card_id) AND private.app_write())"), true);
  assert.equal(hasAppWriteConjunct("((a = 'x AND private.app_write()') AND (private.app_write()))"), true);
  assert.equal(hasAppWriteConjunct("private.app_write()"), true);
  assert.equal(hasAppWriteConjunct("(private.can_write_card(card_id) OR private.app_write())"), false);
  assert.equal(hasAppWriteConjunct("((private.is_staff() AND private.app_write()) OR private.is_admin())"), false);
  assert.equal(hasAppWriteConjunct("(private.is_staff() AND (private.is_admin() OR private.app_write()))"), false);
  assert.equal(hasAppWriteConjunct("(private.is_staff() AND (NOT private.app_write()))"), false);
  assert.equal(hasAppWriteConjunct("(private.is_staff() AND (a = 'private.app_write()'))"), false);
  assert.equal(hasAppWriteConjunct(null), false);
});

type PolicyRow = { tbl: string; name: string; cmd: string; permissive: boolean; qual: string | null; check: string | null };

/** 공개 표 정책 가운데 로그인 사용자·비로그인·PUBLIC에 걸린 것(식은 pg_get_expr로 되살린 글) */
async function clientPolicies(): Promise<PolicyRow[]> {
  return rows<PolicyRow>(
    `select c.relname as tbl, p.polname as name, p.polcmd::text as cmd, p.polpermissive as permissive,
            pg_get_expr(p.polqual, p.polrelid) as qual, pg_get_expr(p.polwithcheck, p.polrelid) as check
       from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and (0 = any(p.polroles) or exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname in ('authenticated', 'anon')))
      order by 1, 2`,
  );
}

test("공개 표에 FOR ALL 정책이 없다(명령별로 나누고 읽기 정책은 따로)", async () => {
  const all = (await clientPolicies()).filter((p) => p.cmd === "*").map((p) => `${p.tbl}.${p.name}`);
  assert.deepEqual(all, [], `FOR ALL 정책: ${all.join(", ")}`);
});

test("공개 표의 쓰기 정책(삽입·갱신 WITH CHECK, 삭제 USING)은 모두 맨 위 AND 항에 private.app_write()가 있다 — 예외는 POLICY_EXCEPTIONS에 이유와 함께", async () => {
  const missing: string[] = [];
  for (const p of await clientPolicies()) {
    if (!p.permissive) continue; // 제한(RESTRICTIVE) 정책은 허용 범위를 좁히기만 함
    const key = `${p.tbl}.${p.name}`;
    if (key in POLICY_EXCEPTIONS) continue;
    const need =
      p.cmd === "a" ? [["WITH CHECK", p.check]] :
      p.cmd === "w" ? [["WITH CHECK", p.check]] :
      p.cmd === "d" ? [["USING", p.qual]] :
      p.cmd === "*" ? [["USING", p.qual], ["WITH CHECK", p.check ?? p.qual]] : [];
    for (const [where, expr] of need) if (!hasAppWriteConjunct(expr as string | null)) missing.push(`${key}(${p.cmd === "a" ? "INSERT" : p.cmd === "w" ? "UPDATE" : p.cmd === "d" ? "DELETE" : "ALL"} ${where})`);
  }
  assert.deepEqual(missing, [], `표지 빠진 정책 ${missing.length}개:\n  ${missing.join("\n  ")}`);
  const names = new Set((await clientPolicies()).map((p) => `${p.tbl}.${p.name}`));
  assert.deepEqual(Object.keys(POLICY_EXCEPTIONS).filter((k) => !names.has(k)), [], "예외 목록에 남은 없는 정책");
});

/** 본문에서 주석을 지우고 첫 begin 다음 첫 문장이 표지 확인(거절)인가 */
function guardsFirst(src: string): boolean {
  const s = src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
  const m = /\bbegin\b([\s\S]*)/.exec(s);
  if (!m) return false;
  return /^\s*if\s+not\s+private\.app_write\(\)\s+then\s+raise\s+exception\b[^;]*;\s*end\s+if\s*;/.test(m[1]);
}

test("표지 확인 도우미: 첫 문장이 「if not private.app_write() then raise …; end if;」일 때만 인정", () => {
  const ok = "\ndeclare v int;\nbegin\n  -- 앱 서버 경유\n  if not private.app_write() then raise exception '앱 서버를 거친 요청만 받습니다' using errcode = '42501'; end if;\n  return 1;\nend;";
  assert.equal(guardsFirst(ok), true);
  assert.equal(guardsFirst("\nbegin\n  perform 1;\n  if not private.app_write() then raise exception 'x'; end if;\nend;"), false);
  assert.equal(guardsFirst("\nbegin\n  if not private.app_write() or true then raise exception 'x'; end if;\nend;"), false);
  assert.equal(guardsFirst(" select private.app_write() "), false);
});

test("로그인 사용자가 부를 수 있는 공개 security definer 함수는 본문 첫 문장에서 표지를 확인한다 — 예외는 DEFINER_EXCEPTIONS에 이유와 함께", async () => {
  const fns = await rows<{ name: string; lang: string; src: string }>(
    `select p.proname as name, l.lanname as lang, p.prosrc as src
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
      where n.nspname = 'public' and p.prosecdef and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
      order by 1`,
  );
  const missing = fns.filter((f) => !(f.name in DEFINER_EXCEPTIONS) && !(f.lang === "plpgsql" && guardsFirst(f.src))).map((f) => `${f.name}(${f.lang})`);
  assert.deepEqual(missing, [], `표지 확인 빠진 security definer 함수 ${missing.length}개: ${missing.join(", ")}`);
  const unused = Object.keys(DEFINER_EXCEPTIONS).filter((k) => !fns.some((f) => f.name === k));
  assert.deepEqual(unused, [], "예외 목록에 남은 없는 함수");
});
