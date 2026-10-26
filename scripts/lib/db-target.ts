// 개발·시험 스크립트가 실수로 운영 DB(cards·profiles 등)를 바꾸지 않도록 막는 장치입니다.
//
// 환경변수 DB_TARGET = "production" | "development". 비어 있으면 안전 쪽으로 production으로 봅니다.
// 운영 DB에 실제로 쓰는 스크립트(pnpm e2e·e2e:ui·e2e:shots·db:seed 등)는 파일 맨 앞에서
// guardProduction(스크립트 이름)을 불러, DB_TARGET이 production이면 --allow-production 인자가
// 없는 한 멈춥니다. 개발 DB를 따로 두기 전까지는 이 값을 비워 둬도(=production) 늘 막힙니다.

/** DB_TARGET 값을 판정합니다. 비어 있거나 모르는 값이면 production(안전 쪽)입니다. */
export function dbTargetFrom(
  env: Record<string, string | undefined>,
): "production" | "development" {
  return env.DB_TARGET === "development" ? "development" : "production";
}

/** --allow-production 인자가 있는지 봅니다. */
export function allowed(argv: string[]): boolean {
  return argv.includes("--allow-production");
}

/**
 * 운영 DB를 바꿀 수 있는 스크립트 맨 앞에서 부릅니다. DB_TARGET이 production이면
 * --allow-production 없이는 안내를 찍고 프로세스를 종료합니다(exit 1).
 * --allow-production이 있으면 경고 한 줄을 찍고 계속 진행합니다.
 */
export function guardProduction(
  name: string,
  argv: string[] = process.argv,
  env: Record<string, string | undefined> = process.env,
): void {
  if (dbTargetFrom(env) !== "production") return;
  if (allowed(argv)) {
    console.warn(
      `[${name}] 운영 DB(DB_TARGET=production)에서 --allow-production으로 실행합니다.`,
    );
    return;
  }
  console.error(
    `[${name}] 운영 DB(DB_TARGET=production)에서는 실행하지 않습니다. ` +
      "개발 DB의 .env로 돌리거나, 정말 운영에서 돌려야 하면 --allow-production을 붙이세요.",
  );
  process.exit(1);
}
