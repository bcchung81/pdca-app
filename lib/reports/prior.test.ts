import assert from "node:assert/strict";
import { test } from "node:test";
import { PRIOR_MIN_SCORE, type PriorSection, pickPrior, priorLabel, scorePrior } from "./prior.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const seed = { cards: seedCards<Record<string, unknown>>() };
const card = seed.cards.find((c) => c.id === "주요사업1/1-가")!;
const sec = (key: string, title: string, text: string, taskTitle = ""): PriorSection => ({ key, business: "BZ-1", taskNo: key.split("/")[2], mark: key.split("/")[3], title, taskTitle, targetName: "전파품질 향상", page: 119, text });

test("전년 절 고르기: 같은 일을 한 절이 첫째, 기준 아래는 없음, 둘째는 첫째의 80% 이상일 때만", { skip: NO_SEED_CARDS }, () => {
  const secs = [
    sec("rpt25-biz/BZ-1/1-1/가", "“철탑 오름 없이 안전하게” AI 이미지 분석 기술로 현장 위험 원천 차단", "안테나 검사 사다리 철탑 추락 위험 AI 판독 시스템 개발 수도권 적용 안테나 제원 자동 분석", "AI･디지털 스마트 전파 검사 체계"),
    sec("rpt25-biz/BZ-1/2-3/나", "조류탐지레이더 주파수 신속 공급을 통한 항공 안전 강화", "조류 충돌 항공기 레이더 주파수 공급 기간 단축"),
    sec("rpt25-biz/BZ-1/2-4/가", "아날로그 무전기 이용종료 인식 확산", "생활무전기 판매자 구매자 홍보 단속"),
  ];
  const scored = scorePrior(card, secs);
  assert.equal(scored.length, 3);
  assert.equal(scored[0].section.key, "rpt25-biz/BZ-1/1-1/가");
  const picks = pickPrior(card, secs);
  assert.deepEqual(picks.map((p) => p.section.key), ["rpt25-biz/BZ-1/1-1/가"], "엉뚱한 절은 둘째로 오지 않음");
  assert.ok(picks[0].score >= PRIOR_MIN_SCORE);
  // 전혀 다른 일(방송·기금·자격)만 있으면 기준 아래라 넣지 않음
  const far = [
    sec("rpt25-biz/BZ-3/1-1/가", "K-콘텐츠 글로벌 도약", "방송 콘텐츠 제작 스튜디오 해외 유통 드라마 예능"),
    sec("rpt25-biz/BZ-3/2-2/나", "ICT기금 자산운용", "기금 자산 운용 수익률 채권 주식 위험관리"),
    sec("rpt25-biz/BZ-2/2-1/나", "국가자격 품질 제고", "자격 시험 응시 수험자 문제 출제 채점 합격"),
    sec("rpt25-biz/BZ-2/2-3/나", "청각장애인 들을 권리", "청각 장애 보청 자막 공연장 축제 군중"),
  ];
  assert.deepEqual(pickPrior(card, far), [], "닮은 절이 없으면 빈 목록");
  assert.deepEqual(pickPrior(card, []), []);
  assert.equal(priorLabel(secs[0]), "2025 보고서 1-1 가. “철탑 오름 없이 안전하게” AI 이미지 분석 기술로 현장 위험 원천 차단(p.119)");
});

test("전년 절 고르기: 카드 지적 칸이 「경영평가 지적사항 없음」이면 그 줄은 닮은 정도에 안 들어감(findings.ts cardFindings — 2026-10-14)", () => {
  const secs = [sec("rpt25-biz/BZ-1/9-9/가", "경영평가 지적사항 대응", "경영평가 지적사항 없음 지적사항 조치"), sec("rpt25-biz/BZ-1/8-8/가", "생활무전기", "무전기 판매 단속")];
  const base = { title: "철도 전파 관리", act: { findings: [] as string[] } };
  const none = { ...base, act: { findings: ["∙ 경영평가 지적사항 없음"] } };
  assert.deepEqual(scorePrior(none, secs), scorePrior(base, secs), "「없음」 줄은 빈 지적 칸과 같은 점수");
  const real = { ...base, act: { findings: ["∙ 경영평가 지적사항 조치 미흡"] } };
  assert.ok(scorePrior(real, secs)[0].score > scorePrior(base, secs)[0].score, "실제 지적 줄은 그대로 셈");
});
