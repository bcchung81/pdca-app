import assert from "node:assert/strict";
import { test } from "node:test";
import { ASK_CLIP, ASSIST_KEEP, type AssistTurn, PENDING_STALE_MS, askLines, chatHistory, fromChatMessages, modeLabel, patchTurn, pushTurn, readTurns, threadMarkdown, turnHeadline, turnMarkdown } from "./assist-thread.ts";

const result = {
  headline: "전년 지적 2건 중 1건은 반영, 1건은 보강 필요",
  summary: "◆ 개선방향\n▸ [Act] 지적 환류\n| 구분 | 내용 |\n|---|---|\n| Act | 보강 |",
  citations: [
    { key: "k1", title: "'25 평가보고서", quote: "「시간 절감 산식에서 제외」", verified: true },
    { key: "k2", title: "'25 중간보고서", quote: "재산정 필요", verified: false },
  ],
  suggestions: [{ kind: "replace" as const, targetPath: "act.findings.0", period: null, current: "옛 글", proposed: ["새 글 1", "새 글 2"], reason: "지적 반영", sourceKeys: ["k1"], applicable: true }],
  monthlyRow: null,
  needInput: "산식 기준을 알려 주세요",
};
const ok = (over: Partial<AssistTurn> = {}): AssistTurn => ({ id: "a", at: "2026-09-26T09:00:00.000Z", mode: "improve", ask: ["지적 중심으로"], status: "ok", result, model: "m", sources: 3, ...over });

test("기록 읽기: 모양이 틀린 것은 버리고, 오래된 「쓰는 중」은 끊김으로, 최근 것만", () => {
  const now = Date.parse("2026-09-26T09:30:00.000Z");
  const raw = [
    ok(),
    { id: "x", at: "2026-09-26T09:00:00.000Z", mode: "없는 종류", ask: [], status: "ok" },
    { id: "y", at: "2026-09-26T09:00:00.000Z", mode: "review", ask: [], status: "ok" }, // 결과 없음
    { id: "p1", at: new Date(now - PENDING_STALE_MS - 1).toISOString(), mode: "review", ask: [1, "글"], status: "pending" },
    { id: "p2", at: new Date(now - 60_000).toISOString(), mode: "review", ask: [], status: "pending" },
    null,
  ];
  const ts = readTurns(raw, now);
  assert.deepEqual(
    ts.map((t) => [t.id, t.status]),
    [
      ["a", "ok"],
      ["p1", "error"],
      ["p2", "pending"],
    ],
  );
  assert.deepEqual(ts[1].ask, ["글"], "글이 아닌 줄은 뺌");
  assert.match(ts[1].message ?? "", /끊겼습니다/);
  assert.deepEqual(readTurns("망가진 값"), []);
  // AI가 못 읽어 뺀 자료(참고자료 1단계): 글만 남기고, 옛 기록(없음)은 그대로
  assert.deepEqual(readTurns([ok({ skipped: ["스캔.pdf", 3] as unknown as string[] })])[0].skipped, ["스캔.pdf"]);
  assert.equal(readTurns([ok()])[0].skipped, undefined);
  const many = Array.from({ length: ASSIST_KEEP + 5 }, (_, i) => ok({ id: `t${i}` }));
  assert.equal(readTurns(many).length, ASSIST_KEEP);
  assert.equal(readTurns(many)[0].id, "t5", "오래된 것부터 덜어 냄");
});

test("쌓기·고치기: 새 요청은 끝에, 결과는 그 요청 자리에", () => {
  let ts = pushTurn([ok()], { id: "b", at: "2026-09-26T09:05:00.000Z", mode: "review", ask: [], status: "pending" });
  assert.deepEqual(
    ts.map((t) => t.id),
    ["a", "b"],
  );
  ts = patchTurn(ts, "b", { status: "error", message: "요청이 너무 잦습니다." });
  assert.equal(ts[1].status, "error");
  assert.equal(ts[0].status, "ok", "다른 요청은 그대로");
  assert.deepEqual(patchTurn(ts, "없음", { status: "ok" }), ts);
  const full = Array.from({ length: ASSIST_KEEP }, (_, i) => ok({ id: `t${i}` }));
  assert.equal(pushTurn(full, ok({ id: "new" })).at(-1)?.id, "new");
  assert.equal(pushTurn(full, ok({ id: "new" })).length, ASSIST_KEEP);
});

test("없앤 요청 종류(점검 대비 리뷰·칸 다듬기)의 옛 기록도 버리지 않고 옛 이름으로", () => {
  const old = readTurns([ok({ id: "r", mode: "review" as AssistTurn["mode"] }), ok({ id: "s", mode: "polish" as AssistTurn["mode"] })]);
  assert.deepEqual(old.map((t) => t.id), ["r", "s"]);
  assert.deepEqual(old.map((t) => modeLabel(t.mode)), ["점검 대비 리뷰", "선택한 칸 다듬기"]);
  assert.equal(modeLabel("improve"), "개선 제안");
});

test("말풍선 줄: 요청 내용·첨부, 실적 반영에 붙여 넣은 긴 글은 앞부분 + 글자 수", () => {
  assert.deepEqual(askLines({ note: "  " }), []);
  assert.deepEqual(askLines({ note: " 추진성과 중심 " }), ["추진성과 중심"]);
  assert.deepEqual(askLines({ files: ["9월 결과보고.hwp", "보도자료.pdf"] }), ["첨부: 9월 결과보고.hwp · 보도자료.pdf"]);
  assert.deepEqual(askLines({ files: [] }), []);
  // 실적 반영(clip): 짧은 글은 그대로, 긴 글은 앞부분…과 전체 글자 수
  assert.deepEqual(askLines({ note: "9월 실적 반영", clip: ASK_CLIP }), ["9월 실적 반영"]);
  const long = "가".repeat(1240);
  assert.deepEqual(askLines({ note: long, files: ["결과보고.hwp"], clip: ASK_CLIP }), [`${"가".repeat(ASK_CLIP)}…`, "붙여 넣은 글 1,240자", "첨부: 결과보고.hwp"]);
});

test("답 복사(마크다운): 결론·되묻기·본문·제안·인용 순서, 오류는 알림 글", () => {
  const md = turnMarkdown(ok());
  const order = ["## 개선 제안", "**전년 지적 2건", "> 산식 기준", "◆ 개선방향", "### 카드 반영 제안 1건", "1. [바꾸기] act.findings.0", "   - 지금: 옛 글", "   - 새 글 2", "   - 까닭: 지적 반영", "### 인용한 근거 2건", "- '25 평가보고서: 「시간 절감 산식에서 제외」", "- '25 중간보고서(원문과 다름): 「재산정 필요」"];
  let at = -1;
  for (const o of order) {
    const i = md.indexOf(o);
    assert.ok(i > at, `${o} 순서`);
    at = i;
  }
  const monthly = turnMarkdown(ok({ mode: "reflect", result: { ...result, monthlyRow: { month: "9월", activity: "준공검사 | 3건", quantitative: "", qualitative: "a\nb", progress: "75%", risk: "" } } }));
  assert.match(monthly, /\| 9월 \| 준공검사 ∣ 3건 \| — \| a b \| 75% \| — \|/);
  assert.equal(turnMarkdown({ id: "e", at: "", mode: "review", ask: [], status: "error", message: "끊김" }), "끊김");
});

const chat = (over: Partial<AssistTurn> = {}): AssistTurn => ({ id: "c", at: "2026-09-26T09:10:00.000Z", mode: "chat", ask: ["위 개선방향 2번을 [Plan] 문장으로"], status: "ok", answer: "◆ [Plan] 문장\n▸ 산식에 검증 시간 포함", model: "m", sources: 5, ...over });

test("질문(자유 대화) 차례: 답 글이 있어야 읽고, 복사·내려받기에 질문·답", () => {
  assert.deepEqual(
    readTurns([chat(), { ...chat({ id: "c2" }), answer: undefined }]).map((t) => t.id),
    ["c"],
    "답 없는 질문 차례는 버림",
  );
  assert.equal(turnMarkdown(chat()), "## 질문\n\n◆ [Plan] 문장\n▸ 산식에 검증 시간 포함");
  const doc = threadMarkdown("AI 안테나", [ok(), chat(), { ...chat({ id: "p" }), status: "pending" }], () => "09.26");
  assert.match(doc, /^# AI 작성지원 — AI 안테나/);
  assert.ok(doc.indexOf("## 개선 제안 (09.26)") < doc.indexOf("## 질문 (09.26)"), "차례대로");
  assert.match(doc, /> 위 개선방향 2번을 \[Plan\] 문장으로\n\n◆ \[Plan\] 문장/);
  assert.equal(doc.match(/^## /gm)?.length, 2, "쓰는 중인 차례는 뺌");
});

test("이어 묻기 이력: 요청 종류의 구조화 답도 글로, 끝나지 않은 차례는 뺌", () => {
  const h = chatHistory([ok(), chat(), { ...chat({ id: "e" }), status: "error", message: "끊김" }]);
  assert.deepEqual(
    h.map((m) => m.role),
    ["user", "assistant", "user", "assistant"],
  );
  assert.equal(h[0].text, "[개선 제안] 지적 중심으로");
  assert.match(h[1].text, /^\*\*전년 지적 2건.*\n[\s\S]*### 카드 반영 제안 1건/);
  assert.equal(h[2].text, "위 개선방향 2번을 [Plan] 문장으로");
  assert.equal(chatHistory([ok({ ask: [] })])[0].text, "[개선 제안] (요청 내용 없이 보냄)");
});

test("합치기 전 「AI 대화」 기록 옮겨 담기: 질문·답 짝만, 답 없는 마지막 질문은 버림", () => {
  const turns = fromChatMessages([
    { role: "user", text: "지적 환류는?", at: "2026-09-26T08:00:00.000Z" },
    { role: "assistant", text: "◆ 답", at: "2026-09-26T08:01:00.000Z", model: "m", sources: 3 },
    { role: "assistant", text: "짝 없는 답" },
    { role: "user", text: "답 못 받은 질문", at: "2026-09-26T08:05:00.000Z" },
  ]);
  assert.equal(turns.length, 1);
  assert.deepEqual([turns[0].mode, turns[0].ask, turns[0].answer, turns[0].sources, turns[0].status], ["chat", ["지적 환류는?"], "◆ 답", 3, "ok"]);
  assert.equal(readTurns(turns).length, 1, "옮긴 차례는 그대로 읽힘");
  assert.deepEqual(fromChatMessages("망가짐"), []);
});

test("접은 답의 결론 한 줄: 요청 종류는 결론, 질문은 첫 글줄에서 기호·강조를 뗌(표·구분선은 건너뜀)", () => {
  assert.equal(turnHeadline(ok()), result.headline);
  const chat = (answer: string) => ok({ mode: "chat", result: undefined, answer });
  assert.equal(turnHeadline(chat("◆ **결론: 국정과제·ESG 칸은 채워져 있습니다.**\n▸ 근거")), "결론: 국정과제·ESG 칸은 채워져 있습니다.");
  assert.equal(turnHeadline(chat("\n## 칸별 점검\n본문")), "칸별 점검");
  assert.equal(turnHeadline(chat("| 칸 | 판단 |\n|---|---|\n---\n- 첫 항목 `code`")), "첫 항목 code");
  assert.equal(turnHeadline(chat("")), "");
  assert.equal(turnHeadline(ok({ status: "pending", result: undefined })), "");
});

const followupResult = {
  ...result,
  followup: {
    period: "2026-09",
    statusLabel: "부서에 보냄",
    focus: true,
    counts: { 반영됨: 1, "일부 반영": 0, 미반영: 1, "확인 불가": 0, total: 2 },
    items: [
      { id: "axes.4", label: "7대축 4 OutCome 연결", star: true, judgment: "반영됨" as const, requested: "정량 칸에 체감 수치 추가", cardThen: "수치 없음", cardQuote: "국민 민원 40% 감소", cardQuoteOk: true, inspectionQuote: "체감 수치 추가", inspectionQuoteOk: true, remaining: "", missing: false },
      { id: "patterns.5", label: "질의패턴 5 계량 수치의 함정", star: true, judgment: "미반영" as const, requested: "분모 설명 추가", cardThen: "분모 설명 없음", cardQuote: "카드에 없는 문장", cardQuoteOk: false, inspectionQuote: "", inspectionQuoteOk: null, remaining: "계량 성과지표 칸에 분모 설명 추가", missing: false },
    ],
    recheckCount: 0,
    notice: "자가점검 결과이며 공식 판정은 성과관리팀 점검에서 정해집니다.",
  },
};

test("보완 점검 대화: 요청 종류 이름·기록 복원, .md에 대조표(원문과 다름 표시·고정 문구), 옛 기록(followup 없음)은 그대로, 망가진 followup은 버림", () => {
  const t = ok({ id: "f1", mode: "followup", result: followupResult });
  assert.equal(modeLabel("followup"), "보완 점검(모드 C)");
  const md = turnMarkdown(t);
  assert.ok(md.includes("### 보완 이행 대조 — 2026-09 점검(부서에 보냄) · 반영됨 1 · 일부 반영 0 · 미반영 1 · 확인 불가 0"));
  assert.ok(md.includes("1. [반영됨] ★ 7대축 4 OutCome 연결"));
  assert.ok(md.includes("현재 카드(원문과 다름): 「카드에 없는 문장」"));
  assert.ok(md.includes("남은 할 일: 계량 성과지표 칸에 분모 설명 추가"));
  assert.ok(md.includes("> 자가점검 결과이며 공식 판정은 성과관리팀 점검에서 정해집니다."));
  const now = Date.parse("2026-09-26T09:30:00.000Z");
  assert.equal(readTurns([t, ok({ id: "old" })], now).length, 2, "followup이 없는 옛 기록도 읽힘");
  const bad = ok({ id: "bad", mode: "followup", result: { ...followupResult, followup: { ...followupResult.followup, items: "x" as never } } });
  assert.deepEqual(readTurns([bad], now), [], "items가 배열이 아닌 followup은 그 차례를 버림");
  const noCounts = ok({ id: "nc", mode: "followup", result: { ...followupResult, followup: { ...followupResult.followup, counts: undefined as never } } });
  assert.deepEqual(readTurns([noCounts], now), [], "counts가 없는 followup도 버림(화면이 깨지지 않게)");
});
