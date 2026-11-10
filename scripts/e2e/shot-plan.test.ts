// 캡처 계획 검증(shot-plan.mjs): 정상 계획·옛 배열 형식·클릭 금지어·who/steps/marks 모양 오류. 시험 데이터는 모두 가상.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CARD_PSEUDO, cleanupTable, forbiddenClick, formatWrites, loadPlan, parseCardRef, personMaskPairs, planWrites, validatePlan } from "./shot-plan.mjs";

const good = {
  out: "data/manual/x/shots",
  team: "가상팀",
  track: "경영관리",
  assign: [["MG-1", "1-1"]],
  shots: [
    ["anon", "/login", "1-1-login", { marks: [{ n: 1, target: { label: "기관 메일" } }] }],
    [
      "dept",
      "/my?peek={{uid:MG-1:1-1}}",
      "2-1-peek",
      {
        click: "초안 열기",
        steps: [
          { click: "월별 실적" },
          { click: { role: "button", name: "기간", nth: 1 } },
          { eval: "sessionStorage.setItem('a','b')" },
          { wait: 300 },
          { reload: true },
          { waitFor: { text: "카드" } },
          { scrollTo: { css: "#x" } },
          { key: "Escape" },
          { dragSelect: { text: "글" } },
          { dragSelect: { css: ".c" } },
        ],
        marks: [{ n: 1, targets: [{ text: "a" }, { placeholder: "b", exact: true }], pad: 6, badge: "br" }],
      },
    ],
  ],
};
const bad = (plan: unknown) => validatePlan(plan);

test("정상 계획은 오류가 없음", () => {
  assert.deepEqual(validatePlan(good), []);
});

test("옛 배열 형식은 {shots}로 정규화되어 통과", () => {
  const plan = loadPlan(JSON.stringify([["dept", "/my", "dept-my"], ["pmo", "/cards", "c", { full: true }]]));
  assert.equal(plan.shots.length, 2);
  assert.deepEqual(validatePlan(plan), []);
});

test("loadPlan: JSON 객체 문자열과 @파일", () => {
  assert.equal(loadPlan(JSON.stringify(good)).team, "가상팀");
  const f = join(mkdtempSync(join(tmpdir(), "shotplan-")), "p.json");
  writeFileSync(f, JSON.stringify(good));
  assert.equal(loadPlan(`@${f}`).shots.length, 2);
  assert.throws(() => loadPlan("not json"));
  assert.throws(() => loadPlan("{깨진"));
});

test("금지어 클릭 거부: 옛 click·steps.click(글·대상)", () => {
  for (const w of ["확정", "로그인 메일 받기", "카드에 반영", "저장", "승인하고 집필", "요청 보내기"]) {
    assert.ok(bad({ shots: [["dept", "/my", "a", { click: w }]] }).some((e) => e.includes("금지어")), `click ${w}`);
    assert.ok(bad({ shots: [["dept", "/my", "a", { steps: [{ click: `${w} 단추` }] }]] }).some((e) => e.includes("금지어")), `steps ${w}`);
  }
  assert.ok(bad({ shots: [["dept", "/my", "a", { steps: [{ click: { role: "button", name: "삭제" } }] }]] }).some((e) => e.includes("금지어")));
  assert.deepEqual(bad({ shots: [["dept", "/my", "a", { steps: [{ click: "초안 열기" }] }]] }), []);
});

test("알 수 없는 who·path·name·겹친 name", () => {
  assert.ok(bad({ shots: [["boss", "/my", "a"]] }).some((e) => e.includes("who")));
  assert.ok(bad({ shots: [["dept", "my", "a"]] }).some((e) => e.includes("path")));
  assert.ok(bad({ shots: [["dept", "/my", "한글"]] }).some((e) => e.includes("name")));
  assert.ok(bad({ shots: [["dept", "/my", "a"], ["pmo", "/my", "a"]] }).some((e) => e.includes("겹")));
  assert.ok(bad({ shots: [] }).length > 0);
  assert.ok(bad({ shots: [["dept", "/my"]] }).length > 0);
});

test("steps 모양 오류", () => {
  const steps = (s: unknown) => bad({ shots: [["dept", "/my", "a", { steps: s }]] });
  assert.ok(steps("x").length > 0);
  assert.ok(steps([{ jump: 1 }]).some((e) => e.includes("알 수 없는")));
  assert.ok(steps([{ wait: "1" }]).length > 0);
  assert.ok(steps([{ click: "가", wait: 1 }]).length > 0);
  assert.ok(steps([{ waitFor: { text: "a", css: "b" } }]).length > 0);
  assert.ok(steps([{ dragSelect: {} }]).length > 0);
  assert.ok(steps([{ scrollTo: { role: "button" } }]).some((e) => e.includes("name")));
  assert.ok(steps([{ waitFor: { text: "a", nth: -1 } }]).length > 0);
});

test("marks 모양 오류", () => {
  const marks = (m: unknown) => bad({ shots: [["dept", "/my", "a", { marks: m }]] });
  assert.ok(marks({}).length > 0);
  assert.ok(marks([{ n: 0, target: { text: "a" } }]).length > 0);
  assert.ok(marks([{ n: 1 }]).length > 0);
  assert.ok(marks([{ n: 1, target: { text: "a" }, targets: [{ text: "b" }] }]).length > 0);
  assert.ok(marks([{ n: 1, targets: [] }]).length > 0);
  assert.ok(marks([{ n: 1, target: { text: "a" }, badge: "zz" }]).length > 0);
  assert.ok(marks([{ n: 1, target: { text: "a" }, pad: -1 }]).length > 0);
});

test("assign은 team이 있어야 하고 쌍 모양이어야 함", () => {
  assert.ok(bad({ assign: [["MG-1", "1-1"]], shots: [["dept", "/my", "a"]] }).some((e) => e.includes("team")));
  assert.ok(bad({ team: "가상팀", assign: [["MG-1"]], shots: [["dept", "/my", "a"]] }).length > 0);
});

test("viewport: 양의 정수 둘이면 통과, 아니면 오류", () => {
  const vp = (v: unknown) => bad({ shots: [["dept", "/my", "a", { viewport: v }]] });
  assert.deepEqual(vp({ width: 1440, height: 1500 }), []);
  assert.ok(vp(1440).length > 0);
  assert.ok(vp({ width: 1440 }).length > 0);
  assert.ok(vp({ width: 0, height: 900 }).length > 0);
  assert.ok(vp({ width: 1440.5, height: 900 }).length > 0);
  assert.ok(vp({ width: "1440", height: 900 }).length > 0);
  assert.ok(vp({ width: 1440, height: 900, scale: 2 }).length > 0);
});

test("personMaskPairs: 직함 있는 이름·공백 있는 이름·직함 없는 이름", () => {
  assert.deepEqual(personMaskPairs("가나다 팀장", "송도윤"), [["가나다 팀장", "송도윤 팀장"], ["가나다", "송도윤"]]);
  assert.deepEqual(personMaskPairs("가 나 다 팀장", "송도윤"), [["가 나 다 팀장", "송도윤 팀장"], ["가 나 다", "송도윤"], ["가나다", "송도윤"]]);
  assert.deepEqual(personMaskPairs("가나다팀장", "송도윤"), [["가나다팀장", "송도윤 팀장"], ["가나다", "송도윤"]]);
  assert.deepEqual(personMaskPairs("가나다", "송도윤"), [["가나다", "송도윤"]]);
});

test("personMaskPairs: 여러 사람은 각각, 이름 길이·글자 조건, 빈 값", () => {
  const alias = (n: string) => (n === "가나다" ? "송도윤" : "문하윤");
  assert.deepEqual(personMaskPairs("가나다 팀장 / 라마바 과장, 사아자 대리", alias).map((p) => p[1]), [
    "송도윤 팀장", "송도윤", "문하윤 과장", "문하윤", "문하윤 대리", "문하윤",
  ]);
  assert.deepEqual(personMaskPairs("가 팀장", "송도윤"), []);
  assert.deepEqual(personMaskPairs("가나다라마 팀장", "송도윤"), []);
  assert.deepEqual(personMaskPairs("ABC 팀장", "송도윤"), []);
  assert.deepEqual(personMaskPairs("", "송도윤"), []);
  assert.deepEqual(personMaskPairs(null, "송도윤"), []);
});

test("personMaskPairs: 같은 값 중복 없음, 가상 이름은 프로필용과 안 겹침", () => {
  const ps = personMaskPairs("가나다 팀장 / 가나다 팀장", "송도윤");
  assert.equal(ps.length, new Set(ps.map((p) => p[0])).size);
  assert.equal(new Set(CARD_PSEUDO).size, CARD_PSEUDO.length);
  for (const n of ["김가온", "이나래", "박다솜", "최라온", "정마루", "한소람", "오두리", "윤하늘", "강보람", "임새롬"]) assert.ok(!CARD_PSEUDO.includes(n));
});

test("클릭 허용: 「확정(원장 반영)」은 정확히 그 이름일 때만(글·대상 모두)", () => {
  assert.equal(forbiddenClick("확정(원장 반영)"), null);
  assert.equal(forbiddenClick(" 확정(원장 반영) "), null);
  assert.deepEqual(bad({ shots: [["dept", "/my", "a", { steps: [{ click: "확정(원장 반영)" }] }]] }), []);
  assert.deepEqual(bad({ shots: [["dept", "/my", "a", { steps: [{ click: { role: "button", name: "확정(원장 반영)" } }] }]] }), []);
  // 창 안의 「확정」, 이름이 더 긴 것, css로 고른 것은 금지
  for (const name of ["확정", "확정(원장 반영) 확인", "확정 취소", "선택한 과제로 확정"]) assert.ok(forbiddenClick(name), name);
  assert.ok(bad({ shots: [["dept", "/my", "a", { steps: [{ click: { css: 'dialog[open] button:text-is("확정")' } }] }]] }).some((e) => e.includes("금지어")));
});

test("클릭 금지: 확인·반영·보내기·요청·삭제·승인·AI 미리보기·메일·지우기", () => {
  for (const name of [
    "확인했습니다", "카드에 반영", "실적 반영 요청", "보완 점검 요청", "구성안 다시 만들기 요청", "구성안 만들기 요청", "질문 보내기", "AI에 보내기",
    "삭제", "승인하고 집필", "승인하고 다시 집필", "자료 반영 고치기", "바로 만들기", "다른 모양", "이 모양으로 바꾸기", "기록 지우기", "다시 받기", "고친 내용 저장",
  ]) {
    assert.ok(forbiddenClick(name), name);
    assert.ok(bad({ shots: [["dept", "/my", "a", { steps: [{ click: { role: "button", name } }] }]] }).some((e) => e.includes("금지어")), name);
  }
  // 화면 상태만 바꾸는 클릭은 허용
  for (const name of ["구성안", "질문", "실적 반영", "인용한 근거", "확인할 것", "초안 열기", "구성안 고치기", "파일 첨부", "점검 결과"]) assert.equal(forbiddenClick(name), null, name);
});

const fixturePlan = (shots: unknown[], extra: Record<string, unknown> = {}) => ({ team: "가상팀", assign: [["MG-1", "1-1"], ["MG-1", "1-2"]], fixtures: [["MG-1", "1-1"]], shots, ...extra });
const UID = "{{uid:MG-1:1-1}}";

test("새 단계 type·upload·seedInspection: 정상 모양은 통과", () => {
  const plan = fixturePlan([
    ["dept", `/my?peek=${UID}`, "a", { steps: [{ type: "." }, { upload: { target: { role: "button", name: "파일 첨부" }, file: "data/x/sample.pdf", done: { text: "카드 자료" } } }] }],
    ["dept", "/my/inspections", "b", { steps: [{ seedInspection: { card: "MG-1:1-1", period: "2026-11" } }, { reload: true }] }],
  ]);
  assert.deepEqual(validatePlan(plan), []);
  assert.deepEqual(validatePlan(plan, { fileExists: () => true }), []);
  assert.ok(validatePlan(plan, { fileExists: () => false }).some((e) => e.includes("파일이 없습니다")));
});

test("새 단계 모양 오류", () => {
  const one = (st: unknown) => validatePlan(fixturePlan([["dept", `/my?peek=${UID}`, "a", { steps: [st] }]]));
  assert.ok(one({ type: "" }).length > 0);
  assert.ok(one({ upload: { file: "a.pdf" } }).length > 0);
  assert.ok(one({ upload: { target: { text: "x" }, file: "/abs/a.pdf" } }).some((e) => e.includes("상대 경로")));
  assert.ok(one({ upload: { target: { text: "x" }, file: "../a.pdf" } }).some((e) => e.includes("상대 경로")));
  assert.ok(one({ upload: { target: { text: "x" }, file: "a.pdf", extra: 1 } }).some((e) => e.includes("알 수 없는 키")));
  assert.ok(one({ seedInspection: { card: "MG-1 1-1" } }).some((e) => e.includes("card")));
  assert.ok(one({ seedInspection: { card: "MG-1:1-1", period: "2026-13" } }).some((e) => e.includes("period")));
  assert.deepEqual(parseCardRef("MG-13:13-4"), ["MG-13", "13-4"]);
  assert.equal(parseCardRef("MG-13"), null);
});

test("fixtures: assign 안의 카드만, 쓰는 단계는 fixtures 카드에만", () => {
  assert.ok(validatePlan(fixturePlan([["dept", "/my", "a"]], { fixtures: [["MG-9", "9-1"]] })).some((e) => e.includes("assign에 없는")));
  assert.ok(validatePlan(fixturePlan([["dept", "/my", "a"]], { fixtures: [] })).some((e) => e.includes("fixtures")));
  // fixtures 없이 쓰는 단계
  assert.ok(validatePlan({ shots: [["dept", `/my?peek=${UID}`, "a", { steps: [{ type: "." }] }]] }).some((e) => e.includes("fixtures 카드")));
  // 화면 주소의 카드가 fixtures가 아님 · 주소에 카드가 없음
  assert.ok(validatePlan(fixturePlan([["dept", "/my?peek={{uid:MG-1:1-2}}", "a", { steps: [{ type: "." }] }]])).some((e) => e.includes("fixtures 카드")));
  assert.ok(validatePlan(fixturePlan([["dept", "/my", "a", { steps: [{ upload: { target: { text: "x" }, file: "a.pdf" } }] }]])).some((e) => e.includes("fixtures 카드")));
  // 점검표: fixtures 밖 카드 · 같은 카드·점검월 두 번
  assert.ok(validatePlan(fixturePlan([["dept", "/my", "a", { steps: [{ seedInspection: { card: "MG-1:1-2" } }] }]])).some((e) => e.includes("fixtures에 없는")));
  const twice = { seedInspection: { card: "MG-1:1-1", period: "2026-11" } };
  assert.ok(validatePlan(fixturePlan([["dept", "/my", "a", { steps: [twice, twice] }]])).some((e) => e.includes("겹칩니다")));
});

test("planWrites·formatWrites: 계정·담당·작성본·점검표·자료·멈춤 조건", () => {
  const plan = fixturePlan([
    ["dept", `/my?peek=${UID}`, "edit", { steps: [{ type: "." }] }],
    ["dept", `/my?peek=${UID}`, "up", { steps: [{ upload: { target: { text: "x" }, file: "data/x/sample.pdf" } }] }],
    ["dept", "/my/inspections", "ins", { steps: [{ seedInspection: { card: "MG-1:1-1" } }] }],
  ]);
  const w = planWrites(plan, "2026-11");
  assert.deepEqual(w.accounts.map((a: { role: string }) => a.role), ["dept_user", "pmo"]);
  assert.deepEqual(w.assign, ["MG-1:1-1", "MG-1:1-2"]);
  assert.deepEqual(w.versions.map((v: { card: string }) => v.card), ["MG-1:1-1"]);
  assert.deepEqual(w.inspections, [{ card: "MG-1:1-1", period: "2026-11", shot: "ins" }]);
  assert.deepEqual(w.materials.map((m: { file: string }) => m.file), ["data/x/sample.pdf"]);
  assert.deepEqual(w.checkPeriods, ["2026-11"]);
  const text = formatWrites(w).join("\n");
  for (const s of ["운영 DB에 만들 것", "운영 DB에서 지울 것", "시작 전 멈춤 조건", "pdca-shot-dept@kca.kr", "MG-1:1-1 2026-11 보냄(sent)", "data/x/sample.pdf"]) assert.ok(text.includes(s), s);
  // 읽기만 하는 계획: 작성본·점검표·자료 없음
  const ro = planWrites({ shots: [["anon", "/login", "a"]] }, "2026-11");
  assert.deepEqual([ro.accounts.length, ro.versions.length, ro.inspections.length, ro.materials.length], [0, 0, 0, 0]);
});

test("cleanupTable: 머리 + 항목마다 한 줄", () => {
  const lines = cleanupTable([{ name: "점검표", made: 1, deleted: 1, left: 0 }, { name: "시험 계정", made: 2, deleted: 2, left: 0 }]);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /만든 것.*지운 것.*남은 것/);
  assert.match(lines[1], /^점검표\s+1\s+1\s+0$/);
});

const SHOTS = fileURLToPath(new URL("./shots.mjs", import.meta.url));
/** --plan-only 실행: DB 주소·키·DB_TARGET을 지운 환경 — DB 보호(guardProduction)나 DB 클라이언트에 닿으면 실패·다른 출력이 됨 */
function planOnly(plan: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "shotplan-only-"));
  const f = join(dir, "p.json");
  writeFileSync(f, JSON.stringify(plan));
  const env = { ...process.env };
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "DB_TARGET", "E2E_BASE"]) delete env[k];
  return { dir, r: spawnSync(process.execPath, [SHOTS, `@${f}`, "--plan-only"], { env, encoding: "utf8" }) };
}

test("--plan-only: DB·브라우저 없이 검증 + 쓰기 미리보기만 하고 폴더도 안 만듦", () => {
  const out = join(tmpdir(), `shotplan-out-${process.pid}-${Date.now()}`);
  const { r } = planOnly({ ...fixturePlan([["dept", "/my/inspections", "ins", { steps: [{ seedInspection: { card: "MG-1:1-1" } }] }]]), out });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /캡처 계획 검증 통과: 1장/);
  assert.match(r.stdout, /운영 DB에 만들 것/);
  assert.doesNotMatch(r.stdout + r.stderr, /운영 DB\(DB_TARGET=production\)/);
  assert.equal(existsSync(out), false);
});

test("--plan-only: 계획 오류면 오류와 미리보기를 찍고 종료 코드 1", () => {
  const { r } = planOnly({ shots: [["dept", "/my", "a", { steps: [{ click: "확인했습니다" }] }]] });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /클릭 금지어/);
});

// 2판 계획(로컬 전용 data/ — 없으면 건너뜀): 검증 통과 + 그림마다 붉은 번호 수 = 원고 범례 행 수
const V2 = fileURLToPath(new URL("../../data/manual/dept-user/shots-plan-v2.json", import.meta.url));
test("2판 계획: 검증 통과, 번호 수 = 범례 행 수", { skip: !existsSync(V2) && "data/manual/dept-user/shots-plan-v2.json 없음" }, () => {
  const plan = loadPlan(`@${V2}`);
  assert.deepEqual(validatePlan(plan), []);
  const legend: Record<string, number> = { "1-1": 2, "1-2": 1, "2": 4, "3": 5, "4": 5, "5": 4, "6": 4, "7": 4, "8": 4, "10": 4, "11": 3 };
  const got = Object.fromEntries(plan.shots.map((s: [string, string, string, { marks: Array<{ n: number }> }]) => [s[2].replace(/-[a-z].*$/, ""), s[3].marks.length]));
  assert.deepEqual(got, legend);
  for (const s of plan.shots) assert.deepEqual(s[3].marks.map((m: { n: number }) => m.n), s[3].marks.map((_: unknown, i: number) => i + 1), s[2]);
});
