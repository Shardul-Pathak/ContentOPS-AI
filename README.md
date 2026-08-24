# Content Ops Platform

Autonomous AI content operations platform. A coordinated AI content team that researches,
strategizes, writes, validates, illustrates, and publishes company content while keeping
consequential external actions under human control.

**TrueForge** is the agent harness: all agent execution, tool/MCP usage, human approval
pauses, session state, and stream resume run through TrueForge. See `AGENTS.md` for product
rules and `docs/IMPLEMENTATION_PLAN.md` for the architecture and feature sequence.

## Prerequisites

- Node.js >= 22.14
- A model endpoint reachable via an OpenAI-compatible API (key stays in env)

## Setup

```bash
npm install
cp .env.example .env          # fill in values; never commit .env
npx prisma migrate dev        # apply migrations
npm run dev                   # http://localhost:3000
```

### TrueForge (agent runtime)

```bash
npx @truefoundry/trueforge@latest   # local mode, http://localhost:8790
npm run seed:agents                 # registers provider + 6 named agents (feature/trueforge-foundation)
```

With `AGENT_PROVIDER=trueforge`, workflows execute through the real harness (MCP tools,
approval pauses, resumable streams). With `AGENT_PROVIDER=mock`, deterministic fixtures
drive the identical workflow for offline development and tests.

## Verification

```bash
npm run lint
npm run typecheck
npm test
```

## Git policy

Features are developed on short-lived branches (`feat/<scope>`) merged into `main`
with `--no-ff` after verification and diff review. Never commit directly to `main`
(except bootstrap) and never commit secrets.
