// 경평 초안을 여러 모델(팔)로 쓴 결과를 HTML 한 파일로 나란히 비교한다(파일만 읽음 — DB·모델 호출 없음, 같은 입력 → 같은 HTML).
// 실행: node --conditions=react-server scripts/eval/compare-report.ts <evalDir> [옵션]
//   --out <파일>                 기본 <evalDir>/compare.html
//   --manifest <파일>            기본 <evalDir>/manifest.json
//   --manifest-from-names        manifest가 없는 과거 라운드: drafts/ 파일 이름 앞머리(O-·N-·V0 …)를 팔로, 나머지를 회차(변형)로 봄
//   --scores [접두어=]<파일>      결정론 점수(eval-report-score.ts scores.json) — 여러 번 가능. 접두어는 그 파일의 초안 이름 앞에 붙임(예: N-=…/r2/scores.json). 기본 <evalDir>/scores.json
//   --judge-key <파일>           기본 <evalDir>/judge-key.json (심사 파일은 <evalDir>/judge-*.json 전부, judge-key.json 제외)
//   --arms <id,id,…>             지정한 팔만으로 보고서를 만듦(manifest·심사 집계 전부 거름, 위쪽 부제에 표기)
//   --findings <파일>            기본 <evalDir>/findings.html — 있으면 제목 아래 「팔 설명」 앞에 그대로 끼움(없으면 출력 변화 없음)
// 입력 형식·집계는 compare-report-core.ts. 외부 요청 없음(CSS·JS 인라인).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { fitTextLines } from "../../lib/reports/fit-dom.ts";
import { REPORT_CSS } from "../../lib/reports/section-css.ts";
import { sectionHtml } from "../../lib/reports/section-html.ts";
import { readSection, type ReportSectionSpec } from "../../lib/reports/section.ts";
import { gradeWarnings } from "../../lib/reports/warning-levels.ts";
import {
  type Arm,
  type DraftInfo,
  type DraftSource,
  type JudgeDraft,
  type JudgeFile,
  type Manifest,
  type ScoreRecord,
  agreements,
  armScores,
  asymmetryNote,
  axesOf,
  collectDrafts,
  detMetrics,
  draftScore,
  filterRound,
  findingsSection,
  flawTable,
  judgedByName,
  manifestFromNames,
  pairedWins,
  parseJudge,
  parseManifest,
  scoreIndex,
} from "./compare-report-core.ts";

const args = process.argv.slice(2);
const evalDir = args[0];
if (!evalDir || evalDir.startsWith("--")) {
  console.error("usage: node --conditions=react-server scripts/eval/compare-report.ts <evalDir> [--out f] [--manifest f | --manifest-from-names] [--scores [접두어=]f]… [--judge-key f]");
  process.exit(1);
}
const values = (name: string) => args.flatMap((a, i) => (a === name && args[i + 1] !== undefined ? [args[i + 1]] : []));
const value = (name: string) => values(name)[0];
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

const draftsDir = `${evalDir}/drafts`;
const out = value("--out") ?? `${evalDir}/compare.html`;
const findingsPath = value("--findings") ?? `${evalDir}/findings.html`;
const findingsHtml = existsSync(findingsPath) ? readFileSync(findingsPath, "utf8") : null;

// ───────────── 읽기 ─────────────
const readDraftFile = (name: string): { spec: ReportSectionSpec | null; unknownNumbers: string[] | null; warnings: string[] | null } => {
  const p = `${draftsDir}/${name}.html.json`;
  if (!existsSync(p)) return { spec: null, unknownNumbers: null, warnings: null };
  const raw = readJson(p) as Record<string, unknown>;
  // 명세만 있는 파일(smoke 산출)과, {spec, unknownNumbers, warnings}로 감싼 파일 둘 다
  const wrapped = raw && typeof raw === "object" && raw.spec && typeof raw.spec === "object";
  const spec = readSection(wrapped ? raw.spec : raw);
  let unknownNumbers = wrapped && Array.isArray(raw.unknownNumbers) ? (raw.unknownNumbers as unknown[]).map(String) : null;
  const warnings = wrapped && Array.isArray(raw.warnings) ? (raw.warnings as unknown[]).map(String) : null;
  // 감싸지 않았으면 완성 HTML에서 붉은 점선 표시된 글을 뽑음(없는 숫자 목록은 파일에 안 남기 때문)
  if (!unknownNumbers && existsSync(`${draftsDir}/${name}.html`)) {
    const html = readFileSync(`${draftsDir}/${name}.html`, "utf8");
    const set = new Set<string>();
    for (const m of html.matchAll(/<span class="k-unv"[^>]*>([^<]*)<\/span>/g)) set.add(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    unknownNumbers = [...set];
  }
  return { spec, unknownNumbers, warnings };
};

const fileNames = existsSync(draftsDir)
  ? readdirSync(draftsDir)
      .filter((f) => f.endsWith(".html.json") && !f.endsWith(".outline.json"))
      .map((f) => f.replace(/\.html\.json$/, ""))
      .sort()
  : [];

let manifest: Manifest;
let hasManifest: boolean;
const manifestPath = value("--manifest") ?? `${evalDir}/manifest.json`;
if (args.includes("--manifest-from-names")) {
  manifest = manifestFromNames(fileNames.map((name) => ({ name, card: readDraftFile(name).spec?.card.id ?? "" })));
  hasManifest = false;
} else if (existsSync(manifestPath)) {
  manifest = parseManifest(readJson(manifestPath));
  hasManifest = true;
} else {
  console.error(`manifest가 없습니다: ${manifestPath} — 과거 라운드면 --manifest-from-names`);
  process.exit(1);
}

const armsOpt = value("--arms");
const keyPath = value("--judge-key") ?? `${evalDir}/judge-key.json`;
const rawKey = (existsSync(keyPath) ? readJson(keyPath) : {}) as Record<string, string>;
const rawJudges: JudgeFile[] = readdirSync(evalDir)
  .filter((f) => /^judge-.*\.json$/.test(f) && f !== "judge-key.json")
  .sort()
  .map((f) => parseJudge(readJson(`${evalDir}/${f}`), basename(f, ".json").replace(/^judge-/, "")));
const round = filterRound(manifest, rawJudges, rawKey, armsOpt ? armsOpt.split(",").map((s) => s.trim()).filter(Boolean) : null);
manifest = round.manifest;
const key = round.key;
const judges = round.judges;

const specs = new Map<string, ReportSectionSpec>();
const sources: DraftSource[] = manifest.drafts.map((md) => {
  const f = readDraftFile(md.name);
  if (f.spec) specs.set(md.name, f.spec);
  return { manifest: md, hasFile: Boolean(f.spec), unknownNumbers: f.unknownNumbers, warnings: f.warnings };
});

const scoreSets = (values("--scores").length ? values("--scores") : existsSync(`${evalDir}/scores.json`) ? [`${evalDir}/scores.json`] : []).map((a) => {
  const eq = a.indexOf("=");
  const [prefix, path] = eq > 0 && !a.slice(0, eq).includes("/") ? [a.slice(0, eq), a.slice(eq + 1)] : ["", a];
  return { prefix, records: ((readJson(path) as { records?: ScoreRecord[] }).records ?? []) as ScoreRecord[] };
});
const drafts = collectDrafts(sources, scoreIndex(scoreSets));

const judgeNames = judges.map((j) => j.judge);

// ───────────── 집계 ─────────────
const arms: Arm[] = manifest.arms;
const axes = axesOf(judges);
const judged = judgedByName(judges, key);
const armRows = armScores(arms, drafts, judged, judgeNames, axes);
const pairs = pairedWins(arms, drafts, judged, judgeNames);
const agree = agreements(judges, key);
const det = detMetrics(arms, drafts, hasManifest);
const flaws = flawTable(judges, key, drafts, arms);
const note = asymmetryNote(arms);

// ───────────── HTML ─────────────
const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f2 = (v: number | null) => (v === null ? "" : v.toFixed(2));
const f1 = (v: number | null) => (v === null ? "" : v.toFixed(1));
const pct = (v: number | null) => (v === null ? "" : `${(v * 100).toFixed(1)}%`);
const int = (v: number | null) => (v === null ? "" : String(Math.round(v)));

const table = (head: string[], rows: string[][], cls = "") =>
  `<div class="cmp-scroll"><table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`).join("")}</tbody></table></div>`;

// 1) 맨 위 결론
const best = armRows.filter((r) => r.mean.overall !== null).sort((a, b) => b.mean.overall! - a.mean.overall!)[0];
const lead = best
  ? `심사자 평균 종합 1위: <b>${esc(best.arm)}</b> ${f2(best.mean.overall)}점(심사받은 ${best.n}건). 표본이 작으면 차이는 참고로만 보세요.`
  : "아직 심사 점수가 없습니다.";

const armTable = table(
  ["팔", "라벨", "경로", "모델", "effort", "초안", "생성 실패"],
  arms.map((a) => {
    const d = det.find((x) => x.arm === a.id)!;
    return [esc(a.id), esc(a.label), esc(a.provider ?? ""), esc(a.model ?? ""), esc(a.effort ?? ""), String(d.drafts), d.failed === null ? "" : String(d.failed)];
  }),
  "cmp-lbl",
);

const scoreTable = judges.length
  ? table(
      ["팔", "심사받은 초안", ...judgeNames.map((j) => `종합 · ${esc(j)}`), "종합 평균", ...axes.map(esc)],
      armRows.map((r) => [
        esc(r.arm),
        String(r.n),
        ...judgeNames.map((j) => f2(r.byJudge[j].overall)),
        `<b>${f2(r.mean.overall)}</b>`,
        ...axes.map((a) => f2(r.mean.axes[a])),
      ]),
    ) +
    `<details><summary>심사자별 축 점수</summary>${table(
      ["팔 · 심사자", ...axes.map(esc)],
      armRows.flatMap((r) => judgeNames.map((j) => [`${esc(r.arm)} · ${esc(j)}`, ...axes.map((a) => f2(r.byJudge[j].axes[a]))])),
    )}</details>`
  : `<p class="cmp-muted">심사 파일(judge-*.json)이 없습니다.</p>`;

const pairTable = pairs.length
  ? table(
      ["짝", "평균 기준(승 · 무 · 패)", ...judgeNames.map((j) => `심사 ${esc(j)}(승 · 무 · 패)`)],
      pairs.map((p) => [
        `${esc(p.a)} 대 ${esc(p.b)}`,
        p.n ? `${p.aWins} · ${p.ties} · ${p.bWins} <span class="cmp-muted">(짝 ${p.n})</span>` : "",
        ...judgeNames.map((j) => {
          const t = p.byJudge[j];
          return t.n ? `${t.aWins} · ${t.ties} · ${t.bWins}` : "";
        }),
      ]),
    ) + `<p class="cmp-muted">「승 · 무 · 패」는 앞에 적은 팔 기준입니다(예: 「X 대 Y」의 승 = X가 높은 짝 수). 짝 = 같은 카드·같은 회차에 두 팔 모두 심사 점수가 있는 초안.</p>`
  : `<p class="cmp-muted">짝 비교할 수 있는 초안이 없습니다.</p>`;

const agreeTable = agree.length
  ? table(
      ["심사자 짝", "공통 초안", "순위 스피어만", "종합 피어슨"],
      agree.map((g) => [`${esc(g.a)} · ${esc(g.b)}`, String(g.common), f2(g.spearman), f2(g.pearson)]),
    )
  : `<p class="cmp-muted">심사자가 둘 이상일 때 계산합니다.</p>`;

const detCols: [string, (d: (typeof det)[number]) => string][] = [
  ["초안", (d) => String(d.drafts)],
  ["생성 실패", (d) => (d.failed === null ? "" : String(d.failed))],
  ["없는 숫자(건)", (d) => f2(d.unknownNumbers)],
  ["경고 막힘(건)", (d) => f2(d.blockWarnings)],
  ["경고 참고(건)", (d) => f2(d.infoWarnings)],
  ["판면 채움", (d) => pct(d.fill)],
  ["근거 약한 문장", (d) => pct(d.weakShare)],
  ["평가 논점 커버(/5)", (d) => f2(d.lens)],
  ["도식 다양성(고유 수)", (d) => f2(d.distinct)],
  ["재시도(회)", (d) => f2(d.retries)],
  ["소요 시간(초)", (d) => f1(d.durationSec)],
  ["입력 토큰", (d) => int(d.inputTokens)],
  ["출력 토큰", (d) => int(d.outputTokens)],
  ["캐시 토큰", (d) => int(d.cachedTokens)],
];
const detTable = table(["팔", ...detCols.map(([h]) => h)], det.map((d) => [esc(d.arm), ...detCols.map(([, f]) => f(d))])) +
  `<p class="cmp-muted">팔별 평균입니다. 값이 있는 초안만 평균하고, 파일에 값이 없는 지표는 칸을 비웠습니다(없는 숫자·경고는 완성 HTML의 붉은 점선 글이나 초안 파일의 warnings에서 읽은 것만).</p>`;

// 2) 카드별 절
const cards: string[] = [];
for (const d of drafts) if (!cards.includes(d.card)) cards.push(d.card);
const slotsOf = (card: string) => {
  const s = [...new Set(drafts.filter((d) => d.card === card).map((d) => d.slot))];
  return s.every((x) => /^\d+$/.test(x)) ? s.sort((a, b) => Number(a) - Number(b)) : s.sort();
};

const judgeBlock = (d: DraftInfo): string => {
  const per = judged.get(d.name);
  if (!per) return "";
  const rows = [...per.entries()].map(([jn, j]: [string, JudgeDraft]) => {
    const fab = j.fabrications?.length ? `<li><b>지어낸·어긋난 것</b><ul>${j.fabrications.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></li>` : "";
    return `<div class="cmp-judge"><div class="cmp-judge__h">${esc(jn)} <span class="cmp-muted">종합 ${f1(j.overall)}</span></div><ul>${j.best ? `<li><b>좋은 점</b> ${esc(j.best)}</li>` : ""}${j.flaw ? `<li><b>문제</b> ${esc(j.flaw)}</li>` : ""}${j.fix ? `<li><b>고칠 점</b> ${esc(j.fix)}</li>` : ""}${fab}</ul></div>`;
  });
  return `<details class="cmp-comments"><summary>심사 코멘트(${rows.length}명)</summary>${rows.join("")}</details>`;
};

const draftHtml = (d: DraftInfo | undefined, armId: string): string => {
  if (!d) return `<div class="cmp-empty">이 회차에는 ${esc(armId)} 초안이 없습니다.</div>`;
  const spec = specs.get(d.name);
  const sc = draftScore(judged.get(d.name), axes);
  const per = judged.get(d.name);
  const chips: string[] = [];
  if (per) {
    chips.push(`<span class="cmp-chip cmp-chip--main">심사 평균 ${f1(sc.overall)}</span>`);
    for (const [jn, j] of per) chips.push(`<span class="cmp-chip">${esc(jn)} ${f1(j.overall)}</span>`);
    for (const a of axes) if (sc.axes[a] !== null) chips.push(`<span class="cmp-chip cmp-chip--axis">${esc(a)} ${f1(sc.axes[a])}</span>`);
  } else if (judges.length) chips.push(`<span class="cmp-chip cmp-muted">심사 없음</span>`);
  if (d.unknownNumbers) chips.push(`<span class="cmp-chip">없는 숫자 ${d.unknownNumbers.length}</span>`);
  if (d.warnings) {
    const g = gradeWarnings(d.warnings);
    chips.push(`<span class="cmp-chip">경고 막힘 ${g.filter((w) => w.level === "block").length} · 참고 ${g.filter((w) => w.level === "info").length}</span>`);
  }
  if (d.fill !== null) chips.push(`<span class="cmp-chip">판면 ${pct(d.fill)}</span>`);
  if (d.weakShare !== null) chips.push(`<span class="cmp-chip">약한 문장 ${pct(d.weakShare)}</span>`);
  if (d.lens !== null) chips.push(`<span class="cmp-chip">논점 ${d.lens}/5</span>`);
  if (d.distinct !== null) chips.push(`<span class="cmp-chip">도식 ${d.distinct}종</span>`);
  const warnList = d.warnings?.length ? `<details class="cmp-comments"><summary>결정론 경고(${d.warnings.length})</summary><ul>${gradeWarnings(d.warnings).map((w) => `<li>${w.level === "block" ? "<b>막힘</b>" : "참고"} ${esc(w.text)}</li>`).join("")}</ul></details>` : "";
  const unk = d.unknownNumbers?.length ? `<p class="cmp-unk">카드·근거에 없는 숫자: ${d.unknownNumbers.map((u) => `<span class="k-unv-demo">${esc(u)}</span>`).join(" ")}</p>` : "";
  const head = `<header class="cmp-draft__h"><span class="cmp-draft__name">${esc(d.name)}</span><div class="cmp-chips">${chips.join("")}</div></header>`;
  if (!d.ok || !spec) return `<article class="cmp-draft cmp-draft--fail">${head}<div class="cmp-error"><b>초안 없음</b> ${esc(d.error ?? "초안을 읽지 못했습니다.")}</div></article>`;
  return `<article class="cmp-draft">${head}${judgeBlock(d)}${warnList}${unk}<div class="cmp-tools"><button type="button" class="cmp-big">이 초안만 크게</button></div><div class="cmp-fit">${sectionHtml(spec, d.unknownNumbers ?? [])}</div></article>`;
};

const cardTitleOf = (card: string) => {
  const d = drafts.find((x) => x.card === card && specs.has(x.name));
  const s = d && specs.get(d.name);
  return s ? `${esc(card)} · ${esc(s.card.taskNo)} ${esc(s.card.title)}` : esc(card);
};

const cardSections = cards
  .map((card, ci) => {
    const slots = slotsOf(card);
    const tabs =
      slots.length > 1
        ? `<div class="cmp-tabs" role="tablist" aria-label="회차">${slots.map((s, i) => `<button type="button" role="tab" class="cmp-tab${i === 0 ? " is-on" : ""}" data-slot="${esc(s)}">${hasManifest ? `회차 ${esc(s)}` : esc(s)}</button>`).join("")}</div>`
        : "";
    const body = slots
      .map((s, i) => {
        const cols = arms.map((a) => {
          const d = drafts.find((x) => x.card === card && x.slot === s && x.arm === a.id);
          return `<div class="cmp-col"><h4 class="cmp-col__h">${esc(a.id)} <span class="cmp-muted">${esc(a.label)}</span></h4>${draftHtml(d, a.id)}</div>`;
        });
        return `<div class="cmp-slot${i === 0 ? " is-on" : ""}" data-slot="${esc(s)}"><div class="cmp-scroll"><div class="cmp-grid" style="--n:${arms.length}">${cols.join("")}</div></div></div>`;
      })
      .join("");
    return `<section class="cmp-card" id="card-${ci + 1}"><h3>${cardTitleOf(card)}</h3>${tabs}${body}</section>`;
  })
  .join("\n");

// 3) 공통 결함
const flawTableHtml = flaws.length
  ? table(
      ["결함", "심사자", ...arms.map((a) => esc(a.id)), "합계"],
      flaws.map((f) => [esc(f.flaw) + (f.cause ? `<div class="cmp-muted">원인 추정: ${esc(f.cause)}</div>` : ""), esc(f.judge), ...arms.map((a) => String(f.byArm[a.id])), String(f.total)]),
    ) + `<p class="cmp-muted">심사자가 「공통 결함」으로 든 초안 수를 팔별로 센 값입니다(심사자마다 따로 셈 — 합치지 않음).</p>`
  : `<p class="cmp-muted">공통 결함 기록이 없습니다.</p>`;

// 4) 방법
const slotCount = new Set(drafts.map((d) => `${d.card}\u0000${d.slot}`)).size;
const method = `<ul>
<li><b>표본</b>: 카드 ${cards.length}장 × 회차(변형) ${new Set(drafts.map((d) => d.slot)).size}종, 팔 ${arms.length}개, 초안 ${drafts.length}건(카드·회차 칸 ${slotCount}개).${hasManifest ? "" : " manifest가 없는 과거 라운드라 파일 이름 앞머리로 팔을, 나머지를 회차로 나눴습니다."}</li>
<li><b>생성</b>: ${manifest.round ? `라운드 ${esc(manifest.round)}` : "라운드 이름 없음"}${manifest.createdAt ? ` · 생성 일시 ${esc(manifest.createdAt)}` : ""}.</li>
<li><b>블라인드 심사</b>: 심사자(${judgeNames.length ? judgeNames.map(esc).join(", ") : "없음"})는 팔 이름 대신 섞은 번호(D01…)로 초안을 받았고, 이 화면은 judge-key.json으로 이름을 되돌려 붙였습니다. 심사 점수·코멘트는 심사 파일 값 그대로입니다.</li>
<li><b>점수 정의</b>: 종합·축 점수 = 심사 파일의 overall·scores(축: ${axes.length ? axes.map(esc).join(" · ") : "없음"}). 팔 평균은 심사자별 평균을 다시 평균(심사자 동등). 짝 승수는 같은 카드·같은 회차의 두 팔 점수 비교. 스피어만 = 두 심사자가 모두 순위에 넣은 초안의 순위 상관, 피어슨 = 종합 점수 상관.</li>
<li><b>결정론 지표</b>: eval-report-score.ts(scores.json)와 초안 파일에서 코드로 읽은 값입니다. 판면 채움 = 어림 높이 / 판면 예산, 근거 약한 문장 = 근거 글과 겹침이 낮은 문장 비율(판정 아님).</li>
</ul>`;

// ───────────── 문서 ─────────────
const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#f4f4f4;color:#222;font:14px/1.6 "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;word-break:keep-all;overflow-wrap:anywhere}
a{color:#00699E}
.cmp-wrap{max-width:1600px;margin:0 auto;padding:20px 16px 64px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:32px 0 8px;padding-top:8px;border-top:2px solid #bbb}h3{font-size:16px;margin:0 0 8px}
.cmp-muted{color:#777;font-weight:400}
.cmp-lead{background:#fff;border:1px solid #d0d0d0;border-left:4px solid #555;padding:10px 14px;margin:12px 0}
.cmp-note{background:#ececec;border:1px solid #cfcfcf;padding:8px 12px;margin:8px 0}
.cmp-scroll{overflow-x:auto;max-width:100%}
table{border-collapse:collapse;background:#fff;font-size:13px;min-width:100%}
th,td{border:1px solid #d6d6d6;padding:5px 9px;text-align:center;vertical-align:top}
thead th{background:#e6e6e6;text-align:center;white-space:nowrap}
tbody th{text-align:left;background:#f0f0f0;font-weight:600}
td:first-child,td.l{text-align:left}
.cmp-lbl td:nth-child(2){text-align:left}
details{margin:6px 0}summary{cursor:pointer;color:#444}
.cmp-card{background:#fff;border:1px solid #d0d0d0;padding:12px 12px 16px;margin:16px 0}
.cmp-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 10px}
.cmp-tab{font:inherit;font-size:13px;padding:3px 12px;border:1px solid #aaa;background:#f0f0f0;color:#333;cursor:pointer;border-radius:3px}
.cmp-tab.is-on{background:#444;color:#fff;border-color:#444}
.js .cmp-slot{display:none}.js .cmp-slot.is-on{display:block}
.cmp-slot+.cmp-slot{margin-top:16px}
.cmp-grid{display:grid;grid-template-columns:repeat(var(--n),minmax(340px,1fr));gap:12px;align-items:start}
.cmp-col{min-width:0;isolation:isolate}
.cmp-col__h{margin:0 0 6px;font-size:14px}
.cmp-draft{border:1px solid #cfcfcf;background:#fafafa;padding:8px;min-width:0;position:relative;isolation:isolate;overflow:hidden}
.cmp-draft__h{margin-bottom:6px}.cmp-draft__name{font-size:12px;color:#666}
.cmp-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
.cmp-chip{font-size:12px;line-height:1.5;padding:0 7px;border:1px solid #c4c4c4;background:#fff;border-radius:9px;white-space:nowrap}
.cmp-chip--main{background:#444;color:#fff;border-color:#444;font-weight:700}
.cmp-chip--axis{background:#f0f0f0}
.cmp-comments{font-size:12.5px;background:#fff;border:1px solid #ddd;padding:4px 8px}
.cmp-comments ul{margin:2px 0 6px;padding-left:18px}
.cmp-judge__h{font-weight:700;margin-top:4px}
.cmp-unk{font-size:12.5px;margin:6px 0}
.k-unv-demo{text-decoration:underline dashed #c62828;text-underline-offset:2px}
.cmp-tools{margin:6px 0;position:relative;z-index:1}.cmp-big{font:inherit;font-size:12px;padding:1px 10px;border:1px solid #999;background:#fff;color:#333;cursor:pointer;border-radius:3px}
.cmp-fit{overflow-x:auto;background:#e9eae9;padding:4px}
.cmp-fit.cmp-scaled{overflow:hidden}
.cmp-fit.cmp-scaled .kca-dg-doc{zoom:var(--z,1)}
.cmp-error{border:1px dashed #888;background:#efefef;padding:10px;color:#333}
.cmp-empty{border:1px dashed #bbb;color:#888;padding:16px;text-align:center}
#cmp-over{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:50;padding:16px}
#cmp-over.is-on{display:block}
.cmp-over__box{background:#e9eae9;height:100%;overflow:auto;padding:12px;position:relative}
.cmp-over__close{position:sticky;top:0;float:right;z-index:2;font:inherit;padding:3px 14px;border:1px solid #666;background:#fff;cursor:pointer}
@media (max-width:700px){.cmp-grid{grid-template-columns:repeat(var(--n),minmax(300px,1fr))}}
${REPORT_CSS}
`;

const SCRIPT = `
(function(){
var root=document.documentElement;root.className+=' js';
var fit=${fitTextLines.toString()};
function prepare(slot){
  if(slot.getAttribute('data-ready'))return;
  fit(slot);
  var boxes=slot.querySelectorAll('.cmp-fit');
  for(var i=0;i<boxes.length;i++){
    var b=boxes[i],p=b.querySelector('.k-paper');if(!p)continue;
    var w=p.offsetWidth,avail=b.clientWidth-8;
    if(w>0&&avail>0){b.style.setProperty('--z',Math.min(1,avail/w).toFixed(4));b.className+=' cmp-scaled';}
  }
  slot.setAttribute('data-ready','1');
}
function boot(){
  var slots=document.querySelectorAll('.cmp-slot.is-on');
  for(var i=0;i<slots.length;i++)prepare(slots[i]);
}
(document.fonts?document.fonts.ready:Promise.resolve()).then(boot);
document.addEventListener('click',function(e){
  var t=e.target;
  if(t.classList&&t.classList.contains('cmp-tab')){
    var card=t.closest('.cmp-card'),s=t.getAttribute('data-slot');
    var tabs=card.querySelectorAll('.cmp-tab'),slots=card.querySelectorAll('.cmp-slot');
    for(var i=0;i<tabs.length;i++)tabs[i].classList.toggle('is-on',tabs[i]===t);
    for(var j=0;j<slots.length;j++){var on=slots[j].getAttribute('data-slot')===s;slots[j].classList.toggle('is-on',on);if(on)prepare(slots[j]);}
  }else if(t.classList&&t.classList.contains('cmp-big')){
    var doc=t.closest('.cmp-draft').querySelector('.kca-dg-doc');
    var body=document.getElementById('cmp-over-body');body.innerHTML='';
    body.appendChild(doc.cloneNode(true));
    document.getElementById('cmp-over').classList.add('is-on');
  }else if(t.id==='cmp-over'||(t.classList&&t.classList.contains('cmp-over__close'))){
    document.getElementById('cmp-over').classList.remove('is-on');
  }
});
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.getElementById('cmp-over').classList.remove('is-on');});
})();
`;

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>경평 초안 팔 비교${manifest.round ? ` — ${esc(manifest.round)}` : ""}</title>
<style>${CSS}</style>
</head>
<body>
<div class="cmp-wrap">
<h1>경평 초안 팔 비교${manifest.round ? ` <span class="cmp-muted">${esc(manifest.round)}</span>` : ""}</h1>
<p class="cmp-muted">${esc(arms.map((a) => a.id).join(" · "))} · 카드 ${cards.length}장 · 초안 ${drafts.length}건${manifest.createdAt ? ` · 생성 ${esc(manifest.createdAt)}` : ""}${round.dropped.length ? ` · 팔 거름: ${esc(round.dropped.join(", "))} 제외(원 라운드 ${round.originalArms}팔)` : ""}</p>
${findingsSection(findingsHtml)}<div class="cmp-lead">${lead}</div>
${note ? `<div class="cmp-note"><b>설정이 다릅니다.</b> ${esc(note)}</div>` : ""}
<h2 id="arms">팔 설명</h2>
${armTable}
<h2 id="scores">종합 점수</h2>
${scoreTable}
<h2 id="pairs">같은 카드·같은 회차 짝 승수</h2>
${pairTable}
<h2 id="agree">심사자 간 일치도</h2>
${agreeTable}
<h2 id="det">결정론 지표</h2>
${detTable}
<h2 id="cards">카드별 초안 나란히 보기</h2>
<p class="cmp-muted">초안은 앱 화면과 같은 렌더러로 그렸고 열 폭에 맞게 줄였습니다. 붉은 점선 = 근거에 없는 숫자.</p>
${cardSections}
<h2 id="flaws">공통 결함</h2>
${flawTableHtml}
<h2 id="method">방법</h2>
${method}
</div>
<div id="cmp-over"><div class="cmp-over__box"><button type="button" class="cmp-over__close">닫기</button><div id="cmp-over-body"></div></div></div>
<script>${SCRIPT}</script>
</body>
</html>
`;

writeFileSync(out, html);
console.log(`compare 씀: ${out} (${(html.length / 1024).toFixed(0)}KB · 카드 ${cards.length}장 · 초안 ${drafts.length}건 · 팔 ${arms.length} · 심사자 ${judgeNames.join(",") || "없음"})`);
