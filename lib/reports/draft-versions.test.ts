// 경평 초안 「판 기록」 순수 부분(lib/reports/draft-versions.ts) 시험 — 목록 정리·되돌리기 판정·되쓸 행, 마이그레이션 트리거와 같은 값(머리글·상한·묶음 시간)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import type { ReportSectionSpec } from "./section.ts";
import { DRAFT_SAVE_HEADER, DRAFT_TEXT_MERGE_MINUTES, DRAFT_VERSION_KEEP, type DraftVersionListRow, RESTORE_COLS, RESTORE_SELECT, VERSION_LIST_COLS, restoreBlockReason, restoreRow, versionItems, versionSummary } from "./draft-versions.ts";

const MIGRATION = readFileSync(join(resolve(import.meta.dirname, "../.."), "supabase/migrations/20261118120000_report_draft_versions.sql"), "utf8");

const block = (over: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...over });
const spec = (): ReportSectionSpec => ({
  version: 3,
  card: { id: "주요사업3/3-나", taskNo: "3-나", title: "가짜 지원사업" },
  business: { no: 3, name: "가짜 대상사업" },
  task: { no: "3-1", title: "가짜 실행과제", bp: false },
  sub: { mark: "나", title: "현장 지원 확대", markers: [] },
  rows: [],
  blocks: [block({ label: "추진성과", items: ["현장 컨설팅 지원"] })],
  results: [],
  caption: "",
  module: 1,
});

test("트리거와 같은 값: 머리글 이름·저장 종류·보관 상한·직접 고침 묶음 시간", () => {
  assert.match(MIGRATION, new RegExp(`->> '${DRAFT_SAVE_HEADER}'`), "트리거가 같은 머리글을 읽음");
  assert.match(MIGRATION, /v_kind not in \('text', 'restore'\)/);
  assert.match(MIGRATION, /save_kind text check \(save_kind in \('text', 'restore'\)\)/);
  assert.match(MIGRATION, new RegExp(`limit ${DRAFT_VERSION_KEEP}\\b`), "보관 상한");
  assert.match(MIGRATION, new RegExp(`now\\(\\) - interval '${DRAFT_TEXT_MERGE_MINUTES} minutes'`), "묶음 시간");
});

test("되돌릴 칸 = 판 표에 남기는 칸(트리거가 넣는 열과 같음), 조회 글자도 같음", () => {
  assert.equal(RESTORE_SELECT, RESTORE_COLS.join(", "));
  const insert = /insert into public\.card_report_draft_versions \(([^)]*)\)/.exec(MIGRATION)?.[1].split(",").map((x) => x.trim()) ?? [];
  for (const c of RESTORE_COLS) assert.ok(insert.includes(c), `트리거가 ${c}를 남김`);
  for (const c of VERSION_LIST_COLS.split(",").map((x) => x.trim())) assert.match(MIGRATION, new RegExp(`\\n  ${c} `), `목록 열 ${c}가 표에 있음`);
});

test("판 목록 정리: 덮은 사람 이름(못 읽으면 나·다른 사용자, 사람 없으면 관리 작업)·바뀐 것·요약", () => {
  const row = (over: Partial<DraftVersionListRow>): DraftVersionListRow => ({ id: 1, state_at: "2026-11-18T01:00:00Z", replaced_by: "u1", replaced_at: "2026-11-18T02:00:00Z", changed: "draft", save_kind: null, block_count: 7, warnings: ["a", "b"], unknown_numbers: ["1"], outline_status: "approved", ...over });
  const items = versionItems(
    [row({}), row({ id: 2, replaced_by: "me", changed: "outline", save_kind: "text", block_count: null, warnings: [], unknown_numbers: [], outline_status: "draft" }), row({ id: 3, replaced_by: "u9", changed: "both", save_kind: "restore" }), row({ id: 4, replaced_by: null, changed: "이상한 값", save_kind: "zzz", outline_status: null })],
    new Map([["u1", "홍길동"]]),
    "me",
  );
  assert.deepEqual(
    items.map((x) => [x.id, x.who, x.changed, x.changedLabel, x.saveKind]),
    [
      [1, "홍길동", "draft", "초안", null],
      [2, "나", "outline", "구성안", "text"],
      [3, "다른 사용자", "both", "초안·구성안", "restore"],
      [4, "관리 작업", "draft", "초안", null],
    ],
  );
  assert.equal(items[0].summary, "블록 7 · 경고 2 · 없는 숫자 1 · 구성안 승인");
  assert.equal(items[1].summary, "초안 없음 · 구성안 확인 전");
  assert.equal(versionSummary({ blocks: 3, warnings: 0, unknown: 0, outline: null }), "블록 3");
});

test("되돌리기 판정: 읽기 전용 보기 → 보관 → 잠금(제출·승인 — 성과관리팀도) → 쓰기 권한 순서, 다 지나면 null", () => {
  const ok = { preview: false, active: true, locked: false, canWrite: true };
  assert.equal(restoreBlockReason(ok), null);
  assert.match(restoreBlockReason({ ...ok, preview: true, locked: true }) ?? "", /읽기 전용/);
  assert.match(restoreBlockReason({ ...ok, active: false }) ?? "", /보관/);
  assert.match(restoreBlockReason({ ...ok, locked: true }) ?? "", /제출·승인/);
  assert.match(restoreBlockReason({ ...ok, canWrite: false }) ?? "", /권한/);
});

test("되쓸 행: 판 내용 칸만(식별·시각·덮은 사람 칸은 빼고), 판 spec은 지금 읽기 검사를 지나야 함, 구성안만 있던 판도 됨", () => {
  const full = { id: 9, card_id: "c", year: 2026, state_at: "t", replaced_by: "u", spec: spec(), warnings: ["w"], unknown_numbers: ["1"], model: "m", source_rev: 3, outline: { version: 1 }, outline_status: "approved", outline_warnings: [], outline_model: "om", outline_at: "t1", outline_approved_by: "u2", outline_approved_at: "t2" };
  const r = restoreRow(full);
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.row).sort(), [...RESTORE_COLS].sort());
  assert.deepEqual([r.row.spec, r.row.model, r.row.source_rev, r.row.outline_status, r.row.outline_approved_by], [full.spec, "m", 3, "approved", "u2"]);
  // 구성안만 있던 판(spec null) — 초안은 비워 되돌림
  const outlineOnly = restoreRow({ ...full, spec: null, warnings: null, unknown_numbers: null });
  assert.ok(outlineOnly.ok);
  assert.deepEqual([outlineOnly.row.spec, outlineOnly.row.warnings, outlineOnly.row.unknown_numbers], [null, [], []], "not null 칸은 빈 값으로");
  // 초안도 구성안도 없으면 거절
  assert.equal(restoreRow({ ...full, spec: null, outline: null }).ok, false);
  // 지금 앱이 못 읽는 판(판 번호가 다름·블록 목록이 없음)과 모양이 깨진 판은 거절
  for (const bad of [{ version: 9, rows: [] }, { version: 3, rows: [] }, { ...spec(), blocks: [null] }, { ...spec(), sub: null }]) {
    const x = restoreRow({ ...full, spec: bad });
    assert.equal(x.ok, false, JSON.stringify(bad).slice(0, 60));
    assert.match(!x.ok ? x.message : "", /읽지 못해 되돌리지 않습니다/);
  }
});
