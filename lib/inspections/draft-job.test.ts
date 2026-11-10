// 월간 점검 AI 초안 작업 한 번(lib/inspections/draft-job.ts — 2026-11-10 백그라운드 전환): 실제 AI·DB 없이 deps를 가짜로.
// 지키는 것: 예전 동기 액션과 같은 순서(호출 → 토큰 기록 → 검증 → 초안 저장)·같은 끝맺음 글, 시작 때 본 판이 아니면 덮지 않고 결과만 남김(T4 리뷰 X3),
// 못 쓴 까닭(보내짐·다른 사람이 고침·만듦·지워짐·권한·오류)을 나눠 알림(X4), 실패는 호출 기록을 error로,
// 결과 행(ai_results.result.data)에는 그 점검월·점검표·저장 여부 — 편집 화면은 같은 점검월만 채우거나(저장됨) 「AI 결과 보기」로 띄움(못 씀).
import assert from "node:assert/strict";
import { test } from "node:test";
import { runJob } from "../ai/job-run.ts";
import { type JobOutcome, jobState } from "../ai/jobs.ts";
import { SAVE_MISS_MESSAGE, type SaveMiss, draftSavedMessage, inspectionJobResult, pendingAiResult, runInspectionJob, saveMissReason } from "./draft-job.ts";
import { type InspectionResult, MGMT_FORM_ID, emptyResult } from "./model.ts";

/** 7대축 4·질의패턴 5 미흡(★ 2개 — 집중보완), 나머지 충족인 점검표 */
function sample(form?: string): InspectionResult {
  const r = emptyResult(form);
  for (const k of ["axes", "patterns", "coherence"] as const) r[k] = r[k].map(() => ({ judgment: "충족", question: "", fix: "", evidence: [], card: "", note: "" }));
  r.axes[3] = { ...r.axes[3], judgment: "미흡", fix: "보완" };
  r.patterns[4] = { ...r.patterns[4], judgment: "미흡", fix: "보완", question: "질의?" };
  r.overview = { status: "현황", direction: "★OutCome 연결: 방향", case: "" };
  return r;
}

type Call = { model: string };
function deps(o: { callThrows?: boolean; verifyThrows?: boolean; miss?: SaveMiss; version?: string; result?: InspectionResult } = {}) {
  const log: string[] = [];
  const d = {
    period: "2026-11",
    sources: 42,
    call: async (): Promise<Call> => {
      log.push("call");
      if (o.callThrows) throw new Error("CLI 시간 초과");
      return { model: "m" };
    },
    recorded: async () => {
      log.push("recorded");
    },
    verify: () => {
      log.push("verify");
      if (o.verifyThrows) throw new Error("검증 오류");
      return { result: o.result ?? sample(), unverified: 1, missing: 0 };
    },
    save: async (): Promise<{ ok: true; version?: string } | { ok: false; reason: SaveMiss }> => {
      log.push("save");
      return o.miss ? { ok: false, reason: o.miss } : { ok: true, ...(o.version ? { version: o.version } : {}) };
    },
    failed: async (e: unknown) => {
      log.push("failed");
      return `실패: ${(e as Error).message}`;
    },
  };
  return { d, log };
}

test("runInspectionJob: 호출 → 토큰 기록(검증 전) → 검증 → 초안 저장, 끝맺음 글은 충족 수·보완 건수·집중보완·근거 수, data에는 점검월과 점검표", async () => {
  const { d, log } = deps();
  const out = await runInspectionJob(d);
  assert.deepEqual(log, ["call", "recorded", "verify", "save"]);
  assert.equal(out.ok, true);
  assert.equal(out.message, "AI 초안을 저장했습니다(7대축 6/7 · 질의패턴 7/8 · 정합성 5/5, 보완 2건, 집중보완). 근거 조각 42개 · 원문과 다른 인용 1개 — 확인한 뒤 부서에 보내세요.");
  assert.deepEqual(out.data, { period: "2026-11", result: sample(), saved: true });
  // 저장한 행의 새 판을 실음 — 편집 화면이 다음 「초안 저장」 조건으로 씀(T4 리뷰 X3a)
  const v = await runInspectionJob(deps({ version: "2026-11-10T13:00:00.5+00:00" }).d);
  assert.deepEqual(v.data, { period: "2026-11", result: sample(), saved: true, version: "2026-11-10T13:00:00.5+00:00" });
});

test("runInspectionJob: 시작 때 본 판이 아니라 못 쓰면 덮지 않고 결과만 남김 — 까닭별 끝맺음 글, data에 저장 안 됨·까닭", async () => {
  for (const miss of ["sent", "changed", "created", "gone", "denied", "error"] as const) {
    const { d } = deps({ miss });
    assert.deepEqual(await runInspectionJob(d), { ok: false, message: SAVE_MISS_MESSAGE[miss], data: { period: "2026-11", result: sample(), saved: false, reason: miss } }, miss);
  }
  assert.match(SAVE_MISS_MESSAGE.changed, /이 점검표가 바뀌어\(다른 창·다른 사람의 저장\) 저장하지 않았습니다 — 「AI 결과 보기」/, "바꾼 주체를 단정하지 않음(T4 리뷰 T3-R4)");
  assert.ok(Object.values(SAVE_MISS_MESSAGE).every((m) => m.includes("「AI 결과 보기」")), "모든 까닭에서 결과는 남아 불러올 수 있음");
  assert.equal(new Set(Object.values(SAVE_MISS_MESSAGE)).size, 6, "까닭마다 다른 글");
});

test("saveMissReason(T4 리뷰 X4): 권한 → 보내짐 → 그 밖의 오류 → 지워짐 → 다른 사람이 고침·만듦", () => {
  const draft = { status: "draft", updated_at: "2026-11-10T12:00:01.000001+00:00" };
  const base = "2026-11-10T12:00:00.000001+00:00";
  // 시작 때 행이 있었음(update에 updated_at 조건 → 0행)
  assert.equal(saveMissReason({ base, error: null, row: draft, staff: true }), "changed", "그사이 다른 사람이 고침(판이 바뀜)");
  assert.equal(saveMissReason({ base, error: null, row: { ...draft, status: "sent" }, staff: true }), "sent");
  assert.equal(saveMissReason({ base, error: null, row: { ...draft, status: "acknowledged" }, staff: true }), "sent", "부서가 확인한 것도 보내진 것");
  assert.equal(saveMissReason({ base, error: null, row: null, staff: true }), "gone", "그사이 초안이 지워짐");
  assert.equal(saveMissReason({ base, error: null, row: null, staff: false }), "denied", "사용 중지·역할이 바뀌면 행이 안 보여도 권한으로");
  assert.equal(saveMissReason({ base, error: null, row: { ...draft, updated_at: base }, staff: true }), "error", "판이 그대로인데 못 씀 — 알 수 없는 까닭");
  // 시작 때 행이 없었음(insert)
  assert.equal(saveMissReason({ base: null, error: { code: "23505", message: "duplicate key value violates unique constraint" }, row: draft, staff: true }), "created", "그사이 다른 사람이 만듦");
  assert.equal(saveMissReason({ base: null, error: { code: "23505", message: "duplicate key" }, row: { ...draft, status: "sent" }, staff: true }), "sent", "만들어 바로 보냄");
  assert.equal(saveMissReason({ base: null, error: { code: "42501", message: "new row violates row-level security policy" }, row: null, staff: true }), "denied", "RLS 거절");
  assert.equal(saveMissReason({ base: null, error: { message: "permission denied for table inspections" }, row: null, staff: true }), "denied");
  assert.equal(saveMissReason({ base: null, error: { code: "08006", message: "connection failure" }, row: null, staff: true }), "error");
  assert.equal(saveMissReason({ base: null, error: { code: "08006", message: "connection failure" }, row: draft, staff: true }), "error", "고유 키가 아닌 오류는 다른 사람 탓으로 보지 않음");
});

test("runInspectionJob: AI 호출이 던지면 기록을 error로 끝맺는 failed의 글로 실패(토큰 기록·검증·저장 안 함), 검증이 던져도 같음", async () => {
  const a = deps({ callThrows: true });
  assert.deepEqual(await runInspectionJob(a.d), { ok: false, message: "실패: CLI 시간 초과" });
  assert.deepEqual(a.log, ["call", "failed"]);
  const b = deps({ verifyThrows: true });
  assert.deepEqual(await runInspectionJob(b.d), { ok: false, message: "실패: 검증 오류" });
  assert.deepEqual(b.log, ["call", "recorded", "verify", "failed"], "토큰은 이미 기록됨(검증 전)");
});

test("draftSavedMessage: 경영관리는 체크리스트 대조 건수를 덧붙이고, 집중보완이 아니면 「집중보완 아님」", () => {
  const mg = sample(MGMT_FORM_ID);
  mg.patterns[4] = { ...mg.patterns[4], judgment: "충족", fix: "", question: "" };
  mg.checklist = { sub: "전략기획", others: 3, rows: [{ label: "지적 1", point: "요지", result: "예", task: "1-1", note: "" }, { label: "①-2", point: "요지", result: "부분", task: "1-1", note: "" }] };
  assert.equal(draftSavedMessage(mg, 10, 0, 2), "AI 초안을 저장했습니다(7대축 6/7 · 질의패턴 8/8 · 정합성 5/5, 보완 1건, 집중보완 아님 · 체크리스트 대조 2개(예 1·부분 1·아니오 0)). 근거 조각 10개 · 빠진 항목 2개 — 확인한 뒤 부서에 보내세요.");
});

test("inspectionJobResult: 같은 점검월의 점검표와 저장 여부만(다른 달·모양이 아닌 값은 null, 저장 여부가 없는 이 판 전 결과는 저장된 것)", () => {
  const data = { period: "2026-11", result: sample(), saved: true };
  assert.deepEqual(inspectionJobResult(data, "2026-11"), { result: sample(), saved: true, version: null });
  assert.deepEqual(inspectionJobResult({ ...data, version: "v2" }, "2026-11"), { result: sample(), saved: true, version: "v2" }, "새 판");
  assert.deepEqual(inspectionJobResult({ ...data, saved: false, reason: "changed" }, "2026-11"), { result: sample(), saved: false, version: null });
  assert.deepEqual(inspectionJobResult({ period: "2026-11", result: sample() }, "2026-11"), { result: sample(), saved: true, version: null });
  assert.equal(inspectionJobResult(data, "2026-10"), null, "다른 달 점검 작업은 이 달 편집 화면에 안 채움");
  assert.equal(inspectionJobResult(null, "2026-11"), null);
  assert.equal(inspectionJobResult({ period: "2026-11" }, "2026-11"), null);
  assert.equal(inspectionJobResult({ period: "2026-11", result: "x" }, "2026-11"), null);
});

test("작업 흐름(after 안 runJob + runInspectionJob): 성공이면 결과 행 하나(화면이 끝·점검표를 읽음), 실패면 결과 행 + 호출 기록 닫기", async () => {
  const saved: JobOutcome[] = [];
  const failed: string[] = [];
  const sink = {
    save: async (r: JobOutcome) => {
      saved.push(r);
      return null;
    },
    fail: async (m: string) => {
      failed.push(m);
    },
  };
  const ok = await runJob(() => runInspectionJob(deps().d), sink, () => {});
  assert.equal(ok.ok, true);
  assert.deepEqual(saved, [ok]);
  assert.deepEqual(failed, []);
  // 화면(GET /api/ai/requests)이 보는 상태: 결과 행이 생기면 끝(호출 기록이 ok여도 결과 전에는 진행 중)
  const created_at = new Date().toISOString();
  assert.equal(jobState({ status: "ok", error: null, created_at, res: null }).state, "running");
  assert.equal(jobState({ status: "ok", error: null, created_at, res: { ok: ok.ok, message: ok.message } }).state, "ok");
  const bad = await runJob(() => runInspectionJob(deps({ miss: "changed" }).d), sink, () => {});
  assert.equal(bad.ok, false);
  assert.equal(bad.message, SAVE_MISS_MESSAGE.changed);
  assert.deepEqual(saved.at(-1), bad, "덮지 않았어도 AI 결과는 결과 행에 남음(「AI 결과 보기」)");
  assert.deepEqual(failed, [SAVE_MISS_MESSAGE.changed], "실패 끝맺음은 아직 running인 기록을 닫음(토큰은 이미 ok로 기록됨)");
});

test("pendingAiResult(T4 리뷰 T3-R5): 다시 열 때 되찾을 결과 — 이 달의 저장하지 못한 본인 결과 중 지금 점검표의 마지막 저장보다 늦은 것, 그중 가장 늦은 것", () => {
  const mk = (at: string, data: unknown, ok = false) => ({ at, result: { ok, data } });
  const kept = (n: number) => ({ period: "2026-11", result: { ...sample(), overview: { status: `안 ${n}`, direction: "", case: "" } }, saved: false, reason: "changed" });
  const rows = [
    mk("2026-11-10T12:10:00Z", kept(1)),
    mk("2026-11-10T12:20:00Z", kept(2)),
    mk("2026-11-10T12:30:00Z", { period: "2026-11", result: sample(), saved: true }, true), // 저장된 결과는 아님
    mk("2026-11-10T12:40:00Z", { ...kept(3), period: "2026-10" }), // 다른 달
  ];
  const pick = (u: string | null) => (pendingAiResult(rows, "2026-11", u) as { overview?: { status: string } } | null)?.overview?.status ?? null;
  assert.equal(pick("2026-11-10T12:05:00.123456+00:00"), "안 2", "마지막 저장 뒤에 끝난 것 중 가장 늦은 것");
  assert.equal(pick("2026-11-10T12:15:00.000001+00:00"), "안 2", "마지막 저장보다 이른 결과는 뺌");
  assert.equal(pick("2026-11-10T12:25:00+00:00"), null, "그 결과를 불러와 저장했으면(점검표 판이 더 늦음) 다시 안 뜸");
  assert.equal(pick(null), "안 2", "점검표가 없으면(지워짐 등) 이 달 결과 중 가장 늦은 것");
  assert.equal(pendingAiResult([], "2026-11", null), null);
});
