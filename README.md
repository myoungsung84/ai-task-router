# ai-task-router

로컬 개발용 AI 작업 관제 도구. 여러 로컬 프로젝트에 대해 Claude/Codex CLI
작업을 병렬 실행하고, 진행 상황을 웹 대시보드에서 실시간으로 확인합니다.
Task는 사람이 구성 가능한 **Workflow**(Agent × Action × Permission Step의
순서열)로 실행되며, 리뷰 Step은 실제 git diff가 있을 때만 수행됩니다.

자세한 구조는 [docs/architecture.md](docs/architecture.md), 상태 전이는
[docs/task-lifecycle.md](docs/task-lifecycle.md)를 참고하세요.

## 요구 사항

- Node.js 18.18 이상
- [pnpm](https://pnpm.io) 9 이상
- Git
- **Claude CLI** (`claude`) — PATH에 있고 이미 로그인/인증되어 있어야 합니다.
  ```bash
  claude --version
  ```
- **Codex CLI** (`codex`) — PATH에 있고 이미 로그인/인증되어 있어야 합니다.
  ```bash
  codex --version
  ```

두 CLI 모두 이 도구가 대신 로그인하지 않습니다. 최초 1회 각 CLI에서 직접
인증을 완료해두세요.

## 설치

```bash
pnpm install
```

`postinstall`에서 `packages/shared`를 자동 빌드합니다. 이후 `apps/server`,
`apps/web`은 이 빌드 결과(`packages/shared/dist`)를 참조합니다. `packages/shared`의
타입을 수정했다면 다시 빌드해야 반영됩니다.

```bash
pnpm --filter @ai-task-router/shared build
```

## 환경 변수

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.local.example apps/web/.env.local
```

기본값(서버 `9914`포트, 웹 `9913`포트, `CLAUDE_PERMISSION_MODE=acceptEdits`)
그대로도 로컬에서 바로 동작합니다. 각 파일의 주석을 참고해 필요한 값만
조정하세요.

## 개발 실행

루트에서 web + server를 동시에 실행:

```bash
pnpm dev
```

- Web: http://localhost:9913
- Server: http://localhost:9914 (`GET /health`로 확인 가능)

개별 실행도 가능합니다.

```bash
pnpm dev:server
pnpm dev:web
```

## 기본 Task 실행 흐름

1. 메인 대시보드의 **+ New Task** 버튼 → 모달에서 생성(별도 페이지 이동 없음;
   `/tasks/new`는 fallback 경로로 남아 있습니다)
2. `title`, `projectPath`(로컬 Git 저장소 경로), `instruction`, 필요 시
   `baseBranch`/`branch`, 그리고 **Workflow**(preset 또는 Custom Step 구성)를
   입력 — Workflow를 지정하지 않으면 Settings의 기본 Workflow가 사용됩니다.
3. 서버가 Workflow의 Step을 순서대로 실행합니다.
   - 프로젝트 경로/Git 저장소 여부 확인, branch 확인/생성
   - 각 Step: 지정된 Agent(`claude`/`codex`)를 지정된 Action(`implement` 구현 /
     `analyze` 분석 / `review` 리뷰)과 Permission(`write`/`read-only`)으로 실행,
     stdout/stderr를 SSE로 실시간 표시
   - `review` Step은 실행 직전 git diff를 확인해, 변경사항이 없으면
     **SKIPPED(NO_CHANGES)** 처리하고 CLI를 아예 실행하지 않습니다
   - 모든 Step 완료 후 어떤 리뷰든 WARNING을 반환했다면 `WARNING`, 아니면
     `READY`; `implement`/`analyze` Step이 실패하면 즉시 `FAILED`
4. Task 상세 화면에서 Workflow 진행 상황, 로그, 변경 파일, diff, 리뷰 결과를
   탭으로 확인
5. 실행 중인 Task는 **작업 중단** 버튼(확인 다이얼로그 포함)으로 취소 가능
   (해당 Task의 프로세스만 종료)

리뷰가 WARNING을 반환해도 다른 Agent가 자동으로 재작업하지 않습니다 — 최종
수정 여부는 사용자가 직접 판단합니다.

## Workflow

Task는 `Agent(claude|codex) × Action(implement|analyze|review) ×
Permission(write|read-only)`로 이루어진 Step의 순서열로 실행됩니다. Claude가
항상 구현을, Codex가 항상 리뷰를 맡는 구조가 아닙니다 — 아래처럼 자유롭게
구성할 수 있습니다.

- 기본 개발: `claude/implement/write` → `codex/review/read-only`
- 분석만: `claude/analyze/read-only`
- 리뷰 없음: `claude/implement/write`
- Codex가 구현하고 Claude가 리뷰, Codex가 구현하고 Codex가 리뷰 등도 동일한
  구조로 표현됩니다.

Settings(`/settings`)에서 기본 Workflow를 구성할 수 있고, Task 생성 시
Task별로 override할 수 있습니다(우선순위: Task 개별 Workflow > Settings 기본
Workflow).

## Job ID

내부 UUID는 그대로 유지하면서, Task 생성 시 사람이 쓰기 쉬운 짧은 식별자
(`T-1042` 형식)를 함께 부여합니다. 서버 재시작 후에도 유지되며
(`apps/server/data/job-id-counter.json`), REST(`/api/tasks/:id`)와 MCP
Tool 모두 UUID/Job ID를 구분 없이 받습니다. 기존(마이그레이션 전) Task에는
서버 최초 기동 시 생성 순서대로 Job ID가 자동 부여됩니다.

## History

완료(`READY`/`WARNING`/`FAILED`/`CANCELLED`) Task마다 사람이 읽는 Markdown
기록을 생성합니다 (`apps/server/data/history/YYYY-MM/T-<n>-<제목>.md`, Git에는
올라가지 않음). JSON은 프로그램 상태/실행용, Markdown은 히스토리 열람용으로
역할이 분리되어 있습니다. 같은 Task가 재실행되어 다시 완료되면 새 파일을
만들지 않고 기존 파일을 최신 내용으로 덮어씁니다. Settings 화면에서 완료된
Task를 선택 삭제할 수 있습니다(실행 중 Task는 삭제 불가, Markdown History는
삭제해도 남습니다).

## MCP

`apps/server`가 [MCP](https://modelcontextprotocol.io) 서버를 겸합니다. ChatGPT
Desktop 같은 MCP 클라이언트에서 Task를 직접 생성/실행/조회할 수 있습니다.

Endpoint:

```
http://localhost:9914/mcp
```

(공식 MCP TypeScript SDK의 Streamable HTTP transport, 세션 기반. 대시보드용
REST API(`/api/tasks/*`)와 동일한 `TaskService`/Task Store를 공유하므로, MCP로
만든 Task도 대시보드에 즉시 나타나고 그 반대도 마찬가지입니다.)

사용 가능한 Tools:

- `run_task` — Task 하나를 생성하고 즉시 실행. `workflow`를 생략하면 Settings의
  기본 Workflow를 사용합니다. 완료를 기다리지 않고
  `{ taskId, jobId, status, dashboardUrl }`을 바로 반환합니다.
- `run_tasks` — 여러 Task를 한 번에 생성/실행 (서로 다른 프로젝트는 병렬 진행,
  Task별로 다른 `workflow` 지정 가능).
- `list_tasks` — Task 목록 조회 (`status`로 선택적 필터링).
- `get_task` — 특정 Task의 상태/Workflow Step별 결과/변경 파일 조회 (전체
  로그는 제외해 응답 크기를 작게 유지).
- `get_task_result` — 완료된 Task의 최종 검토용 정보(원 지시사항, 최종 상태,
  Workflow Step별 결과, git status, 변경 파일, git diff). diff가 크면 잘라서
  반환하고 `diffTruncated`로 표시합니다.
- `cancel_task` — 실행 중인 Task 중단 (해당 Task의 프로세스만 종료).

`taskId` 파라미터는 UUID와 Job ID(`T-1042`) 모두 받습니다. 모든 응답에는
가능한 경우 `taskId`(UUID)와 `jobId`가 함께 포함됩니다.

작업 완료를 기다리지 않는 것이 핵심입니다: `run_task`/`run_tasks`는 Task를
생성하고 실행을 시작시킨 뒤 곧바로 응답하며, 실제 작업은 서버에서 백그라운드로
계속 진행됩니다. 진행 상황은 대시보드(SSE)나 `get_task` 폴링, 완료 후
`get_task_result`로 확인하세요.

### ChatGPT Desktop에 연결하기

ChatGPT Desktop의 커넥터/MCP 서버 설정 화면(정확한 메뉴 이름은 버전에 따라
다를 수 있습니다)에서 원격 MCP 서버 URL로 다음을 등록하면 됩니다.

```
http://localhost:9914/mcp
```

서버가 실행 중이어야 합니다(`pnpm dev:server` 또는 `pnpm build:server && pnpm --filter @ai-task-router/server start`).
연결 후 채팅에서 `run_task`를 호출하면 지정한 `projectPath`에서 Claude CLI가
실제로 실행되고, 완료되면 Codex 리뷰가 1회 수행됩니다.

## 빌드 / 품질 검사

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm format        # 전체 지원 파일 자동 포맷
pnpm format:check  # 변경 없이 포맷 위반 여부만 확인
```

## 프로젝트 구조

```
ai-task-router/
├─ apps/
│  ├─ web/     # Next.js App Router + TypeScript + Tailwind — UI 전용
│  └─ server/  # Node/Express — Git, Claude/Codex 프로세스, 상태 관리, SSE, MCP(/mcp)
├─ packages/
│  └─ shared/  # apps/web, apps/server가 공유하는 타입
├─ docs/
│  ├─ architecture.md
│  └─ task-lifecycle.md
├─ pnpm-workspace.yaml
└─ package.json
```

파일명은 kebab-case가 기본 규칙입니다(`task-list.tsx`, `use-task.ts` 등).
Next.js 예약 파일(`page.tsx`, `layout.tsx` 등)만 프레임워크 규칙을 따릅니다.

## 이번 버전에서 제외된 것

OpenAI API 직접 호출, Claude 자동 재수정, Claude↔Codex 반복 루프, git
worktree, GitLab API/MR 자동화, git push 자동화, 자동 merge, 외부 배포,
로그인/권한 시스템, 별도 DB, 임의 shell 명령 실행 Tool(`run_shell` 등). 자세한
배경은 [docs/architecture.md](docs/architecture.md)와
[docs/task-lifecycle.md](docs/task-lifecycle.md) 참고.

`TaskService`(`apps/server/src/tasks/task-service.ts`)는 HTTP/MCP 어느 쪽과도
직접 결합되어 있지 않습니다. REST 라우트(`apps/server/src/tasks/task-routes.ts`)와
MCP tools(`apps/server/src/mcp/tools/task-tools.ts`)는 둘 다 이 레이어를 호출하는
얇은 adapter일 뿐이며, Task 생성/실행/취소/조회 로직은 한 곳에만 존재합니다.
