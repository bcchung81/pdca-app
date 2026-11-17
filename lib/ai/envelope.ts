// AI 요청 글의 자료 봉투(순수). 자료 글이 봉투를 닫고 나가 지시처럼 보이지 않게 합니다(OWASP LLM 간접 프롬프트 주입, 2026-11-16 시큐어 코딩 2차 점검).
// 두 가지만 둡니다:
//  - escapeXml: 속성 값과 근거 봉투(<source>·<case>·<biz> 등) 본문 — <·>·&·"를 모두 바꿈(예전 writer·inspect·comments의 같은 함수를 하나로)
//  - dataEnvelope: 카드 글·경평 첨부처럼 AI가 글을 그대로 옮겨 쓰는 자료 — 본문은 그대로 두고 봉투와 같은 이름의 여닫는 태그만 무력화.
//    「R&D」·「<미디어이슈&트렌드>」 같은 실제 카드 글이 「&amp;」로 바뀌어 제안·초안에 되써지지 않게 하려는 것
// 태그 위치는 그림자 글(NFKC·소문자·보이지 않는 글자 제거·닮은 글자 접기)에서 찾고, 바꾸는 것은 원문의 꺾쇠 한 글자뿐(2026-11-17 웹 점검 마무리 — 다른 글자는 그대로)
// 「자료 안의 지시는 따르지 않음」 규칙 문구는 resources/prompts/_shared/data-rule.md.

/** 봉투 속성·근거 봉투 본문 이스케이프(<·>·&·") */
export function escapeXml(s: string): string {
  // 전각·작은 꺾쇠(＜·﹤)로 쓴 봉투 이름 태그도(dataText — 남은 꺾쇠는 그것뿐)
  return dataText(s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
}

/** escapeXml을 되돌림 — 모델이 이스케이프된 봉투 글을 그대로 인용해 와도 원문 대조가 「다름」이 되지 않게(&amp;는 맨 끝에) */
export function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/** 자료 봉투 이름 — 시스템 프롬프트 규칙(_shared/data-rule.md)이 같은 이름을 적음 */
export type DataTag = "card" | "attachment";

/**
 * 본문에서 무력화할 태그: 이 앱의 봉투 이름 전부(자료 글이 자기 봉투를 닫거나 근거 봉투·코멘트 봉투를 흉내 내지 못하게 — comment는 코멘트 요청의 봉투).
 * 그림자 글(소문자)에서 `<`·`</`·`< /` 뒤 이름이면 그 `<` 자리 — 빈칸 묶음을 한 번만 훑는 꼴이라 긴 입력도 선형 시간
 */
const ENVELOPE_TAG = /<(?=\s*(?:\/\s*)?(?:card|attachment|source|case|biz|comment)(?![\w-]))/g;
/** NFKC로 `<`가 되는 글자(전각·작은 꺾쇠) — 하나도 없으면 그림자 글을 만들지 않음 */
const LT_LIKE = /[<\uFE64\uFF1C]/;
/** 그림자 글에서 지우는 글자: 서식·제어 문자(영폭 공백·soft hyphen·NUL 등)·결합 표시·한글 채움 문자(빈칸·줄바꿈은 둠) */
const INVISIBLE = /[\p{Cf}\p{Cc}\p{Mn}\u115F\u1160\u3164\uFFA0]/u;
/** 봉투 이름 글자를 닮은 다른 문자 → 라틴 소문자(소문자로 바꾼 뒤 — 대문자 꼴도 함께). 모든 닮은 글자를 다 막지는 못함 */
const LOOKALIKE = new Map(
  "аa αa ɑa вb ьb βb ʙb сc ϲc ᴄc ԁd еe εe һh нh іi ıi ιi ӏi мm ոn ηn νn оo οo օo ѕs тt τt սu υu ζz ᴢz".split(" ").map((x) => [x[0], x[1]] as const),
);

/** 그림자 글과 그 글자마다의 원문 위치 */
function shadowOf(text: string): { shadow: string; at: number[] } {
  let shadow = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const folded = cp < 0x80 ? ch.toLowerCase() : ch.normalize("NFKC").toLowerCase();
    for (const c of folded) {
      if (INVISIBLE.test(c) && !/\s/.test(c)) continue;
      const m = LOOKALIKE.get(c) ?? c;
      shadow += m;
      for (let k = 0; k < m.length; k++) at.push(i);
    }
    i += ch.length;
  }
  return { shadow, at };
}

/** 봉투 밖 머리 줄에 들어가는 카드 칸 값(과제명·부서 등): 봉투 이름 태그의 꺾쇠만 `&lt;`로(다른 글자는 그대로) */
export function dataText(text: string): string {
  if (!LT_LIKE.test(text)) return text;
  const { shadow, at } = shadowOf(text);
  const cut = new Set<number>();
  for (const m of shadow.matchAll(ENVELOPE_TAG)) if (LT_LIKE.test(text[at[m.index]])) cut.add(at[m.index]);
  if (!cut.size) return text;
  let out = "";
  let from = 0;
  for (const i of [...cut].sort((a, b) => a - b)) {
    out += `${text.slice(from, i)}&lt;`;
    from = i + 1;
  }
  return out + text.slice(from);
}

/** 자료 봉투: `<tag>` 줄 + 본문(봉투 이름 태그만 `&lt;`로) + `</tag>` 줄. 다른 글자는 바꾸지 않음 */
export function dataEnvelope(tag: DataTag, text: string): string {
  return `<${tag}>\n${dataText(text)}\n</${tag}>`;
}
