// 앱 밖 기준 문서(report-harness, pdca 운영 지침)를 고정 사본으로 들여옵니다.
//
//   pnpm harness:sync                      # 전부
//   pnpm harness:sync pdca                 # 하나만
//   REPORT_HARNESS_DIR=/경로 PDCA_DIR=/경로 pnpm harness:sync
//
// 앱은 실행 중에 원본을 읽지 않습니다(독립 원칙). 사본은 손으로 고치지 않고 원본을 고친 뒤 다시 들여옵니다.
// 사본과 SOURCE.json의 해시는 lib/harness/harness.test.ts가 대조합니다.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HARNESS_SOURCES, type HarnessSource } from "../../lib/harness/files.ts";

const ROOT = resolve(import.meta.dirname, "../..");

function syncOne(source: HarnessSource) {
  const from = resolve(process.env[source.env] ?? join(ROOT, source.defaultPath));
  const git = (...args: string[]) => execFileSync("git", ["-C", from, ...args], { encoding: "utf8" }).trim();
  if (!existsSync(from)) throw new Error(`${source.id} 원본 폴더가 없습니다: ${from}`);
  if (source.git) {
    if (!existsSync(join(from, ".git"))) throw new Error(`${source.id}: git 저장소가 아닙니다: ${from}`);
    const dirty = git("status", "--porcelain", "--", ...source.files.map((f) => f.src));
    if (dirty) throw new Error(`${source.id}에 커밋하지 않은 변경이 있습니다. 커밋한 뒤 다시 실행하세요:\n${dirty}`);
  }
  const dest = join(ROOT, source.dir);
  mkdirSync(dest, { recursive: true });
  const files = source.files.map((f) => {
    const src = join(from, f.src);
    copyFileSync(src, join(dest, f.dest));
    const buf = readFileSync(src);
    return {
      dest: f.dest,
      src: f.src,
      bytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
      ...(source.git ? {} : { modified: statSync(src).mtime.toISOString() }),
    };
  });
  const info = {
    note: `${source.id} 고정 사본. 손으로 고치지 말고 원본을 고친 뒤 \`pnpm harness:sync ${source.id}\`로 다시 들여옵니다.`,
    ...(source.repository ? { repository: source.repository } : { origin: source.defaultPath }),
    ...(source.git
      ? { commit: git("rev-parse", "HEAD"), commit_date: git("log", "-1", "--format=%cI"), commit_subject: git("log", "-1", "--format=%s") }
      : {}),
    files,
  };
  writeFileSync(join(dest, "SOURCE.json"), JSON.stringify(info, null, 2) + "\n");
  console.log(`${source.id} → ${source.dir}`);
  for (const f of files) console.log(`  ${f.dest} ${f.bytes}B`);
}

const only = process.argv[2];
for (const s of HARNESS_SOURCES) if (!only || s.id === only) syncOne(s);
