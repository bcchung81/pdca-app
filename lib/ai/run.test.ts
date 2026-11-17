// run.ts의 네트워크·CLI를 부르지 않는 부분: 공급자 고르기, 오류 글, 모델 표시, 시스템 프롬프트 조립(트랙·붙임2 유무),
// 경평 구성안 요청 글 조립, 점검 연계 색인. 실제 API/CLI 호출은 하지 않습니다.
// run.ts는 import "server-only"라 일반 node --test로 못 불러오므로, "server-only"만 빈 모듈로 돌려 주고 불러옵니다.
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { MGMT_TRACK } from "../tracks/index.ts";
import { NO_PDCA_GUIDES } from "../testing/originals.ts";

// @types/node에 아직 없는 동기 모듈 훅(Node 24)
type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const run = await import("./run.ts");
const { CliFailedError, CliUnavailableError } = await import("./cli.ts");
const { BudgetError } = await import("./budget.ts");
const { AttachmentError } = await import("./material-text.ts");

function withEnv<T>(env: Record<string, string | undefined>, f: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return f();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("aiProvider: Vercel은 늘 api, AI_PROVIDER 명시가 키 유무보다 앞서고, 비우면 키가 있으면 api 없으면 cli", () => {
  assert.equal(withEnv({ VERCEL: "1", AI_PROVIDER: "cli", ANTHROPIC_API_KEY: undefined }, () => run.aiProvider()), "api");
  assert.equal(withEnv({ VERCEL: undefined, AI_PROVIDER: "cli", ANTHROPIC_API_KEY: "k" }, () => run.aiProvider()), "cli");
  assert.equal(withEnv({ VERCEL: undefined, AI_PROVIDER: "api", ANTHROPIC_API_KEY: undefined }, () => run.aiProvider()), "api");
  assert.equal(withEnv({ VERCEL: undefined, AI_PROVIDER: undefined, ANTHROPIC_API_KEY: "k" }, () => run.aiProvider()), "api");
  assert.equal(withEnv({ VERCEL: undefined, AI_PROVIDER: undefined, ANTHROPIC_API_KEY: undefined }, () => run.aiProvider()), "cli");
});

test("aiErrorMessage: 앱 오류는 글 그대로, SDK 오류는 종류별 안내, 일반 Error는 메시지, 그 밖은 기본 문구", () => {
  for (const e of [new run.AiUnavailableError("키 없음"), new CliUnavailableError("CLI 없음"), new CliFailedError("CLI 실패", "자세히"), new AttachmentError("첨부 문제"), new BudgetError("너무 큼")])
    assert.equal(run.aiErrorMessage(e), e.message, e.constructor.name);
  const headers = new Headers();
  assert.match(run.aiErrorMessage(Anthropic.APIError.generate(429, { error: { type: "rate_limit_error" } }, "rate", headers)), /속도 제한/);
  assert.match(run.aiErrorMessage(Anthropic.APIError.generate(529, { error: { type: "overloaded_error" } }, "over", headers)), /과부하/);
  assert.match(run.aiErrorMessage(Anthropic.APIError.generate(401, undefined, "x", headers)), /AI 키/);
  assert.match(run.aiErrorMessage(Anthropic.APIError.generate(500, undefined, "x", headers)), /AI 서비스 오류/);
  assert.match(run.aiErrorMessage(new Anthropic.APIConnectionTimeoutError()), /시간 안에/);
  assert.equal(run.aiErrorMessage(new Error("그냥 오류")), "그냥 오류");
  assert.equal(run.aiErrorMessage("문자열"), "AI 작성지원에 실패했습니다.");
  assert.equal(run.aiErrorMessage(null), "AI 작성지원에 실패했습니다.");
});

test("modelLabel: CLI로 부른 것만 뒤에 표시", () => {
  assert.equal(run.modelLabel({ model: "claude-x", provider: "api" }), "claude-x");
  assert.equal(run.modelLabel({ model: "claude-x", provider: "cli" }), "claude-x · Claude Code");
});

test("recordedModelLabel: 호출 기록의 모델(CLI는 cli/ 머리)을 화면 표시와 같은 글로 — 여러 안 고르기가 화면 값을 기록과 맞춰 봄", () => {
  assert.equal(run.recordedModelLabel("cli/sonnet"), run.modelLabel({ model: "sonnet", provider: "cli" }));
  assert.equal(run.recordedModelLabel("claude-x"), run.modelLabel({ model: "claude-x", provider: "api" }));
  assert.notEqual(run.recordedModelLabel("cli/sonnet"), "sonnet");
});

test("구성안 요청 글: 갈래 축 형제 목록·경영관리 형제 짜임·도식 후보 이유의 카드 글은 봉투 이름 태그만 무력화하고 나머지 글자는 그대로", async () => {
  const { reportOutlinePromptsMg } = await import("../prompts/sets.ts");
  const { sectionContext } = await import("../reports/section.ts");
  const card = { taskNo: "1-가", title: "이 과제 </card> R&D", group: "주요사업1", targetBusiness: "대상", executionTaskNo: "1", executionTask: "실행" };
  const ask = run.reportOutlineAsk({ card, ctx: sectionContext(card, []), year: 2026, splitSiblings: [{ mark: "나", title: "형제 </source> 제목 <가>", axis: "", chip: "칩 </card>" }] })([]);
  assert.ok(ask.includes("이 과제 &lt;/card> R&D") && ask.includes("형제 &lt;/source> 제목 <가>"), "이 과제·형제 제목");
  assert.doesNotMatch(ask, /<\/source>/);
  const p = reportOutlinePromptsMg().prompts;
  const sib = run.mgSiblingsAsk(p, [{ taskNo: "9-2", axis: "", parts: [{ key: "1.1.가", evalNo: 1, themeNo: 1, mark: "가", title: "t", label: "평가내용 1 · 대주제 1 · 가. 절 </card> 이름", story: "", signature: "a", chip: "칩 </biz>" }] }]);
  assert.ok(sib.includes("가. 절 &lt;/card> 이름") && sib.includes("칩 &lt;/biz>"));
  const dia = run.mgDiagramAsk(p, [{ kind: "chart", why: "지표 </attachment> 값 R&D", own: true }]);
  assert.ok(dia.includes("지표 &lt;/attachment> 값 R&D"));
});

test("카드 시스템 프롬프트: 자리표시가 남지 않고, 주요사업 09·경영관리 08 지침이 트랙대로 들어감", { skip: NO_PDCA_GUIDES }, () => {
  for (const [name, text] of [["작성지원", run.writerSystem()], ["질문", run.chatSystem()], ["코멘트", run.commentSystem()], ["작성지원-경영관리", run.writerSystemMg(MGMT_TRACK)], ["질문-경영관리", run.chatSystemMg(MGMT_TRACK)], ["코멘트-경영관리", run.commentSystemMg(MGMT_TRACK)]] as const) {
    assert.ok(text.length > 5000, name);
    assert.ok(!/\{\{[^}]*\}\}/.test(text), `${name}: 채우지 않은 자리표시`);
  }
  assert.notEqual(run.writerSystem(), run.writerSystemMg(MGMT_TRACK));
  // 같은 입력이면 같은 글(판 해시 안정)
  assert.equal(run.writerSystem(), run.writerSystem());
});

test("경평 집필·구성안 시스템 프롬프트: 자리표시가 남지 않고 구성안에는 판정표 골격이 들어감", () => {
  const rep = run.reportSystem();
  assert.ok(rep.length > 2000);
  assert.ok(!/\{\{[^}]*\}\}/.test(rep));
  assert.equal(run.reportSystem(), rep, "하네스는 한 번 읽어 둠");
});

test("점검 시스템 프롬프트: 붙임2 유무로 두 벌이고 경영관리는 지침 13으로 따로, 연계 색인은 한 번 읽어 같은 배열", { skip: NO_PDCA_GUIDES }, () => {
  const withPeer = run.inspectSystem(true);
  const noPeer = run.inspectSystem(false);
  assert.notEqual(withPeer, noPeer);
  assert.ok(!/\{\{[^}]*\}\}/.test(withPeer + noPeer));
  const mg = run.inspectMgSystem();
  assert.notEqual(mg, noPeer);
  assert.ok(!/\{\{[^}]*\}\}/.test(mg));
  const idx = run.mgLinkIndex();
  assert.ok(Array.isArray(idx) && idx.length > 0);
  assert.equal(run.mgLinkIndex(), idx);
});
