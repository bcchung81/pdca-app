"use client";

import { useRef, useState } from "react";
import { parseCardImport, startCardImport } from "../../../app/(app)/cards/import/actions";
import { T } from "../../ui/kit";
import { createBrowserSupabase } from "../../../lib/supabase/browser.ts";

/**
 * 과제관리카드 한글 파일(HWP·HWPX) 올리기 → 서버가 kordoc으로 읽어 원장과 매칭.
 * 파일은 서명 주소로 저장소에 바로 올립니다(함수 본문 한도와 무관). 다 읽으면 onParsed(묶음 번호).
 */
export function CardFileUpload(props: { cardUid?: string; multiple?: boolean; compact?: boolean; onParsed: (importId: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const run = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length || busy) return;
    setErr(null);
    setBusy(`올릴 준비 중…`);
    try {
      const s = await startCardImport({ files: files.map((f) => ({ name: f.name, size: f.size })), cardUid: props.cardUid });
      if (!s.ok) {
        setErr(s.message);
        return;
      }
      const sb = createBrowserSupabase();
      for (const [i, file] of files.entries()) {
        const u = s.uploads[i];
        setBusy(`파일 올리는 중 (${i + 1}/${files.length}) · ${file.name}`);
        const { error } = await sb.storage.from("card-imports").uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || "application/octet-stream" });
        if (error) {
          setErr(`${file.name}: 올리지 못했습니다.`);
          return;
        }
      }
      setBusy("한글 파일을 읽고 원장 과제와 맞춰 보는 중…");
      const p = await parseCardImport(s.importId);
      if (!p.ok) {
        setErr(p.message ?? "파일을 읽지 못했습니다.");
        return;
      }
      props.onParsed(s.importId);
    } catch {
      setErr("올리는 중에 문제가 생겼습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) void run(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center gap-2 rounded-lg border border-dashed text-center ${props.compact ? "px-3 py-4" : "px-6 py-8"} ${over ? "border-navy bg-info-bg" : "border-field-line bg-field"}`}
    >
      <p className="text-sm font-semibold text-ink">{props.multiple === false ? "한글 파일(HWP·HWPX)을 끌어 놓거나 골라 주세요" : "과제관리카드 한글 파일을 끌어 놓거나 골라 주세요"}</p>
      <p className="text-xs leading-5 text-muted">
        {props.multiple === false ? "이 과제의 카드 한 장(카드 양식 그대로). 파일 하나, 30MB 이하" : "과제별 파일 여러 개 또는 묶음 파일(카드 여러 장 — 주요사업·경영관리) · HWP·HWPX · 한 번에 20개, 파일마다 30MB 이하"}
      </p>
      <input
        ref={input}
        type="file"
        multiple={props.multiple !== false}
        accept=".hwp,.hwpx"
        className="sr-only"
        onChange={(e) => e.target.files && void run(e.target.files)}
        aria-label="올릴 한글 파일 고르기"
      />
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={() => input.current?.click()}
        className={`flex h-8 items-center rounded-md border border-navy bg-paper px-3 text-xs font-semibold text-navy hover:bg-info-bg ${T.off}`}
      >
        한글 파일 고르기
      </button>
      {busy && (
        <p role="status" className="max-w-full truncate text-xs text-muted-2">
          {busy}
        </p>
      )}
      {err && (
        <p role="alert" className="text-xs text-error">
          {err}
        </p>
      )}
    </div>
  );
}
