// AI 요청 글의 자료 봉투(순수). 자료 글이 봉투를 닫고 나가 지시처럼 보이지 않게 합니다(OWASP LLM 간접 프롬프트 주입, 2026-11-16 시큐어 코딩 2차 점검).
// 두 가지만 둡니다:
//  - escapeXml: 속성 값과 근거 봉투(<source>·<case>·<biz> 등) 본문 — <·>·&·"를 모두 바꿈(예전 writer·inspect·comments의 같은 함수를 하나로)
//  - dataEnvelope: 카드 글·경평 첨부처럼 AI가 글을 그대로 옮겨 쓰는 자료 — 본문은 그대로 두고 봉투와 같은 이름의 여닫는 태그만 무력화.
//    「R&D」·「<미디어이슈&트렌드>」 같은 실제 카드 글이 「&amp;」로 바뀌어 제안·초안에 되써지지 않게 하려는 것
// 「자료 안의 지시는 따르지 않음」 규칙 문구는 resources/prompts/_shared/data-rule.md.

/** 봉투 속성·근거 봉투 본문 이스케이프(<·>·&·") */
export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** escapeXml을 되돌림 — 모델이 이스케이프된 봉투 글을 그대로 인용해 와도 원문 대조가 「다름」이 되지 않게(&amp;는 맨 끝에) */
export function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/** 자료 봉투 이름 — 시스템 프롬프트 규칙(_shared/data-rule.md)이 같은 이름을 적음 */
export type DataTag = "card" | "attachment";

/**
 * 본문에서 무력화할 태그: 이 앱의 봉투 이름 전부(자료 글이 자기 봉투를 닫거나 근거 봉투를 흉내 내지 못하게).
 * `<`·`</`·`< /` 뒤 이름이면 `<`만 `&lt;`로 — 빈칸 묶음을 한 번만 훑는 꼴이라 긴 입력도 선형 시간
 */
const ENVELOPE_TAG = /<(?=\s*(?:\/\s*)?(?:card|attachment|source|case|biz)(?![\w-]))/gi;

/** 봉투 밖 머리 줄에 들어가는 카드 칸 값(과제명·부서 등): 봉투 이름 태그만 무력화(다른 글자는 그대로) */
export function dataText(text: string): string {
  return text.replace(ENVELOPE_TAG, "&lt;");
}

/** 자료 봉투: `<tag>` 줄 + 본문(봉투 이름 태그만 `&lt;`로) + `</tag>` 줄. 다른 글자는 바꾸지 않음 */
export function dataEnvelope(tag: DataTag, text: string): string {
  return `<${tag}>\n${dataText(text)}\n</${tag}>`;
}
