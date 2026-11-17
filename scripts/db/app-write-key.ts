// 앱 서버 경유 표지(APP_WRITE_KEY — lib/supabase/app-write.ts)의 DB 등록값 만들기(근본책 1단계, 2026-11-17).
// DB(private.app_write_key)에는 비밀이 아니라 sha256 hex만 둡니다. 이 스크립트는 비밀 자체를 화면에 내지 않습니다. DB에 접속하지 않습니다.
//
//   node --env-file-if-exists=.env.local scripts/db/app-write-key.ts
//       환경변수 APP_WRITE_KEY의 sha256 hex 한 줄만 출력(표준 출력). 등록 SQL 예시는 표준 오류로
//   node scripts/db/app-write-key.ts --new <git 밖 파일>
//       새 비밀(32바이트 난수 hex 64자)을 그 파일에 씀(권한 600, 이미 있으면 덮지 않고 멈춤, 저장소 안 경로는 거절) → 해시만 출력.
//       Vercel에 넣을 때: vercel env add APP_WRITE_KEY production < <파일>
//
// 해시는 DB의 private.app_write()와 같은 식(머리글 값의 UTF-8 바이트 sha256, 소문자 hex)이고, 앱처럼 앞뒤 공백을 걷은 값으로 셉니다.

import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");

/** 표지 값 꼴: 32바이트 난수 hex(64자) */
export const isAppWriteKey = (key: string): boolean => /^[0-9a-f]{64}$/i.test(key);

/** DB 등록값: 앞뒤 공백을 걷은 값(앱이 머리글에 싣는 값)의 sha256 소문자 hex */
export function appWriteKeyHash(key: string): string {
  return createHash("sha256").update(key.trim(), "utf8").digest("hex");
}

/** 새 표지 값(32바이트 난수 hex) */
export const newAppWriteKey = (): string => randomBytes(32).toString("hex");

/** 저장소 안 경로인가(비밀 파일을 git에 넣을 위험 — .gitignore 여부와 관계없이 거절) */
export function insideRepo(path: string, root = ROOT): boolean {
  const rel = relative(root, resolve(path));
  return !(rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

function main(argv: string[]): void {
  const i = argv.indexOf("--new");
  let key: string;
  if (i >= 0) {
    const file = argv[i + 1];
    if (!file) throw new Error("사용법: --new <git 밖 파일 경로>");
    if (insideRepo(file)) throw new Error(`저장소 안에는 비밀 파일을 만들지 않습니다(${file}) — 저장소 밖 경로를 주세요`);
    key = newAppWriteKey();
    writeFileSync(resolve(file), key, { mode: 0o600, flag: "wx" });
    console.error(`새 표지를 ${resolve(file)}에 썼습니다(권한 600). 비밀은 화면에 내지 않습니다.`);
  } else {
    key = (process.env.APP_WRITE_KEY ?? "").trim();
    if (!key) throw new Error("APP_WRITE_KEY가 비었습니다 — 환경변수로 주거나 --new <파일>로 새로 만드세요");
  }
  if (!isAppWriteKey(key)) throw new Error("APP_WRITE_KEY는 32바이트 난수 hex(64자)여야 합니다");
  const hash = appWriteKeyHash(key);
  console.log(hash);
  console.error(`등록(운영자가 SQL 편집기에서, 교체 기간에는 최대 2행): insert into private.app_write_key (hash, note) values ('${hash}', '<언제·누가>');`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
