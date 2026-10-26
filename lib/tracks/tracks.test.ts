import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { type BundleChunk, layerOf } from "../knowledge/bundle.ts";
import { FORM_ID } from "../inspections/model.ts";
import { boardUnits } from "./board-units.ts";
import { BIZ_TRACK, DEFAULT_TRACK, MGMT_TRACK, TRACK_COOKIE, TRACK_SPECS, parseTrack, trackOfUnit, trackSpecOfUnit } from "./index.ts";
import { NO_PDCA_GUIDES } from "../testing/originals.ts";

const root = resolve(import.meta.dirname, "../..");

test("주요사업 스펙은 예전에 코드에 흩어져 있던 값 그대로(동작 무변경): 공통 지식 트랙·지침 사본·점검 양식, 기본 트랙은 주요사업", () => {
  assert.deepEqual(BIZ_TRACK, {
    id: "주요사업",
    knowledgeTracks: ["주요사업", "가점"],
    assistGuide: "09-assist-guide-biz.md",
    inspectionGuide: "14-inspection-guide-biz.md",
    inspectionForm: "biz14",
    sharedUnits: ["BZ-1", "BZ-2", "BZ-3"],
    unitParts: [],
  });
  assert.equal(DEFAULT_TRACK, BIZ_TRACK);
  assert.equal(FORM_ID, "biz14", "점검표 양식 id는 스펙에서 오지만 값은 DB에 저장된 그대로");
  assert.equal(TRACK_SPECS["주요사업"], BIZ_TRACK);
  assert.equal(TRACK_SPECS["경영관리"], MGMT_TRACK);
});

test("크기 보호 단위: 주요사업은 사업 BZ-1~3, 경영관리는 지표 MG-1~14(공통 지식 단위 — 카드 묶음 MG-G…가 아님)", () => {
  assert.deepEqual(BIZ_TRACK.sharedUnits, ["BZ-1", "BZ-2", "BZ-3"]);
  assert.equal(MGMT_TRACK.sharedUnits.length, 14);
  assert.deepEqual([MGMT_TRACK.sharedUnits[0], MGMT_TRACK.sharedUnits[13]], ["MG-1", "MG-14"]);
  for (const spec of Object.values(TRACK_SPECS)) for (const u of spec.sharedUnits) assert.equal(trackOfUnit(u), spec.id, `${u}는 ${spec.id}의 단위`);
});

test("카드 밖 부분 키(R5 — 두 트랙 공용 틀): 경영관리는 표지·지적·전년 대비·성과분석 순, 주요사업은 아직 없음", () => {
  assert.deepEqual(MGMT_TRACK.unitParts, ["cover", "findings", "prior", "outcome"]);
  assert.deepEqual(BIZ_TRACK.unitParts, []);
});

test("평가단위 → 트랙: 경영관리(MG-…)만 경영관리, BZ-1~4·모르는 값·빈 값은 주요사업", () => {
  for (const id of ["MG-G1", "MG-G5", "MG-1", "MG-14"]) assert.equal(trackOfUnit(id), "경영관리", id);
  for (const id of ["BZ-1", "BZ-2", "BZ-3", "BZ-4", "GA-1", "", "xyz"]) assert.equal(trackOfUnit(id), "주요사업", id);
  assert.equal(trackOfUnit(null), "주요사업");
  assert.equal(trackOfUnit(undefined), "주요사업");
  assert.equal(trackSpecOfUnit("MG-3"), MGMT_TRACK);
  assert.equal(trackSpecOfUnit("BZ-2"), BIZ_TRACK);
});

test("두 트랙이 가리키는 지침 사본은 모두 저장소에 있고, 서로 다른 파일(작성지원 08·09, 종합점검 13·14)", { skip: NO_PDCA_GUIDES }, () => {
  for (const spec of Object.values(TRACK_SPECS)) {
    assert.ok(existsSync(resolve(root, "resources/harness/pdca", spec.assistGuide)), spec.assistGuide);
    assert.ok(existsSync(resolve(root, "resources/harness/pdca", spec.inspectionGuide)), spec.inspectionGuide);
  }
  assert.notEqual(BIZ_TRACK.assistGuide, MGMT_TRACK.assistGuide);
  assert.notEqual(BIZ_TRACK.inspectionGuide, MGMT_TRACK.inspectionGuide);
  assert.notEqual(BIZ_TRACK.inspectionForm, MGMT_TRACK.inspectionForm);
});

const chunk = (key: string, over: Partial<BundleChunk> = {}): BundleChunk => ({ chunk_key: key, doc_id: "d", seq: 0, unit_type: "plan_section", track: "주요사업", business: null, title: key, text: key, context_prefix: null, meta: null, ...over });

test("층 판정은 평가단위의 트랙을 따라 그 트랙(과 가점)의 조각만 읽는다 — 주요사업 과제에는 경영관리 조각이 안 섞이고, 경영관리 단위에는 주요사업 조각이 안 섞임", () => {
  const biz = chunk("biz/inst");
  const mg = chunk("mg/inst", { track: "경영관리" });
  const bonus = chunk("bonus/1", { track: "가점" });
  assert.equal(layerOf(biz, "BZ-1"), "institution");
  assert.equal(layerOf(mg, "BZ-1"), null, "주요사업 과제에 경영관리 조각 없음(예전과 같음)");
  assert.equal(layerOf(bonus, "BZ-1"), "common");
  assert.equal(layerOf(mg, "MG-3"), "institution", "경영관리 단위는 경영관리 조각을 읽음");
  assert.equal(layerOf(biz, "MG-3"), null, "경영관리 단위에 주요사업 조각 없음");
  assert.equal(layerOf(bonus, "MG-3"), "common", "가점은 두 트랙 공통");
});

test("머리띠 트랙 전환(쿠키 pdca_track): 경영관리만 경영관리, 없거나 모르는 값은 기본(주요사업)", () => {
  assert.equal(TRACK_COOKIE, "pdca_track");
  assert.equal(parseTrack("경영관리"), "경영관리");
  assert.equal(parseTrack("주요사업"), "주요사업");
  for (const v of [undefined, null, "", "mgmt", "경영 관리", "<script>"]) assert.equal(parseTrack(v), DEFAULT_TRACK.id);
});

test("과제 목록의 평가단위 칩: 주요사업은 사업 BZ-1~3(카드 묶음 주요사업N), 경영관리는 지표 MG-1~14(칩 이름은 지표명)", () => {
  assert.deepEqual(boardUnits("주요사업").map((u) => [u.id, u.label]), [["BZ-1", "주요사업1"], ["BZ-2", "주요사업2"], ["BZ-3", "주요사업3"]]);
  const mg = boardUnits("경영관리");
  assert.equal(mg.length, 14);
  assert.deepEqual(mg[0], { id: "MG-1", label: "전략기획", name: "전략기획" });
  assert.ok(mg.every((u) => trackOfUnit(u.id) === "경영관리"), "경영관리 칩의 단위는 모두 경영관리 트랙");
});
