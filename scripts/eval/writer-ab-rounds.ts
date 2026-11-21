// 공통 지식 맥락 줄이기(2026-11-21) 검증 — 여러 회차의 쌍 심사 합치기(AI 안 부름, 파일만 읽음).
// 입력: 회차마다 writer-ab-judge.ts의 <폴더>/judge/summary.json(쌍 결과·지표). 같은 회차를 폴더 여럿에서 기능을 나눠 가져올 수 있음
//  (예: r1의 작성지원은 FIX1 뒤 new를 돌린 폴더, 질문·코멘트는 1회차 폴더).
// 실행: node scripts/eval/writer-ab-rounds.ts --out <폴더> --src <회차>=<폴더>[:<기능,…>] [--src …] [--exclude <폴더 이름>=<기능>@<카드 id> …]
//  --exclude: 그 폴더(--src 폴더의 마지막 이름)에서 그 쌍만 뺌 — 같은 회차의 다른 폴더(새 판 표본)는 그대로(예: biz-r1x=improve@주요사업1/2-가)
//  끝내 실패 수는 그 폴더의 실패 기록(<기능>.fail.json) 중 성공 기록이 없는 것을 그 기능만 셈.
//  결과: <out>/summary.json·summary.md — 모든 회차를 모은 통과 기준 (1)~(4) + 쌍마다 회차별 결론·new 승률·오류 평균·첫 호출 입력 평균
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AB_ARMS, type AbArm, type AbPairOutcome, type RoundPairs, abSummaryTable, combineRounds, failFile, parseFeatures, recordFile, roundsTable } from "./writer-ab-core.ts";

const argv = process.argv.slice(2);
const outArg = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : undefined;
const srcs = argv.flatMap((a, i) => (a === "--src" && argv[i + 1] ? [argv[i + 1]] : []));
/** 뺄 쌍: "<폴더 이름>|<기능>|<카드 id>" */
const excludes = new Set(
  argv.flatMap((a, i) => (a === "--exclude" && argv[i + 1] ? [argv[i + 1]] : [])).map((x) => {
    const eq = x.indexOf("="), at = x.indexOf("@");
    if (eq < 1 || at < eq + 2) throw new Error(`--exclude 형식: <폴더 이름>=<기능>@<카드 id> — ${x}`);
    return `${x.slice(0, eq)}|${x.slice(eq + 1, at)}|${x.slice(at + 1)}`;
  }),
);
if (!outArg || !srcs.length) {
  console.error("usage: node scripts/eval/writer-ab-rounds.ts --out <폴더> --src <회차>=<폴더>[:<기능,…>] [--src …]");
  process.exit(1);
}
const rounds = new Map<string, RoundPairs>();
const sources: Array<{ round: string; dir: string; features: string[]; pairs: number }> = [];
for (const s of srcs) {
  const eq = s.indexOf("=");
  if (eq < 1) throw new Error(`--src 형식: <회차>=<폴더>[:<기능,…>] — ${s}`);
  const round = s.slice(0, eq);
  const rest = s.slice(eq + 1);
  const colon = rest.lastIndexOf(":");
  const hasFeatures = colon > 0 && !rest.slice(colon + 1).includes("/");
  const dir = resolve(hasFeatures ? rest.slice(0, colon) : rest);
  const features = parseFeatures(hasFeatures ? rest.slice(colon + 1) : undefined);
  const sumFile = join(dir, "judge", "summary.json");
  if (!existsSync(sumFile)) throw new Error(`심사 요약이 없습니다: ${sumFile}`);
  const pairs = (JSON.parse(readFileSync(sumFile, "utf8")) as { pairs: AbPairOutcome[] }).pairs.filter((p) => features.includes(p.feature) && !excludes.has(`${dir.split("/").pop()}|${p.feature}|${p.cardId}`));
  const uids = [...new Set(AB_ARMS.flatMap((arm) => (existsSync(join(dir, arm)) ? readdirSync(join(dir, arm)).filter((d) => statSync(join(dir, arm, d)).isDirectory()) : [])))];
  const failures = Object.fromEntries(AB_ARMS.map((arm) => [arm, uids.reduce((n, uid) => n + features.filter((f) => existsSync(failFile(dir, arm, uid, f)) && !existsSync(recordFile(dir, arm, uid, f))).length, 0)])) as Record<AbArm, number>;
  const r = rounds.get(round) ?? { round, pairs: [], failures: { base: 0, new: 0 } };
  r.pairs.push(...pairs);
  r.failures = { base: r.failures.base + failures.base, new: r.failures.new + failures.new };
  rounds.set(round, r);
  sources.push({ round, dir, features, pairs: pairs.length });
}
const c = combineRounds([...rounds.values()]);
const out = resolve(outArg);
mkdirSync(out, { recursive: true });
const md = [
  `# 공통 지식 맥락 줄이기 — 회차 합친 쌍 심사 (${new Date().toISOString()})`,
  `출처: ${sources.map((s) => `${s.round}=${s.dir.split("/").slice(-1)[0]}:${s.features.join(",")}(${s.pairs}쌍)`).join(" · ")}${excludes.size ? ` · 뺀 쌍: ${[...excludes].join(", ")}` : ""}`,
  "## 통과 기준(모든 회차의 쌍을 한데 모음)",
  abSummaryTable(c.pooled),
  "## 쌍마다 회차별 결론(결론(확신) 지어냄+사실 오류 base→new)",
  roundsTable(c),
].join("\n\n");
writeFileSync(join(out, "summary.json"), JSON.stringify({ createdAt: new Date().toISOString(), sources, ...c }, null, 1));
writeFileSync(join(out, "summary.md"), md);
console.log(md);
