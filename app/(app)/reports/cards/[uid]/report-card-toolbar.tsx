import { Download } from "lucide-react";
import { BpToggle } from "../../../../../components/reports/section-draft-button";
import { T, Tag } from "../../../../../components/ui/kit";
import { FIT_TAG } from "../../../../../components/ui/status-tone.ts";
import { fmtDateTime } from "../../../../../lib/format.ts";
import type { Composition } from "../../../../../lib/reports/composition.ts";
import { FIT_RANGE_TEXT, fitVerdict } from "../../../../../lib/reports/fit.ts";
import { storyLabel } from "../../../../../lib/reports/frameworks.ts";
import type { ReportSectionSpec } from "../../../../../lib/reports/section.ts";
import { sourceGroups } from "./derive.ts";
import type { DraftRow } from "./load.ts";

/** 왼쪽 도구줄 칩(과제원장 편집기 도구줄 자리): 과제 · 어느 길로 쓰였는지 · 판면 어림 · 반영 근거 · 상태 */
export function ReportToolbar({ spec, draft, composition, stale, unknown }: { spec: ReportSectionSpec | null; draft: DraftRow | null; composition: Composition | null; stale: boolean; unknown: string[] }) {
  if (!spec) {
    return <span className="text-xs text-muted">{composition ? `초안 없음 · 구성안 ${draft?.outline_status === "approved" ? "승인" : "확인 전"}` : "초안 없음"}</span>;
  }
  const { files, lensUsed, priorUsed } = sourceGroups(spec);
  const fit = spec.fit;
  const fitRatio = fit?.budget ? Math.round((fit.total / fit.budget) * 100) : null;
  const verdict = fitRatio !== null ? fitVerdict(fitRatio) : null;
  const usedParts = [files.length ? `첨부 ${files.length}` : "", priorUsed.length ? `전년 절 ${priorUsed.length}` : "", lensUsed.length ? `평가 근거 ${lensUsed.length}` : ""].filter(Boolean);
  const usedTitle = [
    files.length ? `첨부: ${files.map((s) => s.name).join(", ")}` : "첨부 없이 만든 초안",
    priorUsed.length ? `전년 보고서 절: ${priorUsed.map((s) => s.name).join(", ")}` : "",
    lensUsed.length ? `평가 근거:\n${lensUsed.map((s) => s.name).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <>
      {/* 막힘 경고 두 칩은 맨 앞 — 도구줄이 한 줄 띠라 칩이 많으면 끝이 잘려 안 보일 수 있음 */}
      {stale && (
        <Tag tone="warnSolid" title="초안을 만든 뒤 원장 카드가 바뀌었습니다">
          원장이 바뀜 — 다시 만들기 권장
        </Tag>
      )}
      {unknown.length > 0 && (
        <Tag tone="warn" title={`미리보기의 붉은 점선: ${unknown.join(", ")}`}>
          근거에 없는 숫자 {unknown.length}
        </Tag>
      )}
      <Tag tone="link" title={`${draft?.model ?? "AI"} · ${fmtDateTime(draft?.updated_at)}`}>
        {spec.mg ? `${spec.mg.indicator} · 평가내용 ${[...new Set(spec.mg.parts.map((p) => p.evalNo))].join("·")} · 절 ${spec.mg.parts.length}` : `${spec.task.no} ${spec.sub.mark}. · ${spec.module}쪽`}
      </Tag>
      {/* 이 초안이 어느 길로 쓰였는지(2026-09-28): 구성안대로(승인하고 집필) · 구성안 안 씀(바로 만들기) · 구성안보다 먼저 쓴 초안 */}
      {spec.plan ? (
        <Tag tone="navy" title={`승인한 구성안${spec.plan.story ? `(${storyLabel(spec.plan.story, spec.plan.subStory)})` : ""}의 틀·블록 순서·도식대로 쓴 초안 — 같은 순서로 맞은 블록 ${spec.plan.matched}/${spec.plan.total}`}>
          구성안대로 · 짜임 {spec.plan.matched}/{spec.plan.total}
        </Tag>
      ) : composition && draft?.outline_at && draft?.updated_at && draft.outline_at > draft.updated_at ? (
        <Tag tone="warn" title="지금 구성안을 만들기 전에 쓴 초안입니다 — 구성안대로 쓰려면 오른쪽 요청 칸의 「구성안대로 집필」">
          구성안보다 먼저 쓴 초안
        </Tag>
      ) : composition && draft?.outline_status !== "approved" ? (
        <Tag tone="warn" title={`바로 만들기로 쓴 초안 — 지금 구성안${composition.story ? `(${storyLabel(composition.story, composition.subStory)})` : ""}의 틀·도식을 쓰지 않았습니다. 구성안대로 쓰려면 오른쪽 요청 칸의 「구성안대로 집필」`}>
          구성안 안 씀
        </Tag>
      ) : null}
      {/* 판면: 뜻(분량 맞음·빔·조금 넘침·넘침)을 먼저, mm는 title에 — 판정은 fitVerdict 하나 */}
      {fit && verdict && fitRatio !== null && (
        <Tag tone={FIT_TAG[verdict.tone]} title={`${verdict.hint} — 판면 어림 ${fit.total}/${fit.budget}mm · ${fitRatio}%(렌더 실측과 약 2% 차이${fit.passes ? ` · 맞추기 ${fit.passes}회` : ""}) · ${FIT_RANGE_TEXT}`}>
          {verdict.label} · {fitRatio}%
        </Tag>
      )}
      <Tag tone={usedParts.length ? "navy" : "muted"} title={usedTitle}>
        반영: {usedParts.length ? usedParts.join(" · ") : "카드만"}
      </Tag>
    </>
  );
}

/** 도구줄 오른쪽 끝(보기·확대 단추 뒤): BP · HTML 내려받기 */
export function ReportToolbarEnd({ uid, spec, canWrite }: { uid: string; spec: ReportSectionSpec | null; canWrite: boolean }) {
  if (!spec) return null;
  return (
    <>
      {canWrite && <BpToggle uid={uid} on={spec.task.bp} />}
      <a href={`/reports/cards/${uid}/html`} download aria-label="HTML 내려받기" title="이 초안을 HTML 한 파일로 내려받기" className={`${T.iconBtn} border-field-line bg-paper text-navy hover:border-navy`}>
        <Download size={15} aria-hidden />
      </a>
    </>
  );
}
