// 경평 초안 문장 점검(lib/reports/prose.ts) 순수 로직 시험 — docs/plan/경평초안-문장품질-수정안.md P7.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { isListed, proseIssues } from "./prose.ts";
import { type Marker, readSection } from "./section.ts";

const ROOT = resolve(import.meta.dirname, "../..");

const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const spec = (over: Partial<{ blocks: Block[]; results: string[]; sub: { title: string; mark: string; markers: Marker[] } }> = {}) => ({
  blocks: [] as Block[],
  results: [] as string[],
  sub: { mark: "가", title: "제목", markers: [] as Marker[] },
  ...over,
});

test("isListed: 2025 모범 문장(쉼표 1·가운뎃점 1)은 나열 아님, 쉼표 2 이상이거나 가운뎃점 3 이상·쉼표1+가운뎃점2 이상이면 나열", () => {
  assert.equal(isListed("안테나 검사를 위한 사다리･철탑 작업은 추락 위험 상시 노출, 현장 여건상 안테나 제원 확인 한계"), false, "쉼표 1·가운뎃점 1 — 걸리지 않음");
  assert.equal(isListed("RIMS에 적용 여부･판독･사후검증 시간 입력･관리"), true, "가운뎃점 4 ≥ 3");
  assert.equal(isListed("산악 커버리지 분석, 현장 전파수신레벨 수집, 신속 서비스용 집중 검사 운영"), true, "쉼표 2 ≥ 2");
  assert.equal(isListed("본부별 판독 정확도･사후검증 시간 모니터링, 제원정보･설치환경 공유"), true, "쉼표 1 + 가운뎃점 2 ≥ 2");
});

test("isListed: 괄호 안 쉼표는 세지 않음", () => {
  assert.equal(isListed("전국 확산(수도권, 지방본부) 추진"), false, "괄호 안 쉼표는 걷고 셈 — 밖에는 쉼표가 없어 나열 아님");
  assert.equal(isListed("전국 확산(수도권, 지방본부), 검증 강화"), false, "괄호 밖 쉼표는 1개뿐 — 나열 기준 미달");
  assert.equal(isListed("전국 확산(수도권, 지방본부), 검증･품질･강화"), true, "괄호를 걷어도 밖 쉼표 1 + 가운뎃점 2 ≥ 2면 나열");
});

test("proseIssues: 관리 정보(예산·인원)만 적은 글은 걸리고, 절감·절약 성과 글은 안 걸림", () => {
  const withAdmin = proseIssues(spec({ blocks: [blk("bullets", { label: "추진체계", items: ["본사 2명･자체 예산 운영"] })] }));
  assert.ok(withAdmin.some((x) => x.startsWith("관리 정보(예산·인원)")), "본사 N명·자체 예산은 관리 정보");
  const saving = proseIssues(spec({ blocks: [blk("bullets", { label: "추진성과", items: ["예산 3백만원 절감"] })] }));
  assert.ok(!saving.some((x) => x.startsWith("관리 정보(예산·인원)")), "절감을 말하는 글은 관리 정보로 안 잡음");
});

test("proseIssues: 수치 띠 큰 수치가 투입 인력·예산 액수면 관리 정보(라운드 S 3-2-가), 결과·규모 수치와 절감은 안 걸림, 뜻 줄이 이미 걸린 칸은 한 번만", () => {
  const cell = (tag: string, head: string, bullet: string) => ({ tag, head, bullets: [bullet], note: "’26년" });
  const s = (cells: ReturnType<typeof cell>[]) => proseIssues(spec({ blocks: [blk("stats", { cells })] })).find((x) => x.startsWith("관리 정보(예산·인원)")) ?? "";
  assert.match(s([cell("인력", "6명", "과제 투입인력(본사)"), cell("예산", "2,700백만원", "과제 협약 예산"), cell("추진과제", "4대 과제", "3개 영역을 TF 하나로 연계")]), /^관리 정보\(예산·인원\)만 적은 글 2개/);
  assert.equal(s([cell("", "1건", "공공성 강화 TF 구성･운영"), cell("", "2,380명", "정보보호 전문인력 배출(’24년 1,135명)"), cell("", "3백만원", "예산 절감")]), "", "결과·규모 수치·절감은 안 걸림");
  assert.match(s([cell("", "10백만원", "자체 예산으로 통신 개선 추진")]), /^관리 정보\(예산·인원\)만 적은 글 1개/, "뜻 줄이 이미 관리 정보면 한 번만 셈");
});

test("proseIssues: 풀지 않은 약어는 걸리고, 초안 어디든 풀이가 있으면 안 걸리며, 널리 아는 약어(AI·KCA)는 안 걸림", () => {
  const bare = proseIssues(spec({ blocks: [blk("bullets", { label: "추진내용", items: ["RIMS 연계로 판독 결과 관리"] })] }));
  assert.ok(bare.some((x) => x.startsWith("풀지 않은 약어") && x.includes("RIMS")));
  const resolved = proseIssues(
    spec({
      blocks: [blk("bullets", { label: "추진내용", items: ["RIMS 연계로 판독 결과 관리"] }), blk("bullets", { label: "정의", items: ["무선국검사관리시스템(RIMS)에 결과를 기록"] })],
    }),
  );
  assert.ok(!resolved.some((x) => x.startsWith("풀지 않은 약어")), "풀이가 다른 칸에라도 있으면 안 걸림");
  const known = proseIssues(spec({ blocks: [blk("bullets", { label: "추진내용", items: ["AI 판독을 KCA가 전국에 확산"] })] }));
  assert.ok(!known.some((x) => x.startsWith("풀지 않은 약어")), "AI·KCA는 널리 아는 약어");
});

test("proseIssues 약어: 2025 최종본이 풀지 않고 쓴 약어(TF·PoC·OTT)·단계 표지·규격 번호·자리표시·K- 사업 이름은 안 걸리고, 내부 시스템 이름은 그대로 걸림(2026-10-10 보정)", () => {
  const items = ["기관합동 TF 구성으로 확산", "AI PoC 9개로 업무시간 단축", "OTT 사업자 협의", "Step1 진단 → Step2 개선", "ISO45001 인증 유지", "OO팀과 협업", "K-DOCS 페스티벌 개최"];
  const none = proseIssues(spec({ blocks: [blk("bullets", { label: "추진내용", items })] }));
  assert.ok(!none.some((x) => x.startsWith("풀지 않은 약어")), none.join("\n"));
  const still = proseIssues(spec({ blocks: [blk("bullets", { label: "추진내용", items: [...items, "RIMS 연계로 판독 결과 관리"] })] }));
  assert.ok(still.some((x) => x.startsWith("풀지 않은 약어 RIMS —")), still.join("\n"));
});

test("proseIssues: 라벨·제목의 평가 대응 말(지적·산정·재산정·보조지표)은 걸림", () => {
  const label = proseIssues(spec({ blocks: [blk("bullets", { label: "’25 지적 개선", items: ["현장 확인 절차를 정비함"] })] }));
  assert.ok(label.some((x) => x.startsWith("제목·라벨에 평가 대응 말") && x.includes("’25 지적 개선")));
  const title = proseIssues(spec({ sub: { mark: "가", title: "성과 재산정과 검증 체계 강화", markers: [] } }));
  assert.ok(title.some((x) => x.startsWith("제목·라벨에 평가 대응 말") && x.includes("성과 재산정")));
});

test("proseIssues: 인용·말풍선 칸 글과 막대(chart) 수치는 보지 않음", () => {
  const quoted = proseIssues(
    spec({
      blocks: [blk("quotes", { cells: [{ head: "", tag: "", bullets: ["시설 요청 시에만 측정, 확인이 어려움, 개선 필요, 지원 확대"], note: "" }] }), blk("chart", { series: [{ label: "’25년", value: "RIMS 연계" }] })],
    }),
  );
  assert.deepEqual(quoted, [], "인용 칸 글의 나열·막대의 약어는 보지 않음");
});

test("proseIssues: 문제가 없으면 빈 배열", () => {
  assert.deepEqual(proseIssues(spec({ blocks: [blk("bullets", { label: "추진배경", items: ["철탑에 오르지 않는 AI 안테나 판독으로 추락 위험 해소"] })], results: ["검사 소요시간 절감"] })), []);
});

// 실제 평가 라운드 초안(M, 주요사업1/1-가) — 평가 산출물(docs/analysis/eval/ — git 밖)에서 테스트 고정값으로 복사해 둠(2026-09-28, 늘 돌게)
const mFile = join(ROOT, "lib/reports/fixtures/prose-m-biz1_1-ga.json");
test("proseIssues: 실제 M 초안(주요사업1/1-가)은 나열·풀지 않은 약어·라벨의 평가 대응 말이 모두 나옴", { skip: !existsSync(mFile) && "M 초안 고정 자료(lib/reports/fixtures/prose-m-biz1_1-ga.json — git 밖, 공개 저장소에서 뺌)가 없음" }, () => {
  const raw = JSON.parse(readFileSync(mFile, "utf8"));
  const s = readSection(raw);
  assert.ok(s, "M 초안 spec을 읽음");
  const issues = proseIssues(s!);
  assert.ok(issues.some((x) => x.startsWith("한 칸에 서로 다른 항목을 나열한 글")), "나열");
  assert.ok(issues.some((x) => x.startsWith("풀지 않은 약어") && x.includes("RIMS")), "풀지 않은 약어 RIMS");
  assert.ok(issues.some((x) => x.startsWith("제목·라벨에 평가 대응 말")), "제목·라벨의 지적·재산정");
});
