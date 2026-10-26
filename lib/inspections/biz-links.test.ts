import assert from "node:assert/strict";
import { test } from "node:test";
import { BIZ_LINK_MAX, type BizLedgerCard, bizTaskId, bizTaskIdsIn, parseLinkIndex, pickBizLinks } from "./biz-links.ts";
import { NO_PDCA_GUIDES, pdcaGuide } from "../testing/originals.ts";

const guide13 = pdcaGuide("13-inspection-guide-mg.md");

test("연계 색인: 지침 13 사본의 모든 행이 지표로 풀리고(모르는 이름 없음) 번호가 지침과 같음", { skip: NO_PDCA_GUIDES }, () => {
  const rows = parseLinkIndex(guide13);
  assert.equal(rows.length, 12);
  for (const r of rows) assert.ok(r.known, `지표 사전이 모르는 색인 이름: ${r.name} — dictionaries-mg.ts에 별칭을 더하세요`);
  assert.deepEqual(
    rows.map((r) => [r.name, r.unit, r.ids.length]),
    [
      ["전략기획", "MG-1", 4],
      ["윤리경영", "MG-2", 2],
      ["국민소통", null, 2], // 카드가 없는 평가 항목 — 쓰이지 않음
      ["일자리 및 균등한 기회", "MG-3", 3],
      ["안전 및 재난관리", "MG-4", 15],
      ["친환경·탄소중립", "MG-5", 3],
      ["창업 및 경제활성화", "MG-6", 4],
      ["상생·협력 및 지역발전", "MG-7", 3], // 「총괄표 【지역과제】 표시 과제 전체」는 번호가 없어 건너뜀
      ["재무예산관리", "MG-8", 4],
      ["가점 안전한 일터 조성", "MG-12", 2],
      ["가점 AI 활용 혁신", "MG-13", 18],
      ["가점 국정과제 등 핵심정책 이행", "MG-14", 2], // 「모든 카드의 '전략 연계성' 국정과제 번호」는 건너뜀
    ],
  );
  const by = (u: string) => rows.find((r) => r.unit === u)!.ids;
  assert.deepEqual(by("MG-1"), ["주요사업1 1-라", "주요사업1 9-나", "주요사업1 1-나", "주요사업2 6-나"], "앞 접두가 이어지는 「1-라·9-나」");
  assert.deepEqual(by("MG-2"), ["주요사업3 7-가", "주요사업3 7-나"], "괄호 설명을 건너 접두가 이어짐");
  assert.deepEqual(by("MG-12"), ["주요사업2 3-라", "주요사업1 1-가"]);
  assert.deepEqual(by("MG-13").slice(0, 4), ["주요사업1 1-가", "주요사업1 1-나", "주요사업1 5-가", "주요사업1 8-가"], "「표시 과제 전체(…)」 괄호 안 번호도");
  assert.deepEqual(by("MG-13").slice(-3), ["주요사업2 1-다", "주요사업2 4-다", "주요사업3 6-나"], "AI 본 과제");
  assert.deepEqual(by("MG-4").slice(-2), ["주요사업2 3-라", "주요사업1 1-가"], "재난 / 산업재해·근로자 두 묶음");
  for (const no of [9, 10, 11]) assert.ok(!rows.some((r) => r.unit === `MG-${no}`), `지표 ${no}는 색인 행 없음(억지로 연결하지 않음)`);
});

test("과제번호 찾기: 접두가 이어지는 표기·괄호 설명은 잇고, 다른 글이 끼면 끊음", () => {
  assert.deepEqual(bizTaskIdsIn("주요사업2 3-라(SafeVision)·4-가 및 5-나와 주요사업 1 1-가"), ["주요사업2 3-라", "주요사업2 4-가", "주요사업2 5-나", "주요사업1 1-가"]);
  assert.deepEqual(bizTaskIdsIn("주요사업2 3-라 성과를 반영. 추진내용 1-가 항목"), ["주요사업2 3-라"], "경영관리 카드의 다른 번호(1-가)는 잡지 않음");
  assert.deepEqual(bizTaskIdsIn("13-4 과제, 2-가능성"), [], "접두 없는 번호·「가능」 같은 낱말은 안 잡음");
  assert.deepEqual(bizTaskIdsIn("주요사업1 1-가 / 주요사업1 1-가"), ["주요사업1 1-가"], "같은 번호는 한 번");
  assert.equal(bizTaskId({ group: "주요사업2", taskNo: "3-라" }), "주요사업2 3-라");
  assert.equal(bizTaskId({ group: "경영관리13", taskNo: "13-4" }), null);
});

const biz = (id: string, title: string, body = ""): BizLedgerCard => {
  const [group, taskNo] = id.split(" ");
  return { id, title, dept: "부서(팀)", asOf: "’26.9.16. 판(그 뒤 원장 수정 없음)", data: { group, taskNo, title, do: { lines: [body] } } };
};

test("후보 고르기: 인용(a) → 색인(b) → 글자 겹침(c) 순, 같은 카드는 한 번(이유를 모음), 원장에 없는 번호는 건너뜀", { skip: NO_PDCA_GUIDES }, () => {
  const ledger = [
    biz("주요사업1 1-가", "안테나 자동판독", "무선국 검사 안전"),
    biz("주요사업2 3-라", "무선국 검사 전주기 안전관리체계", "현장 근로자 안전 SafeVision"),
    biz("주요사업3 6-가", "자산운용관리 체계", "기금 자산운용"),
    biz("주요사업2 8-가", "국민참여형 소통", "대국민 소통 채널"),
  ];
  const index = parseLinkIndex(guide13);
  const mg = { group: "경영관리12", taskNo: "12-1", title: "협력업체 근로자 안전보건 체계", do: { lines: ["주요사업2 3-라 SafeVision 실적 인용", "주요사업2 9-가 협업"] } };
  const pack = pickBizLinks(mg, ledger, index, "MG-12");
  assert.equal(pack.task, "12-1");
  assert.equal(pack.cards[0].id, "주요사업2 3-라");
  assert.deepEqual(pack.cards[0].reasons.slice(0, 2), ["a", "b"], "인용이 맨 앞, 색인 이유도 함께");
  assert.equal(pack.cards[1].id, "주요사업1 1-가");
  assert.equal(new Set(pack.cards.map((c) => c.id)).size, pack.cards.length, "중복 없음");
  assert.ok(pack.cards.length <= 2 + 3);
  assert.deepEqual(pack.unknownCited, ["주요사업2 9-가"], "원장에 없는 인용 번호는 알림용으로만");
  assert.ok(pack.indexed);
  assert.match(pack.cards[0].text, /현장 근로자 안전 SafeVision/, "본문은 원장 카드 풀이 글 그대로");
  assert.match(pack.cards[0].text, /^## 과제 기본정보/);
  assert.deepEqual(pickBizLinks(mg, ledger, index, "MG-12"), pack, "같은 입력이면 같은 결과");
});

test("후보 고르기: 본문은 10장까지, 넘친 색인 과제는 번호·과제명 목록만, 색인 행이 없는 지표는 인용·글자 겹침만", { skip: NO_PDCA_GUIDES }, () => {
  const index = parseLinkIndex(guide13);
  const ax = index.find((r) => r.unit === "MG-13")!.ids;
  const ledger = ax.map((id, i) => biz(id, `과제 ${i}`, `본문 ${i}`));
  const pack = pickBizLinks({ group: "경영관리13", taskNo: "13-4", title: "AI 활용", do: { lines: [] } }, ledger, index, "MG-13");
  assert.equal(pack.cards.length, BIZ_LINK_MAX);
  assert.deepEqual(
    pack.cards.map((c) => c.id),
    ax.slice(0, BIZ_LINK_MAX),
    "색인 순서",
  );
  assert.deepEqual(
    pack.more.map((m) => m.id),
    ax.slice(BIZ_LINK_MAX),
  );
  assert.equal(pack.more[0].title, `과제 ${BIZ_LINK_MAX}`);
  const labor = pickBizLinks({ group: "경영관리10", taskNo: "10-1", title: "노사 협력", do: { lines: ["노사 협력 소통"] } }, [biz("주요사업2 8-가", "국민참여형 소통", "대국민 소통 협력"), biz("주요사업1 1-가", "안테나", "검사")], index, "MG-10");
  assert.equal(labor.indexed, false);
  assert.ok(labor.cards.every((c) => c.reasons.join("") === "c"), "색인 없는 지표는 글자 겹침만");
  assert.ok(labor.cards.length <= 3);
  assert.deepEqual(labor.more, []);
});
