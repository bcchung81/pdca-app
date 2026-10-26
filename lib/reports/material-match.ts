// 보고서 추가자료 ↔ 과제 연결의 순수 규칙(참고자료 3단계, docs/plan/참고자료-3단계-구현계획.md P3 · 3-5 재정의 — 삭제, git 이력 c7dfa69): 화면의 첫 선택, 저장 계획, 자료의 관계.
// 어느 과제 자료인지는 사람이 고른다(AI가 미리 분석하지 않음). 숫자 근거는 사람이 확정한 연결만 인정한다. 파일 이름에 과제번호가 있으면 화면이 미리 체크해 줄 뿐 저장 전에는 숫자 근거가 아님. 입출력 없음.

/** report_material_cards 한 행(화면·서버 공용). 지금 만드는 것은 사람이 확정한 행(status = confirmed)뿐 */
export interface MaterialMatch {
  cardId: string;
  /** 옛 AI 제안 행은 ai, 지금은 늘 human */
  method: "ai" | "human";
  basis: string | null;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 파일 이름에 과제번호(예: 「1-가」)가 들어 있는 과제 — 화면이 미리 체크해 주는 제안. 본문은 보지 않음(우연히 같은 번호가 나와 틀리기 쉬움).
 * macOS 파일 이름은 자모 분리(NFD)일 수 있어 정규화해서 견줌. 앞에 숫자가 붙거나(11-가) 뒤에 글자가 이어지면(1-가지) 다른 말로 봄
 */
export function suggestCards(fileName: string, cards: ReadonlyArray<{ id: string; taskNo: string }>): string[] {
  const name = fileName.normalize("NFC");
  return cards
    .filter((c) => {
      const no = c.taskNo.normalize("NFC").trim();
      return no !== "" && new RegExp(`(?<![0-9])${escapeRegExp(no)}(?![0-9가-힣])`).test(name);
    })
    .map((c) => c.id);
}

/** 화면의 첫 선택: 사람이 이미 확정한 것이 있으면 그대로, 없으면 파일 이름 제안(미리 체크 — 저장해야 확정) */
export function initialSelection(matches: MaterialMatch[], suggested: string[] = []): string[] {
  return matches.length ? matches.map((m) => m.cardId) : [...suggested];
}

export interface MaterialSummary {
  /** confirmed = 사람이 확정한 연결이 있음 · suggested = 확정은 없고 파일 이름 제안만 있음(저장 전) · none = 연결 없음(같은 보고서 자료) */
  state: "confirmed" | "suggested" | "none";
  confirmed: number;
  suggested: number;
}

export function materialSummary(matches: MaterialMatch[], suggested: string[] = []): MaterialSummary {
  if (matches.length) return { state: "confirmed", confirmed: matches.length, suggested: 0 };
  return { state: suggested.length ? "suggested" : "none", confirmed: 0, suggested: suggested.length };
}

export interface SelectionPlan {
  /** 이 보고서의 활성 과제가 아닌 것(있으면 저장하지 않음) */
  invalid: string[];
  /** 확정으로 쓸 행 — 이미 있던 과제는 method·근거를 그대로 두고, 아니면 사람이 직접 고른 것(human) */
  upsert: Array<{ cardId: string; method: "ai" | "human"; basis: string | null }>;
  /** 체크를 뺀 과제 — 연결을 지움 */
  remove: string[];
}

/** 체크한 과제 목록 → 저장 계획. 하나도 안 고르면 연결이 모두 지워져 「같은 보고서 자료」가 됨 */
export function planMaterialSelection(existing: MaterialMatch[], selected: string[], valid: ReadonlySet<string>): SelectionPlan {
  const picked = [...new Set(selected)];
  const cur = new Map(existing.map((m) => [m.cardId, m]));
  return {
    invalid: picked.filter((id) => !valid.has(id)),
    upsert: picked.filter((id) => valid.has(id)).map((cardId) => ({ cardId, method: cur.get(cardId)?.method ?? "human", basis: cur.get(cardId)?.basis ?? null })),
    remove: existing.map((m) => m.cardId).filter((id) => !picked.includes(id)),
  };
}

export type FileRelation = "card" | "matched" | "same-report";

/**
 * 경평 초안에 넣는 자료가 이 과제와 맺는 관계와 숫자 근거 인정 여부.
 * 카드 전용 자료는 그 과제 자료라 늘 인정, 보고서 추가자료는 이 과제에 확정한 연결이 있을 때만 인정(없으면 같은 보고서 자료 — 넣되 숫자 근거 아님)
 */
export function fileRelation(doc: { id: string; kind: "card" | "report" }, confirmed: ReadonlySet<string>): { relation: FileRelation; numberEvidence: boolean } {
  if (doc.kind === "card") return { relation: "card", numberEvidence: true };
  return confirmed.has(doc.id) ? { relation: "matched", numberEvidence: true } : { relation: "same-report", numberEvidence: false };
}
