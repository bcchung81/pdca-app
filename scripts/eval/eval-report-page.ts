// 경평 초안 평가용 비교 페이지(수동 연기 시험 전용) — scores.json(eval-report-score.ts)·pages/manifest.json(eval-report-pages.ts)를
// 읽어 <evalDir>/index.html 한 장을 씀. DB·네트워크를 쓰지 않는 순수 파일 생성(외부 요청 없음, 로컬에서 바로 열림).
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/eval-report-page.ts <evalDir>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { LooseJson } from "../../lib/loose-json.ts";

type Json = LooseJson;

const evalDir = process.argv[2];
if (!evalDir) {
  console.error("usage: node --conditions=react-server --env-file=.env.local scripts/eval/eval-report-page.ts <evalDir>");
  process.exit(1);
}
const scoresPath = `${evalDir}/scores.json`;
if (!existsSync(scoresPath)) throw new Error(`scores.json이 없음(먼저 eval-report-score.ts를 돌림): ${scoresPath}`);
const scores: { generatedAt: string; summary: Json; records: Json[] } = JSON.parse(readFileSync(scoresPath, "utf8"));
const manifestPath = `${evalDir}/pages/manifest.json`;
const manifest: Record<string, Json[]> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const pct = (n: number) => `${Math.round(n * 100)}%`;
const htmlFile = (file: string) => file.replace(/\.json$/, "");
const anchor = (id: string) => `card-${id.replace(/[^\p{L}\p{N}]+/gu, "-")}`;

// ---------------------------------------------------------------------------
// 카드별 요약 값(측정값이 있으면 그것, 없으면 어림 — 표시에서 구분)

function fitCell(r: Json): string {
  const budget = r.fitEstimate.budget;
  if (!budget) return "-";
  if (r.measure?.frameMm != null) return `${Math.round((r.measure.frameMm / budget) * 100)}% <small>실측</small>`;
  return `${Math.round((r.fitEstimate.total / budget) * 100)}% <small>어림</small>`;
}
const raggedCell = (r: Json) => r.measure?.raggedLi ?? r.fitEstimate.ragged;
const sparseCell = (r: Json) => r.measure?.sparseLi ?? r.fitEstimate.sparse;
function diagramsCell(r: Json): string {
  const rep = r.diagrams.repeated as string[];
  return `${r.diagrams.distinct}종${rep.length ? ` <span class="warn" title="같은 도식을 두 번 이상 씀">반복 ${esc(rep.join("·"))}</span>` : ""}`;
}
const unknownCell = (r: Json) => (r.meta.log?.unknownNumbers ? String(r.meta.log.unknownNumbers.length) : "-");
function groundCell(r: Json): string {
  const cls = r.groundWeak.weakShare >= 0.5 ? "warn" : r.groundWeak.weakShare >= 0.3 ? "caution" : "";
  return `<span class="${cls}">${pct(r.groundWeak.weakShare)}</span> <small>(${r.groundWeak.weakCount}/${r.groundWeak.total})</small>`;
}
function yearCell(r: Json): string {
  const c = r.yearMix.counts;
  return `${c.y26}/${c.past}/${c.plan}`;
}
/** 「올해 실적」 열(2026-09-27 B, lib/reports/actuals.ts): 핵심 수치 띠 칸의 시점 분포, 자리표시 수, 올해 실적 문제(issues) 건수(툴팁에 문제 글) */
function actualsCell(r: Json): string {
  const t = r.yearMix.statsTiming as Record<string, number> | undefined;
  const stats = r.yearMix.statsNowOrNeed === null || !t ? "수치띠 없음" : `수치띠 지금${t.now + t.need}·과거${t.past}·없음${t.none}`;
  const needs = r.yearMix.needs ? `<span title="담당자가 채울 자리표시">확인 ${r.yearMix.needs}</span>` : "확인 0";
  const issues = (r.yearMix.issues as string[]) ?? [];
  const issueBadge = issues.length ? `<span class="warn" title="${esc(issues.join("\n"))}">⚠문제 ${issues.length}</span>` : "";
  return `${stats} · ${needs} ${issueBadge}`;
}
const lensCell = (r: Json) => `${r.lensCover.count}/5`;
const timeCell = (r: Json) => (r.meta.log?.sec != null ? `${r.meta.log.sec}s` : "-");
const passesCell = (r: Json) => r.meta.log?.fitPasses ?? "-";
/** 「짜임」 열(도식 수렴 해소 ③, 2026-09-27): 첫 블록, 실제로 쓴 이 과제만의 요소 / 앱이 찾은 후보, 시각 블록 수(기본 도식만이면 경고) */
function composeCell(r: Json): string {
  const c = r.compose ?? {};
  const own = ((c.own as string[]) ?? []).join("·") || "-";
  const candidates = ((c.candidates as string[]) ?? []).join("·") || "-";
  const staples = c.staplesOnly ? ` <span class="warn" title="이 과제만의 요소 없이 기본 도식만 씀">기본만</span>` : "";
  return `${esc(c.first ?? "-")}<br><small>own ${esc(own)} / 후보 ${esc(candidates)}</small><br><small>시각 ${c.visuals ?? 0}${staples}</small>`;
}
/** 「그림」 열(그림 자리표시, 2026-09-27): 개수(쪽 모듈 상한을 넘으면 경고)·종류·자리 분포. 0개(그릴 대상 없음)는 정상 */
function figuresCell(r: Json): string {
  const f = r.figures ?? { count: 0, byKind: {}, byPos: {}, perModuleOk: true };
  const kinds = Object.entries(f.byKind as Record<string, number>).map(([k, n]) => `${esc(k)} ${n}`).join("·") || "-";
  const pos = Object.entries(f.byPos as Record<string, number>).map(([k, n]) => `${esc(k)} ${n}`).join("·") || "-";
  const countCls = f.perModuleOk ? "" : "warn";
  return `<span class="${countCls}">${f.count}개</span><br><small>${kinds}</small><br><small>${pos}</small>`;
}

// ---------------------------------------------------------------------------
// 요약 표

const summaryRows = scores.records
  .map((r) => {
    const a = anchor(r.id);
    return `<tr>
      <td class="left"><a href="#${a}">${esc(r.id)}</a><br><small>${esc(r.meta.task.no)} ${esc(r.meta.mark)}. ${esc(r.meta.title)}</small></td>
      <td>${r.meta.module}쪽</td>
      <td>${fitCell(r)}</td>
      <td>${raggedCell(r)}</td>
      <td>${sparseCell(r)}</td>
      <td class="left">${diagramsCell(r)}</td>
      <td class="left">${composeCell(r)}</td>
      <td class="left">${figuresCell(r)}</td>
      <td>${unknownCell(r)}</td>
      <td class="left">${groundCell(r)}</td>
      <td class="left">${yearCell(r)}</td>
      <td class="left">${actualsCell(r)}</td>
      <td>${lensCell(r)}</td>
      <td>${r.styleWarnCount}</td>
      <td>${timeCell(r)}</td>
      <td>${passesCell(r)}</td>
    </tr>`;
  })
  .join("\n");

// ---------------------------------------------------------------------------
// 묶음 요약: 도식 분포 막대 + 상위3 비중·엔트로피 + 주요 지표 평균

const kindFreq = Object.entries(scores.summary.kindFrequency as Record<string, number>);
const maxFreq = Math.max(1, ...kindFreq.map(([, n]) => n));
const kindBars = kindFreq
  .map(([k, n]) => `<div class="bar-row"><span class="bar-label">${esc(k)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round((n / maxFreq) * 100)}%"></span></span><span class="bar-n">${n}</span></div>`)
  .join("\n");

// ---------------------------------------------------------------------------
// 카드별 상세: 왼쪽 2025 원본 쪽, 오른쪽 우리 초안(iframe), 아래 근거 약한 문장·연도 구성

function priorPanel(id: string): string {
  const entries = manifest[id] ?? [];
  if (!entries.length) return `<p class="muted">전년 절 없음(닮은 절도 점수 0.1 미만).</p>`;
  return entries
    .map((e) => {
      const label = e.fallback ? "비슷한 과제(참고)" : e.same ? "같은 과제" : "닮은 절";
      const cls = e.fallback ? "tag caution" : e.same ? "tag ok" : "tag";
      const imgs = (e.images as string[]).map((img: string) => `<img src="pages/${encodeURIComponent(img)}" alt="${esc(e.title)} 원본 쪽" loading="lazy">`).join("\n");
      return `<figure>
        ${imgs}
        <figcaption><span class="${cls}">${label}</span> ${esc(e.title)}${e.reportPage ? ` (p.${e.reportPage})` : ""} · 닮은 정도 ${e.score}</figcaption>
      </figure>`;
    })
    .join("\n");
}

function weakestList(r: Json): string {
  const items = r.groundWeak.weakest as Array<{ text: string; overlap: number }>;
  if (!items.length) return `<p class="muted">근거와 겹침을 볼 문장이 없음.</p>`;
  return `<ol class="weak-list">${items.map((x) => `<li><span class="overlap ${x.overlap < 0.35 ? "warn" : ""}">${pct(x.overlap)}</span> ${esc(x.text.slice(0, 160))}${x.text.length > 160 ? "…" : ""}</li>`).join("\n")}</ol>`;
}

// 문장 대조(문장품질-수정안, 2026-09-27): 왼쪽 2025 전년 절 글 조각(줄바꿈·「 | 」·「 / 」로 나눠 글머리를 걷은 10자 넘는 조각) 앞 12개,
// 오른쪽 초안 문장(eval-report-score.ts prose.list — groundedSentences와 같은 규칙) 앞 12개.
function splitPriorText(text: string): string[] {
  return text
    .split(/\n|\||\//)
    .map((s) => s.replace(/^[\s\-•○□∙･·※◇◆▶►*\d]+[.)]?\s*/, "").trim())
    .filter((s) => s.length > 10)
    .slice(0, 12);
}
function proseCompareRows(left: string[], right: string[]): string {
  const n = Math.max(left.length, right.length);
  if (!n) return `<tr><td class="left muted" colspan="2">대조할 문장이 없음.</td></tr>`;
  const cell = (s?: string) => (s ? esc(s.slice(0, 120)) + (s.length > 120 ? "…" : "") : "");
  return Array.from({ length: n }, (_, i) => `<tr><td class="left">${cell(left[i])}</td><td class="left">${cell(right[i])}</td></tr>`).join("\n");
}
function proseSection(r: Json): string {
  const left = splitPriorText((r.meta.priorText as string) ?? "");
  const right = (r.prose?.list as string[] | undefined) ?? [];
  const p = r.prose ?? {};
  const issueBadges = ((p.issues as string[]) ?? []).length ? `<details><summary>문장 문제 ${(p.issues as string[]).length}건</summary><ul class="warn-list">${(p.issues as string[]).map((w) => `<li>${esc(w)}</li>`).join("\n")}</ul></details>` : `<span class="tag ok">문장 문제 없음</span>`;
  return `<h3>2025 원본 문장 ↔ 초안 문장</h3>
  <p class="muted">문장 ${p.sentences ?? 0}개 · 나열 ${pct(p.listedRatio ?? 0)} · 절차 낱말 ${p.procWordsPerSentence ?? 0}/문장 · 카드 겹침 ${p.cardOverlapAvg != null ? pct(p.cardOverlapAvg) : "-"} · 12자 넘게 그대로 옮김 ${pct(p.cardCopiedRatio ?? 0)}</p>
  ${issueBadges}
  <table>
  <thead><tr><th class="left">2025 원본 문장(전년 절)</th><th class="left">초안 문장</th></tr></thead>
  <tbody>${proseCompareRows(left, right)}</tbody>
  </table>`;
}

function logWarnings(r: Json): string {
  const warnings = r.meta.log?.warnings as string[] | undefined;
  if (!warnings?.length) return "";
  return `<details><summary>만들 때 경고 ${warnings.length}건</summary><ul class="warn-list">${warnings.map((w) => `<li>${esc(w)}</li>`).join("\n")}</ul></details>`;
}

const detailSections = scores.records
  .map((r) => {
    const a = anchor(r.id);
    const file = htmlFile(r.file);
    return `<section class="card-detail" id="${a}">
      <h2>${esc(r.id)} · ${esc(r.meta.task.no)} ${esc(r.meta.mark)}. ${esc(r.meta.title)}</h2>
      <p class="muted">${esc(r.meta.business.name)} · ${r.meta.module}쪽 · ${r.meta.log?.story ? esc(r.meta.log.story) : "이야기 틀 미기록"} · ${esc(r.meta.log?.layout ?? "")}</p>
      <div class="cols">
        <div class="col">
          <h3>2025 보고서 원본 쪽</h3>
          ${priorPanel(r.id)}
        </div>
        <div class="col">
          <h3>초안</h3>
          <iframe src="drafts/${encodeURIComponent(file)}" title="${esc(r.id)} 초안" loading="lazy"></iframe>
        </div>
      </div>
      <div class="cols">
        <div class="col">
          <h3>근거 약한 문장 Top 10</h3>
          ${weakestList(r)}
        </div>
        <div class="col">
          <h3>연도 구성·기록</h3>
          <p>올해(’26) 수치 ${r.yearMix.counts.y26}건 · 지난 실적(’24·’25) 수치 ${r.yearMix.counts.past}건 · 계획·목표·예상 수치 ${r.yearMix.counts.plan}건 · 그 밖 ${r.yearMix.counts.other}건</p>
          <p>논점 커버: ${Object.entries(r.lensCover.checks as Record<string, boolean>)
            .map(([k, v]) => `<span class="tag ${v ? "ok" : ""}">${esc(k)}</span>`)
            .join(" ")}</p>
          ${r.meta.log?.usage ? `<p class="muted">토큰 입력 ${r.meta.log.usage.input ?? "-"} · 출력 ${r.meta.log.usage.output ?? "-"}${r.meta.log.usage.cacheRead ? ` · 캐시 ${r.meta.log.usage.cacheRead}` : ""}</p>` : ""}
          ${logWarnings(r)}
        </div>
      </div>
      ${proseSection(r)}
    </section>`;
  })
  .join("\n");

// ---------------------------------------------------------------------------

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>경평 초안 평가 — ${esc(evalDir)}</title>
<style>
:root{--bg:#ffffff;--fg:#1a1a1a;--muted:#666;--line:#e0e0e0;--soft:#f6f7f8;--accent:#2563eb;--warn:#b91c1c;--caution:#a16207;--ok:#166534;--ok-bg:#dcfce7;--caution-bg:#fef3c7;--warn-bg:#fee2e2}
@media (prefers-color-scheme: dark){
  :root{--bg:#15181c;--fg:#e6e8eb;--muted:#9aa1a9;--line:#2c3138;--soft:#1c2126;--accent:#7aa2ff;--warn:#f87171;--caution:#facc15;--ok:#4ade80;--ok-bg:#123322;--caution-bg:#3a2f0a;--warn-bg:#3a1414}
}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR","맑은 고딕",sans-serif;line-height:1.5}
h1{font-size:20px;margin:0 0 4px}
h2{font-size:17px;margin:0 0 4px}
h3{font-size:13px;margin:12px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.muted{color:var(--muted);font-size:13px}
table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0 28px}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:center;vertical-align:top}
th{background:var(--soft);font-weight:600}
td.left,th.left{text-align:left}
.warn{color:var(--warn);font-weight:600}
.caution{color:var(--caution);font-weight:600}
.tag{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:1px 8px;font-size:12px;margin:1px 2px 1px 0;background:var(--soft)}
.tag.ok{background:var(--ok-bg);color:var(--ok);border-color:transparent}
.tag.caution{background:var(--caution-bg);color:var(--caution);border-color:transparent}
.bar-row{display:grid;grid-template-columns:120px 1fr 28px;align-items:center;gap:8px;margin:3px 0;font-size:13px}
.bar-track{background:var(--soft);border-radius:4px;height:14px;overflow:hidden}
.bar-fill{display:block;height:100%;background:var(--accent)}
.bar-n{text-align:right;color:var(--muted)}
.card-detail{border-top:2px solid var(--line);padding-top:16px;margin-top:24px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px}
@media (max-width:900px){.cols{grid-template-columns:1fr}}
.col img{max-width:100%;border:1px solid var(--line);border-radius:4px;display:block;margin-bottom:6px}
.col figure{margin:0 0 14px}
.col figcaption{font-size:12px;color:var(--muted);margin-top:4px}
iframe{width:100%;height:1150px;border:1px solid var(--line);border-radius:4px;background:var(--soft)}
.weak-list{margin:0;padding-left:20px;font-size:13px}
.weak-list li{margin-bottom:4px}
.overlap{display:inline-block;min-width:38px;font-weight:600;color:var(--muted)}
.overlap.warn{color:var(--warn)}
.warn-list{font-size:13px;color:var(--warn)}
details summary{cursor:pointer;font-size:13px;color:var(--muted)}
.top{margin-bottom:20px}
</style>
</head>
<body>
<div class="top">
  <h1>경평 초안 평가 — ${esc(evalDir)}</h1>
  <p class="muted">${esc(scores.generatedAt)} 셈 · 초안 ${scores.summary.drafts}건 · 결정론 스코어카드(판단 없음, 신호만) — 카드 이름을 누르면 아래 상세로 이동</p>
</div>

<table>
<thead><tr>
  <th class="left">카드</th><th>쪽</th><th>판면</th><th>한두자<br>넘김</th><th>빈 칸</th>
  <th class="left">도식(고유·반복)</th><th class="left">짜임</th><th class="left">그림</th><th>근거없는<br>숫자</th><th class="left">근거약한<br>문장</th>
  <th class="left">연도구성<br>(올해/지난/계획)</th><th class="left">올해 실적</th><th>논점<br>커버</th><th>문체<br>경고</th><th>시간</th><th>맞추기</th>
</tr></thead>
<tbody>
${summaryRows}
</tbody>
</table>

<h2>묶음 도식 다양성</h2>
<p class="muted">상위 3종 비중 ${pct(scores.summary.top3Share)} · 엔트로피 ${scores.summary.entropyBits}bit(종류가 많고 고르게 쓰일수록 큼) · 평균 판면 ${pct(scores.summary.avgFitRatio)} · 평균 고유 도식 ${scores.summary.avgDiagramsDistinct}개 · 평균 근거약한문장 비율 ${pct(scores.summary.avgGroundWeakShare)} · 평균 문체경고 ${scores.summary.avgStyleWarnCount}건 · 평균 논점커버 ${scores.summary.avgLensCoverCount}/5</p>
<p class="muted">올해 실적(B, 2026-09-27): 핵심 수치 띠에 지금·확인 칸이 있는 초안 ${esc(scores.summary.draftsStatsNowOrNeed)} · 올해 실적 문제가 있는 초안 ${esc(scores.summary.draftsWithYearIssues)} · 평균 자리표시 ${scores.summary.avgNeeds}개</p>
<p class="muted">짜임(도식 수렴 해소 ③, 2026-09-27): 후보가 있었던 초안 중 이 과제만의 요소를 실제로 쓴 것 ${esc(scores.summary.draftsWithOwn ?? "-")} · 첫 블록 분포 ${Object.entries((scores.summary.firstBlocks as Record<string, number>) ?? {}).map(([k, n]) => `${esc(k)} ${n}`).join(" · ") || "-"} · 0.5쪽 평균 시각 블록 ${scores.summary.avgVisualsHalf ?? "-"}개 · 1쪽 이상 평균 ${scores.summary.avgVisualsFull ?? "-"}개</p>
<p class="muted">그림 자리표시(2026-09-27): 그림이 있는 초안 ${esc(scores.summary.draftsWithFigures ?? "-")} · 평균 ${scores.summary.avgFigures ?? "-"}개 · 종류 분포 ${Object.entries((scores.summary.figureKinds as Record<string, number>) ?? {}).map(([k, n]) => `${esc(k)} ${n}`).join(" · ") || "그림 없음"}(그릴 대상이 없는 과제는 0이 정상)</p>
<p class="muted">표현 보강(2026-09-27): 추진성과 막대 ${esc(scores.summary.draftsWithChart ?? "-")} · 3칸 ${esc(scores.summary.draftsWithCardsResult ?? "-")} · 강조 띠 ${esc(scores.summary.draftsWithBand ?? "-")} · 위첨자 비교 ${esc(scores.summary.draftsWithSup ?? "-")} · qa 블록 ${esc(scores.summary.draftsWithQa ?? "-")} · 수치 표 ${esc(scores.summary.draftsWithTable ?? "-")} · VS 대립 ${esc(scores.summary.draftsWithCardsVs ?? "-")}(이 기능 전 초안은 모두 0/N이 정상)</p>
<p class="muted">문장 품질(문장품질-수정안, 2026-09-27): 나열 ${pct(scores.summary.avgListedRatio ?? 0)} · 절차 낱말 ${scores.summary.avgProcWordsPerSentence ?? "-"}/문장 · 카드 어휘 겹침 ${scores.summary.avgCardOverlap != null ? pct(scores.summary.avgCardOverlap) : "-"} · 12자 넘게 그대로 옮김 ${pct(scores.summary.avgCardCopiedRatio ?? 0)} · 문장 문제 있는 초안 ${esc(scores.summary.draftsWithProseIssues ?? "-")}(평균 ${scores.summary.avgProseIssueCount ?? "-"}건) · 갈래별 나열 ${scores.summary.proseIssueCounts?.listed ?? 0}·관리정보 ${scores.summary.proseIssueCounts?.admin ?? 0}·약어 ${scores.summary.proseIssueCounts?.abbr ?? 0}·평가대응말 ${scores.summary.proseIssueCounts?.evalWord ?? 0}</p>
<div>${kindBars || '<p class="muted">도식 없음</p>'}</div>

${detailSections}

</body>
</html>`;

writeFileSync(`${evalDir}/index.html`, html);
console.log(`index.html 씀: ${evalDir}/index.html (${scores.records.length}건)`);
