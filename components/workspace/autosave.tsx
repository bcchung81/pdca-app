"use client";

import { useSyncExternalStore } from "react";

/**
 * 자동 저장 켜기·끄기(이 브라우저에 화면별 열쇠로 기억, 기본 켜짐) — 과제원장 편집기(card-autosave)와 경평 초안 글 고치기(report-autosave)가 같이 씀.
 * 같은 열쇠를 쓰는 다른 탭·부품에도 바로 알림(storage·사용자 이벤트)
 */
const EVENT = "workspace-autosave-change";

function store(key: string) {
  return {
    subscribe(on: () => void) {
      window.addEventListener(EVENT, on);
      window.addEventListener("storage", on);
      return () => {
        window.removeEventListener(EVENT, on);
        window.removeEventListener("storage", on);
      };
    },
    get(): boolean {
      try {
        return window.localStorage.getItem(key) !== "0";
      } catch {
        return true;
      }
    },
    set(on: boolean) {
      try {
        window.localStorage.setItem(key, on ? "1" : "0");
      } catch {
        // 기억하지 못하면 이 화면에서만
      }
      window.dispatchEvent(new Event(EVENT));
    },
  };
}

const stores = new Map<string, ReturnType<typeof store>>();
const storeOf = (key: string) => stores.get(key) ?? stores.set(key, store(key)).get(key)!;

/** [켜짐, 바꾸기] — 서버 그림에서는 켜짐 */
export function useAutosave(key: string): [boolean, (on: boolean) => void] {
  const s = storeOf(key);
  const on = useSyncExternalStore(s.subscribe, s.get, () => true);
  return [on, s.set];
}

/** 자동 저장 스위치(과제원장 편집기와 같은 모양) */
export function AutosaveSwitch({ on, onToggle, hint = "고친 뒤 1.5초면" }: { on: boolean; onToggle: () => void; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      title={on ? `자동 저장 켜짐 — ${hint} 저장합니다` : "자동 저장 꺼짐 — 「저장」 단추를 누르거나 닫을 때 저장합니다"}
      className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted-2"
    >
      자동 저장
      <span aria-hidden="true" className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-navy" : "bg-line-strong"}`}>
        <span className={`absolute size-4 rounded-full bg-paper shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}
