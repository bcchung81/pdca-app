// 이미 저장된 첨부 「읽은 글」 대조 — **읽기 전용**(DB·저장소에 아무것도 쓰지 않음, AI·API 호출 없음). 2026-11-17 근본책 0·1단계.
// card_materials·report_materials 중 읽은 글(parsed_text)이 있는 행마다 저장소 파일을 서비스 키로 내려받아 sha256을 저장값과 견주고,
// 같은 파서 판(PARSER_VERSION)이면 앱과 같은 길(lib/ai/read-attachment.ts readAttachmentWith + kordoc { images: false })로 다시 읽어 저장 글과 글자까지 견줌.
// 그림 설명(이미지·글 없는 스캔 PDF)은 AI를 부르지 않고 「비교 불가(그림 설명)」, 판이 다른 행은 「판 다름」(앱이 다음 요청에 다시 읽어 덮음).
// 출력은 판정 건수와 의심 행(sha 다름·글 다름·내려받기 실패)의 id·표·카드 uid(보고서 추가자료는 보고서 id)·글자 수뿐 — 글 내용·파일 이름·실명은 내지 않음.
// 판정·집계·출력은 material-parse-compare.ts(시험 material-parse-compare.test.ts).
//
// 실행(메인 세션만 — 운영 DB를 읽음):
//   node --conditions=react-server --env-file=.env.local scripts/smoke/material-parse-check.ts --dry          # 대상 건수·크기·예상 시간만
//   node --conditions=react-server --env-file=.env.local scripts/smoke/material-parse-check.ts --limit 20     # 표마다 20행만 시험 삼아
//   node --conditions=react-server --env-file=.env.local scripts/smoke/material-parse-check.ts [--table card|report]
// 필요한 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY(서비스 키 — 화면에 내지 않음).
// 끝 코드: 0 = 의심 행 없음, 2 = 의심 행 있음, 1 = 실행 오류.
import { createClient } from "@supabase/supabase-js";
import { parse } from "kordoc";
import { PARSER_VERSION } from "../../lib/ai/material-text.ts";
import { type ReadDeps, readAttachmentWith } from "../../lib/ai/read-attachment.ts";
import { ATTACH_LABEL, isAttachableName } from "../../lib/ai/writer.ts";
import { KORDOC_OPTIONS, LISTED, type ReadDb, type Reparse, TABLES, checkMaterials, checkReport, dryCount, dryReport, parseArgs } from "./material-parse-compare.ts";

/** 앱 읽기 경로(lib/ai/attachments.ts realDeps)와 같되 그림 설명은 부르지 않음 — 그 길로 가면 보류(pending) → 「비교 불가(그림 설명)」 */
const deps: ReadDeps = {
  async kordoc(bytes) {
    const res = await parse(Buffer.from(bytes), KORDOC_OPTIONS);
    return res.success ? { ok: true, markdown: res.markdown } : { ok: false, code: res.code ?? "형식 오류" };
  },
  async describe() {
    return { ok: false, unavailable: true, error: "그림 설명은 견주지 않음(AI 호출 안 함)" };
  },
  isAttachable: isAttachableName,
  attachLabel: ATTACH_LABEL,
};
const reparse: Reparse = (bytes, name) => readAttachmentWith(bytes, name, deps);

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  if ("error" in opts) {
    console.error(`${opts.error}\n사용법: material-parse-check.ts [--dry] [--limit N] [--table card|report]`);
    return 1;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SECRET_KEY가 필요합니다(.env.local — --env-file로 넘김)");
    return 1;
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as ReadDb;
  console.log(`대상 ${new URL(url).host} · 파서 판 ${PARSER_VERSION} · 표 ${opts.tables.map((t) => TABLES[t].table).join("·")}${opts.limit ? ` · 표마다 ${opts.limit}행까지` : ""}${opts.dry ? " · 건수만(--dry)" : ""}`);
  if (opts.dry) {
    for (const line of dryReport(await dryCount(db, opts))) console.log(line);
    return 0;
  }
  const t0 = Date.now();
  const results = await checkMaterials(db, opts, reparse, (_r, n) => {
    if (n % 20 === 0) console.error(`… ${n}행 대조(${Math.round((Date.now() - t0) / 1000)}초)`);
  });
  console.log(`\n${results.length}행 대조 · ${Math.round((Date.now() - t0) / 1000)}초\n`);
  for (const line of checkReport(results, opts.tables)) console.log(line);
  return results.some((r) => LISTED.includes(r.verdict)) ? 2 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`실행 오류: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
