// 공통 지식 구성원 판정(lib/auth/access.ts isKnowledgeMember) 시험 — DB private.is_member()(20261110100000)와 같은 규칙(2026-11-10 T3 리뷰 T4-R1).
// 막는 회귀: 팀 없는 부서 담당자가 공통 지식 화면의 공용 캐시를 RLS 빈 결과로 채워 5분간 모든 사람의 집계가 비던 것, 그 사람에게 이유 없는 빈 화면.

import assert from "node:assert/strict";
import { test } from "node:test";
import { isKnowledgeMember } from "./access.ts";

const team = { id: 1, name: "검사기획팀", hq: null };

test("공통 지식 구성원: 성과관리팀·관리자는 팀이 없어도, 부서 담당자는 팀이 있을 때만", () => {
  assert.equal(isKnowledgeMember({ role: "pmo", team: null }), true);
  assert.equal(isKnowledgeMember({ role: "admin", team: null }), true);
  assert.equal(isKnowledgeMember({ role: "dept_user", team }), true);
  assert.equal(isKnowledgeMember({ role: "dept_user", team: null }), false, "팀 없는 부서 담당자(첫 로그인·db:user --team 없이)");
});
