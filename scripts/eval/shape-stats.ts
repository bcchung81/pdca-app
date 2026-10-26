// 경평 초안 도식 다양화 측정(수동 실행 전용, 2026-10-12) — 초안 spec의 블록 모양(kind:variant) 단위 지표를 표로 찍음. DB·AI를 쓰지 않음(파일만 읽음).
// 실행: node --conditions=react-server scripts/eval/shape-stats.ts <초안 JSON 파일 또는 폴더 …> [--exclude <파일 이름에 든 글> …] [--json]
//  읽는 형식 두 가지:
//   ① 주요사업 평가 산출물 docs/analysis/eval/<라운드>/drafts/*.html.json — spec 그대로(폴더를 주면 그 폴더나 그 아래 drafts/의 *.html.json, *.outline.json은 뺌)
//   ② 경영관리 연기 시험 --json 산출물(scripts/smoke/ai-report-mg-smoke.ts) — { card, spec, composition, … }의 spec
//  지표(lib/reports/eval-stats.ts shapeStats): 카드별 블록 수·글·띠 뺀 블록 수·서로 다른 모양 수, 세트 전체 모양 분포의 엔트로피·상위 3 점유·표 비중·
//  이 과제만의 요소가 있는 카드 비율·새 표 모양(table:result·bars·chevron·ladder) 사용 수, 배치(layoutStats — 2026-10-12): 배치별 블록 수·
//  라벨 사다리 아닌 배치(전폭 배치·단 띠·가로 반씩)를 쓴 카드 비율. --json이면 표 대신 JSON 한 덩어리.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { layoutStats, shapeStats } from "../../lib/reports/eval-stats.ts";
import type { LooseJson } from "../../lib/loose-json.ts";

type Json = LooseJson;

const args = process.argv.slice(2);
const excludes = args.flatMap((a, i) => (args[i - 1] === "--exclude" ? [a] : []));
const paths = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--exclude");
if (!paths.length) {
  console.error("usage: node --conditions=react-server scripts/eval/shape-stats.ts <초안 JSON 파일 또는 폴더 …> [--exclude <글> …] [--json]");
  process.exit(1);
}

/** 폴더 → 초안 JSON 파일(그 폴더 또는 drafts/ 아래 *.html.json — 구성안 파일 제외) */
function filesOf(p: string): string[] {
  if (!statSync(p).isDirectory()) return [p];
  const dir = existsSync(join(p, "drafts")) ? join(p, "drafts") : p;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".outline.json"))
    .sort()
    .map((f) => join(dir, f));
}

/** 파일 → { id, spec } (spec이 아니면 null) */
function readDraft(file: string): { id: string; spec: Json } | null {
  let raw: Json;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const spec = raw?.version === 3 && Array.isArray(raw.blocks) ? raw : raw?.spec?.version === 3 && Array.isArray(raw.spec.blocks) ? raw.spec : null;
  if (!spec) return null;
  return { id: String(raw?.card && typeof raw.card === "string" ? raw.card : spec.card?.id || basename(file)), spec };
}

const drafts: Array<{ id: string; file: string; blocks: Array<{ kind: string; variant: string; label: string; layout?: string; span?: string }>; at?: string[] }> = [];
for (const p of paths)
  for (const f of filesOf(p)) {
    if (excludes.some((x) => basename(f).includes(x))) continue;
    const d = readDraft(f);
    if (!d) {
      console.warn(`초안 spec이 아님(건너뜀): ${f}`);
      continue;
    }
    drafts.push({
      id: d.id,
      file: basename(f),
      blocks: (d.spec.blocks as Json[]).map((b) => ({ kind: String(b.kind), variant: String(b.variant ?? ""), label: String(b.label ?? ""), ...(b.layout ? { layout: String(b.layout) } : {}), ...(b.span ? { span: String(b.span) } : {}) })),
      ...(Array.isArray(d.spec.mg?.at) ? { at: d.spec.mg.at.map(String) } : {}),
    });
  }

const r = shapeStats(drafts);
const lay = layoutStats(drafts);
if (args.includes("--json")) {
  console.log(JSON.stringify({ ...r, layout: lay }, null, 1));
  process.exit(0);
}
console.log(`초안 ${drafts.length}건`);
console.log("카드 | 블록 | 글·띠 뺀 블록 | 서로 다른 모양 | 비율");
r.cards.forEach((c, i) => console.log(`${c.id}${drafts[i].file.includes(".direct.") ? " (바로 만들기)" : ""} | ${c.blocks} | ${c.counted} | ${c.distinct} | ${c.ratio}`));
console.log(`평균 서로 다른 모양 ${r.avgDistinct} · 평균 비율 ${r.avgRatio}`);
console.log(`모양 엔트로피 ${r.entropyBits}비트 · 상위 3 점유 ${r.top3Share} · 표 비중 ${r.tableShare} · 이 과제만의 요소 있는 카드 ${r.ownCards}(${r.ownShare})`);
console.log(`새 표 모양: ${Object.entries(r.newShapes).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
console.log(`모양 분포: ${Object.entries(r.frequency).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
console.log(`배치(블록 수): ${Object.entries(lay.blocks).map(([k, n]) => `${k} ${n}(${lay.share[k]})`).join(" · ")}`);
console.log(`라벨 사다리 아닌 배치를 쓴 카드 ${lay.otherCards}(${lay.otherShare})`);
