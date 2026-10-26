"use client";

import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { runCardAssist, runCardChat } from "../../app/(app)/cards/actions";
import { type CardMaterial, finishCardMaterialUpload, listCardMaterials, startCardMaterialUpload } from "../../app/(app)/cards/materials-actions";
import { ASK_CLIP, type AssistTurn, CHAT_MODE, type TurnMode, askLines, assistKey, chatHistory, fromChatMessages, legacyChatKey, modeLabel, patchTurn, pushTurn, readTurns, threadMarkdown, turnHeadline, turnMarkdown } from "../../lib/ai/assist-thread.ts";
import { CHAT_LIMITS } from "../../lib/ai/chat.ts";
import { assistProgress } from "../../lib/ai/progress.ts";
import { ASSIST_TEXT_MAX, ATTACH_ACCEPT, ATTACH_LABEL, type VerifiedSuggestion, WRITER_MODES, type WriterMode, isAttachableName } from "../../lib/ai/writer.ts";
import { fmtDateTime } from "../../lib/format.ts";
import { FollowupList } from "./followup-list";
import { T } from "../ui/kit";
import { DropMenu } from "../ui/drop-menu";
import { uploadSigned } from "../ui/file-drop";
import { Markdown } from "../ui/markdown";
import { AiComposer, type AiComposerMode } from "../workspace/ai-composer";
import { AiProgress } from "../workspace/ai-progress";
import { scrollWithin } from "../workspace/scroll-within";

type ModeInfo = { label: string; short: string; hint: string };
/** 고를 수 있는 요청 종류(옛 기록의 요청 종류는 칩에 없음) */
type PickMode = WriterMode | "chat";
const MODES: Array<[PickMode, ModeInfo]> = [...(Object.entries(WRITER_MODES) as Array<[WriterMode, ModeInfo]>), ["chat", CHAT_MODE]];
/** 요청 종류 칩(AiComposer 공용 부품 — 짧은 이름을 보이고 title에 자세한 설명) */
const COMPOSER_MODES: AiComposerMode<PickMode>[] = MODES.map(([key, m]) => ({ key, label: m.short, title: `${m.label} — ${m.hint}` }));
/** 빈 상태 시작 칩의 12자 안팎 짧은 설명(자세한 설명은 title) */
const START_HINT: Record<PickMode, string> = { improve: "지적·전략 반영 제안", discover: "이번 달 활동 제안", reflect: "실적 자료로 초안 작성", followup: "점검 보완이 반영됐는지 확인", chat: "무엇이든 물어보기" };
/** 입력 없이도 보낼 수 있는 요청 종류(빈 상태 칩의 「바로 요청」) */
const QUICK_MODES = new Set<PickMode>(["improve", "discover", "followup"]);
/** 요청 칸 placeholder(요청 종류별 30자 안팎) */
const PLACEHOLDER: Record<PickMode, string> = {
  improve: "추가로 반영할 점(선택) ⌘↵",
  discover: "이번 달 넣을 활동(선택) ⌘↵",
  reflect: "실적 문장·수치를 붙여 넣으세요 ⌘↵",
  followup: "확인하고 싶은 항목(선택) ⌘↵",
  chat: "예: 개선방향 2번을 Plan 문장으로 (⌘↵)",
};
const sizeLabel = (b: number | null) => (b === null ? "" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
/** 읽은 글 수(1만 자 이상은 「1.1만 자」, 미만은 「n자」) */
const charsLabel = (n: number | null) => (n === null ? "" : n >= 10_000 ? `${(n / 10_000).toFixed(1)}만 자` : `${n}자`);
/** 파일 하나 올릴 때 상한(서버 업로드 한도와 같음 — 요청마다 6건·20MB 한도는 없앰) */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const KIND_LABEL = { replace: "바꾸기", insert_after: "뒤에 넣기", monthly: "월별 상자" } as const;
/** 카드 반영 제안을 먼저 보이는 수(나머지는 「더 보기」 — 2026-09-29 사용자 결정) */
const SUG_FIRST = 3;
/** 요청 한 차례의 id(이 탭 안에서만 쓰임) */
const newTurnId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** 다른 곳(닫힌 뒤 끝난 요청)에서 이 카드 기록을 바꿨을 때 알림 */
const UPDATE_EVENT = "card-assist-update";

/** 옮겨 갈 자리: 그 차례의 답 첫머리(start) 또는 차례의 끝(end — 말풍선 + 진행 줄), smooth = 부드럽게 굴림 */
type Spot = { id: string; at: "start" | "end"; smooth: boolean };
/** 마지막 차례: 답이 있으면 답의 첫머리, 쓰는 중·오류면 끝 — 탭을 열거나 돌아올 때는 바로(부드럽게 굴리지 않음) */
function lastSpot(turns: AssistTurn[]): Spot | null {
  const t = turns.at(-1);
  return t ? { id: t.id, at: t.status === "ok" ? "start" : "end", smooth: false } : null;
}
/** 쓰는 중 진행 줄의 요청 종류(옛 기록의 요청 종류는 쓰는 중일 수 없으나 모양만 맞춤) */
const progressMode = (m: TurnMode): PickMode => (m === "chat" || m in WRITER_MODES ? (m as PickMode) : "improve");

function loadTurns(uid: string): AssistTurn[] {
  try {
    const raw = sessionStorage.getItem(assistKey(uid));
    const turns = readTurns(raw ? JSON.parse(raw) : []);
    // 합치기 전 「AI 대화」 기록이 이 탭에 있으면 한 번 옮겨 담음
    const legacy = sessionStorage.getItem(legacyChatKey(uid));
    if (!legacy) return turns;
    sessionStorage.removeItem(legacyChatKey(uid));
    const merged = readTurns([...fromChatMessages(JSON.parse(legacy)), ...turns].sort((a, b) => a.at.localeCompare(b.at)));
    sessionStorage.setItem(assistKey(uid), JSON.stringify(merged));
    return merged;
  } catch {
    return [];
  }
}
function saveTurns(uid: string, turns: AssistTurn[]) {
  try {
    sessionStorage.setItem(assistKey(uid), JSON.stringify(turns));
  } catch {
    // 저장 공간이 없으면 이 화면에서만
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: uid }));
}
/** 저장된 기록을 고쳐 씀(옆 창이 닫힌 뒤 끝난 요청도 기록에 남게 — 화면 상태가 아니라 저장 공간 기준) */
function updateTurns(uid: string, f: (ts: AssistTurn[]) => AssistTurn[]) {
  saveTurns(uid, f(loadTurns(uid)));
}

/**
 * 카드 AI 작성지원(담당자 작성지원 지침 09) — Claude 대화처럼 요청(오른쪽 말풍선) → 답(읽기 본문)을 차례로 쌓아 보여 줍니다.
 * 요청 종류 5가지(구조화 제안·카드 반영 버튼)와 「질문」(자유 대화 — 앞의 요청·답을 이어서 물음, 점검결과도 봄)이 한 흐름입니다.
 * 결과는 제안이고, 반영 버튼은 편집 권한이 있을 때만 씁니다. 기록은 이 브라우저 탭에만(sessionStorage, 최근 12건).
 */
export function AiAssist(props: {
  uid: string;
  /** 과제명(대화 내려받기 제목) */
  title: string;
  canApply: boolean;
  /** 편집기에 지금 보이는 카드 JSON(부서는 작성본) — AI가 이것을 기준으로 제안 */
  getCard?: () => unknown;
  onApply: (s: VerifiedSuggestion) => void;
  /** 첨부 파일 올리기(카드 전용 자료) — 부서 화면 보기(읽기 전용 미리보기)에서는 끔 */
  canUpload?: boolean;
  /** 부서 화면 보기(읽기 전용 미리보기) — 기록만 보이고 요청 입력줄(요청 종류·첨부·요청 칸·보내기)은 그리지 않음(보내면 미리보기 중인 사람 이름으로 AI 호출이 됨) */
  preview?: boolean;
  /** 이 카드는 AI를 쓸 수 없음(경영관리 카드 — 지침 08·13 연결 전) — 안내만 보이고 요청 입력줄은 그리지 않음 */
  unavailable?: string;
  /** 머리의 제목 자리에 둘 탭(「AI 작성지원 | 점검 결과」) */
  tabs?: ReactNode;
  /** 이 탭이 지금 보이는지(다른 탭이면 숨김 — 숨은 동안 온 답은 돌아올 때 그 자리로 옮김). 기본 보임 */
  active?: boolean;
}) {
  const { uid } = props;
  const active = props.active !== false;
  const [mode, setMode] = useState<PickMode>("improve");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [turns, setTurns] = useState<AssistTurn[]>([]);
  // 첨부: 이 카드의 자료 전부가 기본으로 근거에 들어감(참고자료 설계 1단계) — off는 화면에서 뺀 자료 id
  const [docs, setDocs] = useState<CardMaterial[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [uploading, setUploading] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // 답 접기(2026-09-29 사용자 결정 — 한 번에 너무 많이 보였음): 가장 최근 답만 펼치고 지난 답은 결론 한 줄. 사람이 펼치거나 접으면 그대로(true = 펼침)
  const [turnOpen, setTurnOpenState] = useState<Record<string, boolean>>({});
  const setTurnOpen = (id: string, on: boolean) => setTurnOpenState((o) => ({ ...o, [id]: on }));
  // 카드 반영 제안을 모두 펼친 답
  const [allSug, setAllSug] = useState<Set<string>>(() => new Set());
  // 다음 그리기 뒤 옮겨 갈 자리(한 번 옮기면 비움 — 반영 버튼 등으로 기록이 바뀔 때는 움직이지 않게). 숨은 동안에는 보일 때까지 둠
  const focus = useRef<Spot | null>(null);
  // 지난번 그릴 때 이 탭이 보였는지(숨었다가 다시 보이면 마지막 답으로)
  const seen = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  // 빈 상태 시작 칩을 누르면 요청 종류를 고르고 아래 요청 칸에 초점(값은 비운 채)
  const pendingFocus = useRef(false);
  useEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    sectionRef.current?.querySelector<HTMLTextAreaElement>("textarea[aria-label]")?.focus();
  }, [mode]);
  const startPick = (k: PickMode, quick: boolean) => {
    setMode(k);
    if (quick) void submit("");
    else pendingFocus.current = true;
  };
  const pending = turns.some((t) => t.status === "pending");
  const latestOk = turns.findLast((t) => t.status === "ok")?.id;
  const isOpen = (t: AssistTurn) => turnOpen[t.id] ?? t.id === latestOk;

  const reload = useCallback(() => {
    const ts = loadTurns(uid);
    setTurns(ts);
    return ts;
  }, [uid]);
  useEffect(() => {
    // 브라우저 저장 공간(sessionStorage)에서 이 카드 기록을 불러옴 — 서버 렌더에는 없는 값이라 붙은 뒤에 읽음. 열면 마지막 답의 첫머리부터 보임
    // eslint-disable-next-line react-hooks/set-state-in-effect
    focus.current = lastSpot(reload());
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === uid) reload();
    };
    window.addEventListener(UPDATE_EVENT, on);
    return () => window.removeEventListener(UPDATE_EVENT, on);
  }, [uid, reload]);
  const loadDocs = useCallback(
    () =>
      listCardMaterials(uid).then((r) => {
        setDocs(r.items);
        setCanEdit(r.canEdit);
        return r.items;
      }),
    [uid],
  );
  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);
  const upload = props.canUpload !== false && canEdit;
  // 근거로 들어가는 자료: 카드 자료 전부에서 화면에서 뺀 것과 AI가 못 읽는 것만 제외
  const includedDocs = docs.filter((d) => !off.has(d.id) && d.parseStatus !== "failed");

  /** 끌어 놓거나 고른 파일: AI가 읽는 형식이면 카드 전용 자료로 올림(곧바로 근거에 들어감) */
  const addFiles = async (list: FileList | File[]) => {
    if (!upload) {
      setErr("이 화면에서는 파일을 올릴 수 없습니다.");
      return;
    }
    setErr(null);
    const parseErrors: string[] = [];
    for (const file of Array.from(list)) {
      if (!isAttachableName(file.name)) {
        setErr(`「${file.name}」 — AI는 ${ATTACH_LABEL} 파일만 읽습니다.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setErr(`「${file.name}」 — 파일당 50MB까지입니다.`);
        continue;
      }
      setUploading(file.name);
      const r = await uploadSigned(
        "card-materials",
        file,
        (name, size) => startCardMaterialUpload(uid, name, size),
        (path, name, mime, size) => finishCardMaterialUpload(uid, path, name, mime, size),
      );
      if (!r.ok) setErr(r.message ?? `「${file.name}」을(를) 올리지 못했습니다.`);
      else if (r.parseError) parseErrors.push(`「${file.name}」 — AI가 못 읽음: ${r.parseError}`);
    }
    setUploading(null);
    await loadDocs();
    if (parseErrors.length) setErr(parseErrors.join(" / "));
  };
  // 새 요청은 맨 아래(말풍선 + 진행 줄), 받은 답은 답의 첫머리로 옮김(긴 답을 위에서부터 읽게).
  // 탭을 열거나 다른 탭에서 돌아오면 마지막 답의 첫머리로 — 숨은 동안 온 답도 이때 옮김(숨은 상자는 굴릴 수 없어 자리를 기억해 둠)
  useEffect(() => {
    if (!active) {
      seen.current = false;
      return;
    }
    if (!seen.current) {
      seen.current = true;
      const spot = lastSpot(turns);
      if (spot) focus.current = { ...spot, smooth: false };
    }
    const f = focus.current;
    const box = threadRef.current;
    if (!f || !box) return;
    const turnEl = box.querySelector(`[data-turn="${f.id}"]`);
    const el = f.at === "start" ? (turnEl?.querySelector("[data-answer]") ?? turnEl) : turnEl;
    if (el && scrollWithin(box, el, f.at, f.smooth)) focus.current = null;
  }, [turns, active]);

  /** 질문(자유 대화): 앞의 요청·답을 이력으로 함께 보냄 */
  const ask = async (question: string) => {
    const q = question.trim();
    if (pending) return;
    if (!q) {
      setErr("질문을 적어 주세요.");
      return;
    }
    setErr(null);
    const history = chatHistory(loadTurns(uid));
    const files = includedDocs.map((d) => d.fileName);
    const turn: AssistTurn = { id: newTurnId(), at: new Date().toISOString(), mode: "chat", ask: askLines({ note: q, files }), files, status: "pending" };
    focus.current = { id: turn.id, at: "end", smooth: true };
    updateTurns(uid, (ts) => pushTurn(ts, turn));
    setNote("");
    let patch: Partial<AssistTurn>;
    try {
      const card = props.getCard?.();
      const r = await runCardChat(uid, q, history, card ? JSON.stringify(card) : null, [...off]);
      patch = r.ok ? { status: "ok", answer: r.answer, model: r.model, sources: r.sources, skipped: r.skipped, doneAt: new Date().toISOString() } : { status: "error", message: r.message };
    } catch {
      patch = { status: "error", message: "AI 요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." };
    }
    focus.current = { id: turn.id, at: patch.status === "ok" ? "start" : "end", smooth: true };
    updateTurns(uid, (ts) => patchTurn(ts, turn.id, patch));
  };

  const submit = async (noteText: string) => {
    if (pending) return;
    if (mode === "chat") return ask(noteText);
    setErr(null);
    const fd = new FormData();
    fd.set("uid", uid);
    fd.set("mode", mode);
    fd.set("note", noteText);
    fd.set("card_json", props.getCard ? JSON.stringify(props.getCard()) : "");
    for (const id of off) fd.append("exclude_ids", id);
    const turn: AssistTurn = {
      id: newTurnId(),
      at: new Date().toISOString(),
      mode,
      ask: askLines({
        note: noteText,
        files: includedDocs.map((d) => d.fileName),
        clip: mode === "reflect" ? ASK_CLIP : undefined,
      }),
      files: includedDocs.map((d) => d.fileName),
      status: "pending",
    };
    focus.current = { id: turn.id, at: "end", smooth: true };
    updateTurns(uid, (ts) => pushTurn(ts, turn));
    // 보낸 입력은 비움(요청 종류·고른 칸·첨부는 그대로 — 이어서 물을 수 있게)
    setNote("");
    let patch: Partial<AssistTurn>;
    try {
      const r = await runCardAssist({ status: "idle" }, fd);
      patch = r.status === "ok" ? { status: "ok", mode: r.mode, result: r.result, model: r.model, sources: r.sources, skipped: r.skipped, doneAt: new Date().toISOString() } : { status: "error", message: r.status === "error" ? r.message : "요청하지 못했습니다." };
    } catch {
      patch = { status: "error", message: "AI 요청이 끊겼습니다. 잠시 뒤 다시 시도해 주세요." };
    }
    focus.current = { id: turn.id, at: patch.status === "ok" ? "start" : "end", smooth: true };
    updateTurns(uid, (ts) => patchTurn(ts, turn.id, patch));
  };

  const apply = (t: AssistTurn, i: number, s: VerifiedSuggestion) => {
    props.onApply(s);
    updateTurns(uid, (ts) => patchTurn(ts, t.id, { applied: [...new Set([...(t.applied ?? []), i])] }));
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([threadMarkdown(props.title, turns, fmtDateTime)], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI작성지원_${props.title.slice(0, 30).replace(/[\\/:*?"<>|]/g, "")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = async (t: AssistTurn) => {
    try {
      await navigator.clipboard.writeText(turnMarkdown(t));
      setCopied(t.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // 브라우저 권한이 없으면 복사 표시를 하지 않음
    }
  };
  const answerMeta = (t: AssistTurn) => `${modeLabel(t.mode)} · 근거 자료 ${t.sources ?? 0}건 · ${t.model ?? ""}${t.doneAt ? ` · ${fmtDateTime(t.doneAt)}` : ""}`;
  /** 펼친 답의 머리: AI · 요청 종류·근거 수·모델·시각 · 접기(결론만 보기) */
  const answerHead = (t: AssistTurn) => (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">AI</span>
      <p className="min-w-0 grow truncate text-xs text-muted">{answerMeta(t)}</p>
      <button type="button" aria-expanded={true} onClick={() => setTurnOpen(t.id, false)} aria-label="답 접기" title="결론만 보기" className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-thead hover:text-navy">
        <ChevronUp size={15} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <section
      ref={sectionRef}
      aria-label="AI 작성지원"
      className="relative flex h-full min-h-0 flex-col bg-paper"
      onDragOver={(e) => {
        if (!upload || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        if (!upload || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      {over && (
        <div className="pointer-events-none absolute inset-2 z-pop flex items-center justify-center rounded-xl border-2 border-dashed border-navy bg-paper/90 text-sm font-semibold text-navy">
          놓으면 첨부합니다 · {ATTACH_LABEL}
        </div>
      )}
      <div className="flex h-14 shrink-0 items-stretch justify-between gap-3 border-b border-line px-5">
        {props.tabs ?? <h3 className="flex min-w-0 items-center font-serif text-base font-bold text-navy">AI 작성지원</h3>}
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          {turns.length > 0 && (
            <>
              <button type="button" onClick={download} className={T.btn} title="이 대화를 마크다운 문서로 내려받기">
                .md 내려받기
              </button>
              <button type="button" disabled={pending} onClick={() => saveTurns(uid, [])} className={T.btn} title="이 카드의 AI 작성지원 기록 지우기(이 브라우저 탭)">
                기록 지우기
              </button>
            </>
          )}
        </div>
      </div>

      {/* 대화: 요청(오른쪽 말풍선) → 답(읽기 본문) */}
      <div ref={threadRef} className="min-h-0 grow overflow-y-auto px-5 py-5">
        {turns.length === 0 ? (
          <div className="mx-auto flex max-w-[640px] flex-col gap-3 py-6">
            {props.unavailable ? (
              <p className="rounded-xl border border-field-line bg-paper p-4 text-sm leading-7 text-muted-2">{props.unavailable}</p>
            ) : props.preview ? (
              <ul className="list-disc pl-5 text-sm leading-7 text-muted-2">
                {MODES.map(([k, m]) => (
                  <li key={k}>
                    <b className="font-semibold text-ink">{m.short}</b> — {m.hint}
                  </li>
                ))}
              </ul>
            ) : (
              <div role="group" aria-label="요청 종류로 시작" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {MODES.map(([k, m]) => (
                  <div key={k} className="flex flex-col items-start gap-1.5 rounded-xl border border-field-line bg-paper p-3.5">
                    <button type="button" onClick={() => startPick(k, false)} title={`${m.label} — ${m.hint}`} className="flex w-full min-w-0 flex-col items-start gap-0.5 text-left">
                      <span className="text-sm font-bold text-ink">{m.short}</span>
                      <span className="truncate text-xs text-muted-2">{START_HINT[k]}</span>
                    </button>
                    {QUICK_MODES.has(k) && (
                      <button type="button" onClick={() => startPick(k, true)} title={`입력 없이 ${m.short} 바로 요청`} className="rounded-md border border-field-line px-2 py-1 text-xs font-semibold text-navy hover:border-navy">
                        바로 요청
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {upload && <p className="text-xs text-muted">실적 자료 파일을 이 창에 끌어 놓으면 카드 자료로 올라가고, 카드 자료는 모두 AI 근거로 들어갑니다({ATTACH_LABEL}).</p>}
          </div>
        ) : (
          <ol className="mx-auto flex max-w-[760px] flex-col gap-5">
            {turns.map((t, idx) => (
              <li key={t.id} data-turn={t.id} className="flex min-w-0 flex-col gap-2.5">
                <div className="flex max-w-[88%] flex-col gap-0.5 self-end rounded-2xl rounded-br-md bg-navy/[0.07] px-3.5 py-2">
                  <span className="text-xs font-semibold text-navy">
                    {modeLabel(t.mode)} <span className="font-normal text-muted">· {fmtDateTime(t.at)}</span>
                  </span>
                  {t.ask.length ? (
                    t.ask.map((a, i) => (
                      <p key={i} className="text-sm leading-[1.6] break-keep whitespace-pre-wrap text-ink">
                        {a}
                      </p>
                    ))
                  ) : (
                    <p className="text-ui text-muted-2">요청 내용 없이 보냄</p>
                  )}
                </div>
                {t.status === "pending" && (
                  // 진행 줄: 경과 시간 · 넣은 근거(누르면 펼침). 질문의 「앞 대화」는 이 차례 전에 받은 답 수
                  <AiProgress spec={assistProgress(progressMode(t.mode), { files: t.files ?? [], history: turns.slice(0, idx).filter((x) => x.status === "ok").length })} startedAt={Date.parse(t.at)} />
                )}
                {t.status === "error" && (
                  <p role="alert" className="rounded-md border border-error-line bg-error-bg px-3 py-2 text-ui text-error-strong">
                    {t.message}
                  </p>
                )}
                {t.status === "ok" && !isOpen(t) && (
                  // 지난 답: 결론 한 줄(두 줄까지)만 — 누르면 펼침
                  <div data-answer className="min-w-0">
                    <button type="button" aria-expanded={false} onClick={() => setTurnOpen(t.id, true)} title="답 펼치기" className="flex w-full min-w-0 items-start gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-thead">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">AI</span>
                      <span className="flex min-w-0 grow flex-col">
                        <span className="truncate text-xs text-muted">{answerMeta(t)}</span>
                        <span className="line-clamp-2 text-sm leading-[1.6] font-semibold break-keep text-navy">{turnHeadline(t) || "답 보기"}</span>
                      </span>
                      <ChevronDown size={16} aria-hidden="true" className="mt-1.5 shrink-0 text-muted" />
                    </button>
                  </div>
                )}
                {t.status === "ok" && isOpen(t) && t.mode === "chat" && (
                  <div data-answer className="flex min-w-0 flex-col gap-2.5">
                    {answerHead(t)}
                    <Markdown text={t.answer ?? ""} size="md" fold />
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <button type="button" onClick={() => copy(t)} className="h-7 rounded-md border border-field-line px-2.5 font-semibold text-ink hover:border-navy">
                        {copied === t.id ? "복사함" : "답 복사(마크다운)"}
                      </button>
                    </div>
                    {Boolean(t.skipped?.length) && <p className="text-xs text-muted-2">AI가 못 읽어 뺀 자료: {t.skipped!.join(", ")}</p>}
                  </div>
                )}
                {t.status === "ok" && isOpen(t) && t.mode !== "chat" && t.result && (
                  <div data-answer className="flex min-w-0 flex-col gap-3">
                    {answerHead(t)}
                    <p className="text-sm leading-[1.55] font-bold break-keep text-navy">{t.result.headline}</p>
                    {t.result.needInput && <p className="rounded-lg bg-warn-bg px-3 py-2 text-ui leading-[1.6] break-keep text-warn">{t.result.needInput}</p>}
                    {t.result.followup && <FollowupList f={t.result.followup} />}
                    <Markdown text={t.result.summary} size="md" fold />

                    {t.result.monthlyRow && (
                      <table className="w-full table-fixed border-collapse text-ui">
                        <tbody>
                          {(
                            [
                              ["월", t.result.monthlyRow.month],
                              ["추진실적", t.result.monthlyRow.activity],
                              ["정량성과", t.result.monthlyRow.quantitative],
                              ["정성성과", t.result.monthlyRow.qualitative],
                              ["진도율", t.result.monthlyRow.progress],
                              ["리스크(대응)", t.result.monthlyRow.risk],
                            ] as const
                          ).map(([k, v]) => (
                            <tr key={k}>
                              <th className="w-[92px] border border-line bg-thead px-2.5 py-1 text-left align-top font-semibold text-muted-2">{k}</th>
                              <td className="border border-line px-2.5 py-1 leading-[1.6] break-keep whitespace-pre-wrap">{v || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {t.result.suggestions.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <h4 className="text-ui font-bold text-ink">카드 반영 제안 {t.result.suggestions.length}건</h4>
                        {/* 우선순위 앞 SUG_FIRST건만 먼저 — 번호(i)는 전체 목록 기준(반영 표시) */}
                        {t.result.suggestions.slice(0, allSug.has(t.id) ? undefined : SUG_FIRST).map((s, i) => (
                          <SuggestionCard key={i} s={s} done={Boolean(t.applied?.includes(i))} canApply={props.canApply} onApply={() => apply(t, i, s)} />
                        ))}
                        {t.result.suggestions.length > SUG_FIRST && (
                          <button
                            type="button"
                            aria-expanded={allSug.has(t.id)}
                            onClick={() =>
                              setAllSug((a) => {
                                const n = new Set(a);
                                if (n.has(t.id)) n.delete(t.id);
                                else n.add(t.id);
                                return n;
                              })
                            }
                            className="flex h-8 items-center justify-center gap-1 rounded-md border border-dashed border-field-line text-xs font-semibold text-muted-2 hover:border-navy hover:text-navy"
                          >
                            {allSug.has(t.id) ? `앞 ${SUG_FIRST}건만 보기` : `나머지 ${t.result.suggestions.length - SUG_FIRST}건 더 보기`}
                            <ChevronDown size={14} aria-hidden="true" className={allSug.has(t.id) ? "rotate-180" : ""} />
                          </button>
                        )}
                      </div>
                    )}

                    {t.result.citations.length > 0 && (
                      <details className="group rounded-lg border border-line">
                        <summary className="cursor-pointer list-none px-3.5 py-2 text-ui font-semibold text-ink marker:hidden">
                          인용한 근거 {t.result.citations.length}건
                          <span className="ml-1.5 font-normal text-muted">
                            · 원문 확인 {t.result.citations.filter((c) => c.verified).length}
                            <span className="ml-1 group-open:hidden">▾</span>
                            <span className="ml-1 hidden group-open:inline">▴</span>
                          </span>
                        </summary>
                        <div className="flex flex-col gap-1.5 border-t border-line px-3.5 py-2.5">
                          {t.result.citations.map((c, i) => (
                            <div key={i} className="text-ui leading-[1.6]">
                              <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                                <span className={`shrink-0 rounded-chip px-1 ${c.verified ? "bg-thead text-link" : "bg-warn-bg text-warn"}`}>{c.verified ? "원문 확인" : "원문과 다름"}</span>
                                <span className="truncate" title={c.key}>
                                  {c.title}
                                </span>
                              </p>
                              <p className="mt-0.5 break-keep text-ink">「{c.quote.replace(/^「|」$/g, "")}」</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      <button type="button" onClick={() => copy(t)} className="h-7 rounded-md border border-field-line px-2.5 font-semibold text-ink hover:border-navy">
                        {copied === t.id ? "복사함" : "답 복사(마크다운)"}
                      </button>
                      <span title="제안은 초안입니다 — 수치·출처를 원본자료와 확인한 뒤 반영하세요." className="inline-flex items-center text-muted-2">
                        <Info size={14} aria-hidden="true" />
                        <span className="sr-only">제안은 초안입니다 — 수치·출처를 원본자료와 확인한 뒤 반영하세요.</span>
                      </span>
                    </div>
                    {Boolean(t.skipped?.length) && <p className="text-xs text-muted-2">AI가 못 읽어 뺀 자료: {t.skipped!.join(", ")}</p>}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 입력(아래 고정): 요청 종류 → 요청 내용 → 보내기 — 부서 화면 보기(읽기 전용 미리보기)에서는 그리지 않음(기록만) */}
      {!props.preview && !props.unavailable && (
        <AiComposer
          onSubmit={() => void submit(note)}
          modes={COMPOSER_MODES}
          mode={mode}
          onMode={setMode}
          attachments={
            (docs.length > 0 || uploading) && (
              <div aria-label="첨부" className="flex min-w-0 flex-wrap items-center gap-1.5">
                {docs.length > 0 && (
                  // 목록은 화면 맨 위 층에 띄움(요청 입력줄의 높이 제한에 잘리지 않게 — components/ui/drop-menu.tsx). 토글해도 닫히지 않음(close를 부르지 않음)
                  <DropMenu
                    label={
                      <>
                        카드 자료 {includedDocs.length}/{docs.length} ▾
                      </>
                    }
                    buttonClass="h-7 rounded-md border border-field-line bg-paper px-2 text-xs text-muted-2 hover:border-navy"
                  >
                    {() =>
                      docs.map((d) => {
                        const failed = d.parseStatus === "failed";
                        const checked = !failed && !off.has(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            role="menuitemcheckbox"
                            aria-checked={checked}
                            disabled={failed}
                            onClick={() =>
                              setOff((s) => {
                                const n = new Set(s);
                                if (n.has(d.id)) n.delete(d.id);
                                else n.add(d.id);
                                return n;
                              })
                            }
                            className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-thead disabled:cursor-not-allowed disabled:text-muted"
                            title={failed ? `${d.fileName} — AI가 못 읽음: ${d.parseError ?? ""}` : d.fileName}
                          >
                            <span className="flex size-4 shrink-0 items-center justify-center rounded-chip border border-field-line">{checked && "✓"}</span>
                            <span className="min-w-0 grow truncate">{d.fileName}</span>
                            {failed ? <span className="shrink-0 text-xs text-warn">AI가 못 읽음</span> : <span className="shrink-0 font-mono text-xs text-muted">{sizeLabel(d.bytes)}{d.chars !== null ? ` · ${charsLabel(d.chars)}` : ""}</span>}
                          </button>
                        );
                      })
                    }
                  </DropMenu>
                )}
                {uploading && (
                  <span role="status" className="flex h-7 max-w-[240px] min-w-0 items-center rounded-md border border-dashed border-field-line px-2 text-xs text-muted-2">
                    <span className="min-w-0 truncate">{uploading} 올리는 중…</span>
                  </span>
                )}
              </div>
            )
          }
          attach={upload ? { accept: ATTACH_ACCEPT, disabled: Boolean(uploading), title: `파일 첨부 — 끌어 놓아도 됩니다(${ATTACH_LABEL}, 파일당 50MB). 카드 자료는 모두 AI 근거로 들어갑니다`, onFiles: (files) => void addFiles(files) } : undefined}
          value={note}
          onChange={setNote}
          maxLength={mode === "chat" ? CHAT_LIMITS.question : mode === "reflect" ? ASSIST_TEXT_MAX.reflect : ASSIST_TEXT_MAX.note}
          ariaLabel={mode === "chat" ? "질문" : mode === "reflect" ? "실적 자료·요청" : "요청 내용(선택)"}
          placeholder={PLACEHOLDER[mode]}
          submitDisabled={pending || Boolean(uploading)}
          submitLabel={mode === "chat" ? "질문 보내기" : `${WRITER_MODES[mode].label} 요청`}
          error={
            err && (
              <p role="alert" className="text-xs text-error">
                {err}
              </p>
            )
          }
        />
      )}
    </section>
  );
}

/**
 * 카드 반영 제안 한 건: 바꿀 글(제안)은 늘 전부, 지금 글(취소선)과 이유는 한 줄 말줄임 — 「자세히」나 그 줄을 누르면 전부(2026-09-29 사용자 결정)
 */
function SuggestionCard(props: { s: VerifiedSuggestion; done: boolean; canApply: boolean; onApply: () => void }) {
  const { s } = props;
  const [more, setMore] = useState(false);
  const clip = more ? "" : "cursor-pointer truncate";
  return (
    <div className="rounded-lg border border-line bg-paper px-3.5 py-2.5">
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <span className="shrink-0 rounded-chip border border-field-line px-1">{KIND_LABEL[s.kind]}</span>
        <span className="truncate font-mono" title={s.targetPath ?? ""}>
          {s.kind === "monthly" ? `${s.period} 상자` : s.targetPath}
        </span>
      </p>
      {s.current && (
        <p onClick={() => setMore(true)} title={more ? undefined : s.current} className={`mt-1 text-ui leading-[1.6] break-keep text-muted line-through decoration-muted/50 ${clip}`}>
          {s.current}
        </p>
      )}
      <div className="mt-1 text-sm leading-[1.6] break-keep text-ink">
        {s.proposed.map((ln, j) => (
          <p key={j}>{ln}</p>
        ))}
      </div>
      {s.reason && (
        <p onClick={() => setMore(true)} title={more ? undefined : s.reason} className={`mt-1 text-ui leading-[1.6] break-keep text-muted-2 ${clip}`}>
          {s.reason}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        {props.canApply && s.applicable ? (
          <button type="button" disabled={props.done} onClick={props.onApply} className={T.btnPrimarySm}>
            {props.done ? "반영함" : "카드에 반영"}
          </button>
        ) : (
          <span className="text-xs text-muted">{s.applicable ? "반영은 성과관리팀이 합니다" : "경로를 확인할 수 없어 직접 옮겨 주세요"}</span>
        )}
        <button type="button" onClick={() => navigator.clipboard?.writeText(s.proposed.join("\n"))} className="h-7 rounded-md border border-field-line px-3 text-xs text-muted-2 hover:border-navy">
          복사
        </button>
        {(s.current || s.reason) && (
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="ml-auto text-xs text-link hover:underline">
            {more ? "간단히" : "자세히"}
          </button>
        )}
      </div>
    </div>
  );
}
