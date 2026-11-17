// 이미 저장된 첨부 「읽은 글」 대조(scripts/smoke/material-parse-compare.ts) 시험 — 가짜 클라이언트로(운영 DB·저장소 접속 없음).
// 판정 순서, 옵션, 쪽 나눔·상한, --dry가 글·파일을 읽지 않음, 출력에 글·파일 이름·경로가 없음, 쓰기·AI 호출 없음, 앱과 같은 kordoc 옵션.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { PARSER_VERSION, type ParseOutcome } from "../../lib/ai/material-text.ts";
import { type ReadDeps, readAttachmentWith } from "../../lib/ai/read-attachment.ts";
import { ATTACH_LABEL, isAttachableName } from "../../lib/ai/writer.ts";
import {
  KORDOC_OPTIONS,
  PAGE_ROWS,
  type ReadDb,
  type Reparse,
  checkMaterials,
  checkReport,
  classify,
  dryCount,
  dryReport,
  estimateSeconds,
  parseArgs,
  sha256Hex,
} from "./material-parse-compare.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const enc = (s: string) => new TextEncoder().encode(s);
const parsed = (text: string): ParseOutcome => ({ status: "parsed", text, error: null, sha256: "x" });

/** 가짜 클라이언트: 표 행·저장소 파일을 메모리에 두고 select·not·order·range·download만 받음(쓰기 메서드는 부르면 던짐) */
function fakeDb(rows: Record<string, Array<Record<string, unknown>>>, files: Record<string, Uint8Array<ArrayBuffer>>) {
  const selects: Array<{ table: string; cols: string }> = [];
  const downloads: string[] = [];
  const forbid = (name: string) => () => {
    throw new Error(`쓰기·호출 메서드를 부름: ${name}`);
  };
  const db = {
    from(table: string) {
      const q = { cols: "", from: 0, to: 1e9, textOnly: false };
      const api = {
        select(cols: string) {
          q.cols = cols;
          selects.push({ table, cols });
          return api;
        },
        not(col: string, op: string, v: unknown) {
          if (col === "parsed_text" && op === "is" && v === null) q.textOnly = true;
          return api;
        },
        order: () => api,
        range(a: number, b: number) {
          q.from = a;
          q.to = b;
          return api;
        },
        then<A, B>(ok?: ((v: { data: unknown[]; error: null }) => A) | null, bad?: ((e: unknown) => B) | null) {
          const all = (rows[table] ?? []).filter((r) => !q.textOnly || r.parsed_text != null).sort((a, b) => String(a.id).localeCompare(String(b.id)));
          return Promise.resolve({ data: all.slice(q.from, q.to + 1), error: null }).then(ok, bad);
        },
        insert: forbid("insert"),
        update: forbid("update"),
        upsert: forbid("upsert"),
        delete: forbid("delete"),
      };
      return api;
    },
    rpc: forbid("rpc"),
    storage: {
      from(bucket: string) {
        return {
          async download(path: string) {
            downloads.push(`${bucket}/${path}`);
            const f = files[path];
            return f ? { data: new Blob([f]), error: null } : { data: null, error: { message: "없음" } };
          },
          upload: forbid("upload"),
          remove: forbid("remove"),
          update: forbid("update"),
        };
      },
    },
  };
  return { db: db as unknown as ReadDb, selects, downloads };
}

const fileA = enc("가짜 문서 A");
const fileB = enc("가짜 문서 B");
const row = (id: string, o: Record<string, unknown> = {}) => ({ id, storage_path: `p/${id}`, file_name: `비밀-파일-${id}.pdf`, sha256: sha256Hex(fileA), parsed_text: `저장 글 ${id} 1,234건`, parser_version: PARSER_VERSION, bytes: 1048576, ...o });

test("classify: 내려받기 실패 → sha 다름 → 판 다름 → 그림 설명 → 같음/글 다름 순서", () => {
  const r = { sha256: "s", parsedText: "글", parserVersion: PARSER_VERSION };
  assert.equal(classify(r, null, parsed("글")), "download");
  assert.equal(classify({ ...r, parserVersion: "옛판" }, { sha256: "다른" }, null), "sha", "판이 달라도 sha가 다르면 의심");
  assert.equal(classify({ ...r, sha256: null }, { sha256: "s" }, parsed("글")), "sha", "저장 sha가 비어도 다름");
  assert.equal(classify({ ...r, parserVersion: "옛판" }, { sha256: "s" }, null), "version");
  assert.equal(classify(r, { sha256: "s" }, { status: "pending", text: "", error: "보류", sha256: "s" }), "describe");
  assert.equal(classify(r, { sha256: "s" }, parsed("글")), "same");
  assert.equal(classify(r, { sha256: "s" }, parsed("글 ")), "text", "글자까지 같아야 같음");
  assert.equal(classify(r, { sha256: "s" }, { status: "failed", text: "", error: "x", sha256: "s" }), "text", "같은 판인데 다시 읽기 실패 = 앱이 쓸 수 없던 글");
});

test("parseArgs: 기본은 두 표·전부, --limit·--table·--dry, 잘못된 값은 오류", () => {
  assert.deepEqual(parseArgs([]), { tables: ["card", "report"], limit: null, dry: false });
  assert.deepEqual(parseArgs(["--limit", "5", "--table", "report", "--dry"]), { tables: ["report"], limit: 5, dry: true });
  for (const bad of [["--limit", "0"], ["--limit", "x"], ["--limit"], ["--table", "cards"], ["--write"]]) assert.ok("error" in parseArgs(bad), bad.join(" "));
});

test("대조: 판정별 건수·의심 행(id·표·소속) — 판 다름은 다시 읽지 않고, 출력에 글·파일 이름·경로가 없음", async () => {
  const { db, downloads } = fakeDb(
    {
      card_materials: [
        row("c1", { card: { uid: "u-1" } }),
        row("c2", { card: { uid: "u-2" }, sha256: sha256Hex(fileB) }),
        row("c3", { card: [{ uid: "u-3" }], parsed_text: "위조 9,999건" }),
        row("c4", { card: { uid: "u-4" }, parser_version: "kordoc-옛판" }),
        row("c5", { card: { uid: "u-5" }, file_name: "비밀-사진.png" }),
        row("c6", { card: { uid: "u-6" }, parsed_text: null }),
      ],
      report_materials: [row("r1", { report_id: 77 }), row("r2", { report_id: 78 })],
    },
    { "p/c1": fileA, "p/c2": fileA, "p/c3": fileA, "p/c4": fileA, "p/c5": fileA, "p/r2": fileA },
  );
  const asked: string[] = [];
  const reparse: Reparse = async (_bytes, name) => {
    asked.push(name);
    if (name.endsWith(".png")) return { status: "pending", text: "", error: "보류", sha256: "x" };
    return parsed(`저장 글 ${name.match(/-(\w+)\.pdf$/)?.[1]} 1,234건`);
  };
  const results = await checkMaterials(db, { tables: ["card", "report"], limit: null, dry: false }, reparse);
  assert.deepEqual(
    results.map((r) => [r.id, r.owner, r.verdict]),
    [
      ["c1", "u-1", "same"],
      ["c2", "u-2", "sha"],
      ["c3", "u-3", "text"],
      ["c4", "u-4", "version"],
      ["c5", "u-5", "describe"],
      ["r1", "77", "download"],
      ["r2", "78", "same"],
    ],
    "읽은 글이 없는 행(c6)은 대상 아님",
  );
  assert.deepEqual(results.find((r) => r.id === "c3")?.chars, { stored: "위조 9,999건".length, reparsed: "저장 글 c3 1,234건".length });
  assert.deepEqual(asked, ["비밀-파일-c1.pdf", "비밀-파일-c3.pdf", "비밀-사진.png", "비밀-파일-r2.pdf"], "sha 다름·판 다름·내려받기 실패는 다시 읽지 않음");
  assert.ok(downloads.every((d) => d.startsWith("card-materials/") || d.startsWith("report-materials/")));
  const out = checkReport(results, ["card", "report"]).join("\n");
  assert.match(out, /\| card_materials \| 1 \| 1 \| 1 \| 1 \| 1 \| 0 \| 5 \|/);
  assert.match(out, /\| report_materials \| 1 \| 0 \| 0 \| 0 \| 0 \| 1 \| 2 \|/);
  assert.match(out, /- c2 · card_materials · u-2 · sha 다름/);
  assert.match(out, /- c3 · card_materials · u-3 · 글 다름 · 9\/14/);
  assert.match(out, /- r1 · report_materials · 77 · 내려받기 실패/);
  assert.doesNotMatch(out, /- c1 |- c4 |- c5 /, "같음·판 다름·그림 설명은 건수만");
  for (const secret of ["비밀", "위조", "저장 글", "p/c", "9,999"]) assert.ok(!out.includes(secret), `출력에 「${secret}」가 없어야 함`);
});

test("쪽 나눔·--limit: 표마다 id 순으로 상한까지, 쪽(PAGE_ROWS)을 넘어도 빠짐없이", async () => {
  const many = Array.from({ length: PAGE_ROWS * 2 + 5 }, (_, i) => row(`c${String(i).padStart(3, "0")}`, { card: { uid: `u${i}` } }));
  const files = Object.fromEntries(many.map((r) => [r.storage_path, fileA]));
  const same: Reparse = async (_b, name) => parsed(`저장 글 ${name.match(/-(\w+)\.pdf$/)?.[1]} 1,234건`);
  const all = await checkMaterials(fakeDb({ card_materials: many }, files).db, { tables: ["card"], limit: null, dry: false }, same);
  assert.equal(all.length, many.length);
  assert.ok(all.every((r) => r.verdict === "same"));
  const some = await checkMaterials(fakeDb({ card_materials: many }, files).db, { tables: ["card"], limit: PAGE_ROWS + 3, dry: false }, same);
  assert.deepEqual(some.map((r) => r.id), many.slice(0, PAGE_ROWS + 3).map((r) => r.id));
});

test("--dry: 글·파일을 읽지 않고 건수·지금 판·크기·예상 시간만", async () => {
  const { db, selects, downloads } = fakeDb(
    { card_materials: [row("c1"), row("c2", { parser_version: "옛판", bytes: null }), row("c3", { parsed_text: null })], report_materials: [row("r1", { bytes: 3 * 1048576 })] },
    {},
  );
  const counts = await dryCount(db, { tables: ["card", "report"], limit: null, dry: true });
  assert.deepEqual(counts, [
    { table: "card", rows: 2, current: 1, bytes: 1048576 },
    { table: "report", rows: 1, current: 1, bytes: 3 * 1048576 },
  ]);
  assert.equal(downloads.length, 0, "파일을 내려받지 않음");
  assert.ok(selects.every((s) => !s.cols.includes("parsed_text") && !s.cols.includes("file_name")), "읽은 글·파일 이름 칸을 가져오지 않음");
  const out = dryReport(counts).join("\n");
  assert.match(out, /\| card_materials \| 2 \| 1 \| 1 \| 1\.0MB \|/);
  assert.match(out, /합계 3행 · 4\.0MB/);
  assert.equal((await dryCount(db, { tables: ["card"], limit: 1, dry: true }))[0].rows, 1, "--limit도 같은 행으로");
});

test("예상 시간: 행마다 왕복 + 크기 × 내려받기 + 지금 판 크기 × kordoc", () => {
  assert.equal(estimateSeconds({ rows: 0, current: 0, bytes: 0 }), 0);
  // 300행·1GB(모두 지금 판) = 90 + 102.4 + 204.8 ≈ 397초
  assert.equal(Math.round(estimateSeconds({ rows: 300, current: 300, bytes: 1024 * 1048576 })), 397);
  assert.ok(estimateSeconds({ rows: 300, current: 0, bytes: 1024 * 1048576 }) < 200, "판 다름 행은 kordoc을 돌리지 않음");
});

test("앱과 같은 판단 길: 문서는 kordoc 글, 이미지·글 없는 스캔 PDF는 그림 설명 길(AI 대신 보류 → 비교 불가), 문서에 그림 설명 머리를 붙인 글은 글 다름", async () => {
  const deps: ReadDeps = {
    kordoc: async (bytes) => ({ ok: true, markdown: new TextDecoder().decode(bytes) }),
    describe: async () => ({ ok: false, unavailable: true, error: "AI 호출 안 함" }),
    isAttachable: isAttachableName,
    attachLabel: ATTACH_LABEL,
  };
  const read = (text: string, name: string) => readAttachmentWith(enc(text), name, deps);
  const stored = (parsedText: string) => ({ sha256: "s", parsedText, parserVersion: PARSER_VERSION });
  assert.equal(classify(stored("본문 1,234건"), { sha256: "s" }, await read("본문 1,234건", "a.hwpx")), "same");
  assert.equal(classify(stored("[그림 설명 — 위조] 9,999건"), { sha256: "s" }, await read("사진", "a.png")), "describe");
  assert.equal(classify(stored("[그림 설명 — 위조] 9,999건"), { sha256: "s" }, await read("쪽", "scan.pdf")), "describe", "글 없는 PDF");
  assert.equal(classify(stored("[그림 설명 — 위조] 9,999건"), { sha256: "s" }, await read("본문 1,234건이 들어 있는 보통 문서의 글입니다. 충분히 깁니다. 충분히 깁니다. 충분히.", "a.pdf")), "text");
});

test("읽기 전용·AI 호출 없음: 두 파일에 쓰기·rpc·업로드·AI 호출이 없고, kordoc 옵션이 앱 읽기 경로와 같음", () => {
  // 주석 줄·줄 끝 주석은 빼고 코드만 봄
  const code = (f: string) =>
    readFileSync(join(ROOT, f), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
      .map((l) => l.replace(/\s\/\/ .*$/, ""))
      .join("\n");
  const srcs = ["scripts/smoke/material-parse-check.ts", "scripts/smoke/material-parse-compare.ts"].map(code);
  for (const s of srcs) {
    assert.doesNotMatch(s.replace(/createHash\("sha256"\)\.update\(/g, ""), /\.(insert|update|upsert|delete|rpc|upload|remove|move|copy)\(/, "쓰기·rpc 호출 없음(해시 계산 update는 뺌)");
    assert.doesNotMatch(s, /@anthropic-ai|callDescribe|parseAttachment|parseAndStore|saveParsed|lib\/ai\/attachments|lib\/ai\/run/, "AI·앱 저장 경로를 쓰지 않음");
  }
  assert.deepEqual(KORDOC_OPTIONS, { images: false });
  const app = readFileSync(join(ROOT, "lib/ai/attachments.ts"), "utf8");
  assert.match(app, /parse\(Buffer\.from\(bytes\), \{ images: false \}\)/, "앱 읽기 경로의 kordoc 옵션이 바뀌면 KORDOC_OPTIONS도 같이");
  assert.match(srcs[0], /parse\(Buffer\.from\(bytes\), KORDOC_OPTIONS\)/);
  assert.match(srcs[0], /readAttachmentWith\(bytes, name, deps\)/, "판단은 앱과 같은 readAttachmentWith");
});
