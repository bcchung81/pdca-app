// 경영관리 프레임워크 12종(data/templates/경영관리프레임워크, 241203판 hwp·hwpx — git 밖) → resources/knowledge/_derived/framework-mg.json(git 밖).
// 수동 실행 전용: node scripts/knowledge/framework-mg.ts [--check]   (--check는 파일을 쓰지 않고 지금 데이터와 같은지만 봄)
// 원본에서 가져오는 것은 표 칸의 라벨(추진배경·추진내용 …)과 대주제·절 제목 줄이지만 기관 내부 틀의 파생물이라 저장소에 넣지 않습니다(2026-10-09 사용자 결정 —
// 앱은 실행 중에 이 파일을 읽지 않고, 구성안의 틀은 lib/reports/frameworks-mg.ts 이야기 틀과 DB의 전년 보고서 절 조각으로 고름). 읽기 규칙은 lib/reports/framework-mg.ts.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "kordoc";
import { type FrameworkMgEntry, parseFrameworkMg } from "../../lib/reports/framework-mg.ts";

const DIR = resolve(import.meta.dirname, "../../data/templates/경영관리프레임워크");
const OUT = resolve(import.meta.dirname, "../../resources/knowledge/_derived/framework-mg.json");

/** 파일 이름의 지표 번호 → 평가단위(지침 08 지표 번호). 국민소통 1-(3)은 카드가 없어 null */
const UNIT_OF_FILE: Record<string, string | null> = {
  "1-(1)": "MG-1",
  "1-(2)": "MG-2",
  "1-(3)": null,
  "2-(1)": "MG-3",
  "2-(2)": "MG-4",
  "2-(3)": "MG-5",
  "2-(4)": "MG-6",
  "2-(5)": "MG-7",
  "3-(1)": "MG-8",
  "4-(1)": "MG-9",
  "4-(2)": "MG-10",
  "4-(3)": "MG-11",
};

const entries: FrameworkMgEntry[] = [];
for (const name of readdirSync(DIR).filter((f) => /\.hwpx?$/.test(f)).sort()) {
  const file = name.match(/_(\d-\(\d\))/)?.[1];
  if (!file || !(file in UNIT_OF_FILE)) throw new Error(`알 수 없는 프레임워크 파일: ${name}`);
  const buf = readFileSync(resolve(DIR, name));
  const r = await parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (!r.success) throw new Error(`읽지 못함: ${name}`);
  entries.push({ file, unit: UNIT_OF_FILE[file], template: parseFrameworkMg(r.markdown ?? "") });
}
entries.sort((a, b) => a.file.localeCompare(b.file));
if (entries.length !== Object.keys(UNIT_OF_FILE).length) throw new Error(`프레임워크 파일 ${entries.length}개 — 12개여야 함`);

const src = `${JSON.stringify(entries, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const now = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  console.log(now === src ? "같음" : "다름 — node scripts/knowledge/framework-mg.ts로 다시 만드세요");
  process.exit(now === src ? 0 : 1);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, src);
console.log(`프레임워크 ${entries.length}종 → ${OUT} (${(src.length / 1024).toFixed(0)}KB)`);
