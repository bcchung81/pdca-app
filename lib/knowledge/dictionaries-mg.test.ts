import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMgmtUnit } from "./dictionaries-mg.ts";

test("경영관리 지표 사전: 자료마다 다른 이름(편람·체크리스트·핵심공통항목·중간보고서 절)을 지표 N으로", () => {
  const cases: Array<[string, string | null]> = [
    ["(1) 전략기획", "MG-1"], ["리더십 및 전략기획", "MG-1"], ["윤리경영", "MG-2"], ["(1) 일자리 및 균등한 기회", "MG-3"],
    ["일자리 및 균등한 기회(㉮일자리 창출과 공정한 채용)", "MG-3"], ["안전 및 재난관리", "MG-4"], ["(3) 친환경‧탄소중립", "MG-5"],
    ["(4) 창업 및 경제활성화", "MG-6"], ["(5) 상생․협력 및 지역발전", "MG-7"], ["재무예산관리", "MG-8"], ["(1) 조직 및 인적자원관리", "MG-9"],
    ["일·가정 양립", "MG-9"], ["노사관계", "MG-10"], ["(3) 보수 및 복리후생", "MG-11"], ["직무중심 보수", "MG-11"],
    ["안전한 일터 조성을 위한 노력과 성과(혁신가점)", "MG-12"], ["AI 활용을 통한 ‘기관 생산성’·‘대국민 공공서비스’·‘근로자 안전’ 혁신 등을 위한 노력과 성과", "MG-13"],
    ["국정과제 등 핵심정책 이행을 위한 노력과 성과", "MG-14"],
  ];
  for (const [text, unit] of cases) assert.equal(resolveMgmtUnit(text).unit, unit, text);
});

test("카드가 없는 평가 항목은 안다고만(단위 없음), 모르는 이름은 known=false — 추측으로 잇지 않음", () => {
  for (const t of ["(2) 국민소통", "재무예산성과", "(3) 효율성 관리", "(4) 총인건비 관리", "주요사업 성과관리의 적정성"]) {
    const r = resolveMgmtUnit(t);
    assert.deepEqual([r.unit, r.known], [null, true], t);
  }
  assert.deepEqual(resolveMgmtUnit("처음 보는 지표"), { unit: null, known: false, alias: null });
  assert.equal(resolveMgmtUnit("").known, false);
  // 짧은 이름이 다른 지표에 끼지 않음: 「안전한 일터」는 12, 「안전 및 재난관리」는 4
  assert.equal(resolveMgmtUnit("안전한 일터 조성").unit, "MG-12");
  assert.equal(resolveMgmtUnit("안전 및 재난 관리").unit, "MG-4");
});
