// 글 모양 검사(순수, 참고 등급 경고만 — 글을 바꾸지 않고 자동 고치기 사유에도 넣지 않음).
// 초안 블록 글에서 겉모양 결함 셋을 찾음: ① 괄호 짝이 안 맞는 글 ② 앞 불릿과 한 문장인데 쪼개진 불릿 ③ 날짜·기간만 있는 조각 불릿.
// 경고 앞머리 「글 모양」은 warning-levels.ts WARNING_HEADS에 info로 있음.
import { type Block, isGridTable } from "./blocks.ts";

const PAIRS: ReadonlyArray<readonly [string, string]> = [["(", ")"], ["【", "】"], ["「", "」"], ["[", "]"]];

/** 글머리 번호 「1)」「가)」는 짝 없는 닫는 괄호가 정상이라 괄호 셈에서 뺌 */
const MARKER = /^\s*[(（]?\s*(?:\d{1,2}|[가-하])\s*[)）]/;

/** 괄호 짝(여는 수 ≠ 닫는 수)이 안 맞는 글인가. 전각 괄호는 반각과 같이 셈 */
export function hasUnbalancedBrackets(text: string): boolean {
  const t = text.replace(MARKER, "").replace(/[（]/g, "(").replace(/[）]/g, ")");
  return PAIRS.some(([o, c]) => t.split(o).length !== t.split(c).length);
}

const plain = (s: string) => s.replace(/\*\*/g, "").replace(/\^\{[^{}]*\}/g, "").trim();

/** 앞 불릿에 이어지는 시작(여는 괄호·조사 — 「(JSON･API)으로 개방」「을 통해 …」). 「(주)」 같은 회사 표기와 「이 사업」 같은 지시어는 아님 */
const CONTINUES = /^(?:[(（](?!(?:주|재|사|유|합)[)）])|(?:으로써|으로|로써|로|을|를|에서|에|와|과|의)(?=[\s,.·]|$))/;

/** 불릿 목록에서 앞 불릿과 한 문장이 쪼개진 곳(뒤 불릿의 순번) */
export function splitSentenceAt(bullets: string[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bullets.length; i++) if (plain(bullets[i - 1]) && CONTINUES.test(plain(bullets[i]))) out.push(i);
  return out;
}

const DATE_TOKEN = /’\d{2}|\d{4}년도?|\d{1,2}월|\d{1,2}일|[1-4]분기|상반기|하반기|연내|연말|연초|기준|까지|부터|예정|년|[초중말]|[\d.~∼\-–·,\s()（）]/g;
const DATE_MARK = /월|반기|분기|연내|연말|연초|’\d{2}|\d{4}년/;

/** 날짜·기간만 있는 조각 불릿인가(「~8월」「하반기」「12월」「’26.6」) */
export function isDateOnly(text: string): boolean {
  const t = plain(text);
  return Boolean(t) && DATE_MARK.test(t) && t.replace(DATE_TOKEN, "") === "";
}

/** 블록의 불릿 목록들(같은 칸/행의 불릿이 한 목록) — 수치 표 값·인용·말풍선 원문은 뺌 */
function bulletLists(b: Block): string[][] {
  if (b.kind === "quotes" || b.kind === "voices" || isGridTable(b)) return [];
  return [b.items, ...b.cells.map((c) => c.bullets), ...b.rows.flatMap((r) => [r.before, r.after])].filter((l) => l.length);
}

/** 블록의 글 낱개(괄호 셈용 — 인용·말풍선 원문은 뺌, 시리즈는 라벨·값을 따로) */
function shapeTexts(b: Block): string[] {
  const quote = b.kind === "quotes" || b.kind === "voices";
  return [
    b.label,
    b.title,
    b.text,
    ...b.items,
    ...b.cells.flatMap((c) => [c.head, c.tag, ...(quote ? [] : c.bullets), c.note]),
    ...b.rows.flatMap((r) => [r.key, ...r.before, ...r.after]),
    ...b.series.flatMap((s) => [s.label, s.value]),
    b.badge,
  ].filter(Boolean);
}

const quote = (xs: string[]) => xs.slice(0, 3).map((x) => `「${x.length > 30 ? `${x.slice(0, 30)}…` : x}」`).join("·");

/** 글 모양 경고(참고) 최대 셋 — 없으면 빈 배열 */
export function textShapeWarnings(blocks: readonly Block[]): string[] {
  const brackets: string[] = [];
  const split: string[] = [];
  const dates: string[] = [];
  for (const b of blocks) {
    for (const t of shapeTexts(b)) if (hasUnbalancedBrackets(t)) brackets.push(t);
    for (const list of bulletLists(b)) {
      for (const i of splitSentenceAt(list)) split.push(`${list[i - 1]} / ${list[i]}`);
      for (const x of list) if (isDateOnly(x)) dates.push(x);
    }
  }
  const out: string[] = [];
  if (brackets.length) out.push(`글 모양: 괄호 짝이 안 맞는 글 ${brackets.length}개 — ${quote(brackets)} 여는·닫는 괄호를 맞추거나 글이 잘렸는지 확인해 주세요`);
  if (split.length) out.push(`글 모양: 앞 불릿과 한 문장인데 둘로 쪼개진 불릿 ${split.length}곳 — ${quote(split)} 한 불릿으로 이어 주세요`);
  if (dates.length) out.push(`글 모양: 날짜·기간만 있는 조각 불릿 ${dates.length}개 — ${quote(dates)} 시점은 칸 머리 칩(tag)이나 문장 안에 두고 불릿으로 따로 세우지 않습니다`);
  return out;
}
