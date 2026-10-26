// 경평 초안 「부서 제출 단위」(lib/reports/submission.ts) 단위 시험 — 과제별 초안 상태·제출 조건 셈이 결정론대로 도는지 확인합니다.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import type { ReportSectionSpec } from "./section.ts";
import { type SubmitCard, REVIEW_NOTE_MAX, SUBMIT_OVER, cardSubmitRow, submitBlockedReason, submitReadiness } from "./submission.ts";

/** 시험용 최소 v3 spec(다른 필드는 셈에 쓰지 않아 기본값만) */
function spec(overrides: Partial<ReportSectionSpec> = {}): ReportSectionSpec {
  return {
    version: 3,
    card: { id: "c1", taskNo: "1-가", title: "제목" },
    business: { no: 1, name: "대상사업" },
    task: { no: "1-1", title: "실행과제", bp: false },
    sub: { mark: "가", title: "소항목", markers: [] },
    rows: [],
    results: [],
    caption: "",
    blocks: [],
    module: 1,
    ...overrides,
  };
}

function block(overrides: Partial<Block> = {}): Block {
  return { kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...overrides };
}

function card(overrides: Partial<SubmitCard> = {}): SubmitCard {
  return { id: "c1", uid: "u1", taskNo: "1-가", title: "제목", included: true, pages: 1, dataRev: 1, draft: null, ...overrides };
}

// ---------------------------------------------------------------------------
// cardSubmitRow: 상태

test("cardSubmitRow: 초안 없음(draft null)은 none, 나머지 셈은 0", () => {
  const r = cardSubmitRow(card());
  assert.equal(r.state, "none");
  assert.equal(r.fitPct, null);
  assert.equal(r.needs, 0);
  assert.equal(r.figures, 0);
  assert.equal(r.unknown, 0);
  assert.equal(r.humanEdits, 0);
});

test("cardSubmitRow: 구성안만 있으면 outline(spec 없이 outlineOnly)", () => {
  const r = cardSubmitRow(card({ draft: { spec: null, sourceRev: null, unknownNumbers: [], outlineOnly: true } }));
  assert.equal(r.state, "outline");
});

test("cardSubmitRow: spec이 있고 sourceRev = dataRev면 draft, 다르면 stale(다시 만들기 권장)", () => {
  const fresh = cardSubmitRow(card({ dataRev: 3, draft: { spec: spec(), sourceRev: 3, unknownNumbers: [] } }));
  assert.equal(fresh.state, "draft");
  const stale = cardSubmitRow(card({ dataRev: 4, draft: { spec: spec(), sourceRev: 3, unknownNumbers: [] } }));
  assert.equal(stale.state, "stale");
});

test("cardSubmitRow: sourceRev·dataRev 어느 한쪽이 null이면 draft(다시 만들기 권장 아님)", () => {
  const a = cardSubmitRow(card({ dataRev: null, draft: { spec: spec(), sourceRev: 3, unknownNumbers: [] } }));
  assert.equal(a.state, "draft");
  const b = cardSubmitRow(card({ dataRev: 3, draft: { spec: spec(), sourceRev: null, unknownNumbers: [] } }));
  assert.equal(b.state, "draft");
});

test("cardSubmitRow: fitPct = 어림 ÷ 예산 × 100(반올림), 예산 0이면 null", () => {
  const r = cardSubmitRow(card({ draft: { spec: spec({ fit: { total: 110, budget: 100 } }), sourceRev: 1, unknownNumbers: [] } }));
  assert.equal(r.fitPct, 110);
  const half = cardSubmitRow(card({ draft: { spec: spec({ fit: { total: 33, budget: 32 } }), sourceRev: 1, unknownNumbers: [] } }));
  assert.equal(half.fitPct, 103);
  const noBudget = cardSubmitRow(card({ draft: { spec: spec({ fit: { total: 10, budget: 0 } }), sourceRev: 1, unknownNumbers: [] } }));
  assert.equal(noBudget.fitPct, null);
});

test("cardSubmitRow: needs = 블록 글 안 【확인: …】 자리표시 수(나온 순·중복 없음)", () => {
  const s = spec({ blocks: [block({ items: ["실적 【확인: ’26년 누적 건수】 달성", "【확인: ’26년 목표 대비】"] })] });
  const r = cardSubmitRow(card({ draft: { spec: s, sourceRev: 1, unknownNumbers: [] } }));
  assert.equal(r.needs, 2);
});

test("cardSubmitRow: figures = 블록마다 그림 자리표시 수 합계", () => {
  const s = spec({
    blocks: [
      block({ figures: [{ kind: "photo", desc: "현장 사진", pos: "right", size: "M" }] }),
      block({ figures: [{ kind: "logo", desc: "기관 로고", pos: "right", size: "M" }, { kind: "illust", desc: "삽화", pos: "left", size: "S" }] }),
    ],
  });
  const r = cardSubmitRow(card({ draft: { spec: s, sourceRev: 1, unknownNumbers: [] } }));
  assert.equal(r.figures, 3);
});

test("cardSubmitRow: unknown = spec이 있을 때만 unknownNumbers 길이(구성안만이면 0)", () => {
  const withSpec = cardSubmitRow(card({ draft: { spec: spec(), sourceRev: 1, unknownNumbers: ["45,000건"] } }));
  assert.equal(withSpec.unknown, 1);
  const outlineOnly = cardSubmitRow(card({ draft: { spec: null, sourceRev: null, unknownNumbers: ["45,000건"], outlineOnly: true } }));
  assert.equal(outlineOnly.unknown, 0);
});

test("cardSubmitRow: humanEdits = spec.humanEdits 길이", () => {
  const r = cardSubmitRow(card({ draft: { spec: spec({ humanEdits: [0, 2] }), sourceRev: 1, unknownNumbers: [] } }));
  assert.equal(r.humanEdits, 2);
});

// ---------------------------------------------------------------------------
// submitReadiness

const drafted = (taskNo: string, extra: Partial<ReportSectionSpec> = {}) =>
  card({ id: taskNo, uid: taskNo, taskNo, draft: { spec: spec(extra), sourceRev: 1, unknownNumbers: [] } });

test("submitReadiness: 목차에서 뺀 과제(included=false)는 셈에서 빠짐", () => {
  const r = submitReadiness([drafted("1-가"), card({ id: "2-나", uid: "2-나", taskNo: "2-나", included: false, draft: null })]);
  assert.equal(r.total, 1);
  assert.equal(r.drafted, 1);
  assert.equal(r.ready, true);
});

test("submitReadiness: 모두 초안이 있으면 ready, missing 없음", () => {
  const r = submitReadiness([drafted("1-가"), drafted("1-나")]);
  assert.equal(r.ready, true);
  assert.equal(r.total, 2);
  assert.equal(r.drafted, 2);
  assert.deepEqual(r.missing, []);
});

test("submitReadiness: 초안 없음·구성안만은 missing(순서 유지), ready false", () => {
  const none = card({ id: "1-가", uid: "1-가", taskNo: "1-가", draft: null });
  const outline = card({ id: "1-나", uid: "1-나", taskNo: "1-나", draft: { spec: null, sourceRev: null, unknownNumbers: [], outlineOnly: true } });
  const r = submitReadiness([none, outline, drafted("1-다")]);
  assert.equal(r.ready, false);
  assert.deepEqual(
    r.missing.map((m) => m.taskNo),
    ["1-가", "1-나"],
  );
  assert.equal(r.missing[0].state, "none");
  assert.equal(r.missing[1].state, "outline");
  assert.equal(r.drafted, 1);
});

test("submitReadiness: 과제가 하나도 없으면(또는 모두 빠지면) ready = false", () => {
  const r = submitReadiness([]);
  assert.equal(r.ready, false);
  assert.equal(r.total, 0);
  const excluded = submitReadiness([card({ id: "1-가", uid: "1-가", taskNo: "1-가", included: false, draft: null })]);
  assert.equal(excluded.ready, false);
  assert.equal(excluded.total, 0);
});

test("submitReadiness: 확인할 것 없으면 checks가 빈 배열", () => {
  const r = submitReadiness([drafted("1-가")]);
  assert.deepEqual(r.checks, []);
});

test("submitReadiness: 다시 만들기 권장(stale) 문구", () => {
  const stale = card({ id: "1-가", uid: "1-가", taskNo: "1-가", dataRev: 5, draft: { spec: spec(), sourceRev: 3, unknownNumbers: [] } });
  const r = submitReadiness([stale]);
  assert.equal(r.checks.length, 1);
  assert.match(r.checks[0], /^다시 만들기 권장 1건\(초안 뒤 원장이 바뀜\): 1-가$/);
});

test("submitReadiness: 채울 올해 값 【확인】 문구(건수 합계)", () => {
  const s = spec({ blocks: [block({ items: ["【확인: A】", "【확인: B】"] })] });
  const r = submitReadiness([card({ id: "1-가", uid: "1-가", taskNo: "1-가", draft: { spec: s, sourceRev: 1, unknownNumbers: [] } })]);
  assert.equal(r.checks.length, 1);
  assert.match(r.checks[0], /^채울 올해 값 【확인】 2곳: 1-가$/);
});

test("submitReadiness: 그림 자리 문구(건수 합계)", () => {
  const s = spec({ blocks: [block({ figures: [{ kind: "photo", desc: "사진", pos: "right", size: "M" }] })] });
  const r = submitReadiness([card({ id: "1-가", uid: "1-가", taskNo: "1-가", draft: { spec: s, sourceRev: 1, unknownNumbers: [] } })]);
  assert.equal(r.checks.length, 1);
  assert.match(r.checks[0], /^그림 자리 1곳\(사진·삽화를 넣을 곳\): 1-가$/);
});

test("submitReadiness: 근거에 없는 숫자 문구(건수 합계)", () => {
  const r = submitReadiness([card({ id: "1-가", uid: "1-가", taskNo: "1-가", draft: { spec: spec(), sourceRev: 1, unknownNumbers: ["45,000건", "97%"] } })]);
  assert.equal(r.checks.length, 1);
  assert.match(r.checks[0], /^근거에 없는 숫자 2개: 1-가$/);
});

test("submitReadiness: 판면 넘침 문구는 SUBMIT_OVER(104%) 넘을 때만", () => {
  const exact = card({ id: "1-가", uid: "1-가", taskNo: "1-가", draft: { spec: spec({ fit: { total: 104, budget: 100 } }), sourceRev: 1, unknownNumbers: [] } });
  const atLimit = submitReadiness([exact]);
  assert.deepEqual(atLimit.checks, [], `${SUBMIT_OVER * 100}%는 넘침이 아님`);

  const over = card({ id: "1-나", uid: "1-나", taskNo: "1-나", draft: { spec: spec({ fit: { total: 106, budget: 100 } }), sourceRev: 1, unknownNumbers: [] } });
  const r = submitReadiness([over]);
  assert.equal(r.checks.length, 1);
  assert.match(r.checks[0], /^판면 넘침 1건: 1-나 106%$/);
});

test("submitReadiness: 확인할 것이 여러 종류면 checks에 모두 줄지어 담김", () => {
  const s = spec({ blocks: [block({ items: ["【확인: A】"] })] });
  const rows: SubmitCard[] = [
    card({ id: "1-가", uid: "1-가", taskNo: "1-가", dataRev: 5, draft: { spec: spec(), sourceRev: 3, unknownNumbers: [] } }),
    card({ id: "1-나", uid: "1-나", taskNo: "1-나", draft: { spec: s, sourceRev: 1, unknownNumbers: [] } }),
  ];
  const r = submitReadiness(rows);
  assert.equal(r.checks.length, 2);
  assert.ok(r.checks.some((c) => c.startsWith("다시 만들기 권장")));
  assert.ok(r.checks.some((c) => c.startsWith("채울 올해 값")));
});

// ---------------------------------------------------------------------------
// submitBlockedReason

test("submitBlockedReason: 제출할 수 있으면 null", () => {
  const r = submitReadiness([drafted("1-가")]);
  assert.equal(submitBlockedReason(r), null);
});

test("submitBlockedReason: 과제가 하나도 없으면(목차에서 모두 빠짐)", () => {
  const r = submitReadiness([]);
  assert.equal(submitBlockedReason(r), "제출할 과제가 없습니다(목차에서 모두 빠짐).");
});

test("submitBlockedReason: 초안이 없는 과제 목록(구성안만은 표시를 붙임)", () => {
  const none = card({ id: "1-가", uid: "1-가", taskNo: "1-가", draft: null });
  const outline = card({ id: "1-나", uid: "1-나", taskNo: "1-나", draft: { spec: null, sourceRev: null, unknownNumbers: [], outlineOnly: true } });
  const r = submitReadiness([none, outline]);
  assert.equal(submitBlockedReason(r), "과제별 초안이 없는 과제 2건이 있어 제출할 수 없습니다: 1-가·1-나(구성안만)");
});

// ---------------------------------------------------------------------------
// 상수(DB check와 같은 값 — 회귀 방지)

test("REVIEW_NOTE_MAX: 성과관리팀 검토 메모 상한은 2000(reports.review_note check와 같음)", () => {
  assert.equal(REVIEW_NOTE_MAX, 2000);
});
