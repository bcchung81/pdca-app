// 캡처 계획(pnpm e2e:shots의 인자) 읽기·검증·쓰기 미리보기 — 순수 모듈(DB·브라우저·환경변수 없음).
// 계약: data/manual/dept-user/shots-plan-contract.md. 직접 실행하면 검증만 합니다: node scripts/e2e/shot-plan.mjs <계획.json | @경로>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const WHO = ["anon", "dept", "pmo", "admin"];
export const BADGES = ["tl", "tr", "bl", "br"];
/** 시험 계정(도구가 만들고 끝에 지움) — 이메일은 모두 pdca-shot- 로 시작(정리·남은 것 확인의 열쇠) */
export const SHOT_USERS = {
  dept: { email: "pdca-shot-dept@kca.kr", role: "dept_user" },
  pmo: { email: "pdca-shot-pmo@kca.kr", role: "pmo" },
  admin: { email: "pdca-shot-admin@kca.kr", role: "admin" },
};
// 이 이름이 든 클릭은 데이터를 바꾸거나 메일·AI를 일으키므로 계획에서 거부(계약 §4). 「초안 열기」는 허용.
// 「확인했습니다」(점검 확인)·「다른 모양」(AI 미리보기)·「자료 반영 고치기」·「…만들기」(AI 요청)·「다시 받기」(메일)·「…지우기」·「…바꾸기」·「…줄이기」·「되돌리기」도 거부,
// 이름이 「요청」으로 끝나는 보내기 단추(「실적 반영 요청」·「구성안 다시 만들기 요청」 등)도 거부
export const FORBIDDEN_CLICKS = [
  "확정", "카드에 반영", "로그인 메일 받기", "구성안 다시 만들기", "구성안 만들기", "구성안대로 집필", "승인하고 집필",
  "초안 쓰기", "실적 저장", "삭제", "저장", "보내기", "올리기", "제출", "승인", "AI 수정 요청", "요청 보내기",
  "확인했습니다", "다른 모양", "자료 반영 고치기", "만들기", "다시 받기", "지우기", "바꾸기", "줄이기", "되돌리기",
];
/** 금지어가 들었어도 이름이 정확히 이것이면 허용(확인 창만 엶 — 창 안의 「확정」은 계속 금지) */
export const CLICK_ALLOW = ["확정(원장 반영)"];
/** 카드에 적힌 담당자·팀장 이름에 붙는 맨 끝 직함(긴 것부터 맞춤) */
export const TITLES = ["본부장", "팀장", "부장", "차장", "과장", "대리", "사원", "주임", "선임", "책임", "수석", "연구원", "주무관"];
/** 카드 속 이름용 가상 이름(프로필용 PSEUDO와 겹치지 않음 — shots.mjs의 PSEUDO 참고) */
export const CARD_PSEUDO = ["송도윤", "문하윤", "신예준", "류서진", "고은채"];
const TITLE_RE = new RegExp(`\\s*(${[...TITLES].sort((a, b) => b.length - a.length).join("|")})$`);

/**
 * 카드 칸 값(예: 「가나다 팀장」, 「가나다 팀장 / 라마바 과장」)에서 가림 쌍을 만듦. alias = 가상 이름(글) 또는 이름 → 가상 이름 함수.
 * 사람마다 [값 전체 → 가상 이름+직함], [이름 → 가상 이름], [공백 뺀 이름 → 가상 이름]. 이름(공백 뺀 것)이 한글 2~4자일 때만. 같은 쌍은 한 번만
 */
export function personMaskPairs(value, alias) {
  const out = [], seen = new Set();
  const add = (a, b) => { if (a && a !== b && !seen.has(a)) { seen.add(a); out.push([a, b]); } };
  for (const raw of String(value ?? "").split(/[/,]/)) {
    const whole = raw.trim().replace(/\s+/g, " ");
    const m = TITLE_RE.exec(whole);
    const title = m ? m[1] : "";
    const name = (m ? whole.slice(0, m.index) : whole).trim();
    const flat = name.replace(/\s+/g, "");
    if (!/^[가-힣]{2,4}$/.test(flat)) continue;
    const al = typeof alias === "function" ? alias(flat) : alias;
    add(whole, al + (title ? ` ${title}` : ""));
    add(name, al);
    add(flat, al);
  }
  return out;
}

/** 화면별 창 크기 옵션 검사 */
function checkViewport(v, at) {
  if (!isObj(v)) return [`${at}: viewport는 { width, height } 객체여야 합니다`];
  const errs = [];
  for (const k of ["width", "height"]) if (!(Number.isInteger(v[k]) && v[k] > 0)) errs.push(`${at}: ${k}는 양의 정수여야 합니다`);
  for (const k of Object.keys(v)) if (k !== "width" && k !== "height") errs.push(`${at}: 알 수 없는 키 「${k}」`);
  return errs;
}

const TARGET_KEYS = ["role", "text", "label", "title", "placeholder", "css"];
/** path·steps 안의 {{uid:평가단위:과제번호}} */
export const UID_RE = /\{\{uid:([^:}]+):([^}]+)\}\}/g;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** 인자를 계획 객체로. `@경로`는 파일, `{`·`[`로 시작하면 JSON 문자열. 옛 배열 형식은 {shots}로 정규화 */
export function loadPlan(arg) {
  let text = String(arg ?? "").trim();
  if (text.startsWith("@")) text = readFileSync(text.slice(1), "utf8").trim();
  if (!text.startsWith("{") && !text.startsWith("[")) throw new Error("계획은 @파일경로 또는 JSON({…} / […])이어야 합니다");
  const v = JSON.parse(text);
  return Array.isArray(v) ? { shots: v } : v;
}

/** 클릭 이름에 금지어가 있으면 그 금지어, 없으면 null. CLICK_ALLOW와 정확히 같은 이름만 예외 */
export function forbiddenClick(name) {
  const s = String(name).trim();
  if (CLICK_ALLOW.includes(s)) return null;
  return FORBIDDEN_CLICKS.find((w) => s.includes(w)) ?? (/요청$/.test(s) ? "…요청" : null);
}

/** 점검월·작성 기간 모양(YYYY-MM) */
export const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** seedInspection.card 「평가단위:과제번호」 → [평가단위, 과제번호] (모양이 틀리면 null) */
export function parseCardRef(s) {
  const m = /^([^:\s]+):([^:\s]+)$/.exec(String(s ?? ""));
  return m ? [m[1], m[2]] : null;
}
const refKey = (unit, no) => `${unit}:${no}`;
/** 글 속 {{uid:평가단위:과제번호}}들 → 「평가단위:과제번호」 목록 */
const uidRefs = (v) => [...JSON.stringify(v ?? "").matchAll(UID_RE)].map((m) => refKey(m[1], m[2]));
/** 데이터를 쓰는 단계(upload·seedInspection·type) */
export const WRITE_STEPS = ["upload", "seedInspection", "type"];
const stepsOf = (shot) => (Array.isArray(shot?.[3]?.steps) ? shot[3].steps.filter(isObj) : []);

/** 대상 모양 검사. 오류 문자열 배열 */
function checkTarget(t, at, { click = false } = {}) {
  if (!isObj(t)) return [`${at}: 대상은 객체여야 합니다`];
  const keys = TARGET_KEYS.filter((k) => k in t);
  if (keys.length !== 1) return [`${at}: 대상은 ${TARGET_KEYS.join("·")} 중 하나만 가져야 합니다`];
  const errs = [];
  const k = keys[0];
  if (typeof t[k] !== "string" || !t[k]) errs.push(`${at}: ${k}는 비어 있지 않은 글이어야 합니다`);
  if (k === "role" && (typeof t.name !== "string" || !t.name)) errs.push(`${at}: role 대상에는 name이 필요합니다`);
  if ("nth" in t && !(Number.isInteger(t.nth) && t.nth >= 0)) errs.push(`${at}: nth는 0 이상 정수여야 합니다`);
  if ("exact" in t && typeof t.exact !== "boolean") errs.push(`${at}: exact는 true/false여야 합니다`);
  if (click) for (const s of [t.name, t.text, t.label, t.title, t.placeholder, t.css]) { const w = typeof s === "string" ? forbiddenClick(s) : null; if (w) errs.push(`${at}: 클릭 금지어 「${w}」`); }
  return errs;
}

function checkClick(v, at) {
  if (typeof v === "string") { const w = forbiddenClick(v); return w ? [`${at}: 클릭 금지어 「${w}」 (${v})`] : []; }
  return checkTarget(v, at, { click: true });
}

function checkStep(s, at, fileExists) {
  if (!isObj(s)) return [`${at}: 단계는 객체여야 합니다`];
  const keys = Object.keys(s);
  if (keys.length !== 1) return [`${at}: 단계는 키 하나만 가져야 합니다`];
  const [k] = keys, v = s[k];
  switch (k) {
    case "click": return checkClick(v, `${at}.click`);
    case "eval": return typeof v === "string" && v ? [] : [`${at}.eval: 글이어야 합니다`];
    case "wait": return Number.isFinite(v) && v >= 0 ? [] : [`${at}.wait: 밀리초(0 이상 숫자)여야 합니다`];
    case "reload": return v === true ? [] : [`${at}.reload: true여야 합니다`];
    case "waitFor": case "scrollTo": return checkTarget(v, `${at}.${k}`);
    case "key": return typeof v === "string" && v ? [] : [`${at}.key: 글이어야 합니다`];
    case "dragSelect":
      if (isObj(v) && "text" in v) return typeof v.text === "string" && v.text ? [] : [`${at}.dragSelect.text: 글이어야 합니다`];
      return checkTarget(v, `${at}.dragSelect`);
    case "type": return typeof v === "string" && v ? [] : [`${at}.type: 글이어야 합니다`];
    case "upload": {
      if (!isObj(v)) return [`${at}.upload: { target, file, done? } 객체여야 합니다`];
      const errs = checkTarget(v.target, `${at}.upload.target`);
      if (typeof v.file !== "string" || !v.file || v.file.startsWith("/") || v.file.split(/[\\/]/).includes("..")) errs.push(`${at}.upload.file: 저장소 기준 상대 경로여야 합니다(.. 금지)`);
      else if (fileExists && !fileExists(v.file)) errs.push(`${at}.upload.file: 파일이 없습니다 (${v.file})`);
      if ("done" in v) errs.push(...checkTarget(v.done, `${at}.upload.done`));
      for (const key of Object.keys(v)) if (!["target", "file", "done"].includes(key)) errs.push(`${at}.upload: 알 수 없는 키 「${key}」`);
      return errs;
    }
    case "seedInspection": {
      if (!isObj(v)) return [`${at}.seedInspection: { card, period? } 객체여야 합니다`];
      const errs = [];
      if (!parseCardRef(v.card)) errs.push(`${at}.seedInspection.card: 「평가단위:과제번호」여야 합니다`);
      if ("period" in v && !PERIOD_RE.test(String(v.period))) errs.push(`${at}.seedInspection.period: YYYY-MM이어야 합니다`);
      for (const key of Object.keys(v)) if (!["card", "period"].includes(key)) errs.push(`${at}.seedInspection: 알 수 없는 키 「${key}」`);
      return errs;
    }
    default: return [`${at}: 알 수 없는 단계 「${k}」`];
  }
}

function checkMark(m, at) {
  if (!isObj(m)) return [`${at}: 표기는 객체여야 합니다`];
  const errs = [];
  if (!(Number.isInteger(m.n) && m.n >= 1)) errs.push(`${at}: n은 1 이상 정수여야 합니다`);
  if (("target" in m) === ("targets" in m)) errs.push(`${at}: target 또는 targets 중 하나만 있어야 합니다`);
  else if ("target" in m) errs.push(...checkTarget(m.target, `${at}.target`));
  else if (!Array.isArray(m.targets) || !m.targets.length) errs.push(`${at}: targets는 비어 있지 않은 배열이어야 합니다`);
  else m.targets.forEach((t, i) => errs.push(...checkTarget(t, `${at}.targets[${i}]`)));
  if ("pad" in m && !(Number.isFinite(m.pad) && m.pad >= 0)) errs.push(`${at}: pad는 0 이상 숫자여야 합니다`);
  if ("badge" in m && !BADGES.includes(m.badge)) errs.push(`${at}: badge는 ${BADGES.join("·")} 중 하나여야 합니다`);
  return errs;
}

/** 계획 검사. 오류 문자열 배열(비면 통과) */
export function validatePlan(plan, { fileExists } = {}) {
  if (!isObj(plan)) return ["계획은 객체여야 합니다"];
  const errs = [];
  for (const k of ["out", "team", "track"]) if (k in plan && (typeof plan[k] !== "string" || !plan[k])) errs.push(`${k}는 비어 있지 않은 글이어야 합니다`);
  const isPairs = (v) => Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === "string" && s));
  if ("assign" in plan) {
    if (!isPairs(plan.assign)) errs.push("assign은 [평가단위 id, 과제번호] 쌍의 배열이어야 합니다");
    else if (plan.assign.length && !plan.team) errs.push("assign에는 team이 필요합니다");
  }
  // fixtures: 시험 데이터를 쓸 카드(시작 전 이미 데이터가 있으면 멈춤) — 부서 시험 계정이 쓰므로 assign 안에 있어야 함
  const fixtures = new Set();
  if ("fixtures" in plan) {
    if (!isPairs(plan.fixtures) || !plan.fixtures.length) errs.push("fixtures는 비어 있지 않은 [평가단위 id, 과제번호] 쌍의 배열이어야 합니다");
    else {
      const assigned = new Set((isPairs(plan.assign) ? plan.assign : []).map(([u, t]) => refKey(u, t)));
      for (const [u, t] of plan.fixtures) {
        fixtures.add(refKey(u, t));
        if (!assigned.has(refKey(u, t))) errs.push(`fixtures ${refKey(u, t)}: assign에 없는 카드입니다`);
      }
    }
  }
  if (!Array.isArray(plan.shots) || !plan.shots.length) return [...errs, "shots는 비어 있지 않은 배열이어야 합니다"];
  // 데이터를 쓰는 단계: fixtures 카드에만(upload·type은 화면 주소의 카드, seedInspection은 card) — 같은 카드·점검월 점검표는 한 번
  const seeded = new Set();
  plan.shots.forEach((s, i) => {
    for (const st of stepsOf(s)) {
      const k = Object.keys(st)[0];
      if (!WRITE_STEPS.includes(k)) continue;
      if (k === "seedInspection") {
        const ref = parseCardRef(st.seedInspection?.card);
        if (!ref) continue;
        const key = refKey(...ref);
        if (!fixtures.has(key)) errs.push(`shots[${i}] seedInspection ${key}: fixtures에 없는 카드입니다`);
        const sk = `${key}@${st.seedInspection.period ?? ""}`;
        if (seeded.has(sk)) errs.push(`shots[${i}] seedInspection ${key}: 같은 카드·점검월 점검표가 겹칩니다`);
        seeded.add(sk);
      } else {
        const cards = uidRefs(s[1]);
        if (cards.length !== 1 || !fixtures.has(cards[0])) errs.push(`shots[${i}] ${k}: 화면 주소에 fixtures 카드({{uid:…}}) 하나가 있어야 합니다`);
      }
    }
  });
  const names = new Set();
  plan.shots.forEach((s, i) => {
    const at = `shots[${i}]`;
    if (!Array.isArray(s) || s.length < 3 || s.length > 4) return errs.push(`${at}: [who, path, name, opts?] 모양이어야 합니다`);
    const [who, path, name, opts] = s;
    if (!WHO.includes(who)) errs.push(`${at}: who는 ${WHO.join("·")} 중 하나여야 합니다 (${JSON.stringify(who)})`);
    if (typeof path !== "string" || !path.startsWith("/")) errs.push(`${at}: path는 /로 시작하는 글이어야 합니다`);
    if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name)) errs.push(`${at}: name은 영문·숫자·._- 만 쓸 수 있습니다`);
    else if (names.has(name)) errs.push(`${at}: name 「${name}」이 겹칩니다`);
    else names.add(name);
    if (opts === undefined) return;
    if (!isObj(opts)) return errs.push(`${at}: opts는 객체여야 합니다`);
    if ("click" in opts) errs.push(...checkClick(opts.click, `${at}.click`));
    if ("steps" in opts) {
      if (!Array.isArray(opts.steps)) errs.push(`${at}.steps: 배열이어야 합니다`);
      else opts.steps.forEach((st, j) => errs.push(...checkStep(st, `${at}.steps[${j}]`, fileExists)));
    }
    if ("viewport" in opts) errs.push(...checkViewport(opts.viewport, `${at}.viewport`));
    if ("marks" in opts) {
      if (!Array.isArray(opts.marks)) errs.push(`${at}.marks: 배열이어야 합니다`);
      else opts.marks.forEach((m, j) => errs.push(...checkMark(m, `${at}.marks[${j}]`)));
    }
  });
  return errs;
}

/**
 * 실행하면 DB에 만들 것(순수 — --plan-only 미리보기). period = 이달(작성본·점검표 기본 점검월).
 * 작성본은 type 단계가 있는 부서 화면의 카드(글을 치면 자동 저장), 자료는 upload, 점검표는 seedInspection
 */
export function planWrites(plan, period) {
  const shots = Array.isArray(plan.shots) ? plan.shots : [];
  const who = new Set(shots.map((s) => s[0]));
  const versions = [], materials = [], inspections = [];
  for (const s of shots) {
    for (const st of stepsOf(s)) {
      const [k, v] = Object.entries(st)[0];
      if (k === "type" && s[0] === "dept") for (const c of uidRefs(s[1])) versions.push({ card: c, shot: s[2] });
      if (k === "upload") for (const c of uidRefs(s[1])) materials.push({ card: c, file: v.file, shot: s[2] });
      if (k === "seedInspection") inspections.push({ card: v.card, period: v.period ?? period, shot: s[2] });
    }
  }
  const accounts = [];
  if (who.has("dept") || plan.assign?.length) accounts.push({ ...SHOT_USERS.dept, team: plan.team ?? "검사기획팀" });
  if (who.has("pmo") || inspections.length) accounts.push({ ...SHOT_USERS.pmo, team: null });
  if (who.has("admin")) accounts.push({ ...SHOT_USERS.admin, team: null });
  const uniq = (xs) => [...new Map(xs.map((x) => [x.card, x])).values()];
  return {
    accounts,
    assign: (plan.assign ?? []).map(([u, t]) => refKey(u, t)),
    versions: uniq(versions),
    inspections,
    materials,
    fixtures: (plan.fixtures ?? []).map(([u, t]) => refKey(u, t)),
    checkPeriods: [...new Set([period, ...inspections.map((x) => x.period)])],
  };
}

const ROLE_KO = { dept_user: "부서 담당자", pmo: "성과관리팀", admin: "관리자" };
/** planWrites → 사람이 읽는 줄 */
export function formatWrites(w) {
  const none = "없음";
  const list = (xs) => (xs.length ? xs.join(", ") : none);
  return [
    "운영 DB에 만들 것(실행하면 — 이번 --plan-only는 DB·브라우저에 닿지 않음):",
    `- 계정 ${w.accounts.length}: ${list(w.accounts.map((a) => `${a.email}(${ROLE_KO[a.role]}${a.team ? ` · ${a.team}` : ""})`))}`,
    `- 담당 지정(card_assignees) ${w.assign.length}: ${list(w.assign)}`,
    `- 작성본(card_versions): ${list(w.versions.map((v) => `${v.card} — 「${v.shot}」에서 글을 쳐 자동 저장(작성 중, 확정 안 함)`))}`,
    `- 점검표(inspections): ${list(w.inspections.map((x) => `${x.card} ${x.period} 보냄(sent) — 성과관리팀 시험 계정 이름, 「${x.shot}」`))}`,
    `- 카드 전용 자료(card_materials 행 + 저장소 card-materials 파일): ${list(w.materials.map((m) => `${m.card} ← ${m.file}(「${m.shot}」)`))}`,
    "- AI 기록(ai_requests·ai_results): 만들지 않음(요청·보내기 단추는 클릭 금지, 올리는 PDF는 글자층이 있어 그림 설명 호출 없음) — 생기면 지움",
    "- 바꾸지 않는 것: 원장(cards)·수정 이력(card_edits)·보고서·공통 지식",
    "운영 DB에서 지울 것(끝에 — 성공·실패와 무관, 계정 삭제보다 먼저. 시작 때도 이전 실행이 남긴 시험 계정 행이 있으면 먼저 지움):",
    "- 시험 계정(pdca-shot-*)이 만든 AI 결과·AI 기록·점검표·카드 전용 자료(행 + 파일)·작성본(작성 중·제출) — 판정은 작성자 id, 다른 사람 행은 안 지움",
    "- fixtures 카드 자료 폴더에서 시작 때 없던, 어느 행도 가리키지 않는 파일(올리다 끊긴 것)",
    "- 담당 지정 → 계정. 끝에 「만든 것 / 지운 것 / 남은 것」 표(남은 것이 있으면 종료 코드 1)",
    "시작 전 멈춤 조건(하나라도 있으면 아무것도 만들지 않음):",
    `- ${w.fixtures.length ? w.fixtures.map((c) => `${c}: 작성본(${w.checkPeriods[0]} 또는 열린 것)·점검표(${w.checkPeriods.join("·")})·카드 전용 자료(전부)`).join(" / ") : "fixtures 없음 — 확인 안 함"}`,
  ];
}

/** 정리 결과 표: rows = [{ name, made, deleted, left }] → 줄 목록 */
export function cleanupTable(rows) {
  const w = Math.max(4, ...rows.map((r) => r.name.length));
  const cell = (v) => String(v).padStart(6);
  return [`${"항목".padEnd(w)}  ${cell("만든 것")} ${cell("지운 것")} ${cell("남은 것")}`, ...rows.map((r) => `${r.name.padEnd(w)}  ${cell(r.made)} ${cell(r.deleted)} ${cell(r.left)}`)];
}

// 직접 실행: 검증만(DB·브라우저 없음)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  if (!arg) { console.error("사용법: node scripts/e2e/shot-plan.mjs <계획.json | @경로 | JSON>"); process.exit(1); }
  try {
    const text = arg.trim().startsWith("{") || arg.trim().startsWith("[") || arg.startsWith("@") ? arg : `@${arg}`;
    const plan = loadPlan(text);
    const errs = validatePlan(plan);
    if (errs.length) { console.error(errs.map((e) => `- ${e}`).join("\n")); process.exit(1); }
    console.log(`OK ${plan.shots.length}장`);
  } catch (e) { console.error(`계획을 읽지 못함: ${e.message}`); process.exit(1); }
}
