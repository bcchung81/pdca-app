import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSIST_EXPECT, INSPECT_EXPECT, OUTLINE_RUNS, assistProgress, blockShapesProgress, draftExpect, draftProgress, expectLabel, fmtElapsed, overdue, rangeText } from "./progress.ts";

test("경과 시간 m:ss, 보통 걸리는 시간 글, 넘겼는지", () => {
  assert.equal(fmtElapsed(0), "0:00");
  assert.equal(fmtElapsed(42.9), "0:42");
  assert.equal(fmtElapsed(125), "2:05");
  assert.equal(fmtElapsed(-3), "0:00");
  assert.equal(expectLabel(ASSIST_EXPECT), "보통 30초~2분", "예전 표시와 같은 글");
  assert.equal(expectLabel({ min: 60, max: 180 }), "보통 1~3분");
  assert.equal(expectLabel({ min: 45, max: 90 }), "보통 45초~1분 30초");
  assert.equal(overdue(120, ASSIST_EXPECT), false);
  assert.equal(overdue(121, ASSIST_EXPECT), true);
});

test("과제원장 진행 줄: 요청 종류와 상관없이 같은 규칙 범위(공통 지식), 질문만 점검표+앞 대화가 더함", () => {
  const labels = (s: ReturnType<typeof assistProgress>) => s.sources.map((x) => x.label);
  const improve = assistProgress("improve", { files: [] });
  assert.equal(improve.title, "개선 제안 쓰는 중");
  assert.deepEqual(labels(improve), ["카드", "공통 지식"]);
  assert.ok(improve.sources[1].detail.includes("규칙 범위 전부"));

  const discover = assistProgress("discover", { files: ["실적.pdf", "통계.xlsx"] });
  assert.deepEqual(labels(discover), ["카드", "첨부 2건", "공통 지식"]);
  assert.equal(discover.sources[1].detail, "실적.pdf · 통계.xlsx");
  assert.deepEqual(labels(assistProgress("reflect", { files: [] })), ["카드", "공통 지식"]);

  const chat = assistProgress("chat", { files: [], history: 9 });
  assert.equal(chat.title, "질문에 답하는 중");
  assert.deepEqual(labels(chat), ["카드", "공통 지식", "최종 점검표", "앞 대화 4차례"], "앞 대화는 서버가 받는 최근 4차례까지");
  assert.ok(chat.sources.at(-1)!.detail.includes("2.4만 자"));
  assert.ok(!labels(assistProgress("chat", { files: [], history: 0 })).some((l) => l.startsWith("앞 대화")), "첫 질문이면 앞 대화 없음");
});

test("과제원장 진행 줄: 선별 방식이 적용되는 요청만 「공통 규칙 문서 + 고른 자료 N건 + 제목 목록」, 아니면 규칙 범위 전부 그대로", () => {
  const knowledge = (s: ReturnType<typeof assistProgress>) => s.sources.find((x) => x.label === "공통 지식")!.detail;
  const sel = knowledge(assistProgress("chat", { files: [], history: 2, selected: 3 }));
  assert.ok(sel.includes("공통 규칙 문서") && sel.includes("고른 자료 3건") && sel.includes("제목 목록"));
  assert.ok(!sel.includes("규칙 범위 전부"), "선별이면 전부라고 적지 않음");
  assert.equal(knowledge(assistProgress("chat", { files: [] })), knowledge(assistProgress("improve", { files: [] })), "적용 안 되면 예전 문구");
  assert.ok(knowledge(assistProgress("improve", { files: [] })).startsWith("규칙 범위 전부"));
  assert.deepEqual(assistProgress("improve", { files: ["a.pdf"], selected: 0 }).sources.map((x) => x.label), ["카드", "첨부 1건", "공통 지식"], "라벨·순서는 그대로");
});

test("경평 초안 진행 줄: 카드·올해 실적(늘) + 고른 첨부·전년 절·평가 근거, 요청마다 보통 걸리는 시간", () => {
  const outline = draftProgress("outline", { files: ["추가.pdf"], prior: ["1-가 절"], lens: 12 });
  assert.equal(outline.title, "구성안 만드는 중");
  assert.equal(expectLabel(outline.expect), "보통 1~4분", "2026-10-10 로컬 CLI 실측(경평 effort high — B4) 69~175초");
  assert.deepEqual(
    outline.sources.map((x) => x.label),
    ["카드", "올해 실적", "첨부 1건", "전년 절 1", "평가 근거 12", "공통 지식 전체"],
  );
  assert.ok(outline.sources[3].detail.includes("1-가 절"));
  assert.ok(outline.sources.at(-1)!.detail.includes("규칙 범위 전부"));
  // 원장 → 종합점검 → 경평 구성안(2026-10-09): 구성안 만들기·틀 바꾸기·다시 만들기는 최종 점검표의 보완 요청도 넣음(집필·바로 만들기는 안 넣음)
  const withInsp = draftProgress("outline", { files: [], prior: [], lens: 0, inspection: "’26.9 점검 · 미흡 2" });
  assert.ok(withInsp.sources.some((x) => x.label === "월간 점검 보완 요청" && x.detail.includes("’26.9 점검 · 미흡 2")));
  assert.ok(!draftProgress("plan", { files: [], prior: [], lens: 0, inspection: "’26.9 점검 · 미흡 2" }).sources.some((x) => x.label === "월간 점검 보완 요청"));
  assert.ok(!draftProgress("draft", { files: [], prior: [], lens: 0, inspection: "’26.9 점검 · 미흡 2" }).sources.some((x) => x.label === "월간 점검 보완 요청"));
  const plan = draftProgress("plan", { files: [], prior: [], lens: 0 });
  assert.deepEqual(
    plan.sources.map((x) => x.label),
    ["카드", "올해 실적", "공통 지식 전체"],
    "고른 근거가 없어도 규칙 범위 전체는 늘 있음",
  );
  assert.equal(expectLabel(plan.expect), "보통 1~3분", "구성안대로 집필은 고치기를 포함해 45~121초(라운드 Z, effort high)");
  assert.deepEqual([...OUTLINE_RUNS].sort(), ["again", "outline", "story"]);
});

test("보완 점검 진행 줄: 카드·공통 지식 + 최종 점검표, 제목은 요청 종류 이름", () => {
  const p = assistProgress("followup", { files: [] });
  assert.equal(p.title, "보완 점검 쓰는 중");
  assert.equal(expectLabel(p.expect), "보통 1~4분", "행마다 답이 나와 다른 요청 종류보다 오래 걸림");
  assert.equal(expectLabel(assistProgress("improve", { files: [] }).expect), "보통 30초~2분", "다른 요청 종류는 그대로");
  assert.deepEqual(p.sources.map((s) => s.label), ["카드", "공통 지식", "최종 점검표"]);
});

test("경평 초안 보통 걸리는 시간: 한곳(draftExpect)에서 — 경영관리 표는 따로(집필은 한 번 — 판면 고치기 없음), 단추 글은 rangeText(2026-10-10 effort high 실측)", () => {
  assert.equal(rangeText(draftExpect("outline")), "1~4분");
  assert.equal(rangeText(draftExpect("story")), "1~4분");
  assert.equal(rangeText(draftExpect("outline", true)), "1~4분", "경영관리 구성안 108·150초");
  assert.equal(rangeText(draftExpect("plan", true)), "1~3분", "경영관리 집필 89·99초");
  assert.equal(rangeText(draftExpect("draft")), "2~5분", "바로 만들기는 1차·고치기·판면만 한 번 더 196초");
  assert.equal(expectLabel(draftProgress("outline", { files: [], prior: [], lens: 0, mg: true }).expect), "보통 1~4분");
});

test("월간 점검 AI 초안 보통 걸리는 시간(INSPECT_EXPECT): 출력 5~5.9만 토큰(약 6~7분) 실측 — 화면 글은 rangeText", () => {
  assert.equal(rangeText(INSPECT_EXPECT), "5~8분");
});

test("경평 초안 짜임 고르기·여러 안 진행 줄(2026-10-12): 고른 구성 패턴·2025 예시 절은 「근거 아님」으로, 여러 안은 안 수·동시에·저장 안 함 — 점검 보완 요청도 넣음", () => {
  const story = draftProgress("story", { files: [], prior: [], lens: 0, frame: { pattern: "3단-2 — 배경 세 갈래", example: "2025 보고서 1-1 가. 제목" } });
  assert.equal(story.title, "고른 짜임으로 구성안 짜는 중");
  assert.match(story.sources.find((s) => s.label === "구성 패턴")?.detail ?? "", /3단-2.*근거 아님/);
  assert.match(story.sources.find((s) => s.label === "2025 예시 절")?.detail ?? "", /사실·숫자 근거 아님/);
  assert.ok(!draftProgress("story", { files: [], prior: [], lens: 0 }).sources.some((s) => s.label === "구성 패턴"), "고르지 않으면 없음");
  const alts = draftProgress("alts", { files: ["a.pdf"], prior: [], lens: 3, inspection: "’26.9 점검 · 미흡 2", alts: 3 });
  assert.equal(alts.title, "여러 안을 동시에 짜는 중");
  assert.equal(rangeText(alts.expect), "1~5분");
  assert.match(alts.sources.find((s) => s.label === "3안")?.detail ?? "", /동시에.*저장하지 않고/);
  assert.ok(alts.sources.some((s) => s.label === "월간 점검 보완 요청"));
  assert.ok(!OUTLINE_RUNS.has("alts"), "여러 안은 저장하지 않아 구성안 머리로 옮기지 않음");
});

test("경평 초안·다른 모양으로 진행 줄: 선별 방식이 적용되면(selected) 「공통 지식」을 선별 문구로, 아니면 「공통 지식 전체」 그대로", () => {
  const last = (s: { sources: Array<{ label: string; detail: string }> }) => s.sources.at(-1)!;
  for (const kind of ["outline", "plan", "draft", "alts"] as const) {
    const off = last(draftProgress(kind, { files: [], prior: [], lens: 0 }));
    assert.equal(off.label, "공통 지식 전체");
    assert.ok(off.detail.startsWith("규칙 범위 전부") && off.detail.includes("작성 방법론"));
    const on = last(draftProgress(kind, { files: [], prior: [], lens: 0, selected: 7 }));
    assert.equal(on.label, "공통 지식");
    assert.ok(on.detail.includes("공통 규칙 문서") && on.detail.includes("고른 자료 7건") && on.detail.includes("작성 방법론"), kind);
    assert.ok(!on.detail.includes("규칙 범위 전부"), "선별이면 전부라고 적지 않음");
  }
  const shapesOff = last(blockShapesProgress({ blockNo: 2, want: null }));
  assert.equal(shapesOff.label, "공통 지식 전체");
  assert.ok(shapesOff.detail.endsWith("경평 초안 작성 방법론(특강·강의 — 글 쓰는 방식의 참고)"), "예전 문구 그대로");
  const shapesOn = last(blockShapesProgress({ blockNo: 2, want: null, selected: 0 }));
  assert.equal(shapesOn.label, "공통 지식");
  assert.ok(shapesOn.detail.includes("고른 자료 0건"));
});
