// 저장소 고아 파일 대조(순수 — 입출력 없음, 2026-11-18 웹 취약점 낮음 보완 — 근거 T2-F1·T4-S1). scripts/storage/prune-orphans.ts가 씀.
// 버킷의 객체 경로와 DB 행이 가리키는 경로를 맞춰, 아무 행도 가리키지 않고 만든 지 하루가 넘은 객체만 「고아」로 고릅니다.
// 하루 미만은 올리는 중(서명 업로드 → 목록 등록 사이)일 수 있어 남기고, 만든 시각을 모르면 남깁니다.
//
// 버킷별로 무엇이 가리키나(코드에서 찾은 쓰는 곳 — 경로 모양을 바꾸면 여기와 스크립트가 읽는 열을 함께 고침):
//  card-materials/{cards.uid}/{uuid}.{ext}    ← card_materials.storage_path (cards/materials-actions.ts finishCardMaterialUpload)
//  report-materials/{reports.id}/{uuid}.{ext} ← report_materials.storage_path (reports/actions.ts finishMaterialUpload)
//  card-imports/{card_imports.id}/{n}.{ext}   ← card_imports.files[].path (cards/import/actions.ts — 지운 원본은 path가 빈 글)
//  card-originals/{폴더}/{이름}                ← 그 폴더에 딸린 행의 JSON·글 안에 이름이 나오면 참조:
//      폴더 = cards.uid → cards.data·layout·original_html, card_versions.data, card_edits.before·after(되돌리기용 이력)
//      폴더 = card_import_items.new_uid(확정 매칭이면 카드 uid와 같음)와 card_id의 uid → card_import_items.parsed·layout
//      이름 = 적재·현행화 그림 {biz|imp}N-{파일}(JSON에는 …/{biz|imp}N/{파일}로 적힘 — lib/cards/original-html.ts),
//             원본 배치 그림 hwp-{해시}.{확장자}(layout bins[].key — lib/hwp/layout.ts layoutImageKeys)
//  knowledge 버킷은 범위 밖: 쓰기는 관리자만이고 그림은 pnpm knowledge:prune-images, 문서 파일은 removeDocumentFiles가 정리함.

/** 정리하는 버킷 */
export const PRUNE_BUCKETS = ["card-materials", "report-materials", "card-imports", "card-originals"] as const;
export type PruneBucket = (typeof PRUNE_BUCKETS)[number];

export const isPruneBucket = (s: string): s is PruneBucket => (PRUNE_BUCKETS as readonly string[]).includes(s);

/** 이보다 새 객체는 지우지 않음(올리는 중 보호) — 하루 */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** 버킷 안 객체 하나(경로는 버킷 안 전체 경로, 만든 시각은 저장소 목록의 created_at) */
export interface StoredObject {
  path: string;
  createdAt: string | null;
}

export interface OrphanPlan {
  /** 지울 객체(참조 없음 + 하루 넘음), 경로 순 */
  orphans: string[];
  /** 참조가 있어 남기는 수 */
  referenced: number;
  /** 참조는 없지만 새것이거나 만든 시각을 몰라 남기는 수 */
  young: number;
}

/** 객체를 참조 있음 · 고아 · 새것(남김)으로 나눔 */
export function planOrphans(objects: StoredObject[], isReferenced: (path: string) => boolean, now: number, minAgeMs = ORPHAN_MIN_AGE_MS): OrphanPlan {
  const orphans: string[] = [];
  let referenced = 0;
  let young = 0;
  for (const o of objects) {
    if (isReferenced(o.path)) {
      referenced += 1;
      continue;
    }
    const born = o.createdAt ? Date.parse(o.createdAt) : NaN;
    if (!Number.isFinite(born) || now - born < minAgeMs) {
      young += 1;
      continue;
    }
    orphans.push(o.path);
  }
  return { orphans: orphans.sort(), referenced, young };
}

/** card_imports.files(jsonb 배열 [{path, …}])에서 비지 않은 경로만. 모양이 다르면 빈 목록 */
export function importFilePaths(files: unknown): string[] {
  if (!Array.isArray(files)) return [];
  return files.flatMap((f) => {
    const p = (f as { path?: unknown } | null)?.path;
    return typeof p === "string" && p ? [p] : [];
  });
}

/** card-originals 폴더 → 그 폴더에 딸린 행의 글에서 나온 이름 조각 */
export type RefIndex = Map<string, Set<string>>;

const PATHISH = /[A-Za-z0-9_.\-/]+/g;

/** 글 하나에서 경로 같은 덩이(영숫자·_·.·-·/)마다 덩이 자체, 「/」로 나눈 조각, 이웃한 두 조각을 「-」로 이은 이름을 더함 */
function addTextTokens(into: Set<string>, s: string): void {
  for (const m of s.matchAll(PATHISH)) {
    const chunk = m[0];
    into.add(chunk);
    if (!chunk.includes("/")) continue;
    const parts = chunk.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      into.add(parts[i]);
      if (i + 1 < parts.length) into.add(`${parts[i]}-${parts[i + 1]}`);
    }
  }
}

/** JSON 값(또는 글)을 끝까지 돌며 글 값과 객체 키의 이름 조각을 모음 */
function addValueTokens(into: Set<string>, value: unknown): void {
  if (typeof value === "string") {
    addTextTokens(into, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) addValueTokens(into, v);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      addTextTokens(into, k);
      addValueTokens(into, v);
    }
  }
}

/** folder에 딸린 행의 값(JSON·글)에서 이름 조각을 모음. 폴더가 없으면 아무것도 안 함 */
export function addRefs(index: RefIndex, folder: string | null | undefined, value: unknown): void {
  if (!folder || value == null) return;
  let set = index.get(folder);
  if (!set) {
    set = new Set();
    index.set(folder, set);
  }
  addValueTokens(set, value);
}

/** card-originals 객체가 자기 폴더에 딸린 행에서 가리켜지는가. 하위 폴더에 든 객체·맨 위 객체는 앱이 만들지 않으므로 늘 아님 */
export function originalReferenced(index: RefIndex, path: string): boolean {
  const cut = path.indexOf("/");
  if (cut <= 0) return false;
  const name = path.slice(cut + 1);
  if (!name || name.includes("/")) return false;
  return index.get(path.slice(0, cut))?.has(name) ?? false;
}
