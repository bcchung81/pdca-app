// 경평 초안 블라인드 심사 묶음 만들기(평가 라운드 도구, DB 읽기만 — AI 호출 없음).
// 용도: 같은 카드로 만든 초안 여러 건(<evalDir>/drafts/<이름>.html + <이름>.html.json — ai-report-smoke.ts 산출물)을
//  블라인드 이름(D01…)으로 바꾸고 글·블록 짜임만 적은 심사 묶음 <evalDir>/judge/Dnn.md와 공통 근거 묶음 <evalDir>/judge/_sources.md로 씀.
// 실행: node --conditions=react-server --env-file=.env.local scripts/eval/judge-packets.ts <evalDir> <카드 id> [--key <judge-key.json>]
//  --out <폴더>를 주면 묶음을 <evalDir>/judge 대신 그 폴더에 씀(judge-run.ts가 카드별로 부름).
//  --key를 주면 그 파일의 블라인드 이름(D01→초안 이름)을 그대로 쓰고, 없으면 무작위로 만들어 <evalDir>/judge-key.json에 씀.
// 블라인드 원칙: 이야기 틀 이름·구성안·경고·생성 로그는 넣지 않음(글과 블록 모양·칸 수·배치만). 심사자 모두 같은 이름·같은 근거를 봄.
// 근거 묶음: 카드 본문(원장) + 그 카드의 card_materials 저장본 전체 글(DB) + 전년 절(pickPrior — 앱과 같은 고르기) + 평가 기준 발췌
//  (편람 ②·'26 대응 추진방향·보고서 작성 착안사항 2개 · 이 사업 '25 평가위원 지적 첫 조각)
//  + 초안 모델이 숫자 근거로 받은 나머지(실사 질의응답 전부·'25 평가위원 지적 전부·이 과제에 연결된 공통 지식 조각 relevantRefs·경영관리 지표 2025 보고서 전 장/핵심공통항목)를 6만 자까지.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { inspectionCardText } from "../../lib/ai/inspect.ts";
import { MATERIAL_COLS, type MaterialRow, materialState } from "../../lib/ai/material-text.ts";
import { shapeName } from "../../lib/reports/frameworks.ts";
import { defaultEvals } from "../../lib/reports/mg-outline.ts";
import { loadMgCardPages, loadMgPrior } from "../../lib/reports/mg-queries.ts";
import { loadCardBundle } from "../../lib/ai/context.ts";
import { relevantRefs } from "../../lib/knowledge/bundle.ts";
import { loadLens } from "../../lib/reports/lens-queries.ts";
import type { ReportSectionSpec } from "../../lib/reports/section.ts";
import { pickPrior, priorLabel, toPriorSection } from "../../lib/reports/prior.ts";

const argv = process.argv.slice(2);
const keyPath = argv.includes("--key") ? argv[argv.indexOf("--key") + 1] : undefined;
const outOpt = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : undefined;
const [evalDir, cardId] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--key" && argv[i - 1] !== "--out");
if (!evalDir || !cardId) throw new Error("사용법: judge-packets.ts <evalDir> <카드 id> [--key <judge-key.json>]");
const drafts = `${evalDir}/drafts`;
const out = outOpt ?? `${evalDir}/judge`;
mkdirSync(out, { recursive: true });

// 렌더된 HTML → 심사용 글(모양은 따로 적고, 글은 화면에 보이는 그대로)
function htmlToText(html: string, mg = false): string {
  let b = html.slice(html.indexOf('<div class="k-frame">'));
  b = b.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<caption[\s\S]*?<\/caption>/g, "");
  // 칸 안 배지·꼬리표(단계 번호 k-num·카드 꼬리표 …__tag 등)는 판면에서 따로 보이므로 글로 풀 때 띄움(붙여 쓰면 「37.6 협력회의」처럼 읽혀 심사자가 문체로 감점 — 2026-10-15)
  b = b.replace(/<\/span>/g, "</span> ");
  // 장식 화살표(ㄹ자 단계의 ▼▶▲ — aria-hidden)는 판면에서 칸 사이 연결선이라 글로 옮기지 않음(「▼▶▲」 찌꺼기로 읽혀 문체 감점 — 2026-10-15)
  b = b.replace(/<li aria-hidden="true"[^>]*>[^<]*<\/li>/g, "");
  // 꼬리표 칩(k-tag)은 판면에서 따로 보이는 상자라 [ ]로 — 맨 글로 이으면 「기록 보존 보존 기간」처럼 겹쳐 읽힘(2026-10-15)
  b = b.replace(/<span class="k-tag">([^<]*)<\/span>/g, "[$1] ");
  // 속성이 붙은 칸(연혁 점 마지막 칸 aria-current 등)도 칸 줄로 — 안 그러면 앞 칸 글에 붙음(「구축(계획)’27년 이용종료」, 2026-10-15)
  // 단계·연도 흐름의 바깥 칸(<li> 바로 뒤에 칸 머리 div)은 불릿이 아니라 칸 경계 — 칸 머리 규칙(▸)이 줄을 나누므로 지움(안 지우면 빈 「·」 줄, 2026-10-15)
  b = b.replace(/<li(?: [^>]*)?>(?=<div class="k-[a-z-]*__h")/g, "");
  b = b.replace(/<li (?!aria-hidden)[^>]*>/g, "<li>");
  // 자리표시(k-need)는 표를 글로 풀기 전에 표지로 — 뒤에 하면 표 칸 안 자리표시가 맨 글로 나가 심사자가 「표지 없이 칸 이름만」으로 읽음(2026-10-15)
  b = b.replace(/<span class="k-need"[^>]*>([^<]*)<\/span>/g, "【확인 필요: $1】");
  // 블록 안 표(k-tbl)는 먼저 줄 글로 — 바깥 라벨 사다리(th)와 섞이지 않게
  b = b.replace(/<table class="(?!k-ladder)k-[^"]*"[^>]*>([\s\S]*?)<\/table>/g, (_m, inner: string) =>
    inner
      .replace(/<colgroup[\s\S]*?<\/colgroup>/g, "")
      // 칸 안 문단(추진실적 열의 머리·수치·뜻·결과 줄)은 판면에서 줄이 나뉘므로 「/」로 띄움(붙이면 「추진실적0.5’26 상반기…」 — 2026-10-15)
      .replace(/<p class="k-res__h">([^<]*)<\/p>/g, "$1: ")
      .replace(/<\/p>\s*<p[^>]*>/g, " / ")
      .replace(/<li>/g, " · ")
      .replace(/<tr[^>]*>/g, "\n    표 행: ")
      .replace(/<t[hd][^>]*>/g, " | ")
      .replace(/<b>|<\/b>/g, "**")
      .replace(/<[^>]+>/g, ""),
  );
  // 주요사업: 첫 대상사업 상자·실행과제 띠는 지움. 경영관리: 평가내용·대주제·절이 여러 번 나오므로 구조 표지로 남김
  b = (mg
    ? b
        .replace(/<p class="k-biz">/g, "\n\n◆ ")
        .replace(/<span class="k-biz__no">([^<]*)<\/span>/g, "$1 ")
        .replace(/<h4 class="k-task">/g, "\n\n▶ 대주제 ")
        .replace(/<span class="k-task__no">([^<]*)<\/span>/g, "$1 ")
        .replace(/<span class="k-task__t">/g, "")
        .replace(/<h5 class="k-sub">/g, "\n\n■ 절 ")
    : b
        .replace(/<p class="k-biz">[\s\S]*?<\/p>/, "")
        .replace(/<h4 class="k-task">[\s\S]*?<\/h4>/, "")
  )
    .replace(/<span class="mk[^"]*">([^<]*)<\/span>/g, " [표지:$1]")
    .replace(/<h5 class="k-sub">/g, "\n■ 소항목 제목: ")
    .replace(/<th[^>]*>/g, "\n\n【블록 라벨】 ")
    .replace(/<div class="k-result__label">/g, "\n\n【추진성과 상자】 ")
    // 막대(k-chart)는 svg의 aria-label에 「지표: 시점 값, …」이 있음 — 그림 자리 규칙보다 먼저
    .replace(/<figure class="k-chart[^"]*">[\s\S]*?aria-label="([^"]*)"[\s\S]*?<\/figure>/g, "\n  [막대: $1]")
    .replace(/<figure[^>]*aria-label="([^"]*)"[\s\S]*?<\/figure>/g, "\n  [그림 자리: $1]")
    .replace(/<div class="k-join"[^>]*>([^<]*)<\/div>/g, " $1 ")
    .replace(/<div class="k-card__h">/g, "\n  ▸ ")
    .replace(/<(?:div|span) class="k-[a-z-]*__(?:h|head|t|title|k|label)">/g, "\n  ▸ ")
    // 그 밖의 칸 안 나눔(카드 꼬리 줄 k-card__f 등)은 판면에서 줄이 따로라 「/」로 띄움(붙이면 「최소화운용수익률 개선」 — 2026-10-15)
    .replace(/<div class="k-[a-z-]*__[a-z]+"[^>]*>/g, " / ")
    .replace(/<span class="k-qa__m[^"]*"[^>]*>[^<]*<\/span>/g, "")
    .replace(/<dt>/g, "\n  Q. ")
    .replace(/<dd>/g, "\n  A. ")
    .replace(/<li>/g, "\n    · ")
    .replace(/<sup[^>]*>([^<]*)<\/sup>/g, "^($1)")
    .replace(/<span class="k-need"[^>]*>([^<]*)<\/span>/g, "【확인 필요: $1】")
    .replace(/<(?:tr|p|h\d|div class="k-[a-z]+(?:--[a-z]+)?")[^>]*>/g, "\n  ")
    .replace(/<td[^>]*>/g, " | ")
    .replace(/<b>|<\/b>|<strong>|<\/strong>/g, "**")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
  return b
    .split("\n")
    .map((l) => l.replace(/\s+$/g, "").replace(/(\S) {2,}/g, "$1 "))
    .filter((l, i, a) => l.trim() || (a[i - 1] ?? "").trim())
    .join("\n")
    .trim();
}

// 블록 모양 요약(spec) — 틀 이름·구성안은 넣지 않음(블라인드)

function shapes(spec: ReportSectionSpec): string {
  // 경영관리: 블록이 놓인 절(spec.mg.at[i] = 절 열쇠 `평가내용.대주제.표지`)을 앞에 붙임
  const partOf = (i: number): string => {
    const k = spec.mg?.at?.[i] as string | undefined;
    if (!k) return "";
    const p = (spec.mg?.parts ?? []).find((x) => x.key === k);
    const [e, t] = k.split(".");
    return `[평가내용 ${e} · 대주제 ${t} · ${p?.mark || "본문"}] `;
  };
  return (spec.blocks ?? [])
    .map((b, i) => {
      const n = (b.cells?.length || b.items?.length || b.rows?.length || b.series?.length || 0) as number;
      const lay = [b.layout === "full" ? "전폭" : "", b.layout === "stage" ? "단 띠" : "", b.span === "half" ? "반 폭" : ""].filter(Boolean).join("·");
      const figs = (b.figures ?? []).length ? ` · 그림 자리 ${(b.figures ?? []).length}` : "";
      return `${partOf(i)}${i + 1}. 「${b.label || "(라벨 없음)"}」 — ${shapeName(b.kind, b.variant ?? "")}${n ? ` ${n}칸` : ""}${lay ? ` · ${lay}` : ""}${figs}`;
    })
    .join("\n");
}

// 초안 모델이 받은 숫자·사실 근거 중 위 절에 없는 것(5~8번 절). 합계 EXTRA_MAX자 넘으면 뒤 조각부터 제목만
const EXTRA_MAX = 60_000;
const SOURCE_NOTE = "> 이 묶음은 초안 모델이 받은 숫자·사실 근거를 담음 — 여기 없는 숫자·사실만 지어낸 것으로 봄";
interface ExtraItem { title: string; text: string }
function extraSection(heading: string, items: ExtraItem[], budget: { left: number }): string[] {
  const lines = [heading];
  if (!items.length) return [...lines, "(없음)", ""];
  let cut = 0;
  for (const it of items) {
    if (cut || it.text.length > budget.left) {
      if (!cut) lines.push("(이하 조각 글 줄임 — 제목만)");
      cut++;
      lines.push(`- ${it.title}`);
    } else {
      budget.left -= it.text.length;
      lines.push(`### ${it.title}`, it.text);
    }
  }
  if (cut) lines.push(`(이하 ${cut}개 조각 줄임 — 제목만)`);
  return [...lines, ""];
}
const dedupe = (items: ExtraItem[]) => items.filter((it, i) => items.findIndex((x) => x.title === it.title && x.text === it.text) === i);

const ids = readdirSync(drafts)
  .filter((f) => f.endsWith(".html.json"))
  .map((f) => f.slice(0, -".html.json".length));
let key: Record<string, string>;
if (keyPath) key = JSON.parse(readFileSync(keyPath, "utf8"));
else {
  // 무작위 블라인드 이름
  key = {};
  [...ids].sort(() => Math.random() - 0.5).forEach((id, i) => (key[`D${String(i + 1).padStart(2, "0")}`] = id));
  writeFileSync(`${evalDir}/judge-key.json`, JSON.stringify(key, null, 1));
}
const specs: ReportSectionSpec[] = Object.values(key).map((id) => JSON.parse(readFileSync(`${drafts}/${id}.html.json`, "utf8")));
// 경영관리 모드: 카드 id가 「경영관리」로 시작하거나 초안 spec에 mg(절 골격)가 있을 때
const isMg = cardId.startsWith("경영관리") || specs.some((sp) => sp.mg);
for (const [blind, id] of Object.entries(key)) {
  const spec = JSON.parse(readFileSync(`${drafts}/${id}.html.json`, "utf8"));
  const html = readFileSync(`${drafts}/${id}.html`, "utf8");
  writeFileSync(`${out}/${blind}.md`, `# 초안 ${blind}\n\n## 블록 짜임(위에서 아래 순서)\n${shapes(spec)}\n\n## 판면에 보이는 글\n${htmlToText(html, isMg)}\n`);
}

// 근거 묶음(심사자 공통)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: card, error } = await db.from("cards").select("id, eval_unit_id, team_id, data").eq("id", cardId).single();
if (error || !card) throw new Error(`카드를 읽지 못함: ${error?.message}`);
const { data: outline } = await db.from("report_outline").select("pages, included").eq("card_id", card.id).eq("year", 2026).maybeSingle();
const { data: matRows } = await db.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id).order("created_at", { ascending: true });
const mats = ((matRows ?? []) as MaterialRow[]).filter((r) => materialState(r) === "ready").sort((a, b) => a.file_name.localeCompare(b.file_name));
const { data: priorRows } = await db.from("knowledge_chunks").select("chunk_key, business, title, text, report_page_2025, meta").eq("doc_id", "rpt25-biz").eq("business", card.eval_unit_id);
const prior = pickPrior(card.data, (priorRows ?? []).map(toPriorSection));
const lens = await loadLens(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data });
const kb = await loadCardBundle(db, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "report");
const linkedRefs: ExtraItem[] = relevantRefs(kb).map((r) => ({ title: `${r.title}${r.where ? ` (${r.where})` : ""} [${r.unitType}]`, text: r.text }));
const lensItem = (l: { title: string; where: string; text: string }): ExtraItem => ({ title: `${l.title}${l.where ? ` (${l.where})` : ""}`, text: l.text });
const firstCritique = lens.find((l) => l.group === "critiques");
const pickLens = lens.filter((l) => l === firstCritique || (l.group === "criteria" && (l.key.includes("handbook26") || l.key.includes("ref3") || l.key.endsWith("II/2/s2"))));
if (isMg) {
  // 경영관리: 초안들이 맡은 평가내용의 2025 절 글 + 지표 편람·'25 평가위원 의견·작성 착안사항 + 쪽 배정
  const mgSecs = await loadMgPrior(db, card.eval_unit_id);
  const taskNo = String(card.data?.taskNo ?? card.id.split("/").pop() ?? "");
  const used = [...new Set(specs.flatMap((sp) => (sp.mg?.parts ?? []).map((p) => Number(p.evalNo))))].filter((n) => n > 0).sort((a, b) => a - b);
  const evals = used.length ? used : defaultEvals(taskNo, mgSecs);
  const PRIOR_MAX = 20_000;
  let used_chars = 0;
  const priorLines: string[] = [];
  for (const n of evals) {
    const secs = mgSecs.filter((x) => x.evalNo === n);
    priorLines.push(`### 평가내용 ${n}${secs[0] ? ` ${secs[0].evalTitle}` : ""}`);
    for (const x of secs) {
      const head = `#### 대주제 ${x.themeNo} ${x.themeTitle}${x.mark ? ` · ${x.mark}. ${x.title}` : " · 본문"}${x.page ? ` (2025 ${x.page}쪽)` : ""}`;
      if (used_chars + x.text.length > PRIOR_MAX) priorLines.push(`${head} — (글 생략: 분량 한도)`);
      else {
        used_chars += x.text.length;
        priorLines.push(head, x.text);
      }
    }
  }
  const mgPages = outline?.pages ? Number(outline.pages) : await loadMgCardPages(db, { id: card.id, eval_unit_id: card.eval_unit_id }, 2026);
  // 편람·평가위원 의견·작성 착안사항(기준 묶음 전부 + '25 평가보고서 평가위원 의견) 합계 1.5만 자
  const lensMg = lens.filter((l) => l.group === "criteria" || (l.group === "critiques" && l.key.includes("/eval25/")));
  let lensChars = 0;
  const lensOut = lensMg.filter((l) => (lensChars += l.text.length) <= 15_000);
  const budget = { left: EXTRA_MAX };
  const mainText = [inspectionCardText(card.data), ...mats.map((m) => m.parsed_text ?? ""), ...priorLines, ...lensOut.map((l) => l.text)].join("\n");
  const inMain = (t: string) => mainText.includes(t);
  const [rep, core] = await Promise.all([
    db.from("knowledge_chunks").select("chunk_key, title, text").like("doc_id", "rpt25-mg-%").eq("business", card.eval_unit_id).order("doc_id").order("chunk_key"),
    db.from("knowledge_chunks").select("chunk_key, title, text").eq("unit_type", "core_item").eq("business", card.eval_unit_id).order("chunk_key"),
  ]);
  const mgNums: ExtraItem[] = [...(rep.data ?? []), ...(core.data ?? [])].map((r) => ({ title: `${r.title} [${r.chunk_key}]`, text: String(r.text ?? "") })).filter((x) => x.text.trim() && !inMain(x.text));
  const shown = (l: { text: string }) => lensOut.some((o) => o.text === l.text);
  const surveyAll = lens.filter((l) => l.group === "survey").map(lensItem);
  const critAll = lens.filter((l) => l.group === "critiques" && !shown(l)).map(lensItem);
  const extra = [
    ...extraSection("## 5. 실사 질의응답('25) — 초안 모델이 숫자 근거로 받음(전부)", surveyAll, budget),
    ...extraSection("## 6. '25 평가위원 지적(4번 절에 없는 나머지)", critAll, budget),
    ...extraSection("## 7. 이 과제에 연결된 공통 지식 조각", dedupe(linkedRefs), budget),
    ...extraSection("## 8. 지표 2025 보고서 전 장·핵심공통항목(위 절에 없는 것)", mgNums, budget),
  ];
  const mgSrc = [
    `# 근거 묶음 — ${card.id} 「${card.data?.title ?? ""}」 (${card.eval_unit_id})`,
    SOURCE_NOTE,
    `분량: ${mgPages ? `이 과제의 쪽 배정은 ${mgPages}쪽 — ` : ""}2025 보고서처럼 평가내용 → 대주제 → 절 구조. 2026년도 경영실적보고서(경영관리) 지표 하나 중 이 과제가 맡은 부분입니다.`,
    "",
    "## 1. 과제관리카드 본문(원장)",
    inspectionCardText(card.data),
    "",
    `## 2. 카드 전용 자료(부서가 올린 파일 ${mats.length}건 — 저장본 전체 글)`,
    ...mats.map((m) => `### ${m.file_name}\n${m.parsed_text ?? ""}`),
    "",
    `## 3. 2025 경영실적보고서 — 이 과제가 맡은 평가내용(${evals.join("·") || "없음"}) 절`,
    ...priorLines,
    "",
    "## 4. 평가 기준·평가위원 관점 발췌",
    ...lensOut.map((l) => `### ${l.title} (${l.where})\n${l.text}`),
    "",
    ...extra,
  ].join("\n");
  writeFileSync(`${out}/_sources.md`, mgSrc);
  console.log("packets", Object.keys(key).length, "(경영관리) sources chars", mgSrc.length, "자료", mats.length, "평가내용", evals.join(","), "2025 글", used_chars, "lens", lensOut.map((l) => l.title).join(" | "), "쪽", mgPages);
  process.exit(0);
}
const pages = outline?.pages ? Number(outline.pages) : null;
const bizBudget = { left: EXTRA_MAX };
const bizExtra = [
  ...extraSection("## 5. 실사 질의응답('25) — 초안 모델이 숫자 근거로 받음(전부)", lens.filter((l) => l.group === "survey").map(lensItem), bizBudget),
  ...extraSection("## 6. '25 평가위원 지적(4번 절에 없는 나머지)", lens.filter((l) => l.group === "critiques" && !pickLens.includes(l)).map(lensItem), bizBudget),
  ...extraSection("## 7. 이 과제에 연결된 공통 지식 조각", dedupe(linkedRefs), bizBudget),
];
const src = [
  `# 근거 묶음 — ${card.id} 「${card.data?.title ?? ""}」`,
  SOURCE_NOTE,
  `판면: ${pages ? `이 과제의 쪽 배정은 ${pages}쪽(블록 영역 약 ${Math.round(pages * 255 * 10) / 10}mm)입니다. ` : ""}2026년도 경영실적보고서(주요사업) 평가내용2 소항목 하나(제목 + 블록 + 추진성과 상자)입니다.`,
  "",
  "## 1. 과제관리카드 본문(원장)",
  inspectionCardText(card.data),
  "",
  `## 2. 카드 전용 자료(부서가 올린 파일 ${mats.length}건 — 저장본 전체 글)`,
  ...mats.map((m) => `### ${m.file_name}\n${m.parsed_text ?? ""}`),
  "",
  ...(prior.length ? prior.flatMap((p, i) => [`## 3${prior.length > 1 ? `-${i + 1}` : ""}. 2025 경영실적보고서 — 이 과제의 전신 절: ${priorLabel(p.section)}`, p.section.text, ""]) : ["## 3. 2025 경영실적보고서 — 전신 절 없음", ""]),
  "## 4. 평가 기준·평가위원 관점 발췌",
  ...pickLens.map((l) => `### ${l.title} (${l.where})\n${l.text}`),
  "",
  ...bizExtra,
].join("\n");
writeFileSync(`${out}/_sources.md`, src);
console.log("packets", Object.keys(key).length, "sources chars", src.length, "자료", mats.length, "전년 절", prior.map((p) => priorLabel(p.section)).join(" | ") || "없음", "lens", pickLens.map((l) => l.title).join(" | "));
