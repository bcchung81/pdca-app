import assert from "node:assert/strict";
import test from "node:test";
import {
  AB_FEATURES, type AbJudgeAnswer, abChunkBlock, abKeyCandidates, combineRounds, roundsTable, cliLogIndex, joinedKeys, parseAttachArg, usageKey, type AbPairOutcome, type AbRecord, type BundleLike,
  abAnswerMarkdown, abMentionedKeys, abPairOrder, abSummaryTable, buildAbPacket, bundleStats, checkAbJudge, dutyText, failFile, pairProblem, pairTable,
  parseFeatures, recordFile, recordMetrics, resolveAb, summarizeAb, verdictTable,
} from "./writer-ab-core.ts";

const rec = (over: Partial<AbRecord> = {}): AbRecord => ({
  arm: "base",
  feature: "improve",
  cardId: "주요사업1/7-가",
  uid: "u1",
  unit: "BZ-1",
  periodLabel: "2026년 11월",
  code: { root: "/x", kind: "base" },
  settings: { KNOWLEDGE_SELECT: "", KNOWLEDGE_SELECT_TRACKS: "", selectDir: null, CLAUDE_CLI_TIMEOUT_MS: "" },
  bonusReasons: [],
  scope: null,
  knowledge: null,
  inspection: { exists: false, period: null, given: null, chars: 0 },
  materials: { used: [], skipped: [] },
  request: { system: 10, shared: [100, 50], list: 5, prompt: 40, total: 200 },
  usage: { input: 10, output: 30, cacheRead: 100, cacheWrite: 20, cacheWrite1h: 0 },
  sec: 12.4,
  result: { headline: "h", summary: "s", citations: [], suggestions: [] },
  ...over,
});

const ans = (winner: "A" | "B" | "비슷"): AbJudgeAnswer => ({
  axes: { 근거: { A: 5, B: 2, note: "" }, 특화: { A: 4, B: 3, note: "" }, 유용: { A: 3, B: 3, note: "" }, 누락오류: { A: 4, B: 1, note: "" }, 지침: { A: 5, B: 2, note: "" } },
  errors: { A: { cardDenied: 0, overwrite: 0, fabricated: 0, factError: 0 }, B: { cardDenied: 1, overwrite: 0, fabricated: 2, factError: 1 } },
  notes: [],
  winner,
  confidence: "중간",
  reason: "B가 지적 조각 corr25-2610/BZ-1/03을 놓침",
});

test("parseFeatures: 비면 여섯 기능 전부, 모르는 이름은 오류", () => {
  assert.deepEqual(parseFeatures(undefined), [...AB_FEATURES]);
  assert.deepEqual(parseFeatures(" improve , chat "), ["improve", "chat"]);
  assert.throws(() => parseFeatures("improve,writer"), /모르는 기능: writer/);
});

test("기록 경로: <out>/<arm>/<uid>/<기능>.json, 실패는 .fail.json", () => {
  assert.equal(recordFile("/o", "new", "u1", "chat"), "/o/new/u1/chat.json");
  assert.equal(failFile("/o", "base", "u1", "comment"), "/o/base/u1/comment.fail.json");
});

test("bundleStats: 통째로 넣기 — 층별 수·글자·가점 실사, 선별 대상인데 통째로면 fellBack", () => {
  const kb: BundleLike = {
    layers: [
      { id: "institution", refs: [{ key: "a/1", text: "12345" }] },
      { id: "common", refs: [{ key: "att3-2604/s3/1", text: "123" }, { key: "att3-2604/s3/2", text: "1" }] },
      { id: "business", refs: [] },
    ],
    list: { taskRow: { key: "plan/task/1", text: "t" } },
    consult: [{ key: "c/1", text: "x" }],
  };
  const isBonus = (k: string) => k.startsWith("att3-2604/s3/");
  const s = bundleStats(kb, isBonus, true);
  assert.equal(s.method, "통째로");
  assert.equal(s.fellBack, true);
  assert.deepEqual(s.layers.map((l) => [l.id, l.refs, l.chars, l.bonus]), [["institution", 1, 5, 0], ["common", 2, 4, 2], ["business", 0, 0, 0]]);
  assert.deepEqual(s.bonus, { inLayers: 2, picked: 0, unpicked: 0, refs: 2 });
  assert.equal(s.refs, 4); // 층 3 + 과제 목록 행 1
  assert.equal(s.consult, 1);
  assert.equal(s.picked, null);
});

test("bundleStats: 선별 — 고른 수·제목 목록·인용 대조(select.all)·규칙 문서 글자, 가점 실사는 갈래별로", () => {
  const kb: BundleLike = {
    layers: [{ id: "institution", refs: [{ key: "m/1", text: "ab" }] }],
    list: { taskRow: null },
    select: {
      picked: [{ key: "att3-2604/s3/1", text: "p" }, { key: "q/1", text: "p" }],
      unpicked: [{ key: "att3-2604/s3/2" }, { key: "q/2" }, { key: "q/3" }],
      all: [{ key: "m/1", text: "ab" }, { key: "att3-2604/s3/1", text: "p" }, { key: "att3-2604/s3/2", text: "u" }, { key: "q/1", text: "p" }, { key: "q/2", text: "" }, { key: "q/3", text: "" }],
      digest: { track: "1234", unit: "56" },
    },
  };
  const s = bundleStats(kb, (k) => k.startsWith("att3-2604/s3/"), true);
  assert.equal(s.method, "선별");
  assert.equal(s.fellBack, false);
  assert.equal(s.picked, 2);
  assert.equal(s.unpicked, 3);
  assert.equal(s.refs, 6);
  assert.equal(s.digestChars, 6);
  assert.deepEqual(s.bonus, { inLayers: 0, picked: 1, unpicked: 1, refs: 2 });
});

test("pairProblem: 한쪽만·건너뜀·코드 결과·답 없음이면 까닭, 둘 다 답이면 null", () => {
  assert.match(pairProblem(rec(), null)!, /new 없음/);
  assert.match(pairProblem(null, rec({ arm: "new" }))!, /base 없음/);
  assert.match(pairProblem(rec({ skipped: "실적 자료 없음", result: undefined }), rec({ arm: "new", skipped: "실적 자료 없음", result: undefined }))!, /건너뜀\(실적 자료 없음\)/);
  assert.equal(pairProblem(rec({ codeResult: true }), rec({ arm: "new" })), "코드 결과(AI 안 부름)");
  assert.equal(pairProblem(rec({ result: undefined }), rec({ arm: "new" })), "답 없음");
  assert.equal(pairProblem(rec(), rec({ arm: "new" })), null);
});

test("abPairOrder: 씨앗 고정이고 두 갈래가 한 번씩, 쌍마다 섞임", () => {
  const a = abPairOrder("improve", "u1");
  assert.deepEqual(a, abPairOrder("improve", "u1"));
  assert.deepEqual([a.A, a.B].sort(), ["base", "new"]);
  assert.equal(new Set(Array.from({ length: 30 }, (_, i) => abPairOrder("chat", `u${i}`).A)).size, 2);
});

test("답 글: 코멘트는 결과·편집 전후·버린 편집, 보완 점검은 행 판단, 갈래 이름은 안 나옴", () => {
  const c = abAnswerMarkdown("comment", { comments: [{ id: "c1", outcome: "edited", reply: "고쳤습니다", edits: [{ label: "추진계획", path: "plan.lines.0", op: "replace", before: "옛 글", lines: ["새 글"] }], dropped: 1 }, { id: "c2", outcome: "answered", reply: "근거는 rpt25-biz/BZ-1/02 절", edits: [], dropped: 0 }] });
  for (const s of ["코멘트 c1 — 고침", "버린 편집 1건", "전: 옛 글", "후: 새 글", "코멘트 c2 — 답함"]) assert.ok(c.includes(s), s);
  assert.deepEqual(abMentionedKeys("comment", { comments: [{ id: "c2", outcome: "answered", reply: "근거는 rpt25-biz/BZ-1/02 절", edits: [], dropped: 0 }] }), ["rpt25-biz/BZ-1/02"]);
  const w = abAnswerMarkdown("followup", { headline: "h", summary: "s", citations: [], suggestions: [], followup: { items: [{ id: "axes.4", label: "7대축 4 OutCome 연결", judgment: "일부 반영", remaining: "성과 지표 보완" }] } });
  assert.ok(w.includes("[axes.4] 7대축 4 OutCome 연결 — 일부 반영 / 남은 할 일: 성과 지표 보완"));
  assert.equal(abAnswerMarkdown("chat", { answer: "답" }), "답");
  assert.doesNotMatch(c + w, /\bbase\b|\bnew\b/);
});

test("심사 묶음: 할 일·카드·두 답·조각·첨부(앞 9,000자)가 들고 갈래·크기·선별 단서는 없음", () => {
  const p = buildAbPacket({ feature: "reflect", cardId: "주요사업3/5-가", duty: "할 일 글", cardText: "plan | 글", answerA: "답A", answerB: "답B", chunks: [{ key: "k/1", title: "제목", text: "원문" }], files: [{ name: "실적.hwpx", text: "가".repeat(9500) }] });
  for (const s of ["실적 반영", "할 일 글", "plan | 글", "답A", "답B", "[k/1] 제목", "[file:1] 실적.hwpx (앞 9000자만 실음 — 원문 9500자)"]) assert.ok(p.includes(s), s);
  assert.ok(!p.includes("가".repeat(9001)));
  assert.doesNotMatch(p, /\bbase\b|\bnew\b|선별|통째로|토큰/);
});

test("dutyText: 작성지원은 요청 종류 할 일 절, 질문은 질문, 코멘트는 코멘트 목록, 보완 점검은 미흡 행", () => {
  assert.match(dutyText(rec({ feature: "discover" }), "실적 발굴 — 할 일"), /작성지원 「실적 발굴」 — 요청 글 없음\n실적 발굴 — 할 일/);
  assert.match(dutyText(rec({ feature: "reflect" }), "t"), /카드 전용 자료\(5절\)만으로/);
  assert.match(dutyText(rec({ feature: "chat", question: "무엇부터?" }), null), /질문: 「무엇부터\?」/);
  assert.match(dutyText(rec({ feature: "comment", comments: [{ id: "c1", kind: "edit", path: "p.0", quote: "글", text: "다듬어", label: "추진계획" }] }), null), /- c1 수정 · 추진계획 \(p\.0\) · 고른 글 「글」 · 코멘트: 다듬어/);
  assert.match(dutyText(rec({ feature: "followup", result: { followup: { items: [{ id: "axes.4", label: "OutCome", requested: "지표 연결" }] } } }), "t"), /\[axes\.4\] OutCome — 요구한 보완: 지표 연결/);
});

test("심사 답: 지침 축이 있어야 통과, A/B를 갈래로 풂", () => {
  assert.equal(checkAbJudge(ans("A")).ok, true);
  const axes: Record<string, unknown> = { ...ans("A").axes };
  delete axes.지침;
  assert.equal(checkAbJudge({ ...ans("A"), axes }).ok, false);
  const r = resolveAb(ans("B"), { A: "new", B: "base" });
  assert.equal(r.winner, "base");
  assert.equal(r.new.scores.지침, 5);
  assert.equal(r.base.errors.fabricated, 2);
  assert.equal(resolveAb(ans("비슷"), { A: "base", B: "new" }).winner, "비슷");
});

test("recordMetrics: 작성지원 인용·제안(버림은 검증 전 건수와의 차), 질문 글자, 코멘트 결과, 입력 토큰 = 캐시 없음+읽기+쓰기", () => {
  const w = recordMetrics(
    rec({
      rawCounts: { suggestions: 5, citations: 4 },
      result: {
        citations: [{ key: "k", title: "", quote: "", verified: true }, { key: "k2", title: "", quote: "", verified: false }],
        suggestions: [
          { kind: "text", targetPath: "a.0", period: null, current: "x", proposed: ["y"], reason: "", sourceKeys: [], applicable: true },
          { kind: "text", targetPath: "zz", period: null, current: null, proposed: ["y"], reason: "", sourceKeys: [], applicable: false },
        ],
      },
    }),
  );
  assert.deepEqual([w.citations, w.verified, w.notVerified, w.unknownCitations, w.suggestions, w.applicable, w.notApplicable, w.droppedSuggestions], [2, 1, 1, 2, 2, 1, 1, 3]);
  assert.equal(w.inputTokens, 130);
  assert.equal(w.requestChars, 200);
  const ch = recordMetrics(rec({ feature: "chat", result: { answer: "자료 확인 필요: a/b 그리고 자료 확인 필요" } }));
  assert.equal(ch.needMaterial, 2);
  const cm = recordMetrics(rec({ feature: "comment", result: { comments: [{ id: "c1", outcome: "edited", reply: "", edits: [], dropped: 2 }, { id: "c2", outcome: "declined", reply: "", edits: [], dropped: 0 }] } }));
  assert.deepEqual([cm.edited, cm.answered, cm.declined, cm.droppedEdits], [1, 0, 1, 2]);
});

test("summarizeAb: 통과 기준 (1)~(4)와 묶음(작성지원·질문·코멘트·전체)", () => {
  const m = (inputTokens: number) => ({ requestChars: inputTokens * 2, inputTokens, outputTokens: 1, sec: 1 });
  const po = (feature: AbPairOutcome["feature"], winner: "A" | "B" | "비슷", key: { A: "base" | "new"; B: "base" | "new" }, tb: number, tn: number): AbPairOutcome => ({
    feature, uid: `${feature}-${winner}`, cardId: "c", resolved: resolveAb(ans(winner), key), metrics: { base: m(tb), new: m(tn) }, blindBreak: [],
  });
  const pairs = [po("improve", "A", { A: "new", B: "base" }, 100, 40), po("discover", "비슷", { A: "base", B: "new" }, 100, 40), po("chat", "A", { A: "base", B: "new" }, 50, 50)];
  const s = summarizeAb(pairs, { base: 0, new: 1 });
  assert.equal(s.newNoFailures, false);
  const w = s.groups.writer;
  assert.deepEqual(w.verdict, { new: 1, base: 0, 비슷: 1 });
  assert.equal(w.criteria.notWorse, true);
  // ans(): B가 지어냄 2 + 사실 오류 1. improve는 B=base, discover는 B=new
  assert.deepEqual(w.fabFact, { base: 3, new: 3 });
  assert.equal(w.criteria.noMoreErrors, true);
  assert.equal(w.criteria.fewerTokens, true);
  const c = s.groups.chat;
  assert.deepEqual(c.verdict, { new: 0, base: 1, 비슷: 0 });
  assert.equal(c.criteria.notWorse, false);
  assert.equal(c.criteria.noMoreErrors, false);
  assert.equal(c.criteria.fewerTokens, false);
  assert.equal(s.groups.comment.pairs, 0);
  assert.equal(s.groups.comment.criteria.notWorse, null);
  assert.equal(s.groups.all.pairs, 3);
  const md = abSummaryTable(s);
  assert.ok(md.includes("new 1 → (1) 미달"));
  assert.ok(md.includes("| writer | 2 | 2 | 1 | 0 | 1 | 통과 |"));
  assert.ok(!md.includes("| comment |"));
});

test("pairTable·verdictTable: 갈래마다 한 줄, 결론은 new 줄에, 근거 한 줄의 표 구분자는 바꿈", () => {
  const base = rec({ knowledge: { method: "통째로", gate: false, fellBack: false, picked: null, unpicked: null, refs: 3, digestChars: null, layers: [], bonus: { inLayers: 40, picked: 0, unpicked: 0, refs: 40 }, consult: 0 } });
  const neu = rec({ arm: "new", scope: { groups: ["survey", "other"], dropUnits: ["peer_case"], select: true, inspection: false }, knowledge: { method: "선별", gate: true, fellBack: false, picked: 31, unpicked: 94, refs: 3, digestChars: 10, layers: [], bonus: { inLayers: 0, picked: 0, unpicked: 0, refs: 0 }, consult: 0 } });
  const row = { feature: "improve" as const, cardId: "주요사업1/7-가", base, new: neu, problem: null, resolved: resolveAb(ans("A"), { A: "new", B: "base" }), reason: "a | b\n둘째 줄" };
  const t = pairTable([row]).split("\n");
  assert.equal(t.length, 4);
  assert.match(t[2], /\| base \|.*\| 통째로 \| 전부 \|.*\| 40 \| 200 \| 전체 130 \|/);
  // 감싸기 로그가 있으면 첫 호출 입력(전체·호출 수)
  const withCli = pairTable([row], (r) => (r.arm === "new" ? { turns: 3, calls: 2, promptTokens: 60 } : { turns: 7, calls: null, promptTokens: null })).split("\n");
  assert.match(withCli[3], /\| 60\(전체 130·API 2회\) \|/);
  assert.match(withCli[2], /\| 전체 130\(API 3회 이상\) \|/);
  assert.match(t[3], /\| new \|.*\| 선별 31건 \| 2갈래−peer_case \|.*\| 0 \|.*new 승\(중간\) \|$/);
  const v = verdictTable([row, { ...row, resolved: undefined, problem: "한쪽만 있음(new 없음)" }]).split("\n");
  assert.match(v[2], /new 승\(중간\) \| 2→5 · 2→5 \| 3→0 \| a ／ b 둘째 줄 \|$/);
  assert.match(v[3], /한쪽만 있음/);
});

test("cliLogIndex: 감싸기 로그 줄 → 턴 수·API 호출 수·첫 호출 입력(합계=마지막이면 1회, 아니면 합계−마지막), 못 읽는 줄·셀 수 없는 것", () => {
  const it = (i: number, o: number, r: number, w: number) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: r, cache_creation_input_tokens: w });
  const one = { num_turns: 2, usage: { ...it(2, 10, 0, 100), iterations: [it(2, 10, 0, 100)] } };
  // 실제 줄 꼴(2026-11-21): 합계 244,682 = 첫 호출 112,607 + 마지막 132,075
  const two = { num_turns: 3, usage: { ...it(6, 23787, 224840, 19836), iterations: [it(4, 4361, 112605, 19466)] } };
  const many = { num_turns: 5, usage: { ...it(0, 1, 300, 0), iterations: [it(0, 1, 100, 0)] } };
  const idx = cliLogIndex([`t1\t${JSON.stringify(one)}`, "깨진 줄", `t2\t{안 맞는 JSON`, `t3\t${JSON.stringify(two)}`, `t4\t${JSON.stringify(many)}`].join("\n"));
  assert.equal(idx.size, 3);
  assert.deepEqual(idx.get(usageKey({ input: 2, output: 10, cacheRead: 0, cacheWrite: 100 })), { turns: 2, calls: 1, promptTokens: 102 });
  assert.deepEqual(idx.get(usageKey({ input: 6, output: 23787, cacheRead: 224840, cacheWrite: 19836 })), { turns: 3, calls: 2, promptTokens: 112607 });
  assert.deepEqual(idx.get(usageKey({ input: 0, output: 1, cacheRead: 300, cacheWrite: 0 })), { turns: 5, calls: null, promptTokens: null });
  const m = recordMetrics(rec(), undefined, { turns: 2, calls: 2, promptTokens: 77 });
  assert.equal(m.promptTokens, 77);
  assert.equal(m.apiCalls, 2);
  assert.equal(m.inputTokens, 130);
  assert.equal(recordMetrics(rec(), undefined, { turns: 5, calls: null, promptTokens: null }).promptTokens, undefined);
});

test("summarizeAb: 두 갈래 모두 로그가 있으면 (4)는 첫 호출 입력으로, 하나라도 없으면 CLI 입력 전체로", () => {
  const m = (inputTokens: number, promptTokens?: number) => ({ requestChars: 1, inputTokens, outputTokens: 1, sec: 1, ...(promptTokens === undefined ? {} : { promptTokens }) });
  const p = (b: ReturnType<typeof m>, n: ReturnType<typeof m>): AbPairOutcome => ({ feature: "improve", uid: "u", cardId: "c", metrics: { base: b, new: n }, blindBreak: [] });
  // 전체 입력은 new가 더 크지만(재호출) 첫 호출 입력은 new가 작음
  const logged = summarizeAb([p(m(100, 100), m(150, 60))], { base: 0, new: 0 }).groups.writer;
  assert.equal(logged.tokenBasis, "첫 API 호출 입력");
  assert.deepEqual(logged.promptTokens, { base: 100, new: 60 });
  assert.equal(logged.criteria.fewerTokens, true);
  const mixed = summarizeAb([p(m(100, 100), m(150, 60)), p(m(100), m(90))], { base: 0, new: 0 }).groups.writer;
  assert.equal(mixed.tokenBasis, "CLI 입력 전체");
  assert.equal(mixed.promptTokens, null);
  assert.equal(mixed.criteria.fewerTokens, false);
});

test("joinedKeys·abKeyCandidates: 붙여 쓴 key(가운뎃점 ··ㆍ)를 앞부분/<마디> 둘 이상으로 펼침, 끝 문장부호는 뗌, 그냥 글은 그대로", () => {
  assert.deepEqual(joinedKeys("근거는 qa25-mg-04/q09·q10 답변"), ["qa25-mg-04/q09", "qa25-mg-04/q10"]);
  assert.deepEqual(joinedKeys("att3-2604/s5/Q35/part1·part2. 와 rpt25-biz/BZ-2/2-2/가ㆍ나ㆍ다"), ["att3-2604/s5/Q35/part1", "att3-2604/s5/Q35/part2", "rpt25-biz/BZ-2/2-2/가", "rpt25-biz/BZ-2/2-2/나", "rpt25-biz/BZ-2/2-2/다"]);
  assert.deepEqual(joinedKeys("붙여 쓴 것 없음 qa25-mg-04/q09 그리고 방송·법률"), []);
  // select-judge-core의 keyCandidates는 앞 key만 — 감싼 것은 둘 다, 조사(과·의)를 뗀 key도 후보(DB에 없는 후보는 심사기가 거름)
  const ks = abKeyCandidates("qa25-mg-04/q09·q10과 mid25-mg/MG-4/04의 지적");
  for (const k of ["qa25-mg-04/q09", "qa25-mg-04/q10", "mid25-mg/MG-4/04"]) assert.ok(ks.includes(k), k);
  assert.deepEqual(joinedKeys("qa25-mg-04/q09·q10의"), ["qa25-mg-04/q09", "qa25-mg-04/q10의", "qa25-mg-04/q10"]);
  // 마디 전체가 한글인 key는 자르지 않음
  assert.deepEqual(abKeyCandidates("rpt25-biz/BZ-2/2-2/가"), ["rpt25-biz/BZ-2/2-2/가"]);
});

test("abMentionedKeys: 질문·코멘트·작성지원 모두 붙여 쓴 key를 펼침(작성지원은 제안 이유의 것도)", () => {
  assert.ok(abMentionedKeys("chat", { answer: "근거: qa25-mg-04/q09·q10" }).includes("qa25-mg-04/q10"));
  assert.ok(abMentionedKeys("comment", { comments: [{ id: "c1", outcome: "answered", reply: "qa25-mg-04/q09·q10 참고", edits: [], dropped: 0 }] }).includes("qa25-mg-04/q10"));
  const w = { headline: "h", summary: "s", citations: [{ key: "k/1", title: "", quote: "", verified: true }], suggestions: [{ kind: "text", targetPath: "a.0", period: null, current: null, proposed: ["x"], reason: "qa25-mg-04/q09·q10의 15명 → 18명", sourceKeys: [], applicable: true }] };
  const ks = abMentionedKeys("improve", w);
  for (const k of ["k/1", "qa25-mg-04/q09", "qa25-mg-04/q10"]) assert.ok(ks.includes(k), k);
});

test("심사 묶음: 컨설팅 의견은 「근거 아님 — 점검 관점」 6절, 점검표 요약은 7절 — 없으면 절이 없음", () => {
  const base = { feature: "reflect" as const, cardId: "경영관리4/4-1", duty: "d", cardText: "c", answerA: "a", answerB: "b", chunks: [], files: [] };
  const p = buildAbPacket({ ...base, consult: [{ key: "consult26-mg/r1/4-1", title: "의견", text: "점검 관점 글" }], inspection: "점검표 요약 글" });
  assert.match(p, /## 6\. 이 카드의 외부 컨설팅 의견\(1건\) — 근거 아님 — 점검 관점/);
  assert.ok(p.includes("[consult26-mg/r1/4-1] 의견\n점검 관점 글"));
  assert.match(p, /## 7\. 최근 점검표 요약[^\n]*\n점검표 요약 글\n\n=====/);
  const q = buildAbPacket(base);
  assert.doesNotMatch(q, /## 6\.|## 7\./);
  assert.match(q, /\(없음\)\n\n=====\n/);
});

test("parseAttachArg: 카드 id=파일[+파일], 쉼표로 여러 카드, 같은 카드는 합침, 모양이 틀리면 오류", () => {
  assert.deepEqual([...parseAttachArg("주요사업3/5-가=a.docx+b.hwpx,경영관리4/4-1=c.docx")], [["주요사업3/5-가", ["a.docx", "b.hwpx"]], ["경영관리4/4-1", ["c.docx"]]]);
  assert.deepEqual([...parseAttachArg("x=a, x=b")], [["x", ["a", "b"]]]);
  assert.equal(parseAttachArg(undefined).size, 0);
  assert.throws(() => parseAttachArg("a.docx"), /--attach 형식/);
  assert.throws(() => parseAttachArg("x="), /--attach 형식/);
});

test("combineRounds·roundsTable: 쌍마다 회차별 결론·new 승률·오류 평균·첫 호출 입력 평균, 모든 회차를 모은 통과 기준", () => {
  const m = (pt?: number) => ({ requestChars: 10, inputTokens: 100, outputTokens: 1, sec: 1, ...(pt === undefined ? {} : { promptTokens: pt }) });
  const po = (feature: AbPairOutcome["feature"], cardId: string, winner: "A" | "B" | "비슷", key: { A: "base" | "new"; B: "base" | "new" }, ptB?: number, ptN?: number): AbPairOutcome => ({
    feature, uid: cardId, cardId, resolved: resolveAb(ans(winner), key), metrics: { base: m(ptB), new: m(ptN) }, blindBreak: [],
  });
  // ans(): A의 오류 0, B는 지어냄 2 + 사실 오류 1
  const c = combineRounds([
    { round: "r1", pairs: [po("discover", "주요사업3/5-가", "A", { A: "base", B: "new" }, 300, 150), po("chat", "주요사업1/7-가", "비슷", { A: "base", B: "new" })], failures: { base: 0, new: 0 } },
    { round: "r2", pairs: [po("discover", "주요사업3/5-가", "A", { A: "new", B: "base" }, 310, 160)], failures: { base: 0, new: 1 } },
    { round: "r3", pairs: [po("discover", "주요사업3/5-가", "비슷", { A: "new", B: "base" }, 290, 140)], failures: { base: 0, new: 0 } },
  ]);
  assert.deepEqual(c.failures, { base: 0, new: 1 });
  assert.equal(c.pooled.newNoFailures, false);
  assert.equal(c.pooled.groups.writer.pairs, 3);
  assert.deepEqual(c.pooled.groups.writer.verdict, { new: 1, base: 1, 비슷: 1 });
  const d = c.pairs.find((p) => p.feature === "discover")!;
  assert.deepEqual(d.rounds.map((r) => r.winner), ["base", "new", "비슷"]);
  assert.equal(d.newWinRate, 0.33);
  // r1: new가 B(3) · r2·r3: base가 B(3) → base (0+3+3)/3 = 2, new (3+0+0)/3 = 1
  assert.deepEqual(d.ffMean, { base: 2, new: 1 });
  assert.deepEqual(d.promptTokensMean, { base: 300, new: 150 });
  // 기능 순서(작성지원 → 질문), 회차 열, 빠진 회차는 —
  const t = roundsTable(c).split("\n");
  assert.match(t[0], /\| 기능 \| 카드 \| r1 \| r2 \| r3 \|/);
  assert.match(t[2], /^\| 실적 발굴 \| 주요사업3\/5-가 \| base\(중간\) 0→3 \| new\(중간\) 3→0 \| 비슷\(중간\) 3→0 \| 1·1·1 \| 0\.33 \| 2→1 \| 300→150 \|$/);
  assert.match(t[3], /^\| 질문 \| 주요사업1\/7-가 \| 비슷\(중간\) 0→3 \| — \| — \| 0·0·1 \| 0 \|/);
});

test("abChunkBlock·심사 묶음: 조각 제목 줄 뒤에 앱과 같은 위치(쪽수)를 「위치: …」로 — 없으면 예전 블록 그대로, 컨설팅 의견에도", () => {
  const c = { key: "rpt25-mg-09/MG-9/outcome/1/가", title: "가. 계량 성과지표", text: "만족도 82.1점", where: "2025 경영실적보고서 … 가. 계량 성과지표 (p.97)" };
  assert.equal(abChunkBlock(c), "#### [rpt25-mg-09/MG-9/outcome/1/가] 가. 계량 성과지표\n위치: 2025 경영실적보고서 … 가. 계량 성과지표 (p.97)\n만족도 82.1점");
  assert.equal(abChunkBlock({ key: "k/1", title: "t", text: "x" }), "#### [k/1] t\nx");
  // 3,000자 넘는 조각: 자른 표시는 제목 줄에 그대로, 위치는 그다음
  const long = abChunkBlock({ key: "k/2", title: "t", text: "가".repeat(3500), where: "(p.12)" });
  assert.match(long, /^#### \[k\/2\] t \(앞 3000자만 실음 — 원문 3500자\)\n위치: \(p\.12\)\n가/);
  const p = buildAbPacket({ feature: "improve", cardId: "c", duty: "d", cardText: "t", answerA: "a", answerB: "b", chunks: [c], files: [], consult: [{ key: "consult26-mg/r1/9-2", title: "의견", text: "글", where: "1차 컨설팅" }] });
  assert.ok(p.includes("위치: 2025 경영실적보고서 … 가. 계량 성과지표 (p.97)"));
  assert.ok(p.includes("[consult26-mg/r1/9-2] 의견\n위치: 1차 컨설팅\n글"));
});
