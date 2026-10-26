"use client";

import { BotMessageSquare, Paperclip } from "lucide-react";
import { type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode, useRef } from "react";
import { T } from "../ui/kit";

export interface AiComposerMode<K extends string = string> {
  key: K;
  /** 칩에 보이는 짧은 이름 */
  label: string;
  /** 칩 title(자세한 설명) */
  title: string;
}

export interface AiComposerAttach {
  onFiles: (files: FileList) => void;
  accept: string;
  disabled?: boolean;
  title: string;
}

/**
 * AI 작성지원 아래 붙박이 요청 입력줄 — 과제관리카드 「AI 작성지원」과 경평 초안 「AI 초안」이 같은 모양을 씁니다:
 * 요청 종류 라디오 칩 → (칩 아래 자리, 있으면) → 첨부 칩 줄(있으면) → 📎 첨부 · 요청 칸(⌘↵) · 보내기.
 * 경평 초안은 칩 없이 head로 지금 요청만 밝힘(종류는 단계 레일에서).
 * <form>도 이 부품이 그립니다(두 화면의 감싸는 모양이 같았음) — 기능별 차이(요청 종류 가짓수·첨부 조건·글자 수 한도 등)는 props로.
 * 요청 칸·첨부 단추는 이 부품이 다 들고 있습니다(부르는 쪽에 ref를 넘기지 않음 — 요청 값은 onSubmit 때 부르는 쪽이 자기 상태로 압니다).
 */
export function AiComposer<K extends string>(props: {
  onSubmit: () => void;
  /** 없거나 비면 요청 종류 칩을 그리지 않음 */
  modes?: ReadonlyArray<AiComposerMode<K>>;
  mode?: K;
  onMode?: (k: K) => void;
  /** 칩 줄 자리(맨 위) */
  head?: ReactNode;
  /** 칩 아래 자리(경평 초안의 「초안 근거」 줄 등) */
  below?: ReactNode;
  /** 첨부 칩 줄(붙은 자료가 있을 때만 부르는 쪽이 조건부로 넘김) */
  attachments?: ReactNode;
  /** 📎 단추 — 없으면 첨부를 아예 못 함(부서 화면 보기 등) */
  attach?: AiComposerAttach;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
  ariaLabel: string;
  placeholder: string;
  disabled?: boolean;
  submitDisabled: boolean;
  submitLabel: string;
  error?: ReactNode;
}) {
  const field = "w-full min-w-0 rounded-md border border-field-line bg-paper px-2.5 py-2 text-ui text-ink";
  // 파일 입력은 이 부품 안에서만 만들고 씀(부르는 쪽에 ref를 넘기지 않음)
  const fileRef = useRef<HTMLInputElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        props.onSubmit();
      }}
      className="flex max-h-[55%] shrink-0 flex-col gap-2.5 overflow-y-auto border-t border-line bg-thead px-5 py-3"
    >
      {props.head}
      {props.modes && props.modes.length > 0 && (
        <div role="radiogroup" aria-label="요청 종류" className="flex flex-wrap gap-1.5">
          {props.modes.map((m) => (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={props.mode === m.key}
              title={m.title}
              onClick={() => props.onMode?.(m.key)}
              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${props.mode === m.key ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-muted-2 hover:border-navy"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      {props.below}
      {props.attachments}
      <div className="flex items-end gap-2">
        {props.attach && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={props.attach.accept}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              // 고른 파일을 바로 올려 보낸 뒤 값을 비워 같은 파일을 다시 골라도 다시 뜨게 함
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const files = e.target.files;
                e.target.value = "";
                if (files && files.length) props.attach!.onFiles(files);
              }}
            />
            <button
              type="button"
              disabled={props.attach.disabled}
              onClick={() => fileRef.current?.click()}
              aria-label="파일 첨부"
              title={props.attach.title}
              className={`flex size-10 shrink-0 items-center justify-center rounded-md border border-field-line bg-paper text-muted-2 hover:border-navy hover:text-navy ${T.off}`}
            >
              <Paperclip size={18} aria-hidden="true" />
            </button>
          </>
        )}
        <textarea
          rows={2}
          value={props.value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => props.onChange(e.target.value)}
          maxLength={props.maxLength}
          disabled={props.disabled}
          aria-label={props.ariaLabel}
          onKeyDown={onKeyDown}
          className={`${field} grow resize-none leading-6 disabled:cursor-not-allowed disabled:bg-thead disabled:text-muted`}
          placeholder={props.placeholder}
        />
        <button
          type="submit"
          disabled={props.submitDisabled}
          aria-label={props.submitLabel}
          title={`${props.submitLabel} (⌘↵)`}
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-navy text-white hover:bg-navy/90 disabled:cursor-not-allowed disabled:text-white/50"
        >
          <BotMessageSquare size={20} aria-hidden="true" />
        </button>
      </div>
      {props.error}
    </form>
  );
}
