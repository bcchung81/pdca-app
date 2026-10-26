// 경평 초안 문장 점검(결정론, 순수) — 2025 최종본과 견준 「읽히는 문장」 규칙을 코드로 봄(docs/plan/경평초안-문장품질-수정안.md P7).
// 평가 세트 M 초안 162문장 ↔ 2025 같은 과제 절 316문장 실측: 한 칸에 항목을 나열한 글 19% vs 5%, 관리 정보(예산·인원)·풀지 않은 약어가 칸 글에,
// 라벨 「’25 지적 개선」 3/8장(2025 0). 찾은 문제는 초안 경고(「문장: 」)와 고치기 요청에 같은 문장으로 넣음 — 고치지 않고 알림.

import { plainText } from "./fit.ts";
import type { Block } from "./blocks.ts";
import type { ReportSectionSpec } from "./section.ts";

/** 문장 하나(어디·원문) */
interface Sentence {
  where: string;
  text: string;
}

/** 점검할 문장: 블록 칸 글·불릿·전후 비교 칸·띠 본문 + 추진성과(인용·말풍선 원문과 막대는 뺌) */
function sentencesOf(spec: Pick<ReportSectionSpec, "blocks" | "results">): Sentence[] {
  const out: Sentence[] = [];
  for (const b of spec.blocks ?? []) {
    if (b.kind === "quotes" || b.kind === "voices" || b.kind === "chart") continue;
    const where = b.label || b.kind;
    for (const t of [b.text, ...b.items, ...b.cells.flatMap((c) => [...c.bullets, c.note]), ...b.rows.flatMap((r) => [...r.before, ...r.after])]) if (t) out.push({ where, text: t });
  }
  for (const t of spec.results) out.push({ where: "추진성과", text: t });
  return out.map((x) => ({ ...x, text: plainText(x.text).replace(/【확인:[^】]*】/g, "○○") })).filter((x) => x.text.replace(/\s/g, "").length >= 8);
}

/**
 * 항목 나열인가: 괄호 풀이를 뺀 글에서 쉼표 2개 이상, 가운뎃점 3개 이상, 또는 쉼표 1개 + 가운뎃점 2개 이상이면 한 칸에 서로 다른 항목을 몰아 넣은 글.
 * 2025 모범 문장 「사다리･철탑 작업은 추락 위험 상시 노출, 현장 여건상 … 한계」(쉼표 1·가운뎃점 1)는 걸리지 않음 — 평가 세트 2025 316문장 중 걸리는 것은
 * 기관 이름 나열 몇 개뿐, M 초안은 「RIMS에 적용 여부･판독･사후검증 시간 입력･관리」「산악 커버리지 분석, 현장 … 수집, 신속 … 운영」
 */
export function isListed(text: string): boolean {
  const t = text.replace(/\([^()]*\)/g, "");
  const commas = (t.match(/,/g) ?? []).length;
  const dots = (t.match(/[･·∙]/g) ?? []).length;
  return commas >= 2 || dots >= 3 || (commas >= 1 && dots >= 2);
}

/** 관리 정보(예산·인원) — 성과(절감·절약)를 말하는 글은 뺌 */
const ADMIN_RE = /(본사|본부|팀|전담|담당)\s?\d+\s?명|\d[\d,.]*\s?백만\s?원|(자체|협약)\s?예산/;
const SAVING_RE = /절감|절약|줄/;
/**
 * 수치 띠(stats)의 큰 수치가 투입 인력·예산 액수인 칸(「인력 | 6명 | 과제 투입인력(본사)」·「예산 | 2,700백만원 | 과제 협약 예산」) — 큰 수치(head)는 칸 글 점검에서
 * 빠져 있어 따로 봄. 평가 라운드 O·P·R·S마다 1건씩 나옴, 2025 최종본 칸에 같은 규칙을 대면 0.2~0.3%(2026-10-10)
 */
const STAT_AMOUNT_RE = /^(?:약\s?)?\d[\d,.]*\s?(?:명|원|천\s?원|만\s?원|백만\s?원|억\s?원)/;
const STAT_ADMIN_RE = /투입|예산|협약/;

/**
 * 널리 아는 약어(풀지 않아도 됨). 둘째 줄부터는 2025 최종본(주요사업 62절·경영관리 167절)이 풀지 않고 2절 이상 쓴 약어(2026-10-10 실측 —
 * 이 목록 전에는 최종본 절의 65%·54%에 약어 경고가 떠서, 경고 하나로 고치기 요청이 한 번 더 나가고 AI가 모범 답안도 안 푸는 약어를 풀었음)
 */
const KNOWN_ABBR = new Set([
  "AI", "ICT", "IT", "IoT", "KCA", "CEO", "VIP", "MOU", "R&D", "TV", "5G", "6G", "LTE", "ESG", "PC", "SW", "HW", "KT", "SKT", "LG", "SK", "KBS", "MBC", "SBS", "EBS", "YTN", "UN", "OECD", "API", "GPS", "QR", "CCTV", "SNS", "PDF", "DB", "BP", "LED", "USB", "Wi-Fi", "BLE",
  "AX", "DX", "OTT", "IPTV", "JTBC", "MBN", "XR", "CES", "CBT", "UI", "TF", "PoC", "NIA", "KISA", "HFR", "CQ", "KPI", "FAQ", "IR", "HR", "HRD", "CoP", "MMF", "LGU", "K-ESG", "SMART", "ChatGPT", "IDFA",
]);
const ABBR_RE = /(?<![A-Za-z0-9])[A-Z][A-Za-z0-9&+-]*[A-Z0-9](?![A-Za-z0-9])/g;
/** 약어가 아닌 대문자 낱말: 단계 표지(Step1)·규격 번호(ISO45001)·자리표시(OO)·K- 사업 이름(K-DOCS — 2025 최종본 5회 모두 그대로) */
const NOT_ABBR_RE = /^(?:Step\d+|ISO\d+|O+|K-[A-Za-z]+)$/;

/** 평가 대응 말(라벨·제목에 쓰지 않음) */
const EVAL_WORD_RE = /지적|재산정|산정|보조지표/;

/**
 * 문장 문제 목록(교정 요청·초안 경고에 같은 문장) — 종류마다 한 줄, 예시 3개까지.
 * ① 항목 나열(listCount ≥ 2) ② 관리 정보 ③ 풀지 않은 약어(초안 어디에도 「한글(약어)」나 「약어(한글)」 풀이가 없음) ④ 라벨·블록 머리·제목의 평가 대응 말
 */
export function proseIssues(spec: Pick<ReportSectionSpec, "blocks" | "results" | "sub">): string[] {
  const ss = sentencesOf(spec);
  const out: string[] = [];
  const ex = (xs: Sentence[]) => xs.slice(0, 3).map((x) => `[${x.where}] 「${x.text.slice(0, 28)}${x.text.length > 28 ? "…" : ""}」`).join(" / ");
  const listed = ss.filter((x) => isListed(x.text));
  if (listed.length) out.push(`한 칸에 서로 다른 항목을 나열한 글 ${listed.length}개 — 한 칸 한 명제(대상·수단·결과)로 다시 쓰고 나머지 항목은 빼거나 다른 칸으로: ${ex(listed)}`);
  const adminSs = ss.filter((x) => ADMIN_RE.test(x.text) && !SAVING_RE.test(x.text));
  const counted = new Set(adminSs.map((x) => x.text));
  const statAdmin = (spec.blocks ?? [])
    .filter((b) => b.kind === "stats")
    .flatMap((b) => b.cells.map((c) => ({ where: b.label || "수치 띠", head: plainText(c.head), bullet: plainText(c.bullets[0] ?? "").replace(/【확인:[^】]*】/g, "○○"), text: plainText(`${c.tag} ${c.head} ${c.bullets[0] ?? ""}`).trim() })))
    // 뜻 줄이 이미 관리 정보 글로 잡힌 칸은 두 번 세지 않음
    .filter((x) => STAT_AMOUNT_RE.test(x.head) && STAT_ADMIN_RE.test(x.text) && !SAVING_RE.test(x.text) && !counted.has(x.bullet));
  const admin = [...adminSs, ...statAdmin];
  if (admin.length) out.push(`관리 정보(예산·인원)만 적은 글 ${admin.length}개 — 성과·노력의 근거가 아니면 빼고 그 자리에 누가 무엇을 얻었는지를 씀: ${ex(admin)}`);
  const all = [spec.sub.title, ...(spec.blocks ?? []).flatMap((b) => [b.label, b.title, b.text, ...b.items, ...b.cells.flatMap((c) => [c.head, c.tag, ...c.bullets, c.note]), ...b.rows.flatMap((r) => [r.key, ...r.before, ...r.after])]), ...spec.results].filter(Boolean).join("\n");
  const abbrs = [...new Set(all.match(ABBR_RE) ?? [])].filter((a) => !KNOWN_ABBR.has(a) && !NOT_ABBR_RE.test(a) && a.length <= 8);
  const esc = (a: string) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bare = abbrs.filter((a) => !new RegExp(`[가-힣]\\s?\\(${esc(a)}\\)|${esc(a)}\\s?\\([가-힣]`).test(all));
  if (bare.length) out.push(`풀지 않은 약어 ${bare.join("·")} — 처음 나올 때 쉬운 이름과 함께(예: 무선국검사관리시스템(RIMS)) 쓰거나 쉬운 이름만`);
  const heads: Array<{ where: string; text: string }> = [{ where: "제목", text: spec.sub.title }, ...(spec.blocks ?? []).flatMap((b: Block) => [{ where: "라벨", text: b.label }, { where: "블록 머리", text: b.title }])].filter((x) => x.text && EVAL_WORD_RE.test(x.text));
  if (heads.length) out.push(`제목·라벨에 평가 대응 말(지적·산정·보조지표) ${heads.length}곳 — 내용 이름(누가 무엇을 얻나)으로 바꾸고 지적 해소는 전후 비교 한 행과 지적개선 마커로만: ${heads.slice(0, 3).map((x) => `[${x.where}] 「${x.text}」`).join(" / ")}`);
  return out;
}
