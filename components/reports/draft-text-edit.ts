"use client";

import { useRouter } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { saveDraftTexts } from "../../app/(app)/reports/cards/edit-actions";
import { DRAFT_TEXT_EDITS_MAX, DRAFT_TEXT_MAX } from "../../lib/reports/input-limits.ts";
import { useAutosave } from "../workspace/autosave";

/** 자동 저장 기다림(과제원장 편집기와 같음) */
const AUTOSAVE_MS = 1500;
const AUTOSAVE_KEY = "report-autosave";

type Pending = { text: string; join?: string };
export type TextSaveStatus = { kind: "idle" | "dirty" | "saving" | "saved" | "error"; text: string };

const hhmm = (d: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

/**
 * 경평 초안 글 직접 고치기(2026-09-28 — 과제원장 편집기처럼 두 번 눌러 고치기 + 자동 저장·저장 단추):
 *  - 종이의 고치기 표지(.k-t — 렌더러 editMarks, data-t = 초안 JSON 경로, data-raw = 원래 표기)를 두 번 누르면 그 자리에서 고침. Enter·밖 누르기 = 고치기 끝, Esc = 이번 고침 취소
 *  - 자동 저장 켜짐(기본, 이 브라우저에 기억 report-autosave): 고치는 중에도 1.5초 쉬면, 고치기를 끝내면 바로 저장(saveDraftTexts — 버전 확인·숫자 대조·수정 이력)
 *  - 꺼짐: 고친 글을 모아 두고(점선 표시) 「지금 저장」 단추·다른 화면으로 가는 링크를 누를 때 한 번에 저장. 창을 닫으려 하면 브라우저가 확인
 *  - 저장한 뒤 고치는 중이 아니면 새로 고침(서버가 강조·숫자 표시까지 다시 그림), 고치는 중이면 끝날 때
 * 종이 HTML은 서버 그림을 그대로 넣은 것이라 React가 다시 그리지 않음 — 새로 고침 뒤에도 아직 저장 안 한 글은 다시 입혀 둠
 */
export function useDraftTextEdit(opts: { uid: string; version: string | null; enabled: boolean; paperRef: RefObject<HTMLDivElement | null>; onError: (message: string) => void }) {
  const router = useRouter();
  const [autosave, setAutosave] = useAutosave(AUTOSAVE_KEY);
  const autosaveRef = useRef(autosave);
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<TextSaveStatus>({ kind: "idle", text: "" });
  const pending = useRef(new Map<string, Pending>());
  const versionRef = useRef(opts.version);
  const editing = useRef<HTMLElement | null>(null);
  const needRefresh = useRef(false);
  const saving = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    autosaveRef.current = autosave;
  }, [autosave]);
  // 새로 고침으로 받은 초안 판(서버 updated_at)
  useEffect(() => {
    versionRef.current = opts.version;
  }, [opts.version]);

  /** 서버가 말없이 자르는 한도(글 600자·한 번에 60건)를 넘으면 안내 글 — 넘는 고침은 모으지 않음 */
  const overLimit = (path: string, text: string): string | null => {
    if (text.length > DRAFT_TEXT_MAX) return `${text.length}자입니다 — ${DRAFT_TEXT_MAX}자 이하로 줄여 주세요.`;
    if (!pending.current.has(path) && pending.current.size >= DRAFT_TEXT_EDITS_MAX) return `저장 안 한 고침이 ${DRAFT_TEXT_EDITS_MAX}건입니다 — 먼저 「지금 저장」을 눌러 주세요.`;
    return null;
  };

  const bump = () => setPendingCount(pending.current.size);

  /** 모은 고침 저장(한 번에 하나 — 저장 중에 더 고치면 끝난 뒤 한 번 더) */
  const saveAll = async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) {
      again.current = true;
      return saving.current;
    }
    const edits = [...pending.current].map(([path, e]) => ({ path, ...e }));
    if (!edits.length) {
      setStatus((s) => (s.kind === "saved" ? s : { kind: "saved", text: `저장됨 ${hhmm(new Date())}` }));
      return true;
    }
    if (!versionRef.current) return false;
    setStatus({ kind: "saving", text: "저장 중…" });
    const run = (async () => {
      try {
        const r = await saveDraftTexts(opts.uid, { edits, version: versionRef.current! });
        if (!r.ok) {
          setStatus({ kind: "error", text: r.conflict ? "그사이 초안이 바뀜 — 새로 고침" : "저장 못 함" });
          opts.onError(r.message);
          return false;
        }
        versionRef.current = r.version;
        // 저장한 뒤 또 고친 글은 남김
        for (const e of edits) if (pending.current.get(e.path)?.text === e.text) pending.current.delete(e.path);
        bump();
        setStatus(pending.current.size ? { kind: "dirty", text: autosaveRef.current ? "변경됨" : "변경됨 · 저장 안 함" } : { kind: "saved", text: `저장됨 ${hhmm(new Date())}` });
        if (r.unknown) opts.onError(r.message);
        if (editing.current) needRefresh.current = true;
        else router.refresh();
        return true;
      } catch {
        setStatus({ kind: "error", text: "저장 못 함" });
        opts.onError("저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = run;
    const ok = await run;
    if (again.current) {
      again.current = false;
      if (pending.current.size && autosaveRef.current) return saveAll();
    }
    return ok;
  };

  /** 고친 글 하나 모음 → 자동 저장이면 쉬었다가(now면 바로) 저장 */
  const record = (path: string, text: string, join: string | undefined, now: boolean) => {
    pending.current.set(path, { text, join });
    bump();
    if (timer.current) clearTimeout(timer.current);
    if (!autosaveRef.current) {
      setStatus({ kind: "dirty", text: "변경됨 · 저장 안 함" });
      return;
    }
    setStatus({ kind: "dirty", text: "변경됨" });
    if (now) void saveAll();
    else timer.current = setTimeout(() => void saveAll(), AUTOSAVE_MS);
  };

  /** 자동 저장 켜고 끄기(켜면 모아 둔 고침을 바로 저장) */
  const toggleAutosave = () => {
    const on = !autosave;
    setAutosave(on);
    autosaveRef.current = on;
    if (on && pending.current.size) void saveAll();
    else if (!on && pending.current.size) setStatus({ kind: "dirty", text: "변경됨 · 저장 안 함" });
  };

  /** 두 번 누르기 → 그 자리에서 고치기 */
  const startEdit = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!opts.enabled) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(".k-t[data-t]");
    if (!el || editing.current) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    const path = el.dataset.t!;
    const join = el.dataset.j || undefined;
    const html = el.innerHTML;
    const raw = el.dataset.raw ?? el.textContent ?? "";
    const hadPending = pending.current.get(path);
    const saved = el.dataset.saved ?? raw;
    el.dataset.saved = saved;
    editing.current = el;
    el.textContent = raw;
    el.contentEditable = "plaintext-only";
    el.classList.add("k-editing");
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const read = () => (el.textContent ?? "").replace(/\s*\n\s*/g, " ").trim();
    let done = false;
    const finish = () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("input", onInput);
      el.removeAttribute("contenteditable");
      el.classList.remove("k-editing");
      editing.current = null;
    };
    // 고치는 중에도 자동 저장(1.5초 쉬면) — 과제원장 편집기처럼
    const onInput = () => {
      const text = read();
      if (text === saved.trim() && !pending.current.has(path)) return;
      const bad = overLimit(path, text);
      if (bad) {
        setStatus({ kind: "error", text: bad });
        return;
      }
      record(path, text, join, false);
    };
    const end = () => {
      if (done) return;
      done = true;
      const text = read();
      finish();
      const bad = text === saved.trim() ? null : overLimit(path, text);
      if (bad) {
        // 한도를 넘는 고침은 저장하지 않고 이번 고침을 취소(Esc와 같음)
        if (hadPending) pending.current.set(path, hadPending);
        else pending.current.delete(path);
        bump();
        el.innerHTML = html;
        setStatus({ kind: "error", text: bad });
        opts.onError(`저장하지 않았습니다 — ${bad}`);
      } else if (text === saved.trim()) {
        // 고치기 전 저장된 글로 돌아왔으면 모은 고침도 뺌
        if (pending.current.delete(path)) bump();
        el.innerHTML = el.dataset.savedHtml ?? html;
        el.classList.remove("k-dirty");
        if (!pending.current.size) setStatus((st) => (st.kind === "dirty" ? { kind: "idle", text: "" } : st));
      } else {
        el.dataset.raw = text;
        el.textContent = text;
        el.classList.add("k-dirty");
        el.dataset.savedHtml ??= html;
        record(path, text, join, true);
      }
      if (needRefresh.current && !pending.current.size) {
        needRefresh.current = false;
        router.refresh();
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && !ev.isComposing) {
        ev.preventDefault();
        end();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        done = true;
        finish();
        // 이번 고침만 취소(그 전에 모아 둔 글로)
        if (hadPending) pending.current.set(path, hadPending);
        else pending.current.delete(path);
        bump();
        el.innerHTML = html;
      }
    };
    const onBlur = () => end();
    el.addEventListener("keydown", onKey);
    el.addEventListener("blur", onBlur);
    el.addEventListener("input", onInput);
  };

  // 두 번 누를 때 브라우저가 낱말을 골라 「AI 수정 요청」 도구줄이 뜨지 않게
  const blocksMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => opts.enabled && ((e.detail >= 2 && Boolean((e.target as HTMLElement).closest(".k-t[data-t]"))) || Boolean((e.target as HTMLElement).closest(".k-editing")));

  // 새로 고침으로 종이 HTML이 바뀌면 아직 저장 안 한 글을 다시 입힘(자동 저장이 꺼져 있을 때)
  useLayoutEffect(() => {
    const box = opts.paperRef.current;
    if (!box || !pending.current.size) return;
    for (const [path, p] of pending.current) {
      const el = box.querySelector<HTMLElement>(`.k-t[data-t="${CSS.escape(path)}"]`);
      if (!el || el.classList.contains("k-dirty") || el === editing.current) continue;
      el.dataset.savedHtml = el.innerHTML;
      el.dataset.saved = el.dataset.raw ?? "";
      el.dataset.raw = p.text;
      el.textContent = p.text;
      el.classList.add("k-dirty");
    }
  });

  // 저장 안 한 고침이 있으면 창 닫기·새로 고침 전에 브라우저가 확인
  useEffect(() => {
    const warn = (ev: BeforeUnloadEvent) => {
      if (!pending.current.size) return;
      ev.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /** 다른 화면으로 가는 링크를 누르면 먼저 저장(과제원장 편집기의 「이동 전 저장」과 같음) — 저장이 안 되면 이동 안 함 */
  const onLinkCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (!pending.current.size) return;
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    const href = a?.getAttribute("href");
    if (!a || !href || !href.startsWith("/") || a.hasAttribute("download") || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    void saveAll().then((ok) => ok && router.push(href));
  };

  return { autosave, toggleAutosave, status, pendingCount, saveAll, startEdit, blocksMouseDown, onLinkCapture };
}
