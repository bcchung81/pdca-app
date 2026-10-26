// 경영관리 평가지표 14개(지침 08 지표 번호 1~14, 12~14는 혁신가점) — 평가단위(`eval_units`)·공통 지식 단위(`knowledge_chunks.business`) id와 카드 묶음 이름(`경영관리N`)의 정본(순수).
// 카드 한 장은 과제번호 「지표명 N-M」의 N에 해당하는 지표 단위에 속한다(카드 id `경영관리N/N-M`, 평가단위 `MG-N`).

export interface MgmtIndicator {
  no: number;
  /** eval_units.id */
  id: string;
  /** eval_units.card_group = 카드 id의 앞부분 */
  group: string;
  name: string;
  /** 파일 머리의 묶음(5개) */
  bundle: string;
}

const row = (no: number, name: string, bundle: string): MgmtIndicator => ({ no, id: `MG-${no}`, group: `경영관리${no}`, name, bundle });

export const MGMT_INDICATORS: readonly MgmtIndicator[] = [
  row(1, "전략기획", "경영전략"),
  row(2, "윤리경영", "경영전략"),
  row(3, "일자리 및 균등한 기회", "안전 및 책임경영"),
  row(4, "안전 및 재난관리", "안전 및 책임경영"),
  row(5, "친환경·탄소중립", "안전 및 책임경영"),
  row(6, "창업 및 경제활성화", "안전 및 책임경영"),
  row(7, "상생·협력 및 지역발전", "안전 및 책임경영"),
  row(8, "재무예산관리", "재무성과관리"),
  row(9, "조직 및 인적자원관리", "조직 운영 및 관리"),
  row(10, "노사관계", "조직 운영 및 관리"),
  row(11, "보수 및 복리후생", "조직 운영 및 관리"),
  row(12, "안전한 일터 조성", "혁신노력과 성과"),
  row(13, "AI 활용 혁신", "혁신노력과 성과"),
  row(14, "국정과제 핵심정책 이행", "혁신노력과 성과"),
];

export const mgmtIndicatorByNo = (no: number) => MGMT_INDICATORS.find((x) => x.no === no) ?? null;
