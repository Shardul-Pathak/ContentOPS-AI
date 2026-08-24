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
npm run seed:agents                 # registers provider + MCP servers + 6 named agents
npm run mock:cms                    # mock company blog CMS (MCP) on :3780
```

With `AGENT_PROVIDER=trueforge`, workflows execute through the real harness (MCP tools,
approval pauses, resumable streams). With `AGENT_PROVIDER=mock`, deterministic fixtures
drive the identical workflow for offline development and tests.

## Watching a run live

- **App** — `/content/[id]` auto-refreshes every 2s: workflow step timeline, the
  running agent with an elapsed timer, and live tool-call/subagent activity
  streamed from the harness while the turn is still executing.
- **TrueForge dashboard** — http://localhost:8790 → Sessions shows the raw
  event stream: full tool arguments, tool results, subagent threads, token
  usage. This is the deepest view of what the agents are doing right now.
- **API** — `curl localhost:3000/api/contents/<id> | jq '.status, .currentAgent'`

## Demo walkthrough

1. `npm run dev` → open http://localhost:3000
2. **Company Context** → create your company (audience required — it gates workflows)
3. **Campaigns** → create a campaign with topics → open it
4. Pick a topic → **Start workflow**
5. Watch `/content/[id]`: Research (real web search via Exa in trueforge mode,
   parallel subagent threads) → Growth strategy → Writer draft → Quality review
   → hero image → publisher prepares and **pauses at the gated `publish_article` tool call**
6. **Approval panel**: review destination, title, slug, meta, assets, exact action
   - **Approve** → TrueForge resumes the paused turn; article publishes to the
     configured endpoint; published URL is stored and shown
   - **Reject** → workflow CANCELLED; nothing is sent anywhere; any retry needs a fresh approval
7. Every agent run, tool response, token cost, and decision is recorded in execution history

Safety invariants (tested): publishing never executes without a PENDING approval on an
AWAITING_APPROVAL item · double decisions are rejected (409) · rejected items stay CANCELLED ·
publisher finishing without pausing fails the workflow by design.

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
