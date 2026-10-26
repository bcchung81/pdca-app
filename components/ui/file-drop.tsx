"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { fmtDateTime } from "../../lib/format.ts";
import { createBrowserSupabase } from "../../lib/supabase/browser.ts";
import { T } from "./kit";

export interface FileItem {
  id: string;
  fileName: string;
  bytes: number | null;
  createdAt: string;
  url: string | null;
  /** AI가 못 읽었는지(참고자료 설계 1단계) — 있으면 「AI가 못 읽음」 표지를 보임 */
  parseError?: string | null;
  /** 읽은 글 수(읽었을 때만) */
  chars?: number | null;
}

/** 읽은 글 수(1만 자 이상은 「1.1만 자」, 미만은 「n자」) */
const charsLabel = (n: number) => (n >= 10_000 ? `${(n / 10_000).toFixed(1)}만 자` : `${n}자`);

type Ok = { ok: boolean; message?: string };
type StartUpload = (name: string, size: number) => Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }>;
/** parseError = 등록은 됐지만 AI가 못 읽음(참고자료 설계 1단계 — 올리기 자체는 성공) */
type FinishUpload = (path: string, name: string, mime: string, size: number) => Promise<Ok & { id?: string; parseError?: string }>;

/** 서명 업로드 한 건: 서버가 주소를 주면 브라우저가 저장소에 바로 올리고(함수 본문 한도와 무관) 서버가 목록에 등록. FileDrop·AI 작성지원 공용 */
export async function uploadSigned(bucket: string, file: File, start: StartUpload, finish: FinishUpload): Promise<Ok & { id?: string; parseError?: string }> {
  const s = await start(file.name, file.size);
  if (!s.ok) return { ok: false, message: s.message };
  const { error } = await createBrowserSupabase().storage.from(bucket).uploadToSignedUrl(s.path, s.token, file, { contentType: file.type || "application/octet-stream" });
  if (error) return { ok: false, message: `${file.name}: 올리지 못했습니다.` };
  const f = await finish(s.path, file.name, file.type, file.size);
  return f.ok ? { ok: true, id: f.id, parseError: f.parseError } : { ok: false, message: f.message ?? "등록하지 못했습니다." };
}

/**
 * 파일 끌어 놓기·골라 올리기 + 목록(공용). 서버가 서명 업로드 주소를 주면(저장소 insert 권한 = RLS) 브라우저가 저장소에 바로 올리고,
 * 올린 뒤 서버가 목록에 등록합니다 — Vercel 함수 본문 한도(4.5MB)를 거치지 않습니다.
 */
export function FileDrop(props: {
  bucket: string;
  items: FileItem[];
  canEdit: boolean;
  hint: string;
  maxLabel?: string;
  accept?: string;
  start: StartUpload;
  finish: FinishUpload;
  remove: (id: string) => Promise<Ok>;
  /** 올리거나 지운 뒤(기본: 화면 새로 고침) */
  onChange?: () => void;
  compact?: boolean;
  /** false면 올리기 칸만(목록은 쓰는 쪽이 따로 그림) */
  list?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const changed = () => (props.onChange ? props.onChange() : router.refresh());

  const upload = async (files: FileList | File[]) => {
    setErr(null);
    for (const file of Array.from(files)) {
      setBusy(`${file.name} 올리는 중…`);
      const r = await uploadSigned(props.bucket, file, props.start, props.finish);
      if (!r.ok) {
        setErr(r.message ?? "올리지 못했습니다.");
        break;
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    changed();
  };
  const size = (b: number | null) => (b === null ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  return (
    <div className="flex flex-col gap-3">
      {props.canEdit && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center gap-2 rounded-lg border border-dashed text-center ${props.compact ? "px-3 py-4" : "px-4 py-6"} ${over ? "border-navy bg-info-bg" : "border-field-line bg-field"}`}
        >
          <p className="text-sm text-ink">파일을 끌어 놓거나 눌러서 올리기</p>
          <p className="text-xs leading-5 text-muted">{props.hint}</p>
          <input ref={input} type="file" multiple accept={props.accept} className="sr-only" onChange={(e) => e.target.files && void upload(e.target.files)} aria-label="올릴 파일 고르기" />
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => input.current?.click()}
            className={T.btn}
          >
            파일 선택
          </button>
          {busy && (
            <p role="status" className="text-xs text-muted-2">
              {busy}
            </p>
          )}
          {err && (
            <p role="alert" className="text-xs text-error">
              {err}
            </p>
          )}
        </div>
      )}
      {props.list === false ? null : props.items.length === 0 ? (
        <p className="text-ui text-muted">아직 올린 자료가 없습니다.</p>
      ) : (
        <ul className="flex flex-col rounded-md border border-line">
          {props.items.map((m) => (
            <li key={m.id} className="flex min-w-0 items-center gap-3 border-b border-row-line px-3 py-2 last:border-b-0">
              <span className="w-10 shrink-0 font-mono text-xs text-muted uppercase">{(m.fileName.split(".").pop() ?? "").slice(0, 5)}</span>
              {m.url ? (
                <a href={m.url} className="min-w-0 truncate text-ui text-link" title={m.parseError ? `${m.fileName} — AI가 못 읽음: ${m.parseError}` : m.fileName}>
                  {m.fileName}
                </a>
              ) : (
                <span className="min-w-0 truncate text-ui" title={m.parseError ? `AI가 못 읽음: ${m.parseError}` : undefined}>
                  {m.fileName}
                </span>
              )}
              {m.parseError ? (
                <span className="shrink-0 rounded-chip bg-warn-bg px-1 text-xs text-warn" title={m.parseError}>
                  AI가 못 읽음
                </span>
              ) : (
                m.chars != null && <span className="shrink-0 font-mono text-xs text-muted-2">{charsLabel(m.chars)}</span>
              )}
              <span className="ml-auto shrink-0 font-mono text-xs text-muted">{size(m.bytes)}</span>
              {!props.compact && <span className="shrink-0 font-mono text-xs text-muted">{fmtDateTime(m.createdAt)}</span>}
              {props.canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await props.remove(m.id);
                      if (!r.ok) setErr(r.message ?? "지우지 못했습니다.");
                      changed();
                    })
                  }
                  className="shrink-0 text-xs text-muted underline hover:text-warn"
                  aria-label={`${m.fileName} 삭제`}
                >
                  삭제
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
