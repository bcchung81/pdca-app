// 표지 등록값 스크립트(scripts/db/app-write-key.ts) 시험 — DB 함수(private.app_write())와 같은 해시인지 PGlite의 sha256으로 대조, 비밀은 출력하지 않음
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { appWriteKeyHash, insideRepo, isAppWriteKey, newAppWriteKey } from "./app-write-key.ts";

const SCRIPT = resolve(import.meta.dirname, "app-write-key.ts");
const KEY = "0123456789abcdef".repeat(4);

test("해시: DB의 sha256(UTF-8 바이트) 소문자 hex와 같음, 앞뒤 공백은 걷음(앱 머리글과 같은 값)", async () => {
  const db = new PGlite();
  const { rows } = await db.query<{ h: string }>("select encode(sha256(convert_to($1, 'UTF8')), 'hex') as h", [KEY]);
  await db.close();
  assert.equal(appWriteKeyHash(KEY), rows[0].h);
  assert.equal(appWriteKeyHash(` ${KEY}\n`), rows[0].h);
  assert.match(appWriteKeyHash(KEY), /^[0-9a-f]{64}$/);
});

test("새 값은 64자 hex 난수, 꼴 검사, 저장소 안 경로 판정", () => {
  const a = newAppWriteKey();
  assert.ok(isAppWriteKey(a));
  assert.notEqual(a, newAppWriteKey());
  assert.ok(!isAppWriteKey("abc"));
  assert.ok(!isAppWriteKey(`${KEY}x`));
  const root = resolve(import.meta.dirname, "../..");
  assert.ok(insideRepo(join(root, ".env.local")));
  assert.ok(insideRepo(root));
  assert.ok(!insideRepo(join(tmpdir(), "k")));
  assert.ok(!insideRepo(join(root, "..", "other", "k")));
});

test("실행: 환경변수의 해시 한 줄만 표준 출력(비밀은 어디에도 안 나옴), --new는 저장소 밖 파일에 권한 600으로 쓰고 덮지 않음", () => {
  const base: NodeJS.ProcessEnv = { ...process.env };
  delete base.APP_WRITE_KEY;
  const env = { ...base, APP_WRITE_KEY: KEY };
  const r = spawnSync(process.execPath, [SCRIPT], { env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${appWriteKeyHash(KEY)}\n`);
  assert.ok(!r.stdout.includes(KEY) && !r.stderr.includes(KEY));
  // 빈 값·틀린 꼴은 멈춤
  assert.equal(spawnSync(process.execPath, [SCRIPT], { env: base, encoding: "utf8" }).status, 1);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { env: { ...base, APP_WRITE_KEY: "short" }, encoding: "utf8" }).status, 1);
  // --new
  const dir = mkdtempSync(join(tmpdir(), "app-write-"));
  const file = join(dir, "key");
  const out = execFileSync(process.execPath, [SCRIPT, "--new", file], { env: base, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const secret = readFileSync(file, "utf8");
  assert.ok(isAppWriteKey(secret));
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(out, `${appWriteKeyHash(secret)}\n`);
  assert.ok(!out.includes(secret));
  assert.equal(spawnSync(process.execPath, [SCRIPT, "--new", file], { env: base, encoding: "utf8" }).status, 1, "이미 있으면 덮지 않음");
  assert.equal(readFileSync(file, "utf8"), secret);
  const inRepo = spawnSync(process.execPath, [SCRIPT, "--new", resolve(import.meta.dirname, "x-key")], { env: base, encoding: "utf8" });
  assert.equal(inRepo.status, 1);
  assert.match(inRepo.stderr, /저장소 안/);
  rmSync(dir, { recursive: true, force: true });
});
