import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSIST_EXPECT, INSPECT_EXPECT, OUTLINE_RUNS, assistProgress, blockShapesProgress, draftExpect, draftProgress, expectLabel, fmtElapsed, overdue, rangeText } from "./progress.ts";
import { MG_FILL } from "../reports/mg-fill-limits.ts";

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

test("과제원장 진행 줄: 카드·첨부·공통 지식, 질문만 점검표+앞 대화가 더함(점검표가 없을 때 — 작성지원 범위는 아래 시험)", () => {
  const labels = (s: ReturnType<typeof assistProgress>) => s.sources.map((x) => x.label);
  const improve = assistProgress("improve", { files: [] });
  assert.equal(improve.title, "개선 제안 쓰는 중");
  assert.deepEqual(labels(improve), ["카드", "공통 지식"]);
  assert.ok(improve.sources[1].detail.includes("규칙 범위"));

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
  assert.equal(knowledge(assistProgress("chat", { files: [] })), knowledge(assistProgress("discover", { files: [] })), "적용 안 되고 뺀 갈래가 없으면(실적 발굴·점검표 없음) 예전 문구");
  assert.ok(knowledge(assistProgress("chat", { files: [] })).startsWith("규칙 범위 전부"));
  assert.deepEqual(assistProgress("improve", { files: ["a.pdf"], selected: 0 }).sources.map((x) => x.label), ["카드", "첨부 1건", "공통 지식"], "라벨·순서는 그대로");
});

test("작성지원 진행 줄: 요청 종류 × 최종 점검표 유무의 자료 범위(lib/knowledge/mode-profile.ts writerScope와 같은 표) — 뺀 자료·최종 점검표 줄·컨설팅 의견", () => {
  const knowledge = (s: ReturnType<typeof assistProgress>) => s.sources.find((x) => x.label === "공통 지식")!.detail;
  const labels = (s: ReturnType<typeof assistProgress>) => s.sources.map((x) => x.label);
  const consult = ["외부 컨설팅 1차 · 가"];
  // 개선 제안: 점검표가 없어도 붙임2는 뺌, 점검표가 있으면 점검표가 대신하는 자료를 빼고 「최종 점검표」 줄
  const improve = knowledge(assistProgress("improve", { files: [] }));
  assert.ok(improve.startsWith("규칙 범위에서 이 요청 종류가 쓰지 않는 자료를 뺀 나머지") && improve.includes("뺀 자료: 붙임2 유관기관 사례"), improve);
  const improveIns = assistProgress("improve", { files: [], inspection: true, consult });
  assert.match(knowledge(improveIns), /뺀 자료: 점검표가 대신하는 자료\(관리계획 서술·자가진단 체크리스트·편람·'25 평가위원 의견·중간보고서 지적·붙임2 사례\) — 최종 점검표가 대신함/);
  assert.deepEqual(labels(improveIns), ["카드", "공통 지식", "컨설팅 의견 1건", "최종 점검표"]);
  assert.match(improveIns.sources.at(-1)!.detail, /점검월이 가장 늦은 1건의 요약\(총평·미흡 항목 보완방안·★사례제안\)/);
  // 실적 발굴: 점검표가 없으면 예전 그대로(뺀 갈래 없음), 있으면 점검표가 대신하는 자료를 뺌
  assert.ok(knowledge(assistProgress("discover", { files: [] })).startsWith("규칙 범위 전부"));
  assert.ok(!labels(assistProgress("discover", { files: [] })).includes("최종 점검표"), "점검표가 없으면 줄 없음");
  assert.ok(knowledge(assistProgress("discover", { files: [], inspection: true })).includes("최종 점검표가 대신함"));
  assert.ok(labels(assistProgress("discover", { files: [], inspection: true })).includes("최종 점검표"));
  // 실적 반영: 지표·전략 + 그 밖만, 선별 안 씀(고른 수가 와도), 컨설팅 의견 안 넣음
  for (const inspection of [false, true]) {
    const reflect = assistProgress("reflect", { files: [], inspection, selected: 4, consult });
    assert.match(knowledge(reflect), /^요청 종류 범위 — 지표·전략\(성과지표 Pool·중장기 목표지표·기관장 성과지표·AX 검토 과제·과제 목록의 이 과제 행\) · 그 밖\([^)]*\)( · 자가진단 체크리스트\([^)]*\))?만 원문 그대로\(선별 방식 안 씀\)$/);
    assert.ok(!labels(reflect).some((l) => l.startsWith("컨설팅 의견")), "실적 반영은 컨설팅 의견을 넣지 않음");
    assert.equal(labels(reflect).includes("최종 점검표"), inspection);
    assert.equal(knowledge(reflect).includes("자가진단 체크리스트(점검 대비 귀띔용"), !inspection, "실적 반영: 점검표가 없을 때만 자가진단 체크리스트를 적음");
    for (const m of ["improve", "discover", "followup"] as const) assert.ok(!knowledge(assistProgress(m, { files: [], inspection, selected: 4 })).includes("점검 대비 귀띔용"), `${m}: 바뀌지 않음`);
  }
  // 보완 점검: 점검표가 대신하는 자료를 뺌(점검표는 늘 있음 — 미흡 항목 줄 그대로)
  const followup = assistProgress("followup", { files: [] });
  assert.ok(knowledge(followup).includes("최종 점검표가 대신함"));
  assert.equal(followup.sources.filter((x) => x.label === "최종 점검표").length, 1);
  assert.match(followup.sources.at(-1)!.detail, /미흡 항목/);
  // 선별 방식이 적용되면 선별 문구 + 고르기 전에 뺀 자료(공통 규칙 문서는 그대로)
  const sel = knowledge(assistProgress("improve", { files: [], inspection: true, selected: 6 }));
  assert.ok(sel.includes("고른 자료 6건") && sel.includes("고르기 전에 뺀 자료: 점검표가 대신하는 자료") && sel.endsWith("(공통 규칙 문서는 그대로)"), sel);
  // 질문은 점검표 유무와 상관없이 예전 그대로
  assert.equal(knowledge(assistProgress("chat", { files: [], inspection: true })), knowledge(assistProgress("chat", { files: [] })));
});

test("공통 지식 범위 문구: AI 가점 실사는 관련 카드에만 든다고 적음(lib/knowledge/bonus-scope.ts — AI활용 칸·과제 연결·경영관리 지표 13) — 작성지원·질문·경평 초안이 같은 문구", () => {
  const note = "공통지표·사업 미지정 실사(AI 가점 실사는 AI활용 칸·과제 연결·경영관리 지표 13 과제만)";
  const knowledge = (s: { sources: Array<{ label: string; detail: string }> }) => s.sources.find((x) => x.label.startsWith("공통 지식"))!.detail;
  assert.ok(knowledge(assistProgress("chat", { files: [] })).includes(note));
  assert.ok(knowledge(assistProgress("discover", { files: [] })).includes(note));
  assert.ok(knowledge(assistProgress("improve", { files: [] })).includes(note), "뺀 자료를 적는 문구도 규칙 범위 글을 그대로 씀");
  assert.ok(knowledge(draftProgress("outline", { files: [], prior: [], lens: 0 })).includes(note));
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

test("경평 초안 보통 걸리는 시간: 한곳(draftExpect)에서 — 경영관리 표는 따로(집필 한 번 + 분량 채움 보강), 단추 글은 rangeText(2026-10-10 effort high 실측)", () => {
  assert.equal(rangeText(draftExpect("outline")), "1~4분");
  assert.equal(rangeText(draftExpect("story")), "1~4분");
  assert.equal(rangeText(draftExpect("outline", true)), "1~4분", "경영관리 구성안 108·150초");
  // 경영관리 집필 89·99초 + 분량 채움 보강(2026-10-29 — 보강 전체 상한 MG_FILL.maxSec(실측 블록 16~44초 × 두 라운드 약 20블록)까지, 사유가 없으면 집필 한 번으로 끝나 아래쪽 그대로)
  assert.equal(rangeText(draftExpect("plan", true)), `1~${Math.round((180 + MG_FILL.maxSec) / 60)}분`);
  assert.equal(draftExpect("plan", true).max, 180 + MG_FILL.maxSec);
  assert.deepEqual(draftExpect("revise", true), draftExpect("plan", true), "자료 반영 고치기도 같은 보강");
  assert.equal(rangeText(draftExpect("plan")), "1~3분", "주요사업 집필은 그대로");
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

test("경영관리 집필 진행 줄(2026-10-29): 「분량 보강」 단계는 경영관리 구성안대로 집필·자료 반영 고치기에만(서버가 실제로 하는 단계 — 공통 지식은 그대로 끝), 주요사업·구성안 요청에는 없음", () => {
  for (const kind of ["plan", "revise"] as const) {
    const mg = draftProgress(kind, { files: [], prior: [], lens: 0, mg: true });
    const fill = mg.sources.find((s) => s.label === "분량 보강");
    assert.ok(fill, kind);
    assert.match(fill.detail, new RegExp(`먼저 저장[^\n]*배정의 ${Math.round(MG_FILL.low * 100)}%[^\n]*반복 수치[^\n]*블록을 모두 하나씩 다시 쓰고[^\n]*최대 ${MG_FILL.rounds}회[^\n]*1차 글 그대로`));
    assert.match(mg.sources.at(-1)!.label, /^공통 지식/, "공통 지식은 맨 끝 그대로");
    assert.ok(!draftProgress(kind, { files: [], prior: [], lens: 0 }).sources.some((s) => s.label === "분량 보강"), `${kind}: 주요사업은 없음`);
  }
  assert.ok(!draftProgress("outline", { files: [], prior: [], lens: 0, mg: true }).sources.some((s) => s.label === "분량 보강"), "구성안 요청은 없음");
});

test("경영관리 주요사업 초안 참고: 진행 줄 「넣은 자료」에 실제 고른 것만, 예상 시간은 biz가 있을 때만 늘림(실호출 633.8초 근거)", () => {
  const withBiz = draftProgress("plan", { files: [], prior: [], lens: 0, mg: true, biz: ["3-나", "5-가"] });
  const line = withBiz.sources.find((x) => x.label.startsWith("주요사업 초안"));
  assert.equal(line?.label, "주요사업 초안 2건");
  assert.match(line?.detail ?? "", /^3-나·5-가/);
  assert.ok(withBiz.expect.max > draftExpect("plan", true).max, "biz가 있으면 지금 경영관리 값보다 늘림");
  assert.ok(draftExpect("outline", true, true).max > draftExpect("outline", true).max);
  // 고른 것이 없거나 주요사업 트랙이면 줄·시간 그대로
  const none = draftProgress("plan", { files: [], prior: [], lens: 0, mg: true, biz: [] });
  assert.ok(!none.sources.some((x) => x.label.startsWith("주요사업 초안")));
  assert.deepEqual(none.expect, draftExpect("plan", true));
  const biz = draftProgress("plan", { files: [], prior: [], lens: 0, biz: ["3-나"] });
  assert.ok(!biz.sources.some((x) => x.label.startsWith("주요사업 초안")), "주요사업 카드는 안 그림");
  assert.deepEqual(biz.expect, draftExpect("plan"));
});

test("경영관리 진행 줄(2026-11-21 메인 결정): 실적 반영은 실사·지표·전략·전년 보고서·그 밖(선별 따름), 선별 문구는 규칙 문서 없이 기준 자료 원문(TrackSpec.selectRules raw) — 주요사업은 그대로", () => {
  const knowledge = (s: ReturnType<typeof assistProgress>) => s.sources.find((x) => x.label === "공통 지식")!.detail;
  const labels = (s: ReturnType<typeof assistProgress>) => s.sources.map((x) => x.label);
  const mgReflect = assistProgress("reflect", { files: [], track: "경영관리", consult: ["외부 컨설팅 1차 · 가"] });
  assert.match(knowledge(mgReflect), /^요청 종류 범위 — 실사\([^)]*\) · 지표·전략\([^)]*\) · 전년 보고서\([^)]*\) · 그 밖\([^)]*\)( · 자가진단 체크리스트\([^)]*\))?만 원문 그대로$/);
  assert.ok(!labels(mgReflect).some((l) => l.startsWith("컨설팅 의견")));
  assert.ok(knowledge(mgReflect).includes("자가진단 체크리스트(점검 대비 귀띔용"), "경영관리 실적 반영(점검표 없음): 체크리스트");
  assert.ok(!knowledge(assistProgress("reflect", { files: [], track: "경영관리", inspection: true })).includes("자가진단 체크리스트"), "점검표가 있으면 안 적음");
  const mgReflectSel = knowledge(assistProgress("reflect", { files: [], track: "경영관리", selected: 5 }));
  assert.ok(mgReflectSel.startsWith("선별 방식 — 이 과제에 고른 자료 5건") && mgReflectSel.includes("요청 종류 범위 — 실사") && !mgReflectSel.includes("공통 규칙 문서") && !mgReflectSel.includes("기준 자료(편람"), mgReflectSel);
  assert.match(knowledge(assistProgress("reflect", { files: [], track: "주요사업", selected: 5 })), /선별 방식 안 씀/, "주요사업 실적 반영은 그대로(고른 수가 와도)");
  // 질문·개선 제안(점검표 없음): 기준 자료 원문 그대로 + 고른 자료 + 실사 제목 목록, 규칙 문서라고 적지 않음
  const chat = knowledge(assistProgress("chat", { files: [], track: "경영관리", selected: 8 }));
  assert.ok(chat.startsWith("선별 방식 — 기준 자료(편람·관리계획 서술·자가진단 체크리스트)는 원문 그대로 + 이 과제에 고른 자료 8건(이 지표의 지적·2025 보고서 장과 고른 실사 원문, 과제 연결 포함) + 나머지 실사는 제목 목록"), chat);
  assert.ok(!chat.includes("공통 규칙 문서"));
  const improve = knowledge(assistProgress("improve", { files: [], track: "경영관리", selected: 8 }));
  assert.ok(improve.endsWith("(기준 자료는 원문 그대로)") && !improve.includes("공통 규칙 문서"), improve);
  // 점검표가 있으면 기준 자료(점검표가 대신하는 자료)는 빠지므로 원문 그대로라고 적지 않음
  const improveIns = knowledge(assistProgress("improve", { files: [], track: "경영관리", selected: 8, inspection: true }));
  assert.ok(improveIns.startsWith("선별 방식 — 이 과제에 고른 자료 8건") && improveIns.includes("고르기 전에 뺀 자료: 점검표가 대신하는 자료") && !improveIns.includes("원문 그대로)") , improveIns);
  // 주요사업·트랙 미지정은 예전 문구 그대로
  assert.equal(knowledge(assistProgress("chat", { files: [], track: "주요사업", selected: 8 })), knowledge(assistProgress("chat", { files: [], selected: 8 })));
  assert.ok(knowledge(assistProgress("chat", { files: [], selected: 8 })).startsWith("선별 방식 — 공통 규칙 문서"));
});

test("작성지원 진행 줄(주요사업 선별): 지표 기준은 원문 그대로라고 적음 — 점검표가 대신하면 편람은 빼고 적음, 질문·경평 초안·경영관리·선별 안 씀은 그대로", () => {
  const knowledge = (s: ReturnType<typeof assistProgress>) => s.sources.find((x) => x.label === "공통 지식")!.detail;
  const both = "선별 방식 — 공통 규칙 문서(트랙 공통·이 사업의 조항·기준을 정리한 글) + 지표 기준(Pool·중장기·기관장 지표·이 사업 편람 지표)은 원문 그대로 + 이 과제에 고른 자료 6건";
  const noHandbook = "선별 방식 — 공통 규칙 문서(트랙 공통·이 사업의 조항·기준을 정리한 글) + 지표 기준(Pool·중장기·기관장 지표)은 원문 그대로 + 이 과제에 고른 자료 6건";
  for (const mode of ["improve", "discover"] as const) {
    assert.ok(knowledge(assistProgress(mode, { files: [], selected: 6 })).startsWith(both), mode);
    const ins = knowledge(assistProgress(mode, { files: [], selected: 6, inspection: true }));
    assert.ok(ins.startsWith(noHandbook) && ins.endsWith("(공통 규칙 문서는 그대로)"), ins);
  }
  assert.ok(knowledge(assistProgress("followup", { files: [], selected: 6 })).startsWith(noHandbook));
  assert.ok(!knowledge(assistProgress("chat", { files: [], selected: 6 })).includes("지표 기준"), "질문은 그대로");
  assert.ok(!knowledge(assistProgress("improve", { files: [], selected: 6, track: "경영관리" })).includes("지표 기준"), "경영관리(raw)는 그대로");
  assert.ok(!knowledge(assistProgress("improve", { files: [] })).includes("지표 기준"), "선별 안 되면 그대로");
  assert.ok(!draftProgress("outline", { files: [], prior: [], lens: 0, selected: 7 }).sources.some((x) => x.detail.includes("지표 기준")), "경평 초안은 그대로");
});
