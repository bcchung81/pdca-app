import { BpToggle } from "../../../../../components/reports/section-draft-button";
import { Tag } from "../../../../../components/ui/kit";
import { FIT_TAG } from "../../../../../components/ui/status-tone.ts";
import { fmtDateTime } from "../../../../../lib/format.ts";
import { fitWord } from "../../../../../lib/reports/draft-thread.ts";
import type { Composition } from "../../../../../lib/reports/composition.ts";
import { FIT_RANGE_TEXT } from "../../../../../lib/reports/fit.ts";
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
  // 판면 한 마디(「0.5쪽에 맞음」·「N줄쯤 빔」 — 판정은 fitVerdict 하나, %·mm는 title)
  const word = fitWord(fit, spec.module);
  // 보이는 글은 사람이 고른 첨부·전년 절만 — 자동으로 고른 평가 근거 조각 수는 title에만(2026-11-04 개발자용 문구 빼기)
  const usedParts = [files.length ? `첨부 ${files.length}` : "", priorUsed.length ? `전년 절 ${priorUsed.length}` : ""].filter(Boolean);
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
      <Tag tone="link" title={`지금 초안 · ${fmtDateTime(draft?.updated_at)}`}>
        {spec.mg ? `${spec.mg.indicator} · 평가내용 ${[...new Set(spec.mg.parts.map((p) => p.evalNo))].join("·")} · 절 ${spec.mg.parts.length}` : `${spec.task.no} ${spec.sub.mark}. · ${spec.module}쪽`}
      </Tag>
      {/* 이 초안이 어느 길로 쓰였는지(2026-09-28): 구성안대로(승인하고 집필) · 구성안 안 씀(바로 만들기) · 구성안보다 먼저 쓴 초안 */}
      {spec.plan ? (
        <Tag tone="navy" title={`승인한 구성안${spec.plan.story ? `(${storyLabel(spec.plan.story, spec.plan.subStory)})` : ""}의 틀·블록 순서·도식대로 쓴 초안 — 같은 순서로 맞은 블록 ${spec.plan.matched}/${spec.plan.total}`}>
          구성안대로 · 짜임 {spec.plan.matched}/{spec.plan.total}
        </Tag>
      ) : composition && draft?.outline_at && draft?.updated_at && draft.outline_at > draft.updated_at ? (
        <Tag tone="warn" title="지금 구성안을 만들기 전에 쓴 초안입니다 — 구성안대로 쓰려면 오른쪽 아래 요청 칸 「집필」">
          구성안보다 먼저 쓴 초안
        </Tag>
      ) : composition && draft?.outline_status !== "approved" ? (
        <Tag tone="warn" title={`바로 만들기로 쓴 초안 — 지금 구성안${composition.story ? `(${storyLabel(composition.story, composition.subStory)})` : ""}의 틀·도식을 쓰지 않았습니다. 구성안대로 쓰려면 오른쪽 아래 요청 칸 「집필」`}>
          구성안 안 씀
        </Tag>
      ) : null}
      {/* 판면: 한 마디(1쪽에 맞음·N줄쯤 빔·조금 넘침·넘침) — 판정은 fitVerdict 하나, 어림 %·mm는 title에 */}
      {fit && word && (
        <Tag tone={FIT_TAG[word.tone]} title={`${word.title}(${fit.total}/${fit.budget}mm) · ${FIT_RANGE_TEXT}`}>
          {word.text}
        </Tag>
      )}
      <Tag tone={usedParts.length ? "navy" : "muted"} title={usedTitle}>
        반영: {usedParts.length ? usedParts.join(" · ") : "카드만"}
      </Tag>
    </>
  );
}

/** 도구줄 오른쪽 끝(보기·확대 단추 뒤): BP */
export function ReportToolbarEnd({ uid, spec, canWrite }: { uid: string; spec: ReportSectionSpec | null; canWrite: boolean }) {
  if (!spec) return null;
  return (
    <>
      {canWrite && <BpToggle uid={uid} on={spec.task.bp} />}
    </>
  );
}
