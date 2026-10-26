// write.ts의 빈 값·예외 모양 분기: 빈 카드, 칸 나눔 규칙, 병합·구분 상자, 국정과제 원문, 환류·계획·점검 변형, 월별 실적, AX 붙임.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cardLayout, cardToKordocMarkdown, layoutMarkdown, spread } from "./write.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const card = (extra: any = {}) => ({ title: "과제 <A>", taskNo: "1-가", manager: "관리", writer: "작성", department: "부서", ...extra });
const cardRows = (c: any, opts?: any) => cardLayout(c, opts).tables.find((t) => t.kind === "card")!.rows;
const allCells = (c: any, opts?: any) => cardRows(c, opts).flat();

test("spread: 칸이 열보다 많아도 칸마다 최소 1열", () => {
  assert.deepEqual(spread(15, 13).every((n) => n === 1), true);
  assert.deepEqual(spread(3, 9), [3, 3, 3]);
  assert.deepEqual(spread(-1), []);
});

test("빈 카드: 모든 구역이 빈 칸으로 채워지고 표는 카드 표 하나", () => {
  const l = cardLayout({});
  assert.deepEqual(l.tables.map((t) => t.kind), ["card"]);
  const roles = l.tables[0].rows.flat().map((c) => c.role);
  assert.ok(roles.includes("label"));
  assert.equal(roles.filter((r) => r === "pdcaLabel").length, 4);
  assert.ok(layoutMarkdown(l).startsWith("<table>"));
});

test("머리: 부서 문구 우선, 없으면 부서(팀), 관리자·작성자는 있는 것만 ' / '로", () => {
  const head = (c: any) => cardRows(c)[0][3].html;
  assert.equal(head(card({ deptText: "직접 쓴 부서" })), "직접 쓴 부서");
  assert.equal(head(card({ team: "팀A" })), "부서(팀A)");
  assert.equal(head(card({ department: undefined })), "");
  assert.equal(cardRows(card({ writer: "" }))[1][1].html, "관리");
  assert.equal(cardRows(card())[1][1].html, "관리 / 작성");
  assert.match(cardRows(card({ title: "<b>&" }))[0][1].html, /&lt;b&gt;&amp;/);
});

test("과제 개요: 구분 칸/예산 칸 갈라 넣고, 칸 수가 원본과 다르면 고르게", () => {
  const rows = cardRows(card({ overview: { cells: ["신규과제", "단기과제", "예산 1", "인력 2", "기타 3"] } }));
  const ov = rows.filter((r) => r.some((c) => c.role === "ovCell"));
  assert.equal(ov.length, 2);
  assert.equal(ov[0][0].role, "label");
  assert.equal(ov[0][0].rowspan, 2);
  assert.deepEqual(ov[0].filter((c) => c.role === "ovCell").map((c) => c.colspan), [7, 6]);
  assert.deepEqual(ov[1].filter((c) => c.role === "ovCell").map((c) => c.colspan), [5, 4, 4]);
  // 4칸 한 줄 → 원본 나눔
  const four = cardRows(card({ overview: { cells: ["고도화과제", "중장기과제", "신규과제", "단기과제"] } }));
  assert.deepEqual(four.find((r) => r.some((c) => c.role === "ovCell"))!.filter((c) => c.role === "ovCell").map((c) => c.colspan), [3, 4, 3, 3]);
  // 한 줄뿐이면 라벨이 한 행
  assert.equal(four.find((r) => r[0].role === "label")![0].rowspan, 1);
});

test("계량 성과지표: 구분 상자 분할·병합(sharedWithPrevious)·표시 이름 원문·비고", () => {
  const k = {
    categoriesText: "☑ 가 □ 나 □ 다 ☐ 라",
    headers: { name: "지표", y25: "’25" },
    columns: ["name", "y25"],
    rows: [
      { name: "a", nameRaw: "A원문\n2줄", y25: "1" },
      { name: "b", y25: "1", sharedWithPrevious: ["y25"] },
      { name: "c", y25: "3", sharedWithPrevious: ["y25"] },
    ],
    notes: ["비고1"],
  };
  const rows = cardRows(card({ kpi: k }));
  const cat = rows.find((r) => r.some((c) => c.role === "catFirst"))!;
  assert.deepEqual(cat.filter((c) => c.role.startsWith("cat")).map((c) => c.role), ["catFirst", "catMid", "catMid", "catLast"]);
  assert.deepEqual(cat.filter((c) => c.role.startsWith("cat")).map((c) => c.colspan), [2, 5, 4, 2]);
  const data = rows.filter((r) => r.some((c) => c.role === "kpiData"));
  assert.equal(data[0].find((c) => c.role === "kpiData" && c.html.includes("A원문"))!.html, "A원문<br>2줄");
  // 위 칸 rowspan이 합쳐지고 아래 행에서는 칸이 빠짐
  assert.equal(data[0][data[0].length - 1].rowspan, 3);
  assert.equal(data[1].length, 1);
  assert.equal(data[2].length, 1);
  assert.ok(rows.some((r) => r.some((c) => c.html === "비고1")));
  // 구분 상자가 한 개면 일반 칸
  const one = cardRows(card({ kpi: { categoriesText: "☑ 가" } }));
  assert.ok(one.some((r) => r.some((c) => c.role === "content" && c.html === "☑ 가")));
  // columns가 없으면 headers 키 순서
  const nocols = cardRows(card({ kpi: { headers: { a: "A", b: "B" }, rows: [{ a: 1 }] } }));
  assert.deepEqual(nocols.find((r) => r.some((c) => c.role === "header"))!.filter((c) => c.role === "header").map((c) => c.html), ["A", "B"]);
  // 빈 지표는 빈 한 줄
  assert.ok(cardRows(card({ kpi: {} })).some((r) => r[0]?.html === "계량 성과지표"));
});

test("전략 연계성: AI 체크 표시, 국정과제는 원문 일치 시 원문·아니면 제목+표지", () => {
  const nat = (s: any) => cardRows(card({ strategy: s })).flat().find((c) => c.hint === "national")!.html;
  const ai = (s: any) => cardRows(card({ strategy: s })).flat().find((c) => c.hint === "ai")!.html;
  assert.equal(ai({ ai: { checked: true, text: "활용" } }), "☑ 활용");
  assert.equal(ai({ ai: { checked: false, text: "활용" } }), "□ 활용");
  assert.equal(ai({ ai: { text: "활용" } }), "활용");
  assert.equal(ai({}), "");
  assert.equal(nat({}), "");
  assert.equal(nat({ nationalAgenda: [{ title: "제목", badges: ["표지1", "표지2"] }, { badges: ["x"] }] }), "제목<br>표지1<br>표지2<br>x");
  // 원문이 항목과 맞지 않으면 항목에서 다시
  assert.equal(nat({ nationalAgenda: [{ title: "제목" }], nationalAgendaText: "엉뚱한 원문" }), "제목");
});

test("[Act]: 헤더 없음·지적 없음·지적 있음 세 모양", () => {
  const act = (a: any) => cardRows(card({ act: a }));
  const none = act({ selfAssessment: ["자체"] }).find((r) => r[0]?.stage === "act")!;
  assert.equal(none.length, 3);
  assert.equal(none[2].html, "자체");
  const noFind = act({ headers: {}, selfAssessment: ["자체"] });
  const i = noFind.findIndex((r) => r[0]?.stage === "act");
  assert.equal(noFind[i][2].html, "자체평가");
  assert.equal(noFind[i + 1][0].role, "underHeader");
  const find = act({ headers: {}, findings: ["지적"], selfAssessment: ["자체"] });
  const j = find.findIndex((r) => r[0]?.stage === "act");
  assert.deepEqual(find[j].slice(2).map((c) => c.html), ["경영평가 지적사항", "’25년 추진 결과에 대한 자체평가"]);
  assert.deepEqual(find[j + 1].map((c) => c.html), ["지적", "자체"]);
  assert.equal(act({ headers: { findings: "F", self: "S" }, findings: [] }).flat().some((c) => c.html === "F"), true);
});

test("[Plan]·[Check]·[Do]: 격자 있으면 라벨 한 번·빈 열 채움, 없으면 한 줄, 월별 실적 기간 대체값", () => {
  const grid = { cols: 10, rows: [[{ lines: ["가"], colspan: 2 }], [{ lines: ["나"] }]] };
  const rows = cardRows(card({ plan: { grid }, check: { grid: { rows: [[{ lines: ["x"] }]] } }, do: { grid, monthly: [{ period: "1월", items: ["a"] }] } }));
  const plan = rows.filter((r) => r.some((c) => c.stage === "plan"));
  assert.equal(plan[0][0].rowspan, 2);
  assert.equal(plan[0][1].role, "pdcaGap");
  assert.equal(plan[0][1].colspan, 4);
  const check = rows.find((r) => r[0]?.stage === "check")!;
  assert.equal(check[1].colspan, 1); // cols 기본 13 → pad 1
  const doRow = rows.find((r) => r[0]?.stage === "do")!;
  assert.equal(doRow[0].rowspan, 3); // 격자 2행 + 월별 1
  // 격자 없음
  const plain = cardRows(card({ plan: { lines: ["계획"] }, check: { items: ["점검"] }, do: { lines: ["내용"], monthly: [{ periodTokens: ["1월", "2월"], items: [] }, { periodLines: ["3월", "~"], period: "무시" }, {}] } }));
  assert.equal(plain.find((r) => r[0]?.stage === "plan")![2].html, "계획");
  assert.equal(plain.find((r) => r[0]?.stage === "check")![2].html, "점검");
  const d = plain.find((r) => r[0]?.stage === "do")!;
  assert.equal(d[0].rowspan, 4);
  assert.equal(d[2].role, "doMain");
  const months = plain.filter((r) => r[0]?.role === "monthGap");
  assert.deepEqual(months.map((r) => r[1].html), ["1월<br>2월", "3월<br>~", ""]);
  assert.equal(cardRows(card({ do: { lines: ["x"] } })).find((r) => r[0]?.stage === "do")![2].role, "content");
});

test("추진성과: 헤더 없음 한 줄 / 있음 두 줄(기본 머리글)", () => {
  const one = cardRows(card({ outcome: { quantitative: ["정량"] } }));
  assert.equal(one.find((r) => r[0]?.html === "추진성과")![2].html, "정량");
  const two = cardRows(card({ outcome: { headers: {}, quantitative: ["정량"], qualitative: ["정성"] } }));
  const i = two.findIndex((r) => r[0]?.html === "추진성과");
  assert.deepEqual(two[i].slice(2).map((c) => c.html), ["정량 성과", "정성 성과(기대 효과)"]);
  assert.deepEqual(two[i + 1].map((c) => c.html), ["정량", "정성"]);
});

test("칸 안 글줄: 문자열·표·그림·알 수 없는 모양, 그림 이름 바꾸기, 표 머리 칸(th)", () => {
  const lines = ["a<b", { table: { rows: [[{ lines: ["셀"], th: true, colspan: 2, rowspan: 2 }, { lines: [] }]] } }, { image: { src: "s.png", kordoc: "image1.png" } }, { image: null }, null, 7];
  const html = allCells(card({ plan: { lines } }), { imageKey: (i: any) => `k-${i.src}` }).find((c) => c.stage === "plan")!;
  const out = cardRows(card({ plan: { lines } }), { imageKey: (i: any) => `k-${i.src}` }).find((r) => r[0]?.stage === "plan")![2].html;
  assert.ok(html);
  assert.match(out, /^a&lt;b<br><table>/);
  assert.match(out, /<th colspan="2" rowspan="2">셀<\/th><td><\/td>/);
  assert.match(out, /<img src="k-s\.png" alt="image">$/);
  // 기본 그림 이름 = kordoc 이름, 표에 rows가 없어도 안 깨짐
  const dflt = cardRows(card({ plan: { lines: [{ image: { src: null, kordoc: "i.png" } }, { table: null }] } })).find((r) => r[0]?.stage === "plan")![2].html;
  assert.equal(dflt, '<img src="i.png" alt="image"><br><table>\n\n</table>');
});

test("묶음 표지와 AX 붙임 표", () => {
  const l = cardLayout(card({ axAttachments: [{ title: "AX1", purpose: "목적\n둘째", sections: [{ heading: "내용", items: ["a"] }, { heading: "체크리스트 확인", items: ["b"] }], notes: ["비고"] }, { title: null, purpose: null }, {}] }), { group: { id: "주요사업1", name: "A&B" } });
  assert.deepEqual(l.tables.map((t) => t.kind), ["group", "card", "ax", "ax", "ax"]);
  assert.deepEqual(l.tables[0].rows[0].map((c) => c.html), ["(주요사업1)", "A&amp;B"]);
  const ax = l.tables[2].rows;
  assert.equal(ax[1][1].html, "목적<br>둘째");
  assert.deepEqual(ax.slice(2, 4).map((r) => [r[0].role, r[1].role]), [["axLabel", "axContent"], ["axCheckLabel", "axCheckContent"]]);
  assert.equal(ax[4][0].role, "axNote");
  assert.equal(l.tables[3].rows.length, 1); // 목적 null · 절 없음 · 비고 없음 → 머리 행뿐
  assert.equal(l.tables[3].rows[0][1].html, "");
  assert.equal(l.tables[4].rows.length, 1);
});

test("cardToKordocMarkdown: 표 사이 빈 줄, 병합은 colspan/rowspan 속성", () => {
  const md = cardToKordocMarkdown(card(), { group: { id: "g", name: "n" } });
  assert.match(md, /<\/table>\n\n<table>/);
  assert.match(md, /<th colspan="2" rowspan="2">과제명<br>\(과제번호\)<\/th>/);
  assert.ok(md.endsWith("</table>\n"));
});
