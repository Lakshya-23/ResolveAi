<div align="center">

# ⚡ ResolvAI

### Autonomous Multi-Agent Software Engineering Platform

ResolvAI is an enterprise-grade, autonomous software engineering platform powered by **LangGraph multi-agent orchestration**, **isolated Docker execution containers**, and **embedded Monaco code editing**.

An intelligent **Supervisor Agent** coordinates specialized AI agents (**Planner Architect**, **Engineer**, **Tester QA**, and **Reviewer**) to autonomously clone repositories, diagnose GitHub issues, write code patches, execute test suites inside Docker containers, evaluate code quality, and open Pull Requests.

</div>

---

##  Key Features

- **LangGraph Multi-Agent Orchestration**
  - **Supervisor Agent**: Central intelligence making dynamic routing decisions based on real-time team reports and user instructions.
  - **Planner Agent (Architect)**: Performs read-only repository analysis, dependency inspection, and strategy planning.
  - **Coding Agent (Engineer)**: Implements precise code modifications, updates tests, and builds features.
  - **Tester Agent (QA Engineer)**: Executes builds, test suites, and linters inside isolated Docker containers.
  - **Reviewer Agent (Code Reviewer)**: Audits code quality, maintainability, architectural compliance, and edge cases.

- 🐳 **Isolated Docker Execution Containers**
  - Deterministic container creation with auto-detected Docker/Podman sockets (`/var/run/docker.sock`, `/run/user/1000/docker.sock`).
  - Isolated dependency installation, command verification, and Git author identity configuration (`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`).
  - Container liveness preservation across revision cycles and automatic self-healing container cleanup.

- **Interactive Live Workflow Diagram**
  - Visual DAG powered by `@xyflow/react` with smooth-step edge curves, animated state feedback, and status checkmarks.
  - Responsive auto-scaling via `ResizeObserver` so workflow nodes are never cut off during side panel toggles.

- **VS Code-style Monaco Explorer & Diff Viewer**
  - Side panel with collapsible recursive folder tree, custom extension icons, and Monaco editor.
  - Side-by-side Monaco `DiffEditor` for reviewing before/after git patches prior to PR creation.
  - Bulletproof unified git diff parser handling additions, deletions, renames, and dev/null paths.

- **Multi-Provider Model Presets & LiteLLM Integration**
  - Single-source-of-truth LLM proxy supporting **OpenAI**, **Anthropic**, **Gemini**, **Groq**, **Ollama**, and **Bedrock**.
  - Local preset storage (`localStorage`) for per-model and fallback model configurations with single-click `Autofill` and `View Models` breakdown.

- **Persistent Debug Logs & Session History**
  - Real-time Socket.IO execution feed paired with SQLite persistence (`better-sqlite3`).
  - Persistent activity feed tracking tool invocations, terminal outputs, build failures, and error stack traces.
  - Session history dashboard with individual session deletion and one-click clear history confirmation.

---

## Architecture Overview

```mermaid
graph TD
    User([User / Repo Owner]) -->|Selects Repository & Issue| Supervisor[Supervisor Agent - Tech Lead]
    Supervisor -->|1. Request Strategy| Planner[Planner Agent - Architect]
    Planner -->|Planning Report .resolveai| Supervisor
    Supervisor -->|2. Delegate Code Fix| Writer[Writer Agent - Engineer]
    Writer -->|Implementation Report .resolveai| Supervisor
    Supervisor -->|3. Validate Build & Tests| Tester[Tester Agent - QA]
    Tester -->|Validation Report .resolveai| Supervisor
    Supervisor -->|4. Quality Audit| Reviewer[Reviewer Agent - Code Reviewer]
    Reviewer -->|Review Report .resolveai| Supervisor
    Supervisor -->|5. Present Diff & Await Approval| User
    User -->|Approve PR| GitHub[GitHub Pull Request Created]
    
    subgraph Isolated Docker Execution Sandbox
        Writer <-->|write_file / terminal| DockerContainer[(Docker Container Workspace)]
        Tester <-->|build / test / linter| DockerContainer
        Reviewer <-->|git_diff / git_log| DockerContainer
    end
```

---

## Tech Stack

### Frontend
- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, React 18, TypeScript)
- **Styling**: Vanilla CSS Design Tokens, TailwindCSS
- **Diagrams**: `@xyflow/react` (ReactFlow)
- **Editor**: `@monaco-editor/react` (Monaco Editor & DiffEditor)
- **State Management**: Zustand & React Hooks
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js & Express (TypeScript)
- **Orchestration**: `@langchain/langgraph`, `@langchain/core`
- **Containerization**: `dockerode` (Docker & Podman support)
- **Database**: `better-sqlite3` (WAL mode SQLite)
- **LLM Proxy**: LiteLLM Proxy Server
- **WebSockets**: Socket.IO for real-time live event streaming
- **Web Search**: `@tavily/core`

---

## Prerequisites

Before running ResolvAI, ensure you have installed:

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: v3.10+ (for LiteLLM proxy)
- **Docker Engine** or **Podman**: Running with socket access (`/var/run/docker.sock` or `/run/user/1000/docker.sock`)
- **GitHub Personal Access Token (PAT)**: With `repo` and `workflow` scopes

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Lakshya-23/ResolveAi.git
cd ResolvAI
```

### 2. Install Python & Node Dependencies

Install Python dependencies for LiteLLM:

```bash
pip install -r requirements.txt
```

Install Backend dependencies:

```bash
cd backend
npm install
```

Install Frontend dependencies:

```bash
cd ../frontend
npm install
```

### 3. Environment Configuration

Create backend `.env` file inside `backend/.env`:

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# LiteLLM Proxy URL
LITELLM_BASE_URL=http://localhost:4000

# SQLite Database Location
DB_PATH=./data/resolveai.db

# Docker Workspace Base
DOCKER_WORKSPACE_BASE=/tmp/resolveai-workspaces

# Git Author Identity
GIT_AUTHOR_NAME=ResolvAI
GIT_AUTHOR_EMAIL=bot@resolvai.dev

# LLM API Keys
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIzaSy...
GROQ_API_KEY=gsk_...
ANTHROPIC_API_KEY=sk-ant-...

# Optional Web Search Key
TAVILY_API_KEY=tvly-...

# Supervisor Settings
SUPERVISOR_MAX_ITERATIONS=50
```

Create frontend `.env` file inside `frontend/.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

---

## Running the Application

### Step 1: Start LiteLLM Proxy

In the project root directory, run:

```bash
litellm --config backend/litellm_config.yaml --port 4000
```

### Step 2: Start Backend Server

In the `backend` directory, run:

```bash
cd backend
npm run dev
```

### Step 3: Start Frontend Web App

In the `frontend` directory, run:

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to launch ResolvAI.

---

## Usage Guide

1. **Authentication**: Enter your GitHub Personal Access Token (PAT) to authenticate.
2. **Session Creation**: Select target GitHub repository and issue. Configure LLM model providers or autofill from saved Presets.
3. **Autonomous Resolution**: ResolvAI automatically prepares the Docker environment, clones the repo, analyzes architecture, creates a plan, implements code changes, runs unit tests, and conducts code review.
4. **Code Inspection**: Toggle the **Code Panel** button to browse workspace files in Monaco Editor or view side-by-side diff patches in Diff Viewer.
5. **Approval & PR**: Inspect report summaries and click **Approve PR** to automatically push the branch and open a GitHub Pull Request.

---

