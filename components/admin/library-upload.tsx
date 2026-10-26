"use client";

import { FileText, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { removePeerCases, uploadPeerCases } from "../../app/(app)/admin/library/actions";
import { finishKnowledgeUpload, removeKnowledgeDocument, startKnowledgeUpload } from "../../app/(app)/admin/library/knowledge-actions";
import type { SharedSizeRow } from "../../lib/knowledge/guard.ts";
import { SHARED_CHARS_LIMIT } from "../../lib/knowledge/limits.ts";
import { UPLOAD_EXTS, UPLOAD_SCOPES, type UploadScope, precheckUpload } from "../../lib/knowledge/upload-scope.ts";
import { createBrowserSupabase } from "../../lib/supabase/browser.ts";
import { T } from "../ui/kit";

const n = (v: number) => v.toLocaleString("ko-KR");
const PEER_MAX = 4 * 1024 * 1024;
const ACCEPT = UPLOAD_EXTS.map((e) => `.${e}`).join(",");
const mb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const field = "h-9 min-w-0 rounded-md border border-field-line bg-paper px-2.5 text-sm text-ink";
const label = "flex min-w-0 flex-col gap-1 text-xs font-medium text-muted";

type Kind = "general" | "peer";
/** 올린 결과 한 장(일반 문서·붙임2 공통) */
type Report = { ok: boolean; message: string; lines: string[]; warnings: string[]; errors: string[]; guard: SharedSizeRow[]; matching?: string };
export type PeerCurrent = { rows: number; fileName: string; updatedAt: string } | null;

/**
 * 관리 › 공통 자료·틀의 올리기 칸 하나(2026-10-01 정리): 끌어 놓거나 눌러서 고르면 같은 자리에서 제목·범위만 정하고 올립니다.
 * 일반 문서(범용 조각기 → 규칙 범위·검색·과제 매칭)와 붙임2(유관기관 평가보고서 정리 → 월간 점검 ★사례제안)를 종류 칩으로 가름.
 */
export function LibraryUpload({ sizes, peer }: { sizes: SharedSizeRow[]; peer: PeerCurrent }) {
  const router = useRouter();
  const pick = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>("general");
  const [title, setTitle] = useState("");
  const [edition, setEdition] = useState("");
  const [issuer, setIssuer] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [scope, setScope] = useState<UploadScope>("search-only");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const biggest = sizes.reduce((a, b) => (b.before > a.before ? b : a), sizes[0]);
  const scopeInfo = UPLOAD_SCOPES.find((s) => s.value === scope);
  const peerTooBig = kind === "peer" && file !== null && file.size > PEER_MAX;
  const ready = file !== null && !busy && !peerTooBig && (kind === "peer" || title.trim().length > 0);

  const choose = (files: FileList | File[] | null) => {
    const f = files && Array.from(files)[0];
    if (!f) return;
    const bad = precheckUpload(f.name, f.size);
    if (bad) return setNotice(bad);
    setNotice(Array.from(files).length > 1 ? "한 번에 한 파일씩 올립니다 — 첫 파일을 골랐습니다." : null);
    setReport(null);
    setFile(f);
    setTitle(f.name.replace(/\.[^.]+$/, ""));
    setKind(/붙임\s*2/.test(f.name) ? "peer" : "general");
  };
  const reset = () => {
    setFile(null);
    setTitle("");
    setEdition("");
    setIssuer("");
    setNotice(null);
    if (pick.current) pick.current.value = "";
  };

  const submit = async () => {
    if (!file) return;
    setReport(null);
    if (kind === "peer") {
      setBusy("붙임2 표를 읽는 중…");
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadPeerCases({ status: "idle" }, fd);
      setBusy(null);
      if (r.status === "idle") return;
      const problems = r.status === "ok" ? r.problems : (r.problems ?? []);
      setReport({
        ok: r.status === "ok",
        message: r.message,
        lines: r.status === "ok" ? [`등급 ${Object.entries(r.summary.grades).map(([g, c]) => `${g} ${c}`).join(" · ")} · KCA 행 ${r.summary.kca}`] : [],
        warnings: r.status === "ok" ? problems.slice(0, 8) : [],
        errors: r.status === "error" ? problems.slice(0, 8) : [],
        guard: [],
      });
      if (r.status === "ok") {
        reset();
        router.refresh();
      }
      return;
    }
    setBusy("올릴 주소를 받는 중…");
    const s = await startKnowledgeUpload(file.name, file.size);
    if (!s.ok) {
      setBusy(null);
      return setReport({ ok: false, message: s.message, lines: [], warnings: [], errors: [], guard: [] });
    }
    setBusy(`${file.name} 올리는 중…`);
    const up = await createBrowserSupabase().storage.from("knowledge").uploadToSignedUrl(s.path, s.token, file, { contentType: file.type || "application/octet-stream" });
    if (up.error) {
      setBusy(null);
      return setReport({ ok: false, message: "파일을 올리지 못했습니다. 다시 시도해 주세요.", lines: [], warnings: [], errors: [], guard: [] });
    }
    setBusy("읽고 조각으로 나누는 중(큰 문서는 1~2분 걸릴 수 있습니다)…");
    const r = await finishKnowledgeUpload({ path: s.path, fileName: file.name, title, edition, issuer, year, scope });
    setBusy(null);
    setReport({
      ok: r.ok,
      message: r.message,
      lines: r.stats ? [`조각 ${r.stats.chunks}개 · 글 ${n(r.stats.chars)}자 · ${r.stats.byPage ? "쪽 경계로 나눔(제목 없음)" : `제목 깊이 ${r.stats.splitDepth}까지`}`] : [],
      warnings: r.warnings.slice(0, 8),
      errors: r.ok ? [] : r.checks.filter((c) => !c.ok && c.level === "error").map((c) => `${c.name} — 실제 ${String(c.actual)}${c.note ? ` (${c.note})` : ""}`),
      guard: r.guard,
      matching: r.matching
        ? r.matching.message
          ? `과제 매칭 작업을 등록하지 못했습니다(${r.matching.message}) — 나중에 pnpm prep enqueue --match --doc ${r.docId}`
          : r.matching.queued > 0
            ? `과제 매칭 작업 ${r.matching.queued}건 등록(Vercel에서는 자동 처리, 남은 것은 pnpm prep run --ai)`
            : "과제 매칭이 필요 없는 범위입니다(검색 전용이거나 대상 과제 없음)."
        : undefined,
    });
    if (r.ok) {
      reset();
      router.refresh();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input ref={pick} type="file" accept={ACCEPT} className="sr-only" aria-label="올릴 파일 고르기" onChange={(e) => choose(e.target.files)} />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="파일을 끌어 놓거나 눌러서 고르기"
          onClick={() => pick.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            choose(e.dataTransfer.files);
          }}
          className={`flex cursor-pointer items-center gap-4 rounded-lg border-2 border-dashed px-5 py-5 transition-colors ${over ? "border-navy bg-info-bg" : "border-field-line bg-field hover:border-navy"}`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-navy shadow-[inset_0_0_0_1px_var(--line)]">
            <Upload size={18} aria-hidden />
          </span>
          <span className="flex min-w-0 grow flex-col gap-0.5">
            <span className="text-sm font-semibold text-navy">파일을 끌어 놓거나 눌러서 고르기</span>
            <span className="truncate text-xs text-muted">{UPLOAD_EXTS.map((e) => e.toUpperCase()).join(" · ")} · 100MB까지 · 붙임2는 파일명에 「붙임2」가 있으면 자동으로 알아봅니다</span>
          </span>
          <span className={T.btn}>파일 선택</span>
        </div>
      ) : (
        <section aria-label="올릴 파일" className="flex flex-col gap-4 rounded-lg border border-line bg-paper p-4">
          <div className="flex min-w-0 items-center gap-3">
            <FileText size={18} className="shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 truncate text-sm font-semibold text-navy" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted">{mb(file.size)}</span>
            <button type="button" disabled={Boolean(busy)} onClick={() => pick.current?.click()} className="ml-auto shrink-0 text-xs text-link underline disabled:cursor-not-allowed disabled:text-muted">
              다른 파일
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={reset} aria-label="올리기 취소" title="취소" className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-row-hover hover:text-navy disabled:cursor-not-allowed disabled:text-muted-2">
              <X size={16} aria-hidden />
            </button>
          </div>

          <div role="radiogroup" aria-label="자료 종류" className="flex w-fit gap-0.5 rounded-lg border border-field-line bg-paper p-0.5">
            {(
              [
                ["general", "일반 문서"],
                ["peer", "붙임2 — 유관기관 평가보고서 정리"],
              ] as const
            ).map(([k, text]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                disabled={Boolean(busy)}
                onClick={() => setKind(k)}
                className={`h-7 rounded-md px-3 text-ui whitespace-nowrap ${kind === k ? "bg-navy font-semibold text-white" : "font-medium text-muted-2 hover:text-navy"}`}
              >
                {text}
              </button>
            ))}
          </div>

          {kind === "general" ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className={label}>
                문서 제목
                <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 안전관리 업무 매뉴얼" className={field} />
              </label>
              <label className={label}>
                올릴 범위
                <select value={scope} onChange={(e) => setScope(e.target.value as UploadScope)} className={field}>
                  <optgroup label="AI 근거에 넣음">
                    {UPLOAD_SCOPES.filter((s) => s.value !== "search-only").map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="검색에만">
                    <option value="search-only">검색 전용</option>
                  </optgroup>
                </select>
              </label>
              <p className="text-xs leading-5 text-muted sm:col-span-2">
                {scopeInfo?.hint}
                {scope !== "search-only" && biggest ? (
                  <>
                    {" "}
                    · 지금 가장 큰 사업의 공통 지식 <b className="text-ink">{biggest.unit} {n(biggest.before)} / {n(SHARED_CHARS_LIMIT)}자</b> (여유 {n(SHARED_CHARS_LIMIT - biggest.before)}자, 넘기면 멈춤)
                  </>
                ) : null}
              </p>
              <details className="sm:col-span-2">
                <summary className="w-fit cursor-pointer text-xs text-muted-2 hover:text-navy">판·발행·기준연도 (선택)</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <label className={label}>
                    판
                    <input value={edition} maxLength={100} onChange={(e) => setEdition(e.target.value)} placeholder="예: 2026. 9." className={field} />
                  </label>
                  <label className={label}>
                    발행
                    <input value={issuer} maxLength={100} onChange={(e) => setIssuer(e.target.value)} placeholder="예: 성과관리팀" className={field} />
                  </label>
                  <label className={label}>
                    기준연도
                    <input type="number" value={year} min={2000} max={2100} onChange={(e) => setYear(Number(e.target.value))} className={field} />
                  </label>
                </div>
              </details>
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted">
              {peer ? (
                <>
                  지금 적재됨 · <b className="text-ink">{peer.fileName}</b> · {peer.rows}행 · {peer.updatedAt} — 올리면 통째로 바뀝니다.
                </>
              ) : (
                "아직 없음 — 올리기 전까지 월간 점검의 ★사례제안은 「기준 미확인 — 붙임2 미확보」입니다."
              )}{" "}
              표 머리: 구분 · 기관명 · 주요사업 · 등급 · 잘한 점 · 아쉬운 점 (4MB 이하)
              {peerTooBig && <b className="ml-1 text-warn">이 파일은 4MB가 넘습니다. 표만 남긴 파일로 다시 저장해 주세요.</b>}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!ready} onClick={() => void submit()} className={T.btnPrimary}>
              {busy ? "처리 중…" : kind === "peer" ? (peer ? "새 파일로 바꾸기" : "붙임2 적재") : "올려 적재"}
            </button>
            {busy && (
              <span role="status" className="min-w-0 text-xs text-muted-2">
                {busy}
              </span>
            )}
          </div>
        </section>
      )}

      {notice && (
        <p role="alert" className="text-xs text-warn">
          {notice}
        </p>
      )}

      {report && (
        <div role={report.ok ? "status" : "alert"} className={`flex flex-col gap-1.5 rounded-lg border px-4 py-3 text-xs ${report.ok ? "border-line bg-thead text-ink" : "border-warn bg-warn-bg text-ink"}`}>
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 grow text-ui font-semibold">{report.message}</p>
            <button type="button" onClick={() => setReport(null)} aria-label="결과 닫기" className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:text-navy">
              <X size={14} aria-hidden />
            </button>
          </div>
          {report.lines.map((l) => (
            <p key={l} className="text-muted-2">
              {l}
            </p>
          ))}
          {report.matching && <p className="text-muted-2">{report.matching}</p>}
          {report.errors.length > 0 && (
            <ul className="list-disc pl-4">
              {report.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {report.warnings.length > 0 && (
            <ul className="list-disc pl-4 text-warn">
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {report.guard.length > 0 && (
            <details open={report.guard.some((g) => g.over)}>
              <summary className="w-fit cursor-pointer text-muted-2 hover:text-navy">요청 앞에 붙는 공통 지식 크기 (한도 {n(SHARED_CHARS_LIMIT)}자)</summary>
              <table className="mt-1 w-full max-w-[520px] text-left">
                <thead>
                  <tr className="text-muted">
                    <th className="pr-3 font-normal">사업</th>
                    <th className="pr-3 font-normal">전</th>
                    <th className="pr-3 font-normal">후</th>
                    <th className="font-normal">여유</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {report.guard.map((g) => (
                    <tr key={g.unit} className={g.over ? "font-semibold text-warn" : ""}>
                      <td className="pr-3">{g.unit}</td>
                      <td className="pr-3">{n(g.before)}</td>
                      <td className="pr-3">{n(g.after)}</td>
                      <td>{g.over ? `넘음 ${n(-g.room)}` : n(g.room)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 문서 정보 옆 창의 지우기. 화면에서 올린 일반 문서(up-…)와 붙임2만 지울 수 있음 — 조각과 과제 대응(확정 포함)도 함께 지워지므로 한 번 더 확인.
 */
export function DocDelete({ docId, title, peer }: { docId: string; title: string; peer: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = peer ? await removePeerCases() : await removeKnowledgeDocument(docId);
      setMsg({ ok: r.ok, text: r.message });
      setAsk(false);
      if (r.ok) router.replace(`/admin/library`, { scroll: false });
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      {ask ? (
        <div className="flex flex-wrap items-center gap-2 text-ui">
          <span className="min-w-0 truncate" title={title}>
            「{title}」{peer ? " 적재를 지울까요?" : " — 조각과 과제 대응(확정 포함)도 함께 지워집니다."}
          </span>
          <button type="button" disabled={pending} onClick={run} className="h-8 shrink-0 rounded-md bg-error px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:text-white/50">
            {pending ? "지우는 중…" : "지우기"}
          </button>
          <button type="button" disabled={pending} onClick={() => setAsk(false)} className={T.btn}>
            취소
          </button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setAsk(true)} className="flex h-8 items-center gap-1.5 rounded-md border border-error bg-paper px-3 text-xs font-semibold text-error">
            <Trash2 size={14} aria-hidden /> 이 문서 지우기
          </button>
        </div>
      )}
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-muted-2" : "text-error"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
