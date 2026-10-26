// 목록 즉시 검색(matchesQuery)을 실제 카드 59장으로 확인합니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CardRow } from "./queries.ts";
import { BUSINESSES, businessByCardGroup } from "../knowledge/dictionaries.ts";
import { matchesQuery } from "./board-view.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const cards = seedCards();
const rows: CardRow[] = cards.map((c) => {
  const unit = businessByCardGroup(c.group)!;
  return {
    id: c.id,
    uid: c.id,
    evalUnitId: unit,
    business: BUSINESSES.find((b) => b.id === unit)!.name2026,
    taskNo: c.taskNo,
    title: c.title,
    department: c.department,
    teamId: null,
    team: c.team,
    person: [c.manager, c.writer].filter(Boolean).join(" / "),
    kind: c.overview.checks.new || c.tags.new ? "신규과제" : c.overview.checks.advanced ? "고도화과제" : null,
    stage: null,
    progress: null,
    workStatus: "진행중",
    inspection: null,
    updatedAt: "2026-09-25T00:00:00Z",
    fixedLocked: false,
  };
});
const hits = (q: string) => rows.filter((r) => matchesQuery(r, q));

test("검색: 과제명·부서·팀·담당자·대상사업·과제번호·과제구분", { skip: NO_SEED_CARDS }, () => {
  assert.deepEqual(hits("안테나").map((r) => r.id), ["주요사업1/1-가"]);
  assert.equal(hits("검사기획팀").length, rows.filter((r) => r.team === "검사기획팀").length);
  assert.equal(hits("전파기반본부").length, rows.filter((r) => r.department === "전파기반본부").length);
  // 담당자 이름은 원본에서 읽음(실명을 시험 글에 적지 않음 — 공개 저장소)
  const manager = String(cards.find((c) => c.id === "주요사업1/1-가")!.manager).split(" ")[0];
  assert.ok(hits(manager).some((r) => r.id === "주요사업1/1-가"));
  assert.equal(hits("국민안전 편익서비스").length, rows.filter((r) => r.evalUnitId === "BZ-2").length);
  assert.equal(hits("1-가").length, 3);
  assert.equal(hits("신규과제").length, rows.filter((r) => r.kind === "신규과제").length);
  assert.equal(hits("").length, 59);
});

test("검색: 띄어쓰기·가운뎃점 변종·대소문자·여러 낱말(AND)", { skip: NO_SEED_CARDS }, () => {
  assert.deepEqual(hits("안 테 나").map((r) => r.id), ["주요사업1/1-가"]);
  const dot = rows.find((r) => /[·･]/.test(r.title))!;
  const variant = dot.title.replace(/[·･]/g, "‧");
  assert.ok(hits(variant).some((r) => r.id === dot.id));
  assert.ok(hits("ai").length > 0 && hits("ai").length === hits("AI").length);
  const both = hits("검사기획팀 안테나");
  assert.deepEqual(both.map((r) => r.id), ["주요사업1/1-가"]);
  assert.equal(hits("검사기획팀 방송").length, 0);
});
