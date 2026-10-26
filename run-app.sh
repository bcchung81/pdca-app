#!/usr/bin/env bash
# pdca-app 실행 스크립트 — 실행 전 점검(Node·pnpm·의존성·.env.local)을 거쳐 앱을 켭니다.
#
#   ./run-app.sh            개발 서버(기본, http://localhost:3000)
#   ./run-app.sh dev        개발 서버
#   ./run-app.sh prod       운영 빌드 후 실행(pnpm build → pnpm start)
#   ./run-app.sh check      타입 검사·lint·테스트(--build를 붙이면 운영 빌드까지)
#   ./run-app.sh stop       이 앱의 개발 서버만 끔(같은 포트라도 다른 폴더의 서버는 건드리지 않음)
#   ./run-app.sh help
#
# 포트는 PORT 환경변수로 바꿉니다(예: PORT=3001 ./run-app.sh). 기본 3000.
# 다른 앱(예: ~/workspace/team 의 next dev, 포트 4000)은 절대 끄지 않습니다.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
PORT="${PORT:-3000}"
CMD="${1:-dev}"

say() { printf '%s\n' "$*"; }
ok() { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
die() { printf '  ✗ %s\n' "$*" >&2; exit 1; }

# ── 점검 ──────────────────────────────────────────────

check_node() {
  command -v node >/dev/null 2>&1 || die "Node가 없습니다. Node 24 이상을 설치하세요."
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 24 ] || die "Node $(node -v) — 이 앱은 Node 24 이상이 필요합니다(TypeScript를 빌드 없이 바로 실행)."
  ok "Node $(node -v)"
}

check_pnpm() {
  local want
  want="$(node -p 'require("./package.json").packageManager.split("@")[1]')"
  if ! command -v pnpm >/dev/null 2>&1; then
    command -v corepack >/dev/null 2>&1 || die "pnpm이 없습니다. corepack enable 또는 npm i -g pnpm@${want}"
    say "  pnpm이 없어 corepack으로 켭니다(pnpm@${want})"
    corepack enable >/dev/null 2>&1 || die "corepack enable 실패 — 관리자 권한이 필요할 수 있습니다."
  fi
  local have
  have="$(pnpm -v)"
  if [ "$have" != "$want" ]; then warn "pnpm ${have} — package.json은 pnpm@${want}(corepack enable 권장)"; else ok "pnpm ${have}"; fi
}

check_deps() {
  if [ ! -d node_modules ] || [ ! -f node_modules/.modules.yaml ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
    say "  의존성을 설치합니다(pnpm install --frozen-lockfile)"
    pnpm install --frozen-lockfile
  fi
  ok "의존성 설치됨"
}

# .env.local에서 값 하나(따옴표 걷음) — 값은 화면에 찍지 않음
env_value() {
  [ -f .env.local ] || { printf ''; return; }
  { grep -E "^$1=" .env.local || true; } | tail -n 1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'
}

# 로컬 Claude Code CLI 실행 파일(CLAUDE_CLI_PATH, 없으면 claude)
cli_bin() { local p; p="$(env_value CLAUDE_CLI_PATH)"; printf '%s' "${p:-claude}"; }

check_env() {
  [ -f .env.local ] || die ".env.local이 없습니다. .env.example을 복사해 값을 채우세요(cp .env.example .env.local)."
  local missing=""
  for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY; do
    [ -n "$(env_value "$name")" ] || missing="$missing $name"
  done
  [ -z "$missing" ] || die ".env.local에 값이 없습니다:$missing"
  ok ".env.local 필수 값(Supabase 3개) 있음"

  local provider key
  provider="$(env_value AI_PROVIDER)"
  key="$(env_value ANTHROPIC_API_KEY)"
  if [ "$provider" = "api" ] || { [ -z "$provider" ] && [ -n "$key" ]; }; then
    [ -n "$key" ] && ok "AI: Claude API" || warn "AI_PROVIDER=api인데 ANTHROPIC_API_KEY가 비어 있습니다 — AI 기능이 「키 미설정」으로 멈춥니다."
  elif command -v "$(cli_bin)" >/dev/null 2>&1; then
    ok "AI: 로컬 Claude Code CLI(API 키 없음)"
  else
    warn "AI: API 키도 Claude Code CLI도 없습니다 — AI 기능을 쓸 수 없습니다."
  fi

  local target
  target="$(env_value DB_TARGET)"
  if [ -z "$target" ] || [ "$target" = "production" ]; then
    warn "DB_TARGET=${target:-비어 있음(production으로 봄)} — 이 설정은 운영 DB를 봅니다(e2e·전체 db:seed는 막힘)."
  else
    ok "DB_TARGET=${target}"
  fi
}

# 포트를 쓰는 프로세스 번호(없으면 빈 값)
port_pid() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true; }

# 그 프로세스의 작업 폴더가 이 앱인지
is_this_app() {
  local cwd
  cwd="$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  [ "$cwd" = "$ROOT" ]
}

check_port() {
  local pid
  pid="$(port_pid)"
  [ -z "$pid" ] && { ok "포트 ${PORT} 비어 있음"; return 0; }
  if is_this_app "$pid"; then
    say ""
    say "이 앱이 이미 포트 ${PORT}에서 돌고 있습니다(PID ${pid}): http://localhost:${PORT}"
    say "다시 켜려면 ./run-app.sh stop 뒤에 실행하세요."
    exit 0
  fi
  die "포트 ${PORT}을(를) 다른 프로그램이 쓰고 있습니다(PID ${pid}) — 끄지 않습니다. PORT=3001 ./run-app.sh 처럼 다른 포트를 쓰세요."
}

preflight() {
  say "실행 전 점검"
  check_node
  check_pnpm
  check_deps
  check_env
}

# ── 명령 ──────────────────────────────────────────────

case "$CMD" in
  dev)
    preflight
    check_port
    say ""
    say "개발 서버를 켭니다: http://localhost:${PORT} (끄려면 Ctrl+C)"
    exec pnpm dev --port "$PORT"
    ;;
  prod)
    preflight
    check_port
    say ""
    say "운영 빌드(pnpm build)"
    pnpm build
    say ""
    say "운영 모드로 켭니다: http://localhost:${PORT} (끄려면 Ctrl+C)"
    exec pnpm start --port "$PORT"
    ;;
  check)
    say "점검"
    check_node
    check_pnpm
    check_deps
    say ""
    say "타입 검사(npx tsc --noEmit -p .)"
    npx tsc --noEmit -p .
    say "lint(pnpm lint)"
    pnpm lint
    say "테스트(pnpm test)"
    pnpm test
    if [ "${2:-}" = "--build" ]; then
      say "운영 빌드(pnpm build)"
      pnpm build
    fi
    say ""
    say "점검 통과"
    ;;
  stop)
    pid="$(port_pid)"
    [ -n "$pid" ] || { say "포트 ${PORT}에서 도는 서버가 없습니다."; exit 0; }
    is_this_app "$pid" || die "포트 ${PORT}의 서버(PID ${pid})는 이 앱이 아닙니다 — 끄지 않습니다."
    kill "$pid"
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      [ -z "$(port_pid)" ] && { say "이 앱의 서버를 껐습니다(PID ${pid}, 포트 ${PORT})."; exit 0; }
      sleep 0.5
    done
    die "PID ${pid}가 아직 떠 있습니다 — 잠시 뒤 다시 확인하세요."
    ;;
  help | -h | --help)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    die "모르는 명령: ${CMD} — ./run-app.sh help"
    ;;
esac
