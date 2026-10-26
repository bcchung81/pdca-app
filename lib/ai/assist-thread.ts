// 카드 「AI 작성지원」 대화 기록(순수): 요청 종류(구조화 제안)와 「질문」(자유 대화)을 한 흐름에 차례로 쌓아 보여 주고
// 이 브라우저 탭에만 남깁니다(sessionStorage). 서버는 결과 본문을 저장하지 않습니다(ai_requests에 토큰만).
// 옆 창을 닫았다 열거나 AI가 도는 사이 닫아도 결과가 남고, 「질문」은 앞의 요청·답을 이어서 물을 수 있습니다.
import type { ChatTurn } from "./chat.ts";
import { type VerifiedResult, WRITER_MODES, type WriterMode } from "./writer.ts";

/** 없앤 요청 종류 — 이 탭에 남은 옛 기록을 버리지 않고 이름만 보임(칩에는 없음) */
export const LEGACY_MODES = { review: "점검 대비 리뷰", polish: "선택한 칸 다듬기" } as const;
export type LegacyMode = keyof typeof LEGACY_MODES;

/** 요청 종류(개선 제안·실적 발굴·실적 반영) + 질문(자유 대화) + 옛 기록의 요청 종류 */
export type TurnMode = WriterMode | "chat" | LegacyMode;
export const CHAT_MODE = { label: "질문", short: "질문", hint: "카드와 지침 기준으로 무엇이든 물어보기 — 앞의 답을 이어서 물어도 됩니다(답은 글, 카드는 고치지 않음)" } as const;
export const modeLabel = (m: TurnMode) => (m === "chat" ? CHAT_MODE.label : m in LEGACY_MODES ? LEGACY_MODES[m as LegacyMode] : WRITER_MODES[m as WriterMode].label);

export interface AssistTurn {
  id: string;
  /** 요청한 시각(ISO) */
  at: string;
  mode: TurnMode;
  /** 사용자가 보낸 것(요청 내용·질문·고른 칸·붙인 자료) 한 줄씩 */
  ask: string[];
  /** 이 요청에 넣은 카드 전용 자료 이름(쓰는 중 진행 줄의 「넣은 근거」) */
  files?: string[];
  /** AI가 못 읽어 뺀 카드 자료 이름(스캔 PDF 등 — 참고자료 설계 1단계). 옛 기록에는 없음 */
  skipped?: string[];
  status: "pending" | "ok" | "error";
  /** 요청 종류의 답(구조화 제안) */
  result?: VerifiedResult;
  /** 질문의 답(마크다운) */
  answer?: string;
  model?: string;
  sources?: number;
  message?: string;
  /** 「카드에 반영」을 누른 제안 번호 */
  applied?: number[];
  /** 결과를 받은 시각(ISO) */
  doneAt?: string;
}

/** 이 탭에 남기는 요청 수 */
export const ASSIST_KEEP = 12;
/** 이보다 오래 「쓰는 중」인 요청은 끊긴 것으로 봄(화면을 새로 고치는 등) — AI 제한 시간(8분)보다 넉넉히 */
export const PENDING_STALE_MS = 12 * 60_000;

export const assistKey = (uid: string) => `card-assist|${uid}`;
/** 합치기 전 「AI 대화」가 쓰던 자리(한 번 옮겨 담고 지움) */
export const legacyChatKey = (uid: string) => `card-chat|${uid}`;

const isMode = (m: unknown): m is TurnMode => m === "chat" || (typeof m === "string" && (m in WRITER_MODES || m in LEGACY_MODES));

/** 저장된 값 읽기: 모양이 틀린 것은 버리고, 오래된 「쓰는 중」은 끊김으로 */
export function readTurns(raw: unknown, now = Date.now()): AssistTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistTurn[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object" || typeof t.id !== "string" || typeof t.at !== "string" || !isMode(t.mode)) continue;
    if (t.status !== "pending" && t.status !== "ok" && t.status !== "error") continue;
    if (t.status === "ok" && t.mode === "chat" && typeof t.answer !== "string") continue;
    if (t.status === "ok" && t.mode !== "chat" && (!t.result || typeof t.result.summary !== "string" || !Array.isArray(t.result.suggestions) || !Array.isArray(t.result.citations))) continue;
    if (t.status === "ok" && t.mode !== "chat" && t.result?.followup != null && (!Array.isArray(t.result.followup.items) || typeof t.result.followup.counts !== "object" || t.result.followup.counts === null)) continue; // 망가진 보완 점검 결과는 버림(없는 옛 기록은 통과)
    const ask = Array.isArray(t.ask) ? t.ask.filter((a: unknown): a is string => typeof a === "string") : [];
    const turn: AssistTurn = { ...t, ask };
    if (t.skipped !== undefined) turn.skipped = Array.isArray(t.skipped) ? t.skipped.filter((x: unknown): x is string => typeof x === "string") : undefined;
    if (turn.status === "pending" && now - Date.parse(turn.at) > PENDING_STALE_MS) Object.assign(turn, { status: "error", message: "요청이 끊겼습니다(화면을 새로 고쳤거나 시간이 지남). 다시 요청해 주세요." });
    out.push(turn);
  }
  return out.slice(-ASSIST_KEEP);
}

/** 합치기 전 「AI 대화」 기록(질문·답 메시지) → 질문 차례. 답이 없는 마지막 질문은 버림 */
export function fromChatMessages(raw: unknown): AssistTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistTurn[] = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const q = raw[i];
    const a = raw[i + 1];
    if (q?.role !== "user" || a?.role !== "assistant" || typeof q.text !== "string" || typeof a.text !== "string") continue;
    const at = typeof q.at === "string" ? q.at : new Date(0).toISOString();
    out.push({ id: `chat-${i}-${Date.parse(at) || 0}`, at, mode: "chat", ask: [q.text], status: "ok", answer: a.text, model: typeof a.model === "string" ? a.model : undefined, sources: typeof a.sources === "number" ? a.sources : undefined, doneAt: typeof a.at === "string" ? a.at : undefined });
    i += 1;
  }
  return out;
}

/**
 * 접은 답에 보일 결론 한 줄: 요청 종류는 답의 결론(headline), 질문은 답의 첫 글줄에서 마크다운·지침 기호를 뗀 글.
 * 표 줄·구분선은 건너뜀. 답이 없으면 빈 글
 */
export function turnHeadline(t: AssistTurn): string {
  if (t.mode !== "chat") return t.result?.headline.trim() ?? "";
  for (const raw of (t.answer ?? "").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("|") || /^[-*_]{3,}$/.test(line)) continue;
    const text = line
      .replace(/^(?:#{1,6}\s+|[◆■▣□▸▶○●◇※★→]\s*|[-*+]\s+|\d+[.)]\s+|>\s*)+/u, "")
      .replace(/\*\*|__|`/g, "")
      .trim();
    if (text) return text;
  }
  return "";
}

/** 한 요청의 상태를 바꿈(없는 id면 그대로) */
export function patchTurn(turns: AssistTurn[], id: string, patch: Partial<AssistTurn>): AssistTurn[] {
  return turns.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

/** 새 요청을 끝에 붙이고 오래된 것은 덜어 냄 */
export function pushTurn(turns: AssistTurn[], turn: AssistTurn): AssistTurn[] {
  return [...turns, turn].slice(-ASSIST_KEEP);
}

/** 사용자가 보낸 것 한 줄씩(말풍선) */
/** 실적 반영 요청 칸에 붙여 넣은 긴 글은 말풍선에 앞부분만(전체 글자 수와 함께) */
export const ASK_CLIP = 160;

export function askLines(input: { note?: string; files?: string[]; clip?: number }): string[] {
  const out: string[] = [];
  const note = input.note?.trim();
  if (note && input.clip && note.length > input.clip) out.push(`${note.slice(0, input.clip).trimEnd()}…`, `붙여 넣은 글 ${note.length.toLocaleString("ko-KR")}자`);
  else if (note) out.push(note);
  if (input.files?.length) out.push(`첨부: ${input.files.join(" · ")}`);
  return out;
}

const KIND = { replace: "바꾸기", insert_after: "뒤에 넣기", monthly: "월별 상자" } as const;

/** 답 본문을 마크다운으로(복사·이어 묻기) — 화면에 보이는 순서 그대로 */
function answerMarkdown(t: AssistTurn): string {
  if (t.mode === "chat") return (t.answer ?? "").trim();
  const r = t.result;
  if (!r) return "";
  const md: string[] = [`**${r.headline}**`, ""];
  if (r.needInput) md.push(`> ${r.needInput}`, "");
  md.push(r.summary.trim(), "");
  if (r.followup) {
    const f = r.followup;
    md.push(`### 보완 이행 대조 — ${f.period} 점검(${f.statusLabel}) · 반영됨 ${f.counts["반영됨"]} · 일부 반영 ${f.counts["일부 반영"]} · 미반영 ${f.counts["미반영"]} · 확인 불가 ${f.counts["확인 불가"]}`, "");
    f.items.forEach((it, i) => {
      md.push(`${i + 1}. [${it.judgment}] ${it.star ? "★ " : ""}${it.label}`);
      if (it.requested) md.push(`   - 요구: ${it.requested}`);
      if (it.cardQuote) md.push(`   - 현재 카드${it.cardQuoteOk === false ? "(원문과 다름)" : ""}: 「${it.cardQuote}」`);
      if (it.inspectionQuote) md.push(`   - 점검표${it.inspectionQuoteOk === false ? "(원문과 다름)" : ""}: 「${it.inspectionQuote}」`);
      if (it.remaining) md.push(`   - 남은 할 일: ${it.remaining}`);
    });
    md.push("", `> ${f.notice}`, "");
  }
  if (r.monthlyRow) {
    const m = r.monthlyRow;
    md.push("| 월 | 추진실적 | 정량성과 | 정성성과 | 진도율 | 리스크(대응) |", "|---|---|---|---|---|---|", `| ${[m.month, m.activity, m.quantitative, m.qualitative, m.progress, m.risk].map((v) => (v || "—").replace(/\|/g, "∣").replace(/\n/g, " ")).join(" | ")} |`, "");
  }
  if (r.suggestions.length) {
    md.push(`### 카드 반영 제안 ${r.suggestions.length}건`, "");
    r.suggestions.forEach((s, i) => {
      md.push(`${i + 1}. [${KIND[s.kind]}] ${s.kind === "monthly" ? `${s.period} 상자` : (s.targetPath ?? "")}`);
      if (s.current) md.push(`   - 지금: ${s.current}`);
      for (const ln of s.proposed) md.push(`   - ${ln}`);
      if (s.reason) md.push(`   - 까닭: ${s.reason}`);
    });
    md.push("");
  }
  if (r.citations.length) {
    md.push(`### 인용한 근거 ${r.citations.length}건`, "");
    for (const c of r.citations) md.push(`- ${c.title}${c.verified ? "" : "(원문과 다름)"}: 「${c.quote.replace(/^「|」$/g, "")}」`);
    md.push("");
  }
  return md.join("\n").trim();
}

/** 한 차례를 마크다운으로(답 복사) */
export function turnMarkdown(t: AssistTurn): string {
  if (t.status !== "ok") return t.message ?? "";
  return `## ${modeLabel(t.mode)}\n\n${answerMarkdown(t)}`.trim();
}

/** 「질문」의 이어 묻기 이력: 앞의 요청·답(요청 종류의 구조화 답도 글로) — 서버가 최근 턴·길이로 다시 줄임(cleanHistory) */
export function chatHistory(turns: AssistTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    if (t.status !== "ok") continue;
    const ask = t.ask.join("\n").trim();
    out.push({ role: "user", text: t.mode === "chat" ? ask : `[${modeLabel(t.mode)}] ${ask || "(요청 내용 없이 보냄)"}` });
    out.push({ role: "assistant", text: answerMarkdown(t) });
  }
  return out.filter((m) => m.text.trim());
}

/** 대화 전체 → 마크다운 문서(내려받기). at은 화면 표시용 시각 글 */
export function threadMarkdown(title: string, turns: AssistTurn[], at: (iso: string) => string = (s) => s): string {
  const out = [`# AI 작성지원 — ${title}`, ""];
  for (const t of turns) {
    if (t.status !== "ok") continue;
    out.push(`## ${modeLabel(t.mode)} (${at(t.at)})`, "");
    for (const a of t.ask) out.push(`> ${a}`);
    if (t.ask.length) out.push("");
    out.push(answerMarkdown(t), "");
  }
  return out.join("\n").trim() + "\n";
}
